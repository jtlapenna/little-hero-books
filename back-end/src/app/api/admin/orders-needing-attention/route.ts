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
    
    // Debug: Log if JOHN-TEST4 is in orphaned results
    if (orphanedData) {
      const johnTest4 = orphanedData.find((o: any) => o.amazon_order_id === 'JOHN-TEST4');
      if (johnTest4) {
        console.log('[DEBUG] JOHN-TEST4 in orphaned results:', {
          id: johnTest4.id,
          next_retry_at: johnTest4.next_retry_at,
          execution_status: johnTest4.execution_status,
          orphan_reason: johnTest4.orphan_reason
        });
      }
    }

    // 2. Get stuck orders (processing > minMinutes)
    // IMPORTANT: Exclude orders that have completed their workflow (have manifest URLs)
    // These are waiting for review, not actually stuck
    const thresholdTime = new Date();
    thresholdTime.setMinutes(thresholdTime.getMinutes() - minMinutes);
    
    const { data: stuckData, error: stuckError } = await supabase
      .from('orders')
      .select('id, amazon_order_id, execution_status, current_workflow, started_at, workflow_step, error_type, error_message, retry_count, next_retry_at, next_workflow, updated_at, manifest_2a_url, manifest_2b_url, manifest_3_url')
      .eq('execution_status', 'processing')
      .or(`started_at.lt.${thresholdTime.toISOString()},started_at.is.null`);

    if (stuckError) {
      console.error('[GET /api/admin/orders-needing-attention] Stuck orders error:', stuckError);
    }

    // Filter out orders that have completed their workflow
    // These are waiting for review, not actually stuck
    // When a workflow completes, current_workflow is set to null, so we check workflow_step instead
    const trulyStuckData = (stuckData || []).filter((order: any) => {
      // Check if workflow has actually completed by checking workflow_step
      // This is the primary indicator - when workflow completes, workflow_step is set to '2A-complete', etc.
      const hasCompletedStep = 
        order.workflow_step === '2A-complete' ||
        order.workflow_step === '2B-complete' ||
        order.workflow_step === 'bria_processing_complete' ||
        order.workflow_step === 'book_assembly_completed' ||
        order.workflow_step === 'ai_generation_completed';
      
      // Also check for manifest URLs as a secondary indicator
      // (current_workflow is null when workflow completes, so we can't use it)
      const hasManifest = 
        !!order.manifest_2a_url ||
        !!order.manifest_2b_url ||
        !!order.manifest_3_url;
      
      // If workflow completed (has completed step or manifest), exclude from stuck orders
      // These orders are waiting for review, not actually stuck
      if (hasCompletedStep || hasManifest) {
        console.log(`[GET /api/admin/orders-needing-attention] Excluding ${order.amazon_order_id} from stuck orders - workflow completed (workflow_step: ${order.workflow_step}, has manifest: ${hasManifest})`);
        return false;
      }
      
      return true;
    });

    // 3. Get orders with error status
    let errorStatusQuery = supabase
      .from('orders')
      .select('id, amazon_order_id, execution_status, error_type, error_message, retry_count, next_retry_at, next_workflow, updated_at, started_at, current_workflow, workflow_step')
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

    // 4. Get ready_for_processing orders not picked up (complement to RPC function)
    // This ensures we catch orders that might not be in the RPC results
    // Also include orders with next_retry_at set (scheduled for retry)
    const queuedThresholdTime = new Date();
    queuedThresholdTime.setMinutes(queuedThresholdTime.getMinutes() - 60); // 60 minutes for "not picked up"
    
    // Query 1: Orders queued > 60 minutes ago (exclude orders already sent to Lulu — they're "Printing", not "Not Picked Up")
    // Select lulu_job_id, lulu_status so we can filter again in JS (covers empty string or replica lag)
    const { data: notPickedUpOld, error: notPickedUpOldError } = await supabase
      .from('orders')
      .select('id, amazon_order_id, execution_status, error_type, error_message, retry_count, next_retry_at, updated_at, queued_at, next_workflow, workflow_step, lulu_job_id, lulu_status')
      .eq('execution_status', 'ready_for_processing')
      .not('queued_at', 'is', null)
      .lt('queued_at', queuedThresholdTime.toISOString());
    
    // Query 2: Orders with next_retry_at set (scheduled for retry)
    const { data: scheduledRetryData, error: scheduledRetryError } = await supabase
      .from('orders')
      .select('id, amazon_order_id, execution_status, error_type, error_message, retry_count, next_retry_at, updated_at, queued_at, next_workflow, workflow_step, lulu_job_id, lulu_status')
      .eq('execution_status', 'ready_for_processing')
      .not('next_retry_at', 'is', null);
    
    // Debug: Log if JOHN-TEST4 is in scheduled retry results
    if (scheduledRetryData) {
      const johnTest4 = scheduledRetryData.find((o: any) => o.amazon_order_id === 'JOHN-TEST4');
      if (johnTest4) {
        console.log('[DEBUG] JOHN-TEST4 in scheduled retry results:', {
          id: johnTest4.id,
          next_retry_at: johnTest4.next_retry_at,
          execution_status: johnTest4.execution_status
        });
      }
    }
    
    // Combine both queries
    const notPickedUpData = [
      ...(notPickedUpOld || []),
      ...(scheduledRetryData || [])
    ];
    
    // Deduplicate by id
    const notPickedUpMap = new Map();
    notPickedUpData.forEach((order: any) => {
      if (!notPickedUpMap.has(order.id)) {
        notPickedUpMap.set(order.id, order);
      } else {
        // Merge, preserving next_retry_at if present
        const existing = notPickedUpMap.get(order.id);
        notPickedUpMap.set(order.id, {
          ...existing,
          ...order,
          next_retry_at: order.next_retry_at || existing.next_retry_at
        });
      }
    });
    const notPickedUpDataDeduped = Array.from(notPickedUpMap.values());
    
    const notPickedUpError = notPickedUpOldError || scheduledRetryError;

    if (notPickedUpError) {
      console.error('[GET /api/admin/orders-needing-attention] Not picked up orders error:', notPickedUpError);
    }

    // Combine and deduplicate orders (by id)
    const orderMap = new Map<number, any>();

    // Process orphaned orders
    // IMPORTANT: Filter out orders that have completed their workflow
    // These are waiting for review, not actually orphaned
    const trulyOrphanedData = (orphanedData || []).filter((order: any) => {
      // Check if workflow has actually completed by checking workflow_step
      // This is the primary indicator - when workflow completes, workflow_step is set to '2A-complete', etc.
      const hasCompletedStep = 
        order.workflow_step === '2A-complete' ||
        order.workflow_step === '2B-complete' ||
        order.workflow_step === 'bria_processing_complete' ||
        order.workflow_step === 'book_assembly_completed' ||
        order.workflow_step === 'ai_generation_completed';
      
      // If workflow completed, exclude from orphaned orders
      // These orders are waiting for review, not actually orphaned
      if (hasCompletedStep) {
        console.log(`[GET /api/admin/orders-needing-attention] Excluding ${order.amazon_order_id} from orphaned orders - workflow completed (workflow_step: ${order.workflow_step})`);
        return false;
      }
      
      return true;
    });
    
    (trulyOrphanedData || []).forEach((order: any) => {
      if ((order.minutes_orphaned || 0) >= minMinutes) {
        // Debug: Log JOHN-TEST4 processing
        if (order.amazon_order_id === 'JOHN-TEST4') {
          console.log('[DEBUG] Processing JOHN-TEST4 from orphaned:', {
            id: order.id,
            next_retry_at: order.next_retry_at,
            orphan_reason: order.orphan_reason,
            minutes_orphaned: order.minutes_orphaned
          });
        }
        orderMap.set(order.id, {
          ...order,
          source: 'orphaned',
          timeStuck: order.minutes_orphaned,
          errorReason: order.orphan_reason,
          // Preserve next_retry_at if present (explicitly check for null/undefined)
          next_retry_at: order.next_retry_at !== undefined && order.next_retry_at !== null ? order.next_retry_at : null
        });
      }
    });

    // Process stuck orders (using filtered list that excludes completed workflows)
    const now = new Date();
    (trulyStuckData || []).forEach((order: any) => {
      const startedAt = order.started_at ? new Date(order.started_at) : null;
      const minutesProcessing = startedAt
        ? Math.floor((now.getTime() - startedAt.getTime()) / 1000 / 60)
        : null;

      if (!orderMap.has(order.id)) {
        orderMap.set(order.id, {
          ...order,
          source: 'stuck',
          timeStuck: minutesProcessing,
          errorReason: order.started_at ? `processing_stuck_${minutesProcessing && minutesProcessing > 60 ? 'over_hour' : 'over_30min'}` : 'processing_no_timestamp',
          // Preserve next_retry_at if present
          next_retry_at: order.next_retry_at || null
        });
      } else {
        // Merge with existing, preserving next_retry_at
        const existing = orderMap.get(order.id)!;
        orderMap.set(order.id, {
          ...existing,
          ...order,
          // Preserve next_retry_at from either source (use nullish coalescing to handle null values)
          next_retry_at: order.next_retry_at ?? existing.next_retry_at ?? null,
          retry_count: order.retry_count !== null ? order.retry_count : existing.retry_count
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
        // Merge error info if order already exists, preserving next_retry_at
        const existing = orderMap.get(order.id)!;
        orderMap.set(order.id, {
          ...existing,
          error_type: order.error_type || existing.error_type,
          error_message: order.error_message || existing.error_message,
          errorReason: order.error_type || existing.errorReason,
          // Preserve next_retry_at from either source (use nullish coalescing to handle null values)
          next_retry_at: order.next_retry_at ?? existing.next_retry_at ?? null,
          retry_count: order.retry_count !== null ? order.retry_count : existing.retry_count
        });
      }
    });

    // Process not picked up orders — exclude only when actually in print phase or already with Lulu.
    // Use workflow_step === 'print_fulfillment' only (not next_workflow === '4'), so "Awaiting Customer"
    // orders with next_workflow 4 still show as needing attention if not picked up.
    const excludeFromNotPickedUp = (o: any) => {
      const jobId = o?.lulu_job_id;
      const status = o?.lulu_status;
      const hasLulu = (jobId != null && jobId !== '') || (status != null && status !== '');
      const inPrintPhase = o?.workflow_step === 'print_fulfillment';
      return hasLulu || inPrintPhase;
    };
    (notPickedUpDataDeduped || []).forEach((order: any) => {
      if (excludeFromNotPickedUp(order)) {
        return; // Don't add to list — they're in print phase or already with Lulu
      }
      // Debug: Log JOHN-TEST4 processing
      if (order.amazon_order_id === 'JOHN-TEST4') {
        console.log('[DEBUG] Processing JOHN-TEST4 from not picked up:', {
          id: order.id,
          next_retry_at: order.next_retry_at,
          alreadyInMap: orderMap.has(order.id),
          existingNextRetryAt: orderMap.has(order.id) ? orderMap.get(order.id)?.next_retry_at : 'N/A'
        });
      }
      
      if (!orderMap.has(order.id)) {
        const queuedAt = order.queued_at ? new Date(order.queued_at) : null;
        const minutesQueued = queuedAt
          ? Math.floor((now.getTime() - queuedAt.getTime()) / 1000 / 60)
          : null;
        
        // Determine error reason based on whether it has next_retry_at
        const errorReason = order.next_retry_at ? 'scheduled_retry' : 'ready_not_picked_up';
        
        orderMap.set(order.id, {
          ...order,
          source: 'orphaned',
          timeStuck: minutesQueued,
          errorReason: errorReason,
          orphan_reason: errorReason,
          // Explicitly preserve next_retry_at
          next_retry_at: order.next_retry_at !== undefined && order.next_retry_at !== null ? order.next_retry_at : null
        });
      } else {
        // Merge with existing order, preserving next_retry_at
        const existing = orderMap.get(order.id)!;
        const mergedNextRetryAt = order.next_retry_at ?? existing.next_retry_at ?? null;
        
        // Debug: Log merge for JOHN-TEST4
        if (order.amazon_order_id === 'JOHN-TEST4') {
          console.log('[DEBUG] Merging JOHN-TEST4:', {
            fromOrder: order.next_retry_at,
            fromExisting: existing.next_retry_at,
            merged: mergedNextRetryAt
          });
        }
        
        orderMap.set(order.id, {
          ...existing,
          // Preserve next_retry_at from either source (use nullish coalescing to handle null values)
          next_retry_at: mergedNextRetryAt,
          retry_count: order.retry_count !== null ? order.retry_count : existing.retry_count
        });
      }
    });

    // Convert to array and apply filters
    let orders = Array.from(orderMap.values());
    
    // Final pass: Ensure next_retry_at is explicitly included for all orders
    // This handles cases where the field might be missing from query results
    orders = orders.map(order => {
      // Debug: Log final pass for JOHN-TEST4
      if (order.amazon_order_id === 'JOHN-TEST4') {
        console.log('[DEBUG] Final pass for JOHN-TEST4:', {
          id: order.id,
          next_retry_at: order.next_retry_at,
          hasNextRetryAt: 'next_retry_at' in order
        });
      }
      
      // Ensure next_retry_at is explicitly set (even if null)
      return {
        ...order,
        next_retry_at: order.next_retry_at !== undefined ? order.next_retry_at : null
      };
    });

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

