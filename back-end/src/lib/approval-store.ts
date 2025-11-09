import { getOrderFromSupabase, supabase } from './supabase-client';
import { updateOrderStatus } from './status-service';

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
  const reviewer = 'system'; // TODO: auth context
  const approvedAt = new Date().toISOString();

  // Load existing order if present
  const existingOrder = await getOrderFromSupabase(orderId).catch(() => null);
  const reviewStages = sanitizeReviewStages(existingOrder?.review_stages);

  if (!reviewStages[stage]) {
    reviewStages[stage] = { status: 'pending' };
  }

  if (nextStatus === 'approved') {
    reviewStages[stage] = {
      ...(reviewStages[stage] || {}),
      status: 'approved',
      reviewedAt: approvedAt,
      reviewer
    };
  } else {
    reviewStages[stage] = {
      status: 'pending'
    };
  }

  const nowIso = new Date().toISOString();

  const shouldClearCustomerRevision =
    existingOrder?.customer_approval_status === 'revision_requested';

  try {
    await updateOrderStatus(orderId, {
      review_stages: reviewStages,
      ...(shouldClearCustomerRevision
        ? {
            customer_approval_status: null,
            customer_approval_required: false,
            customer_approval_requested_at: null,
            customer_approval_approved_at: null
          }
        : {})
    });
  } catch (updateError) {
    console.warn(`[approveStage] Failed to update order status for ${orderId}:`, updateError);
  }

  if (!existingOrder) {
    try {
      await supabase
        .from('orders')
        .insert({
          amazon_order_id: orderId,
          status: 'pending_processing',
          review_stages: reviewStages,
          customer_approval_status: 'pending',
          created_at: nowIso,
          updated_at: nowIso
        })
        .select()
        .single();
    } catch (error) {
      console.warn(`[approveStage] Insert failed for order ${orderId}:`, error);
    }
  }

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

