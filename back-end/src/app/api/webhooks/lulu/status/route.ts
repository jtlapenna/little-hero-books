/**
 * Lulu Webhook Endpoint
 * 
 * POST /api/webhooks/lulu/status
 * 
 * Receives status updates from Lulu's API when print job status changes.
 * Updates the database with the new status, tracking information, etc.
 * 
 * IMPORTANT: Always returns 200 OK (even on errors) - Lulu expects 200 to acknowledge receipt.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { LULU_TO_ORDER_STATUS } from '@/lib/lulu-status-map';

// Force dynamic rendering - this route should never be statically generated
export const dynamic = 'force-dynamic';

// CORS headers - Lulu will POST from their servers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

/**
 * Extract tracking information from line item statuses.
 * Lulu nests tracking data under `messages` (status endpoint) or `status.messages` (print job detail).
 */
function extractTrackingInfo(lineItemStatuses: any[]): {
  trackingNumber: string | null;
  trackingUrl: string | null;
  carrier: string | null;
} {
  if (!lineItemStatuses || lineItemStatuses.length === 0) {
    return { trackingNumber: null, trackingUrl: null, carrier: null };
  }

  const firstItem = lineItemStatuses[0];
  const msgs = firstItem.messages || firstItem.status?.messages || {};

  const trackingUrls = msgs.tracking_urls || firstItem.tracking_urls;

  return {
    trackingNumber: msgs.tracking_id || firstItem.tracking_id || firstItem.trackingId || null,
    trackingUrl: Array.isArray(trackingUrls) ? trackingUrls[0] || null
      : firstItem.tracking_url || firstItem.trackingUrl || null,
    carrier: msgs.carrier_name || firstItem.carrier_name || firstItem.carrier || null,
  };
}

/**
 * Extract error details from line item statuses (for REJECTED status)
 */
function extractErrorDetails(lineItemStatuses: any[]): string | null {
  if (!lineItemStatuses || lineItemStatuses.length === 0) {
    return null;
  }

  const firstItem = lineItemStatuses[0];
  const messages = firstItem.messages || {};
  
  if (messages.error_message) {
    return messages.error_message;
  }
  
  if (Array.isArray(messages.errors) && messages.errors.length > 0) {
    return messages.errors.map((e: any) => e.message || e.field).join(', ');
  }
  
  return null;
}

/** Unwrap nested payload (e.g. Lulu sends { data: { print_job_id, name, ... } }) */
function unwrapPayload(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw;
  const hasId = (o: any) => o && typeof o === 'object' && (o.print_job_id != null || o.id != null || o.printJobId != null);
  if (hasId(raw)) return raw;
  for (const key of ['data', 'body', 'event', 'payload']) {
    const inner = raw[key];
    if (hasId(inner)) return inner;
  }
  return raw;
}

/** Write one row to lulu_webhook_log so we can see if webhooks are reaching us (no reliance on Vercel logs). */
async function auditLog(entry: {
  printJobId: string | null;
  statusName: string | null;
  orderFound: boolean;
  orderId: string | null;
  updated: boolean;
  errorMessage: string | null;
}) {
  try {
    await supabase.from('lulu_webhook_log').insert({
      print_job_id: entry.printJobId,
      status_name: typeof entry.statusName === 'object' ? JSON.stringify(entry.statusName) : entry.statusName,
      order_found: entry.orderFound,
      order_id: entry.orderId,
      updated: entry.updated,
      error_message: entry.errorMessage,
    });
  } catch (e) {
    console.error('[LULU WEBHOOK] Audit log insert failed:', e);
  }
}

