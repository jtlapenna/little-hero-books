import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

/**
 * GET /api/admin/orders-needing-attention
 * 
 * Returns all orders needing attention (combines orphaned + stuck + error status orders).
 * 
 * Query params:
 * - errorType: Filter by specific error type
 * - minMinutes: Minimum minutes stuck/orphaned (default: 30)
 * - status: Filter by execution_status
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
  const errorType = searchParams.get('errorType');
  const status = searchParams.get('status');

  try {
    // 1. Get orphaned orders from RPC function
    const { data: orphanedData, error: orphanedError } = await supabase.rpc('get_orphaned_orders');
    
    if (orphanedError) {
      console.error('[GET /api/admin/orders-needing-attention] Orphaned orders RPC error:', orphanedError);
    }

    // 2. Get stuck orders (processing > minMinutes)
    const thresholdTime = new Date();
    thresholdTime.setMinutes(thresholdTime.getMinutes() - minMinutes);
    
    const { data: stuckData, error: stuckError } = await supabase
      .from('orders')
      .select('id, amazon_order_id, execution_status, current_workflow, started_at, workflow_step, error_type, error_message, retry_count, updated_at')
      .eq('execution_status', 'processing')
      .or(`started_at.lt.${thresholdTime.toISOString()},started_at.is.null`);

    if (stuckError) {
      console.error('[GET /api/admin/orders-needing-attention] Stuck orders error:', stuckError);
    }

    // 3. Get orders with error status
    let errorStatusQuery = supabase
      .from('orders')
      .select('id, amazon_order_id, execution_status, error_type, error_message, retry_count, updated_at, started_at, current_workflow, workflow_step')
      .in('execution_status', ['error', 'error_requires_manual_review']);

    if (status) {
      errorStatusQuery = errorStatusQuery.eq('execution_status', status);
    }

    if (errorType) {
      errorStatusQuery = errorStatusQuery.eq('error_type', errorType);
    }

    const { data: errorData, error: errorError } = await errorStatusQuery;

    if (errorError) {
      console.error('[GET /api/admin/orders-needing-attention] Error status orders error:', errorError);
    }

    // Combine and deduplicate orders (by id)
    const orderMap = new Map<number, any>();

    // Process orphaned orders
    (orphanedData || []).forEach((order: any) => {
      if ((order.minutes_orphaned || 0) >= minMinutes) {
        orderMap.set(order.id, {
          ...order,
          source: 'orphaned',
          timeStuck: order.minutes_orphaned,
          errorReason: order.orphan_reason
        });
      }
    });

    // Process stuck orders
    const now = new Date();
    (stuckData || []).forEach((order: any) => {
      const startedAt = order.started_at ? new Date(order.started_at) : null;
      const minutesProcessing = startedAt
        ? Math.floor((now.getTime() - startedAt.getTime()) / 1000 / 60)
        : null;

      if (!orderMap.has(order.id)) {
        orderMap.set(order.id, {
          ...order,
          source: 'stuck',
          timeStuck: minutesProcessing,
          errorReason: order.started_at ? `processing_stuck_${minutesProcessing && minutesProcessing > 60 ? 'over_hour' : 'over_30min'}` : 'processing_no_timestamp'
        });
      }
    });

    // Process error status orders
    (errorData || []).forEach((order: any) => {
      if (!orderMap.has(order.id)) {
        orderMap.set(order.id, {
          ...order,
          source: 'error_status',
          timeStuck: null,
          errorReason: order.error_type || 'error'
        });
      } else {
        // Merge error info if order already exists
        const existing = orderMap.get(order.id)!;
        orderMap.set(order.id, {
          ...existing,
          error_type: order.error_type || existing.error_type,
          error_message: order.error_message || existing.error_message,
          errorReason: order.error_type || existing.errorReason
        });
      }
    });

    // Convert to array and apply filters
    let orders = Array.from(orderMap.values());

    // Filter by errorType if specified
    if (errorType) {
      orders = orders.filter(o => o.error_type === errorType || o.errorReason === errorType);
    }

    // Sort by severity and time stuck
    orders.sort((a, b) => {
      // Prioritize error_requires_manual_review
      if (a.execution_status === 'error_requires_manual_review' && b.execution_status !== 'error_requires_manual_review') return -1;
      if (b.execution_status === 'error_requires_manual_review' && a.execution_status !== 'error_requires_manual_review') return 1;
      
      // Then by time stuck (longer = higher priority)
      const aTime = a.timeStuck || 0;
      const bTime = b.timeStuck || 0;
      if (aTime !== bTime) return bTime - aTime;
      
      // Then by retry count (higher = higher priority)
      const aRetries = a.retry_count || 0;
      const bRetries = b.retry_count || 0;
      return bRetries - aRetries;
    });

    return NextResponse.json({
      success: true,
      count: orders.length,
      orders,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[GET /api/admin/orders-needing-attention] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/orders-needing-attention
 * 
 * Bulk recover orders needing attention.
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
          error_message: 'Order recovered - requires manual intervention',
          error_type: 'manual_review_required'
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
    console.error('[POST /api/admin/orders-needing-attention] Error:', error);
    return NextResponse.json(
      { error: 'Failed to recover orders', details: error.message },
      { status: 500 }
    );
  }
}

