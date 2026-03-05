import { createClient } from '@supabase/supabase-js';

let supabaseClient: ReturnType<typeof createClient> | null = null;
let initializationError: Error | null = null;

function createNoopQueryBuilder() {
  const builder: any = {};

  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => builder;
  builder.limit = () => builder;
  builder.range = () => builder;
  builder.single = () => Promise.resolve({ data: null, error: null });
  builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
  builder.insert = () => Promise.resolve({ data: null, error: null });
  builder.update = () => builder;
  builder.delete = () => Promise.resolve({ data: null, error: null });
  builder.upsert = () => Promise.resolve({ data: null, error: null });
  builder.then = undefined;

  return builder;
}

function getSupabaseClient() {
  // Return cached client if available
  if (supabaseClient) {
    return supabaseClient;
  }

  // On client side, if we've already tried and failed, return null
  // (don't throw, let the proxy handle it gracefully)
  if (initializationError && typeof window !== 'undefined') {
    return null as any;
  }

  // On server side, throw if we've already tried and failed
  if (initializationError) {
    throw initializationError;
  }

  // Try to get env vars (server-side only, not available on client)
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

  // Check if we're on the client side (where env vars won't be available)
  const isClient = typeof window !== 'undefined';
  
  if (!supabaseUrl || !supabaseServiceKey) {
    // On client side, we can't use Supabase directly - this is expected
    // Supabase operations should happen via API routes
    // Don't throw error, just cache it silently on client
    if (isClient) {
      // Client-side: Supabase not available (expected, use API routes)
      // Return a silent error that won't be logged
      initializationError = new Error('Supabase client is not available on the client side.');
      return null as any; // Return null instead of throwing
    }
    
    // On server side, show helpful error
    if (process.env.NODE_ENV === 'development') {
      initializationError = new Error('Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local file and restart the dev server.');
      throw initializationError;
    }
    initializationError = new Error('Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    throw initializationError;
  }

  supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return supabaseClient;
}

// Create a lazy proxy that only initializes when actually accessed
// This prevents initialization during React module evaluation
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    // Skip initialization for React/Next.js internal properties
    if (prop === 'then' || prop === 'Symbol' || typeof prop === 'symbol') {
      return undefined;
    }
    
    // Skip for React refresh/internal checks
    if (typeof prop === 'string' && (
      prop.startsWith('$$') || 
      prop === 'constructor' ||
      prop === 'toString' ||
      prop === 'valueOf'
    )) {
      return undefined;
    }
    
    // Only initialize when actually accessing a Supabase method
    try {
      const client = getSupabaseClient();
      // If client is null (client-side, Supabase not available), return no-op
      if (!client) {
        if (prop === 'from') {
          return () => createNoopQueryBuilder();
        }
        return () => Promise.resolve({ data: null, error: null });
      }
      const value = client[prop as keyof ReturnType<typeof createClient>];
      if (typeof value === 'function') {
        return value.bind(client);
      }
      return value;
    } catch (error) {
      // If we're on client side and Supabase isn't available, suppress the error
      // since Supabase operations should happen via API routes anyway
      if (typeof window !== 'undefined') {
        // Return a no-op function for methods, undefined for properties
        // This prevents errors during React module evaluation
        if (prop === 'from') {
          return () => createNoopQueryBuilder();
        }
        return () => Promise.resolve({ data: null, error: null });
      }
      // On server side, we want to know about the error
      throw error;
    }
  }
});

