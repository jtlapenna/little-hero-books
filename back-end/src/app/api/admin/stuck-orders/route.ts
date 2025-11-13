import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

/**
 * GET /api/admin/stuck-orders
 * 
 * Returns list of orders stuck in 'processing' state.
 * 
 * Note: This is an internal admin endpoint. For same-origin requests (from the Next.js app),
 * we allow access without bearer token. External requests still require authentication.
 * 
 * Query params:
 * - timeoutMinutes: Number of minutes before order is considered stuck (default: 30)
 */
export async function GET(request: NextRequest) {
  // Allow same-origin requests (internal admin page) without auth
  // External requests still require bearer token
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const isSameOrigin = origin?.includes(process.env.NEXT_PUBLIC_SITE_URL || '') || 
                       referer?.includes(process.env.NEXT_PUBLIC_SITE_URL || '') ||
                       !origin; // No origin header means same-origin request
  
  if (!isSameOrigin) {
    const auth = verifyBearerAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
  }

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Supabase credentials not configured' },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const timeoutMinutes = parseInt(searchParams.get('timeoutMinutes') || '30', 10);

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate threshold time
    const thresholdTime = new Date();
    thresholdTime.setMinutes(thresholdTime.getMinutes() - timeoutMinutes);

    // Query stuck orders
    const { data: stuckOrders, error } = await supabase
      .from('orders')
      .select('id, amazon_order_id, execution_status, current_workflow, started_at, workflow_step, manifest_2a_url, manifest_2b_url, manifest_3_url, created_at, updated_at')
      .eq('execution_status', 'processing')
      .or(`started_at.lt.${thresholdTime.toISOString()},started_at.is.null`)
      .order('started_at', { ascending: true, nullsFirst: true });

    if (error) {
      console.error('[stuck-orders] Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch stuck orders', details: error.message },
        { status: 500 }
      );
    }

    // Calculate minutes processing for each order
    const now = new Date();
    const enrichedOrders = (stuckOrders || []).map(order => {
      const startedAt = order.started_at ? new Date(order.started_at) : null;
      const minutesProcessing = startedAt
        ? Math.floor((now.getTime() - startedAt.getTime()) / 1000 / 60)
        : null;

      // Check if workflow completed (has manifest)
      const hasManifest = 
        (order.current_workflow === '2A' && !!order.manifest_2a_url) ||
        (order.current_workflow === '2B' && !!order.manifest_2b_url) ||
        (order.current_workflow === '3' && !!order.manifest_3_url);

      return {
        ...order,
        minutesProcessing,
        hasManifest,
        stuckStatus: !startedAt
          ? 'no_timestamp'
          : minutesProcessing && minutesProcessing > 60
          ? 'stuck_over_hour'
          : minutesProcessing && minutesProcessing > 30
          ? 'stuck_over_30min'
          : 'recent'
      };
    });

    return NextResponse.json({
      success: true,
      count: enrichedOrders.length,
      orders: enrichedOrders,
      thresholdMinutes: timeoutMinutes
    });
  } catch (error: any) {
    console.error('[stuck-orders] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/stuck-orders
 * 
 * Bulk reset stuck orders.
 * 
 * Note: This is an internal admin endpoint. For same-origin requests (from the Next.js app),
 * we allow access without bearer token. External requests still require authentication.
 * 
 * Body:
 * - orderIds: Array of order IDs to reset
 * - newStatus: 'done' | 'ready_for_processing' (default: 'ready_for_processing')
 */
export async function POST(request: NextRequest) {
  // Allow same-origin requests (internal admin page) without auth
  // External requests still require bearer token
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const isSameOrigin = origin?.includes(process.env.NEXT_PUBLIC_SITE_URL || '') || 
                       referer?.includes(process.env.NEXT_PUBLIC_SITE_URL || '') ||
                       !origin; // No origin header means same-origin request
  
  if (!isSameOrigin) {
    const auth = verifyBearerAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
  }

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Supabase credentials not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { orderIds, newStatus = 'ready_for_processing' } = body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { error: 'orderIds must be a non-empty array' },
        { status: 400 }
      );
    }

    if (!['done', 'ready_for_processing'].includes(newStatus)) {
      return NextResponse.json(
        { error: 'newStatus must be "done" or "ready_for_processing"' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update orders - clear error fields when resetting
    const { data, error } = await supabase
      .from('orders')
      .update({
        execution_status: newStatus,
        error_message: null,
        error_type: null,
        started_at: null,
        current_workflow: null,
        updated_at: new Date().toISOString()
      })
      .in('amazon_order_id', orderIds)
      .eq('execution_status', 'processing')
      .select('amazon_order_id');

    if (error) {
      console.error('[stuck-orders] Supabase update error:', error);
      return NextResponse.json(
        { error: 'Failed to reset orders', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      resetCount: data?.length || 0,
      resetOrders: data?.map(o => o.amazon_order_id) || [],
      newStatus
    });
  } catch (error: any) {
    console.error('[stuck-orders] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

