import { NextRequest, NextResponse } from 'next/server';
import { getObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { buildManifestKeyCandidates } from '@/lib/order-paths';

// Helper to parse JSON safely
async function readJsonSafe<T = any>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON in manifest');
  }
}

/**
 * Get status of a regeneration job
 * GET /api/orders/[orderId]/regenerate-pose/[jobId]
 * 
 * Returns:
 * - jobId: string
 * - status: 'pending' | 'processing' | 'completed' | 'failed'
 * - poseNumber: number
 * - temporaryR2Key?: string (if completed)
 * - previewUrl?: string (if completed)
 * - error?: string (if failed)
 * - requestedAt: string
 * - completedAt?: string
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string; jobId: string }> }
) {
  try {
    const { orderId, jobId } = await params;
    const { searchParams } = new URL(request.url);
    const hintedBookId = searchParams.get('bookId');
    const hintedOrderPrefix = searchParams.get('orderPrefix');
    console.log(`[Regenerate Pose Status API] Request for orderId: ${orderId}, jobId: ${jobId}`);

    if (!orderId || !jobId) {
      return NextResponse.json(
        { error: 'Missing orderId or jobId' },
        { status: 400 }
      );
    }

    // Load manifest (2a-manifest.json)
    const manifestKeyCandidates = buildManifestKeyCandidates(orderId, '2a', {
      bookId: hintedBookId,
      orderPrefix: hintedOrderPrefix,
    });
    console.log(
      `[Regenerate Pose Status API] Loading manifest from candidates: ${manifestKeyCandidates.join(', ')}`,
    );

    let manifest: any = null;
    for (const manifestKey of manifestKeyCandidates) {
      try {
        const manifestRes = await getObject(R2_ORDERS_BUCKET, manifestKey);
        manifest = await readJsonSafe<any>(manifestRes);
        break;
      } catch (error: any) {
        if (!error.message?.includes('404') && !error.message?.includes('Not Found')) {
          throw error;
        }
      }
    }

    if (!manifest) {
      return NextResponse.json(
        { error: 'Manifest not found' },
        { status: 404 }
      );
    }

    // Check revisions.pending for the job
    if (!manifest.revisions || !manifest.revisions.pending) {
      return NextResponse.json(
        { error: 'No pending revisions found' },
        { status: 404 }
      );
    }

    // Find the revision with matching jobId
    let foundRevision: any = null;
    let foundPoseKey: string | null = null;

    for (const [poseKey, revision] of Object.entries(manifest.revisions.pending)) {
      const rev = revision as any;
      if (rev.jobId === jobId) {
        foundRevision = rev;
        foundPoseKey = poseKey;
        break;
      }
    }

    if (!foundRevision) {
      // Check history in case it was already completed and moved
      if (manifest.revisions.history && Array.isArray(manifest.revisions.history)) {
        const historyEntry = manifest.revisions.history.find((h: any) => h.jobId === jobId);
        if (historyEntry) {
          return NextResponse.json({
            jobId,
            status: historyEntry.status || 'completed',
            poseNumber: historyEntry.poseNumber,
            requestedAt: historyEntry.requestedAt,
            completedAt: historyEntry.completedAt,
            message: 'Job completed and moved to history',
          });
        }
      }

      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Extract pose number from poseKey (e.g., "pose05" -> 5)
    const poseNumberMatch = foundPoseKey?.match(/pose(\d+)/);
    const poseNumber = poseNumberMatch ? parseInt(poseNumberMatch[1], 10) : null;

    // Build response
    const response: any = {
      jobId,
      status: foundRevision.status || 'pending',
      poseNumber,
      requestedAt: foundRevision.requestedAt,
      revisionPrompt: foundRevision.revisionPrompt,
      imageSelection: foundRevision.imageSelection,
    };

    // Add completion data if status is 'completed'
    if (foundRevision.status === 'completed') {
      response.completedAt = foundRevision.completedAt || foundRevision.requestedAt;
      response.temporaryR2Key = foundRevision.r2Key;
      response.previewUrl = foundRevision.r2Key ? `/api/assets/${foundRevision.r2Key}` : null;
    }

    // Add error data if status is 'failed'
    if (foundRevision.status === 'failed') {
      response.error = foundRevision.error || 'Unknown error';
      response.completedAt = foundRevision.completedAt;
    }

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[Regenerate Pose Status API] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
