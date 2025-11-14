/**
 * Status Constants - Single Source of Truth
 * 
 * This file defines all status values used throughout the application.
 * All status strings should reference these constants to ensure consistency.
 * 
 * Last Updated: 2025-01-XX (Task 2)
 */

/**
 * Main Order Status
 * These are the calculated statuses that represent the overall order state
 */
export enum OrderStatus {
  // Initial States
  NEW = 'new',
  PENDING_PROCESSING = 'pending_processing',
  QUEUED_FOR_PROCESSING = 'queued_for_processing',
  
  // AI Generation States
  AI_GENERATION_IN_PROGRESS = 'ai_generation_in_progress',
  AI_GENERATION_COMPLETED = 'ai_generation_completed',
  
  // Review States
  PENDING_BASE_REVIEW = 'pending_base_review',
  PENDING_BG_REMOVAL_REVIEW = 'pending_bg_removal_review',
  PENDING_ASSEMBLY_REVIEW = 'pending_assembly_review',
  
  // Processing States
  PENDING_BG_REMOVAL = 'pending_bg_removal',
  PENDING_ASSEMBLY = 'pending_assembly',
  
  // Revision States (when flags exist)
  REVISION_BASE = 'revision_base',
  REVISION_BG_REMOVAL = 'revision_bg_removal',
  REVISION_ASSEMBLY = 'revision_assembly',
  
  // Customer Approval States
  PENDING_CUSTOMER_APPROVAL = 'pending_customer_approval',
  CUSTOMER_APPROVED = 'customer_approved',
  CUSTOMER_REVISION_REQUESTED = 'customer_revision_requested',
  
  // Production States
  PENDING_PRINT = 'pending_print',
  PRINT_SUBMISSION_IN_PROGRESS = 'print_submission_in_progress',
  PRINT_SUBMISSION_COMPLETED = 'print_submission_completed',
  IN_PRODUCTION = 'in_production',
  PENDING_SHIPPING = 'pending_shipping',
  
  // Shipping States
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  
  // Error/Final States
  ACTION_REQUIRED = 'action_required',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed'
}

/**
 * Display Status
 * Collapsed lifecycle statuses used for admin-facing badges
 * These are admin-friendly labels that represent the order's current state
 */
export enum DisplayStatus {
  NEW = 'new',
  IN_QUEUE = 'in_queue',
  REVIEW_POSES = 'review_poses',
  REVIEW_BACKGROUNDS = 'review_backgrounds',
  REVIEW_PAGES = 'review_pages',
  APPROVED = 'approved', // Stage approved but next workflow not triggered yet
  PROOF_READY = 'proof_ready',
  AWAITING_CUSTOMER = 'awaiting_customer',
  NEEDS_REVISION = 'needs_revision',
  READY_TO_PRINT = 'ready_to_print',
  PRINTING = 'printing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  ACTION_REQUIRED = 'action_required',
  MANUAL_REVIEW_REQUIRED = 'manual_review_required',
  // Specific error badges
  MISSING_MANIFEST = 'missing_manifest',
  MAX_RETRIES = 'max_retries',
  WORKFLOW_TIMEOUT = 'workflow_timeout',
  API_ERROR = 'api_error',
  STUCK_PROCESSING = 'stuck_processing',
  NOT_PICKED_UP = 'not_picked_up',
  MULTIPLE_ERRORS = 'multiple_errors'
}

/**
 * Review Stage Status
 * These are the statuses for individual review stages (preBria, postBria, postPdf)
 */
export enum ReviewStageStatus {
  PENDING = 'pending',
  NEEDS_REVIEW = 'needs_review', // Images exist and need human review
  IN_REVIEW = 'in-review', // Use hyphen for consistency
  READY = 'ready', // Ready for review
  APPROVED = 'approved',
  REJECTED = 'rejected',
  FLAGGED = 'flagged' // When issues are found
}

/**
 * Customer Approval Status
 * Status for customer approval workflow
 */
export enum CustomerApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REVISION_REQUESTED = 'revision_requested',
  REJECTED = 'rejected'
}

/**
 * Workflow Step Status
 * These match the workflow_step field in the database
 */
