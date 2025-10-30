export const runtime = 'edge';
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

  // Trigger Workflow 2B when preBria is approved
  if (stage === 'preBria') {
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
    message: `Stage ${stage} approved successfully`,
    orderId,
    stage,
    approvedAt: approval.approvedAt,
    reviewer: approval.reviewer
  });
}

export const POST = withErrorHandling(approveOrderStage);
