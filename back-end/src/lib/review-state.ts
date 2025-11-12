import { getOrderFromSupabase } from './supabase-client';
import { updateOrderStatus } from './status-service';
import { DisplayStatus } from '@/constants/statuses';

export interface FlagSummary {
  preBria: number;
  postBria: number;
  postPdf: number;
  total: number;
}

/**
 * Get flagged count for a specific stage
 * Note: This function signature matches the old one for compatibility
 * but now reads from Supabase
 */
export async function getStageFlaggedCount(orderId: string, stage: string): Promise<number> {
  const order = await getOrderFromSupabase(orderId).catch(() => null);
  
  if (!order) {
  return 0;
}

  const flags = order.flags || {};
  const stageKey = stage === 'preBria' ? 'preBria' : 
                   stage === 'postBria' ? 'postBria' : 
                   stage === 'postPdf' ? 'postPdf' : stage;
  
  return flags[stageKey] || 0;
}

/**
 * Legacy function signature for compatibility (takes order object)
 * This function works with order objects that have flags property
 * Works on both client and server side - no Supabase needed
 */
export function getOrderFlagSummary(order: any): FlagSummary {
  // If order is a string (orderId), we can't fetch on client side
  if (typeof order === 'string') {
    // This is actually an orderId, but we can't make async here
    // Return default and log warning
    console.warn('getOrderFlagSummary called with orderId string. Use getOrderFlagSummaryById instead (server-side only).');
  return {
    preBria: 0,
    postBria: 0,
    postPdf: 0,
      total: 0
    };
  }
  
  // If order has flags property (from Supabase or API response)
  // This works on both client and server side
  const flags = order.flags || {};
  
  return {
    preBria: flags.preBria || 0,
    postBria: flags.postBria || 0,
    postPdf: flags.postPdf || 0,
    total: flags.total || 0
  };
}

/**
 * Get flag count for the active stage based on the order's DisplayStatus
 * Returns the flag count for the stage the order is currently in
 */
export function getActiveStageFlagCount(order: any): number {
  if (!order) return 0;
  
  const flags = order.flags || {};
  const status = order.status; // This should be the DisplayStatus enum value
  
  // Map DisplayStatus to stage flag keys
  // REVIEW_POSES = preBria
  // REVIEW_BACKGROUNDS = postBria
  // REVIEW_PAGES = postPdf
  if (status === DisplayStatus.REVIEW_POSES || status === 'review_poses') {
    return flags.preBria || 0;
  } else if (status === DisplayStatus.REVIEW_BACKGROUNDS || status === 'review_backgrounds') {
    return flags.postBria || 0;
  } else if (status === DisplayStatus.REVIEW_PAGES || status === 'review_pages') {
    return flags.postPdf || 0;
  }
  
  // If not in a review stage, return 0 (no flags to show)
  return 0;
}

/**
 * Get flag summary for an order by orderId (async version)
 */
export async function getOrderFlagSummaryById(orderId: string): Promise<FlagSummary> {
  const order = await getOrderFromSupabase(orderId).catch(() => null);
  
  if (!order) {
    return {
      preBria: 0,
      postBria: 0,
      postPdf: 0,
      total: 0
    };
  }
  
  const flags = order.flags || {};
  
  return {
    preBria: flags.preBria || 0,
    postBria: flags.postBria || 0,
    postPdf: flags.postPdf || 0,
    total: flags.total || 0
  };
}

/**
 * Set flagged count for a stage
 */
export async function setFlaggedCount(orderId: string, stage: string, count: number): Promise<void> {
  try {
    const order = await getOrderFromSupabase(orderId).catch(() => null);
    const flags = order?.flags ? { ...order.flags } : {};
    
    // Update specific stage
    const stageKey = stage === 'preBria' ? 'preBria' : 
                     stage === 'postBria' ? 'postBria' : 
                     stage === 'postPdf' ? 'postPdf' : stage;
    
    flags[stageKey] = count;
    
    // Recalculate total
    flags.total = (flags.preBria || 0) + (flags.postBria || 0) + (flags.postPdf || 0);
    
    // Update Supabase
    await updateOrderStatus(orderId, {
      flags: flags,
      has_flags: flags.total > 0
    }).catch((error) => {
      console.error(`[setFlaggedCount] Error updating Supabase for order ${orderId}:`, error);
      // Don't throw - allow the function to complete even if Supabase update fails
      // The manifest update is the source of truth, Supabase is just for UI display
    });
  } catch (error) {
    console.error(`[setFlaggedCount] Unexpected error for order ${orderId}, stage ${stage}:`, error);
    // Don't throw - allow the function to complete
    // The manifest update is the source of truth
  }
}

