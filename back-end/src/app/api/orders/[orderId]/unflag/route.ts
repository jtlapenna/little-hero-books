import { NextRequest, NextResponse } from 'next/server';
import { getObject, putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { buildManifestKeyCandidates } from '@/lib/order-paths';
import { setFlaggedCount, getOrderFlagSummaryById } from '@/lib/review-state';

// Helper to parse JSON safely
async function readJsonSafe<T = any>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`HTTP ${res.status}: ${res.statusText} - ${errorText}`);
  }
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error('Invalid JSON in manifest'); }
}

function isNotFoundMessage(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('404') || message.includes('Not Found');
}

async function loadManifestFromCandidates<T>(
  candidateKeys: string[],
): Promise<{ manifestKey: string; manifest: T | null }> {
  let lastError: unknown = null;

  for (const manifestKey of candidateKeys) {
    try {
      const manifestRes = await getObject(R2_ORDERS_BUCKET, manifestKey);
      const manifest = await readJsonSafe<T>(manifestRes);
      return { manifestKey, manifest };
    } catch (error) {
      lastError = error;
      if (!isNotFoundMessage(error)) {
        throw error;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return { manifestKey: candidateKeys[0] || '', manifest: null };
}

/**
 * Unflag an image in an order (persist unflagging decision to manifest)
 * POST /api/orders/[orderId]/unflag
 * 
 * Body (JSON):
 * - poseNumber: number (required)
 * - stage: 'preBria' | 'postBria' (required)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    console.log('[Unflag API] Request received');
    const { orderId } = await params;
    console.log('[Unflag API] OrderId:', orderId);
    
    if (!orderId) {
      console.error('[Unflag API] Missing orderId');
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    // Parse JSON body
    const body = await request.json();
    const { poseNumber, pageNumber, stage, bookId, orderPrefix } = body;

    console.log('[Unflag API] Extracted values:', { poseNumber, pageNumber, stage });

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
      const manifestKeyCandidates = buildManifestKeyCandidates(orderId, '3', {
        bookId: typeof bookId === 'string' ? bookId : null,
        orderPrefix: typeof orderPrefix === 'string' ? orderPrefix : null,
      });
      console.log(`[Unflag API] Loading 3-manifest from candidates: ${manifestKeyCandidates.join(', ')}`);

      let manifestKey = manifestKeyCandidates[0];
      let manifest: any = null;
      try {
        const result = await loadManifestFromCandidates<any>(manifestKeyCandidates);
        manifestKey = result.manifestKey;
        manifest = result.manifest;
      } catch (error: unknown) {
        if (isNotFoundMessage(error)) {
          return NextResponse.json(
            { error: 'Manifest not found. Please ensure Workflow 3 has completed.' },
            { status: 404 }
          );
        }
        console.error('[Unflag API] Error loading manifest:', error);
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

      // Update metadata to clear review flags
      manifest.pngGeneration.pagesMetadata[pageKey] = {
        ...pageMetadata,
        isFlagged: false,
        needsReview: false,
        reviewReason: null,
        unflagHistory: [
          ...(pageMetadata.unflagHistory || []),
          {
            unflaggedAt: new Date().toISOString(),
            unflaggedBy: null // TODO: Add admin identifier when auth is implemented
          }
        ]
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
        console.error('[Unflag API] Error updating flag count in Supabase:', error);
        // Don't fail the request if Supabase update fails - manifest is already updated
      }

      console.log(`[Unflag API] Successfully unflagged page ${pageNumber} in postPdf stage`);

      // Get updated flag counts from Supabase
      const flagSummary = await getOrderFlagSummaryById(orderId).catch(() => null);
      const flags = flagSummary ? {
        preBria: flagSummary.preBria,
        postBria: flagSummary.postBria,
        postPdf: flagSummary.postPdf,
        total: flagSummary.total
      } : null;

      return NextResponse.json({
        success: true,
        orderId,
        pageNumber,
        stage,
        needsReview: false,
        reviewReason: null,
        flags: flags // Return updated flag counts
      });
    }

    // Determine which manifest to use
    const manifestType = stage === 'preBria' ? '2a' : '2b';
    let manifestKey = buildManifestKeyCandidates(orderId, manifestType, {
      bookId: typeof bookId === 'string' ? bookId : null,
      orderPrefix: typeof orderPrefix === 'string' ? orderPrefix : null,
    })[0] || '';
    
    // For Post-Bria, try 2b first, fallback to 2a if not found
    let manifest: any = null;
    if (stage === 'postBria') {
      try {
        const result = await loadManifestFromCandidates<any>(
          buildManifestKeyCandidates(orderId, '2b', {
            bookId: typeof bookId === 'string' ? bookId : null,
            orderPrefix: typeof orderPrefix === 'string' ? orderPrefix : null,
          }),
        );
        manifestKey = result.manifestKey;
        manifest = result.manifest;
        console.log(`[Unflag API] Loaded 2b manifest for Post-Bria unflag`);
      } catch (error: unknown) {
        // If 2b manifest doesn't exist, try 2a (for manually uploaded images)
        if (isNotFoundMessage(error)) {
          console.log(`[Unflag API] 2b manifest not found, trying 2a manifest...`);
          try {
            const result = await loadManifestFromCandidates<any>(
              buildManifestKeyCandidates(orderId, '2a', {
                bookId: typeof bookId === 'string' ? bookId : null,
                orderPrefix: typeof orderPrefix === 'string' ? orderPrefix : null,
              }),
            );
            manifestKey = result.manifestKey;
            manifest = result.manifest;
            console.log(`[Unflag API] Loaded 2a manifest for Post-Bria unflag (fallback)`);
          } catch (error2a: unknown) {
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
        const result = await loadManifestFromCandidates<any>(
          buildManifestKeyCandidates(orderId, '2a', {
            bookId: typeof bookId === 'string' ? bookId : null,
            orderPrefix: typeof orderPrefix === 'string' ? orderPrefix : null,
          }),
        );
        manifestKey = result.manifestKey;
        manifest = result.manifest;
        console.log(`[Unflag API] Loaded 2a manifest for Pre-Bria unflag`);
      } catch (error: unknown) {
        if (isNotFoundMessage(error)) {
          return NextResponse.json(
            { error: 'Manifest not found. Please ensure Workflow 2A has completed.' },
            { status: 404 }
          );
        }
        console.error('[Unflag API] Error loading 2a manifest:', error);
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

    // Update entry to clear review flags
    // This persists the admin's unflagging decision
    entry.isFlagged = false;
    entry.needsReview = false;
    entry.reviewReason = null;
    
    // Add unflag history for audit trail
    if (!entry.unflagHistory) {
      entry.unflagHistory = [];
    }
    entry.unflagHistory.push({
      unflaggedAt: new Date().toISOString(),
      unflaggedBy: null // TODO: Add admin identifier when auth is implemented
    });

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
      console.error('[Unflag API] Error updating flag count in Supabase:', error);
      // Don't fail the request if Supabase update fails - manifest is already updated
    }

    console.log(`[Unflag API] Successfully unflagged pose ${poseNumber!} in ${stage} stage`);

    // Get updated flag counts from Supabase
    const flagSummary = await getOrderFlagSummaryById(orderId).catch(() => null);
    const flags = flagSummary ? {
      preBria: flagSummary.preBria,
      postBria: flagSummary.postBria,
      postPdf: flagSummary.postPdf,
      total: flagSummary.total
    } : null;

    return NextResponse.json({
      success: true,
      orderId,
      poseNumber: poseNumber!,
      stage,
      needsReview: false,
      reviewReason: null,
      flags: flags // Return updated flag counts
    });

  } catch (error: any) {
    console.error('[Unflag API] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
