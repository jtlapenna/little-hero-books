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
    console.log(`[approveStage] Updating Supabase for order ${orderId}, stage ${stage}, status ${nextStatus}`);
    console.log(`[approveStage] reviewStages to save:`, JSON.stringify(reviewStages, null, 2));
    await updateOrderStatus(orderId, {
      review_stages: reviewStages,
      // Note: Stage approval does NOT automatically queue orders for the next workflow.
      // Admins must explicitly use the "Trigger Background Removal" or "Trigger Book Assembly" buttons
      // to queue orders for processing. This gives admins control over when workflows start.
      ...(shouldClearCustomerRevision
        ? {
            customer_approval_status: null,
            customer_approval_required: false,
            customer_approval_requested_at: null,
            customer_approval_approved_at: null
          }
        : {})
    });
    console.log(`[approveStage] ✅ Successfully updated Supabase for order ${orderId}`);
    
    // Verify the update was saved
    const verifyOrder = await getOrderFromSupabase(orderId).catch(() => null);
    if (verifyOrder) {
      console.log(`[approveStage] Verified review_stages in Supabase:`, JSON.stringify(verifyOrder.review_stages, null, 2));
    } else {
      console.warn(`[approveStage] ⚠️ Could not verify update - order ${orderId} not found in Supabase`);
    }
  } catch (updateError) {
    console.error(`[approveStage] ❌ Failed to update order status for ${orderId}:`, updateError);
    throw updateError; // Re-throw to ensure the error is visible
  }

  if (!existingOrder) {
    try {
      console.log(`[approveStage] Order ${orderId} not found, creating new record...`);
      const { data, error: insertError } = await supabase
        .from('orders')
        .insert({
          amazon_order_id: orderId,
          orderId: orderId, // Ensure orderId is set (required column)
          status: 'pending_processing',
          review_stages: reviewStages,
          customer_approval_status: 'pending',
          created_at: nowIso,
          updated_at: nowIso
        })
        .select()
        .single();
      
      if (insertError) {
        console.error(`[approveStage] Insert error for order ${orderId}:`, insertError);
        throw insertError;
      }
      console.log(`[approveStage] ✅ Successfully created new order record for ${orderId}`);
    } catch (error) {
      console.error(`[approveStage] ❌ Insert failed for order ${orderId}:`, error);
      throw error; // Re-throw to ensure the error is visible
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

  // Set stage status to 'pending'
  reviewStages[stage] = {
    status: 'pending'
    // Remove approvedAt, reviewer, etc. - reset to pending state
  };

  try {
    // Update Supabase - just unapprove the stage
    // Note: We don't clear workflow queue here - if workflow hasn't started yet,
    // it should check stage approval before starting. If it has started, we don't want to interrupt it.
    await updateOrderStatus(orderId, {
      review_stages: reviewStages
    });

    console.log(`[unapproveStageIfNeeded] ✅ Successfully unapproved stage ${stage} for order ${orderId}`);

    return {
      reviewer: 'system',
      approvedAt: new Date().toISOString(),
      status: 'pending',
      reviewStages
    };
  } catch (error) {
    console.error(`[unapproveStageIfNeeded] ❌ Failed to unapprove stage ${stage} for order ${orderId}:`, error);
    return null; // Don't throw - flagging should still succeed even if unapprove fails
  }
}

