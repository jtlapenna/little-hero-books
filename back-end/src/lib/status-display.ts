import { Order, OrderListItem } from '@/types/order';
import {
  CustomerApprovalStatus,
  DisplayStatus,
  LuluStatus,
  OrderStatus,
  ReviewStageStatus,
  WorkflowStep,
} from '@/constants/statuses';
import { OrderPhase } from '@/constants/phases';

const FAILURE_STATUSES = new Set<string>([
  OrderStatus.ACTION_REQUIRED,
  OrderStatus.FAILED,
  OrderStatus.CANCELLED,
]);

const REVISION_STATUSES = new Set<string>([
  OrderStatus.REVISION_BASE,
  OrderStatus.REVISION_BG_REMOVAL,
  OrderStatus.REVISION_ASSEMBLY,
  OrderStatus.CUSTOMER_REVISION_REQUESTED,
]);

const SENT_TO_PRINT_STATUSES = new Set<string>([
  OrderStatus.CUSTOMER_APPROVED,
  OrderStatus.PENDING_PRINT,
  OrderStatus.PRINT_SUBMISSION_IN_PROGRESS,
  OrderStatus.PRINT_SUBMISSION_COMPLETED,
  OrderStatus.IN_PRODUCTION,
  OrderStatus.PENDING_SHIPPING,
]);

const SHIPPED_STATUSES = new Set<string>([OrderStatus.SHIPPED]);
const DELIVERED_STATUSES = new Set<string>([
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
]);

const NEW_STATUSES = new Set<string>([
  OrderStatus.NEW,
  OrderStatus.PENDING_PROCESSING,
  OrderStatus.QUEUED_FOR_PROCESSING,
]);

// Helper function to get phase based on display status and revision count
function getPhaseForDisplayStatus(displayStatus: DisplayStatus, revisionCount?: number): OrderPhase {
  const revisionCountNum = typeof revisionCount === 'number' ? revisionCount : 0;
  const isSecondReview = revisionCountNum >= 1;
  
  switch (displayStatus) {
    case DisplayStatus.IN_QUEUE:
      return OrderPhase.IN_QUEUE;
    case DisplayStatus.REVIEW_POSES:
    case DisplayStatus.REVIEW_BACKGROUNDS:
    case DisplayStatus.REVIEW_PAGES:
    case DisplayStatus.APPROVED: // Approved status appears in review phase
    case DisplayStatus.PROOF_READY:
        // If revisionCount >= 1, we're in second review (yellow), otherwise first review (blue)
        return isSecondReview ? OrderPhase.SECOND_REVIEW : OrderPhase.FIRST_REVIEW;
    case DisplayStatus.AWAITING_CUSTOMER:
    case DisplayStatus.NEEDS_REVISION:
      return OrderPhase.AWAITING_CUSTOMER;
    case DisplayStatus.READY_TO_PRINT:
    case DisplayStatus.PRINTING:
      return OrderPhase.SENT_TO_PRINT;
    case DisplayStatus.SHIPPED:
    case DisplayStatus.DELIVERED:
      return OrderPhase.SENT_TO_PRINT; // Keep in sent to print phase
    case DisplayStatus.ACTION_REQUIRED:
    case DisplayStatus.MISSING_MANIFEST:
    case DisplayStatus.MAX_RETRIES:
    case DisplayStatus.WORKFLOW_TIMEOUT:
    case DisplayStatus.API_ERROR:
    case DisplayStatus.STUCK_PROCESSING:
    case DisplayStatus.NOT_PICKED_UP:
    case DisplayStatus.MULTIPLE_ERRORS:
      return OrderPhase.IN_QUEUE; // All errors show in queue phase
    case DisplayStatus.MANUAL_REVIEW_REQUIRED:
      return OrderPhase.FIRST_REVIEW; // Show in review phase for manual intervention
    default:
      return OrderPhase.IN_QUEUE;
  }
}

function normalizeStageStatus(status?: string | null): string {
  return (status || 'pending').toLowerCase();
}

function hasStageAttention(stageStatus: string): boolean {
  const normalized = normalizeStageStatus(stageStatus);
  return normalized === ReviewStageStatus.REJECTED || normalized === ReviewStageStatus.FLAGGED;
}

