import { NextRequest, NextResponse } from 'next/server';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { updateOrderStatus } from '@/lib/status-service';
import { getOrderFromSupabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/orders/[orderId]/regenerate-2a
 * 
 * Force regeneration of 2A workflow by clearing status fields and triggering workflow.
 * 
 * Clears from 2A manifest:
 * - briaStatusUrl, briaRequestId (if present)
 * - bgRemovedKey, bgRemovedImageUrl (if present)
 * - needsReview, reviewReason, isFlagged (cleared to false/null to start fresh)
 * 
 * Triggers workflow via router: Sets next_workflow: '2A', execution_status: 'ready_for_processing'
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // Allow same-origin requests (internal admin page) without auth
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const isSameOrigin = !origin || 
                       origin?.includes(siteUrl) || 
                       referer?.includes(siteUrl) ||
                       origin?.includes('littleherolabs.com') ||
                       referer?.includes('littleherolabs.com');
  
  if (!isSameOrigin) {
    return NextResponse.json({ 
      error: 'Unauthorized',
      details: 'Request must be from same origin'
    }, { status: 401 });
  }

  const { orderId } = await params;

  if (!orderId) {
    return NextResponse.json(
      { error: 'Order ID is required' },
      { status: 400 }
    );
  }

  try {
    // Get current order to preserve review_stages
    const currentOrder = await getOrderFromSupabase(orderId).catch(() => null);
    if (!currentOrder) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Download 2A manifest if it exists
    const manifest2aKey = buildManifestKey(orderId, '2a');
    let manifest2a: any = null;
    try {
      manifest2a = await downloadManifest(manifest2aKey);
    } catch (error: any) {
      // Manifest might not exist yet - that's okay, we'll just trigger the workflow
      console.log(`[Regenerate 2A] 2A manifest not found: ${manifest2aKey}`);
    }

    // Clear status fields from 2A manifest entries if manifest exists
    if (manifest2a && Array.isArray(manifest2a.entries)) {
      let modified = false;
      manifest2a.entries.forEach((entry: any) => {
        let entryModified = false;
        if (entry.briaStatusUrl || entry.briaRequestId || entry.bgRemovedKey || entry.bgRemovedImageUrl) {
          delete entry.briaStatusUrl;
          delete entry.briaRequestId;
          delete entry.bgRemovedKey;
          delete entry.bgRemovedImageUrl;
          entryModified = true;
        }
        // Clear review flags when regenerating (start fresh)
        if (entry.needsReview !== undefined || entry.reviewReason || entry.isFlagged !== undefined) {
          entry.needsReview = false;
          entry.reviewReason = null;
          entry.isFlagged = false;
          entryModified = true;
        }
        if (entryModified) {
          modified = true;
        }
      });

      // Upload modified manifest if changes were made
      if (modified) {
        const manifestJson = JSON.stringify(manifest2a, null, 2);
        await putObject(
          R2_ORDERS_BUCKET,
          manifest2aKey,
          manifestJson,
          'application/json'
        );
        console.log(`[Regenerate 2A] Cleared status fields in 2A manifest: ${manifest2aKey}`);
      }
    }

    // Preserve review_stages when updating
    const review_stages = currentOrder.review_stages || {};

    // Trigger workflow via router
    await updateOrderStatus(orderId, {
      next_workflow: '2A',
      execution_status: 'ready_for_processing',
      queued_at: new Date().toISOString(),
      started_at: null,
      current_workflow: null,
      review_stages, // Preserve review stages
    });

    return NextResponse.json({
      success: true,
      orderId,
      message: '2A workflow regeneration queued. Router will process when capacity is available.',
      manifestCleared: !!manifest2a
    });
  } catch (error: any) {
    console.error('[Regenerate 2A] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to regenerate 2A workflow',
        details: error?.message 
      },
      { status: 500 }
    );
  }
}
