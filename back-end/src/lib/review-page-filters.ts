/**
 * Review Page Filter Functions
 * 
 * These functions determine which orders should appear in each tab of the Review Page.
 * Orders appear based on their current review stage, not just flag status.
 * 
 * Last Updated: 2025-11-12
 */

import { OrderListItem } from '@/types/order';
import { OrderStatus, ReviewStageStatus, DisplayStatus } from '@/constants/statuses';
import { OrderPhase } from '@/constants/phases';
import { getOrderFlagSummary } from './review-state';

/**
 * Check if an order is currently in workflow processing
 * Orders in processing should temporarily disappear from the Review page
 */
export function isInWorkflowProcessing(order: OrderListItem): boolean {
  // Orders that are actively being processed by workflows
  const processingStatuses = [
    OrderStatus.AI_GENERATION_IN_PROGRESS,
    OrderStatus.PENDING_BG_REMOVAL,
    OrderStatus.PENDING_ASSEMBLY,
  ];
  
  return processingStatuses.includes(order.rawStatus as OrderStatus);
}

/**
 * Check if an order is "new" and needs processing
 * New orders are those that have been created but not yet queued for routing
 */
export function shouldShowAsNew(order: OrderListItem): boolean {
  // Must be in NEW status (not queued, not processing, not in any review stage)
  const isNewStatus = order.status === DisplayStatus.NEW || 
                      order.rawStatus === OrderStatus.NEW;
  
  // Must not be queued
  const isNotQueued = order.status !== DisplayStatus.IN_QUEUE &&
                      order.phase !== OrderPhase.IN_QUEUE &&
                      order.rawStatus !== OrderStatus.QUEUED_FOR_PROCESSING;
  
  // Must not be processing
  const isNotProcessing = !isInWorkflowProcessing(order);
  
  // Must not be completed
  const isNotCompleted = order.rawStatus !== OrderStatus.COMPLETED;
  
  return isNewStatus && isNotQueued && isNotProcessing && isNotCompleted;
}

/**
 * Check if an order should appear in the Review Poses tab
 * 
 * Conditions:
 * - Order is in preBria stage (not yet approved)
 * - Order is not in queue or processing
 * - Order has DisplayStatus of REVIEW_POSES (images are generated)
 * - Order is not completed
 * - OR order is "new" and needs processing
 */
export function shouldShowInReviewPoses(order: OrderListItem): boolean {
  // Include new orders that need processing - return early without checking other conditions
  if (shouldShowAsNew(order)) {
    return true;
  }
  // Must be in preBria stage (not yet approved)
  const isInPreBriaStage = order.reviewStages?.preBria?.status !== ReviewStageStatus.APPROVED &&
                           order.reviewStages?.preBria?.status !== 'approved';
  
  // Must not be in queue (check phase, DisplayStatus, and rawStatus)
  const isNotInQueue = order.phase !== OrderPhase.IN_QUEUE && 
                       order.status !== DisplayStatus.IN_QUEUE;
  
  // Must not be processing (check rawStatus explicitly)
  const isNotProcessing = !isInWorkflowProcessing(order) &&
                          order.rawStatus !== OrderStatus.AI_GENERATION_IN_PROGRESS &&
                          order.rawStatus !== OrderStatus.PENDING_BG_REMOVAL &&
                          order.rawStatus !== OrderStatus.PENDING_ASSEMBLY;
  
  // Must have DisplayStatus of REVIEW_POSES (images are generated and ready for review)
  // OR must be NEW status (new orders that haven't been processed yet)
  // AND must not be in queue phase or processing
  const isReviewPosesStatus = (order.status === DisplayStatus.REVIEW_POSES || 
                               order.status === DisplayStatus.NEW) &&
                              order.phase !== OrderPhase.IN_QUEUE;
  
  // Must not be completed
  const isNotCompleted = order.rawStatus !== OrderStatus.COMPLETED;
  
  // Must not be sent to print
  const notSentToPrint = order.rawStatus !== OrderStatus.CUSTOMER_APPROVED &&
                         order.rawStatus !== OrderStatus.PENDING_PRINT &&
                         order.rawStatus !== OrderStatus.PRINT_SUBMISSION_IN_PROGRESS &&
                         order.rawStatus !== OrderStatus.PRINT_SUBMISSION_COMPLETED &&
                         order.rawStatus !== OrderStatus.IN_PRODUCTION &&
                         order.rawStatus !== OrderStatus.PENDING_SHIPPING &&
                         order.rawStatus !== OrderStatus.SHIPPED &&
                         order.rawStatus !== OrderStatus.DELIVERED;
  
  // Must be in FIRST_REVIEW phase (not SECOND_REVIEW) OR NEW status
  const isFirstReview = order.phase === OrderPhase.FIRST_REVIEW || 
                       order.status === DisplayStatus.NEW ||
                       order.rawStatus === OrderStatus.NEW;
  
  return isInPreBriaStage && isNotInQueue && isNotProcessing && isReviewPosesStatus && isNotCompleted && notSentToPrint && isFirstReview;
}