function stageIsApproved(stageStatus: string): boolean {
  return normalizeStageStatus(stageStatus) === ReviewStageStatus.APPROVED;
}

function collectStageStatuses(order: Order | null | undefined): string[] {
  if (!order?.reviewStages) {
    return [];
  }
  const { preBria, postBria, postPdf } = order.reviewStages;
  return [
    normalizeStageStatus(preBria?.status),
    normalizeStageStatus(postBria?.status),
    normalizeStageStatus(postPdf?.status),
  ];
}

export interface DisplayStatusMetadata {
  status: DisplayStatus;
  phase: OrderPhase;
  errors?: DisplayStatus[]; // Array of all errors found (for multiple errors badge)
}

/**
 * Error type for error detection
 */
export type ErrorType = 
  | DisplayStatus.MISSING_MANIFEST
  | DisplayStatus.MAX_RETRIES
  | DisplayStatus.WORKFLOW_TIMEOUT
  | DisplayStatus.API_ERROR
  | DisplayStatus.STUCK_PROCESSING
  | DisplayStatus.NOT_PICKED_UP;

/**
 * Detect all error conditions for an order
 * Returns array of error types found
 */
function detectOrderErrors(order: Order): ErrorType[] {
  const errors: ErrorType[] = [];

  // Check for missing manifest
  if (!order.oneManifestUrl) {
    errors.push(DisplayStatus.MISSING_MANIFEST);
  }

  // Check for max retries
  if (order.retryCount !== null && order.retryCount !== undefined && order.retryCount >= 3) {
    errors.push(DisplayStatus.MAX_RETRIES);
  }

  // Check error_type field
  if (order.errorType) {
    if (order.errorType === 'workflow_timeout') {
      errors.push(DisplayStatus.WORKFLOW_TIMEOUT);
    } else if (order.errorType === 'api_error' || order.errorType === 'api_error') {
      errors.push(DisplayStatus.API_ERROR);
    } else if (order.errorType === 'missing_manifest') {
      errors.push(DisplayStatus.MISSING_MANIFEST);
    }
  }

  // Check for stuck processing (execution_status = 'processing' with started_at > 30 min ago)
  if (order.executionStatus === 'processing' && order.startedAt) {
    const startedAt = new Date(order.startedAt);
    const now = new Date();
    const minutesProcessing = Math.floor((now.getTime() - startedAt.getTime()) / 1000 / 60);
    if (minutesProcessing > 30) {
      errors.push(DisplayStatus.STUCK_PROCESSING);
    }
  }

  // Check for not picked up (ready_for_processing for extended time)
  if (order.executionStatus === 'ready_for_processing' && order.queuedAt) {
    const queuedAt = new Date(order.queuedAt);
    const now = new Date();
    const minutesQueued = Math.floor((now.getTime() - queuedAt.getTime()) / 1000 / 60);
    if (minutesQueued > 60) {
      errors.push(DisplayStatus.NOT_PICKED_UP);
    }
  }

  return errors;
}

/**
 * Get priority for error type (lower number = higher priority)
 */
function getErrorPriority(errorType: ErrorType): number {
  const priorities: Record<ErrorType, number> = {
    [DisplayStatus.MAX_RETRIES]: 1,
    [DisplayStatus.WORKFLOW_TIMEOUT]: 2,
    [DisplayStatus.MISSING_MANIFEST]: 3,
    [DisplayStatus.API_ERROR]: 4,
    [DisplayStatus.STUCK_PROCESSING]: 5,
    [DisplayStatus.NOT_PICKED_UP]: 6,
  };
  return priorities[errorType] || 99;
}

