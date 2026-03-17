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
import { mapSupabaseOrderToOrder, mapManifestToOrder, mergeOrderData } from '@/lib/order-mapper';
import { downloadManifest } from '@/lib/r2-service';
import {
  buildManifestKeyCandidates,
  buildManifestKeyHintOptionsFromOrderLike,
} from '@/lib/order-paths';
import { Order } from '@/types/order';

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

    // If token is invalid but we have an orderId (token was used or expired),
    // still fetch and return order data so the page can display customer details
    if (!validation.valid && !validation.orderId) {
      return NextResponse.json(
        { 
          valid: false,
          error: validation.error || 'Invalid token',
          expired: validation.expired,
          used: validation.used
        },
        { 
          status: 401,
          headers: corsHeaders,
        }
      );
    }

    // If token is invalid but we have orderId, continue to fetch order data
    // This allows the page to display customer details even when token is used/expired
    const orderId = validation.orderId;
    
    if (!orderId) {
      return NextResponse.json(
        { error: 'Token validation failed' },
        { 
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    let supabaseRecord: any = null;
    let supabaseOrder: Order | null = null;

    try {
      supabaseRecord = await getOrderFromSupabase(orderId);
      if (supabaseRecord) {
        supabaseOrder = await mapSupabaseOrderToOrder(supabaseRecord);
      }
    } catch (error: any) {
      console.warn(
        '[API] Preview token validation - failed to load order from Supabase:',
        error?.message || error
      );
    }

    let manifestOrder: Order | null = null;
    const manifestStages: Array<'2b' | '2a' | '3'> = ['2b', '2a', '3'];
    const manifestHints = buildManifestKeyHintOptionsFromOrderLike(supabaseRecord);

    for (const stage of manifestStages) {
      for (const key of buildManifestKeyCandidates(orderId, stage, manifestHints)) {
        try {
          const manifest = await downloadManifest(key);
          manifestOrder = mapManifestToOrder(orderId, manifest);
          break;
        } catch (error: any) {
          console.log(
            `[API] Preview token validation - manifest ${stage} not found for ${orderId} at ${key}:`,
            error?.message || error
          );
        }
      }

      if (manifestOrder) {
        break;
      }
    }

    if (!supabaseOrder && !manifestOrder) {
      return NextResponse.json(
        { error: 'Order not found' },
        {
          status: 404,
          headers: corsHeaders,
        }
      );
    }

    const mergedOrder = supabaseOrder
      ? mergeOrderData(supabaseOrder, manifestOrder)
      : (manifestOrder as Order);

    const customerName = mergedOrder.customer
      ? `${mergedOrder.customer.firstName || ''} ${mergedOrder.customer.lastName || ''}`.trim() || null
      : null;

    // Return order data even if token is invalid (used or expired)
    // This allows the page to persist customer details after approval
    return NextResponse.json(
      {
        valid: validation.valid, // Return actual validation status
        order: {
          orderId: mergedOrder.orderId,
          amazonOrderId: mergedOrder.amazonOrderId || mergedOrder.orderId,
          customerName: customerName,
          characterSpecs: mergedOrder.characterSpecs || null,
          revisionCount:
            typeof mergedOrder.revisionCount === 'number'
              ? mergedOrder.revisionCount
              : supabaseRecord?.revision_count || 0,
          customerApprovalStatus:
            mergedOrder.customerApprovalStatus ||
            supabaseRecord?.customer_approval_status ||
            null,
          execution_status: supabaseRecord?.execution_status || null,
          next_workflow: supabaseRecord?.next_workflow || null,
          status: supabaseRecord?.status || null,
          finalBookUrl: mergedOrder.finalBookUrl || supabaseRecord?.final_book_url || null,
        },
        expired: validation.expired,
        used: validation.used,
      },
      {
        headers: corsHeaders,
      }
    );

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
