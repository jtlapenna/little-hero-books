/**
 * API Route: Approve Preview
 * 
 * POST /api/preview/[orderId]/approve
 * 
 * Handles customer approval of their book preview.
 * Marks token as used and updates order status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { markTokenAsUsed } from '@/lib/preview-tokens';
import { authorizePreviewOrder, transitionPreviewOrder, privatePreviewHeaders } from '@/lib/customer-preview-access';

const corsHeaders = privatePreviewHeaders;

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: requestedOrderId } = await params;
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

    const access = await authorizePreviewOrder(token, requestedOrderId, true);
    if (!access.ok) return access.response;
    const orderId = access.orderId;
    const order = access.row;
    if (['approved', 'revision_requested'].includes(String(order.customer_approval_status ?? ''))) {
      return NextResponse.json({ error: 'Preview action unavailable' }, { status: 409, headers: corsHeaders });
    }

    // Mark token as used
    if (!await markTokenAsUsed(token)) return NextResponse.json({ error: 'Preview link already consumed or expired' }, { status: 409, headers: corsHeaders });

    // Update order status
    // IMPORTANT: Update execution_status to prevent "stuck processing" detection
    // After customer approval, order is ready for print workflow (4) or completed
    const nowIso = new Date().toISOString();
    if (!await transitionPreviewOrder(access.row, {
      customer_approval_status: 'approved',
      customer_approval_approved_at: nowIso,
      execution_status: 'ready_for_processing', // Clear 'processing' state to prevent stuck detection
      workflow_step: 'customer_approval', // Mark as customer approved (will move to print_fulfillment when sent to print)
      current_workflow: null, // Clear any active workflow
      started_at: null, // Clear processing timestamp
      next_workflow: '4', // Queue for print workflow
      human_approved: true,
      human_reviewed_at: nowIso,
      human_reviewer: 'customer',
    })) return NextResponse.json({ error: 'Preview action already completed' }, { status: 409, headers: corsHeaders });

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

