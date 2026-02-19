import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { LULU_TO_ORDER_STATUS } from '@/lib/lulu-status-map';

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

    // Fetch order from Supabase - try multiple identifier fields
    let order = null;
    let findError = null;
    
    // Try amazon_order_id first (most common)
    const result1 = await supabase
      .from('orders')
      .select('*')
      .eq('amazon_order_id', orderId)
      .maybeSingle();
    
    if (result1.data) {
      order = result1.data;
    } else if (result1.error && result1.error.code !== 'PGRST116') {
      findError = result1.error;
    } else {
      // Try orderId (camelCase)
      const result2 = await supabase
        .from('orders')
        .select('*')
        .eq('orderId', orderId)
        .maybeSingle();
      
      if (result2.data) {
        order = result2.data;
      } else if (result2.error && result2.error.code !== 'PGRST116') {
        findError = result2.error;
      } else {
        // Try order_id (snake_case)
        const result3 = await supabase
          .from('orders')
          .select('*')
          .eq('order_id', orderId)
          .maybeSingle();
        
        if (result3.data) {
          order = result3.data;
        } else {
          findError = result3.error;
        }
      }
    }

    if (findError) {
      console.error('[Refresh Lulu Status] Error finding order:', findError);
      return NextResponse.json(
        { error: 'Failed to find order', details: findError.message },
        { status: 500 }
      );
    }

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
      carrier = msgs.carrier_name || firstItem.carrier_name || firstItem.carrier || null;
    }

    // Extract error message if status is REJECTED
    let errorMessage = null;
    if (newStatus === 'REJECTED' && statusData.message) {
      errorMessage = statusData.message;
    }

    // Step 3: Update order in Supabase
    const updates: any = {
      lulu_status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (trackingNumber) {
      updates.tracking_number = trackingNumber;
    }
    if (trackingUrl) {
      updates.tracking_url = trackingUrl;
    }
    if (carrier) {
      updates.carrier = carrier;
    }
    // When SHIPPED or DELIVERED, set timestamps so manual refresh matches webhook behavior
    if (newStatus === 'SHIPPED' || newStatus === 'DELIVERED') {
      const now = new Date().toISOString();
      updates.shipped_at = now;
      updates.print_fulfillment_finished_at = now;
    }

    // Handle error messages based on status
    if (newStatus === 'REJECTED' && errorMessage) {
      updates.error_message = errorMessage;
      updates.error_type = 'lulu_rejected';
    } else if (newStatus === 'CANCELED') {
      updates.error_message = null;
      updates.error_type = null;
    }

    // Recalculate display status from Lulu status
    if (newStatus) {
      updates.status = LULU_TO_ORDER_STATUS[newStatus] ?? 'pending_print';
      if (newStatus === 'SHIPPED' || newStatus === 'DELIVERED') {
        updates.workflow_step = 'done';
        updates.execution_status = 'done';
      }
    }

    // Update using the identifier that was used to find the order
    // Try multiple fields to ensure we update correctly
    let updatedOrder = null;
    let updateError = null;
    
    // Try updating by amazon_order_id first (if it exists)
    if (order.amazon_order_id) {
      const result1 = await supabase
        .from('orders')
        .update(updates)
        .eq('amazon_order_id', order.amazon_order_id)
        .select()
        .single();
      
      if (!result1.error) {
        updatedOrder = result1.data;
      } else {
        updateError = result1.error;
      }
    }
    
    // If that didn't work or amazon_order_id doesn't exist, try orderId
    if (!updatedOrder && order.orderId) {
      const result2 = await supabase
        .from('orders')
        .update(updates)
        .eq('orderId', order.orderId)
        .select()
        .single();
      
      if (!result2.error) {
        updatedOrder = result2.data;
        updateError = null;
      } else {
        updateError = result2.error;
      }
    }
    
    // If that didn't work, try order_id
    if (!updatedOrder && order.order_id) {
      const result3 = await supabase
        .from('orders')
        .update(updates)
        .eq('order_id', order.order_id)
        .select()
        .single();
      
      if (!result3.error) {
        updatedOrder = result3.data;
        updateError = null;
      } else {
        updateError = result3.error;
      }
    }
    
    // Last resort: try by id if it exists
    if (!updatedOrder && order.id) {
      const result4 = await supabase
        .from('orders')
        .update(updates)
        .eq('id', order.id)
        .select()
        .single();
      
      if (!result4.error) {
        updatedOrder = result4.data;
        updateError = null;
      } else {
        updateError = result4.error;
      }
    }

    if (updateError) {
      console.error('[Refresh Lulu Status] Update failed:', {
        error: updateError,
        orderId,
        orderIdentifier: order.amazon_order_id || order.orderId || order.order_id,
        updates
      });
      return NextResponse.json(
        { 
          error: 'Failed to update order', 
          details: updateError.message,
          orderId,
          triedFields: ['amazon_order_id', 'orderId', 'order_id', 'id']
        },
        { status: 500 }
      );
    }

    if (!updatedOrder) {
      console.error('[Refresh Lulu Status] Update returned no data:', {
        orderId,
        orderIdentifier: order.amazon_order_id || order.orderId || order.order_id
      });
      return NextResponse.json(
        { 
          error: 'Update succeeded but no order data returned',
          orderId
        },
        { status: 500 }
      );
    }

    console.log('[Refresh Lulu Status] Successfully updated order:', {
      orderId: updatedOrder.orderId || updatedOrder.order_id || updatedOrder.amazon_order_id,
      oldStatus: order.lulu_status,
      newStatus
    });

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
        } catch (err: any) {
          console.warn('[Refresh Lulu Status] confirmShipment error:', err?.message ?? err);
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
  } catch (error: any) {
    console.error('[Refresh Lulu Status] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

