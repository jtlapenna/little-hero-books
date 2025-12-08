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

  console.log('[Reset Order] Starting reset for orderId:', orderId);

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Fetch full order data to determine correct next_workflow
    // Try both orderId and amazon_order_id fields since they might be different
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, amazon_order_id, orderId, next_workflow, one_manifest_url, manifest_2a_url, manifest_2b_url, manifest_3_url, workflow_step, review_stages, execution_status, current_workflow, started_at')
      .or(`amazon_order_id.eq.${orderId},orderId.eq.${orderId}`)
      .single();

    if (fetchError || !order) {
      console.error('[Reset Order] Order not found:', { orderId, fetchError });
      return NextResponse.json(
        { error: 'Order not found', details: fetchError?.message },
        { status: 404 }
      );
    }

    console.log('[Reset Order] Found order:', {
      id: order.id,
      amazon_order_id: order.amazon_order_id,
      orderId: order.orderId,
      current_execution_status: order.execution_status,
      current_workflow: order.current_workflow,
      started_at: order.started_at
    });

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

    console.log('[Reset Order] Determined next_workflow:', nextWorkflow);

    // Use the database ID for the update to ensure we update the correct record
    const updateData = {
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
    };

    console.log('[Reset Order] Updating order with:', updateData);

    // Reset order to ready_for_processing state so router cron can pick it up
    // Clear all processing/error state and set execution_status to ready_for_processing
    // Use database ID for more reliable update
    const { error: updateError, data: updateDataResult } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', order.id)
      .select('execution_status, next_workflow, current_workflow, started_at');

    if (updateError) {
      console.error('[Reset Order] Failed to update Supabase:', {
        error: updateError,
        orderId: order.id,
        updateData
      });
      return NextResponse.json(
        { 
          error: 'Failed to reset order',
          details: updateError.message 
        },
        { status: 500 }
      );
    }

    console.log('[Reset Order] Update result:', updateDataResult);

    // Use the returned data from the update, or verify if needed
    const updatedOrder = updateDataResult && updateDataResult[0] ? updateDataResult[0] : null;

    // If update didn't return data, verify separately
    if (!updatedOrder) {
      const { data: verifyData, error: verifyError } = await supabase
        .from('orders')
        .select('execution_status, next_workflow, current_workflow, started_at')
        .eq('id', order.id)
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
      
      const verifiedOrder = verifyData;

      console.log('[Reset Order] Verified order after update:', verifiedOrder);
      
      return NextResponse.json({
        success: true,
        orderId: orderId,
        nextWorkflow: nextWorkflow,
        execution_status: verifiedOrder.execution_status,
        message: `Order reset successfully. Ready for router cron (next_workflow: ${nextWorkflow})`
      });
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