export enum WorkflowStep {
  ORDER_INTAKE = 'order_intake',
  AI_GENERATION_COMPLETED = 'ai_generation_completed',
  W2A_COMPLETE = '2A-complete',
  BRIA_PROCESSING_COMPLETE = 'bria_processing_complete',
  W2B_COMPLETE = '2B-complete',
  BOOK_ASSEMBLY_COMPLETED = 'book_assembly_completed',
  PRINT_FULFILLMENT = 'print_fulfillment'
}

/**
 * Lulu Print Status
 * Statuses from Lulu API
 */
export enum LuluStatus {
  ORDER_RECEIVED = 'Order Received',
  PROCESSING = 'Processing',
  FULFILLING = 'Fulfilling',
  SHIPPED = 'Shipped',
  DELIVERED = 'Delivered',
  ACTION_REQUIRED = 'Action Required',
  CANCELED = 'Canceled',
  REFUNDED = 'Refunded'
}

/**
 * Status Display Labels
 * Human-readable labels for each status
 */
export const StatusLabels: Record<string, string> = {
  // Order Statuses
  [OrderStatus.NEW]: 'New',
  [OrderStatus.PENDING_PROCESSING]: 'Pending Processing',
  [OrderStatus.QUEUED_FOR_PROCESSING]: 'Queued for Processing',
  [OrderStatus.AI_GENERATION_IN_PROGRESS]: 'AI Generation in Progress',
  [OrderStatus.AI_GENERATION_COMPLETED]: 'AI Generation Completed',
  [OrderStatus.PENDING_BASE_REVIEW]: 'Pending Base Review',
  [OrderStatus.PENDING_BG_REMOVAL_REVIEW]: 'Pending BG Removal Review',
  [OrderStatus.PENDING_ASSEMBLY_REVIEW]: 'Pending Assembly Review',
  [OrderStatus.PENDING_BG_REMOVAL]: 'Pending Background Removal',
  [OrderStatus.PENDING_ASSEMBLY]: 'Pending Assembly',
  [OrderStatus.REVISION_BASE]: 'Revision Needed (Base)',
  [OrderStatus.REVISION_BG_REMOVAL]: 'Revision Needed (BG Removal)',
  [OrderStatus.REVISION_ASSEMBLY]: 'Revision Needed (Assembly)',
  [OrderStatus.PENDING_CUSTOMER_APPROVAL]: 'Sent to Customer',
  [OrderStatus.CUSTOMER_APPROVED]: 'Ready for Print',
  [OrderStatus.CUSTOMER_REVISION_REQUESTED]: 'Customer Revision Requested',
  [OrderStatus.PENDING_PRINT]: 'Pending Print',
  [OrderStatus.PRINT_SUBMISSION_IN_PROGRESS]: 'Print Submission in Progress',
  [OrderStatus.PRINT_SUBMISSION_COMPLETED]: 'Print Submission Completed',
  [OrderStatus.IN_PRODUCTION]: 'In Production',
  [OrderStatus.PENDING_SHIPPING]: 'Pending Shipping',
  [OrderStatus.FAILED]: 'Failed',
  [OrderStatus.CANCELLED]: 'Cancelled',
  [OrderStatus.COMPLETED]: 'Completed',

  // Display-only lifecycle statuses (admin-friendly labels)
  [DisplayStatus.NEW]: 'New',
  [DisplayStatus.IN_QUEUE]: 'In Queue',
  [DisplayStatus.REVIEW_POSES]: 'Review Poses',
  [DisplayStatus.REVIEW_BACKGROUNDS]: 'Review Backgrounds',
  [DisplayStatus.REVIEW_PAGES]: 'Review Pages',
  [DisplayStatus.APPROVED]: 'Approved',
  [DisplayStatus.PROOF_READY]: 'Proof Ready',
  [DisplayStatus.AWAITING_CUSTOMER]: 'Awaiting Customer',
  [DisplayStatus.NEEDS_REVISION]: 'Needs Revision',
  [DisplayStatus.READY_TO_PRINT]: 'Ready to Print',
  [DisplayStatus.PRINTING]: 'Printing',
  [DisplayStatus.SHIPPED]: 'Shipped',
  [DisplayStatus.DELIVERED]: 'Delivered',
  [DisplayStatus.ACTION_REQUIRED]: 'Action Required',
  [DisplayStatus.MANUAL_REVIEW_REQUIRED]: 'Manual Review Required',
  [DisplayStatus.MISSING_MANIFEST]: 'Missing Manifest',
  [DisplayStatus.MAX_RETRIES]: 'Max Retries Exceeded',
  [DisplayStatus.WORKFLOW_TIMEOUT]: 'Workflow Timeout',
  [DisplayStatus.API_ERROR]: 'API Error',
  [DisplayStatus.STUCK_PROCESSING]: 'Stuck Processing',
  [DisplayStatus.NOT_PICKED_UP]: 'Not Picked Up',
  [DisplayStatus.MULTIPLE_ERRORS]: 'Multiple Errors',
  
  // Review Stage Statuses
  [ReviewStageStatus.PENDING]: 'Pending',
  [ReviewStageStatus.NEEDS_REVIEW]: 'Needs Review',
  [ReviewStageStatus.IN_REVIEW]: 'In Review',
  [ReviewStageStatus.READY]: 'Ready',
  [ReviewStageStatus.APPROVED]: 'Approved',
  [ReviewStageStatus.REJECTED]: 'Rejected',
  [ReviewStageStatus.FLAGGED]: 'Flagged',
  
  // Customer Approval Statuses
  [CustomerApprovalStatus.REVISION_REQUESTED]: 'Revision Requested'
};

