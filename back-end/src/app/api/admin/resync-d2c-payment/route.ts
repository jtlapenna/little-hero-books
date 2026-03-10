/**
 * POST /api/admin/resync-d2c-payment
 *
 * Simulates what the Stripe webhook does for a D2C multi-book order:
 * Updates pending_payment → pending_w0 (if needed), then triggers W0 for each book.
 * Use when Stripe webhook ran but W0 never executed (e.g. old/deactivated n8n URL).
 *
 * Body: { root_order_id: string }
 * Auth: Bearer BACKEND_API_TOKEN
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyBearerAuth } from '@/lib/auth';
import { buildD2CW0Payload } from '@/lib/w0-payload';
import { triggerW0 } from '@/lib/sibling-order-helpers';
import { getOrderFromSupabase, updateOrderInSupabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';
const DEFAULT_W0_WEBHOOK_URL = 'https://thepeakbeyond.app.n8n.cloud/webhook/order-intake-sibtest';

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  let body: { root_order_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const rootOrderId = body.root_order_id?.trim();
  if (!rootOrderId) {
    return NextResponse.json(
      { error: 'root_order_id is required in body' },
      { status: 400 }
    );
  }

  const w0Url = process.env.N8N_W0_WEBHOOK_URL || DEFAULT_W0_WEBHOOK_URL;
  if (!w0Url) {
    return NextResponse.json(
      { error: 'N8N_W0_WEBHOOK_URL not configured' },
      { status: 500 }
    );
  }

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find all orders for this root (multi-book: root-item-1, root-item-2, etc.)
  const pattern = `${rootOrderId}-item-%`;
  let { data: siblings } = await supabase
    .from('orders')
    .select('id,"orderId",execution_status,next_workflow,character_specs,shipping_address,customer_email,customer_name,purchase_date,dedication_text,product_info,character_hash,platform')
    .like('orderId', pattern);
  if ((siblings?.length ?? 0) === 0) {
    const alt = await supabase.from('orders').select('id,"orderId",execution_status,next_workflow,character_specs,shipping_address,customer_email,customer_name,purchase_date,dedication_text,product_info,character_hash,platform').like('order_id', pattern);
    siblings = alt.data;
  }
  if (!siblings || siblings.length === 0) {
    return NextResponse.json(
      { error: 'No orders found for root_order_id', root_order_id: rootOrderId },
      { status: 404 }
    );
  }

  const parseItemIndex = (id: string): number => {
    const m = id.match(/-item-(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  };
  siblings.sort((a: any, b: any) => parseItemIndex(a.orderId ?? a.order_id ?? '') - parseItemIndex(b.orderId ?? b.order_id ?? ''));

  const results: { orderId: string; updated: boolean; w0Ok: boolean; w0Error?: string }[] = [];
  let anyW0Failed = false;
  let lastW0Error: string | undefined;

  for (const row of siblings) {
    const orderId = (row as any).orderId ?? (row as any).order_id ?? row.id;
    const executionStatus = (row as any).execution_status;
    const nextWorkflow = (row as any).next_workflow;
    const needsUpdate = executionStatus === 'pending_payment';
    const needsW0 = needsUpdate || (executionStatus === 'pending_w0' && (nextWorkflow == null || nextWorkflow === ''));

    if (needsUpdate) {
      const now = new Date().toISOString();
      await updateOrderInSupabase(orderId, {
        execution_status: 'pending_w0',
        next_workflow: null,
        status: 'pending_w0',
        purchase_date: (row as any).purchase_date || now,
        updated_at: now,
      });
    }

    if (!needsW0) {
      results.push({ orderId, updated: needsUpdate, w0Ok: true });
      continue;
    }

    const order = await getOrderFromSupabase(orderId).catch(() => null);
    if (!order) {
      results.push({ orderId, updated: needsUpdate, w0Ok: false, w0Error: 'Order not found' });
      anyW0Failed = true;
      continue;
    }

    const payload = buildD2CW0Payload(order as Record<string, unknown>);
    const w0Result = await triggerW0(payload);
    if (!w0Result.ok) {
      results.push({ orderId, updated: needsUpdate, w0Ok: false, w0Error: w0Result.error });
      anyW0Failed = true;
      lastW0Error = w0Result.error;
    } else {
      results.push({ orderId, updated: needsUpdate, w0Ok: true });
    }
  }

  return NextResponse.json({
    success: !anyW0Failed,
    root_order_id: rootOrderId,
    orders_processed: results.length,
    results,
    message: anyW0Failed
      ? `W0 failed for some orders. Check N8N_W0_WEBHOOK_URL (${w0Url}). Last error: ${lastW0Error}`
      : 'All orders updated and W0 triggered successfully.',
  }, { status: anyW0Failed ? 500 : 200 });
}
