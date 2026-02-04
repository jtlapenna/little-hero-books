import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { archiveOrdersBulk, ArchiveReason } from '@/lib/order-lifecycle';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

/**
 * POST /api/admin/orders/archive-bulk
 * 
 * Archives multiple orders at once (e.g., "Archive All" for recently delivered).
 * 
 * Body: { orderIds: string[], reason?: string }
 * 
 * Returns: { success: true, archived: number, errors: string[] }
 */
export async function POST(request: NextRequest) {
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
    console.error('[Bulk Archive] Unauthorized request:', { origin, referer });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Supabase credentials not configured' },
      { status: 500 }
    );
  }

  // Parse request body
  let orderIds: string[] = [];
  let reason: ArchiveReason = 'manual';

  try {
    const body = await request.json();
    
    if (!body.orderIds || !Array.isArray(body.orderIds)) {
      return NextResponse.json(
        { error: 'orderIds array is required' },
        { status: 400 }
      );
    }

    orderIds = body.orderIds.filter((id: any) => typeof id === 'string' && id.trim());
    
    if (orderIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid orderId is required' },
        { status: 400 }
      );
    }

    if (body.reason && ['manual', 'auto_delivered', 'auto_cancelled'].includes(body.reason)) {
      reason = body.reason;
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  console.log('[Bulk Archive] Archiving orders:', { count: orderIds.length, reason });

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const result = await archiveOrdersBulk(supabase, orderIds, reason);

    console.log('[Bulk Archive] Complete:', result);

    return NextResponse.json({
      success: true,
      archived: result.archived,
      errors: result.errors,
      message: `Archived ${result.archived} of ${orderIds.length} orders`,
    });
  } catch (error: any) {
    console.error('[Bulk Archive] Error:', error);
    return NextResponse.json(
      { error: 'Failed to archive orders', details: error.message },
      { status: 500 }
    );
  }
}
