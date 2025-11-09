import { NextRequest, NextResponse } from 'next/server';
import { approveStage } from '@/lib/approval-store';
import { buildManifestKey } from '@/lib/r2-service';
import { withErrorHandling } from '@/lib/api-wrapper';
import { createValidationError } from '@/lib/error-handler';

async function approveOrderStage(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const body = await request.json().catch(() => ({}));

  const inputStage = body?.stage;
  const requestedStatus = (body?.status || 'approved').toString().toLowerCase();

  console.log(`API: Updating stage ${inputStage} to ${requestedStatus} for order ${orderId}`);

  // Validate stage
  if (!inputStage || typeof inputStage !== 'string') {
    throw createValidationError('Stage is required');
  }
  const validStages = ['preBria', 'postBria', 'postPdf'];
  if (!validStages.includes(inputStage)) {
    throw createValidationError(`Invalid stage: ${inputStage}. Must be one of: ${validStages.join(', ')}`);
  }

  if (!['approved', 'pending'].includes(requestedStatus)) {
    throw createValidationError(`Invalid status: ${requestedStatus}. Must be 'approved' or 'pending'.`);
  }

  // Validate order ID
  if (!orderId || typeof orderId !== 'string') {
    throw createValidationError('Invalid order ID provided');
  }

  // Approve the stage
  const approval = await approveStage(orderId, inputStage, requestedStatus as any);

  // Trigger Workflow 2B when preBria is approved
  if (requestedStatus === 'approved' && inputStage === 'preBria') {
    const n8nUrl = process.env.N8N_2B_WEBHOOK_URL;
    if (n8nUrl) {
      const manifestKey = buildManifestKey(orderId, '2a');
      const webhookUrl = process.env.BACKEND_WEBHOOK_2B_COMPLETE_URL 
        || `${process.env.BACKEND_URL || ''}/api/webhooks/workflow-2b-complete`;
      const payload = {
        trigger: 'manual_review',
        orderId,
        characterHash: undefined,
        manifestUrl: `r2://${process.env.R2_ORDERS_BUCKET_NAME || 'little-hero-orders'}/${manifestKey}`,
        posesToProcess: undefined,
        webhookUrl,
        context: {
          approvedBy: approval.reviewer,
          approvedAt: approval.approvedAt,
        },
      };
      try {
        await fetch(n8nUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        console.error('Failed to trigger 2B workflow:', e);
      }
    }
  }

  return NextResponse.json({ 
    success: true, 
    message: requestedStatus === 'approved'
      ? `Stage ${inputStage} approved successfully`
      : `Stage ${inputStage} reset to pending`,
    orderId,
    stage: inputStage,
    status: requestedStatus,
    approvedAt: approval.approvedAt,
    reviewer: approval.reviewer,
    reviewStages: approval.reviewStages
  });
}

export const POST = withErrorHandling(approveOrderStage);
