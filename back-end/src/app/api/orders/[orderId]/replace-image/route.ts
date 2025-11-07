import { NextRequest, NextResponse } from 'next/server';
import { getObject, putObject, deleteObject, R2_ORDERS_BUCKET, R2_PUBLIC_BUCKET } from '@/lib/r2-client';
import { buildManifestKey } from '@/lib/r2-service';

// Helper to parse JSON safely
async function readJsonSafe<T = any>(res: Response): Promise<T> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error('Invalid JSON in manifest'); }
}

/**
 * Replace an image in an order
 * POST /api/orders/[orderId]/replace-image
 * 
 * Body (multipart/form-data):
 * - poseNumber: number (required)
 * - stage: 'preBria' | 'postBria' (required)
 * - file: File (required)
 * - replacedBy?: string (optional, for when auth is added)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    console.log('[Replace Image API] Request received');
    const { orderId } = await params;
    console.log('[Replace Image API] OrderId:', orderId);
    
    if (!orderId) {
      console.error('[Replace Image API] Missing orderId');
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    // Parse multipart form data
    console.log('[Replace Image API] Parsing form data...');
    const formData = await request.formData();
    console.log('[Replace Image API] FormData keys:', Array.from(formData.keys()));
    
    const poseNumberStr = formData.get('poseNumber')?.toString();
    const stage = formData.get('stage')?.toString();
    const file = formData.get('file') as File | null;
    const replacedBy = formData.get('replacedBy')?.toString() || null; // Optional

    console.log('[Replace Image API] Extracted values:', {
      poseNumberStr,
      stage,
      file: file ? { name: file.name, size: file.size, type: file.type } : null,
      replacedBy
    });

    // Validation
    if (!poseNumberStr || !stage || !file) {
      console.error('[Replace Image API] Missing required fields:', {
        hasPoseNumber: !!poseNumberStr,
        hasStage: !!stage,
        hasFile: !!file
      });
      return NextResponse.json(
        { error: 'Missing required fields: poseNumber, stage, or file' },
        { status: 400 }
      );
    }

    const poseNumber = parseInt(poseNumberStr, 10);
    if (isNaN(poseNumber) || poseNumber < 0) {
      return NextResponse.json(
        { error: 'Invalid poseNumber' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type || !file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File must be an image' },
        { status: 400 }
      );
    }

    if (stage !== 'preBria' && stage !== 'postBria') {
      return NextResponse.json(
        { error: 'Invalid stage. Must be "preBria" or "postBria"' },
        { status: 400 }
      );
    }

    // Determine which manifest to use
    const manifestType = stage === 'preBria' ? '2a' : '2b';
    const manifestKey = buildManifestKey(orderId, manifestType);
    
    // Download current manifest
    console.log(`[Replace Image] Loading manifest: ${manifestKey}`);
    const manifestRes = await getObject(R2_ORDERS_BUCKET, manifestKey);
    const manifest = await readJsonSafe<any>(manifestRes);

    if (!manifest || !manifest.entries || !Array.isArray(manifest.entries)) {
      return NextResponse.json(
        { error: 'Invalid manifest structure' },
        { status: 400 }
      );
    }

    // Find the entry for this pose
    // NOTE: Base character (poseNumber 0) may not be in manifest entries if it's a separate file
    // This will need special handling if base-character replacement is required
    const entry = manifest.entries.find((e: any) => e.poseNumber === poseNumber);
    if (!entry) {
      const errorMsg = poseNumber === 0 
        ? 'Base character replacement not yet supported (base-character.png is not tracked in manifest entries)'
        : `Pose ${poseNumber} not found in manifest`;
      return NextResponse.json(
        { error: errorMsg },
        { status: 404 }
      );
    }

    // Get the R2 key to replace
    let r2Key = stage === 'preBria' ? entry.approvedKey : entry.bgRemovedKey;
    if (!r2Key) {
      return NextResponse.json(
        { error: `No ${stage === 'preBria' ? 'approvedKey' : 'bgRemovedKey'} found for pose ${poseNumber}` },
        { status: 404 }
      );
    }

    // CRITICAL: Strip retry suffixes from the key to upload to the original filename
    // Retry suffixes can be: _r1, _r2, _TRY01, _TRY02, etc.
    // We want to overwrite the original file (e.g., pose03.png), not the retry file (e.g., pose03_r2.png)
    const originalKey = r2Key.replace(/_r\d+\.png$/i, '.png')  // Remove _r1, _r2, etc.
                             .replace(/_TRY\d+\.png$/i, '.png'); // Remove _TRY01, _TRY02, etc.
    
    console.log(`[Replace Image API] Original key from manifest: ${r2Key}`);
    console.log(`[Replace Image API] Stripped retry suffix, using key: ${originalKey}`);
    
    // Update the manifest entry to point to the original key (without retry suffix)
    if (stage === 'preBria') {
      entry.approvedKey = originalKey;
    } else {
      entry.bgRemovedKey = originalKey;
    }

    // Determine bucket (character assets are in public bucket)
    const isCharacterAsset = originalKey.includes('/characters/');
    const bucket = isCharacterAsset ? R2_PUBLIC_BUCKET : R2_ORDERS_BUCKET;

    // Delete the old file (the one from manifest, which might have retry suffix)
    // This ensures we don't have duplicates (e.g., both pose03.png and pose03_r2.png)
    if (r2Key !== originalKey) {
      console.log(`[Replace Image API] Deleting old file with retry suffix: ${bucket}/${r2Key}`);
      try {
        await deleteObject(bucket, r2Key);
        console.log(`[Replace Image API] Old file ${r2Key} deleted successfully`);
      } catch (deleteError: any) {
        // Log error but don't fail the upload - the new file should still be uploaded
        // If the old file doesn't exist (404), that's fine - it might have already been deleted
        if (deleteError.message?.includes('404') || deleteError.message?.includes('Not Found')) {
          console.log(`[Replace Image API] Old file ${r2Key} not found (may have already been deleted), continuing...`);
        } else {
          console.error(`[Replace Image API] Error deleting old file ${r2Key}:`, deleteError);
          // Continue with upload even if delete fails
        }
      }
    }

    // Also check if there's already a file at the originalKey location and delete it
    // This handles the case where the original file exists and we want to replace it
    console.log(`[Replace Image API] Checking if original file exists: ${bucket}/${originalKey}`);
    try {
      // Try to get the object to see if it exists
      const existingFileCheck = await getObject(bucket, originalKey);
      if (existingFileCheck.ok) {
        console.log(`[Replace Image API] Original file ${originalKey} exists, will be overwritten by upload`);
      }
    } catch (checkError: any) {
      // File doesn't exist, which is fine - we'll create it
      if (checkError.message?.includes('404') || checkError.message?.includes('Not Found')) {
        console.log(`[Replace Image API] Original file ${originalKey} does not exist, will be created`);
      } else {
        console.error(`[Replace Image API] Error checking for original file:`, checkError);
      }
    }

    // Upload new file (overwrites existing original file, not retry file)
    console.log(`[Replace Image API] Uploading new file to ${bucket}/${originalKey}`);
    console.log(`[Replace Image API] File details:`, {
      name: file.name,
      size: file.size,
      type: file.type
    });
    
    const fileBuffer = await file.arrayBuffer();
    console.log(`[Replace Image API] File buffer size:`, fileBuffer.byteLength, 'bytes');
    const contentType = file.type || 'image/png';
    console.log(`[Replace Image API] Content type:`, contentType);
    
    console.log(`[Replace Image API] Calling putObject...`);
    await putObject(bucket, originalKey, fileBuffer, contentType);
    console.log(`[Replace Image API] putObject completed successfully`);

    // Update manifest entry with replacement history
    const replacedAt = new Date().toISOString();
    const replacementCount = (entry.replacementCount || 0) + 1;
    
    // Update entry
    entry.replacedAt = replacedAt;
    entry.replacementCount = replacementCount;
    if (replacedBy) {
      entry.replacedBy = replacedBy;
    }

    // Add to replacement history array if it exists, or create it
    if (!entry.replacementHistory) {
      entry.replacementHistory = [];
    }
    entry.replacementHistory.push({
      replacedAt,
      replacedBy: replacedBy || null,
    });

    // Save updated manifest back to R2
    const updatedManifestJson = JSON.stringify(manifest, null, 2);
    await putObject(
      R2_ORDERS_BUCKET,
      manifestKey,
      updatedManifestJson,
      'application/json'
    );

    console.log(`[Replace Image] Successfully replaced pose ${poseNumber} in ${stage} stage`);

    return NextResponse.json({
      success: true,
      orderId,
      poseNumber,
      stage,
      r2Key: originalKey, // Return the original key (without retry suffix)
      replacedAt,
      replacementCount,
      replacedBy: replacedBy || null,
    });

  } catch (error: any) {
    console.error('[Replace Image] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

