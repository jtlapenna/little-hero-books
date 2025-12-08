import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { determineNextWorkflow } from '@/lib/determine-next-workflow';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

/**
 * POST /api/admin/orders/[orderId]/reset
 * 
 * Resets an order to initial state, clearing error fields and resetting execution status.
 * 
 * This endpoint is used to recover orders that have errors or are stuck.
 * 
 * Body: (none required)
 * 
 * Returns: { success: true, orderId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // Allow same-origin requests (internal admin page) without auth
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const isSameOrigin = origin?.includes(process.env.NEXT_PUBLIC_SITE_URL || '') || 
                       referer?.includes(process.env.NEXT_PUBLIC_SITE_URL || '') ||
                       !origin;
  
  if (!isSameOrigin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Supabase credentials not configured' },
      { status: 500 }
    );
  }

  const { orderId } = await params;

  if (!orderId) {
    return NextResponse.json(
      { error: 'Order ID is required' },
      { status: 400 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Fetch full order data to determine correct next_workflow
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('amazon_order_id, next_workflow, one_manifest_url, manifest_2a_url, manifest_2b_url, manifest_3_url, workflow_step, review_stages')
      .eq('amazon_order_id', orderId)
      .single();

    if (fetchError || !order) {
      return NextResponse.json(
        { error: 'Order not found', details: fetchError?.message },
        { status: 404 }
      );
    }

    // Determine appropriate next_workflow based on order's actual progress
    // Don't blindly set to '2A' - check if order has already completed 2A, 2B, or 3
    const nextWorkflow = determineNextWorkflow({
      one_manifest_url: order.one_manifest_url,
      manifest_2a_url: order.manifest_2a_url,
      manifest_2b_url: order.manifest_2b_url,
      manifest_3_url: order.manifest_3_url,
      workflow_step: order.workflow_step,
      review_stages: order.review_stages as any,
      next_workflow: order.next_workflow
    });

    // Reset order to ready_for_processing state so router cron can pick it up
    // Clear all processing/error state and set execution_status to ready_for_processing
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        execution_status: 'ready_for_processing', // Required for router cron
        next_workflow: nextWorkflow, // Required for router cron (must not be null)
        error_message: null,
        error_type: null,
        retry_count: 0,
        next_retry_at: null,
        last_error_at: null,
        current_workflow: null, // Clear active workflow
        started_at: null, // Clear processing timestamp
        queued_at: new Date().toISOString(), // Set queued_at so router can prioritize
        updated_at: new Date().toISOString()
      })
      .eq('amazon_order_id', orderId);

    if (updateError) {
      console.error('[Reset Order] Failed to update Supabase:', updateError);
      return NextResponse.json(
        { 
          error: 'Failed to reset order',
          details: updateError.message 
        },
        { status: 500 }
      );
    }

    // Verify the update was successful
    const { data: updatedOrder, error: verifyError } = await supabase
      .from('orders')
      .select('execution_status, next_workflow, current_workflow, started_at')
      .eq('amazon_order_id', orderId)
      .single();

    if (verifyError) {
      console.error('[Reset Order] Failed to verify update:', verifyError);
      return NextResponse.json(
        { 
          error: 'Reset completed but verification failed',
          details: verifyError.message 
        },
        { status: 500 }
      );
    }

    console.log('[Reset Order] Order reset successfully:', {
      orderId,
      execution_status: updatedOrder.execution_status,
      next_workflow: updatedOrder.next_workflow,
      current_workflow: updatedOrder.current_workflow,
      started_at: updatedOrder.started_at
    });

    return NextResponse.json({
      success: true,
      orderId: orderId,
      nextWorkflow: nextWorkflow,
      execution_status: updatedOrder.execution_status,
      message: `Order reset successfully. Ready for router cron (next_workflow: ${nextWorkflow})`
    });

  } catch (error: any) {
    console.error('[Reset Order] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to reset order',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

