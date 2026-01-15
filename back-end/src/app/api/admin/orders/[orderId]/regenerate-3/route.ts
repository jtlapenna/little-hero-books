import { NextRequest, NextResponse } from 'next/server';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { updateOrderStatus } from '@/lib/status-service';
import { getOrderFromSupabase, updateOrderInSupabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/orders/[orderId]/regenerate-3
 * 
 * Force regeneration of 3 workflow (Book Assembly) by clearing status fields and triggering workflow.
 * 
 * Clears from 3 manifest:
 * - finalBookUrl, finalCoverUrl
 * 
 * Clears Supabase: manifest_3_url, final_book_url, final_cover_url
 * 
 * Triggers workflow: Sets next_workflow: '3', execution_status: 'ready_for_processing'
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

    // Download 3 manifest if it exists
    const manifest3Key = buildManifestKey(orderId, '3');
    let manifest3: any = null;
    let manifest3Modified = false;
    try {
      manifest3 = await downloadManifest(manifest3Key);
      
      // Clear final book/cover URLs from manifest
      if (manifest3) {
        if (manifest3.finalBookUrl || manifest3.finalCoverUrl || 
            manifest3.bookUrl || manifest3.coverUrl ||
            manifest3.order?.finalBookUrl || manifest3.order?.finalCoverUrl) {
          delete manifest3.finalBookUrl;
          delete manifest3.finalCoverUrl;
          delete manifest3.bookUrl;
          delete manifest3.coverUrl;
          if (manifest3.order) {
            delete manifest3.order.finalBookUrl;
            delete manifest3.order.finalCoverUrl;
          }
          manifest3Modified = true;
        }
      }
    } catch (error: any) {
      console.log(`[Regenerate 3] 3 manifest not found: ${manifest3Key}`);
    }

    // Upload modified manifest if changes were made
    if (manifest3Modified && manifest3) {
      const manifestJson = JSON.stringify(manifest3, null, 2);
      await putObject(
        R2_ORDERS_BUCKET,
        manifest3Key,
        manifestJson,
        'application/json'
      );
      console.log(`[Regenerate 3] Cleared final URLs in 3 manifest: ${manifest3Key}`);
    }

    // Preserve review_stages when updating
    const review_stages = currentOrder.review_stages || {};

    // Clear Supabase fields and trigger workflow
    // IMPORTANT: Must clear any existing processing state to allow router to pick it up
    // Try updateOrderStatus first (like regenerate-2b), but fallback to direct update if calculateOrderStatus fails
    try {
      await updateOrderStatus(orderId, {
        next_workflow: '3', // Uppercase '3' (router expects uppercase)
        execution_status: 'ready_for_processing', // Router only picks up 'ready_for_processing'
        manifest_3_url: null, // Clear manifest URL
        final_book_url: null, // Clear final book URL
        final_cover_url: null, // Clear final cover URL
        queued_at: new Date().toISOString(),
        started_at: null, // Clear started_at
        current_workflow: null, // Clear current_workflow
        review_stages, // Preserve review stages
        // Clear any error/retry state that might prevent routing
        error_message: null,
        error_type: null,
        retry_count: 0,
        last_error_at: null,
        next_retry_at: null,
      });
      console.log(`[Regenerate 3] Successfully updated order ${orderId} via updateOrderStatus`);
    } catch (statusError: any) {
      // If updateOrderStatus fails (likely due to calculateOrderStatus), fallback to direct update
      console.warn(`[Regenerate 3] updateOrderStatus failed, using direct update:`, statusError?.message);
      await updateOrderInSupabase(orderId, {
        next_workflow: '3',
        execution_status: 'ready_for_processing',
        manifest_3_url: null,
        final_book_url: null,
        final_cover_url: null,
        queued_at: new Date().toISOString(),
        started_at: null,
        current_workflow: null,
        review_stages,
        error_message: null,
        error_type: null,
        retry_count: 0,
        last_error_at: null,
        next_retry_at: null,
      });
      console.log(`[Regenerate 3] Successfully updated order ${orderId} via direct update`);
    }

    console.log(`[Regenerate 3] Order ${orderId} queued for router. Router will pick it up on next cron run.`);

    return NextResponse.json({
      success: true,
      orderId,
      message: '3 workflow regeneration queued. Manifests cleared. Router will pick up this order on next cron run.',
      manifestCleared: manifest3Modified
    });
  } catch (error: any) {
    console.error('[Regenerate 3] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to regenerate 3 workflow',
        details: error?.message 
      },
      { status: 500 }
    );
  }
}
