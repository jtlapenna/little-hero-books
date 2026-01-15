import { NextRequest, NextResponse } from 'next/server';
import { getOrderFromSupabase, updateOrderInSupabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/orders/[orderId]/regenerate-4
 * 
 * Force regeneration of 4 workflow (Print Fulfillment) by clearing Lulu status fields and triggering workflow.
 * 
 * Clears Supabase:
 * - lulu_job_id, lulu_status, lulu_cost, lulu_estimated_ship_date
 * - lulu_tracking_number, lulu_tracking_url, lulu_carrier
 * 
 * Triggers workflow: Sets next_workflow: '4', execution_status: 'ready_for_processing'
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

    // Preserve review_stages when updating
    const review_stages = currentOrder.review_stages || {};

    // Clear Lulu status fields and trigger workflow
    // IMPORTANT: Must clear any existing processing state to allow router to pick it up
    // Use updateOrderInSupabase directly to avoid calculateOrderStatus overriding execution_status
    await updateOrderInSupabase(orderId, {
      next_workflow: '4', // Uppercase '4' (router expects uppercase)
      execution_status: 'ready_for_processing', // Router only picks up 'ready_for_processing'
      lulu_job_id: null, // Clear Lulu job ID
      lulu_status: null, // Clear Lulu status
      lulu_cost: null, // Clear Lulu cost
      lulu_estimated_ship_date: null, // Clear estimated ship date
      lulu_tracking_number: null, // Clear tracking number
      lulu_tracking_url: null, // Clear tracking URL
      lulu_carrier: null, // Clear carrier
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
    console.log(`[Regenerate 4] Successfully updated order ${orderId} - cleared Lulu fields and set execution_status to ready_for_processing`);

    console.log(`[Regenerate 4] Order ${orderId} queued for router. Router will pick it up on next cron run.`);

    return NextResponse.json({
      success: true,
      orderId,
      message: '4 workflow regeneration queued. Lulu fields cleared. Router will pick up this order on next cron run.',
      luluFieldsCleared: true
    });
  } catch (error: any) {
    console.error('[Regenerate 4] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to regenerate 4 workflow',
        details: error?.message 
      },
      { status: 500 }
    );
  }
}