/**
 * Check if an order should appear in the Review Backgrounds tab
 * 
 * Conditions:
 * - Order is in postBria stage (not yet approved)
 * - Previous stage (preBria) must be approved
 * - Order has DisplayStatus of REVIEW_BACKGROUNDS (images are generated)
 * - Order is not processing
 */
export function shouldShowInReviewBackgrounds(order: OrderListItem): boolean {
  // Must be in postBria stage (not yet approved)
  const isInPostBriaStage = order.reviewStages?.postBria?.status !== ReviewStageStatus.APPROVED &&
                            order.reviewStages?.postBria?.status !== 'approved';
  
  // PreBria must be approved
  const preBriaApproved = order.reviewStages?.preBria?.status === ReviewStageStatus.APPROVED ||
                          order.reviewStages?.preBria?.status === 'approved';
  
  // Must not be processing (check rawStatus explicitly)
  const isNotProcessing = !isInWorkflowProcessing(order) &&
                          order.rawStatus !== OrderStatus.AI_GENERATION_IN_PROGRESS &&
                          order.rawStatus !== OrderStatus.PENDING_BG_REMOVAL &&
                          order.rawStatus !== OrderStatus.PENDING_ASSEMBLY;
  
  // Must have DisplayStatus of REVIEW_BACKGROUNDS (images are generated and ready for review)
  // AND must not be in queue phase or processing
  const isReviewBackgroundsStatus = order.status === DisplayStatus.REVIEW_BACKGROUNDS &&
                                     order.phase !== OrderPhase.IN_QUEUE;
  
  // Must not be completed
  const isNotCompleted = order.rawStatus !== OrderStatus.COMPLETED;
  
  // Must not be sent to print
  const notSentToPrint = order.rawStatus !== OrderStatus.CUSTOMER_APPROVED &&
                         order.rawStatus !== OrderStatus.PENDING_PRINT &&
                         order.rawStatus !== OrderStatus.PRINT_SUBMISSION_IN_PROGRESS &&
                         order.rawStatus !== OrderStatus.PRINT_SUBMISSION_COMPLETED &&
                         order.rawStatus !== OrderStatus.IN_PRODUCTION &&
                         order.rawStatus !== OrderStatus.PENDING_SHIPPING &&
                         order.rawStatus !== OrderStatus.SHIPPED &&
                         order.rawStatus !== OrderStatus.DELIVERED;
  
  // Must be in FIRST_REVIEW phase (not SECOND_REVIEW)
  const isFirstReview = order.phase === OrderPhase.FIRST_REVIEW;
  
  return isInPostBriaStage && preBriaApproved && isNotProcessing && isReviewBackgroundsStatus && isNotCompleted && notSentToPrint && isFirstReview;
}

