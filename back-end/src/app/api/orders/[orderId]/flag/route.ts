import { NextRequest, NextResponse } from 'next/server';
import { getObject, putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { buildManifestKey } from '@/lib/r2-service';
import { setFlaggedCount } from '@/lib/review-state';

// Helper to parse JSON safely
async function readJsonSafe<T = any>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`HTTP ${res.status}: ${res.statusText} - ${errorText}`);
  }
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error('Invalid JSON in manifest'); }
}

/**
 * Flag an image in an order (persist flagging decision to manifest and Supabase)
 * POST /api/orders/[orderId]/flag
 * 
 * Body (JSON):
 * - poseNumber: number (optional, for preBria/postBria)
 * - pageNumber: number (optional, for postPdf)
 * - stage: 'preBria' | 'postBria' | 'postPdf' (required)
 * - reason?: string (optional, reason for flagging)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    console.log('[Flag API] Request received');
    const { orderId } = await params;
    console.log('[Flag API] OrderId:', orderId);
    
    if (!orderId) {
      console.error('[Flag API] Missing orderId');
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    // Parse JSON body
    const body = await request.json();
    const { poseNumber, pageNumber, stage, reason } = body;

    console.log('[Flag API] Extracted values:', { poseNumber, pageNumber, stage, reason });

    // Validation
    if ((poseNumber === undefined && pageNumber === undefined) || (poseNumber !== undefined && pageNumber !== undefined)) {
      return NextResponse.json(
        { error: 'Must specify exactly one of poseNumber or pageNumber' },
        { status: 400 }
      );
    }

    if (poseNumber !== undefined && (typeof poseNumber !== 'number' || poseNumber < 0)) {
      return NextResponse.json(
        { error: 'Invalid poseNumber' },
        { status: 400 }
      );
    }

    if (pageNumber !== undefined && (typeof pageNumber !== 'number' || pageNumber < 0)) {
      return NextResponse.json(
        { error: 'Invalid pageNumber' },
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
    if (stage === 'postPdf' && poseNumber !== undefined) {
      return NextResponse.json(
        { error: 'postPdf stage requires pageNumber, not poseNumber' },
        { status: 400 }
      );
    }

    if ((stage === 'preBria' || stage === 'postBria') && pageNumber !== undefined) {
      return NextResponse.json(
        { error: `${stage} stage requires poseNumber, not pageNumber` },
        { status: 400 }
      );
    }

    // Handle postPdf stage (pages) separately
    if (stage === 'postPdf' && pageNumber !== undefined) {
      const manifestKey = buildManifestKey(orderId, '3');
      console.log(`[Flag API] Loading 3-manifest: ${manifestKey}`);
      
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
        console.error('[Flag API] Error loading manifest:', error);
        return NextResponse.json(
          { error: 'Failed to load manifest' },
          { status: 500 }
        );
      }

      if (!manifest || !manifest.pngGeneration) {
        return NextResponse.json(
          { error: 'Invalid manifest structure - missing pngGeneration' },
          { status: 400 }
        );
      }

      // Get page key (e.g., "p01", "p00")
      const pageKey = `p${String(pageNumber).padStart(2, '0')}`;

      // Initialize pagesMetadata if it doesn't exist
      if (!manifest.pngGeneration.pagesMetadata) {
        manifest.pngGeneration.pagesMetadata = {};
      }

      const pageMetadata = manifest.pngGeneration.pagesMetadata[pageKey] || {};

      // Update metadata to set review flags
      manifest.pngGeneration.pagesMetadata[pageKey] = {
        ...pageMetadata,
        isFlagged: true,
        needsReview: true,
        reviewReason: reason || 'Flagged by admin',
        flaggedAt: new Date().toISOString(),
        flaggedBy: null // TODO: Add admin identifier when auth is implemented
      };

      // Save updated manifest back to R2
      const updatedManifestJson = JSON.stringify(manifest, null, 2);
      await putObject(
        R2_ORDERS_BUCKET,
        manifestKey,
        updatedManifestJson,
        'application/json'
      );

      // Update flag count in Supabase
      // Count all flagged pages in the manifest
      const flaggedPages = Object.values(manifest.pngGeneration.pagesMetadata || {})
        .filter((meta: any) => meta.isFlagged || meta.needsReview).length;
      try {
        await setFlaggedCount(orderId, 'postPdf', flaggedPages);
      } catch (error: any) {
        console.error('[Flag API] Error updating flag count in Supabase:', error);
        // Don't fail the request if Supabase update fails - manifest is already updated
      }

      console.log(`[Flag API] Successfully flagged page ${pageNumber} in postPdf stage`);

      return NextResponse.json({
        success: true,
        orderId,
        pageNumber,
        stage,
        needsReview: true,
        reviewReason: reason || 'Flagged by admin'
      });
    }

    // Determine which manifest to use
    const manifestType = stage === 'preBria' ? '2a' : '2b';
    let manifestKey = buildManifestKey(orderId, manifestType);
    
    // For Post-Bria, try 2b first, fallback to 2a if not found
    let manifest: any = null;
    if (stage === 'postBria') {
      try {
        const manifestRes = await getObject(R2_ORDERS_BUCKET, manifestKey);
        manifest = await readJsonSafe<any>(manifestRes);
        console.log(`[Flag API] Loaded 2b manifest for Post-Bria flag`);
      } catch (error: any) {
        // If 2b manifest doesn't exist, try 2a (for manually uploaded images)
        if (error.message?.includes('404') || error.message?.includes('Not Found')) {
          console.log(`[Flag API] 2b manifest not found, trying 2a manifest...`);
          const manifestKey2a = buildManifestKey(orderId, '2a');
          try {
            const manifestRes2a = await getObject(R2_ORDERS_BUCKET, manifestKey2a);
            manifest = await readJsonSafe<any>(manifestRes2a);
            console.log(`[Flag API] Loaded 2a manifest for Post-Bria flag (fallback)`);
            // Use 2a manifest key for saving
            manifestKey = manifestKey2a;
          } catch (error2a: any) {
            return NextResponse.json(
              { error: 'Manifest not found' },
              { status: 404 }
            );
          }
        } else {
          throw error;
        }
      }
    } else {
      // Pre-Bria: use 2a manifest
      try {
        const manifestRes = await getObject(R2_ORDERS_BUCKET, manifestKey);
        manifest = await readJsonSafe<any>(manifestRes);
        console.log(`[Flag API] Loaded 2a manifest for Pre-Bria flag`);
      } catch (error: any) {
        if (error.message?.includes('404') || error.message?.includes('Not Found')) {
          return NextResponse.json(
            { error: 'Manifest not found. Please ensure Workflow 2A has completed.' },
            { status: 404 }
          );
        }
        console.error('[Flag API] Error loading 2a manifest:', error);
        throw error; // Re-throw to be caught by outer catch
      }
    }

    if (!manifest || !manifest.entries || !Array.isArray(manifest.entries)) {
      return NextResponse.json(
        { error: 'Invalid manifest structure' },
        { status: 400 }
      );
    }

    // Find the entry for this pose
    let entry = manifest.entries.find((e: any) => e.poseNumber === poseNumber!);
    
    if (!entry) {
      return NextResponse.json(
        { error: `Pose ${poseNumber} not found in manifest` },
        { status: 404 }
      );
    }

    // Update entry to set review flags
    entry.isFlagged = true;
    entry.needsReview = true;
    entry.reviewReason = reason || 'Flagged by admin';
    entry.flaggedAt = new Date().toISOString();
    entry.flaggedBy = null; // TODO: Add admin identifier when auth is implemented

    // Save updated manifest back to R2
    const updatedManifestJson = JSON.stringify(manifest, null, 2);
    await putObject(
      R2_ORDERS_BUCKET,
      manifestKey,
      updatedManifestJson,
      'application/json'
    );

    // Update flag count in Supabase
    // Count all flagged poses in the manifest
    const flaggedPoses = manifest.entries.filter((e: any) => e.isFlagged || e.needsReview).length;
    try {
      await setFlaggedCount(orderId, stage, flaggedPoses);
    } catch (error: any) {
      console.error('[Flag API] Error updating flag count in Supabase:', error);
      // Don't fail the request if Supabase update fails - manifest is already updated
    }

    console.log(`[Flag API] Successfully flagged pose ${poseNumber!} in ${stage} stage`);

    return NextResponse.json({
      success: true,
      orderId,
      poseNumber: poseNumber!,
      stage,
      needsReview: true,
      reviewReason: reason || 'Flagged by admin'
    });

  } catch (error: any) {
    console.error('[Flag API] Error:', error);
    console.error('[Flag API] Error stack:', error?.stack);
    console.error('[Flag API] Error details:', {
      message: error?.message,
      name: error?.name,
      cause: error?.cause
    });
    return NextResponse.json(
      { 
        error: error?.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      },
      { status: 500 }
    );
  }
}

