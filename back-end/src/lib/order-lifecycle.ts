/**
 * Order Lifecycle Management
 * 
 * Handles automatic lifecycle transitions and archiving:
 * - Active → Recently Delivered (when shipped + X days elapsed)
 * - Recently Delivered → Archived (after 15 days)
 * - Cancelled/Rejected → Archived (after 7 days)
 * 
 * @see docs/_ongoing-issues-list/15-order-archiving-and-lifecycle-management.md
 */

import { SupabaseClient } from '@supabase/supabase-js';

// Delivery time assumptions by shipping level (days after SHIPPED)
// Lulu does not provide DELIVERED status, so we assume based on service level
const DELIVERY_DAYS: Record<string, number> = {
  EXPRESS: 3,
  EXPEDITED: 5,
  GROUND: 10,
  PRIORITY_MAIL: 10,
  MAIL: 14,
};

// How long orders stay in "recently_delivered" before archiving
const RECENTLY_DELIVERED_RETENTION_DAYS = 15;

// How long after cancellation before auto-archiving
const CANCELLED_ARCHIVE_DAYS = 7;

// Archive reason types
export type ArchiveReason = 'manual' | 'auto_delivered' | 'auto_cancelled';

// Result from processing lifecycle
export interface LifecycleResult {
  markedDelivered: number;
  archived: number;
  errors: string[];
}

/**
 * Add days to a date
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Subtract days from a date
 */
function subDays(date: Date, days: number): Date {
  return addDays(date, -days);
}

/**
 * Get assumed delivery days for a shipping level
 */
export function getDeliveryDaysForShippingLevel(level: string | null | undefined): number {
  if (!level) return DELIVERY_DAYS.MAIL;
  const normalized = level.toUpperCase().replace(/[^A-Z_]/g, '');
  return DELIVERY_DAYS[normalized] ?? DELIVERY_DAYS.MAIL;
}

/**
 * Process order lifecycle transitions
 * Called by cron router daily
 */
export async function processOrderLifecycle(supabase: SupabaseClient): Promise<LifecycleResult> {
  const now = new Date();
  const result: LifecycleResult = { markedDelivered: 0, archived: 0, errors: [] };

  // 1. Mark shipped orders as "recently_delivered" if delivery window passed
  try {
    const { data: shippedOrders, error: shippedError } = await supabase
      .from('orders')
      .select('orderId, shipped_at, amazon_shipment_service_level')
      .eq('lulu_status', 'SHIPPED')
      .or('lifecycle_status.eq.active,lifecycle_status.is.null')
      .not('shipped_at', 'is', null);

    if (shippedError) {
      result.errors.push(`Fetch shipped orders: ${shippedError.message}`);
    } else if (shippedOrders) {
      for (const order of shippedOrders) {
        const level = order.amazon_shipment_service_level || 'MAIL';
        const deliveryDays = getDeliveryDaysForShippingLevel(level);
        const shippedDate = new Date(order.shipped_at);
        const assumedDeliveryDate = addDays(shippedDate, deliveryDays);

        if (now >= assumedDeliveryDate) {
          const { error: updateError } = await supabase
            .from('orders')
            .update({
              lifecycle_status: 'recently_delivered',
              assumed_delivered_at: assumedDeliveryDate.toISOString(),
            })
            .eq('orderId', order.orderId);

          if (updateError) {
            result.errors.push(`Mark delivered ${order.orderId}: ${updateError.message}`);
          } else {
            result.markedDelivered++;
          }
        }
      }
    }
  } catch (err: any) {
    result.errors.push(`Shipped orders processing: ${err.message}`);
  }

  // 2. Archive "recently_delivered" orders after retention period
  try {
    const cutoffDelivered = subDays(now, RECENTLY_DELIVERED_RETENTION_DAYS).toISOString();
    const { data: deliveredOrders, error: deliveredError } = await supabase
      .from('orders')
      .select('*')
      .eq('lifecycle_status', 'recently_delivered')
      .lt('assumed_delivered_at', cutoffDelivered);

    if (deliveredError) {
      result.errors.push(`Fetch delivered orders: ${deliveredError.message}`);
    } else if (deliveredOrders) {
      for (const order of deliveredOrders) {
        try {
          await archiveOrder(supabase, order, 'auto_delivered');
          result.archived++;
        } catch (err: any) {
          result.errors.push(`Archive delivered ${order.orderId}: ${err.message}`);
        }
      }
    }
  } catch (err: any) {
    result.errors.push(`Delivered orders archiving: ${err.message}`);
  }

  // 3. Archive cancelled/rejected orders after waiting period
  try {
    const cutoffCancelled = subDays(now, CANCELLED_ARCHIVE_DAYS).toISOString();
    const { data: cancelledOrders, error: cancelledError } = await supabase
      .from('orders')
      .select('*')
      .in('lulu_status', ['CANCELED', 'REJECTED'])
      .lt('updated_at', cutoffCancelled)
      .or('lifecycle_status.eq.active,lifecycle_status.is.null');

    if (cancelledError) {
      result.errors.push(`Fetch cancelled orders: ${cancelledError.message}`);
    } else if (cancelledOrders) {
      for (const order of cancelledOrders) {
        try {
          await archiveOrder(supabase, order, 'auto_cancelled');
          result.archived++;
        } catch (err: any) {
          result.errors.push(`Archive cancelled ${order.orderId}: ${err.message}`);
        }
      }
    }
  } catch (err: any) {
    result.errors.push(`Cancelled orders archiving: ${err.message}`);
  }

  return result;
}

