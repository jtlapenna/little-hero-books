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
  const trackingUrl = Array.isArray(trackingUrls) ? trackingUrls[0] || null
    : firstItem.tracking_url || firstItem.trackingUrl || null;
  const carrierRaw = msgs.CARRIER_NAME || msgs.carrier_name || firstItem.CARRIER_NAME || firstItem.carrier_name || firstItem.carrier || null;

  // Lulu sometimes omits carrier_name for OSM. Infer from tracking URL to avoid "Other/Unknown".
  const inferredCarrier =
    typeof trackingUrl === 'string' && /osmworldwide\.com/i.test(trackingUrl)
      ? 'OSM'
      : null;

  return {
    trackingNumber: msgs.tracking_id || firstItem.tracking_id || firstItem.trackingId || null,
    trackingUrl,
    carrier: carrierRaw || inferredCarrier,
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
    
    // Find all orders with this lulu_job_id (sibling orders share one job)
    const { data: orders, error: findError } = await supabase
      .from('orders')
      .select('*')
      .eq('lulu_job_id', printJobId);

    if (findError) {
      console.error('[LULU WEBHOOK] Error finding order:', findError);
      await auditLog({ printJobId, statusName, orderFound: false, orderId: null, updated: false, errorMessage: findError.message });
      return NextResponse.json(
        { received: true, error: 'Order lookup failed', details: findError.message },
        { status: 200, headers: corsHeaders }
      );
    }

    const orderList = Array.isArray(orders) ? orders : orders ? [orders] : [];
    if (orderList.length === 0) {
      console.warn(`[LULU WEBHOOK] Order not found for lulu_job_id: ${printJobId}`);
      await auditLog({ printJobId, statusName, orderFound: false, orderId: null, updated: false, errorMessage: 'Order not found' });
      return NextResponse.json(
        { received: true, warning: 'Order not found', printJobId },
        { status: 200, headers: corsHeaders }
      );
    }

    const nowIso = new Date().toISOString();
    const changedAt =
        statusRaw && typeof statusRaw === 'object' && statusRaw.changed
          ? String(statusRaw.changed)
          : null;
    const terminalAt = changedAt || nowIso;

    const updateData: any = {
      lulu_status: statusName,
      updated_at: nowIso,
      status: LULU_TO_ORDER_STATUS[statusName] ?? 'pending_print',
    };

    let shippingTrackingUrl: string | null = null;
    let shippingTrackingNumber: string | null = null;
    if (statusName === 'SHIPPED' || statusName === 'DELIVERED') {
      updateData.print_fulfillment_finished_at = terminalAt;
      updateData.workflow_step = 'done';
      updateData.execution_status = 'done';
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
      console.error(`[LULU WEBHOOK] REJECTED for lulu_job_id ${printJobId}:`, errorDetails);
      // Error details could be stored in a separate field if needed
      // For now, we just log it and set the status
    }
    
    if (statusName === 'CANCELED') {
      console.warn(`[LULU WEBHOOK] CANCELED for lulu_job_id ${printJobId}`);
    }

    // Update each order (per-order: do not overwrite shipped_at on DELIVERED)
    let updateCount = 0;
    for (const ord of orderList) {
      const rowUpdate = { ...updateData };
      if (statusName === 'SHIPPED') {
        if (!ord.shipped_at) rowUpdate.shipped_at = terminalAt;
        if (!ord.delivered_at) rowUpdate.delivered_at = terminalAt;
      }
      if (statusName === 'DELIVERED') {
        if (!ord.delivered_at) rowUpdate.delivered_at = terminalAt;
        rowUpdate.lifecycle_status = 'recently_delivered';
        rowUpdate.assumed_delivered_at = terminalAt;
      }
      const { error: updateErr } = await supabase.from('orders').update(rowUpdate).eq('id', ord.id);
      if (updateErr) {
        console.error('[LULU WEBHOOK] Error updating order', ord.orderId || ord.order_id || ord.amazon_order_id, updateErr.message);
        continue;
      }
      updateCount++;
    }

    const firstOrderId = orderList[0].orderId || orderList[0].order_id || orderList[0].amazon_order_id;
    await auditLog({ printJobId, statusName, orderFound: true, orderId: firstOrderId, updated: updateCount > 0, errorMessage: updateCount < orderList.length ? `Updated ${updateCount}/${orderList.length}` : null });
    console.log(`[LULU WEBHOOK] Updated ${updateCount} order(s) for lulu_job_id ${printJobId} with status ${statusName}`);

    // Confirm shipment in Seller Central: once per distinct Amazon order (siblings share one Lulu job)
    if (statusName === 'SHIPPED' || statusName === 'DELIVERED') {
      const amazonOrders = orderList.filter((o) => (o.platform ?? 'amazon') !== 'd2c' && o.amazon_order_id);
      const byAmazonOrderId = new Map<string, typeof orderList>();
      for (const o of amazonOrders) {
        const aid = String(o.amazon_order_id);
        if (!byAmazonOrderId.has(aid)) byAmazonOrderId.set(aid, []);
        byAmazonOrderId.get(aid)!.push(o);
      }
      for (const [amazonOrderId, orders] of byAmazonOrderId) {
        const { data: existingConfirm } = await supabase
          .from('notification_logs')
          .select('id')
          .eq('order_id', amazonOrderId)
          .eq('notification_type', 'amazon_confirm_shipment')
          .eq('status', 'sent')
          .maybeSingle();
        if (existingConfirm) {
          console.log(`[LULU WEBHOOK] Shipment already confirmed for ${amazonOrderId}, skipping`);
          continue;
        }
        const order = orders[0];
        try {
          const { confirmAmazonShipment } = await import('@/lib/notifications/amazon-shipment');
          const result = await confirmAmazonShipment({
            amazonOrderId,
            order,
            trackingNumber: shippingTrackingNumber ?? undefined,
            carrier: updateData.carrier ?? undefined,
            trackingUrl: shippingTrackingUrl ?? undefined,
          });
          await supabase.from('notification_logs').insert({
            order_id: amazonOrderId,
            notification_type: 'amazon_confirm_shipment',
            status: result.success ? 'sent' : 'failed',
            recipient: amazonOrderId,
            error_message: result.error ?? null,
            sent_at: result.success ? new Date().toISOString() : null,
          });
          if (result.success) console.log(`[LULU WEBHOOK] Amazon shipment confirmed for ${amazonOrderId}`);
          else console.warn(`[LULU WEBHOOK] Amazon confirmShipment failed for ${amazonOrderId}:`, result.error);
        } catch (err: any) {
          console.warn('[LULU WEBHOOK] confirmShipment error:', err?.message ?? err);
        }
      }
    }

    // D2C shipped email: one per D2C order row with customer_email
    if (statusName === 'SHIPPED' || statusName === 'DELIVERED') {
      for (const ord of orderList) {
        if ((ord.platform ?? 'amazon') !== 'd2c' || !ord.customer_email?.trim()) continue;
        const orderIdForLog = ord.order_id ?? ord.orderId ?? String(ord.id);
        const { data: existingSent } = await supabase
          .from('notification_logs')
          .select('id')
          .eq('order_id', String(orderIdForLog))
          .eq('notification_type', 'd2c_shipped_email')
          .eq('status', 'sent')
          .maybeSingle();
        if (existingSent) continue;
        try {
          const { sendD2CShippedEmail } = await import('@/lib/notifications/d2c-email');
          const childName = ord.character_specs?.childName ?? ord.character_specs?.child_name ?? undefined;
          const result = await sendD2CShippedEmail({
            to: ord.customer_email.trim(),
            childName: childName ?? undefined,
            trackingUrl: shippingTrackingUrl ?? undefined,
            trackingNumber: shippingTrackingNumber ?? undefined,
            carrier: updateData.carrier ?? undefined,
            orderId: orderIdForLog,
          });
          await supabase.from('notification_logs').insert({
            order_id: String(orderIdForLog),
            notification_type: 'd2c_shipped_email',
            status: result.success ? 'sent' : 'failed',
            recipient: ord.customer_email.trim(),
            error_message: result.error ?? null,
            sent_at: result.success ? new Date().toISOString() : null,
          });
          if (result.success) console.log(`[LULU WEBHOOK] D2C shipped email sent for order ${orderIdForLog}`);
          else console.warn(`[LULU WEBHOOK] D2C shipped email failed for ${orderIdForLog}:`, result.error);
        } catch (notifyErr: any) {
          console.warn('[LULU WEBHOOK] D2C shipped notification error:', notifyErr?.message ?? notifyErr);
        }
      }
    }

    // Always return 200 OK - Lulu expects this to acknowledge receipt
    return NextResponse.json(
      { received: true, orderId: firstOrderId, status: statusName, updated: true, ordersUpdated: updateCount },
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