/**
 * Status Color Mapping
 * Colors for badges and UI elements
 */
export const StatusColors: Record<string, {
  bg: string;
  text: string;
  border: string;
}> = {
  // New/Pending states - Yellow
  [OrderStatus.NEW]: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-200'
  },
  [OrderStatus.PENDING_PROCESSING]: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-200'
  },
  [OrderStatus.QUEUED_FOR_PROCESSING]: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-200'
  },
  [OrderStatus.PENDING_BASE_REVIEW]: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200'
  },
  [OrderStatus.PENDING_BG_REMOVAL_REVIEW]: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200'
  },
  [OrderStatus.PENDING_ASSEMBLY_REVIEW]: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200'
  },
  [OrderStatus.PENDING_CUSTOMER_APPROVAL]: {
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    border: 'border-purple-200'
  },
  
  // In Progress states - Blue
  [OrderStatus.AI_GENERATION_IN_PROGRESS]: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200'
  },
  [OrderStatus.PENDING_BG_REMOVAL]: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200'
  },
  [OrderStatus.PENDING_ASSEMBLY]: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200'
  },
  [OrderStatus.PENDING_PRINT]: {
    bg: 'bg-indigo-100',
    text: 'text-indigo-800',
    border: 'border-indigo-200'
  },
  [OrderStatus.IN_PRODUCTION]: {
    bg: 'bg-indigo-100',
    text: 'text-indigo-800',
    border: 'border-indigo-200'
  },
  
  // Success states - Green
  [OrderStatus.AI_GENERATION_COMPLETED]: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-200'
  },
  [OrderStatus.CUSTOMER_APPROVED]: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-200'
  },
  [OrderStatus.COMPLETED]: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    border: 'border-emerald-200'
  },
  
  // Revision states - Orange
  [OrderStatus.REVISION_BASE]: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-200'
  },
  [OrderStatus.REVISION_BG_REMOVAL]: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-200'
  },
  [OrderStatus.REVISION_ASSEMBLY]: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-200'
  },
  [OrderStatus.CUSTOMER_REVISION_REQUESTED]: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-200'
  },
  
  // Error/Issue states - Red
  [OrderStatus.FAILED]: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-200'
  },
  [OrderStatus.CANCELLED]: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-200'
  },

  // Display-only lifecycle statuses (admin-friendly labels with varying blue shades)
  [DisplayStatus.NEW]: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-200'
  },
  [DisplayStatus.IN_QUEUE]: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-200'
  },
  // Review Poses: Lightest blue (step 1)
  [DisplayStatus.REVIEW_POSES]: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200'
  },
  // Review Backgrounds: Medium blue (step 2)
  [DisplayStatus.REVIEW_BACKGROUNDS]: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-300'
  },
  // Review Pages: Darkest blue (step 3)
  [DisplayStatus.REVIEW_PAGES]: {
    bg: 'bg-blue-200',
    text: 'text-blue-900',
    border: 'border-blue-400'
  },
  [DisplayStatus.APPROVED]: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-200'
  },
  [DisplayStatus.PROOF_READY]: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-200'
  },
  [DisplayStatus.AWAITING_CUSTOMER]: {
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    border: 'border-purple-200'
  },
  [DisplayStatus.NEEDS_REVISION]: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-200'
  },
  [DisplayStatus.READY_TO_PRINT]: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-200'
  },
  [DisplayStatus.PRINTING]: {
    bg: 'bg-indigo-100',
    text: 'text-indigo-800',
    border: 'border-indigo-200'
  },
  [DisplayStatus.SHIPPED]: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-200'
  },
  [DisplayStatus.DELIVERED]: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    border: 'border-emerald-200'
  },
  [DisplayStatus.ACTION_REQUIRED]: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-200'
  },
  [DisplayStatus.MANUAL_REVIEW_REQUIRED]: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-200'
  },
  [DisplayStatus.MISSING_MANIFEST]: {
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    border: 'border-purple-200'
  },
  [DisplayStatus.MAX_RETRIES]: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-200'
  },
  [DisplayStatus.WORKFLOW_TIMEOUT]: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-200'
  },
  [DisplayStatus.API_ERROR]: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-200'
  },
  [DisplayStatus.STUCK_PROCESSING]: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-200'
  },
  [DisplayStatus.NOT_PICKED_UP]: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200'
  },
  [DisplayStatus.MULTIPLE_ERRORS]: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-200'
  },
  
  // Review Stage Statuses
  [ReviewStageStatus.PENDING]: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-200'
  },
  [ReviewStageStatus.NEEDS_REVIEW]: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-200'
  },
  [ReviewStageStatus.IN_REVIEW]: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200'
  },
  [ReviewStageStatus.READY]: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-200'
  },
  [ReviewStageStatus.APPROVED]: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-200'
  },
  [ReviewStageStatus.REJECTED]: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-200'
  },
  [ReviewStageStatus.FLAGGED]: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-200'
  }
};

