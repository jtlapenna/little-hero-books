import { NextRequest, NextResponse } from 'next/server';
import { supabase, getOrderFromSupabase, updateOrderInSupabase } from '@/lib/supabase-client';
import { buildLuluOrderUpdate } from '@/lib/lulu-status-map';
import { recordLuluLifecycleWorkflowEvents } from '@/lib/workflow-jobs';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/orders/[orderId]/refresh-lulu-status
 * 
 * Fetches the latest status from Lulu API and updates the order in Supabase.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;

    if (!orderId) {
      return NextResponse.json(
        { error: 'Missing orderId' },
        { status: 400 }
      );
    }

    console.log('[Refresh Lulu Status] Looking up order:', orderId);

    // Purpose: resolve per-book row (amazon_order_id may be a sibling group key).
    const order = await getOrderFromSupabase(orderId).catch(() => null);
    if (!order) {
      console.error('[Refresh Lulu Status] Order not found for orderId:', orderId);
      return NextResponse.json(
        { error: 'Order not found', orderId, triedFields: ['amazon_order_id', 'orderId', 'order_id'] },
        { status: 404 }
      );
    }

    console.log('[Refresh Lulu Status] Found order:', {
      orderId: order.orderId || order.order_id || order.amazon_order_id,
      lulu_job_id: order.lulu_job_id,
      current_lulu_status: order.lulu_status
    });

    if (!order.lulu_job_id) {
      return NextResponse.json(
        { error: 'Order has not been submitted to Lulu yet', orderId: order.orderId || order.order_id || order.amazon_order_id },
        { status: 400 }
      );
    }

    // Get Lulu API credentials from environment (check multiple possible variable names)
    const luluClientId = process.env.LULU_CLIENT_ID || process.env.LULU_CLIENT_KEY;
    const luluClientSecret = process.env.LULU_CLIENT_SECRET || process.env.LULU_API_SECRET;
    const luluApiBase = process.env.LULU_API_BASE || 'https://api.lulu.com';

    if (!luluClientId || !luluClientSecret) {
      console.error('[Refresh Lulu Status] Missing Lulu credentials', {
        hasClientId: !!process.env.LULU_CLIENT_ID || !!process.env.LULU_CLIENT_KEY,
        hasClientSecret: !!process.env.LULU_CLIENT_SECRET || !!process.env.LULU_API_SECRET,
        checkedVars: ['LULU_CLIENT_ID', 'LULU_CLIENT_KEY', 'LULU_CLIENT_SECRET', 'LULU_API_SECRET']
      });
      return NextResponse.json(
        { 
          error: 'Lulu API credentials not configured',
          checkedVariables: ['LULU_CLIENT_ID', 'LULU_CLIENT_KEY', 'LULU_CLIENT_SECRET', 'LULU_API_SECRET']
        },
        { status: 500 }
      );
    }

    // Step 1: Get access token
    const tokenUrl = 'https://api.lulu.com/auth/realms/glasstree/protocol/openid-connect/token';
    const basicAuth = Buffer.from(`${luluClientId}:${luluClientSecret}`).toString('base64');

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[Refresh Lulu Status] Token fetch failed:', errorText);
      return NextResponse.json(
        { error: 'Failed to get Lulu access token', details: errorText },
        { status: 500 }
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'No access token in Lulu response' },
        { status: 500 }
      );
    }

    // Step 2: Get print job status from Lulu API
    const statusUrl = `${luluApiBase}/print-jobs/${order.lulu_job_id}/status/`;
    const statusResponse = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Cache-Control': 'no-cache',
      },
    });

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      console.error('[Refresh Lulu Status] Status fetch failed:', errorText);
      return NextResponse.json(
        { error: 'Failed to get Lulu print job status', details: errorText },
        { status: statusResponse.status }
      );
    }

    const statusData = await statusResponse.json();
    const newStatus = statusData.name || statusData.status || null;
    const changedAt = typeof statusData.changed === 'string'
      ? statusData.changed
      : typeof statusData.status?.changed === 'string'
        ? statusData.status.changed
        : null;
    
    console.log('[Refresh Lulu Status] Lulu API response:', {
      jobId: order.lulu_job_id,
      newStatus,
      fullResponse: statusData
    });

    // Extract tracking info if available
    const lineItemStatuses = statusData.line_item_statuses || statusData.lineItemStatuses || [];
    let trackingNumber = null;
    let trackingUrl = null;
    let carrier = null;

    if (lineItemStatuses.length > 0) {
      const firstItem = lineItemStatuses[0];
      const msgs = firstItem.messages || firstItem.status?.messages || {};
      trackingNumber = msgs.tracking_id || firstItem.tracking_id || firstItem.trackingId || null;
      const trackingUrls = msgs.tracking_urls || firstItem.tracking_urls;
      trackingUrl = Array.isArray(trackingUrls) ? trackingUrls[0] || null
        : firstItem.tracking_url || firstItem.trackingUrl || null;
      carrier = msgs.CARRIER_NAME || msgs.carrier_name || firstItem.CARRIER_NAME || firstItem.carrier_name || firstItem.carrier || null;
    }

    // Extract error message if status is REJECTED
    let errorMessage = null;
    if (newStatus === 'REJECTED' && statusData.message) {
      errorMessage = statusData.message;
    }

    // Step 3: Update order in Supabase
    const updates = buildLuluOrderUpdate({
      statusName: String(newStatus || ''),
      order,
      changedAt,
      errorMessage,
      trackingNumber,
      trackingUrl,
      carrier,
    });

    // Purpose: update per-book row safely (amazon_order_id can be a sibling group key).
    const orderRecord = order as Record<string, unknown>;
    const perBookId = orderRecord.orderId || orderRecord.order_id || orderId;
    await updateOrderInSupabase(String(perBookId), updates);
    const updatedOrder = await getOrderFromSupabase(String(perBookId)).catch(() => null);
    if (!updatedOrder) {
      return NextResponse.json(
        { error: 'Update succeeded but order could not be reloaded', orderId: String(perBookId) },
        { status: 500 }
      );
    }

    console.log('[Refresh Lulu Status] Successfully updated order:', {
      orderId: updatedOrder.orderId || updatedOrder.order_id || updatedOrder.amazon_order_id,
      oldStatus: order.lulu_status,
      newStatus
    });

    try {
      const { data: matchingOrders, error: matchingOrdersError } = await supabase
        .from('orders')
        .select('*')
        .eq('lulu_job_id', order.lulu_job_id);
      if (matchingOrdersError) {
        throw matchingOrdersError;
      }
      await recordLuluLifecycleWorkflowEvents({
        printJobId: String(order.lulu_job_id),
        statusName: String(newStatus || ''),
        changedAt,
        errorMessage,
        trackingNumber,
        trackingUrl,
        carrier,
        orders:
          Array.isArray(matchingOrders) && matchingOrders.length > 0
            ? matchingOrders
            : [updatedOrder as Record<string, unknown>],
        sourceSystem: 'admin',
        statusDetail:
          statusData && typeof statusData === 'object'
            ? (statusData as Record<string, unknown>)
            : null,
      });
    } catch (providerEventError) {
      console.error(
        '[Refresh Lulu Status] Failed to mirror provider lifecycle into workflow jobs:',
        providerEventError,
      );
    }

    // Confirm shipment in Seller Central when SHIPPED/DELIVERED and it's an Amazon order
    const orderIdentifier = updatedOrder.orderId || updatedOrder.order_id || updatedOrder.amazon_order_id;
    if ((newStatus === 'SHIPPED' || newStatus === 'DELIVERED') && order.amazon_order_id && (order.platform ?? 'amazon') !== 'd2c') {
      const { data: existingConfirm } = await supabase
        .from('notification_logs')
        .select('id')
        .eq('order_id', String(orderIdentifier))
        .eq('notification_type', 'amazon_confirm_shipment')
        .eq('status', 'sent')
        .maybeSingle();

      if (existingConfirm) {
        console.log(`[Refresh Lulu Status] Shipment already confirmed for ${orderIdentifier}`);
      } else {
        try {
          const { confirmAmazonShipment } = await import('@/lib/notifications/amazon-shipment');
          const result = await confirmAmazonShipment({
            amazonOrderId: String(order.amazon_order_id),
            order,
            trackingNumber: trackingNumber ?? undefined,
            carrier: carrier ?? undefined,
            trackingUrl: trackingUrl ?? undefined,
          });
          if (result.success) {
            console.log(`[Refresh Lulu Status] Amazon shipment confirmed for ${orderIdentifier}`);
          } else {
            console.warn(`[Refresh Lulu Status] Amazon confirmShipment failed for ${orderIdentifier}:`, result.error);
          }
          await supabase.from('notification_logs').insert({
            order_id: String(orderIdentifier),
            notification_type: 'amazon_confirm_shipment',
            status: result.success ? 'sent' : 'failed',
            recipient: String(order.amazon_order_id),
            error_message: result.error ?? null,
            sent_at: result.success ? new Date().toISOString() : null,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn('[Refresh Lulu Status] confirmShipment error:', message);
        }
      }
    }

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      luluStatus: newStatus,
      tracking: {
        trackingNumber,
        trackingUrl,
        carrier,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Refresh Lulu Status] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    );
  }
}
