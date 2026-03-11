import { Order, OrderListItem } from '@/types/order';
import {
  CustomerApprovalStatus,
  DisplayStatus,
  LuluStatus,
  OrderStatus,
  ReviewStageStatus,
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
      // If ACTION_REQUIRED is due to cancelled print, show in SENT_TO_PRINT phase
      // This will be handled by getPhaseForOrder which has access to the full order
      return OrderPhase.IN_QUEUE; // Default, but getPhaseForOrder will override if needed
    case DisplayStatus.MISSING_MANIFEST:
    case DisplayStatus.MAX_RETRIES:
    case DisplayStatus.WORKFLOW_TIMEOUT:
    case DisplayStatus.API_ERROR:
    case DisplayStatus.PRINT_QA_FAILED:
    case DisplayStatus.STUCK_PROCESSING:
    case DisplayStatus.NOT_PICKED_UP:
    case DisplayStatus.MULTIPLE_ERRORS:
      return OrderPhase.IN_QUEUE; // All other errors show in queue phase
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
  workflowStatus: DisplayStatus;      // NEW: Always shows workflow position
  technicalStatus?: DisplayStatus;    // NEW: Only set when errors exist
  phase: OrderPhase;
  errors?: DisplayStatus[];           // Array of all errors found (for multiple errors badge)
  
  // Deprecated (keep for backward compatibility during migration)
  status: DisplayStatus;
}

/**
 * Error type for error detection
 */
export type ErrorType = 
  | DisplayStatus.MISSING_MANIFEST
  | DisplayStatus.MAX_RETRIES
  | DisplayStatus.WORKFLOW_TIMEOUT
  | DisplayStatus.API_ERROR
  | DisplayStatus.PRINT_QA_FAILED
  | DisplayStatus.STUCK_PROCESSING
  | DisplayStatus.NOT_PICKED_UP;

/**
 * Detect all error conditions for an order
 * Returns array of error types found
 */
function detectOrderErrors(order: Order): ErrorType[] {
  const errors: ErrorType[] = [];

  // Check for missing manifest
  // An order is missing a manifest if it has NO manifests at all (neither 1-manifest, 2a, 2b, nor 3)
  // Orders that have progressed past W0 may not have 1-manifest but should have 2a/2b/3 manifests
  const hasAnyManifest = !!(
    order.oneManifestUrl ||
    order.manifest2aUrl ||
    order.manifest2bUrl ||
    order.manifest3Url
  );
  
  if (!hasAnyManifest) {
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
    } else if (order.errorType === 'print_qa_failed') {
      errors.push(DisplayStatus.PRINT_QA_FAILED);
    } else if (order.errorType === 'missing_manifest') {
      errors.push(DisplayStatus.MISSING_MANIFEST);
    }
  }

  // Check for stuck processing (execution_status = 'processing' with started_at > 30 min ago)
  // IMPORTANT: Exclude orders that have completed their workflow (check workflow_step)
  // AND exclude customer-approved orders (they're waiting for print, not stuck)
  // These are waiting for review/approval, not actually stuck
  if (order.executionStatus === 'processing' && order.startedAt) {
    // Check if workflow has completed by checking workflow_step
    // When workflow completes, workflow_step is set to '2A-complete', '2B-complete', etc.
    const hasCompletedWorkflow = 
      order.workflowStep === '2A-complete' ||
      order.workflowStep === '2B-complete' ||
      order.workflowStep === 'bria_processing_complete' ||
      order.workflowStep === 'book_assembly_completed' ||
      order.workflowStep === 'ai_generation_completed' ||
      order.workflowStep === 'customer_approval' ||
      order.workflowStep === 'print_fulfillment';
    
    // Check if customer has approved (waiting for print, not stuck)
    const isCustomerApproved = 
      order.customerApprovalStatus === 'approved' ||
      order.customerApprovalStatus === CustomerApprovalStatus.APPROVED;
    
    // Only mark as stuck if workflow hasn't completed AND customer hasn't approved
    if (!hasCompletedWorkflow && !isCustomerApproved) {
      const startedAt = new Date(order.startedAt);
      const now = new Date();
      const minutesProcessing = Math.floor((now.getTime() - startedAt.getTime()) / 1000 / 60);
      if (minutesProcessing > 30) {
        errors.push(DisplayStatus.STUCK_PROCESSING);
      }
    }
  }
  
  // Also check for stuck processing when started_at is null but execution_status is 'processing'
  // This catches orders that were set to processing but never had started_at set
  // BUT: exclude if workflow has completed (check workflow_step) OR customer has approved
  if (order.executionStatus === 'processing' && !order.startedAt) {
    // Check if workflow has completed by checking workflow_step
    const hasCompletedWorkflow = 
      order.workflowStep === '2A-complete' ||
      order.workflowStep === '2B-complete' ||
      order.workflowStep === 'bria_processing_complete' ||
      order.workflowStep === 'book_assembly_completed' ||
      order.workflowStep === 'ai_generation_completed' ||
      order.workflowStep === 'customer_approval' ||
      order.workflowStep === 'print_fulfillment';
    
    // Check if customer has approved (waiting for print, not stuck)
    const isCustomerApproved = 
      order.customerApprovalStatus === 'approved' ||
      order.customerApprovalStatus === CustomerApprovalStatus.APPROVED;
    
    // Only mark as stuck if workflow hasn't completed AND customer hasn't approved
    if (!hasCompletedWorkflow && !isCustomerApproved) {
      errors.push(DisplayStatus.STUCK_PROCESSING);
    }
  }

  // Check for not picked up (ready_for_processing for extended time)
  // Exclude orders already sent to Lulu (printing) — they don't need "Not Picked Up"
  const alreadyPrinting = !!(order.luluJobId || order.luluStatus);
  if (
    !alreadyPrinting &&
    order.executionStatus === 'ready_for_processing' &&
    order.queuedAt
  ) {
    const queuedAt = new Date(order.queuedAt);
    const now = new Date();
    const minutesQueued = Math.floor((now.getTime() - queuedAt.getTime()) / 1000 / 60);
    if (minutesQueued > 60) {
      errors.push(DisplayStatus.NOT_PICKED_UP);
    }
  }

  // Deduplicate errors (e.g., MISSING_MANIFEST can be detected from both oneManifestUrl and errorType)
  const uniqueErrors = Array.from(new Set(errors));
  return uniqueErrors;
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
    [DisplayStatus.PRINT_QA_FAILED]: 5,
    [DisplayStatus.STUCK_PROCESSING]: 6,
    [DisplayStatus.NOT_PICKED_UP]: 7,
  };
  return priorities[errorType] || 99;
}

