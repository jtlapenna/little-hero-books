/**
 * DELETE /api/admin/orders/[orderId]/delete
 *
 * Permanently deletes an order from the orders table (no archiving).
 * Use for erroneous/ghost records that shouldn't be archived.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
  }

  // Try deleting by orderId first, then amazon_order_id
  let deleted = false;

  const r1 = await supabase.from('orders').delete().eq('orderId', orderId).select('id');
  if (r1.data && r1.data.length > 0) deleted = true;

  if (!deleted) {
    const r2 = await supabase.from('orders').delete().eq('amazon_order_id', orderId).select('id');
    if (r2.data && r2.data.length > 0) deleted = true;
  }

  if (!deleted) {
    return NextResponse.json({ error: 'Order not found', orderId }, { status: 404 });
  }

  return NextResponse.json({ success: true, orderId, message: `Order ${orderId} permanently deleted` });
}
