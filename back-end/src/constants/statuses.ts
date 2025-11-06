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
 * Review Stage Status
 * These are the statuses for individual review stages (preBria, postBria, postPdf)
 */
export enum ReviewStageStatus {
  PENDING = 'pending',
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
  AI_GENERATION_COMPLETED = 'ai_generation_completed',
  BRIA_PROCESSING_COMPLETE = 'bria_processing_complete',
  BOOK_ASSEMBLY_COMPLETED = 'book_assembly_completed'
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
  [OrderStatus.PENDING_CUSTOMER_APPROVAL]: 'Pending Customer Approval',
  [OrderStatus.CUSTOMER_APPROVED]: 'Customer Approved',
  [OrderStatus.CUSTOMER_REVISION_REQUESTED]: 'Customer Revision Requested',
  [OrderStatus.PENDING_PRINT]: 'Pending Print',
  [OrderStatus.PRINT_SUBMISSION_IN_PROGRESS]: 'Print Submission in Progress',
  [OrderStatus.PRINT_SUBMISSION_COMPLETED]: 'Print Submission Completed',
  [OrderStatus.IN_PRODUCTION]: 'In Production',
  [OrderStatus.PENDING_SHIPPING]: 'Pending Shipping',
  [OrderStatus.SHIPPED]: 'Shipped',
  [OrderStatus.DELIVERED]: 'Delivered',
  [OrderStatus.ACTION_REQUIRED]: 'Action Required',
  [OrderStatus.FAILED]: 'Failed',
  [OrderStatus.CANCELLED]: 'Cancelled',
  [OrderStatus.COMPLETED]: 'Completed',
  
  // Review Stage Statuses
  [ReviewStageStatus.PENDING]: 'Pending',
  [ReviewStageStatus.IN_REVIEW]: 'In Review',
  [ReviewStageStatus.READY]: 'Ready',
  [ReviewStageStatus.APPROVED]: 'Approved',
  [ReviewStageStatus.REJECTED]: 'Rejected',
  [ReviewStageStatus.FLAGGED]: 'Flagged',
  
  // Customer Approval Statuses
  [CustomerApprovalStatus.PENDING]: 'Pending',
  [CustomerApprovalStatus.APPROVED]: 'Approved',
  [CustomerApprovalStatus.REVISION_REQUESTED]: 'Revision Requested',
  [CustomerApprovalStatus.REJECTED]: 'Rejected'
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
  [OrderStatus.SHIPPED]: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-200'
  },
  [OrderStatus.DELIVERED]: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    border: 'border-emerald-200'
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
  [OrderStatus.ACTION_REQUIRED]: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-200'
  },
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
  
  // Review Stage Statuses
  [ReviewStageStatus.PENDING]: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-200'
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
export function getStatusLabel(status: string): string {
  return StatusLabels[status] || status;
}

/**
 * Get status color classes
 */
export function getStatusColors(status: string): { bg: string; text: string; border: string } {
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

