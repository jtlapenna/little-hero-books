import { NextRequest, NextResponse } from 'next/server';
import { getObject, putObject, R2_ORDERS_BUCKET, R2_PUBLIC_BUCKET } from '@/lib/r2-client';
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
    const r2Key = stage === 'preBria' ? entry.approvedKey : entry.bgRemovedKey;
    if (!r2Key) {
      return NextResponse.json(
        { error: `No ${stage === 'preBria' ? 'approvedKey' : 'bgRemovedKey'} found for pose ${poseNumber}` },
        { status: 404 }
      );
    }

    // Determine bucket (character assets are in public bucket)
    const isCharacterAsset = r2Key.includes('/characters/');
    const bucket = isCharacterAsset ? R2_PUBLIC_BUCKET : R2_ORDERS_BUCKET;

    // Upload new file (overwrites existing)
    console.log(`[Replace Image API] Uploading to ${bucket}/${r2Key}`);
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
    await putObject(bucket, r2Key, fileBuffer, contentType);
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
      r2Key,
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

