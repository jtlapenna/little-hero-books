import { getOrderFromSupabase } from './supabase-client';
import { updateOrderStatus } from './status-service';

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
 * New code should use getOrderFlagSummaryById instead
 */
export function getOrderFlagSummary(order: any): FlagSummary {
  // If order is a string (orderId), treat it as orderId
  if (typeof order === 'string') {
    // This is actually an orderId, but we can't make async here
    // Return default and log warning
    console.warn('getOrderFlagSummary called with orderId string. Use getOrderFlagSummaryById instead.');
    return {
      preBria: 0,
      postBria: 0,
      postPdf: 0,
      total: 0
    };
  }
  
  // If order has flags property (from Supabase)
  const flags = order.flags || {};
  
  return {
    preBria: flags.preBria || 0,
    postBria: flags.postBria || 0,
    postPdf: flags.postPdf || 0,
    total: flags.total || 0
  };
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
  const order = await getOrderFromSupabase(orderId);
  const flags = order.flags || {};
  
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
  });
}

