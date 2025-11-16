/**
 * Supabase Analytics Query Helpers
 * Functions for querying Supabase for analytics data
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isTestOrder, extractBookId } from './analytics-helpers';

export interface AnalyticsFilters {
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  isTest?: boolean; // true = test only, false = production only, undefined = all
  bookId?: string; // Filter by book ID
}

export interface OrderRecord {
  id: number;
  amazon_order_id: string;
  created_at: string;
  updated_at: string;
  queued_at: string | null;
  started_at: string | null;
  status: string;
  execution_status: string;
  error_type: string | null;
  error_message: string | null;
  retry_count: number | null;
  regeneration_attempt: number;
  character_specs: any;
  book_specs: any;
  one_manifest_url: string | null;
  previous_character_images: any[] | null;
  rejection_history: any[] | null;
  workflow_step: string | null;
  current_workflow: string | null;
  next_workflow: string | null;
  lulu_status: string | null;
}

/**
 * Creates a Supabase client for analytics queries
 */
function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/**
 * Fetches orders from Supabase with analytics filters applied
 */
export async function getOrdersForAnalytics(
  filters: AnalyticsFilters
): Promise<OrderRecord[]> {
  const supabase = createSupabaseClient();

  // Build base query
  let query = supabase
    .from('orders')
    .select('*')
    .gte('created_at', filters.startDate)
    .lte('created_at', filters.endDate)
    .order('created_at', { ascending: false });

  // Execute query
  const { data, error } = await query;

  if (error) {
    console.error('[Analytics] Supabase query error:', error);
    throw new Error(`Failed to fetch orders: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  // Apply filters that can't be done in SQL
  let filtered = data as OrderRecord[];

  // Filter by test vs production (done in memory since we don't have is_test_order field yet)
  if (filters.isTest !== undefined) {
    filtered = filtered.filter(order => {
      const isTest = isTestOrder(order.amazon_order_id);
      return isTest === filters.isTest;
    });
  }

  // Filter by book ID (extract from manifest URL or book_specs)
  if (filters.bookId) {
    filtered = filtered.filter(order => {
      const bookId = extractBookId(order.one_manifest_url, order.book_specs);
      return bookId === filters.bookId;
    });
  }

  return filtered;
}

/**
 * Gets unique book IDs from orders in date range
 */
export async function getAvailableBookIds(
  startDate: string,
  endDate: string
): Promise<string[]> {
  const orders = await getOrdersForAnalytics({ startDate, endDate });
  
  const bookIds = new Set<string>();
  orders.forEach(order => {
    const bookId = extractBookId(order.one_manifest_url, order.book_specs);
    bookIds.add(bookId);
  });
  
  return Array.from(bookIds).sort();
}

