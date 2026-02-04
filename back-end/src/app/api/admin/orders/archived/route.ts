import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getArchivedOrders } from '@/lib/order-lifecycle';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

/**
 * GET /api/admin/orders/archived
 * 
 * Gets paginated list of archived orders with optional search.
 * 
 * Query params:
 *   - page: number (default 1)
 *   - limit: number (default 50, max 100)
 *   - search: string (searches orderId, childName, customer_name, customer_email)
 * 
 * Returns: { orders: ArchivedOrder[], total: number, page: number, limit: number }
 */
export async function GET(request: NextRequest) {
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
    console.error('[Archived Orders] Unauthorized request:', { origin, referer });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Supabase credentials not configured' },
      { status: 500 }
    );
  }

  // Parse query params
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
  const search = searchParams.get('search') || undefined;

  console.log('[Archived Orders] Fetching:', { page, limit, search });

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const result = await getArchivedOrders(supabase, { page, limit, search });

    console.log('[Archived Orders] Found:', { total: result.total, returned: result.orders.length });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Archived Orders] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch archived orders', details: error.message },
      { status: 500 }
    );
  }
}
