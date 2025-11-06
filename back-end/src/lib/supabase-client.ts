import { createClient } from '@supabase/supabase-js';

let supabaseClient: ReturnType<typeof createClient> | null = null;
let initializationError: Error | null = null;

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
  // If orderId is numeric, try as integer id first (most common case)
  const numericId = parseInt(orderId);
  if (!isNaN(numericId)) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', numericId)
      .single();
    
    if (!error) return data;
  }
  
  // Try camelCase (orderId field) - might exist in some schemas
  let { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('orderId', orderId)
    .single();
  
  // If that fails, try snake_case (order_id field)
  if (error && (error.code === '42703' || error.code === 'PGRST116')) {
    ({ data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single());
  }
  
  // If that fails, try amazon_order_id (text field)
  if (error && (error.code === '42703' || error.code === 'PGRST116')) {
    ({ data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('amazon_order_id', orderId)
      .single());
  }
  
  if (error) {
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
  };
  
  // Convert all fields to snake_case
  for (const [key, value] of Object.entries(updates)) {
    const dbKey = fieldMap[key] || key.replace(/([A-Z])/g, '_$1').toLowerCase();
    updateData[dbKey] = value;
  }
  
  // Always add updated_at timestamp
  updateData.updated_at = new Date().toISOString();
  
  // Try to find order by id (integer) first, then other fields
  const numericId = parseInt(orderId);
  let data: any = null;
  let error: any = null;
  
  if (!isNaN(numericId)) {
    const result = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', numericId)
      .select()
      .single();
    data = result.data;
    error = result.error;
  }
  
  // If that fails or not numeric, try camelCase
  if (error && (error.code === '42703' || error.code === 'PGRST116') || isNaN(numericId)) {
    const result = await supabase
      .from('orders')
      .update(updateData)
      .eq('orderId', orderId)
      .select()
      .single();
    data = result.data;
    error = result.error;
  }
  
  // If that fails, try snake_case
  if (error && (error.code === '42703' || error.code === 'PGRST116')) {
    const result = await supabase
      .from('orders')
      .update(updateData)
      .eq('order_id', orderId)
      .select()
      .single();
    data = result.data;
    error = result.error;
  }
  
  // If that fails, try amazon_order_id
  if (error && (error.code === '42703' || error.code === 'PGRST116')) {
    const result = await supabase
      .from('orders')
      .update(updateData)
      .eq('amazon_order_id', orderId)
      .select()
      .single();
    data = result.data;
    error = result.error;
  }
  
  if (error) {
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