/**
 * Archive a single order
 * Moves order from orders table to archived_orders table
 * Uses JSONB storage for full order data to avoid column mismatch issues
 */
export async function archiveOrder(
  supabase: SupabaseClient,
  order: Record<string, any>,
  reason: ArchiveReason,
  archivedBy?: string
): Promise<void> {
  // Extract key identifiers (try multiple column name variants)
  const orderId = order.orderId || order['orderId'] || order.order_id;
  const amazonOrderId = order.amazon_order_id || order.amazonOrderId || order['amazonOrderId'];
  const platform = order.platform || 'amazon';
  const customerEmail = order.customer_email || order.customerEmail;
  
  if (!orderId && !amazonOrderId) {
    throw new Error('Order missing orderId and amazon_order_id');
  }

  // Prepare archived order record with JSONB storage
  const archivedOrder = {
    order_id: orderId,
    amazon_order_id: amazonOrderId,
    platform,
    customer_email: customerEmail,
    order_data: order,  // Store full order as JSONB
    archived_at: new Date().toISOString(),
    archive_reason: reason,
    archived_by: archivedBy ?? null,
  };

  // 1. Insert into archived_orders
  const { error: insertError } = await supabase
    .from('archived_orders')
    .insert(archivedOrder);

  if (insertError) {
    throw new Error(`Insert into archived_orders failed: ${insertError.message}`);
  }

  // 2. Delete from orders - try amazon_order_id first
  let deleteError = null;
  if (amazonOrderId) {
    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('amazon_order_id', amazonOrderId);
    deleteError = error;
  }
  
  // If that failed or no amazon_order_id, try orderId
  if (deleteError || !amazonOrderId) {
    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('orderId', orderId);
    
    if (error && deleteError) {
      // Both failed, rollback
      await supabase.from('archived_orders').delete().eq('order_id', orderId);
      throw new Error(`Delete from orders failed: ${error.message}`);
    }
  }

  console.log(`[Order Lifecycle] Archived ${amazonOrderId || orderId}: ${reason}`);
}

/**
 * Archive order by orderId (fetches order first)
 * Used by API endpoints for manual archiving
 * Tries amazon_order_id first, then orderId, then order_id (same pattern as other routes)
 */
