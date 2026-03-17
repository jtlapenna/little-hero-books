import { NextRequest, NextResponse } from 'next/server';
import { approveStage } from '@/lib/approval-store';
import { withErrorHandling } from '@/lib/api-wrapper';
import { createValidationError } from '@/lib/error-handler';
import { downloadManifest } from '@/lib/r2-service';
import { buildManifestKeyCandidates } from '@/lib/order-paths';
import { getOrderFlagSummaryById } from '@/lib/review-state';

async function downloadFirstManifest(
  manifestKeys: string[],
): Promise<any | null> {
  for (const manifestKey of manifestKeys) {
    try {
      return await downloadManifest(manifestKey);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('404') && !message.includes('Not Found')) {
        throw error;
      }
    }
  }

  return null;
}

async function approveOrderStage(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const body = await request.json();
  const { stage, status, bookId, orderPrefix } = body;

  console.log(`API: Approving stage ${stage} for order ${orderId}, status: ${status}`);

  // Validate stage
  const validStages = ['preBria', 'postBria', 'postPdf'];
  if (!validStages.includes(stage)) {
    return createValidationError(`Invalid stage: ${stage}. Must be one of: ${validStages.join(', ')}`);
  }

  // Validate order ID
  if (!orderId || typeof orderId !== 'string') {
    return createValidationError('Invalid order ID provided');
  }

  // If approving (not un-approving), check for flags first
  const nextStatus = status || 'approved';
  if (nextStatus === 'approved') {
    let flagCount = 0;
    
    try {
      if (stage === 'preBria') {
        // Check 2a manifest for preBria flags
        const manifest = await downloadFirstManifest(
          buildManifestKeyCandidates(orderId, '2a', {
            bookId: typeof bookId === 'string' ? bookId : null,
            orderPrefix: typeof orderPrefix === 'string' ? orderPrefix : null,
          }),
        );
        if (manifest?.entries) {
          flagCount = manifest.entries.filter((e: any) => e.isFlagged || e.needsReview).length;
        }
      } else if (stage === 'postBria') {
        // Check 2b manifest (fallback to 2a) for postBria flags
        let manifest = await downloadFirstManifest(
          buildManifestKeyCandidates(orderId, '2b', {
            bookId: typeof bookId === 'string' ? bookId : null,
            orderPrefix: typeof orderPrefix === 'string' ? orderPrefix : null,
          }),
        );
        if (!manifest) {
          manifest = await downloadFirstManifest(
            buildManifestKeyCandidates(orderId, '2a', {
              bookId: typeof bookId === 'string' ? bookId : null,
              orderPrefix: typeof orderPrefix === 'string' ? orderPrefix : null,
            }),
          );
        }
        if (manifest?.entries) {
          flagCount = manifest.entries.filter((e: any) => e.isFlagged || e.needsReview).length;
        }
      } else if (stage === 'postPdf') {
        // Check 3 manifest for postPdf flags
        const manifest = await downloadFirstManifest(
          buildManifestKeyCandidates(orderId, '3', {
            bookId: typeof bookId === 'string' ? bookId : null,
            orderPrefix: typeof orderPrefix === 'string' ? orderPrefix : null,
          }),
        );
        if (manifest?.pngGeneration?.pagesMetadata) {
          const pagesMetadata = manifest.pngGeneration.pagesMetadata;
          flagCount = Object.values(pagesMetadata).filter((meta: any) => meta.isFlagged || meta.needsReview).length;
        }
      }
    } catch (error) {
      console.error(`[Approve API] Error checking flags for ${stage}:`, error);
      // Don't fail - allow approval if we can't check flags (graceful degradation)
    }

    if (flagCount > 0) {
      return createValidationError(
        `Cannot approve stage: ${flagCount} flagged item${flagCount !== 1 ? 's' : ''} must be resolved first.`
      );
    }
  }

  // Approve the stage
  const approval = await approveStage(orderId, stage, nextStatus as 'approved' | 'pending');

  // Get updated flag counts from Supabase
  const flagSummary = await getOrderFlagSummaryById(orderId).catch(() => null);
  const flags = flagSummary ? {
    preBria: flagSummary.preBria,
    postBria: flagSummary.postBria,
    postPdf: flagSummary.postPdf,
    total: flagSummary.total
  } : null;

  return NextResponse.json({ 
    success: true, 
    message: `Stage ${stage} ${nextStatus === 'approved' ? 'approved' : 'reset'} successfully`,
    orderId,
    stage,
    status: nextStatus,
    approvedAt: approval.approvedAt,
    reviewer: approval.reviewer,
    reviewStages: approval.reviewStages,
    flags: flags // Return updated flag counts
  });
}

export const POST = withErrorHandling(approveOrderStage);
