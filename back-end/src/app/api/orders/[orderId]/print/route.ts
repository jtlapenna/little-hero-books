import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api-wrapper';
import { createValidationError, createNotFoundError } from '@/lib/error-handler';
import { supabase } from '@/lib/supabase-client';

/**
 * Update an order row while tolerating optional-column drift between environments.
 * If PostgREST reports an unknown column, drop it and retry.
 */
async function updateOrderRowResilientById(orderRowId: number, updateData: Record<string, unknown>) {
  const dataToUpdate: Record<string, unknown> = { ...updateData };
  let lastError: unknown = null;

  for (let i = 0; i < 8; i++) {
    const { data, error } = await supabase
      .from('orders')
      .update(dataToUpdate)
      .eq('id', orderRowId)
      .select('id');

    if (!error) {
      if (!data || data.length === 0) {
        throw new Error(`Order not found for update (id=${orderRowId})`);
      }
      return;
    }

    lastError = error;
    const msg = String(error?.message || '');
    const details = String(error?.details || '');
    const code = String(error?.code || '');
    const combined = `${msg}\n${details}`.toLowerCase();

    const isUnknownColumn =
      code === 'PGRST204' ||
      code === '42703' ||
      (combined.includes('could not find the') && combined.includes('column')) ||
      (combined.includes('column') && combined.includes('does not exist'));
    if (!isUnknownColumn) break;

    const match =
      msg.match(/'([^']+)' column/i) ||
      details.match(/'([^']+)' column/i) ||
      msg.match(/column\s+[\w.]+\.([\w_]+)\s+does not exist/i) ||
      details.match(/column\s+[\w.]+\.([\w_]+)\s+does not exist/i);
    const missingColumn = match?.[1];
    if (!missingColumn || !(missingColumn in dataToUpdate)) break;

    console.warn(`[POST /api/orders/[orderId]/print] Dropping missing column and retrying: ${missingColumn}`);
    delete dataToUpdate[missingColumn];
  }

  throw lastError || new Error('Failed to update order (unknown error)');
}

async function updateOrderStatusResilient(
  orderRowId: number,
  orderLookupId: string,
  updates: Record<string, unknown>
) {
  const { calculateOrderStatus } = await import('@/lib/status-service');

  await updateOrderRowResilientById(orderRowId, {
    ...updates,
    updated_at: new Date().toISOString(),
  });

  const calculatedStatus = await calculateOrderStatus(orderLookupId);

  if (updates.status !== calculatedStatus) {
    await updateOrderRowResilientById(orderRowId, {
      status: calculatedStatus,
      updated_at: new Date().toISOString(),
    });
  }
}

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

    const orderRowId = Number((currentOrder as { id?: unknown }).id);
    if (!Number.isFinite(orderRowId)) {
      throw new Error(`Order ${orderId} is missing numeric id; cannot queue print safely`);
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
    
    const updates: Record<string, unknown> = {
      next_workflow: '4',
      execution_status: 'ready_for_processing',
      status: 'queued_for_processing',
      queued_at: new Date().toISOString(),
      started_at: null,
      current_workflow: null,
      error_type: null,
      error_message: null,
      lulu_job_id: null,
      lulu_status: null,
      lulu_cost: null,
      lulu_estimated_ship_date: null,
      lulu_tracking_number: null,
      lulu_tracking_url: null,
      lulu_carrier: null,
      printFulfillmentStatus: null,
      printFulfillmentStartedAt: null,
      printFulfillmentFinishedAt: null,
      // Admin "Send to Print" bypasses customer approval; set approved so cron router includes the order
      customer_approval_status: 'approved'
    };
    
    // Preserve review_stages if they exist (to maintain approvals)
    if (currentOrder.review_stages) {
      updates.review_stages = currentOrder.review_stages;
    }
    
    await updateOrderStatusResilient(orderRowId, orderId, updates);

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
  } catch (error: unknown) {
    console.error(`[POST /api/orders/[orderId]/print] Error queueing order:`, error);
    // If it's already a NextResponse (e.g., from createNotFoundError), re-throw it
    if (error instanceof NextResponse) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to queue order for print fulfillment workflow: ${message}`);
  }
}

export const POST = withErrorHandling(sendToPrint);
