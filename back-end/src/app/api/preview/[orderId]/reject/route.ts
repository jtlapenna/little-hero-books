/**
 * API Route: Reject Preview / Request Revision
 * 
 * POST /api/preview/[orderId]/reject
 * 
 * Handles customer rejection/feedback for their book preview.
 * Stores feedback, increments revision count, and updates order status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validatePreviewToken } from '@/lib/preview-tokens';
import { getOrderFromSupabase, updateOrderInSupabase } from '@/lib/supabase-client';
import { supabase } from '@/lib/supabase-client';

export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const { orderId } = params;
    const body = await request.json();
    const { token, feedback } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    if (!feedback || !feedback.pageNumber || !feedback.issueType || !feedback.description) {
      return NextResponse.json(
        { error: 'Feedback is required (pageNumber, issueType, description)' },
        { status: 400 }
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

    // Check revision limit (2 free revisions)
    const currentRevisionCount = order.revision_count || 0;
    if (currentRevisionCount >= 2) {
      return NextResponse.json(
        { error: 'Maximum revision limit reached. Please contact customer service.' },
        { 
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // Store feedback in customer_feedback table
    const { error: feedbackError } = await supabase
      .from('customer_feedback')
      .insert({
        order_id: orderId,
        page_number: feedback.pageNumber,
        issue_type: feedback.issueType,
        description: feedback.description,
        status: 'pending',
        revision_count: currentRevisionCount + 1
      });

    if (feedbackError) {
      console.error('[API] Error storing feedback:', feedbackError);
      return NextResponse.json(
        { error: 'Failed to store feedback' },
        { 
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    // Update order status and increment revision count
    await updateOrderInSupabase(orderId, {
      customer_approval_status: 'revision_requested',
      revision_count: currentRevisionCount + 1
    });

    return NextResponse.json({
      success: true,
      message: 'Revision request submitted successfully',
      orderId: orderId,
      revisionCount: currentRevisionCount + 1,
      revisionsRemaining: Math.max(0, 2 - (currentRevisionCount + 1))
    }, {
      headers: corsHeaders,
    });

  } catch (error: any) {
    console.error('[API] Error rejecting preview:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit revision request' },
      { 
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}

