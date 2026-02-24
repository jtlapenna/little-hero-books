type SupabaseLike = {
  from: (table: string) => any;
};

type LookupResult<T> = { row: T | null; used: 'id' | 'orderId' | 'order_id' | 'root_order_id' | 'amazon_order_id' | 'none' };

function pickPrimary<T extends Record<string, unknown>>(rows: T[], requested: string): T {
  return (
    rows.find((o) => String(o.orderId ?? '').trim() === requested) ||
    rows.find((o) => String(o.order_id ?? '').trim() === requested) ||
    rows[0]
  );
}

/**
 * Purpose: fetch exactly one order row when a group key may match multiple rows.
 * Tries per-book identifiers first, then falls back to group lookup and picks a deterministic primary.
 */
export async function fetchOrderRowByAnyId<T extends Record<string, unknown>>(
  supabase: SupabaseLike,
  rawId: string,
  select: string
): Promise<LookupResult<T>> {
  const id = String(rawId ?? '').trim();
  if (!id) return { row: null, used: 'none' };

  const numericId = /^\d+$/.test(id) ? parseInt(id, 10) : NaN;
  if (!Number.isNaN(numericId)) {
    const r = await supabase.from('orders').select(select).eq('id', numericId).maybeSingle();
    if (r.error && r.error.code !== 'PGRST116') throw r.error;
    if (r.data) return { row: r.data as T, used: 'id' };
  }

  const r1 = await supabase.from('orders').select(select).eq('orderId', id).maybeSingle();
  if (!r1.error && r1.data) return { row: r1.data as T, used: 'orderId' };
  if (r1.error && r1.error.code !== 'PGRST116' && r1.error.code !== '42703') throw r1.error;

  const r2 = await supabase.from('orders').select(select).eq('order_id', id).maybeSingle();
  if (!r2.error && r2.data) return { row: r2.data as T, used: 'order_id' };
  if (r2.error && r2.error.code !== 'PGRST116' && r2.error.code !== '42703') throw r2.error;

  const r3 = await supabase.from('orders').select(select).eq('root_order_id', id).limit(50);
  if (r3.error && r3.error.code !== '42703') throw r3.error;
  if (r3.data && r3.data.length > 0) {
    return { row: pickPrimary(r3.data as T[], id), used: 'root_order_id' };
  }

  const r4 = await supabase.from('orders').select(select).eq('amazon_order_id', id).limit(50);
  if (r4.error && r4.error.code !== '42703') throw r4.error;
  if (r4.data && r4.data.length > 0) {
    return { row: pickPrimary(r4.data as T[], id), used: 'amazon_order_id' };
  }

  return { row: null, used: 'none' };
}

/** Purpose: update a single row safely by resolving its integer `id`. */
export async function updateOrderRowByAnyId(
  supabase: SupabaseLike,
  rawId: string,
  updates: Record<string, unknown>
): Promise<{ updated: boolean }> {
  const { row } = await fetchOrderRowByAnyId<Record<string, unknown>>(supabase, rawId, 'id');
  const id = row?.id;
  if (typeof id !== 'number') return { updated: false };
  const r = await supabase.from('orders').update(updates).eq('id', id);
  if (r.error) throw r.error;
  return { updated: true };
}