// Order CRUD operations
// Note: Database uses integer `id` as PK with snake_case columns
// We can query by: id (integer), or any text field that matches
export async function getOrderFromSupabase(orderId: string) {
  // Purpose: tolerate trailing spaces and mixed identifier semantics.
  const trimmedOrderId = orderId.trim();
  if (!trimmedOrderId) return null;

  const numericId = /^\d+$/.test(trimmedOrderId) ? parseInt(trimmedOrderId, 10) : NaN;
  if (!Number.isNaN(numericId)) {
    const { data, error } = await supabase.from('orders').select('*').eq('id', numericId).maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    if (data) return data;
  }

  const trySingleBy = async (column: string): Promise<Record<string, unknown> | null> => {
    const { data, error } = await supabase.from('orders').select('*').eq(column, trimmedOrderId).maybeSingle();
    if (error?.code === '42703') return null;
    if (error) throw error;
    if (data) return data as Record<string, unknown>;

    const like = await supabase.from('orders').select('*').ilike(column, `${trimmedOrderId}%`).limit(1);
    if (like.error?.code === '42703') return null;
    if (like.error) throw like.error;
    return (like.data?.[0] as Record<string, unknown> | undefined) ?? null;
  };

  // Purpose: prefer per-book identifiers first.
  const byOrderId = await trySingleBy('orderId');
  if (byOrderId) return byOrderId;

  const byOrderIdSnake = await trySingleBy('order_id');
  if (byOrderIdSnake) return byOrderIdSnake;

  // Purpose: root_order_id may be a group key; return primary deterministically.
  const { data: byRoot, error: rootError } = await supabase
    .from('orders')
    .select('*')
    .eq('root_order_id', trimmedOrderId)
    .limit(50);
  if (rootError?.code !== '42703' && rootError) throw rootError;
  if (byRoot && byRoot.length > 0) {
    const primary =
      byRoot.find((o: any) => String(o?.orderId ?? '').trim() === trimmedOrderId) ??
      byRoot.find((o: any) => String(o?.order_id ?? '').trim() === trimmedOrderId) ??
      byRoot[0];
    return primary as any;
  }

  // Purpose: legacy fallback during transition.
  const { data: byAmazon, error: amazonError } = await supabase
    .from('orders')
    .select('*')
    .eq('amazon_order_id', trimmedOrderId)
    .limit(50);
  if (amazonError?.code !== '42703' && amazonError) throw amazonError;
  if (byAmazon && byAmazon.length > 0) {
    const primary =
      byAmazon.find((o: any) => String(o?.orderId ?? '').trim() === trimmedOrderId) ??
      byAmazon.find((o: any) => String(o?.order_id ?? '').trim() === trimmedOrderId) ??
      byAmazon[0];
    return primary as any;
  }

  const byRootLike = await supabase
    .from('orders')
    .select('*')
    .ilike('root_order_id', `${trimmedOrderId}%`)
    .limit(1);
  if (byRootLike.error?.code !== '42703' && byRootLike.error) throw byRootLike.error;
  if (byRootLike.data?.[0]) return byRootLike.data[0] as any;

  const byAmazonLike = await supabase
    .from('orders')
    .select('*')
    .ilike('amazon_order_id', `${trimmedOrderId}%`)
    .limit(1);
  if (byAmazonLike.error?.code !== '42703' && byAmazonLike.error) throw byAmazonLike.error;
  return (byAmazonLike.data?.[0] as any) ?? null;
}

