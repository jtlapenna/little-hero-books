import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

/**
 * POST /api/admin/orders/[orderId]/reset
 * 
 * Resets an order to initial state, clearing error fields and resetting execution status.
 * 
 * This endpoint is used to recover orders that have errors or are stuck.
 * 
 * Body: (none required)
 * 
 * Returns: { success: true, orderId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
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

  const orderId = params.orderId;

  if (!orderId) {
    return NextResponse.json(
      { error: 'Order ID is required' },
      { status: 400 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Check if order exists
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('amazon_order_id, next_workflow')
      .eq('amazon_order_id', orderId)
      .single();

    if (fetchError || !order) {
      return NextResponse.json(
        { error: 'Order not found', details: fetchError?.message },
        { status: 404 }
      );
    }

    // Determine appropriate next_workflow
    // If order has 1-manifest.json, start at 2A
    // Otherwise, keep current next_workflow or default to null
    let nextWorkflow = order.next_workflow || null;
    
    // Check if 1-manifest exists
    const { data: checkOrder } = await supabase
      .from('orders')
      .select('one_manifest_url')
      .eq('amazon_order_id', orderId)
      .single();
    
    if (checkOrder?.one_manifest_url) {
      nextWorkflow = '2A';
    }

    // Reset order to initial state
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        execution_status: 'ready_for_processing',
        next_workflow: nextWorkflow,
        error_message: null,
        error_type: null,
        retry_count: 0,
        next_retry_at: null,
        current_workflow: null,
        started_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('amazon_order_id', orderId);

    if (updateError) {
      console.error('[Reset Order] Failed to update Supabase:', updateError);
      return NextResponse.json(
        { 
          error: 'Failed to reset order',
          details: updateError.message 
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      orderId: orderId,
      nextWorkflow: nextWorkflow,
      message: 'Order reset successfully'
    });

  } catch (error: any) {
    console.error('[Reset Order] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to reset order',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

