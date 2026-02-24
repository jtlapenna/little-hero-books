import { NextRequest, NextResponse } from 'next/server';
import { supabase, getOrderFromSupabase, updateOrderInSupabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * Set product_info.line_items on an order (admin).
 * Use when CSV re-upload didn't persist line_items; paste the items from your .txt/CSV.
 *
 * POST /api/admin/orders/[orderId]/set-line-items
 * Body: { line_items: [ { order_item_id?: string, customization_url: string }, ... ] }
 */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  return (
    !origin ||
    origin.includes(siteUrl) ||
    referer?.includes(siteUrl) ||
    origin.includes('littleherolabs.com') ||
    referer?.includes('littleherolabs.com')
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orderId } = await params;
  const orderIdValue = String(orderId || '').trim();
  if (!orderIdValue) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
  }

  let body: { line_items?: Array<{ order_item_id?: string; customization_url?: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const lineItems = Array.isArray(body?.line_items) ? body.line_items : null;
  if (!lineItems || lineItems.length === 0) {
    return NextResponse.json(
      { error: 'Body must include line_items array with at least one item (order_item_id, customization_url)' },
      { status: 400 }
    );
  }

  const normalized = lineItems.map((item) => ({
    order_item_id: item.order_item_id ?? null,
    customization_url: typeof item.customization_url === 'string' ? item.customization_url.trim() : null,
  }));

  const order = await getOrderFromSupabase(orderIdValue).catch(() => null);
  if (!order) {
    return NextResponse.json(
      { error: 'Order not found', orderId: orderIdValue },
      { status: 404 }
    );
  }

  const existingProductInfo = ((order as any).product_info as Record<string, unknown>) || {};
  const updatedProductInfo = {
    ...existingProductInfo,
    _created_via_csv: true,
    line_items: normalized,
  };

  await updateOrderInSupabase(orderIdValue, { product_info: updatedProductInfo });

  return NextResponse.json({
    success: true,
    orderId: orderIdValue,
    line_items_count: normalized.length,
    message: 'product_info.line_items updated. Run create-sibling script without --url.',
  });
}