export async function updateOrderInSupabase(orderId: string, updates: any) {
  // Purpose: update an existing order by per-book identity (fail if not found).

  // Convert camelCase to snake_case for database columns
  const updateData: any = {};
  
  // Map common field names
  const fieldMap: Record<string, string> = {
    'workflow_step': 'workflow_step',
    'status': 'status',
    'review_stages': 'review_stages',
    'flags': 'flags',
    'has_flags': 'has_flags',
    'customer_approval_status': 'customer_approval_status',
    'customer_approval_required': 'customer_approval_required',
    'customer_approval_requested_at': 'customer_approval_requested_at',
    'customer_approval_approved_at': 'customer_approval_approved_at',
    'preview_reminder_sent': 'preview_reminder_sent',
    'lulu_status': 'lulu_status',
    'manifest_2b_url': 'manifest_2b_url',
    'manifest_3_url': 'manifest_3_url',
    'final_book_url': 'final_book_url',
    'final_cover_url': 'final_cover_url',
    'execution_status': 'execution_status',
    'next_workflow': 'next_workflow',
    'current_workflow': 'current_workflow',
    'queued_at': 'queued_at',
    'started_at': 'started_at',
  };
  
  // Convert all fields to snake_case
  for (const [key, value] of Object.entries(updates)) {
    const dbKey = fieldMap[key] || key.replace(/([A-Z])/g, '_$1').toLowerCase();
    updateData[dbKey] = value;
  }
  
  // Always add updated_at timestamp
  updateData.updated_at = new Date().toISOString();
  
  const trimmedOrderId = String(orderId ?? '').trim();
  if (!trimmedOrderId) throw new Error('[Supabase] Missing orderId for update');

  const numericId = /^\d+$/.test(trimmedOrderId) ? parseInt(trimmedOrderId, 10) : NaN;

  const tryUpdate = async (applyFilters: (q: any) => any): Promise<any | null> => {
    // Purpose: treat 0-row updates as a miss so we can try the next identifier.
    const { data, error } = await applyFilters(supabase.from('orders').update(updateData)).select('id');
    if (error?.code === '42703') return null; // Purpose: column missing in this schema.
    if (error) throw error;
    return data?.[0] ?? null; // Purpose: 0 rows updated → null (trigger fallback).
  };

  // Purpose: prefer per-book identifiers, then a safe amazon root lookup (primary row only).
  const byOrderId = await tryUpdate((q) => q.eq('orderId', trimmedOrderId));
  if (byOrderId) return byOrderId;

  const byOrderIdSnake = await tryUpdate((q) => q.eq('order_id', trimmedOrderId));
  if (byOrderIdSnake) return byOrderIdSnake;

  if (!Number.isNaN(numericId)) {
    const byId = await tryUpdate((q) => q.eq('id', numericId));
    if (byId) return byId;
  }

  // Purpose: root_order_id may be group key; only update the primary row when caller passes root id.
  const byRootPrimary =
    (await tryUpdate(
      (q) => q.eq('root_order_id', trimmedOrderId).eq('orderId', trimmedOrderId)
    )) ||
    (await tryUpdate(
      (q) => q.eq('root_order_id', trimmedOrderId).eq('order_id', trimmedOrderId)
    ));
  if (byRootPrimary) return byRootPrimary;

  // Purpose: legacy fallback during transition.
  const byAmazonPrimary =
    (await tryUpdate(
      (q) => q.eq('amazon_order_id', trimmedOrderId).eq('orderId', trimmedOrderId)
    )) ||
    (await tryUpdate(
      (q) => q.eq('amazon_order_id', trimmedOrderId).eq('order_id', trimmedOrderId)
    ));
  if (byAmazonPrimary) return byAmazonPrimary;

  // Purpose: sibling/line-item orders (e.g. {uuid}-item-1) may use amazon_order_id as the sole per-book ID.
  const byAmazonOnly = await tryUpdate((q) => q.eq('amazon_order_id', trimmedOrderId));
  if (byAmazonOnly) return byAmazonOnly;

  // Purpose: order may exist only in manifests (e.g. sibling not yet synced to Supabase). Log and no-op instead of throwing
  // so flag updates don't crash the UI — manifest is source of truth for flags.
  console.warn(`[Supabase] Order not found for update (will skip): ${trimmedOrderId}`);
  return null;
}

export async function listOrdersByAmazonRootId(amazonOrderId: string) {
  // Purpose: list sibling groups by canonical root key, with legacy fallback.
  const root = amazonOrderId.trim();
  if (!root) return [];
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('root_order_id', root)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error?.code !== '42703' && error) throw error;
  if (data && data.length > 0) return data;

  const legacy = await supabase
    .from('orders')
    .select('*')
    .eq('amazon_order_id', root)
    .order('created_at', { ascending: true })
    .limit(200);
  if (legacy.error) throw legacy.error;
  return legacy.data ?? [];
}

export async function createOrderInSupabase(order: any) {
  // Convert to snake_case and set timestamps
  const orderData: any = {};
  
  // Map fields to snake_case
  for (const [key, value] of Object.entries(order)) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    orderData[snakeKey] = value;
  }
  
  // Set timestamps
  const now = new Date().toISOString();
  orderData.created_at = orderData.created_at || now;
  orderData.updated_at = orderData.updated_at || now;
  
  const { data, error } = await supabase
    .from('orders')
    .insert(orderData)
    .select()
    .single();
  
  if (error) {
    console.error(`[Supabase] Error creating order:`, error);
    throw error;
  }
  return data;
}

export interface UpsertByPerBookIdResult {
  data: Record<string, unknown> | null;
  error: Error | null;
  wasInsert: boolean;
}