export function getDisplayStatusForOrder(order: Order): DisplayStatusMetadata {
  // Defensive check - handle null/undefined order
  if (!order) {
    return {
      status: DisplayStatus.IN_QUEUE,
      phase: OrderPhase.IN_QUEUE,
    };
  }

  const stageStatuses = collectStageStatuses(order);
  const stageNeedsAttention = stageStatuses.some(hasStageAttention);
  const hasFlags =
    order.hasFlags ||
    (typeof order.flags?.total === 'number' && order.flags.total > 0);
  // Check if any stage has progress (not pending and not undefined)
  // This includes "needs_review", "in-review", "approved", etc.
  const hasAnyStageProgress = stageStatuses.some(
    (status) =>
      status !== normalizeStageStatus(ReviewStageStatus.PENDING) &&
      status !== ReviewStageStatus.READY &&
      status !== undefined &&
      status !== ''
  );
  const allStagesApproved =
    stageStatuses.length === 3 &&
    stageStatuses.every((status) => stageIsApproved(status));

  const rawStatus = order.status;
  const customerApprovalStatus = order.customerApprovalStatus;
  const reviewStages = order.reviewStages || {};
  const executionStatus = order.executionStatus;

  // Check individual stage statuses to determine which review stage we're in
  const preBriaStatus = normalizeStageStatus(reviewStages.preBria?.status);
  const postBriaStatus = normalizeStageStatus(reviewStages.postBria?.status);
  const postPdfStatus = normalizeStageStatus(reviewStages.postPdf?.status);

  const revisionCount = typeof order.revisionCount === 'number' ? order.revisionCount : 0;

  // Handle error states (execution_status = 'error' or 'error_requires_manual_review')
  // This takes highest priority - show error badge for ANY error state
  // BUT: if execution_status is 'ready_for_processing' and error fields are cleared, don't show error badge
  
  // Detect all errors first
  const detectedErrors = detectOrderErrors(order);
  
  if (executionStatus === 'error_requires_manual_review') {
    // If we have detected errors, include them in the response
    const displayStatus = DisplayStatus.MANUAL_REVIEW_REQUIRED;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
      errors: detectedErrors.length > 0 ? detectedErrors : undefined
    };
  }
  
  // Handle error status - but only if error fields are actually set
  // If execution_status is 'error' but error_message and error_type are null, it was cleared
  if (executionStatus === 'error') {
    // Check if error fields are actually set (not cleared)
    const hasErrorFields = order.errorMessage || order.errorType;
    if (hasErrorFields) {
      // If multiple errors detected, show MULTIPLE_ERRORS badge
      if (detectedErrors.length > 1) {
        return {
          status: DisplayStatus.MULTIPLE_ERRORS,
          phase: getPhaseForDisplayStatus(DisplayStatus.ACTION_REQUIRED, revisionCount),
          errors: detectedErrors.sort((a, b) => getErrorPriority(a) - getErrorPriority(b))
        };
      }
      // If single error detected, show specific error badge
      if (detectedErrors.length === 1) {
        return {
          status: detectedErrors[0],
          phase: getPhaseForDisplayStatus(DisplayStatus.ACTION_REQUIRED, revisionCount),
          errors: detectedErrors
        };
      }
      // Fallback to generic ACTION_REQUIRED if no specific errors detected
      const displayStatus = DisplayStatus.ACTION_REQUIRED;
      return {
        status: displayStatus,
        phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
      };
    }
    // If error status but no error fields, it was cleared - treat as ready_for_processing
    // Fall through to normal status calculation
  }
  
  // Check for errors even if execution_status is not 'error'
  // (e.g., missing manifest, stuck processing, etc.)
  if (detectedErrors.length > 0) {
    // If multiple errors, show MULTIPLE_ERRORS badge
    if (detectedErrors.length > 1) {
      return {
        status: DisplayStatus.MULTIPLE_ERRORS,
        phase: getPhaseForDisplayStatus(DisplayStatus.ACTION_REQUIRED, revisionCount),
        errors: detectedErrors.sort((a, b) => getErrorPriority(a) - getErrorPriority(b))
      };
    }
    // If single error, show specific error badge
    return {
      status: detectedErrors[0],
      phase: getPhaseForDisplayStatus(DisplayStatus.ACTION_REQUIRED, revisionCount),
      errors: detectedErrors
    };
  }
  
  // If execution_status is 'ready_for_processing' and error fields are cleared, return normal status
  if (executionStatus === 'ready_for_processing' && !order.errorMessage && !order.errorType) {
    // Fall through to normal status calculation - don't show error badge
  }

  // Check if images/assets exist for each stage (defined once at the top)
  // IN_QUEUE = order exists but images haven't been generated yet
  // Once images exist, we move to review stages and NEVER go back to IN_QUEUE
  // 
  // We check multiple indicators because r2Assets might not be populated in list views:
  // 1. Direct r2Assets check (for individual order views where assets are loaded)
  // 2. preBria stage progress (if reviewed/approved, images definitely exist)
  // 3. characterHash + past generation phase (for list views where r2Assets isn't loaded)
  const isProcessing = rawStatus === OrderStatus.AI_GENERATION_IN_PROGRESS || 
                       rawStatus === OrderStatus.PENDING_BG_REMOVAL || 
                       rawStatus === OrderStatus.PENDING_ASSEMBLY;
  // preBria has progress if status is not "pending" (includes "needs_review", "in-review", "approved", etc.)
  const preBriaHasProgress = preBriaStatus !== ReviewStageStatus.PENDING && 
                             preBriaStatus !== undefined &&
                             preBriaStatus !== '';
  
  // Images exist if:
  // - r2Assets.poses exists and has items (direct check - works in detail views)
  // - OR preBria stage has progress (status is not "pending" - definitive proof images exist and were reviewed)
  // 
  // NOTE: We do NOT check characterHash alone because it can be set in the database
  // before images are actually generated. We only trust it if preBriaHasProgress is true.
  // This ensures we only show "Review Poses" when images actually exist.
  const hasPoses = (order.r2Assets?.poses && Array.isArray(order.r2Assets.poses) && order.r2Assets.poses.length > 0) ||
                   preBriaHasProgress;
  const hasBgRemovedPoses = (order.r2Assets?.posesBgRemoved && Array.isArray(order.r2Assets.posesBgRemoved) && order.r2Assets.posesBgRemoved.length > 0) ||
                            (postBriaStatus !== ReviewStageStatus.PENDING && postBriaStatus !== undefined);
  const hasPdf = order.reviewStages?.postPdf !== undefined; // If postPdf stage exists, PDF likely exists

  // Handle failure states first
  if (rawStatus && FAILURE_STATUSES.has(rawStatus)) {
    const displayStatus = DisplayStatus.ACTION_REQUIRED;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }

  // Handle delivered state
  if (
    rawStatus &&
    (DELIVERED_STATUSES.has(rawStatus) ||
      order.luluStatus === LuluStatus.DELIVERED)
  ) {
    const displayStatus = DisplayStatus.DELIVERED;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }

  // Handle shipped state
  if (
    rawStatus &&
    (SHIPPED_STATUSES.has(rawStatus) ||
      order.luluStatus === LuluStatus.SHIPPED)
  ) {
    const displayStatus = DisplayStatus.SHIPPED;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }

  // Handle customer revision requested (check this early)
  if (
    customerApprovalStatus === CustomerApprovalStatus.REVISION_REQUESTED ||
    (rawStatus && REVISION_STATUSES.has(rawStatus))
  ) {
    // If customer requested revision, show which stage needs review
    // Check which stage is not approved to determine where we are in the revision cycle
    // IMPORTANT: Only show review statuses if images/assets actually exist
    
    if (!stageIsApproved(preBriaStatus) && hasPoses) {
      const displayStatus = DisplayStatus.REVIEW_POSES;
      return {
        status: displayStatus,
        phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
      };
    }
    if (!stageIsApproved(postBriaStatus) && hasBgRemovedPoses) {
      const displayStatus = DisplayStatus.REVIEW_BACKGROUNDS;
      return {
        status: displayStatus,
        phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
      };
    }
    if (!stageIsApproved(postPdfStatus) && hasPdf) {
      const displayStatus = DisplayStatus.REVIEW_PAGES;
      return {
        status: displayStatus,
        phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
      };
    }
    // Fallback to needs revision if we can't determine stage or images don't exist
    const displayStatus = DisplayStatus.NEEDS_REVISION;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }

  // Handle proof sent / awaiting customer (check this BEFORE checking allStagesApproved)
  // This takes priority - if proof was sent to customer, we're awaiting their response
  const proofSent =
    customerApprovalStatus === CustomerApprovalStatus.PENDING ||
    rawStatus === OrderStatus.PENDING_CUSTOMER_APPROVAL ||
    Boolean(order.customerApprovalRequestedAt);

  if (proofSent) {
    const displayStatus = DisplayStatus.AWAITING_CUSTOMER;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }

  // Handle all stages approved - check if ready to print or proof ready
  if (allStagesApproved) {
    // Check if customer has approved - if so, show "Ready to Print" or "Printing"
    // (This happens after customer approves and admin clicks "Final Approval" a second time)
    if (customerApprovalStatus === CustomerApprovalStatus.APPROVED || 
        rawStatus === OrderStatus.CUSTOMER_APPROVED) {
      // Check if it's actually been sent to print (lulu_status or PENDING_PRINT)
      // If it's been sent to print, show "Printing", otherwise "Ready to Print"
      if (rawStatus === OrderStatus.PENDING_PRINT ||
          order.luluStatus ||
          rawStatus === OrderStatus.PRINT_SUBMISSION_IN_PROGRESS ||
          rawStatus === OrderStatus.PRINT_SUBMISSION_COMPLETED ||
          rawStatus === OrderStatus.IN_PRODUCTION ||
          (rawStatus && SENT_TO_PRINT_STATUSES.has(rawStatus))) {
        const displayStatus = DisplayStatus.PRINTING;
        return {
          status: displayStatus,
          phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
        };
      }
      // Customer approved but not yet sent to print
      const displayStatus = DisplayStatus.READY_TO_PRINT;
      return {
        status: displayStatus,
        phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
      };
    }
    // All stages approved but not yet sent to customer (first "Final Approval" not clicked yet)
    const displayStatus = DisplayStatus.PROOF_READY;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }

  // Handle printing state (in production) - only show if customer has approved
  // This is a fallback for orders that are in production but don't have all stages approved
  // (shouldn't normally happen, but handle edge cases)
  if (
    (customerApprovalStatus === CustomerApprovalStatus.APPROVED || 
     rawStatus === OrderStatus.CUSTOMER_APPROVED) &&
    rawStatus &&
    (SENT_TO_PRINT_STATUSES.has(rawStatus) ||
      order.luluStatus === LuluStatus.ORDER_RECEIVED ||
      order.luluStatus === LuluStatus.PROCESSING ||
      order.luluStatus === LuluStatus.FULFILLING)
  ) {
    const displayStatus = DisplayStatus.PRINTING;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }

  // Handle review stages - determine which stage needs review
  // Check in reverse order (postPdf -> postBria -> preBria) to find first unapproved stage
  // IMPORTANT: Only show review statuses if images/assets actually exist
  
  // Check if workflows have been triggered
  // Background removal is triggered if:
  // 1. Background-removed images actually exist (hasBgRemovedPoses), OR
  // 2. Workflow step indicates 2B has completed (W2B_COMPLETE, BRIA_PROCESSING_COMPLETE), OR
  // 3. Status is PENDING_BG_REMOVAL AND preBria is approved (workflow has been queued/triggered)
  // We check PENDING_BG_REMOVAL only when preBria is approved to distinguish from status set before approval
  const bgRemovalTriggered = hasBgRemovedPoses || 
                              order.workflowStep === WorkflowStep.W2B_COMPLETE ||
                              order.workflowStep === WorkflowStep.BRIA_PROCESSING_COMPLETE ||
                              order.workflowStep === WorkflowStep.BOOK_ASSEMBLY_COMPLETED ||
                              (rawStatus === OrderStatus.PENDING_BG_REMOVAL && stageIsApproved(preBriaStatus));
  
  // Book assembly is triggered ONLY if:
  // 1. PDF actually exists (hasPdf), OR
  // 2. Workflow step indicates book assembly has been triggered or completed:
  //    - '3-queued' (workflow has been explicitly triggered)
  //    - 'book_assembly_completed' (workflow has completed)
  // We do NOT check:
  // - postPdf stage existence (stage can exist before workflow is triggered)
  // - PENDING_ASSEMBLY status (can be set before workflow is triggered)
  // - PENDING_ASSEMBLY_REVIEW status (can be set before workflow is triggered)
  // The workflow must be explicitly triggered via "Trigger Book Assembly" button
  const bookAssemblyTriggered = hasPdf ||
                                order.workflowStep === WorkflowStep.BOOK_ASSEMBLY_COMPLETED ||
                                order.workflowStep === '3-queued';
  
  // Priority 1: Check if postPdf stage needs review (book assembly complete)
  // Only show "Review Pages" if book assembly has been triggered
  if (!stageIsApproved(postPdfStatus) && 
      stageIsApproved(preBriaStatus) && 
      stageIsApproved(postBriaStatus) &&
      bookAssemblyTriggered) {
    const displayStatus = DisplayStatus.REVIEW_PAGES;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }
  
  // Priority 2: If postPdf is approved but "Send Proof" hasn't been clicked yet, stay in "Review Pages"
  // Don't show "Approved" - keep showing the current stage until workflow is triggered
  if (stageIsApproved(postPdfStatus) && 
      stageIsApproved(preBriaStatus) && 
      stageIsApproved(postBriaStatus) &&
      !proofSent) {
    const displayStatus = DisplayStatus.REVIEW_PAGES;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }

  // Priority 3: Check if postBria stage needs review (background removal complete)
  // Only show "Review Backgrounds" if bgRemoval has been triggered
  if (!stageIsApproved(postBriaStatus) && 
      stageIsApproved(preBriaStatus) &&
      bgRemovalTriggered) {
    const displayStatus = DisplayStatus.REVIEW_BACKGROUNDS;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }
  
  // Priority 4: If postBria is approved but "Trigger Book Assembly" hasn't been clicked yet, stay in "Review Backgrounds"
  // Don't show "Approved" - keep showing the current stage until workflow is triggered
  if (stageIsApproved(postBriaStatus) && 
      stageIsApproved(preBriaStatus) &&
      !bookAssemblyTriggered) {
    const displayStatus = DisplayStatus.REVIEW_BACKGROUNDS;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }

  // Priority 5: Check if preBria stage needs review (images exist)
  if (!stageIsApproved(preBriaStatus) && hasPoses) {
    const displayStatus = DisplayStatus.REVIEW_POSES;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }
  
  // Priority 6: If preBria is approved but "Trigger Background Removal" hasn't been clicked yet, stay in "Review Poses"
  // Don't show "Approved" - keep showing the current stage until workflow is triggered
  if (stageIsApproved(preBriaStatus) && 
      !bgRemovalTriggered) {
    const displayStatus = DisplayStatus.REVIEW_POSES;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }

  // Handle new orders (in queue) - ONLY if images don't exist yet
  // IN_QUEUE is only for orders that are newly submitted and don't have images
  // IMPORTANT: If hasPoses is true (images exist), we NEVER show IN_QUEUE
  if (
    !hasPoses && // No images generated yet - this is the primary check
    (rawStatus === OrderStatus.NEW || 
     rawStatus === OrderStatus.PENDING_PROCESSING || 
     rawStatus === OrderStatus.QUEUED_FOR_PROCESSING ||
     rawStatus === OrderStatus.AI_GENERATION_IN_PROGRESS ||
     (rawStatus && NEW_STATUSES.has(rawStatus))) &&
    !hasAnyStageProgress &&
    !proofSent
  ) {
    const displayStatus = DisplayStatus.IN_QUEUE;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }

  // Default fallback - show first unapproved stage or in queue
  // Only show REVIEW_POSES if images actually exist
  if (!stageIsApproved(preBriaStatus) && hasPoses) {
    const displayStatus = DisplayStatus.REVIEW_POSES;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }

  // If images exist but we haven't matched any review stage, check if stages are approved
  // This handles cases where all stages might be approved but we haven't hit PROOF_READY yet
  if (hasPoses) {
    // If we have images, we're past the queue stage
    // Fallback to REVIEW_POSES if preBria is not approved (even if we didn't match above)
    if (!stageIsApproved(preBriaStatus)) {
      const displayStatus = DisplayStatus.REVIEW_POSES;
      return {
        status: displayStatus,
        phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
      };
    }
    // If all stages are approved but we haven't matched PROOF_READY, show PROOF_READY
    if (allStagesApproved) {
      const displayStatus = DisplayStatus.PROOF_READY;
      return {
        status: displayStatus,
        phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
      };
    }
  }

  // Only show IN_QUEUE if no images exist AND order is in a new/processing state
  // This is the true "in queue" state - waiting for character generation
  // Note: isProcessing is already defined above, so we use it here
  
  if (!hasPoses && (
    (rawStatus && NEW_STATUSES.has(rawStatus)) ||
    isProcessing
  )) {
    const displayStatus = DisplayStatus.IN_QUEUE;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }

  // Final fallback - if we have images but can't determine status, show REVIEW_POSES
  // This ensures we never show IN_QUEUE for orders with images
  if (hasPoses) {
    const displayStatus = DisplayStatus.REVIEW_POSES;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }

  // Absolute last fallback - IN_QUEUE only if truly no images and no progress
  const displayStatus = DisplayStatus.IN_QUEUE;
  return {
    status: displayStatus,
    phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
  };
}

