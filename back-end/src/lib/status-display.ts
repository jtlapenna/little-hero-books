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
      return OrderPhase.IN_QUEUE; // Fallback to in queue for errors
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
}

export function getDisplayStatusForOrder(order: Order): DisplayStatusMetadata {
  const stageStatuses = collectStageStatuses(order);
  const stageNeedsAttention = stageStatuses.some(hasStageAttention);
  const hasFlags =
    order.hasFlags ||
    (typeof order.flags?.total === 'number' && order.flags.total > 0);
  const hasAnyStageProgress = stageStatuses.some(
    (status) =>
      status !== normalizeStageStatus(ReviewStageStatus.PENDING) &&
      status !== ReviewStageStatus.READY
  );
  const allStagesApproved =
    stageStatuses.length === 3 &&
    stageStatuses.every((status) => stageIsApproved(status));

  const rawStatus = order.status;
  const customerApprovalStatus = order.customerApprovalStatus;
  const reviewStages = order.reviewStages || {};

  // Check individual stage statuses to determine which review stage we're in
  const preBriaStatus = normalizeStageStatus(reviewStages.preBria?.status);
  const postBriaStatus = normalizeStageStatus(reviewStages.postBria?.status);
  const postPdfStatus = normalizeStageStatus(reviewStages.postPdf?.status);

  const revisionCount = typeof order.revisionCount === 'number' ? order.revisionCount : 0;

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
    if (!stageIsApproved(preBriaStatus)) {
      const displayStatus = DisplayStatus.REVIEW_POSES;
      return {
        status: displayStatus,
        phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
      };
    }
    if (!stageIsApproved(postBriaStatus)) {
      const displayStatus = DisplayStatus.REVIEW_BACKGROUNDS;
      return {
        status: displayStatus,
        phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
      };
    }
    if (!stageIsApproved(postPdfStatus)) {
      const displayStatus = DisplayStatus.REVIEW_PAGES;
      return {
        status: displayStatus,
        phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
      };
    }
    // Fallback to needs revision if we can't determine stage
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
  if (!stageIsApproved(postPdfStatus) && 
      stageIsApproved(preBriaStatus) && 
      stageIsApproved(postBriaStatus)) {
    const displayStatus = DisplayStatus.REVIEW_PAGES;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }

  if (!stageIsApproved(postBriaStatus) && stageIsApproved(preBriaStatus)) {
    const displayStatus = DisplayStatus.REVIEW_BACKGROUNDS;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }

  if (!stageIsApproved(preBriaStatus)) {
    const displayStatus = DisplayStatus.REVIEW_POSES;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }

  // Handle new orders (in queue)
  if (
    rawStatus &&
    NEW_STATUSES.has(rawStatus) &&
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
  if (!stageIsApproved(preBriaStatus)) {
    const displayStatus = DisplayStatus.REVIEW_POSES;
    return {
      status: displayStatus,
      phase: getPhaseForDisplayStatus(displayStatus, revisionCount),
    };
  }

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
  };
}