/**
 * Get status label (human-readable)
 */
export function getStatusLabel(status: string, revisionCount?: number): string {
  const label = StatusLabels[status] || status;
  
  // If we're in second review (revisionCount >= 1) and status is PROOF_READY, show "Book Ready" instead
  if (status === DisplayStatus.PROOF_READY && typeof revisionCount === 'number' && revisionCount >= 1) {
    return 'Book Ready';
  }
  
  return label;
}

/**
 * Get status color classes
 */
export function getStatusColors(status: string, revisionCount?: number): { bg: string; text: string; border: string } {
  const revisionCountNum = typeof revisionCount === 'number' ? revisionCount : 0;
  const isSecondReview = revisionCountNum >= 1;
  
  // For review stages, use yellow colors if in second review, otherwise use blue
  if (isSecondReview) {
    switch (status) {
      case DisplayStatus.REVIEW_POSES:
        return {
          bg: 'bg-yellow-50',
          text: 'text-yellow-700',
          border: 'border-yellow-200'
        };
      case DisplayStatus.REVIEW_BACKGROUNDS:
        return {
          bg: 'bg-yellow-100',
          text: 'text-yellow-800',
          border: 'border-yellow-300'
        };
      case DisplayStatus.REVIEW_PAGES:
        return {
          bg: 'bg-yellow-200',
          text: 'text-yellow-900',
          border: 'border-yellow-400'
        };
    }
  }
  
  return StatusColors[status] || {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-200'
  };
}

/**
 * Check if status is a review status
 */
export function isReviewStatus(status: string): boolean {
  return Object.values(ReviewStageStatus).includes(status as ReviewStageStatus);
}

/**
 * Check if status is a customer approval status
 */
export function isCustomerApprovalStatus(status: string): boolean {
  return Object.values(CustomerApprovalStatus).includes(status as CustomerApprovalStatus);
}

/**
 * Check if status indicates an error or issue
 */
export function isErrorStatus(status: string): boolean {
  return [
    OrderStatus.ACTION_REQUIRED,
    OrderStatus.FAILED,
    OrderStatus.CANCELLED
  ].includes(status as OrderStatus);
}

/**
 * Check if status indicates a revision is needed
 */
export function isRevisionStatus(status: string): boolean {
  return [
    OrderStatus.REVISION_BASE,
    OrderStatus.REVISION_BG_REMOVAL,
    OrderStatus.REVISION_ASSEMBLY,
    OrderStatus.CUSTOMER_REVISION_REQUESTED
  ].includes(status as OrderStatus);
}

