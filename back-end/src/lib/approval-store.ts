import { getOrderFromSupabase } from './supabase-client';
import { calculateOrderStatusFromOrder, updateOrderStatus, type StatusCalculationOrder } from './status-service';
import { findExactPreviewOrder } from './customer-preview-access';
import { BookReviewStage, invalidateBookReview, assertBookReviewOwnership, compareAndSetBookReview, BookReviewConflict } from './book-review-invalidation';

export interface ApprovalResult {
  reviewer: string;
  approvedAt: string;
  status: StageStatus['status'];
  reviewStages: Record<string, any>;
}

export interface StageStatus {
  stage: string;
  status: "pending" | "in-review" | "approved" | "rejected" | "ready" | "flagged";
  reviewedAt?: string;
  reviewer?: string;
  comments?: string;
}

const DEFAULT_REVIEW_STAGES: Record<string, StageStatus> = {
  preBria: { stage: 'preBria', status: 'pending' },
  postBria: { stage: 'postBria', status: 'pending' },
  postPdf: { stage: 'postPdf', status: 'pending' }
};

function sanitizeReviewStages(reviewStages: Record<string, any> | null | undefined) {
  const merged: Record<string, any> = {
    preBria: { status: 'pending' },
    postBria: { status: 'pending' },
    postPdf: { status: 'pending' }
  };

  if (reviewStages && typeof reviewStages === 'object') {
    for (const [key, value] of Object.entries(reviewStages)) {
      if (merged[key]) {
        merged[key] = {
          status: value?.status || merged[key].status,
          reviewedAt: value?.reviewedAt || value?.reviewed_at,
          reviewer: value?.reviewer,
          comments: value?.comments
        };
      } else {
        merged[key] = {
          status: value?.status || 'pending',
          reviewedAt: value?.reviewedAt || value?.reviewed_at,
          reviewer: value?.reviewer,
          comments: value?.comments
        };
      }
    }
  }

  return merged;
}

/**
 * Approve or reset a review stage.
 * Persists to Supabase (creating a lightweight record if necessary) and recalculates status.
 */
export async function approveStage(
  orderId: string,
  stage: string,
  nextStatus: StageStatus['status'] = 'approved'
): Promise<ApprovalResult> {
  const reviewStage = BookReviewStage.parse(stage);
  if (nextStatus !== 'approved') await invalidateBookReview(orderId, BookReviewStage.parse(stage));
  const reviewer = 'system'; // TODO: auth context
  const approvedAt = new Date().toISOString();

  // Load existing order if present
  const existingOrder = await findExactPreviewOrder(orderId);
  if (!existingOrder) throw new BookReviewConflict('Order not found; review cannot create an order');
  assertBookReviewOwnership(existingOrder, reviewStage);
  const reviewStages = sanitizeReviewStages(existingOrder?.review_stages as Record<string, unknown> | null);

  if (!reviewStages[stage]) {
    reviewStages[stage] = { status: 'pending' };
  }

  if (nextStatus === 'approved' && reviewStages[stage]?.status === 'approved') return { reviewer: reviewStages[stage].reviewer ?? reviewer, approvedAt: reviewStages[stage].reviewedAt ?? approvedAt, status: 'approved', reviewStages };

  if (nextStatus === 'approved') {
    reviewStages[stage] = {
      ...(reviewStages[stage] || {}),
      status: 'approved',
      reviewedAt: approvedAt,
      reviewer
    };
  }
  // Reset uses the canonical in-review hold written above, including downstream invalidation.


  const shouldClearCustomerRevision =
    existingOrder?.customer_approval_status === 'revision_requested';

  // PSEUDOCODE (queue next step on approval)
  // - If stage is being approved:
  //   - preBria approved => queue 2B (background removal)
  //   - postBria approved => queue 3 (assembly)
  // - Do not try to "undo" routing on un-approve (admin can use reset/regen paths).
  const queueUpdateOnApproval: Record<string, unknown> = (() => {
    // Only queue on approve.
    if (nextStatus !== 'approved') return {};

    // Clear any "currently processing" markers so cron/router can safely pick it up again.
    const base = {
      execution_status: 'ready_for_processing',
      current_workflow: null,
      started_at: null,
    } as const;

    if (stage === 'preBria') {
      // If W2A didn't update Supabase (workflow_step stuck at order_intake), unstick it here.
      const maybeUnstick2A =
        !existingOrder?.workflow_step || existingOrder.workflow_step === 'order_intake'
          ? { workflow_step: '2A-complete' }
          : {};

      return { ...base, next_workflow: '2B', ...maybeUnstick2A };
    }

    if (stage === 'postBria') {
      const maybeUnstick2B =
        !existingOrder?.workflow_step || existingOrder.workflow_step === 'order_intake'
          ? { workflow_step: '2B-complete' }
          : {};

      return { ...base, next_workflow: '3', ...maybeUnstick2B };
    }

    return {};
  })();

  const patch: Record<string, unknown> = {
    review_stages: reviewStages, ...queueUpdateOnApproval, updated_at: approvedAt,
    ...(nextStatus === 'approved' ? { human_approved: true, human_reviewed_at: approvedAt, human_reviewer: reviewer } : {}),
    ...(shouldClearCustomerRevision ? { customer_approval_status: 'revision_requested', customer_approval_required: true,
      customer_approval_requested_at: null, customer_approval_approved_at: null } : {}),
  };
  patch.status = calculateOrderStatusFromOrder({ ...existingOrder, ...patch } as StatusCalculationOrder);
  if (!await compareAndSetBookReview(existingOrder, patch)) throw new BookReviewConflict('Book changed during stage approval; refresh before reviewing again');

  return {
    reviewer,
    approvedAt,
    status: nextStatus,
    reviewStages
  };
}