export async function archiveOrderById(
  supabase: SupabaseClient,
  orderId: string,
  reason: ArchiveReason,
  archivedBy?: string
): Promise<void> {
  // Try amazon_order_id first (most common)
  let order: Record<string, any> | null = null;
  let fetchError: any = null;

  const { data: orderByAmazon, error: amazonError } = await supabase
    .from('orders')
    .select('*')
    .eq('amazon_order_id', orderId)
    .maybeSingle();

  if (orderByAmazon) {
    order = orderByAmazon;
  } else {
    // Try orderId column
    const { data: orderById, error: byIdError } = await supabase
      .from('orders')
      .select('*')
      .eq('orderId', orderId)
      .maybeSingle();

    if (orderById) {
      order = orderById;
    } else {
      // Try order_id column as last fallback
      const { data: orderByOrderId, error: orderIdError } = await supabase
        .from('orders')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle();

      order = orderByOrderId;
      fetchError = orderIdError;
    }
  }

  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  await archiveOrder(supabase, order, reason, archivedBy);
}

/**
 * Bulk archive orders
 * Used by "Archive All" functionality
 */
export async function archiveOrdersBulk(
  supabase: SupabaseClient,
  orderIds: string[],
  reason: ArchiveReason,
  archivedBy?: string
): Promise<{ archived: number; errors: string[] }> {
  const result = { archived: 0, errors: [] as string[] };

  for (const orderId of orderIds) {
    try {
      await archiveOrderById(supabase, orderId, reason, archivedBy);
      result.archived++;
    } catch (err: any) {
      result.errors.push(`${orderId}: ${err.message}`);
    }
  }

  return result;
}

/**
 * Get archived orders with pagination and search
 * Returns orders with order_data expanded for compatibility
 */
export async function getArchivedOrders(
  supabase: SupabaseClient,
  options: {
    page?: number;
    limit?: number;
    search?: string;
  } = {}
): Promise<{ orders: any[]; total: number; page: number; limit: number }> {
  const { page = 1, limit = 50, search } = options;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('archived_orders')
    .select('*', { count: 'exact' })
    .order('archived_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Add search filter on indexed columns
  if (search && search.trim()) {
    const searchTerm = `%${search.trim()}%`;
    query = query.or(
      `order_id.ilike.${searchTerm},amazon_order_id.ilike.${searchTerm},customer_email.ilike.${searchTerm}`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch archived orders: ${error.message}`);
  }

  // Expand order_data for each archived order so it looks like a regular order
  const expandedOrders = (data || []).map((archived: any) => ({
    ...archived.order_data,
    // Add archive metadata
    archived_at: archived.archived_at,
    archive_reason: archived.archive_reason,
    archived_by: archived.archived_by,
    lifecycle_status: 'archived',
  }));

  return {
    orders: expandedOrders,
    total: count || 0,
    page,
    limit,
  };
}

/**
 * Get a single archived order by ID
 * Returns the archived order with order_data expanded, or null if not found
 */
export async function getArchivedOrderById(
  supabase: SupabaseClient,
  orderId: string
): Promise<any | null> {
  const trimmedId = orderId.trim();
  
  // Try to find by order_id or amazon_order_id
  const { data, error } = await supabase
    .from('archived_orders')
    .select('*')
    .or(`order_id.eq.${trimmedId},amazon_order_id.eq.${trimmedId}`)
    .limit(1)
    .single();

  if (error) {
    // PGRST116 = no rows found, which is expected when order doesn't exist
    if (error.code === 'PGRST116') {
      return null;
    }
    console.warn(`[getArchivedOrderById] Error fetching archived order ${orderId}:`, error);
    return null;
  }

  if (!data) {
    return null;
  }

  // Expand order_data and add archive metadata
  return {
    ...data.order_data,
    archived_at: data.archived_at,
    archive_reason: data.archive_reason,
    archived_by: data.archived_by,
    lifecycle_status: 'archived',
  };
}
