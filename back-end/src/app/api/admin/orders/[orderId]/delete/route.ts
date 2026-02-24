/**
 * DELETE /api/admin/orders/[orderId]/delete
 *
 * Permanently deletes an order from the orders table (no archiving).
 * Use for erroneous/ghost records that shouldn't be archived.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { getOrderFromSupabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
  }

  // Purpose: delete exactly one per-book row (amazon_order_id can be a group key).
  const existing = await getOrderFromSupabase(orderId).catch(() => null);
  const id = (existing as any)?.id;
  if (!existing || typeof id !== 'number') {
    return NextResponse.json({ error: 'Order not found', orderId }, { status: 404 });
  }

  const r = await supabase.from('orders').delete().eq('id', id).select('id');
  if (!r.data || r.data.length === 0) {
    return NextResponse.json({ error: 'Order not found', orderId }, { status: 404 });
  }

  return NextResponse.json({ success: true, orderId, message: `Order ${orderId} permanently deleted` });
}
