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
import { buildLuluOrderUpdate } from '@/lib/lulu-status-map';

// Force dynamic rendering - this route should never be statically generated
export const dynamic = 'force-dynamic';

// CORS headers - Lulu will POST from their servers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

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
function extractTrackingInfo(lineItemStatuses: unknown[]): {
  trackingNumber: string | null;
  trackingUrl: string | null;
  carrier: string | null;
} {
  if (!lineItemStatuses || lineItemStatuses.length === 0) {
    return { trackingNumber: null, trackingUrl: null, carrier: null };
  }

  const firstItem = asRecord(lineItemStatuses[0]);
  if (!firstItem) {
    return { trackingNumber: null, trackingUrl: null, carrier: null };
  }
  const nestedStatus = asRecord(firstItem.status);
  const msgs = asRecord(firstItem.messages) || asRecord(nestedStatus?.messages) || {};

  const trackingUrls = msgs.tracking_urls ?? firstItem.tracking_urls;
  const trackingUrl = Array.isArray(trackingUrls)
    ? getString(trackingUrls[0])
    : getString(firstItem.tracking_url) || getString(firstItem.trackingUrl);
  const carrierRaw =
    getString(msgs.CARRIER_NAME) ||
    getString(msgs.carrier_name) ||
    getString(firstItem.CARRIER_NAME) ||
    getString(firstItem.carrier_name) ||
    getString(firstItem.carrier);

  // Lulu sometimes omits carrier_name for OSM. Infer from tracking URL to avoid "Other/Unknown".
  const inferredCarrier =
    typeof trackingUrl === 'string' && /osmworldwide\.com/i.test(trackingUrl)
      ? 'OSM'
      : null;

  return {
    trackingNumber:
      getString(msgs.tracking_id) ||
      getString(firstItem.tracking_id) ||
      getString(firstItem.trackingId),
    trackingUrl,
    carrier: carrierRaw || inferredCarrier,
  };
}

/**
 * Extract error details from line item statuses (for REJECTED status)
 */
function extractErrorDetails(lineItemStatuses: unknown[]): string | null {
  if (!lineItemStatuses || lineItemStatuses.length === 0) {
    return null;
  }

  const firstItem = asRecord(lineItemStatuses[0]);
  const messages = asRecord(firstItem?.messages) || {};
  
  if (getString(messages.error_message)) {
    return getString(messages.error_message);
  }
  
  if (Array.isArray(messages.errors) && messages.errors.length > 0) {
    const details = messages.errors
      .map((entry) => {
        const errorRecord = asRecord(entry);
        return getString(errorRecord?.message) || getString(errorRecord?.field);
      })
      .filter((value): value is string => Boolean(value));
    return details.length > 0 ? details.join(', ') : null;
  }
  
  return null;
}

/** Unwrap nested payload (e.g. Lulu sends { data: { print_job_id, name, ... } }) */
function unwrapPayload(raw: unknown): unknown {
  const rawRecord = asRecord(raw);
  if (!rawRecord) return raw;
  const hasId = (value: unknown) => {
    const record = asRecord(value);
    return !!record && (record.print_job_id != null || record.id != null || record.printJobId != null);
  };
  if (hasId(raw)) return raw;
  for (const key of ['data', 'body', 'event', 'payload']) {
    const inner = rawRecord[key];
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
      status_name: entry.statusName,
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
    const payload = asRecord(unwrapPayload(raw));
    if (!payload) {
      await auditLog({ printJobId: null, statusName: null, orderFound: false, orderId: null, updated: false, errorMessage: 'Invalid webhook payload' });
      return NextResponse.json(
        { received: true, error: 'Invalid webhook payload' },
        { status: 200, headers: corsHeaders }
      );
    }
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
    const lineItemStatusesRaw = payload.line_item_statuses ?? payload.lineItemStatuses ?? payload.line_items ?? [];
    const lineItemStatuses = Array.isArray(lineItemStatusesRaw) ? lineItemStatusesRaw : [];
    
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

    let shippingTrackingUrl: string | null = null;
    let shippingTrackingNumber: string | null = null;
    let shippingCarrier: string | null = null;
    if (lineItemStatuses.length > 0) {
      const trackingInfo = extractTrackingInfo(lineItemStatuses);
      shippingTrackingUrl = trackingInfo.trackingUrl;
      shippingTrackingNumber = trackingInfo.trackingNumber;
      shippingCarrier = trackingInfo.carrier;
    }

    // Handle error states
    const errorDetails = statusName === 'REJECTED' ? extractErrorDetails(lineItemStatuses) : null;
    if (statusName === 'REJECTED') {
      console.error(`[LULU WEBHOOK] REJECTED for lulu_job_id ${printJobId}:`, errorDetails);
    }
    
    if (statusName === 'CANCELED') {
      console.warn(`[LULU WEBHOOK] CANCELED for lulu_job_id ${printJobId}`);
    }

    // Update each order (per-order: do not overwrite shipped_at on DELIVERED)
    let updateCount = 0;
    for (const ord of orderList) {
      const rowUpdate = buildLuluOrderUpdate({
        statusName,
        order: ord,
        changedAt: terminalAt,
        errorMessage: errorDetails,
        trackingNumber: shippingTrackingNumber,
        trackingUrl: shippingTrackingUrl,
        carrier: shippingCarrier,
        now: nowIso,
      });
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
            carrier: shippingCarrier ?? undefined,
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
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn('[LULU WEBHOOK] confirmShipment error:', message);
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
            carrier: shippingCarrier ?? undefined,
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
        } catch (notifyErr: unknown) {
          const message = notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
          console.warn('[LULU WEBHOOK] D2C shipped notification error:', message);
        }
      }
    }

    // Always return 200 OK - Lulu expects this to acknowledge receipt
    return NextResponse.json(
      { received: true, orderId: firstOrderId, status: statusName, updated: true, ordersUpdated: updateCount },
      { status: 200, headers: corsHeaders }
    );
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[LULU WEBHOOK] Unexpected error:', error);
    await auditLog({ printJobId: printJobId ?? null, statusName: statusName ?? null, orderFound: false, orderId: null, updated: false, errorMessage: message });
    return NextResponse.json(
      { received: true, error: 'Internal server error', details: message },
      { status: 200, headers: corsHeaders }
    );
  }
}
