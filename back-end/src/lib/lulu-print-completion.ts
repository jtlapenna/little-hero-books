import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabase } from './supabase-client';
import { calculateOrderStatusFromOrder, type StatusCalculationOrder } from './status-service';

const Row = z.object({ id: z.number().int().positive(), orderId: z.string().min(1), print_provider: z.enum(['lulu']).nullish(),
  lulu_job_id: z.union([z.string(), z.number()]).nullish(), updated_at: z.string().nullish(),
  print_submission_id: z.string().nullish(), gelato_order_id: z.string().nullish(), gelato_order_type: z.string().nullish(), gelato_status: z.string().nullish(),
}).passthrough();

export async function persistLuluPrintCompletion(raw: unknown, updates: Record<string, unknown>, database: SupabaseClient = supabase) {
  const row = Row.parse(raw);
  if ([row.print_submission_id, row.gelato_order_id, row.gelato_order_type, row.gelato_status].some(value => value != null) ||
      (row.print_provider == null && !row.lulu_job_id)) throw Error('Lulu completion ownership is unresolved');
  const status = calculateOrderStatusFromOrder({ ...row, ...updates } as StatusCalculationOrder);
  // Match the validated PK/canonical key, never the caller's ambiguous alias. Match
  // provider, prior job and revision as well, so changed ownership/zero writes fail closed.
  let query = database.from('orders').update({ ...updates, status, updated_at: new Date().toISOString() }).eq('id', row.id).eq('orderId', row.orderId)
    .is('print_submission_id', null).is('gelato_order_id', null).is('gelato_order_type', null).is('gelato_status', null);
  query = row.print_provider === 'lulu' ? query.eq('print_provider', 'lulu') : query.is('print_provider', null);
  query = row.lulu_job_id != null ? query.eq('lulu_job_id', row.lulu_job_id) : query.is('lulu_job_id', null);
  query = row.updated_at != null ? query.eq('updated_at', row.updated_at) : query.is('updated_at', null);
  const { data, error } = await query.select('id,orderId').maybeSingle();
  if (error || !data || data.id !== row.id || data.orderId !== row.orderId) throw Error('Exact Lulu completion write was not confirmed');
}
