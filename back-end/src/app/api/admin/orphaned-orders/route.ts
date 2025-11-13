import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

/**
 * GET /api/admin/orphaned-orders
 * 
 * Returns list of orphaned/stuck orders that aren't being processed by any workflow.
 * 
 * Query params:
 * - minMinutes: Minimum minutes orphaned to include (default: 30)
 */
export async function GET(request: NextRequest) {
  // Allow same-origin requests (internal admin page) without auth
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const isSameOrigin = origin?.includes(process.env.NEXT_PUBLIC_SITE_URL || '') || 
                       referer?.includes(process.env.NEXT_PUBLIC_SITE_URL || '') ||
                       !origin;
  
  if (!isSameOrigin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Supabase credentials not configured' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const searchParams = request.nextUrl.searchParams;
  const minMinutes = parseInt(searchParams.get('minMinutes') || '30', 10);

  try {
    // Call the function to get orphaned orders
    const { data, error } = await supabase.rpc('get_orphaned_orders');

    if (error) {
      console.error('[GET /api/admin/orphaned-orders] Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch orphaned orders', details: error.message },
        { status: 500 }
      );
    }

    // Filter by minimum minutes if specified
    const filtered = (data || []).filter((order: any) => 
      (order.minutes_orphaned || 0) >= minMinutes
    );

    return NextResponse.json({
      count: filtered.length,
      orders: filtered,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[GET /api/admin/orphaned-orders] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/orphaned-orders
 * 
 * Bulk recover orphaned orders.
 * 
 * Body:
 * - orderIds: Array of order IDs to recover
 * - action: 'schedule_retry' | 'manual_review' | 'reset_processing'
 */
export async function POST(request: NextRequest) {
  // Allow same-origin requests (internal admin page) without auth
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const isSameOrigin = origin?.includes(process.env.NEXT_PUBLIC_SITE_URL || '') || 
                       referer?.includes(process.env.NEXT_PUBLIC_SITE_URL || '') ||
                       !origin;
  
  if (!isSameOrigin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Supabase credentials not configured' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const body = await request.json();
  const { orderIds, action } = body;

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json(
      { error: 'orderIds array is required' },
      { status: 400 }
    );
  }

  if (!['schedule_retry', 'manual_review', 'reset_processing'].includes(action)) {
    return NextResponse.json(
      { error: 'Invalid action. Must be: schedule_retry, manual_review, or reset_processing' },
      { status: 400 }
    );
  }

  try {
    let updateData: any = {};

    switch (action) {
      case 'schedule_retry':
        // Set to ready_for_processing and clear error fields
        // W1.3 will pick it up and schedule retry
        updateData = {
          execution_status: 'ready_for_processing',
          error_message: null,
          error_type: null,
          current_workflow: null,
          started_at: null,
          next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        };
        // Increment retry_count
        const { data: orders } = await supabase
          .from('orders')
          .select('id, retry_count')
          .in('id', orderIds);
        
        const updates = orders?.map(order => ({
          id: order.id,
          retry_count: (order.retry_count || 0) + 1
        })) || [];
        
        for (const update of updates) {
          await supabase
            .from('orders')
            .update({ ...updateData, retry_count: update.retry_count })
            .eq('id', update.id);
        }
        break;

      case 'manual_review':
        // Keep error_requires_manual_review - this is intentional
        updateData = {
          execution_status: 'error_requires_manual_review',
          error_message: 'Orphaned order recovered - requires manual intervention',
          error_type: 'orphaned_order'
        };
        await supabase
          .from('orders')
          .update(updateData)
          .in('id', orderIds);
        break;

      case 'reset_processing':
        // Set to ready_for_processing and clear all error fields
        updateData = {
          execution_status: 'ready_for_processing',
          error_message: null,
          error_type: null,
          retry_count: 0,
          next_retry_at: null,
          current_workflow: null,
          started_at: null
        };
        await supabase
          .from('orders')
          .update(updateData)
          .in('id', orderIds);
        break;
    }

    return NextResponse.json({
      success: true,
      recovered: orderIds.length,
      action,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[POST /api/admin/orphaned-orders] Error:', error);
    return NextResponse.json(
      { error: 'Failed to recover orders', details: error.message },
      { status: 500 }
    );
  }
}