/**
 * Calculate workflow status (ignoring technical errors)
 * This shows where the order is in the production workflow
 */
function calculateWorkflowStatus(order: Order): DisplayStatus {
  // Defensive check
  if (!order) {
    return DisplayStatus.IN_QUEUE;
  }

  const stageStatuses = collectStageStatuses(order);
  const allStagesApproved = stageStatuses.length === 3 && stageStatuses.every(stageIsApproved);
  const customerApprovalStatus = order.customerApprovalStatus;
  const rawStatus = order.status;

  // Priority order (WITHOUT error checks - only workflow progression):
  
  // 0. Check lulu_status FIRST if order has been sent to print (highest priority for print statuses)
  // Once an order is sent to print, lulu_status takes precedence over workflow status
  if (order.luluStatus) {
    // Check for final print statuses first
    if (order.luluStatus === LuluStatus.DELIVERED) {
      return DisplayStatus.DELIVERED;
    }
    if (order.luluStatus === LuluStatus.SHIPPED) {
      return DisplayStatus.SHIPPED;
    }
    // Check for cancelled status - if print was cancelled, show that
    if (order.luluStatus === LuluStatus.CANCELED) {
      return DisplayStatus.ACTION_REQUIRED; // Show as action required when cancelled
    }
    // Check for production statuses
    if (order.luluStatus === LuluStatus.IN_PRODUCTION || 
        order.luluStatus === LuluStatus.PRODUCTION_READY ||
        order.luluStatus === LuluStatus.PRODUCTION_DELAYED ||
        order.luluStatus === LuluStatus.PAYMENT_IN_PROGRESS ||
        order.luluStatus === LuluStatus.UNPAID ||
        order.luluStatus === LuluStatus.CREATED) {
      return DisplayStatus.PRINTING;
    }
    // If order has lulu_status but doesn't match above, it's still in print workflow
    if (order.luluJobId) {
      return DisplayStatus.PRINTING;
    }
  }
  
  // 1. Delivered/Shipped (fallback if lulu_status not set)
  if (rawStatus && (DELIVERED_STATUSES.has(rawStatus) || order.luluStatus === LuluStatus.DELIVERED)) {
    return DisplayStatus.DELIVERED;
  }
  if (rawStatus && (SHIPPED_STATUSES.has(rawStatus) || order.luluStatus === LuluStatus.SHIPPED)) {
    return DisplayStatus.SHIPPED;
  }

  // 2. Customer revision requested
  if (customerApprovalStatus === CustomerApprovalStatus.REVISION_REQUESTED || 
      (rawStatus && REVISION_STATUSES.has(rawStatus))) {
    // Determine which stage needs revision
    const preBriaStatus = normalizeStageStatus(order.reviewStages?.preBria?.status);
    const postBriaStatus = normalizeStageStatus(order.reviewStages?.postBria?.status);
    const postPdfStatus = normalizeStageStatus(order.reviewStages?.postPdf?.status);
    
    if (!stageIsApproved(preBriaStatus)) return DisplayStatus.REVIEW_POSES;
    if (!stageIsApproved(postBriaStatus)) return DisplayStatus.REVIEW_BACKGROUNDS;
    if (!stageIsApproved(postPdfStatus)) return DisplayStatus.REVIEW_PAGES;
    return DisplayStatus.NEEDS_REVISION;
  }

  // 3. Awaiting customer (only if not already approved)
  const isCustomerApproved = customerApprovalStatus === CustomerApprovalStatus.APPROVED || 
                             rawStatus === OrderStatus.CUSTOMER_APPROVED ||
                             Boolean(order.customerApprovalApprovedAt);
  
  // Check if proof was sent (used in multiple places)
  const proofSent = customerApprovalStatus === CustomerApprovalStatus.PENDING ||
                   rawStatus === OrderStatus.PENDING_CUSTOMER_APPROVAL ||
                   Boolean(order.customerApprovalRequestedAt);
  
  // Only show "awaiting customer" if proof was sent AND customer hasn't approved yet
  if (!isCustomerApproved && proofSent) {
    return DisplayStatus.AWAITING_CUSTOMER;
  }

  // 4. All stages approved
  if (allStagesApproved) {
    if (customerApprovalStatus === CustomerApprovalStatus.APPROVED || 
        rawStatus === OrderStatus.CUSTOMER_APPROVED) {
      // Check if sent to print
      const isWithLulu = order.luluStatus && (
        order.luluStatus === LuluStatus.CREATED ||
        order.luluStatus === LuluStatus.UNPAID ||
        order.luluStatus === LuluStatus.PAYMENT_IN_PROGRESS ||
        order.luluStatus === LuluStatus.PRODUCTION_DELAYED ||
        order.luluStatus === LuluStatus.PRODUCTION_READY ||
        order.luluStatus === LuluStatus.IN_PRODUCTION ||
        order.luluStatus === LuluStatus.SHIPPED ||
        order.luluStatus === LuluStatus.DELIVERED
      );
      
      if (rawStatus === OrderStatus.PENDING_PRINT ||
          isWithLulu ||
          rawStatus === OrderStatus.PRINT_SUBMISSION_IN_PROGRESS ||
          rawStatus === OrderStatus.PRINT_SUBMISSION_COMPLETED ||
          rawStatus === OrderStatus.IN_PRODUCTION ||
          (rawStatus && SENT_TO_PRINT_STATUSES.has(rawStatus))) {
        return DisplayStatus.PRINTING;
      }
      return DisplayStatus.READY_TO_PRINT;
    }
    return DisplayStatus.PROOF_READY;
  }

  // 5. Review stages
  const preBriaStatus = normalizeStageStatus(order.reviewStages?.preBria?.status);
  const postBriaStatus = normalizeStageStatus(order.reviewStages?.postBria?.status);
  const postPdfStatus = normalizeStageStatus(order.reviewStages?.postPdf?.status);

  if (!stageIsApproved(postPdfStatus) && stageIsApproved(preBriaStatus) && stageIsApproved(postBriaStatus)) {
    return DisplayStatus.REVIEW_PAGES;
  }
  if (!stageIsApproved(postBriaStatus) && stageIsApproved(preBriaStatus)) {
    return DisplayStatus.REVIEW_BACKGROUNDS;
  }
  
  const preBriaHasProgress = preBriaStatus !== normalizeStageStatus(ReviewStageStatus.PENDING) &&
                             preBriaStatus !== ReviewStageStatus.READY &&
                             preBriaStatus !== undefined &&
                             preBriaStatus !== '';
  if (!stageIsApproved(preBriaStatus) && preBriaHasProgress) {
    return DisplayStatus.REVIEW_POSES;
  }

  // 6. New/In Queue
  const hasAnyStageProgress = stageStatuses.some(
    status => status !== normalizeStageStatus(ReviewStageStatus.PENDING) &&
              status !== ReviewStageStatus.READY &&
              status !== undefined &&
              status !== ''
  );
  if (rawStatus && NEW_STATUSES.has(rawStatus) && !hasAnyStageProgress && !proofSent) {
    const isActuallyQueued = order.executionStatus === 'ready_for_processing' && order.queuedAt;
    return isActuallyQueued ? DisplayStatus.IN_QUEUE : DisplayStatus.NEW;
  }

  // 7. Default fallback
  if (!stageIsApproved(preBriaStatus) && preBriaHasProgress) {
    return DisplayStatus.REVIEW_POSES;
  }
  
  return DisplayStatus.IN_QUEUE;
}

