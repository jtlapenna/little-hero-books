/**
 * API Route: Get Order Status
 * 
 * GET /api/preview/[orderId]/status
 * 
 * Returns current order status including Lulu status for customer-facing display.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import { supabase } from '@/lib/supabase-client';
import { LuluStatus } from '@/constants/statuses';

/**
 * Resolve order ID from either short format (LH-XXXXX) or full UUID
 * Returns the full UUID for database lookup
 */
async function resolveOrderId(inputId: string): Promise<string | null> {
  // Check if it's a short format (LH-XXXXX)
  if (inputId.toUpperCase().startsWith('LH-')) {
    const shortId = inputId.toUpperCase();
    // Query by display_order_id (DB column is "orderId")
    const { data, error } = await supabase
      .from('orders')
      .select('orderId')
      .eq('display_order_id', shortId)
      .single();

    if (error || !data) {
      // Fallback: try matching by first 5 chars of orderId
      const prefix = shortId.substring(3).toLowerCase(); // Remove 'LH-' and lowercase
      const { data: fallbackData } = await supabase
        .from('orders')
        .select('orderId')
        .ilike('orderId', `${prefix}%`)
        .limit(1)
        .single();

      return fallbackData?.orderId ?? fallbackData?.order_id ?? null;
    }
    return data.orderId ?? data.order_id ?? null;
  }
  
  // Already a full UUID
  return inputId;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
 * Map Lulu status to customer-friendly message
 */
function getCustomerStatusMessage(luluStatus: string | null, orderStatus: string | null): {
  short: string;
  long: string;
  icon: string;
  color: string;
} {
  // Simplified customer-facing status flow
  // We only show statuses that are relevant to customers
  // Internal statuses (payment, order received, etc.) are handled automatically

  // If we have Lulu status, use that
  if (luluStatus) {
    switch (luluStatus) {
      // Customer-visible statuses (simplified flow)
      // All pre-production statuses show as "Preparing for Print"
      case 'CREATED':
      case 'UNPAID':
      case 'PAYMENT_IN_PROGRESS':
      case 'PRODUCTION_DELAYED':
      case 'PRODUCTION_READY':
        // All pre-production statuses show as "Preparing for Print"
        // (payment, order received, etc. are handled automatically)
        return {
          short: 'Preparing for Print',
          long: 'Your order is being prepared for printing.',
          icon: '⏳',
          color: 'blue'
        };
      
      case 'IN_PRODUCTION':
        return {
          short: 'Printing Your Book',
          long: 'Your book is currently being printed.',
          icon: '🖨️',
          color: 'indigo'
        };
      
      case 'SHIPPED':
        return {
          short: 'Shipped',
          long: 'Your book has been shipped!',
          icon: '📮',
          color: 'green'
        };
      
      case 'DELIVERED':
        return {
          short: 'Delivered',
          long: 'Your book has been delivered!',
          icon: '✅',
          color: 'green'
        };
      
      // Error states - Lulu will notify us via webhook or status API
      case 'REJECTED':
      case 'ACTION_REQUIRED':
        return {
          short: 'Action Required',
          long: 'There is an issue with your order. We\'ll contact you shortly.',
          icon: '⚠️',
          color: 'red'
        };
      
      case 'CANCELED':
        return {
          short: 'Canceled',
          long: 'Your order has been canceled.',
          icon: '❌',
          color: 'gray'
        };
      
      default:
        // Unknown Lulu status - show preparing (safer than showing error)
        return {
          short: 'Preparing for Print',
          long: 'Your order is being prepared for printing.',
          icon: '⏳',
          color: 'blue'
        };
    }
  }

  // Fallback to order status if no Lulu status yet
  // After approval, show "Preparing for Print" until Lulu status is available
  if (orderStatus === 'customer_approved' || orderStatus === 'pending_print') {
    return {
      short: 'Preparing for Print',
      long: 'Your order is being prepared for printing.',
      icon: '⏳',
      color: 'blue'
    };
  }

  // Default fallback
  return {
    short: 'Preparing for Print',
    long: 'Your order is being prepared for printing.',
    icon: '⏳',
    color: 'blue'
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const { orderId: inputOrderId } = params;

    if (!inputOrderId) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { 
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // Resolve short format (LH-XXXXX) to full UUID if needed
    const orderId = await resolveOrderId(inputOrderId);
    if (!orderId) {
      return NextResponse.json(
        { error: 'Order not found' },
        { 
          status: 404,
          headers: corsHeaders,
        }
      );
    }

    // Get order from Supabase
    const order = await getOrderFromSupabase(orderId);

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { 
          status: 404,
          headers: corsHeaders,
        }
      );
    }

    // Optional email verification: if client sends email, must match order (404 on mismatch)
    const emailParam = request.nextUrl.searchParams.get('email')?.trim();
    if (emailParam) {
      const customerEmail = (order as any).customer_email ?? (order as any).customerEmail;
      if (!customerEmail || customerEmail.toLowerCase() !== emailParam.toLowerCase()) {
        return NextResponse.json(
          { error: 'Order not found' },
          { status: 404, headers: corsHeaders }
        );
      }
    }

    // Get status message
    // Check both camelCase and snake_case for luluStatus
    const luluStatus = order.luluStatus || (order as any).lulu_status || null;
    const orderStatus = order.status || null;
    const statusInfo = getCustomerStatusMessage(luluStatus, orderStatus);

    // Extract tracking info from order data
    // Check multiple possible field names (database might use snake_case or camelCase)
    const trackingNumber = (order as any).trackingNumber || (order as any).tracking_number || null;
    const trackingUrl = (order as any).trackingUrl || (order as any).tracking_url || null;
    const carrierName = (order as any).carrierName || (order as any).carrier || null;
    
    // If trackingUrl is a string, convert to array for consistency
    const trackingUrls = trackingUrl 
      ? (Array.isArray(trackingUrl) ? trackingUrl : [trackingUrl])
      : null;

    // Build response
    const response = {
      orderId: order.orderId || (order as any).order_id || (order as any).amazon_order_id,
      status: statusInfo.short,
      statusLong: statusInfo.long,
      statusIcon: statusInfo.icon,
      statusColor: statusInfo.color,
      luluStatus: order.luluStatus || (order as any).lulu_status || null,
      orderStatus: order.status || null,
      trackingNumber: trackingNumber,
      trackingUrls: trackingUrls,
      carrierName: carrierName,
      customerApprovalStatus: order.customerApprovalStatus || (order as any).customer_approval_status || null,
      updatedAt: order.updatedAt || (order as any).updated_at || null,
    };

    return NextResponse.json(response, {
      headers: corsHeaders,
    });
  } catch (error) {
    console.error('[STATUS API] Error fetching order status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order status' },
      { 
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}

