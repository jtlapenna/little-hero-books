import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { updateOrderInSupabase, getOrderFromSupabase } from '@/lib/supabase-client';
import { buildLuluOrderUpdate } from '@/lib/lulu-status-map';
import { recordLuluLifecycleWorkflowEvents } from '@/lib/workflow-jobs';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/orders/[orderId]/cancel-lulu-order
 * 
 * Cancels a Lulu print job (only if status is UNPAID).
 * Updates the order status in Supabase to CANCELED.
 */
export async function POST(
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

    // Fetch order from Supabase
    const { data: order, error: findError } = await supabase
      .from('orders')
      .select('*')
      .or(`amazon_order_id.eq.${orderId},orderId.eq.${orderId},order_id.eq.${orderId}`)
      .maybeSingle();

    if (findError) {
      console.error('[Cancel Lulu Order] Error finding order:', findError);
      return NextResponse.json(
        { error: 'Failed to find order', details: findError.message },
        { status: 500 }
      );
    }

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    if (!order.lulu_job_id) {
      return NextResponse.json(
        { error: 'Order has not been submitted to Lulu yet' },
        { status: 400 }
      );
    }

    // Check if order can be canceled (only UNPAID status allows cancellation)
    if (order.lulu_status !== 'UNPAID') {
      return NextResponse.json(
        { 
          error: `Cannot cancel order with status: ${order.lulu_status}. Only UNPAID orders can be canceled.`,
          currentStatus: order.lulu_status
        },
        { status: 400 }
      );
    }

    // Get Lulu API credentials from environment (check multiple possible variable names)
    const luluClientId = process.env.LULU_CLIENT_ID || process.env.LULU_CLIENT_KEY;
    const luluClientSecret = process.env.LULU_CLIENT_SECRET || process.env.LULU_API_SECRET;
    const luluApiBase = process.env.LULU_API_BASE || 'https://api.lulu.com';

    if (!luluClientId || !luluClientSecret) {
      console.error('[Cancel Lulu Order] Missing Lulu credentials', {
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
      console.error('[Cancel Lulu Order] Token fetch failed:', errorText);
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

    // Step 2: Cancel print job via Lulu API
    // According to Lulu API docs, cancel is done by POSTing to /print-jobs/{id}/status/ with {"name": "CANCELED"}
    const cancelUrl = `${luluApiBase}/print-jobs/${order.lulu_job_id}/status/`;
    const cancelResponse = await fetch(cancelUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({ name: 'CANCELED' }),
    });

    if (!cancelResponse.ok) {
      const errorText = await cancelResponse.text();
      console.error('[Cancel Lulu Order] Cancel failed:', errorText);
      return NextResponse.json(
        { error: 'Failed to cancel Lulu print job', details: errorText },
        { status: cancelResponse.status }
      );
    }

    const cancelData = await cancelResponse.json();

    // Step 3: Update order in Supabase
    const cancelChangedAt =
      typeof cancelData?.changed === 'string'
        ? cancelData.changed
        : typeof cancelData?.status?.changed === 'string'
          ? cancelData.status.changed
          : null;
    const updates = buildLuluOrderUpdate({
      statusName: 'CANCELED',
      order,
      changedAt: cancelChangedAt,
    });
    await updateOrderInSupabase(orderId, updates);
    const updatedOrder = await getOrderFromSupabase(orderId).catch(() => null);

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
        statusName: 'CANCELED',
        changedAt: cancelChangedAt,
        orders:
          Array.isArray(matchingOrders) && matchingOrders.length > 0
            ? matchingOrders
            : updatedOrder
              ? [updatedOrder as Record<string, unknown>]
              : [order as Record<string, unknown>],
        sourceSystem: 'admin',
        statusDetail:
          cancelData && typeof cancelData === 'object'
            ? (cancelData as Record<string, unknown>)
            : null,
      });
    } catch (providerEventError) {
      console.error(
        '[Cancel Lulu Order] Failed to mirror provider lifecycle into workflow jobs:',
        providerEventError,
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Order canceled successfully',
      order: updatedOrder,
      luluResponse: cancelData,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Cancel Lulu Order] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    );
  }
}
