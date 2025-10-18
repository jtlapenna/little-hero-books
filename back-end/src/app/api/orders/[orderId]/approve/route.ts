import { NextRequest, NextResponse } from 'next/server';
import { approveStage } from '@/lib/approval-store';
import { withErrorHandling, getRequestContext } from '@/lib/api-wrapper';
import { createValidationError } from '@/lib/error-handler';

async function approveOrderStage(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const context = getRequestContext(request, { params: { orderId } });
  const { stage } = await request.json();

  console.log(`API: Approving stage ${stage} for order ${orderId}`);

  // Validate stage
  const validStages = ['preBria', 'postBria', 'postPdf'];
  if (!validStages.includes(stage)) {
    throw createValidationError(`Invalid stage: ${stage}. Must be one of: ${validStages.join(', ')}`);
  }

  // Validate order ID
  if (!orderId || typeof orderId !== 'string') {
    throw createValidationError('Invalid order ID provided');
  }

  // Approve the stage
  const approval = await approveStage(orderId, stage);

  return NextResponse.json({ 
    success: true, 
    message: `Stage ${stage} approved successfully`,
    orderId,
    stage,
    approvedAt: approval.approvedAt,
    reviewer: approval.reviewer
  });
}

export const POST = withErrorHandling(approveOrderStage);
