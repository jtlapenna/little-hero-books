import { NextRequest, NextResponse } from 'next/server';
import { getOrderFromSupabase, updateOrderInSupabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/orders/[orderId]/normalize-shipping
 * 
 * Normalizes the shipping_address field to use the expected field names
 * (address_line_1, postal_code, state_code) that the n8n workflow validation expects.
 * 
 * This fixes orders that were uploaded with the old field names (address, zip, state).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  
  try {
    // Get current order
    const order = await getOrderFromSupabase(orderId);
    
    if (!order) {
      return NextResponse.json(
        { error: `Order ${orderId} not found` },
        { status: 404 }
      );
    }
    
    const shippingAddress = order.shipping_address;
    
    if (!shippingAddress || typeof shippingAddress !== 'object') {
      return NextResponse.json(
        { error: 'Order does not have a shipping_address field' },
        { status: 400 }
      );
    }
    
    // Normalize shipping address to expected field names
    const normalized: any = { ...shippingAddress };
    
    // Map old field names to new field names if they exist
    if (normalized.address && !normalized.address_line_1) {
      normalized.address_line_1 = normalized.address;
    }
    if (normalized.zip && !normalized.postal_code) {
      normalized.postal_code = normalized.zip;
    }
    if (normalized.state && !normalized.state_code) {
      normalized.state_code = normalized.state;
    }
    if (normalized.address2 && !normalized.address_line_2) {
      normalized.address_line_2 = normalized.address2;
    }
    
    // Keep legacy fields for backward compatibility
    // (already included via spread operator above)
    
    // Update order in Supabase
    // Preserve review_stages to avoid losing approval status
    const updates: any = {
      shipping_address: normalized,
      error_type: null, // Clear the missing_shipping error
      error_message: null
    };
    
    // Preserve review_stages if it exists (don't overwrite approvals)
    if (order.review_stages) {
      updates.review_stages = order.review_stages;
    }
    
    await updateOrderInSupabase(orderId, updates);
    
    return NextResponse.json({
      success: true,
      orderId,
      normalized: {
        address_line_1: normalized.address_line_1,
        postal_code: normalized.postal_code,
        state_code: normalized.state_code,
        city: normalized.city,
        country: normalized.country || 'US'
      }
    });
    
  } catch (error: any) {
    console.error(`[Normalize Shipping] Error for order ${orderId}:`, error);
    return NextResponse.json(
      { 
        error: 'Failed to normalize shipping address',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

