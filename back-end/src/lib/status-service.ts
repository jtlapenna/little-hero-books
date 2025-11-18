import { getOrderFromSupabase, updateOrderInSupabase } from './supabase-client';
import { OrderStatus, LuluStatus } from '@/constants/statuses';

/**
 * Calculate order status based on current state
 * This is the SINGLE SOURCE OF TRUTH for status calculation
 * 
 * Priority order:
 * 0. Execution status → Check execution_status (manual review, errors)
 * 1. Flags exist → Set revision status
 * 2. Production status → Use lulu_status
 * 3. Customer approval → Use customer_approval_status
 * 4. Workflow step → Use workflow_step field (more authoritative than review_stages)
 * 5. Review stages → Check review_stages JSONB (fallback if workflow_step not set)
 * 6. Default → 'new'
 */
export async function calculateOrderStatus(orderId: string): Promise<string> {
  // Get order from Supabase
  const order = await getOrderFromSupabase(orderId).catch(() => null);
  
  if (!order) {
    // TODO: Fallback to R2 manifest if needed
    // For now, return default status
    return OrderStatus.NEW;
  }
  
  // 0. Check execution_status first (highest priority for manual review/errors)
  if (order.execution_status === 'error_requires_manual_review') {
    return OrderStatus.ACTION_REQUIRED;
  }
  
  // Also check for any error status (not just manual review)
  if (order.execution_status === 'error') {
    return OrderStatus.ACTION_REQUIRED;
  }
  
  // 1. Check flags first (highest priority)
  // Note: getOrderFlagSummary will be async and read from Supabase
  const flags = order.flags || {};
  const hasFlags = order.has_flags || false;
  
  if (hasFlags && flags.total > 0) {
    const reviewStages = order.review_stages || {};
    
    if (flags.preBria > 0 && reviewStages.preBria?.status !== 'approved') {
      return OrderStatus.REVISION_BASE;
    }
    if (flags.postBria > 0 && reviewStages.postBria?.status !== 'approved') {
      return OrderStatus.REVISION_BG_REMOVAL;
    }
    if (flags.postPdf > 0 && reviewStages.postPdf?.status !== 'approved') {
      return OrderStatus.REVISION_ASSEMBLY;
    }
  }
  
  // 2. Check production status (lulu_status field)
  if (order.lulu_status) {
    return mapLuluStatusToOrderStatus(order.lulu_status);
  }
  
  // 3. Check customer approval
  if (order.customer_approval_required) {
    if (order.customer_approval_status === 'pending') return OrderStatus.PENDING_CUSTOMER_APPROVAL;
    if (order.customer_approval_status === 'approved') return OrderStatus.CUSTOMER_APPROVED;
    if (order.customer_approval_status === 'revision_requested') return OrderStatus.CUSTOMER_REVISION_REQUESTED;
  }
  
  // 4. Check workflow step FIRST (workflow_step is more authoritative than review_stages)
  // This ensures that if a workflow has completed, we use that status even if review_stages
  // hasn't been updated yet (e.g., W2A completes but review_stages still shows 'ready')
  if (order.workflow_step) {
    // Special handling for 'order_intake': status depends on whether router has picked it up
    if (order.workflow_step === 'order_intake') {
      // If queued_at is set, router has picked it up - it's queued for processing
      // Otherwise, it's just completed W0 and waiting to be queued
      return order.queued_at ? OrderStatus.QUEUED_FOR_PROCESSING : OrderStatus.NEW;
    }
    
    const workflowStatusMap: Record<string, OrderStatus> = {
      // Existing mappings
      'ai_generation_completed': OrderStatus.PENDING_BG_REMOVAL,
      'bria_processing_complete': OrderStatus.PENDING_ASSEMBLY,
      'book_assembly_completed': OrderStatus.PENDING_ASSEMBLY_REVIEW,
      
      // Additional mappings found in database
      '2A-complete': OrderStatus.PENDING_BG_REMOVAL, // Same as ai_generation_completed
      '2B-complete': OrderStatus.PENDING_ASSEMBLY, // Same as bria_processing_complete
      'print_fulfillment': OrderStatus.PENDING_PRINT
    };
    if (workflowStatusMap[order.workflow_step]) {
      return workflowStatusMap[order.workflow_step];
    }
  }
  
  // 5. Check review stages (fallback if workflow_step doesn't provide status)
  const reviewStages = order.review_stages || {};
  
  if (reviewStages.postPdf?.status === 'approved') {
    return order.customer_approval_required ? OrderStatus.PENDING_CUSTOMER_APPROVAL : OrderStatus.PENDING_PRINT;
  }
  if (reviewStages.postPdf?.status === 'ready' || reviewStages.postPdf?.status === 'in-review') {
    return OrderStatus.PENDING_ASSEMBLY_REVIEW;
  }
  if (reviewStages.postBria?.status === 'approved' && !reviewStages.postBria) {
    return OrderStatus.PENDING_ASSEMBLY;
  }
  if (reviewStages.postBria?.status === 'ready' || reviewStages.postBria?.status === 'in-review') {
    return OrderStatus.PENDING_BG_REMOVAL_REVIEW;
  }
  if (reviewStages.preBria?.status === 'approved' && !reviewStages.postBria) {
    return OrderStatus.PENDING_BG_REMOVAL;
  }
  if (reviewStages.preBria?.status === 'ready' || reviewStages.preBria?.status === 'in-review') {
    return OrderStatus.PENDING_BASE_REVIEW;
  }
  
  // 6. Default
  return OrderStatus.NEW;
}

