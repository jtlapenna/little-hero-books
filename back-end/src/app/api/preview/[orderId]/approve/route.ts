/**
 * API Route: Approve Preview
 * 
 * POST /api/preview/[orderId]/approve
 * 
 * Handles customer approval of their book preview.
 * Marks token as used and updates order status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validatePreviewToken, markTokenAsUsed } from '@/lib/preview-tokens';
import { getOrderFromSupabase, updateOrderInSupabase } from '@/lib/supabase-client';

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

export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const { orderId } = params;
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { 
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // Validate token
    const validation = await validatePreviewToken(token);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || 'Invalid or expired token' },
        { 
          status: 401,
          headers: corsHeaders,
        }
      );
    }

    // Verify order exists and matches token
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

    if (validation.orderId !== orderId && validation.orderId !== order.amazon_order_id) {
      return NextResponse.json(
        { error: 'Token does not match order' },
        { 
          status: 403,
          headers: corsHeaders,
        }
      );
    }

    // Mark token as used
    await markTokenAsUsed(token);

    // Update order status
    await updateOrderInSupabase(orderId, {
      customer_approval_status: 'approved',
      customer_approval_approved_at: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      message: 'Book approved successfully',
      orderId: orderId
    }, {
      headers: corsHeaders,
    });

  } catch (error: any) {
    console.error('[API] Error approving preview:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to approve preview' },
      { 
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}

