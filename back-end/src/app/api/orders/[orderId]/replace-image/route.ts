import { NextRequest, NextResponse } from 'next/server';
import { getObject, putObject, deleteObject, R2_ORDERS_BUCKET, R2_PUBLIC_BUCKET } from '@/lib/r2-client';
import { buildManifestKey } from '@/lib/r2-service';
import { clear2BEntryForReprocessing } from '@/lib/auto-flip-pose';
import { PoseAutoFlipFormatError, transformPoseUploadBuffer } from '@/lib/pose-auto-flip';

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
    const formDataKeys = Array.from(formData.keys());
    console.log('[Replace Image API] FormData keys:', formDataKeys);
    
    const uploadMode = request.headers.get('x-lhb-upload-mode')?.toString() || null;
    const forceDirectFile = uploadMode === 'direct-file';
    const requestedTemporaryR2Key = formData.get('temporaryR2Key')?.toString(); // Optional: for accepting revisions
    const temporaryR2Key = forceDirectFile ? undefined : requestedTemporaryR2Key;

    const poseNumberStr = formData.get('poseNumber')?.toString();
    const pageNumberStr = formData.get('pageNumber')?.toString();
    const stage = formData.get('stage')?.toString();
    const isBaseCharacter = formData.get('isBaseCharacter')?.toString() === 'true';
    const file = formData.get('file') as File | null;
    const replacedBy = formData.get('replacedBy')?.toString() || null; // Optional
    const isFlipped = formData.get('isFlipped')?.toString() === 'true'; // Indicates this is a flip operation

    console.log('[Replace Image API] Extracted values:', {
      poseNumberStr,
      pageNumberStr,
      stage,
      isBaseCharacter,
      file: file ? { name: file.name, size: file.size, type: file.type } : null,
      uploadMode,
      forceDirectFile,
      requestedTemporaryR2Key,
      temporaryR2Key,
      replacedBy
    });

    // Validation
    // Either file OR temporaryR2Key must be provided
    // For base character, we don't need poseNumber/pageNumber
    if (!isBaseCharacter && (!poseNumberStr && !pageNumberStr) || !stage || (!file && !temporaryR2Key)) {
      console.error('[Replace Image API] Missing required fields:', {
        isBaseCharacter,
        hasPoseNumber: !!poseNumberStr,
        hasPageNumber: !!pageNumberStr,
        hasStage: !!stage,
        hasFile: !!file,
        hasTemporaryR2Key: !!temporaryR2Key
      });
      return NextResponse.json(
        { error: 'Missing required fields: (poseNumber or pageNumber or isBaseCharacter), stage, and (file or temporaryR2Key)' },
        { status: 400 }
      );
    }

    if (forceDirectFile && !file) {
      return NextResponse.json(
        { error: 'Direct-file upload mode requires a file field' },
        { status: 400 }
      );
    }

    // Cannot have both file and temporaryR2Key
    if (file && temporaryR2Key) {
      return NextResponse.json(
        { error: 'Cannot specify both file and temporaryR2Key' },
        { status: 400 }
      );
    }

    // Validate that we have exactly one of poseNumber, pageNumber, or isBaseCharacter
    if (poseNumberStr && pageNumberStr) {
      return NextResponse.json(
        { error: 'Cannot specify both poseNumber and pageNumber' },
        { status: 400 }
      );
    }

    if (isBaseCharacter && (poseNumberStr || pageNumberStr)) {
      return NextResponse.json(
        { error: 'Cannot specify isBaseCharacter with poseNumber or pageNumber' },
        { status: 400 }
      );
    }

    if (!isBaseCharacter && !poseNumberStr && !pageNumberStr) {
      return NextResponse.json(
        { error: 'Must specify either poseNumber, pageNumber, or isBaseCharacter' },
        { status: 400 }
      );
    }

    const poseNumber = poseNumberStr ? parseInt(poseNumberStr, 10) : null;
    const pageNumber = pageNumberStr ? parseInt(pageNumberStr, 10) : null;

    if (poseNumber !== null && (isNaN(poseNumber) || poseNumber < 0)) {
      return NextResponse.json(
        { error: 'Invalid poseNumber' },
        { status: 400 }
      );
    }

    if (pageNumber !== null && (isNaN(pageNumber) || pageNumber < 0)) {
      return NextResponse.json(
        { error: 'Invalid pageNumber' },
        { status: 400 }
      );
    }

    // Validate file type (only if file is provided, not if temporaryR2Key is used)
    if (file && (!file.type || !file.type.startsWith('image/'))) {
      return NextResponse.json(
        { error: 'File must be an image' },
        { status: 400 }
      );
    }

    if (stage !== 'preBria' && stage !== 'postBria' && stage !== 'postPdf') {
      return NextResponse.json(
        { error: 'Invalid stage. Must be "preBria", "postBria", or "postPdf"' },
        { status: 400 }
      );
    }

    // Validate stage matches number type
    if (stage === 'postPdf' && poseNumber !== null) {
      return NextResponse.json(
        { error: 'postPdf stage requires pageNumber, not poseNumber' },
        { status: 400 }
      );
    }

    if ((stage === 'preBria' || stage === 'postBria') && pageNumber !== null && !isBaseCharacter) {
      return NextResponse.json(
        { error: `${stage} stage requires poseNumber, not pageNumber` },
        { status: 400 }
      );
    }

    // Handle postPdf stage (pages) separately from preBria/postBria (poses)
    if (stage === 'postPdf' && pageNumber !== null) {
      // Load 3-manifest for pages
      const manifestKey = buildManifestKey(orderId, '3');
      console.log(`[Replace Image] Loading 3-manifest: ${manifestKey}`);
      
      let manifest: any;
      try {
        const manifestRes = await getObject(R2_ORDERS_BUCKET, manifestKey);
        manifest = await readJsonSafe<any>(manifestRes);
      } catch (error: any) {
        if (error.message?.includes('404') || error.message?.includes('Not Found')) {
          return NextResponse.json(
            { error: 'Manifest not found. Please ensure Workflow 3 has completed.' },
            { status: 404 }
          );
        }
        console.error('[Replace Image API] Error loading manifest:', error);
        return NextResponse.json(
          { error: 'Failed to load manifest' },
          { status: 500 }
        );
      }

      if (!manifest || !manifest.pngGeneration || !manifest.pngGeneration.pages) {
        return NextResponse.json(
          { error: 'Invalid manifest structure - missing pngGeneration.pages' },
          { status: 400 }
        );
      }

      // Get page key (e.g., "p01", "p00")
      const pageKey = `p${String(pageNumber).padStart(2, '0')}`;
      const pages = manifest.pngGeneration.pages;
      
      // Get R2 key for this page
      let r2Key = pages[pageKey];
      
      if (!r2Key || typeof r2Key !== 'string') {
        // Construct R2 key if not in manifest
        r2Key = `book-mvp-simple-adventure/orders/${orderId}/preview-images/${pageKey}.png`;
        console.log(`[Replace Image API] Page ${pageNumber} not found in manifest, constructing R2 key: ${r2Key}`);
        // Add to manifest
        pages[pageKey] = r2Key;
      }

      console.log(`[Replace Image API] Page ${pageNumber} (${pageKey}) R2 key: ${r2Key}`);

      // Determine bucket (pages are in orders bucket)
      const bucket = R2_ORDERS_BUCKET;

      // Handle file upload: either from form data or copy from temporary location
      let fileBuffer: ArrayBuffer;
      let contentType: string;

      if (temporaryR2Key) {
        // Copy from temporary location (little-hero-orders bucket) to final location
        console.log(`[Replace Image API] Copying from temporary location: ${temporaryR2Key}`);
        
        // Read file from temporary location
        let tempFileRes: Response;
        try {
          tempFileRes = await getObject(R2_ORDERS_BUCKET, temporaryR2Key);
        } catch (error: any) {
          console.error('[Replace Image API] Temporary page source fetch failed', {
            orderId,
            stage,
            pageNumber,
            temporaryR2Key,
            formDataKeys,
            hasFile: !!file,
            fileSummary: file ? { name: file.name, size: file.size, type: file.type } : null,
          });
          return NextResponse.json(
            {
              error: `Temporary R2 source fetch failed: ${error.message || String(error)}`,
              diagnostics: {
                branch: 'temporaryR2Key',
                orderId,
                stage,
                pageNumber,
                temporaryR2Key,
                formDataKeys,
                hasFile: !!file,
                fileSummary: file ? { name: file.name, size: file.size, type: file.type } : null,
              },
            },
            { status: 500 }
          );
        }
        fileBuffer = await tempFileRes.arrayBuffer();
        contentType = tempFileRes.headers.get('content-type') || 'image/png';
        
        console.log(`[Replace Image API] Copied file size:`, fileBuffer.byteLength, 'bytes');
        console.log(`[Replace Image API] Content type:`, contentType);
        
        // Upload to final location
        console.log(`[Replace Image API] Uploading to final location: ${bucket}/${r2Key}`);
        await putObject(bucket, r2Key, fileBuffer, contentType);
        console.log(`[Replace Image API] File copied successfully`);
        
        // Delete temporary file
        try {
          await deleteObject(R2_ORDERS_BUCKET, temporaryR2Key);
          console.log(`[Replace Image API] Temporary file deleted: ${temporaryR2Key}`);
        } catch (deleteError: any) {
          console.warn(`[Replace Image API] Error deleting temporary file (may not exist):`, deleteError);
          // Continue even if delete fails
        }
      } else if (file) {
        // Upload new file from form data (overwrites existing file at same key)
        console.log(`[Replace Image API] Uploading new file to ${bucket}/${r2Key}`);
        fileBuffer = await file.arrayBuffer();
        contentType = file.type || 'image/png';
        
        await putObject(bucket, r2Key, fileBuffer, contentType);
        console.log(`[Replace Image API] putObject completed successfully`);
      } else {
        // This should never happen due to validation, but TypeScript needs it
        return NextResponse.json(
          { error: 'Either file or temporaryR2Key must be provided' },
          { status: 400 }
        );
      }

      // Upload to Cloudflare Images for WebP conversion
      let cloudflareImageId: string | null = null;
      let cloudflareImageUrl: string | null = null;
      try {
        const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
        const apiToken = process.env.CLOUDFLARE_IMAGES_API_TOKEN;
        const accountHash = process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH;

        if (accountId && apiToken && accountHash) {
          console.log(`[Replace Image API] Uploading to Cloudflare Images for page ${pageNumber}`);
          
          // Create FormData for multipart/form-data upload
          const cloudflareFormData = new FormData();
          const blob = new Blob([fileBuffer], { type: contentType });
          cloudflareFormData.append('file', blob, `p${String(pageNumber).padStart(2, '0')}.png`);
          cloudflareFormData.append('metadata', JSON.stringify({
            orderId: orderId,
            pageNumber: pageNumber,
            replacedAt: new Date().toISOString(),
          }));

          // Upload to Cloudflare Images API
          const cloudflareResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiToken}`,
              },
              body: cloudflareFormData,
            }
          );

          if (cloudflareResponse.ok) {
            const cloudflareData = await cloudflareResponse.json();
            if (cloudflareData.success && cloudflareData.result?.id) {
              cloudflareImageId = cloudflareData.result.id;
              // Construct Cloudflare Images URL with optimized width for previews
              // Using width=1024 for admin preview (balance between quality and file size)
              cloudflareImageUrl = `https://imagedelivery.net/${accountHash}/${cloudflareImageId}/preview?width=1024`;
              console.log(`[Replace Image API] ✅ Successfully uploaded to Cloudflare Images: ${cloudflareImageId}`);
            } else {
              console.warn(`[Replace Image API] Cloudflare Images upload succeeded but no image ID in response:`, cloudflareData);
            }
          } else {
            const errorText = await cloudflareResponse.text();
            console.warn(`[Replace Image API] Cloudflare Images upload failed (${cloudflareResponse.status}): ${errorText}`);
            // Continue without Cloudflare Images - R2 upload was successful
          }
        } else {
          console.warn(`[Replace Image API] Cloudflare Images credentials not configured, skipping upload`);
        }
      } catch (error: any) {
        console.error(`[Replace Image API] Error uploading to Cloudflare Images:`, error);
        // Continue without Cloudflare Images - R2 upload was successful
      }

      // Update pagesMetadata with replacement history
      if (!manifest.pngGeneration.pagesMetadata) {
        manifest.pngGeneration.pagesMetadata = {};
      }
      
      const pageMetadata = manifest.pngGeneration.pagesMetadata[pageKey] || {};
      const replacedAt = new Date().toISOString();
      const replacementCount = (pageMetadata.replacementCount || 0) + 1;
      
      // Update metadata
      manifest.pngGeneration.pagesMetadata[pageKey] = {
        ...pageMetadata,
        replacedAt,
        replacementCount,
        replacedBy: replacedBy || null,
        replacementHistory: [
          ...(pageMetadata.replacementHistory || []),
          {
            replacedAt,
            replacedBy: replacedBy || null,
          }
        ]
      };

      // Update Cloudflare Images URLs in pagePreviewImages with new upload
      // If Cloudflare upload succeeded, update with new data; otherwise clear old data
      const updateCloudflareInPagePreview = (previewImages: any[]) => {
        if (!Array.isArray(previewImages)) return previewImages;
        return previewImages.map((img: any) => {
          if (Number(img.pageNumber) === pageNumber) {
            const updated: any = {
              ...img,
              // Always update r2Key to ensure it's current
              r2Key: r2Key,
            };
            
            // Update Cloudflare Images data if upload succeeded
            if (cloudflareImageId && cloudflareImageUrl) {
              updated.cloudflareImageId = cloudflareImageId;
              updated.cloudflareImageUrl = cloudflareImageUrl;
            } else {
              // If Cloudflare upload failed, remove old data to force R2 usage
              // Use delete to ensure properties are removed (undefined might not serialize correctly)
              delete updated.cloudflareImageId;
              delete updated.cloudflareImageUrl;
            }
            
            return updated;
          }
          return img;
        });
      };

      // Check multiple possible locations for pagePreviewImages
      if (manifest.pagePreviewImages && Array.isArray(manifest.pagePreviewImages)) {
        manifest.pagePreviewImages = updateCloudflareInPagePreview(manifest.pagePreviewImages);
        console.log(`[Replace Image API] Updated Cloudflare Images data in pagePreviewImages for page ${pageNumber}`);
      }
      if (manifest.manifest?.pagePreviewImages && Array.isArray(manifest.manifest.pagePreviewImages)) {
        manifest.manifest.pagePreviewImages = updateCloudflareInPagePreview(manifest.manifest.pagePreviewImages);
        console.log(`[Replace Image API] Updated Cloudflare Images data in manifest.pagePreviewImages for page ${pageNumber}`);
      }
      if (manifest.bookAssembly?.pagePreviewImages && Array.isArray(manifest.bookAssembly.pagePreviewImages)) {
        manifest.bookAssembly.pagePreviewImages = updateCloudflareInPagePreview(manifest.bookAssembly.pagePreviewImages);
        console.log(`[Replace Image API] Updated Cloudflare Images data in bookAssembly.pagePreviewImages for page ${pageNumber}`);
      }

      // Update pagesWithCloudflare if it exists
      if (manifest.pngGeneration?.pagesWithCloudflare && typeof manifest.pngGeneration.pagesWithCloudflare === 'object') {
        const pagesWithCloudflare = manifest.pngGeneration.pagesWithCloudflare;
        // Check both p00 and p00_dedication for page 0
        const keysToUpdate = pageNumber === 0 ? [pageKey, 'p00_dedication'] : [pageKey];
        keysToUpdate.forEach(key => {
          if (cloudflareImageId && cloudflareImageUrl) {
            // Update with new Cloudflare Images data
            pagesWithCloudflare[key] = {
              cloudflareImageId: cloudflareImageId,
              cloudflareImageUrl: cloudflareImageUrl,
            };
            console.log(`[Replace Image API] Updated ${key} in pagesWithCloudflare with new Cloudflare Images data`);
          } else {
            // Remove if Cloudflare upload failed
            if (pagesWithCloudflare[key]) {
              delete pagesWithCloudflare[key];
              console.log(`[Replace Image API] Removed ${key} from pagesWithCloudflare (Cloudflare upload failed)`);
            }
          }
        });
      }

      // Save updated manifest back to R2
      const updatedManifestJson = JSON.stringify(manifest, null, 2);
      await putObject(
        R2_ORDERS_BUCKET,
        manifestKey,
        updatedManifestJson,
        'application/json'
      );

      // Update order's updated_at timestamp in Supabase to trigger cache refresh
      // This ensures the frontend gets new cache-busting parameters for image URLs
      try {
        const { updateOrderInSupabase } = await import('@/lib/supabase-client');
        await updateOrderInSupabase(orderId, {
          updated_at: replacedAt, // Use the same timestamp as replacement
        });
        console.log(`[Replace Image API] Updated order ${orderId} updated_at timestamp for cache refresh (postPdf)`);
      } catch (error: any) {
        console.warn(`[Replace Image API] Failed to update order timestamp (non-critical):`, error.message);
        // Don't fail the request if timestamp update fails - image replacement was successful
      }

      console.log(`[Replace Image] Successfully replaced page ${pageNumber} in postPdf stage`);

      return NextResponse.json({
        success: true,
        orderId,
        pageNumber,
        stage,
        r2Key,
        replacedAt,
        replacementCount,
        replacedBy: replacedBy || null,
        cloudflareImageId: cloudflareImageId || null,
        cloudflareImageUrl: cloudflareImageUrl || null,
      });
    }

    // Handle base character replacement (not in manifest)
    if (isBaseCharacter) {
      console.log('[Replace Image API] Handling base character replacement');
      
      // Get character hash from order or manifest
      let characterHash: string | null = null;
      
      // Try to get from 2a manifest first
      try {
        const manifest2aKey = buildManifestKey(orderId, '2a');
        const manifest2aRes = await getObject(R2_ORDERS_BUCKET, manifest2aKey);
        const manifest2a = await readJsonSafe<any>(manifest2aRes);
        characterHash = manifest2a?.characterHash || manifest2a?.order?.characterHash || null;
      } catch (error: any) {
        console.warn('[Replace Image API] Could not load 2a manifest for characterHash:', error.message);
      }
      
      // Fallback: try to get from Supabase order
      if (!characterHash) {
        try {
          const { getOrderFromSupabase } = await import('@/lib/supabase-client');
          const order = (await getOrderFromSupabase(orderId).catch((): null => null)) as
            | { character_hash?: string | null }
            | null;
          characterHash = order?.character_hash ?? null;
        } catch (error: any) {
          console.warn('[Replace Image API] Could not load order from Supabase:', error.message);
        }
      }
      
      if (!characterHash) {
        return NextResponse.json(
          { error: 'Cannot replace base character: characterHash not found. Please ensure workflow 2A has completed.' },
          { status: 400 }
        );
      }
      
      // Construct R2 key for base character
      const r2Key = `book-mvp-simple-adventure/order-generated-assets/characters/${characterHash}/base-character.png`;
      const bucket = R2_PUBLIC_BUCKET;
      
      console.log(`[Replace Image API] Base character R2 key: ${r2Key}`);
      
      // Handle file upload
      let fileBuffer: ArrayBuffer;
      let contentType: string;
      
      if (temporaryR2Key) {
        // Copy from temporary location
        console.log(`[Replace Image API] Copying base character from temporary location: ${temporaryR2Key}`);
        const tempFileRes = await getObject(R2_ORDERS_BUCKET, temporaryR2Key);
        fileBuffer = await tempFileRes.arrayBuffer();
        contentType = tempFileRes.headers.get('content-type') || 'image/png';
        
        await putObject(bucket, r2Key, fileBuffer, contentType);
        console.log(`[Replace Image API] Base character copied successfully`);
        
        // Delete temporary file
        try {
          await deleteObject(R2_ORDERS_BUCKET, temporaryR2Key);
        } catch (deleteError: any) {
          console.warn(`[Replace Image API] Error deleting temporary file:`, deleteError);
        }
      } else if (file) {
        // Upload new file
        console.log(`[Replace Image API] Uploading base character to ${bucket}/${r2Key}`);
        fileBuffer = await file.arrayBuffer();
        contentType = file.type || 'image/png';
        
        await putObject(bucket, r2Key, fileBuffer, contentType);
        console.log(`[Replace Image API] Base character uploaded successfully`);
      } else {
        return NextResponse.json(
          { error: 'Either file or temporaryR2Key must be provided' },
          { status: 400 }
        );
      }
      
      const replacedAt = new Date().toISOString();
      
      // Update order's updated_at timestamp in Supabase to trigger cache refresh
      // This ensures the frontend gets new cache-busting parameters for image URLs
      try {
        const { updateOrderInSupabase } = await import('@/lib/supabase-client');
        await updateOrderInSupabase(orderId, {
          updated_at: replacedAt, // Use the same timestamp as replacement
        });
        console.log(`[Replace Image API] Updated order ${orderId} updated_at timestamp for cache refresh (base character)`);
      } catch (error: any) {
        console.warn(`[Replace Image API] Failed to update order timestamp (non-critical):`, error.message);
        // Don't fail the request if timestamp update fails - image replacement was successful
      }
      
      return NextResponse.json({
        success: true,
        orderId,
        isBaseCharacter: true,
        stage,
        r2Key,
        replacedAt,
        replacedBy: replacedBy || null,
      });
    }

    // Handle preBria/postBria stages (poses)
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
    // NOTE: poseNumber 0 is a valid pose (pose00.png), not the base character (base-character.png)
    // Base character replacement would be a separate feature and is not handled here
    let entry = manifest.entries.find((e: any) => e.poseNumber === poseNumber);
    
    // If entry doesn't exist, it means the pose is missing/exhausted - we'll create a new entry
    // This is valid for any pose number, including pose0
    const isNewEntry = !entry;
    if (isNewEntry) {
      console.log(`[Replace Image API] Pose ${poseNumber} not found in manifest entries - will create new entry for missing pose`);
      // Create a new entry for this pose
      entry = {
        poseNumber: poseNumber,
        attempts: 0,
        status: 'approved',
        approved: false,
        needsReview: false,
        reviewReason: null
      };
      // Add it to the manifest entries
      manifest.entries.push(entry);
      // Sort entries by poseNumber to maintain order
      manifest.entries.sort((a: any, b: any) => a.poseNumber - b.poseNumber);
    }

    // Get the R2 key to replace, or construct it if missing (for exhausted/failed poses)
    let r2Key = stage === 'preBria' ? entry.approvedKey : entry.bgRemovedKey;
    const isMissingPose = !r2Key || isNewEntry;
    
    if (isMissingPose) {
      // Construct the expected R2 key for missing poses
      // Format: book-mvp-simple-adventure/order-generated-assets/characters/{characterHash}/poses/pose{NN}.png
      const characterHash = manifest.characterHash || manifest.order?.characterHash;
      if (!characterHash) {
        return NextResponse.json(
          { error: 'Cannot upload missing pose: characterHash not found in manifest' },
          { status: 400 }
        );
      }
      
      const poseNN = String(poseNumber).padStart(2, '0');
      if (stage === 'preBria') {
        // Pre-Bria: original image in poses/ directory
        r2Key = `book-mvp-simple-adventure/order-generated-assets/characters/${characterHash}/poses/pose${poseNN}.png`;
      } else {
        // Post-Bria: background-removed image in parent directory
        // Format: characters/{hash}/characters_{hash}_pose{NN}_nobg.png
        r2Key = `book-mvp-simple-adventure/order-generated-assets/characters/${characterHash}/characters_${characterHash}_pose${poseNN}_nobg.png`;
      }
      
      console.log(`[Replace Image API] Missing pose detected, constructing R2 key: ${r2Key}`);
    }

    // CRITICAL: Strip retry suffixes from the key to upload to the original filename
    // Retry suffixes can be: _r1, _r2, _TRY01, _TRY02, etc.
    // We want to overwrite the original file (e.g., pose03.png), not the retry file (e.g., pose03_r2.png)
    // For missing poses, r2Key is already the original key (no retry suffix)
    const originalKey = isMissingPose 
      ? r2Key  // Already constructed without retry suffix
      : r2Key.replace(/_r\d+\.png$/i, '.png')  // Remove _r1, _r2, etc.
             .replace(/_TRY\d+\.png$/i, '.png'); // Remove _TRY01, _TRY02, etc.
    
    console.log(`[Replace Image API] Original key from manifest: ${r2Key}`);
    if (!isMissingPose) {
      console.log(`[Replace Image API] Stripped retry suffix, using key: ${originalKey}`);
    }
    
    // Update the manifest entry to point to the original key (without retry suffix)
    // For missing poses, this will create/update the entry
    if (stage === 'preBria') {
      entry.approvedKey = originalKey;
      entry.approvedFilename = `pose${String(poseNumber).padStart(2, '0')}.png`;
      entry.approved = true;
      entry.status = 'approved';
      entry.needsReview = false;
      entry.reviewReason = null;
      // CRITICAL: If the user replaces a pre-Bria (2A) pose, any prior Bria submission must be invalidated.
      // Otherwise workflow 2B may reuse an old briaStatusUrl/requestId and download an old result,
      // even though the 2A source image at approvedKey was overwritten.
      entry.briaStatusUrl = null;
      entry.briaRequestId = null;
      entry.briaStatus = null;
      // CRITICAL: Always update publicUrl to point to the new image
      // Use backend proxy endpoint if publicR2Url is not available (works with private buckets)
      // IMPORTANT: publicUrl must match approvedKey to ensure 2B workflow uses the correct image
      const publicR2Url = manifest.order?.publicR2Url;
      const backendUrl = 'https://admin.littleherolabs.com';
      
      if (publicR2Url) {
        entry.publicUrl = `${publicR2Url}/${originalKey}`;
      } else {
        // Fallback to backend proxy endpoint (works even if publicR2Url is missing)
        entry.publicUrl = `${backendUrl}/api/assets/${originalKey}`;
        console.log(`[Replace Image API] Updated publicUrl using backend proxy (publicR2Url not available): ${entry.publicUrl}`);
      }
      
      // CRITICAL: Verify publicUrl matches approvedKey (extract R2 key from publicUrl and compare)
      // This ensures 2B workflow will use the correct image
      const publicUrlKey = entry.publicUrl.includes('/api/assets/') 
        ? entry.publicUrl.split('/api/assets/')[1]?.split('?')[0]  // Extract key from proxy URL
        : entry.publicUrl.includes(publicR2Url || '')
          ? entry.publicUrl.replace(`${publicR2Url}/`, '').split('?')[0]  // Extract key from R2 URL
          : null;
      
      if (publicUrlKey && publicUrlKey !== originalKey) {
        console.warn(`[Replace Image API] ⚠️ publicUrl key mismatch! publicUrl points to: ${publicUrlKey}, but approvedKey is: ${originalKey}`);
        console.warn(`[Replace Image API] This will cause 2B to use the wrong image. Fixing...`);
        // Fix the mismatch by updating publicUrl to match approvedKey
        if (publicR2Url) {
          entry.publicUrl = `${publicR2Url}/${originalKey}`;
        } else {
          entry.publicUrl = `${backendUrl}/api/assets/${originalKey}`;
        }
        console.log(`[Replace Image API] ✅ Fixed publicUrl to match approvedKey: ${entry.publicUrl}`);
      } else {
        console.log(`[Replace Image API] ✅ Verified publicUrl matches approvedKey (${originalKey})`);
      }
    } else {
      // Post-Bria: update background-removed image fields
      entry.bgRemovedKey = originalKey;
      entry.bgRemovedFilename = `pose${String(poseNumber).padStart(2, '0')}-nobg.png`;
      entry.bgRemoved = true;
      entry.bgRemovedStatus = 'completed';
      // Clear review flags since image was manually uploaded/approved
      entry.needsReview = false;
      entry.reviewReason = null;
      // Note: For postBria stage, we no longer set flipped/flippedAt flags
      // The flipped image overwrites the original, so no state tracking is needed
      // Update publicUrl if publicR2Url is available
      const publicR2Url = manifest.order?.publicR2Url;
      if (publicR2Url) {
        entry.bgRemovedImageUrl = `${publicR2Url}/${originalKey}`;
        entry.bgRemovedPublicUrl = `${publicR2Url}/${originalKey}`;
      }
    }

    // Determine bucket (character assets are in public bucket)
    const isCharacterAsset = originalKey.includes('/characters/');
    const bucket = isCharacterAsset ? R2_PUBLIC_BUCKET : R2_ORDERS_BUCKET;

    // IMPORTANT: Only delete the file that's currently in the manifest entry
    // We do NOT delete other retry files (e.g., pose03_r1.png) that might exist but aren't
    // referenced in the manifest. Workflows may have created multiple retry files, and we
    // should only remove the one that's being replaced.
    // 
    // For missing poses, there's no old file to delete, so skip this step.
    // 
    // Example scenario:
    // - Manifest has approvedKey: "pose03_r2.png" (current active file)
    // - R2 might also have: pose03.png, pose03_r1.png, pose03_r2.png
    // - We delete ONLY pose03_r2.png (the one in manifest)
    // - We upload to pose03.png (canonical name)
    // - pose03_r1.png is left untouched (legitimate workflow retry file)
    if (!isMissingPose && r2Key !== originalKey) {
      console.log(`[Replace Image API] Deleting old file from manifest (may have retry suffix): ${bucket}/${r2Key}`);
      console.log(`[Replace Image API] Note: Only deleting the file referenced in manifest entry. Other retry files (if any) will remain untouched.`);
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
    } else if (isMissingPose) {
      console.log(`[Replace Image API] Missing pose - no old file to delete, will create new file at ${originalKey}`);
    } else {
      console.log(`[Replace Image API] Manifest key matches original key (${r2Key}), no old file to delete`);
    }

    // Note: We don't need to explicitly delete the file at originalKey location because
    // putObject will overwrite it. We also don't search for or delete other retry files
    // (e.g., pose03_r1.png) that might exist - those are legitimate workflow artifacts.

    // Handle file upload: either from form data or copy from temporary location
    let fileBuffer: ArrayBuffer;
    let contentType: string;

    if (temporaryR2Key) {
      // Copy from temporary location (little-hero-orders bucket) to final location
      console.log(`[Replace Image API] Copying from temporary location: ${temporaryR2Key}`);
      
      // Read file from temporary location
      let tempFileRes: Response;
      try {
        tempFileRes = await getObject(R2_ORDERS_BUCKET, temporaryR2Key);
      } catch (error: any) {
        console.error('[Replace Image API] Temporary pose source fetch failed', {
          orderId,
          stage,
          poseNumber,
          temporaryR2Key,
          formDataKeys,
          hasFile: !!file,
          fileSummary: file ? { name: file.name, size: file.size, type: file.type } : null,
        });
        return NextResponse.json(
          {
            error: `Temporary R2 source fetch failed: ${error.message || String(error)}`,
            diagnostics: {
              branch: 'temporaryR2Key',
              orderId,
              stage,
              poseNumber,
              temporaryR2Key,
              formDataKeys,
              hasFile: !!file,
              fileSummary: file ? { name: file.name, size: file.size, type: file.type } : null,
            },
          },
          { status: 500 }
        );
      }
      fileBuffer = await tempFileRes.arrayBuffer();
      contentType = tempFileRes.headers.get('content-type') || 'image/png';
      
      console.log(`[Replace Image API] Copied file size:`, fileBuffer.byteLength, 'bytes');
      console.log(`[Replace Image API] Content type:`, contentType);
      
      const transformedUpload = transformPoseUploadBuffer({
        stage,
        poseNumber,
        buffer: Buffer.from(fileBuffer),
      });
      fileBuffer = transformedUpload.buffer.buffer.slice(
        transformedUpload.buffer.byteOffset,
        transformedUpload.buffer.byteOffset + transformedUpload.buffer.byteLength,
      );

      // Upload to final location
      console.log(`[Replace Image API] Uploading to final location: ${bucket}/${originalKey}`);
      if (transformedUpload.flipped) {
        console.log(`[Replace Image API] Auto-flipped pose ${poseNumber} before canonical upload`);
      }
      await putObject(bucket, originalKey, fileBuffer, contentType);
      console.log(`[Replace Image API] File copied successfully`);
      
      // Delete temporary file
      try {
        await deleteObject(R2_ORDERS_BUCKET, temporaryR2Key);
        console.log(`[Replace Image API] Temporary file deleted: ${temporaryR2Key}`);
      } catch (deleteError: any) {
        console.warn(`[Replace Image API] Error deleting temporary file (may not exist):`, deleteError);
        // Continue even if delete fails
      }
    } else if (file) {
      // Upload new file from form data (overwrites existing original file, not retry file)
    console.log(`[Replace Image API] Uploading new file to ${bucket}/${originalKey}`);
    console.log(`[Replace Image API] File details:`, {
      name: file.name,
      size: file.size,
      type: file.type
    });
    
      fileBuffer = await file.arrayBuffer();
    console.log(`[Replace Image API] File buffer size:`, fileBuffer.byteLength, 'bytes');
      contentType = file.type || 'image/png';
    console.log(`[Replace Image API] Content type:`, contentType);
    
    const transformedUpload = transformPoseUploadBuffer({
      stage,
      poseNumber,
      buffer: Buffer.from(fileBuffer),
    });
    fileBuffer = transformedUpload.buffer.buffer.slice(
      transformedUpload.buffer.byteOffset,
      transformedUpload.buffer.byteOffset + transformedUpload.buffer.byteLength,
    );
    if (transformedUpload.flipped) {
      console.log(`[Replace Image API] Auto-flipped pose ${poseNumber} before canonical upload`);
    }
    console.log(`[Replace Image API] Calling putObject...`);
    await putObject(bucket, originalKey, fileBuffer, contentType);
    console.log(`[Replace Image API] putObject completed successfully`);
    } else {
      // This should never happen due to validation, but TypeScript needs it
      return NextResponse.json(
        { error: 'Either file or temporaryR2Key must be provided' },
        { status: 400 }
      );
    }

    // Update manifest entry with replacement history
    const replacedAt = new Date().toISOString();
    const replacementCount = (entry.replacementCount || 0) + 1;
    
    // Update entry
    entry.replacedAt = replacedAt;
    entry.replacementCount = replacementCount;
    if (replacedBy) {
      entry.replacedBy = replacedBy;
    }
    if (stage === 'preBria' && (poseNumber === 3 || poseNumber === 11)) {
      entry.lastAutoFlipAt = replacedAt;
      entry.lastAutoFlipReason = 'pose_policy';
    }
    
    // For postBria stage, also update source tracking fields for workflow cache-busting
    // When a postBria image is replaced, we need to track this so the workflow knows the source changed
    if (stage === 'postBria') {
      entry.sourceReplacedAt = replacedAt;
      entry.sourceReplacementCount = replacementCount;
    }

    // Add to replacement history array if it exists, or create it
    if (!entry.replacementHistory) {
      entry.replacementHistory = [];
    }
    entry.replacementHistory.push({
      replacedAt,
      replacedBy: replacedBy || null,
    });

    // If this was an accepted revision (temporaryR2Key provided), remove from pending revisions
    if (temporaryR2Key && manifest.revisions && manifest.revisions.pending) {
      const poseNN = String(poseNumber).padStart(2, '0');
      const poseKey = `pose${poseNN}`;
      const pendingRevision = manifest.revisions.pending[poseKey];
      
      if (pendingRevision) {
        // Verify that the temporaryR2Key matches what's in the manifest
        if (pendingRevision.r2Key !== temporaryR2Key) {
          console.warn(`[Replace Image API] R2 key mismatch for pose ${poseNumber}. Expected: ${pendingRevision.r2Key}, Got: ${temporaryR2Key}`);
          // Don't fail - the file might have been updated, but log the mismatch
        }
        
        // Move to history (optional - for tracking)
        if (!manifest.revisions.history) {
          manifest.revisions.history = [];
        }
        manifest.revisions.history.push({
          poseNumber,
          revisionPrompt: pendingRevision.revisionPrompt,
          requestedAt: pendingRevision.requestedAt,
          completedAt: replacedAt,
          status: 'accepted',
          replacedAt,
          jobId: pendingRevision.jobId,
        });
        
        // Clean up Cloudflare Images entry if it exists (since we're accepting, we don't need the temporary preview)
        if (pendingRevision.cloudflareImageId) {
          try {
            const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
            const apiToken = process.env.CLOUDFLARE_IMAGES_API_TOKEN;

            if (accountId && apiToken) {
              console.log(`[Replace Image API] Deleting temporary Cloudflare Images entry: ${pendingRevision.cloudflareImageId}`);
              
              const deleteResponse = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/${pendingRevision.cloudflareImageId}`,
                {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Bearer ${apiToken}`,
                  },
                }
              );

              if (deleteResponse.ok) {
                console.log(`[Replace Image API] ✅ Successfully deleted temporary Cloudflare Images entry`);
              } else {
                const errorText = await deleteResponse.text();
                console.warn(`[Replace Image API] Cloudflare Images delete failed (${deleteResponse.status}): ${errorText}`);
                // Continue - file replacement was successful
              }
            }
          } catch (error: any) {
            console.warn(`[Replace Image API] Error deleting Cloudflare Images entry:`, error);
            // Continue - file replacement was successful
          }
        }
        
        // Remove from pending
        delete manifest.revisions.pending[poseKey];
        console.log(`[Replace Image API] Moved revision from pending to history for pose ${poseNumber}`);
      }
    }

    // Save updated manifest back to R2
    const updatedManifestJson = JSON.stringify(manifest, null, 2);
    await putObject(
      R2_ORDERS_BUCKET,
      manifestKey,
      updatedManifestJson,
      'application/json'
    );

    // CRITICAL: If this is a preBria replacement, clear the corresponding 2B manifest entry
    // This forces 2B workflow to reprocess the pose with the new image
    if (stage === 'preBria') {
      try {
        const manifest2bKey = buildManifestKey(orderId, '2b');
        let manifest2b: any = null;
        
        try {
          const manifest2bRes = await getObject(R2_ORDERS_BUCKET, manifest2bKey);
          manifest2b = await readJsonSafe<any>(manifest2bRes);
        } catch (error: any) {
          // 2B manifest doesn't exist yet - that's fine, nothing to clear
          if (error.message?.includes('404') || error.message?.includes('Not Found')) {
            console.log(`[Replace Image API] 2B manifest doesn't exist yet for pose ${poseNumber} - nothing to clear`);
          } else {
            console.warn(`[Replace Image API] Error loading 2B manifest (non-critical):`, error.message);
          }
        }

        if (manifest2b && manifest2b.entries && Array.isArray(manifest2b.entries)) {
          const entry2b = manifest2b.entries.find((e: any) => e.poseNumber === poseNumber);
          
          if (entry2b) {
            // Clear 2B processing fields to force reprocessing
            console.log(`[Replace Image API] Clearing 2B manifest entry for pose ${poseNumber} to force reprocessing`);
            clear2BEntryForReprocessing(entry2b);
            
            // Save updated 2B manifest
            const updated2bManifestJson = JSON.stringify(manifest2b, null, 2);
            await putObject(
              R2_ORDERS_BUCKET,
              manifest2bKey,
              updated2bManifestJson,
              'application/json'
            );
            console.log(`[Replace Image API] ✅ Cleared 2B manifest entry for pose ${poseNumber} - 2B will reprocess`);
          } else {
            console.log(`[Replace Image API] No 2B manifest entry found for pose ${poseNumber} - nothing to clear`);
          }
        }
      } catch (error: any) {
        // Non-critical - log but don't fail the replacement
        console.warn(`[Replace Image API] Error clearing 2B manifest entry (non-critical):`, error.message);
      }
    }

    // Update order's updated_at timestamp in Supabase to trigger cache refresh
    // This ensures the frontend gets new cache-busting parameters for image URLs
    try {
      const { updateOrderInSupabase } = await import('@/lib/supabase-client');
      await updateOrderInSupabase(orderId, {
        updated_at: replacedAt, // Use the same timestamp as replacement
      });
      console.log(`[Replace Image API] Updated order ${orderId} updated_at timestamp for cache refresh`);
    } catch (error: any) {
      console.warn(`[Replace Image API] Failed to update order timestamp (non-critical):`, error.message);
      // Don't fail the request if timestamp update fails - image replacement was successful
    }

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
    if (error instanceof PoseAutoFlipFormatError) {
      return NextResponse.json(
        { error: `Auto-flip only supports PNG uploads for poses 3 and 11. Received ${error.format}.` },
        { status: 400 }
      );
    }
    console.error('[Replace Image] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
