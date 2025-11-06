import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
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