/**
 * Check if an order should appear in the Review Pages tab
 * 
 * Conditions:
 * - Order is in postPdf stage (not yet approved)
 * - Previous stages (preBria, postBria) must be approved
 * - Order has DisplayStatus of REVIEW_PAGES (images are generated)
 * - Order is not processing
 */
export function shouldShowInReviewPages(order: OrderListItem): boolean {
  // Must be in postPdf stage (not yet approved)
  const isInPostPdfStage = order.reviewStages?.postPdf?.status !== ReviewStageStatus.APPROVED &&
                          order.reviewStages?.postPdf?.status !== 'approved';
  
  // Previous stages must be approved
  const preBriaApproved = order.reviewStages?.preBria?.status === ReviewStageStatus.APPROVED ||
                          order.reviewStages?.preBria?.status === 'approved';
  const postBriaApproved = order.reviewStages?.postBria?.status === ReviewStageStatus.APPROVED ||
                           order.reviewStages?.postBria?.status === 'approved';
  
  // Must not be processing (check rawStatus explicitly)
  const isNotProcessing = !isInWorkflowProcessing(order) &&
                          order.rawStatus !== OrderStatus.AI_GENERATION_IN_PROGRESS &&
                          order.rawStatus !== OrderStatus.PENDING_BG_REMOVAL &&
                          order.rawStatus !== OrderStatus.PENDING_ASSEMBLY;
  
  // Must have DisplayStatus of REVIEW_PAGES (images are generated and ready for review)
  // AND must not be in queue phase or processing
  const isReviewPagesStatus = order.status === DisplayStatus.REVIEW_PAGES &&
                              order.phase !== OrderPhase.IN_QUEUE;
  
  // Must not be completed
  const isNotCompleted = order.rawStatus !== OrderStatus.COMPLETED;
  
  // Must not be sent to print
  const notSentToPrint = order.rawStatus !== OrderStatus.CUSTOMER_APPROVED &&
                         order.rawStatus !== OrderStatus.PENDING_PRINT &&
                         order.rawStatus !== OrderStatus.PRINT_SUBMISSION_IN_PROGRESS &&
                         order.rawStatus !== OrderStatus.PRINT_SUBMISSION_COMPLETED &&
                         order.rawStatus !== OrderStatus.IN_PRODUCTION &&
                         order.rawStatus !== OrderStatus.PENDING_SHIPPING &&
                         order.rawStatus !== OrderStatus.SHIPPED &&
                         order.rawStatus !== OrderStatus.DELIVERED;
  
  // Must be in FIRST_REVIEW phase (not SECOND_REVIEW)
  const isFirstReview = order.phase === OrderPhase.FIRST_REVIEW;
  
  return isInPostPdfStage && preBriaApproved && postBriaApproved && isNotProcessing && isReviewPagesStatus && isNotCompleted && notSentToPrint && isFirstReview;
}

/**
 * Check if an order should appear in the Secondary Review tab
 * 
 * Conditions:
 * - Order is in SECOND_REVIEW phase
 * - Order has revisionCount >= 1
 * - Order has not been sent to print
 */
export function shouldShowInSecondaryReview(order: OrderListItem): boolean {
  // Must be in SECOND_REVIEW phase
  const isSecondReview = order.phase === OrderPhase.SECOND_REVIEW;
  
  // Must have revisionCount >= 1
  const hasRevision = (order.revisionCount || 0) >= 1;
  
  // Must not be sent to print
  const notSentToPrint = order.rawStatus !== OrderStatus.CUSTOMER_APPROVED &&
                         order.rawStatus !== OrderStatus.PENDING_PRINT &&
                         order.rawStatus !== OrderStatus.PRINT_SUBMISSION_IN_PROGRESS &&
                         order.rawStatus !== OrderStatus.PRINT_SUBMISSION_COMPLETED &&
                         order.rawStatus !== OrderStatus.IN_PRODUCTION &&
                         order.rawStatus !== OrderStatus.PENDING_SHIPPING &&
                         order.rawStatus !== OrderStatus.SHIPPED &&
                         order.rawStatus !== OrderStatus.DELIVERED;
  
  // Must not be completed
  const isNotCompleted = order.rawStatus !== OrderStatus.COMPLETED;
  
  return isSecondReview && hasRevision && notSentToPrint && isNotCompleted;
}

