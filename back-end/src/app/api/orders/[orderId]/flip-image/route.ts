import { NextRequest, NextResponse } from 'next/server';
import { getObject, putObject, R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { buildManifestKey } from '@/lib/r2-service';

// Helper to parse JSON safely
async function readJsonSafe<T = any>(res: Response): Promise<T> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error('Invalid JSON in manifest'); }
}

/**
 * Flip an image horizontally
 * POST /api/orders/[orderId]/flip-image
 * 
 * Body (JSON):
 * - poseNumber: number (required)
 * - stage: 'postBria' (required)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    console.log('[Flip Image API] Request received');
    const { orderId } = await params;
    console.log('[Flip Image API] OrderId:', orderId);
    
    if (!orderId) {
      console.error('[Flip Image API] Missing orderId');
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    // Parse JSON body
    const body = await request.json();
    const { poseNumber, stage } = body;

    // Validation
    if (typeof poseNumber !== 'number' || poseNumber < 0) {
      return NextResponse.json(
        { error: 'Invalid poseNumber' },
        { status: 400 }
      );
    }

    if (stage !== 'postBria') {
      return NextResponse.json(
        { error: 'Flip is only supported for postBria stage' },
        { status: 400 }
      );
    }

    // Load manifest (2B manifest for Post-Bria)
    const manifestKey = buildManifestKey(orderId, '2b');
    console.log('[Flip Image API] Loading manifest:', manifestKey);
    
    let manifest: any;
    try {
      // Try to load from R2_ORDERS_BUCKET first (where manifests are stored)
      const manifestRes = await getObject(R2_ORDERS_BUCKET, manifestKey);
      manifest = await readJsonSafe<any>(manifestRes);
    } catch (error: any) {
      // If 2B manifest doesn't exist, try 2A manifest
      if (error.message?.includes('404') || error.message?.includes('NoSuchKey')) {
        console.log('[Flip Image API] 2B manifest not found, trying 2A manifest');
        const manifestKey2A = buildManifestKey(orderId, '2a');
        try {
          const manifestRes2A = await getObject(R2_ORDERS_BUCKET, manifestKey2A);
          manifest = await readJsonSafe<any>(manifestRes2A);
        } catch (error2A: any) {
          throw new Error(`Manifest not found: ${error2A.message}`);
        }
      } else {
        throw error;
      }
    }

    if (!manifest || !manifest.entries) {
      return NextResponse.json(
        { error: 'Manifest not found or invalid' },
        { status: 404 }
      );
    }

    // Find the entry for this pose
    const entry = manifest.entries.find((e: any) => e.poseNumber === poseNumber);
    if (!entry) {
      return NextResponse.json(
        { error: `Pose ${poseNumber} not found in manifest` },
        { status: 404 }
      );
    }

    // Get the bgRemovedKey (R2 key for the background-removed image)
    const r2Key = entry.bgRemovedKey;
    if (!r2Key) {
      return NextResponse.json(
        { error: `Background-removed image not found for pose ${poseNumber}` },
        { status: 404 }
      );
    }

    console.log('[Flip Image API] Found image at R2 key:', r2Key);

    // Download image from R2
    const bucket = R2_PUBLIC_BUCKET;
    let imageResponse: Response;
    try {
      imageResponse = await getObject(bucket, r2Key);
    } catch (error: any) {
      console.error('[Flip Image API] Failed to download image:', error);
      return NextResponse.json(
        { error: `Failed to download image: ${error.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    // Get image buffer
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBufferNode = Buffer.from(imageBuffer);

    // Flip image horizontally using sharp
    // Note: If sharp is not available, we'll need to install it or use an alternative
    let flippedBuffer: Buffer;
    try {
      // Dynamic import to handle case where sharp might not be installed
      const sharp = await import('sharp').catch(() => null);
      
      if (!sharp) {
        // Fallback: Use canvas API if sharp is not available
        const { createCanvas, loadImage } = await import('@napi-rs/canvas');
        const img = await loadImage(imageBufferNode);
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        
        // Flip horizontally by scaling and translating
        ctx.scale(-1, 1);
        ctx.drawImage(img, -img.width, 0);
        
        flippedBuffer = Buffer.from(canvas.toBuffer('image/png'));
      } else {
        // Use sharp for flipping
        flippedBuffer = await sharp.default(imageBufferNode)
          .flop() // Horizontal flip
          .toBuffer();
      }
    } catch (error: any) {
      console.error('[Flip Image API] Failed to flip image:', error);
      return NextResponse.json(
        { error: `Failed to flip image: ${error.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    // Upload flipped image back to R2 (same key, overwrite)
    const contentType = imageResponse.headers.get('content-type') || 'image/png';
    try {
      await putObject(bucket, r2Key, flippedBuffer, contentType);
      console.log('[Flip Image API] Successfully uploaded flipped image');
    } catch (error: any) {
      console.error('[Flip Image API] Failed to upload flipped image:', error);
      return NextResponse.json(
        { error: `Failed to upload flipped image: ${error.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    // Update manifest entry
    entry.flipped = true;
    entry.flippedAt = new Date().toISOString();
    if (!entry.flipHistory) {
      entry.flipHistory = [];
    }
    entry.flipHistory.push({
      flippedAt: entry.flippedAt,
      flippedBy: null // Will be added when auth is implemented
    });

    // Upload updated manifest back to R2 (use R2_ORDERS_BUCKET for manifests)
    const manifestJSON = JSON.stringify(manifest, null, 2);
    const manifestBuffer = Buffer.from(manifestJSON, 'utf-8');
    
    try {
      await putObject(R2_ORDERS_BUCKET, manifestKey, manifestBuffer, 'application/json');
      console.log('[Flip Image API] Successfully updated manifest');
    } catch (error: any) {
      console.error('[Flip Image API] Failed to update manifest:', error);
      // Don't fail the request if manifest update fails - the image is already flipped
      console.warn('[Flip Image API] Image flipped but manifest update failed');
    }

    console.log(`[Flip Image] Successfully flipped pose ${poseNumber} in ${stage} stage`);

    return NextResponse.json({
      success: true,
      poseNumber,
      stage,
      r2Key,
      flippedAt: entry.flippedAt
    });

  } catch (error: any) {
    console.error('[Flip Image API] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