export async function upsertOrderByPerBookId(
  payload: Record<string, unknown>
): Promise<UpsertByPerBookIdResult> {
  // Use per-book order id as the write key so sibling rows can share amazon_order_id safely.
  const perBookIdRaw = payload.orderId ?? payload.order_id;
  const perBookId = String(perBookIdRaw ?? '').trim();
  if (!perBookId) {
    return {
      data: null,
      error: new Error('Missing orderId/order_id for per-book upsert'),
      wasInsert: false,
    };
  }

  const normalizedPayload: Record<string, unknown> = {
    ...payload,
    orderId: payload.orderId ?? perBookId,
  };

  const byOrderId = await supabase
    .from('orders')
    .select('id')
    .eq('orderId', perBookId)
    .maybeSingle();

  if (byOrderId.error && byOrderId.error.code !== 'PGRST116' && byOrderId.error.code !== '42703') {
    return { data: null, error: new Error(byOrderId.error.message), wasInsert: false };
  }

  const byOrderIdSnake = byOrderId.error?.code === '42703'
    ? await supabase.from('orders').select('id').eq('order_id', perBookId).maybeSingle()
    : null;

  if (byOrderIdSnake?.error && byOrderIdSnake.error.code !== 'PGRST116') {
    return { data: null, error: new Error(byOrderIdSnake.error.message), wasInsert: false };
  }

  const existingId = (byOrderId.data as { id?: number } | null)?.id
    ?? (byOrderIdSnake?.data as { id?: number } | null)?.id;

  if (typeof existingId === 'number') {
    const updated = await supabase
      .from('orders')
      .update(normalizedPayload)
      .eq('id', existingId)
      .select()
      .single();

    if (updated.error) {
      return { data: null, error: new Error(updated.error.message), wasInsert: false };
    }
    return {
      data: (updated.data as Record<string, unknown> | null) ?? null,
      error: null,
      wasInsert: false,
    };
  }

  const inserted = await supabase
    .from('orders')
    .insert(normalizedPayload)
    .select()
    .single();

  if (inserted.error) {
    return { data: null, error: new Error(inserted.error.message), wasInsert: true };
  }

  return {
    data: (inserted.data as Record<string, unknown> | null) ?? null,
    error: null,
    wasInsert: true,
  };
}

export interface ListOrdersOptions {
  limit?: number;
  lifecycle?: 'active' | 'recently_delivered' | 'all'; // Filter by lifecycle status
  includeArchived?: boolean; // Include archived orders from archived_orders table
}

export async function listOrdersFromSupabase(options: ListOrdersOptions = {}) {
  try {
    // Build query for main orders table
    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    // Filter by lifecycle status
    if (options.lifecycle && options.lifecycle !== 'all') {
      query = query.eq('lifecycle_status', options.lifecycle);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data: ordersData, error: ordersError } = await query;

    if (ordersError) {
      throw ordersError;
    }

    let orders = ordersData || [];

    // Fetch archived orders if requested
    if (options.includeArchived) {
      let archivedQuery = supabase
        .from('archived_orders')
        .select('*')
        .order('archived_at', { ascending: false });

      if (options.limit) {
        // Adjust limit for archived orders based on how many main orders we got
        const remainingLimit = options.limit - orders.length;
        if (remainingLimit > 0) {
          archivedQuery = archivedQuery.limit(remainingLimit);
        }
      }

      const { data: archivedData, error: archivedError } = await archivedQuery;

      if (archivedError) {
        console.warn('[Supabase] Error fetching archived orders:', archivedError);
        // Don't throw - return main orders without archived
      } else if (archivedData && archivedData.length > 0) {
        console.log(`[Supabase] Found ${archivedData.length} archived orders`);
        // Expand order_data JSONB and mark as archived
        const markedArchived = archivedData.map((archived: any) => ({
          ...archived.order_data,  // Spread the stored order data
          archived_at: archived.archived_at,
          archive_reason: archived.archive_reason,
          archived_by: archived.archived_by,
          lifecycle_status: 'archived',
        }));
        orders = [...orders, ...markedArchived];
      }
    }

    return orders;
  } catch (error) {
    console.error('[Supabase] Error listing orders:', error);
    throw error;
  }
}

