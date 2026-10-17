import { gelatoCustomerStatusMessage } from '@/lib/books/gelato-consumer-status';
/**
 * API Route: Get Order Status
 * 
 * GET /api/preview/[orderId]/status
 * 
 * Returns current order status including Lulu status for customer-facing display.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authorizePreviewOrder, findExactPreviewOrder, findExactPreviewGroup, canonicalPreviewOrderId, privatePreviewHeaders } from '@/lib/customer-preview-access';
import { emailsMatchForLookup } from '@/lib/customer-email';

const corsHeaders = privatePreviewHeaders;
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: corsHeaders }); }

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
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: inputOrderId } = await params;

    if (!inputOrderId) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { 
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const token = request.headers.get('x-preview-token');
    const emailParam = request.nextUrl.searchParams.get('email')?.trim();
    let orderRecord: Record<string, unknown>;
    if (token !== null) {
      const access = await authorizePreviewOrder(token, inputOrderId);
      if (!access.ok) return access.response;
      orderRecord = access.row;
    } else {
      if (!emailParam || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailParam)) {
        return NextResponse.json({ error: 'Order lookup requires authorization' }, { status: 401, headers: corsHeaders });
      }
      const found = await findExactPreviewOrder(inputOrderId, true);
      if (!found) {
        const group = await findExactPreviewGroup(inputOrderId);
        if (group.length > 1 && group.every(row => emailsMatchForLookup(row.customer_email ?? row.customerEmail, emailParam))) {
          const bookOrderIds = group.map(row => typeof row.display_order_id === 'string' ? row.display_order_id : canonicalPreviewOrderId(row)!);
          return NextResponse.json({ orderId: inputOrderId, status: 'Multiple books', statusLong: `This order has multiple books. Look up each book using: ${bookOrderIds.join(', ')}.`, bookOrderIds }, { headers: corsHeaders });
        }
      }
      if (!found || !emailsMatchForLookup(found.customer_email ?? found.customerEmail, emailParam)) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404, headers: corsHeaders });
      }
      orderRecord = found;
    }
    const order = orderRecord;

    // Get status message
    // Check both camelCase and snake_case for luluStatus
    const luluStatusValue = order.luluStatus || orderRecord.lulu_status;
    const luluStatus = typeof luluStatusValue === 'string' ? luluStatusValue : null;
    const orderStatus = typeof order.status === 'string' ? order.status : null;
    const isGelato = orderRecord.print_provider === 'gelato';
    const statusInfo = isGelato ? gelatoCustomerStatusMessage(typeof orderRecord.gelato_status === 'string' ? orderRecord.gelato_status : null, typeof orderRecord.gelato_order_type === 'string' ? orderRecord.gelato_order_type : null, typeof orderRecord.gelato_action_reason === 'string' ? orderRecord.gelato_action_reason : null) : getCustomerStatusMessage(luluStatus, orderStatus);
    const packages = isGelato && Array.isArray(orderRecord.gelato_tracking) ? orderRecord.gelato_tracking.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object' && !Array.isArray(entry)) : [];
    const scalarPackage = packages.length === 1 ? packages[0] : null;

    // Extract tracking info from order data
    // Check multiple possible field names (database might use snake_case or camelCase)
    const trackingNumber = isGelato ? scalarPackage?.trackingNumber ?? null : orderRecord.trackingNumber || orderRecord.tracking_number || null;
    const trackingUrl = isGelato ? scalarPackage?.trackingUrl ?? null : orderRecord.trackingUrl || orderRecord.tracking_url || null;
    const carrierName = isGelato ? scalarPackage?.carrier ?? null : orderRecord.carrierName || orderRecord.carrier || null;
    
    // If trackingUrl is a string, convert to array for consistency
    const trackingUrls = trackingUrl 
      ? (Array.isArray(trackingUrl) ? trackingUrl : [trackingUrl])
      : null;

    // Build response
    const response = {
      orderId: order.orderId || orderRecord.order_id || orderRecord.amazon_order_id,
      status: statusInfo.short,
      statusLong: statusInfo.long,
      statusIcon: statusInfo.icon,
      statusColor: statusInfo.color,
      printProvider: isGelato ? 'gelato' : 'lulu',
      packages,
      gelatoStatus: isGelato ? orderRecord.gelato_status : null,
      luluStatus: isGelato ? null : order.luluStatus || orderRecord.lulu_status || null,
      orderStatus: order.status || null,
      trackingNumber: trackingNumber,
      trackingUrls: trackingUrls,
      carrierName: carrierName,
      customerApprovalStatus: order.customerApprovalStatus || orderRecord.customer_approval_status || null,
      updatedAt: order.updatedAt || orderRecord.updated_at || null,
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