/**
 * Get the active stage for Secondary Review orders
 * Secondary Review shows all flags regardless of stage, but we need to know
 * which stage to check for approval status
 */
function getActiveStageForSecondaryReview(order: OrderListItem): 'preBria' | 'postBria' | 'postPdf' {
  // In Secondary Review, we typically work on postPdf stage
  // But we should check which stage actually needs attention
  if (order.reviewStages?.postPdf?.status !== ReviewStageStatus.APPROVED &&
      order.reviewStages?.postPdf?.status !== 'approved') {
    return 'postPdf';
  }
  if (order.reviewStages?.postBria?.status !== ReviewStageStatus.APPROVED &&
      order.reviewStages?.postBria?.status !== 'approved') {
    return 'postBria';
  }
  return 'preBria';
}

/**
 * Get card label for an order in a specific review stage
 * 
 * Label priority:
 * A) "{count} Flagged" - When there are flagged items
 * B) "Ready for Approval" - When there are no flags but stage is not approved
 * C) "Approved" - When stage is approved but not sent to next stage
 * D) "Ready for [Next Stage]" - When approved and waiting to be sent to next stage
 */
export function getCardLabel(
  order: OrderListItem,
  stage: 'preBria' | 'postBria' | 'postPdf' | 'secondary'
): string {
  // Check if order is "new" and needs processing
  if (shouldShowAsNew(order)) {
    return 'New';
  }
  
  const flagSummary = getOrderFlagSummary(order);
  
  // For secondary review, use total flags and determine active stage
  const stageKey = stage === 'secondary' ? getActiveStageForSecondaryReview(order) : stage;
  const stageStatus = order.reviewStages?.[stageKey]?.status;
  
  // Get flag count for the specific stage
  let flagCount = 0;
  if (stage === 'secondary') {
    // For secondary review, show total flags across all stages
    flagCount = flagSummary.total;
  } else {
    // For specific stages, show flags for that stage only
    flagCount = flagSummary[stageKey] || 0;
  }
  
  // A) Has flags - show count
  if (flagCount > 0) {
    return `${flagCount} Flagged`;
  }
  
  // B) No flags, not approved - ready for approval
  // BUT only if images are generated (DisplayStatus is not IN_QUEUE)
  if (stageStatus !== ReviewStageStatus.APPROVED && stageStatus !== 'approved') {
    // Check if order is still in queue/processing - if so, don't show "Ready for Approval"
    if (order.status === DisplayStatus.IN_QUEUE || 
        order.phase === OrderPhase.IN_QUEUE ||
        isInWorkflowProcessing(order)) {
      return 'Processing';
    }
    return 'Ready for Approval';
  }
  
  // C) Approved - determine next stage
  if (stageStatus === ReviewStageStatus.APPROVED || stageStatus === 'approved') {
    if (stage === 'preBria') {
      return 'Ready for Review Backgrounds';
    } else if (stage === 'postBria') {
      return 'Ready for Review Pages';
    } else if (stage === 'postPdf') {
      return 'Ready for Customer';
    } else if (stage === 'secondary') {
      return 'Ready for Print';
    }
  }
  
  // Fallback
  return 'Approved';
}

/**
 * Get the next stage name for display
 */
export function getNextStageName(stage: 'preBria' | 'postBria' | 'postPdf' | 'secondary'): string {
  switch (stage) {
    case 'preBria':
      return 'Review Backgrounds';
    case 'postBria':
      return 'Review Pages';
    case 'postPdf':
      return 'Customer';
    case 'secondary':
      return 'Print';
    default:
      return 'Next Stage';
  }
}

