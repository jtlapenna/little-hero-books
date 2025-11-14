/**
 * Stuck Order Cleanup
 * 
 * Identifies and fixes orders stuck in 'processing' state that are blocking W1.1 router.
 * 
 * Logic:
 * - Finds orders with execution_status='processing' and started_at older than threshold
 * - Checks if workflow actually completed (has manifest URL for that workflow step)
 * - If completed: reset to 'done' or 'ready_for_processing' based on state
 * - If truly stuck: reset to 'ready_for_processing' for retry
 */

import { getOrderFromSupabase, updateOrderInSupabase } from './supabase-client';

export interface StuckOrder {
  orderId: string;
  executionStatus: string;
  currentWorkflow: string | null;
  startedAt: string | null;
  minutesProcessing: number;
  hasManifest: boolean;
  workflowStep: string | null;
  shouldReset: boolean;
  resetReason: string;
}

export interface CleanupResult {
  totalChecked: number;
  stuckFound: number;
  resetCount: number;
  errors: Array<{ orderId: string; error: string }>;
  resetOrders: StuckOrder[];
}

const DEFAULT_TIMEOUT_MINUTES = 30;

/**
 * Find orders stuck in processing state
 */
export async function findStuckOrders(
  timeoutMinutes: number = DEFAULT_TIMEOUT_MINUTES
): Promise<StuckOrder[]> {
  // This would query Supabase directly, but for now we'll use the API
  // In a real implementation, this would be a direct SQL query or RPC function
  const stuckOrders: StuckOrder[] = [];
  
  // Note: This is a placeholder - actual implementation would query Supabase
  // directly using a SQL query like:
  // SELECT * FROM orders 
  // WHERE execution_status = 'processing' 
  //   AND (started_at < NOW() - INTERVAL '30 minutes' OR started_at IS NULL)
  
  return stuckOrders;
}

/**
 * Check if an order's workflow has actually completed
 */
function hasWorkflowCompleted(order: any, workflow: string | null): boolean {
  if (!workflow) return false;
  
  switch (workflow) {
    case '2A':
      return !!order.manifest_2a_url || order.workflow_step === '2A-complete';
    case '2B':
      return !!order.manifest_2b_url || order.workflow_step === 'bria_processing_complete';
    case '3':
      return !!order.manifest_3_url || order.workflow_step === 'book_assembly_completed';
    default:
      return false;
  }
}

/**
 * Determine what execution_status an order should have after cleanup
 */
function determineNewStatus(order: any, workflow: string | null): {
  executionStatus: string;
  reason: string;
} {
  // If workflow completed but status wasn't updated, set to 'done'
  if (hasWorkflowCompleted(order, workflow)) {
    return {
      executionStatus: 'done',
      reason: 'Workflow completed but execution_status not updated'
    };
  }
  
  // If truly stuck (no manifest, old timestamp), reset to ready_for_processing for retry
  return {
    executionStatus: 'ready_for_processing',
    reason: 'Order stuck in processing - resetting for retry'
  };
}

/**
 * Reset a stuck order
 */
export async function resetStuckOrder(
  orderId: string,
  newStatus: string,
  reason: string
): Promise<void> {
  await updateOrderInSupabase(orderId, {
    execution_status: newStatus,
    started_at: null,
    current_workflow: null,
    error_message: reason,
    error_type: 'stuck_processing',
    updated_at: new Date().toISOString()
  });
}

/**
 * Cleanup all stuck orders
 */
export async function cleanupStuckOrders(
  timeoutMinutes: number = DEFAULT_TIMEOUT_MINUTES
): Promise<CleanupResult> {
  const result: CleanupResult = {
    totalChecked: 0,
    stuckFound: 0,
    resetCount: 0,
    errors: [],
    resetOrders: []
  };
  
  // Note: This is a placeholder implementation
  // Actual implementation would:
  // 1. Query Supabase for stuck orders (SQL query)
  // 2. For each stuck order:
  //    - Check if workflow completed
  //    - Determine new status
  //    - Reset order
  //    - Log result
  
  return result;
}

/**
 * Get stuck orders summary for monitoring
 */
export async function getStuckOrdersSummary(): Promise<{
  totalStuck: number;
  stuckByWorkflow: Record<string, number>;
  oldestStuckMinutes: number;
}> {
  // Placeholder - actual implementation would query Supabase
  return {
    totalStuck: 0,
    stuckByWorkflow: {},
    oldestStuckMinutes: 0
  };
}

