import { NextRequest, NextResponse } from 'next/server';
import { deleteObject, getObject, putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { buildManifestKey } from '@/lib/r2-service';

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
 * Reject a pending revision
 * POST /api/orders/[orderId]/reject-revision
 * 
 * Body (JSON):
 * - poseNumber: number (required)
 * - temporaryR2Key: string (required)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    console.log('[Reject Revision API] Request received');
    const { orderId } = await params;
    console.log('[Reject Revision API] OrderId:', orderId);

    if (!orderId) {
      console.error('[Reject Revision API] Missing orderId');
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    // Parse request body
    const body = await request.json();
    const { poseNumber, temporaryR2Key } = body;

    // Validation
    if (typeof poseNumber !== 'number' || poseNumber < 0 || poseNumber > 12) {
      return NextResponse.json(
        { error: 'Invalid poseNumber: must be a number between 0 and 12' },
        { status: 400 }
      );
    }

    if (!temporaryR2Key || typeof temporaryR2Key !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid temporaryR2Key' },
        { status: 400 }
      );
    }

    // Load manifest (2a-manifest.json)
    const manifestKey = buildManifestKey(orderId, '2a');
    console.log(`[Reject Revision API] Loading manifest: ${manifestKey}`);

    let manifest: any;
    try {
      const manifestRes = await getObject(R2_ORDERS_BUCKET, manifestKey);
      manifest = await readJsonSafe<any>(manifestRes);
    } catch (error: any) {
      if (error.message?.includes('404') || error.message?.includes('Not Found')) {
        return NextResponse.json(
          { error: 'Manifest not found. Workflow 2A may not have completed yet.' },
          { status: 404 }
        );
      }
      throw error;
    }

    if (!manifest || !manifest.revisions || !manifest.revisions.pending) {
      return NextResponse.json(
        { error: 'No pending revisions found in manifest' },
        { status: 404 }
      );
    }

    // Find and remove the pending revision
    const poseNN = String(poseNumber).padStart(2, '0');
    const poseKey = `pose${poseNN}`;
    const pendingRevision = manifest.revisions.pending[poseKey];

    if (!pendingRevision) {
      return NextResponse.json(
        { error: `Pending revision not found for pose ${poseNumber}` },
        { status: 404 }
      );
    }

    // Verify the R2 key matches
    if (pendingRevision.r2Key !== temporaryR2Key) {
      return NextResponse.json(
        { error: 'R2 key mismatch. Revision may have been updated.' },
        { status: 400 }
      );
    }

    // Delete temporary file from R2
    try {
      await deleteObject(R2_ORDERS_BUCKET, temporaryR2Key);
      console.log(`[Reject Revision API] Deleted temporary file: ${temporaryR2Key}`);
    } catch (error: any) {
      // Log error but continue - file might not exist
      console.warn(`[Reject Revision API] Error deleting temporary file (may not exist):`, error);
    }

    // Delete Cloudflare Images entry if it exists
    if (pendingRevision.cloudflareImageId) {
      try {
        const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
        const apiToken = process.env.CLOUDFLARE_IMAGES_API_TOKEN;

        if (accountId && apiToken) {
          console.log(`[Reject Revision API] Deleting Cloudflare Images entry: ${pendingRevision.cloudflareImageId}`);
          
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
            console.log(`[Reject Revision API] ✅ Successfully deleted Cloudflare Images entry`);
          } else {
            const errorText = await deleteResponse.text();
            console.warn(`[Reject Revision API] Cloudflare Images delete failed (${deleteResponse.status}): ${errorText}`);
            // Continue - R2 file deletion was successful
          }
        }
      } catch (error: any) {
        console.warn(`[Reject Revision API] Error deleting Cloudflare Images entry:`, error);
        // Continue - R2 file deletion was successful
      }
    }

    // Move to history for tracking (before removing from pending)
    if (!manifest.revisions.history) {
      manifest.revisions.history = [];
    }
    manifest.revisions.history.push({
      poseNumber,
      revisionPrompt: pendingRevision.revisionPrompt,
      requestedAt: pendingRevision.requestedAt,
      completedAt: new Date().toISOString(),
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      jobId: pendingRevision.jobId,
    });

    // Remove from pending
    delete manifest.revisions.pending[poseKey];
    console.log(`[Reject Revision API] Moved revision from pending to history (rejected) for pose ${poseNumber}`);

    // Save updated manifest back to R2
    const updatedManifestJson = JSON.stringify(manifest, null, 2);
    await putObject(
      R2_ORDERS_BUCKET,
      manifestKey,
      updatedManifestJson,
      'application/json'
    );

    console.log(`[Reject Revision API] Successfully rejected revision for pose ${poseNumber}`);

    return NextResponse.json({
      success: true,
      orderId,
      poseNumber,
      rejectedAt: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('[Reject Revision API] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

