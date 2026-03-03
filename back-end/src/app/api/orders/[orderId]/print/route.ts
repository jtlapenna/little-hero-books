import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api-wrapper';
import { createValidationError, createNotFoundError } from '@/lib/error-handler';

/**
 * Queue order for 4 workflow (Print Fulfillment) via router
 * POST /api/orders/[orderId]/print
 * 
 * This endpoint queues the order for the router system instead of calling
 * the n8n webhook directly, ensuring we respect the 5-execution limit.
 */
async function sendToPrint(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // PSEUDOCODE
  // - Load order row
  // - Queue W4 via updateOrderStatus (must not depend on reprint_* columns)
  // - If lifecycle_status is recently_delivered, best-effort bump reprint_count (+ optional reason/note)
  const { orderId } = await params;

  if (!orderId || typeof orderId !== 'string') {
    throw createValidationError('Invalid order ID provided');
  }

  console.log(`[POST /api/orders/[orderId]/print] Queueing order ${orderId} for 4 workflow via router`);

  // Queue order for W4 via W1.1 router
  // IMPORTANT: Preserve review_stages when updating to avoid losing approvals
  const { updateOrderStatus } = await import('@/lib/status-service');
  const { getOrderFromSupabase, updateOrderInSupabase } = await import('@/lib/supabase-client');
  
  try {
    let body: { source?: string; reprint_reason?: string; reprint_note?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Purpose: empty/invalid JSON is fine.
      body = {};
    }

    // Get current order to preserve review_stages
    const currentOrder = await getOrderFromSupabase(orderId).catch(() => null);
    
    if (!currentOrder) {
      throw createNotFoundError(`Order ${orderId} not found`);
    }
    
    // Validate shipping address exists and has required fields
    const shippingAddress = currentOrder.shipping_address;

    if (!shippingAddress || typeof shippingAddress !== 'object') {
      throw createValidationError(
        'Order cannot be sent to print fulfillment: shipping information not yet available. ' +
        'Please upload CSV to populate customer data.'
      );
    }

    // Check for required fields (support both 'address' and 'address1' field names)
    const addressLine = shippingAddress.address || shippingAddress.address1 || shippingAddress.address_line_1;
    const city = shippingAddress.city;
    const state = shippingAddress.state;
    const zip = shippingAddress.zip || shippingAddress.postal_code;

    if (!addressLine || !city || !state || !zip) {
      throw createValidationError(
        'Order cannot be sent to print fulfillment: shipping information is incomplete. ' +
        'Required fields (address, city, state, zip) must be populated. ' +
        'Please upload CSV to populate customer data.'
      );
    }

    // Validate 3-manifest (book assembly) exists before queueing for W4
    const hasWorkflow3 = !!(
      currentOrder.manifest_3_url ||
      currentOrder.workflow_step === 'book_assembly_completed'
    );
    if (!hasWorkflow3) {
      throw createValidationError(
        'Order cannot be sent to print: book assembly (workflow 3) has not completed. 3-manifest not found.'
      );
    }
    
    const updates: any = {
      next_workflow: '4',
      execution_status: 'ready_for_processing',
      queued_at: new Date().toISOString(),
      started_at: null,
      current_workflow: null,
      error_type: null,
      error_message: null,
      // Admin "Send to Print" bypasses customer approval; set approved so cron router includes the order
      customer_approval_status: 'approved'
    };
    
    // Preserve review_stages if they exist (to maintain approvals)
    if (currentOrder.review_stages) {
      updates.review_stages = currentOrder.review_stages;
    }
    
    await updateOrderStatus(orderId, updates);

    const isReprint = String(currentOrder.lifecycle_status || '').toLowerCase() === 'recently_delivered';
    if (isReprint) {
      const currentCount = typeof currentOrder.reprint_count === 'number' ? currentOrder.reprint_count : 0;
      const reason = (body.reprint_reason || '').trim() || 'reprint_after_delivery';
      const note = (body.reprint_note || '').trim() || null;
      await updateOrderInSupabase(orderId, {
        reprint_count: currentCount + 1,
        reprint_reason: reason,
        reprint_note: note,
      });
    }

    console.log(`[POST /api/orders/[orderId]/print] ✅ Queued order ${orderId} for W4 via router`);
    
    return NextResponse.json({
      success: true,
      message: 'Order queued for print fulfillment workflow. Router will process it when capacity is available.',
      orderId,
      next_workflow: '4',
      execution_status: 'ready_for_processing',
      isReprint
    });
  } catch (error: any) {
    console.error(`[POST /api/orders/[orderId]/print] Error queueing order:`, error);
    // If it's already a NextResponse (e.g., from createNotFoundError), re-throw it
    if (error instanceof NextResponse) {
      throw error;
    }
    throw new Error(`Failed to queue order for print fulfillment workflow: ${error?.message || error}`);
  }
}

export const POST = withErrorHandling(sendToPrint);

