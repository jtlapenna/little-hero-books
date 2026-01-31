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

export async function POST(request: NextRequest) {
  try {
    // Parse webhook payload
    const payload = await request.json();
    
    console.log('[LULU WEBHOOK] Received payload:', JSON.stringify(payload, null, 2));
    
    // Extract print job ID (Lulu may use different field names)
    const printJobId = payload.print_job_id || payload.id || payload.printJobId || null;
    if (!printJobId) {
      console.error('[LULU WEBHOOK] Missing print_job_id in payload');
      // Still return 200 - Lulu expects acknowledgment
      return NextResponse.json(
        { received: true, error: 'Missing print_job_id' },
        { status: 200, headers: corsHeaders }
      );
    }
    
    // Extract status name
    const statusName = payload.name || null;
    if (!statusName) {
      console.error('[LULU WEBHOOK] Missing status name in payload');
      return NextResponse.json(
        { received: true, error: 'Missing status name' },
        { status: 200, headers: corsHeaders }
      );
    }
    
    // Extract line item statuses
    const lineItemStatuses = payload.line_item_statuses || payload.lineItemStatuses || [];
    
    // Use Supabase client (already imported)
    
    // Find order by lulu_job_id
    // Convert printJobId to string for comparison (Lulu returns numbers, DB stores as VARCHAR)
    const printJobIdStr = String(printJobId);
    
    const { data: order, error: findError } = await supabase
      .from('orders')
      .select('*')
      .eq('lulu_job_id', printJobIdStr)
      .maybeSingle();
    
    if (findError) {
      console.error('[LULU WEBHOOK] Error finding order:', findError);
      // Still return 200 - order might not exist yet, or database error
      return NextResponse.json(
        { received: true, error: 'Order lookup failed', details: findError.message },
        { status: 200, headers: corsHeaders }
      );
    }
    
    if (!order) {
      console.warn(`[LULU WEBHOOK] Order not found for lulu_job_id: ${printJobIdStr}`);
      // Still return 200 - order might not be in our system yet
      return NextResponse.json(
        { received: true, warning: 'Order not found', printJobId: printJobIdStr },
        { status: 200, headers: corsHeaders }
      );
    }
    
    // Prepare update data
    const updateData: any = {
      lulu_status: statusName,
      updated_at: new Date().toISOString(),
    };
    
    // Extract tracking info if status is SHIPPED (used later for Amazon shipped notification)
    let shippingTrackingUrl: string | null = null;
    let shippingTrackingNumber: string | null = null;
    if (statusName === 'SHIPPED' && lineItemStatuses.length > 0) {
      const trackingInfo = extractTrackingInfo(lineItemStatuses);
      shippingTrackingUrl = trackingInfo.trackingUrl;
      shippingTrackingNumber = trackingInfo.trackingNumber;
      if (trackingInfo.trackingNumber) {
        updateData.tracking_number = trackingInfo.trackingNumber;
      }
      if (trackingInfo.trackingUrl) {
        // Database uses trackingUrl (camelCase) per schema.sql, but migration suggests tracking_url
        // Try both to be safe
        updateData.tracking_url = trackingInfo.trackingUrl;
        updateData.trackingUrl = trackingInfo.trackingUrl;
      }
      if (trackingInfo.carrier) {
        updateData.carrier = trackingInfo.carrier;
      }
      // Set shipped_at timestamp
      updateData.shipped_at = new Date().toISOString();
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
      // Still return 200 - we acknowledged receipt, even if update failed
      return NextResponse.json(
        { received: true, error: 'Update failed', details: updateError.message },
        { status: 200, headers: corsHeaders }
      );
    }
    
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
        const shippedNotificationsEnabled =
          (process.env.AMAZON_SHIPPED_NOTIFICATIONS_ENABLED ?? '').trim().toLowerCase() === 'true';
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
            if (result.success) {
              console.log(`[LULU WEBHOOK] Amazon shipped message sent for order ${orderIdentifier}`);
            } else {
              console.warn(`[LULU WEBHOOK] Amazon shipped message failed for ${orderIdentifier}:`, result.error);
            }
          } catch (notifyErr: any) {
            console.warn(`[LULU WEBHOOK] Amazon shipped notification error:`, notifyErr?.message ?? notifyErr);
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
    // Always return 200, but log the error
    console.error('[LULU WEBHOOK] Unexpected error:', error);
    return NextResponse.json(
      { 
        received: true, 
        error: 'Internal server error',
        details: error?.message || 'Unknown error'
      },
      { status: 200, headers: corsHeaders }
    );
  }
}