/**
 * Get stage status from Supabase
 */
export async function getStageStatus(orderId: string, stage: string): Promise<StageStatus> {
  const order = await getOrderFromSupabase(orderId).catch(() => null);
  
  if (!order) {
    return { stage, status: "pending" };
  }
  
  const reviewStages = order.review_stages || {};
  const stageData = reviewStages[stage] || { status: "pending" };
  
  return {
    stage,
    status: stageData.status || "pending",
    reviewedAt: stageData.reviewedAt,
    reviewer: stageData.reviewer,
    comments: stageData.comments
  };
}

/**
 * Reject a review stage
 */
export async function rejectStage(orderId: string, stage: string, reason: string): Promise<void> {
  const reviewer = 'system'; // TODO: Get from auth context
  const rejectedAt = new Date().toISOString();
  
  // Get current order
  const order = await getOrderFromSupabase(orderId);
  const reviewStages = order.review_stages || {};
  
  // Update specific stage
  reviewStages[stage] = {
    ...reviewStages[stage],
    status: 'rejected',
    reviewedAt: rejectedAt,
    reviewer,
    comments: reason
  };
  
  // Update Supabase
  await updateOrderStatus(orderId, {
    review_stages: reviewStages
  });
}

/**
 * Unapprove a review stage (set status to 'pending')
 * This is called when flags are added to an approved stage
 */
export async function unapproveStageIfNeeded(
  orderId: string,
  stage: string,
  flagCount: number
): Promise<ApprovalResult | null> {
  // Only unapprove if there are flags and the stage is currently approved
  if (flagCount === 0) {
    return null; // No flags, no need to unapprove
  }

  // Load existing order
  const existingOrder = await getOrderFromSupabase(orderId).catch(() => null);
  if (!existingOrder) {
    return null; // Order doesn't exist yet
  }

  const reviewStages = sanitizeReviewStages(existingOrder?.review_stages);
  const currentStageStatus = reviewStages[stage]?.status;

  // Only unapprove if the stage is currently approved
  if (currentStageStatus !== 'approved') {
    return null; // Stage is not approved, no need to change
  }

  console.log(`[unapproveStageIfNeeded] Unapproving stage ${stage} for order ${orderId} due to ${flagCount} flag(s)`);

  await invalidateBookReview(orderId, BookReviewStage.parse(stage));

  try {
    // Return the canonical held state, including all invalidated downstream stages.
    const held = await getOrderFromSupabase(orderId);
    const heldStages = sanitizeReviewStages(held?.review_stages);
    console.log(`[unapproveStageIfNeeded] ✅ Successfully unapproved stage ${stage} for order ${orderId}`);

    return {
      reviewer: 'system',
      approvedAt: new Date().toISOString(),
      status: 'pending',
      reviewStages: heldStages
    };
  } catch (error) {
    console.error(`[unapproveStageIfNeeded] ❌ Failed to unapprove stage ${stage} for order ${orderId}:`, error);
    return null; // Don't throw - flagging should still succeed even if unapprove fails
  }
}