/**
 * Map Lulu API status to our status system
 * Uses existing lulu_status field from database
 * 
 * Maps Lulu Print-Job statuses to our internal OrderStatus
 */
function mapLuluStatusToOrderStatus(luluStatus: string): OrderStatus {
  const mapping: Record<string, OrderStatus> = {
    // Pre-production statuses (order received, payment processing)
    [LuluStatus.CREATED]: OrderStatus.PENDING_PRINT,
    [LuluStatus.UNPAID]: OrderStatus.PENDING_PRINT,
    [LuluStatus.PAYMENT_IN_PROGRESS]: OrderStatus.PENDING_PRINT,
    [LuluStatus.PRODUCTION_DELAYED]: OrderStatus.PENDING_PRINT,
    [LuluStatus.PRODUCTION_READY]: OrderStatus.PENDING_PRINT,
    
    // Production statuses
    [LuluStatus.IN_PRODUCTION]: OrderStatus.IN_PRODUCTION,
    
    // Shipping statuses
    [LuluStatus.SHIPPED]: OrderStatus.SHIPPED,
    [LuluStatus.DELIVERED]: OrderStatus.DELIVERED, // Custom status (from tracking)
    
    // Error/problem statuses
    [LuluStatus.REJECTED]: OrderStatus.ACTION_REQUIRED,
    [LuluStatus.CANCELED]: OrderStatus.CANCELLED,
  };
  
  return mapping[luluStatus] || OrderStatus.PENDING_PRINT;
}

/**
 * Update order status in Supabase and recalculate
 * This ensures status is always in sync
 * Uses existing field names: status, workflow_step, lulu_status, review_stages, flags
 */
export async function updateOrderStatus(orderId: string, updates: {
  status?: string;
  workflow_step?: string;
  review_stages?: any;
  flags?: any;
  has_flags?: boolean;
  customer_approval_status?: string;
  lulu_status?: string;
  [key: string]: any;
}): Promise<void> {
  // Update Supabase
  await updateOrderInSupabase(orderId, updates);
  
  // Recalculate status based on new state
  const calculatedStatus = await calculateOrderStatus(orderId);
  
  // Update with calculated status if different (use existing 'status' field)
  if (updates.status !== calculatedStatus) {
    await updateOrderInSupabase(orderId, { status: calculatedStatus });
  }
}

/**
 * Get current order status (always calculated, never stale)
 */
export async function getOrderStatus(orderId: string): Promise<string> {
  return calculateOrderStatus(orderId);
}
