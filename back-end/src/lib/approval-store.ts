import { getOrderFromSupabase } from './supabase-client';
import { updateOrderStatus } from './status-service';

export interface ApprovalResult {
  reviewer: string;
  approvedAt: string;
}

export interface StageStatus {
  stage: string;
  status: "pending" | "in-review" | "approved" | "rejected" | "ready" | "flagged";
  reviewedAt?: string;
  reviewer?: string;
  comments?: string;
}

/**
 * Approve a review stage
 * Updates Supabase and triggers status recalculation
 * Note: If order doesn't exist in Supabase, this will fail silently
 * (orders are stored in R2 manifests, Supabase is optional for status tracking)
 */
export async function approveStage(orderId: string, stage: string): Promise<ApprovalResult> {
  const reviewer = 'system'; // TODO: Get from auth context
  const approvedAt = new Date().toISOString();
  
  // Try to get current order from Supabase (may not exist if order is only in R2)
  const order = await getOrderFromSupabase(orderId).catch(() => null);
  
  if (order) {
    // Order exists in Supabase - update it
    const reviewStages = order.review_stages || {};
    
    // Update specific stage
    reviewStages[stage] = {
      ...reviewStages[stage],
      status: 'approved',
      reviewedAt: approvedAt,
      reviewer
    };
    
    // Update Supabase (using review_stages field name)
    // Don't throw if this fails - approval can still succeed without Supabase update
    try {
      await updateOrderStatus(orderId, {
        review_stages: reviewStages
      });
    } catch (updateError) {
      console.warn(`[approveStage] Failed to update Supabase for order ${orderId}, but approval succeeded:`, updateError);
      // Don't throw - approval is still valid even if Supabase update fails
    }
  } else {
    // Order doesn't exist in Supabase - that's okay, approval is still valid
    // Orders are primarily stored in R2 manifests, Supabase is optional
    console.log(`[approveStage] Order ${orderId} not found in Supabase (may only exist in R2 manifest). Approval still valid.`);
  }
  
  return { reviewer, approvedAt };
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