export async function POST(request: NextRequest) {
  let printJobId: string | null = null;
  let statusName: string | null = null;
  try {
    // Parse and unwrap (Lulu may send nested payload)
    const raw = await request.json();
    const payload = unwrapPayload(raw);
    console.log('[LULU WEBHOOK] Received payload:', JSON.stringify(payload, null, 2));

    // Extract print job ID (Lulu may use different field names)
    const printJobIdVal = payload.print_job_id ?? payload.id ?? payload.printJobId ?? null;
    if (!printJobIdVal) {
      console.error('[LULU WEBHOOK] Missing print_job_id in payload');
      await auditLog({ printJobId: null, statusName: null, orderFound: false, orderId: null, updated: false, errorMessage: 'Missing print_job_id' });
      return NextResponse.json(
        { received: true, error: 'Missing print_job_id' },
        { status: 200, headers: corsHeaders }
      );
    }
    printJobId = String(printJobIdVal);

    // Extract status name — Lulu sends status as object { name, changed, message }
    const statusRaw = payload.name ?? payload.status ?? null;
    statusName = (statusRaw && typeof statusRaw === 'object' && statusRaw.name)
      ? String(statusRaw.name)
      : statusRaw ? String(statusRaw) : null;
    if (!statusName) {
      console.error('[LULU WEBHOOK] Missing status name in payload');
      await auditLog({ printJobId, statusName: null, orderFound: false, orderId: null, updated: false, errorMessage: 'Missing status name' });
      return NextResponse.json(
        { received: true, error: 'Missing status name' },
        { status: 200, headers: corsHeaders }
      );
    }

    // Extract line item statuses — webhook sends print job detail (`line_items`) not status endpoint format (`line_item_statuses`)
    const lineItemStatuses = payload.line_item_statuses || payload.lineItemStatuses || payload.line_items || [];
    
    // Find order by lulu_job_id (printJobId already string)
    const { data: order, error: findError } = await supabase
      .from('orders')
      .select('*')
      .eq('lulu_job_id', printJobId)
      .maybeSingle();

    if (findError) {
      console.error('[LULU WEBHOOK] Error finding order:', findError);
      await auditLog({ printJobId, statusName, orderFound: false, orderId: null, updated: false, errorMessage: findError.message });
      return NextResponse.json(
        { received: true, error: 'Order lookup failed', details: findError.message },
        { status: 200, headers: corsHeaders }
      );
    }

    if (!order) {
      console.warn(`[LULU WEBHOOK] Order not found for lulu_job_id: ${printJobId}`);
      await auditLog({ printJobId, statusName, orderFound: false, orderId: null, updated: false, errorMessage: 'Order not found' });
      return NextResponse.json(
        { received: true, warning: 'Order not found', printJobId },
        { status: 200, headers: corsHeaders }
      );
    }
    
    // Prepare update data
    const updateData: any = {
      lulu_status: statusName,
      updated_at: new Date().toISOString(),
    };
    
    // Set shipped_at / delivered_at / tracking for terminal shipping statuses.
    let shippingTrackingUrl: string | null = null;
    let shippingTrackingNumber: string | null = null;
    if (statusName === 'SHIPPED' || statusName === 'DELIVERED') {
      const nowIso = new Date().toISOString();
      const changedAt =
        statusRaw && typeof statusRaw === 'object' && statusRaw.changed
          ? String(statusRaw.changed)
          : null;
      const terminalAt = changedAt || nowIso;

      // CRITICAL: never overwrite shipped_at on DELIVERED.
      // If we overwrite shipped_at at delivery time, lifecycle + “recently delivered” logic uses the wrong ship date.
      if (statusName === 'SHIPPED' && !order.shipped_at) {
        updateData.shipped_at = terminalAt;
      }
      if (statusName === 'DELIVERED') {
        // Store an explicit delivery timestamp if the column exists (it does in Supabase schema).
        if (!order.delivered_at) {
          updateData.delivered_at = terminalAt;
        }
        // Move out of active immediately when Lulu says DELIVERED (do not wait for assumed delivery window).
        updateData.lifecycle_status = 'recently_delivered';
        updateData.assumed_delivered_at = terminalAt;
      }

      // print_fulfillment_finished_at should reflect the terminal event time (ship or delivery).
      updateData.print_fulfillment_finished_at = terminalAt;

      if (lineItemStatuses.length > 0) {
        const trackingInfo = extractTrackingInfo(lineItemStatuses);
        shippingTrackingUrl = trackingInfo.trackingUrl;
        shippingTrackingNumber = trackingInfo.trackingNumber;
        if (trackingInfo.trackingNumber) updateData.tracking_number = trackingInfo.trackingNumber;
        if (trackingInfo.trackingUrl) updateData.tracking_url = trackingInfo.trackingUrl;
        if (trackingInfo.carrier) updateData.carrier = trackingInfo.carrier;
      }
    }
    
    // Handle error states
    if (statusName === 'REJECTED') {
      const errorDetails = extractErrorDetails(lineItemStatuses);
      console.error(`[LULU WEBHOOK] Order ${order.orderId || order.order_id || order.amazon_order_id} REJECTED:`, errorDetails);
      // Error details could be stored in a separate field if needed
      // For now, we just log it and set the status
    }
    
    if (statusName === 'CANCELED') {
      console.warn(`[LULU WEBHOOK] Order ${order.orderId || order.order_id || order.amazon_order_id} CANCELED`);
    }

    // Recalculate display status from Lulu status
    updateData.status = LULU_TO_ORDER_STATUS[statusName] ?? 'pending_print';

    if (statusName === 'SHIPPED' || statusName === 'DELIVERED') {
      updateData.workflow_step = 'done';
      updateData.execution_status = 'done';
    }
    
    // Update order in database
    // Use orderId, order_id, or amazon_order_id depending on what exists
    const orderIdentifier = order.orderId || order.order_id || order.amazon_order_id;

    const { error: updateErr } = await supabase.from('orders').update(updateData).eq('id', order.id);
    if (updateErr) {
      console.error('[LULU WEBHOOK] Error updating order:', updateErr.message);
      await auditLog({ printJobId, statusName, orderFound: true, orderId: orderIdentifier, updated: false, errorMessage: updateErr.message });
      return NextResponse.json(
        { received: true, error: 'Update failed', details: updateErr.message },
        { status: 200, headers: corsHeaders }
      );
    }

    await auditLog({ printJobId, statusName, orderFound: true, orderId: orderIdentifier, updated: true, errorMessage: null });
    console.log(`[LULU WEBHOOK] Successfully updated order ${orderIdentifier} with status ${statusName}`);

    // Confirm shipment in Seller Central (gives buyer tracking via Amazon's built-in email)
    if (statusName === 'SHIPPED' || statusName === 'DELIVERED') {
      const platform = (order.platform ?? 'amazon') as string;
      const amazonOrderId = order.amazon_order_id ?? null;
      if (platform !== 'd2c' && amazonOrderId) {
        const { data: existingConfirm } = await supabase
          .from('notification_logs')
          .select('id')
          .eq('order_id', String(orderIdentifier))
          .eq('notification_type', 'amazon_confirm_shipment')
          .eq('status', 'sent')
          .maybeSingle();

        if (existingConfirm) {
          console.log(`[LULU WEBHOOK] Shipment already confirmed for ${orderIdentifier}, skipping`);
        } else {
          try {
            const { confirmAmazonShipment } = await import('@/lib/notifications/amazon-shipment');
            const result = await confirmAmazonShipment({
              amazonOrderId: String(amazonOrderId),
              order,
              trackingNumber: shippingTrackingNumber ?? undefined,
              carrier: updateData.carrier ?? undefined,
              trackingUrl: shippingTrackingUrl ?? undefined,
            });
            if (result.success) {
              console.log(`[LULU WEBHOOK] Amazon shipment confirmed for ${orderIdentifier}`);
            } else {
              console.warn(`[LULU WEBHOOK] Amazon confirmShipment failed for ${orderIdentifier}:`, result.error);
            }
            await supabase.from('notification_logs').insert({
              order_id: String(orderIdentifier),
              notification_type: 'amazon_confirm_shipment',
              status: result.success ? 'sent' : 'failed',
              recipient: String(amazonOrderId),
              error_message: result.error ?? null,
              sent_at: result.success ? new Date().toISOString() : null,
            });
          } catch (err: any) {
            console.warn('[LULU WEBHOOK] confirmShipment error:', err?.message ?? err);
          }
        }
      }
    }

    // D2C shipped email (Amazon orders use confirmShipment above which triggers Amazon's built-in email)
    if (statusName === 'SHIPPED') {
      const platform = (order.platform ?? 'amazon') as string;
      const childName =
        order.character_specs?.childName ?? order.character_specs?.child_name ?? undefined;
      if (platform === 'd2c' && order.customer_email?.trim()) {
        try {
          const { sendD2CShippedEmail } = await import('@/lib/notifications/d2c-email');
          const result = await sendD2CShippedEmail({
            to: order.customer_email.trim(),
            childName: childName ?? undefined,
            trackingUrl: shippingTrackingUrl ?? undefined,
            trackingNumber: shippingTrackingNumber ?? undefined,
            carrier: updateData.carrier ?? undefined,
            orderId: orderIdentifier,
          });
          if (result.success) {
            console.log(`[LULU WEBHOOK] D2C shipped email sent for order ${orderIdentifier}`);
          } else {
            console.warn(`[LULU WEBHOOK] D2C shipped email failed for ${orderIdentifier}:`, result.error);
          }
        } catch (notifyErr: any) {
          console.warn(`[LULU WEBHOOK] D2C shipped notification error:`, notifyErr?.message ?? notifyErr);
        }
      }
    }

    // Always return 200 OK - Lulu expects this to acknowledge receipt
    return NextResponse.json(
      { 
        received: true, 
        orderId: orderIdentifier,
        status: statusName,
        updated: true 
      },
      { status: 200, headers: corsHeaders }
    );
    
  } catch (error: any) {
    console.error('[LULU WEBHOOK] Unexpected error:', error);
    await auditLog({ printJobId: printJobId ?? null, statusName: statusName ?? null, orderFound: false, orderId: null, updated: false, errorMessage: error?.message || 'Unknown error' });
    return NextResponse.json(
      { received: true, error: 'Internal server error', details: error?.message || 'Unknown error' },
      { status: 200, headers: corsHeaders }
    );
  }
}