export function getStageBadgeStatus(stageStatus?: string | null, stageKey?: 'preBria' | 'postBria' | 'postPdf'): DisplayStatus {
  const normalized = normalizeStageStatus(stageStatus);
  if (normalized === ReviewStageStatus.APPROVED) {
    // Map to appropriate review stage based on stageKey, or default to proof ready
    if (stageKey === 'preBria') {
      return DisplayStatus.REVIEW_BACKGROUNDS; // After preBria approved, next is postBria
    }
    if (stageKey === 'postBria') {
      return DisplayStatus.REVIEW_PAGES; // After postBria approved, next is postPdf
    }
    if (stageKey === 'postPdf') {
      return DisplayStatus.PROOF_READY; // After postPdf approved, ready for proof
    }
    return DisplayStatus.PROOF_READY;
  }
  if (normalized === ReviewStageStatus.REJECTED || normalized === ReviewStageStatus.FLAGGED) {
    // Map to appropriate review stage for correction
    if (stageKey === 'preBria') {
      return DisplayStatus.REVIEW_POSES;
    }
    if (stageKey === 'postBria') {
      return DisplayStatus.REVIEW_BACKGROUNDS;
    }
    if (stageKey === 'postPdf') {
      return DisplayStatus.REVIEW_PAGES;
    }
    return DisplayStatus.NEEDS_REVISION;
  }
  // Map pending stages to appropriate review stage
  if (stageKey === 'preBria') {
    return DisplayStatus.REVIEW_POSES;
  }
  if (stageKey === 'postBria') {
    return DisplayStatus.REVIEW_BACKGROUNDS;
  }
  if (stageKey === 'postPdf') {
    return DisplayStatus.REVIEW_PAGES;
  }
  return DisplayStatus.IN_QUEUE;
}

/**
 * Get phase for an order (for use in groupOrdersByPhase)
 * This function considers revisionCount to determine first vs second review
 */
export function getPhaseForOrder(order: Order | OrderListItem): OrderPhase {
  const display = getDisplayStatusForOrder(order as Order);
  return display.phase;
}

export function buildOrderListItem(order: Order): OrderListItem {
  const display = getDisplayStatusForOrder(order);
  return {
    orderId: order.orderId,
    platform: order.platform,
    firstName: order.customer?.firstName || '',
    lastName: order.customer?.lastName || '',
    status: display.status,
    rawStatus: order.status,
    phase: display.phase,
    orderDate: order.orderDate,
    characterHash: order.characterHash,
    reviewStages: order.reviewStages,
    customerApprovalStatus: order.customerApprovalStatus ?? null,
    hasFlags: order.hasFlags ?? false,
    flags: order.flags ?? {},
    revisionCount: typeof order.revisionCount === 'number' ? order.revisionCount : 0,
    errors: display.errors, // Include errors array for multiple errors badge
  };
}