export function getDisplayStatusForOrder(order: Order): DisplayStatusMetadata {
  // Defensive check - handle null/undefined order
  if (!order) {
    return {
      workflowStatus: DisplayStatus.IN_QUEUE,
      technicalStatus: undefined,
      status: DisplayStatus.IN_QUEUE, // Backward compatibility
      phase: OrderPhase.IN_QUEUE,
    };
  }

  // Step 1: Detect all technical errors first
  const detectedErrors = detectOrderErrors(order);
  const technicalStatus = detectedErrors.length > 1 
    ? DisplayStatus.MULTIPLE_ERRORS 
    : (detectedErrors.length === 1 ? detectedErrors[0] : undefined);

  // Step 2: Calculate workflow status (ignoring errors)
  const workflowStatus = calculateWorkflowStatus(order);

  // Step 3: Calculate phase based on workflow status
  const phase = getPhaseForDisplayStatus(workflowStatus, order.revisionCount);

  // Step 4: Return both statuses
  return {
    workflowStatus,
    technicalStatus,
    phase,
    errors: detectedErrors.length > 0 ? detectedErrors : undefined,
    
    // Backward compatibility (deprecated - will be removed in future)
    status: technicalStatus || workflowStatus
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
 * Also handles special cases like cancelled print orders and lifecycle status
 */
export function getPhaseForOrder(order: Order | OrderListItem): OrderPhase {
  // Check lifecycle_status first - takes precedence over workflow status
  const lifecycleStatus = (order as any).lifecycle_status || (order as any).lifecycleStatus;
  if (lifecycleStatus === 'recently_delivered') {
    return OrderPhase.RECENTLY_DELIVERED;
  }
  if (lifecycleStatus === 'archived') {
    return OrderPhase.ARCHIVED;
  }
  
  const display = getDisplayStatusForOrder(order as Order);
  
  // Special case: If order has lulu_status (sent to print) and is ACTION_REQUIRED (cancelled),
  // show it in SENT_TO_PRINT phase instead of IN_QUEUE
  if (display.workflowStatus === DisplayStatus.ACTION_REQUIRED && 
      (order as Order).luluStatus && 
      (order as Order).luluJobId) {
    return OrderPhase.SENT_TO_PRINT;
  }
  
  return display.phase;
}

export function buildOrderListItem(order: Order): OrderListItem {
  const display = getDisplayStatusForOrder(order);
  // Use getPhaseForOrder to ensure correct phase assignment (handles special cases like cancelled prints)
  const phase = getPhaseForOrder(order);
  return {
    orderId: order.orderId,
    platform: order.platform,
    rootOrderId: order.rootOrderId,
    isSibling: order.isSibling,
    itemNumber: order.itemNumber,
    totalSiblings: order.totalSiblings,
    firstName: order.customer?.firstName || '',
    lastName: order.customer?.lastName || '',
    workflowStatus: display.workflowStatus,      // NEW: Always shows workflow position
    technicalStatus: display.technicalStatus,    // NEW: Only set when errors exist
    status: display.status,                      // Backward compatibility
    rawStatus: order.status,
    phase: phase,                                // Use getPhaseForOrder for correct phase assignment
    orderDate: order.orderDate,
    characterHash: order.characterHash,
    reviewStages: order.reviewStages,
    customerApprovalStatus: order.customerApprovalStatus ?? null,
    hasFlags: order.hasFlags ?? false,
    flags: order.flags ?? {},
    revisionCount: typeof order.revisionCount === 'number' ? order.revisionCount : 0,
    reprintCount: typeof order.reprintCount === 'number' ? order.reprintCount : 0,
    reprintReason: order.reprintReason,
    reprintNote: order.reprintNote,
    errors: display.errors,
    lifecycle_status: (order as any).lifecycle_status || 'active',
  };
}
