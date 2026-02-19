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
 * Extract tracking information from line item statuses
 */
function extractTrackingInfo(lineItemStatuses: any[]): {
  trackingNumber: string | null;
  trackingUrl: string | null;
  carrier: string | null;
} {
  if (!lineItemStatuses || lineItemStatuses.length === 0) {
    return { trackingNumber: null, trackingUrl: null, carrier: null };
  }

  // Get the first line item (usually there's only one for our use case)
  const firstItem = lineItemStatuses[0];
  
  return {
    trackingNumber: firstItem.tracking_id || firstItem.trackingId || null,
    trackingUrl: Array.isArray(firstItem.tracking_urls) 
      ? firstItem.tracking_urls[0] || null
      : firstItem.tracking_url || firstItem.trackingUrl || null,
    carrier: firstItem.carrier || null,
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

    // Extract status name
    statusName = payload.name ?? payload.status ?? null;
    if (!statusName) {
      console.error('[LULU WEBHOOK] Missing status name in payload');
      await auditLog({ printJobId, statusName: null, orderFound: false, orderId: null, updated: false, errorMessage: 'Missing status name' });
      return NextResponse.json(
        { received: true, error: 'Missing status name' },
        { status: 200, headers: corsHeaders }
      );
    }

    // Extract line item statuses
    const lineItemStatuses = payload.line_item_statuses || payload.lineItemStatuses || [];
    
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
    
    // Set shipped_at / tracking for SHIPPED or DELIVERED
    let shippingTrackingUrl: string | null = null;
    let shippingTrackingNumber: string | null = null;
    if (statusName === 'SHIPPED' || statusName === 'DELIVERED') {
      const nowIso = new Date().toISOString();
      updateData.shipped_at = nowIso;
      updateData.print_fulfillment_finished_at = nowIso;

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
    
    // Update order in database
    // Use orderId, order_id, or amazon_order_id depending on what exists
    const orderIdentifier = order.orderId || order.order_id || order.amazon_order_id;
    
    let updateError: any = null;
    
    // Try updating by orderId first
    if (order.orderId) {
      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('orderId', order.orderId);
      updateError = error;
    }
    
    // If that fails, try order_id
    if (updateError && order.order_id) {
      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('order_id', order.order_id);
      updateError = error;
    }
    
    // If that fails, try amazon_order_id
    if (updateError && order.amazon_order_id) {
      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('amazon_order_id', order.amazon_order_id);
      updateError = error;
    }
    
    if (updateError) {
      console.error('[LULU WEBHOOK] Error updating order:', updateError);
      await auditLog({ printJobId, statusName, orderFound: true, orderId: orderIdentifier, updated: false, errorMessage: updateError.message });
      return NextResponse.json(
        { received: true, error: 'Update failed', details: updateError.message },
        { status: 200, headers: corsHeaders }
      );
    }

    await auditLog({ printJobId, statusName, orderFound: true, orderId: orderIdentifier, updated: true, errorMessage: null });
    console.log(`[LULU WEBHOOK] Successfully updated order ${orderIdentifier} with status ${statusName}`);

    // Send "your book has shipped" notification when SHIPPED: D2C → email, Amazon → Message Center
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
      } else if (platform !== 'd2c') {
        // Enable if env var is 'true' OR if running in production (Vercel env var fallback)
        const shippedEnvValue = (process.env.AMAZON_SHIPPED_NOTIFICATIONS_ENABLED ?? '').trim().toLowerCase();
        const isProductionEnv = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
        const shippedNotificationsEnabled = shippedEnvValue === 'true' || isProductionEnv;
        const amazonOrderId = order.amazon_order_id ?? null;
        if (shippedNotificationsEnabled && amazonOrderId) {
          try {
            const { sendAmazonShippedMessage } = await import('@/lib/notifications/amazon-message-center');
            const result = await sendAmazonShippedMessage({
              amazonOrderId: String(amazonOrderId),
              trackingUrl: shippingTrackingUrl ?? undefined,
              trackingNumber: shippingTrackingNumber ?? undefined,
              childName: childName ?? undefined,
            });
            const logStatus = result.success ? 'sent' : 'failed';
            if (result.success) {
              console.log(`[LULU WEBHOOK] Amazon shipped message sent for order ${orderIdentifier}`);
            } else {
              console.warn(`[LULU WEBHOOK] Amazon shipped message failed for ${orderIdentifier}:`, result.error);
            }
            // Persist attempt so we can debug "worked then stopped" without Vercel logs
            await supabase.from('notification_logs').insert({
              order_id: String(orderIdentifier),
              notification_type: 'amazon_message',
              status: logStatus,
              recipient: String(amazonOrderId),
              error_message: result.error ?? null,
              sent_at: result.success ? new Date().toISOString() : null,
            });
          } catch (notifyErr: any) {
            console.warn(`[LULU WEBHOOK] Amazon shipped notification error:`, notifyErr?.message ?? notifyErr);
            await supabase.from('notification_logs').insert({
              order_id: String(orderIdentifier),
              notification_type: 'amazon_message',
              status: 'failed',
              recipient: String(amazonOrderId),
              error_message: notifyErr?.message ?? String(notifyErr),
              sent_at: null,
            });
          }
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

