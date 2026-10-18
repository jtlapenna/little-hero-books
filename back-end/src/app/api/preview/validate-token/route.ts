import { previewMutationReady } from '@/lib/customer-preview-access';
/**
 * API Route: Validate Preview Token
 * 
 * POST /api/preview/validate-token
 * 
 * Validates a preview token and returns order information.
 * This is called from the client-side preview page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authorizePreviewOrder, previewOrderPrefix, privatePreviewHeaders } from '@/lib/customer-preview-access';
import { mapSupabaseOrderToOrder, mapManifestToOrder, mergeOrderData } from '@/lib/order-mapper';
import { downloadManifest } from '@/lib/r2-service';
import {
  buildManifestKeyFromOrderPrefix,
} from '@/lib/order-paths';
import { Order } from '@/types/order';

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      ...privatePreviewHeaders,
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
            ...privatePreviewHeaders,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        }
      );
    }

    const access = await authorizePreviewOrder(token);
    if (!access.ok) return access.response;
    const validation = access.validation;
    const orderId = access.orderId;
    const prefix = previewOrderPrefix(access);
    const corsHeaders = privatePreviewHeaders;
    const supabaseRecord = access.row;
    const supabaseOrder = await mapSupabaseOrderToOrder(supabaseRecord, { includeStatus: false });

    let manifestOrder: Order | null = null;
    const manifestStages: Array<'2b' | '2a' | '3'> = ['2b', '2a', '3'];

    for (const stage of manifestStages) {
      for (const key of [`${prefix}/manifests/${stage}-manifest.json`]) {
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

    // A consumed but unexpired link retains bounded read access only.
    return NextResponse.json(
      {
        valid: !validation.used,
        readValid: true,
        canApprove: previewMutationReady(supabaseRecord) && !validation.used && !['approved', 'revision_requested'].includes(String(supabaseRecord.customer_approval_status ?? '')),
        order: {
          orderId: access.orderId,
          manifest3Key: buildManifestKeyFromOrderPrefix(prefix, '3'),
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
          ...privatePreviewHeaders,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  }
}
