/**
 * POST /api/admin/backfill-shipped-at
 *
 * One-time backfill: for every order with lulu_status SHIPPED or DELIVERED
 * and shipped_at=null, set shipped_at = updated_at (best available proxy).
 * This unblocks the lifecycle cron for orders whose webhook didn't populate shipped_at.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

export async function POST() {
  // Find stuck orders
  const { data: stuck, error: fetchErr } = await supabase
    .from('orders')
    .select('id, amazon_order_id, lulu_status, shipped_at, updated_at')
    .not('lulu_job_id', 'is', null)
    .is('shipped_at', null)
    .in('lulu_status', ['SHIPPED', 'DELIVERED']);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!stuck || stuck.length === 0) {
    return NextResponse.json({ message: 'No orders need backfill', updated: 0 });
  }

  const results: { orderId: string; ok: boolean; error?: string }[] = [];

  for (const order of stuck) {
    const backfillDate = order.updated_at || new Date().toISOString();
    const { error: upErr } = await supabase
      .from('orders')
      .update({
        shipped_at: backfillDate,
        print_fulfillment_finished_at: backfillDate,
      })
      .eq('id', order.id);

    const oid = order.amazon_order_id || String(order.id);
    results.push({ orderId: oid, ok: !upErr, error: upErr?.message });
  }

  const successCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    message: `Backfilled shipped_at for ${successCount}/${stuck.length} orders`,
    updated: successCount,
    details: results,
  });
}
