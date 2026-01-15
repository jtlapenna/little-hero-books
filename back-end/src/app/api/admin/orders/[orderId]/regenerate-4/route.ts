import { NextRequest, NextResponse } from 'next/server';
import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * Update order row while tolerating schema drift between environments.
 * If a column doesn't exist (e.g. `lulu_carrier`), drop it and retry.
 */
async function updateOrderRowResilient(amazonOrderId: string, updateData: Record<string, unknown>) {
  const dataToUpdate: Record<string, unknown> = { ...updateData };
  let lastError: any = null;

  for (let i = 0; i < 6; i++) {
    const { data, error } = await supabase
      .from('orders')
      .update(dataToUpdate)
      .eq('amazon_order_id', amazonOrderId)
      .select('id'); // avoid `.single()` response-shape issues

    if (!error) {
      if (!data || data.length === 0) throw new Error(`Order not found for update: ${amazonOrderId}`);
      return;
    }

    lastError = error;

    const msg = String(error?.message || '');
    const details = String(error?.details || '');
    const code = String(error?.code || '');
    const combined = `${msg}\n${details}`.toLowerCase();

    // PostgREST / Postgres "unknown column" variants
    const isUnknownColumn =
      code === 'PGRST204' ||
      combined.includes('could not find the') && combined.includes('column') ||
      code === '42703' ||
      combined.includes('column') && combined.includes('does not exist');

    if (!isUnknownColumn) break;

    // Try to extract the missing column name.
    // Examples:
    // - "Could not find the 'lulu_carrier' column of 'orders' in the schema cache"
    // - "column orders.final_cover_url does not exist"
    const m =
      msg.match(/'([^']+)' column/i) ||
      details.match(/'([^']+)' column/i) ||
      msg.match(/column\s+[\w.]+\.([\w_]+)\s+does not exist/i) ||
      details.match(/column\s+[\w.]+\.([\w_]+)\s+does not exist/i);

    const missingCol = m?.[1];
    if (!missingCol) break;
    if (!(missingCol in dataToUpdate)) break;

    console.warn(`[Regenerate 4] Dropping missing column and retrying: ${missingCol}`);
    delete dataToUpdate[missingCol];
  }

  throw lastError || new Error('Failed to update order (unknown error)');
}

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
    // Use direct update to ensure execution_status is actually persisted
    const queuedAt = new Date().toISOString();
    await updateOrderRowResilient(orderId.trim(), {
      next_workflow: '4', // Uppercase '4' (router expects uppercase)
      execution_status: 'ready_for_processing', // Router only picks up 'ready_for_processing'
      lulu_job_id: null, // Clear Lulu job ID
      lulu_status: null, // Clear Lulu status
      lulu_cost: null, // Clear Lulu cost
      lulu_estimated_ship_date: null, // Clear estimated ship date
      lulu_tracking_number: null, // Clear tracking number
      lulu_tracking_url: null, // Clear tracking URL
      lulu_carrier: null, // Clear carrier
      queued_at: queuedAt,
      started_at: null, // Clear started_at
      current_workflow: null, // Clear current_workflow
      review_stages, // Preserve review stages
      // Clear any error/retry state that might prevent routing
      error_message: null,
      error_type: null,
      retry_count: 0,
      last_error_at: null,
      next_retry_at: null,
      // Ensure updated_at changes even if DB has no trigger
      updated_at: queuedAt,
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
