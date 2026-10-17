/**
 * API Route: Reject Preview / Request Revision
 * 
 * POST /api/preview/[orderId]/reject
 * 
 * Handles customer rejection/feedback for their book preview.
 * Stores feedback, increments revision count, and updates order status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { correctionHistoryForTransition } from '@/lib/customer-corrections';
import { markTokenAsUsed } from '@/lib/preview-tokens';
import { authorizePreviewOrder, transitionPreviewOrder, privatePreviewHeaders } from '@/lib/customer-preview-access';
import { supabase } from '@/lib/supabase-client';

const corsHeaders = privatePreviewHeaders;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: requestedOrderId } = await params;
    const body = await request.json();
    const { token, feedback } = body;
    const qa_notes = body.qa_notes ?? feedback?.qaNotes;
    const regeneration_instructions = body.regeneration_instructions ?? feedback?.regenerationInstructions;

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    const normalizedFeedback = z.object({ pageNumber: z.number().int().min(1).max(1000),
      issueType: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(5000) }).safeParse(feedback);
    if (!normalizedFeedback.success) return NextResponse.json({ error: 'Valid feedback is required' }, { status: 400, headers: corsHeaders });

    const access = await authorizePreviewOrder(token, requestedOrderId, true);
    if (!access.ok) return access.response;
    const orderId = access.orderId;
    const order = access.row;
    if (['approved', 'revision_requested'].includes(String(order.customer_approval_status ?? ''))) {
      return NextResponse.json({ error: 'Preview action unavailable' }, { status: 409, headers: corsHeaders });
    }

    // Check revision limit (single correction allowed)
    const currentRevisionCount = Number(order.revision_count || 0);
    if (currentRevisionCount >= 1) {
      return NextResponse.json(
        { error: 'Maximum revision limit reached. Please contact customer service.' },
        { 
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const correction = normalizedFeedback.data;
    const rejectionHistory = correctionHistoryForTransition(order, orderId, {
      reason: correction.issueType, message: correction.description,
      payload: { pageNumber: correction.pageNumber, issueType: correction.issueType,
        ...(qa_notes != null ? { qaNotes: String(qa_notes) } : {}),
        ...(regeneration_instructions != null ? { regenerationInstructions: String(regeneration_instructions) } : {}) },
      email: null, name: null, revisionCount: currentRevisionCount + 1,
    });

    if (!await markTokenAsUsed(token)) return NextResponse.json({ error: 'Preview link already consumed or expired' }, { status: 409, headers: corsHeaders });

    if (!await transitionPreviewOrder(access.row, {
      customer_approval_status: 'revision_requested',
      rejection_history: rejectionHistory,
      customer_approval_approved_at: null, human_approved: false, next_workflow: null,
      workflow_step: 'customer_revision',
      revision_count: currentRevisionCount + 1,
      review_stages: {
        preBria: { status: 'pending' },
        postBria: { status: 'pending' },
        postPdf: { status: 'pending' }
      },
      ...(typeof qa_notes !== 'undefined' && qa_notes !== null ? { qa_notes: String(qa_notes).trim() || null } : {}),
      ...(typeof regeneration_instructions !== 'undefined' && regeneration_instructions !== null ? { regeneration_instructions: String(regeneration_instructions).trim() || null } : {}),
    })) return NextResponse.json({ error: 'Preview action already completed' }, { status: 409, headers: corsHeaders });

    // The order CAS is canonical. An auxiliary failure cannot discard accepted feedback.
    try {
      const { error } = await supabase.from('customer_feedback').insert({
        order_id: orderId, page_number: correction.pageNumber, issue_type: correction.issueType,
        description: correction.description, status: 'pending', revision_count: currentRevisionCount + 1,
      });
      if (error) console.warn('[API] Correction accepted; auxiliary feedback persistence needs recovery');
    } catch {
      console.warn('[API] Correction accepted; auxiliary feedback transport needs recovery');
    }

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

