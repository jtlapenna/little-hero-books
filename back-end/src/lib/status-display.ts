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

const DISPLAY_STATUS_TO_PHASE: Record<DisplayStatus, OrderPhase> = {
  [DisplayStatus.NEW]: OrderPhase.GENERATION,
  [DisplayStatus.PENDING]: OrderPhase.REVIEW,
  [DisplayStatus.APPROVED]: OrderPhase.REVIEW,
  [DisplayStatus.PROOF_SENT]: OrderPhase.CUSTOMER_APPROVAL,
  [DisplayStatus.CORRECTION_REQUESTED]: OrderPhase.CUSTOMER_APPROVAL,
  [DisplayStatus.SENT_TO_PRINT]: OrderPhase.PRODUCTION,
  [DisplayStatus.SHIPPED]: OrderPhase.SHIPPING,
  [DisplayStatus.DELIVERED]: OrderPhase.COMPLETED,
  [DisplayStatus.ACTION_REQUIRED]: OrderPhase.FAILED,
};

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

  if (rawStatus && FAILURE_STATUSES.has(rawStatus)) {
    return {
      status: DisplayStatus.ACTION_REQUIRED,
      phase: DISPLAY_STATUS_TO_PHASE[DisplayStatus.ACTION_REQUIRED],
    };
  }

  if (
    stageNeedsAttention ||
    hasFlags ||
    (rawStatus && REVISION_STATUSES.has(rawStatus)) ||
    customerApprovalStatus === CustomerApprovalStatus.REVISION_REQUESTED
  ) {
    return {
      status: DisplayStatus.CORRECTION_REQUESTED,
      phase: DISPLAY_STATUS_TO_PHASE[DisplayStatus.CORRECTION_REQUESTED],
    };
  }

  if (
    rawStatus &&
    (DELIVERED_STATUSES.has(rawStatus) ||
      order.luluStatus === LuluStatus.DELIVERED)
  ) {
    return {
      status: DisplayStatus.DELIVERED,
      phase: DISPLAY_STATUS_TO_PHASE[DisplayStatus.DELIVERED],
    };
  }

  if (
    rawStatus &&
    (SHIPPED_STATUSES.has(rawStatus) ||
      order.luluStatus === LuluStatus.SHIPPED)
  ) {
    return {
      status: DisplayStatus.SHIPPED,
      phase: DISPLAY_STATUS_TO_PHASE[DisplayStatus.SHIPPED],
    };
  }

  if (
    rawStatus &&
    (SENT_TO_PRINT_STATUSES.has(rawStatus) ||
      order.luluStatus === LuluStatus.ORDER_RECEIVED ||
      order.luluStatus === LuluStatus.PROCESSING ||
      order.luluStatus === LuluStatus.FULFILLING)
  ) {
    return {
      status: DisplayStatus.SENT_TO_PRINT,
      phase: DISPLAY_STATUS_TO_PHASE[DisplayStatus.SENT_TO_PRINT],
    };
  }

  const proofSent =
    customerApprovalStatus === CustomerApprovalStatus.PENDING ||
    rawStatus === OrderStatus.PENDING_CUSTOMER_APPROVAL ||
    Boolean(order.customerApprovalRequestedAt);

  if (proofSent) {
    return {
      status: DisplayStatus.PROOF_SENT,
      phase: DISPLAY_STATUS_TO_PHASE[DisplayStatus.PROOF_SENT],
    };
  }

  if (allStagesApproved) {
    return {
      status: DisplayStatus.APPROVED,
      phase: DISPLAY_STATUS_TO_PHASE[DisplayStatus.APPROVED],
    };
  }

  if (
    rawStatus &&
    NEW_STATUSES.has(rawStatus) &&
    !hasAnyStageProgress &&
    !proofSent
  ) {
    return {
      status: DisplayStatus.NEW,
      phase: DISPLAY_STATUS_TO_PHASE[DisplayStatus.NEW],
    };
  }

  return {
    status: DisplayStatus.PENDING,
    phase: DISPLAY_STATUS_TO_PHASE[DisplayStatus.PENDING],
  };
}

export function getStageBadgeStatus(stageStatus?: string | null): DisplayStatus {
  const normalized = normalizeStageStatus(stageStatus);
  if (normalized === ReviewStageStatus.APPROVED) {
    return DisplayStatus.APPROVED;
  }
  if (normalized === ReviewStageStatus.REJECTED || normalized === ReviewStageStatus.FLAGGED) {
    return DisplayStatus.CORRECTION_REQUESTED;
  }
  return DisplayStatus.PENDING;
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
  };
}

