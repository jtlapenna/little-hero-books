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
  // Trim orderId to handle trailing/leading spaces from data entry issues
  const trimmedOrderId = orderId.trim();
  
  // If orderId is numeric, try as integer id first (most common case)
  const numericId = parseInt(trimmedOrderId);
  if (!isNaN(numericId)) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', numericId)
      .single();
    
    if (!error) return data;
  }
  
  // Try camelCase (orderId field) - might exist in some schemas
  // First try exact match with trimmed orderId
  let { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('orderId', trimmedOrderId)
    .single();
  
  // If exact match fails, try with trailing space pattern (database may have trailing spaces)
  if (error && (error.code === 'PGRST116' || error.code === 'PGRST204')) {
    ({ data, error } = await supabase
      .from('orders')
      .select('*')
      .ilike('orderId', `${trimmedOrderId}%`)
      .single());
  }
  
  // If that fails, try snake_case (order_id field)
  if (error && (error.code === '42703' || error.code === 'PGRST116' || error.code === 'PGRST204')) {
    ({ data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', trimmedOrderId)
      .single());
    
    // If exact match fails, try with trailing space pattern
    if (error && (error.code === 'PGRST116' || error.code === 'PGRST204')) {
      ({ data, error } = await supabase
        .from('orders')
        .select('*')
        .ilike('order_id', `${trimmedOrderId}%`)
        .single());
    }
  }
  
  // If that fails, try amazon_order_id (text field) - this is the most common case
  if (error && (error.code === '42703' || error.code === 'PGRST116' || error.code === 'PGRST204')) {
    ({ data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('amazon_order_id', trimmedOrderId)
      .single());
    
    // If exact match fails, try with trailing space pattern (handles trailing spaces in database)
    if (error && (error.code === 'PGRST116' || error.code === 'PGRST204')) {
      ({ data, error } = await supabase
        .from('orders')
        .select('*')
        .ilike('amazon_order_id', `${trimmedOrderId}%`)
        .single());
    }
  }
  
  if (error) {
    const noRows =
      error.code === 'PGRST116' ||
      error.code === 'PGRST204' ||
      (typeof error.message === 'string' &&
        error.message.toLowerCase().includes('contains 0 rows'));

    if (noRows) {
      return null;
    }

    console.error(`[Supabase] Error fetching order ${orderId}:`, error);
    throw error;
  }
  return data;
}

export async function updateOrderInSupabase(orderId: string, updates: any) {
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
  
  // Try to find order by multiple possible fields
  // This handles both:
  // - Real Amazon orders (stored in amazon_order_id)
  // - Manual/dummy orders (stored in orderId, order_id, or id)
  // Priority: Try all possible fields to ensure we find the order regardless of type
  let data: any = null;
  let error: any = null;
  
  // Strategy: Try all possible identifier fields in parallel-friendly order
  // 1. Try amazon_order_id (for real Amazon orders)
  const result1 = await supabase
      .from('orders')
      .update(updateData)
    .eq('amazon_order_id', orderId)
      .select()
      .single();
  data = result1.data;
  error = result1.error;
  
  // 2. If that fails, try orderId (camelCase - for manual/dummy orders)
  if (error && (error.code === '42703' || error.code === 'PGRST116')) {
    const result2 = await supabase
      .from('orders')
      .update(updateData)
      .eq('orderId', orderId)
      .select()
      .single();
    data = result2.data;
    error = result2.error;
  }
  
  // 3. If that fails, try order_id (snake_case - alternative for manual orders)
  if (error && (error.code === '42703' || error.code === 'PGRST116')) {
    const result3 = await supabase
      .from('orders')
      .update(updateData)
      .eq('order_id', orderId)
      .select()
      .single();
    data = result3.data;
    error = result3.error;
  }
  
  // 4. If that fails and orderId is numeric, try id (for numeric IDs)
  const numericId = parseInt(orderId);
  if (error && (error.code === '42703' || error.code === 'PGRST116') && !isNaN(numericId)) {
    const result4 = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', numericId)
      .select()
      .single();
    data = result4.data;
    error = result4.error;
  }
  
  if (error) {
    // Only try to insert if the error is "no rows found" (PGRST116)
    // If it's a different error (like duplicate key), don't try to insert
    if (
      error.code === 'PGRST116' ||
      (typeof error.message === 'string' && error.message.toLowerCase().includes('results contain 0 rows'))
    ) {
      // Double-check that the order doesn't exist before inserting
      // Try to find it by all possible identifier fields (supports both Amazon and manual orders)
      let checkResult = await supabase
        .from('orders')
        .select('id, amazon_order_id, orderId, order_id')
        .eq('amazon_order_id', orderId)
        .maybeSingle();
      
      // If not found by amazon_order_id, try orderId
      if (!checkResult.data) {
        checkResult = await supabase
          .from('orders')
          .select('id, amazon_order_id, orderId, order_id')
          .eq('orderId', orderId)
          .maybeSingle();
      }
      
      // If not found by orderId, try order_id
      if (!checkResult.data) {
        checkResult = await supabase
          .from('orders')
          .select('id, amazon_order_id, orderId, order_id')
          .eq('order_id', orderId)
          .maybeSingle();
      }
      
      // If not found and orderId is numeric, try id
      if (!checkResult.data && !isNaN(numericId)) {
        checkResult = await supabase
          .from('orders')
          .select('id, amazon_order_id, orderId, order_id')
          .eq('id', numericId)
          .maybeSingle();
      }
      
      if (checkResult.data) {
        // Order exists, determine which field to use for update
        const order = checkResult.data;
        let retryResult;
        
        if (order.amazon_order_id === orderId) {
          retryResult = await supabase
            .from('orders')
            .update(updateData)
            .eq('amazon_order_id', orderId)
            .select()
            .single();
        } else if (order.orderId === orderId) {
          retryResult = await supabase
            .from('orders')
            .update(updateData)
            .eq('orderId', orderId)
            .select()
            .single();
        } else if (order.order_id === orderId) {
          retryResult = await supabase
            .from('orders')
            .update(updateData)
            .eq('order_id', orderId)
            .select()
            .single();
        } else if (!isNaN(numericId) && order.id === numericId) {
          retryResult = await supabase
            .from('orders')
            .update(updateData)
            .eq('id', numericId)
            .select()
            .single();
        }
        
        if (retryResult?.data) {
          console.log(`[Supabase] Order ${orderId} found and updated successfully`);
          return retryResult.data;
        }
        // If retry still fails, throw the error
        console.error(`[Supabase] Retry update failed for order ${orderId}:`, retryResult?.error);
        throw retryResult?.error || error;
      }
      
      // Order doesn't exist, safe to insert
      const insertPayload: any = {
        amazon_order_id: orderId,
        orderId: orderId, // Ensure orderId is set (required column)
        status: updateData.status || 'pending_processing',
        created_at: new Date().toISOString(),
        updated_at: updateData.updated_at,
        ...updateData
      };

      const { data: insertData, error: insertError } = await supabase
        .from('orders')
        .insert(insertPayload)
        .select()
        .single();

      if (insertError) {
        console.error(`[Supabase] Error inserting order ${orderId}:`, insertError);
        throw insertError;
      }

      return insertData;
    }

    // For other errors (like duplicate key, constraint violations, etc.), just throw
    console.error(`[Supabase] Error updating order ${orderId}:`, error);
    throw error;
  }
  return data;
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

export async function listOrdersFromSupabase(options: { limit?: number } = {}) {
  try {
    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('[Supabase] Error listing orders:', error);
    throw error;
  }
}

