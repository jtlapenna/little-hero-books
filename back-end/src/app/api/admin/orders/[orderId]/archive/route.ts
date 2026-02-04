import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { archiveOrderById, ArchiveReason } from '@/lib/order-lifecycle';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

/**
 * POST /api/admin/orders/[orderId]/archive
 * 
 * Archives a single order, moving it from orders to archived_orders table.
 * 
 * Body: { reason?: string } - Optional reason text (defaults to 'manual')
 * 
 * Returns: { success: true, orderId: string, archivedAt: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // Auth check: same-origin or admin domain
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const isSameOrigin = !origin ||
                       origin?.includes(siteUrl) ||
                       referer?.includes(siteUrl) ||
                       origin?.includes('littleherolabs.com') ||
                       referer?.includes('littleherolabs.com');

  if (!isSameOrigin) {
    console.error('[Archive Order] Unauthorized request:', { origin, referer });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Supabase credentials not configured' },
      { status: 500 }
    );
  }

  const { orderId } = await params;

  if (!orderId) {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
  }

  // Parse request body for optional reason
  let reason: ArchiveReason = 'manual';
  try {
    const body = await request.json().catch(() => ({}));
    if (body.reason && ['manual', 'auto_delivered', 'auto_cancelled'].includes(body.reason)) {
      reason = body.reason;
    }
  } catch {
    // Use default reason
  }

  console.log('[Archive Order] Archiving order:', { orderId, reason });

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    await archiveOrderById(supabase, orderId, reason);

    const archivedAt = new Date().toISOString();
    console.log('[Archive Order] Successfully archived:', { orderId, archivedAt });

    return NextResponse.json({
      success: true,
      orderId,
      archivedAt,
      message: `Order ${orderId} archived successfully`,
    });
  } catch (error: any) {
    console.error('[Archive Order] Error:', error);
    return NextResponse.json(
      { error: 'Failed to archive order', details: error.message },
      { status: 500 }
    );
  }
}
