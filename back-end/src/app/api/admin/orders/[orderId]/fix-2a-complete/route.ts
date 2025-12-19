import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { determineNextWorkflow } from '@/lib/determine-next-workflow';
import { updateOrderStatus } from '@/lib/status-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

/**
 * POST /api/admin/orders/[orderId]/fix-2a-complete
 * 
 * Manually fixes an order that completed 2A but wasn't properly updated in Supabase.
 * This happens when the n8n workflow does a direct Supabase PATCH but doesn't set
 * execution_status, current_workflow, or started_at correctly.
 * 
 * Body: { manifestUrl?: string } (optional, will construct from orderId if not provided)
 * 
 * Returns: { success: true, orderId: string, updates: object }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const isSameOrigin = !origin || 
                       origin?.includes(siteUrl) || 
                       referer?.includes(siteUrl) ||
                       origin?.includes('littleherolabs.com') ||
                       referer?.includes('littleherolabs.com');
  
  if (!isSameOrigin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Supabase credentials not configured' },
      { status: 500 }
    );
  }

  const { orderId } = await params;
  const orderIdValue = orderId?.trim();

  if (!orderIdValue) {
    return NextResponse.json(
      { error: 'Order ID is required' },
      { status: 400 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Get current order state
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, amazon_order_id, one_manifest_url, manifest_2a_url, manifest_2b_url, manifest_3_url, workflow_step, review_stages, next_workflow, execution_status, current_workflow')
      .eq('amazon_order_id', orderIdValue)
      .single();

    if (fetchError || !order) {
      return NextResponse.json(
        { error: 'Order not found', details: fetchError?.message },
        { status: 404 }
      );
    }

    // Construct manifest URL if not provided
    let manifestUrl = order.manifest_2a_url;
    if (!manifestUrl) {
      // Try to get from request body
      try {
        const body = await request.json().catch(() => ({}));
        manifestUrl = body.manifestUrl;
      } catch {}
      
      // If still not provided, construct from orderId
      if (!manifestUrl) {
        manifestUrl = `book-mvp-simple-adventure/orders/${orderIdValue}/manifests/2a-manifest.json`;
      }
    }

    // Parse review_stages if it's a string
    let reviewStages = order.review_stages;
    if (typeof reviewStages === 'string') {
      try {
        reviewStages = JSON.parse(reviewStages);
      } catch (e) {
        reviewStages = null;
      }
    }

    // Determine if needs review based on manifest or review_stages
    const needsReview = reviewStages?.preBria?.status === 'needs_review' || 
                        reviewStages?.preBria?.needsHumanReview === true;

    // Use updateOrderStatus to properly set all fields
    await updateOrderStatus(orderIdValue, {
      workflow_step: '2A-complete',
      manifest_2a_url: manifestUrl,
      execution_status: needsReview ? 'processing' : 'done',
      started_at: null, // Clear processing timestamp
      current_workflow: null, // Clear current workflow
    });

    // Get updated order to return
    const { data: updatedOrder } = await supabase
      .from('orders')
      .select('workflow_step, manifest_2a_url, execution_status, current_workflow, next_workflow')
      .eq('amazon_order_id', orderIdValue)
      .single();

    return NextResponse.json({
      success: true,
      orderId: orderIdValue,
      updates: {
        workflow_step: updatedOrder?.workflow_step,
        manifest_2a_url: updatedOrder?.manifest_2a_url,
        execution_status: updatedOrder?.execution_status,
        current_workflow: updatedOrder?.current_workflow,
        next_workflow: updatedOrder?.next_workflow,
      },
      message: 'Order 2A completion status fixed successfully'
    });

  } catch (error: any) {
    console.error('[Fix 2A Complete] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fix 2A completion status',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

