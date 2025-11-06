/**
 * API Route: Validate Preview Token
 * 
 * POST /api/preview/validate-token
 * 
 * Validates a preview token and returns order information.
 * This is called from the client-side preview page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validatePreviewToken } from '@/lib/preview-tokens';
import { getOrderFromSupabase } from '@/lib/supabase-client';

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        }
      );
    }

    // Validate token
    const validation = await validatePreviewToken(token);
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (!validation.valid) {
      return NextResponse.json(
        { 
          valid: false,
          error: validation.error,
          expired: validation.expired,
          used: validation.used
        },
        { 
          status: 401,
          headers: corsHeaders,
        }
      );
    }

    if (!validation.orderId) {
      return NextResponse.json(
        { error: 'Token validation failed' },
        { 
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    // Fetch order data
    const order = await getOrderFromSupabase(validation.orderId);
    
    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { 
          status: 404,
          headers: corsHeaders,
        }
      );
    }

    // Return order information (sanitized for customer view)
    return NextResponse.json({
      valid: true,
      order: {
        orderId: validation.orderId,
        amazonOrderId: order.amazon_order_id || order.orderId,
        characterSpecs: order.character_specs,
        revisionCount: order.revision_count || 0,
        customerApprovalStatus: order.customer_approval_status,
        finalBookUrl: order.final_book_url
      }
    }, {
      headers: corsHeaders,
    });

  } catch (error: any) {
    console.error('[API] Error validating token:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to validate token' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  }
}

