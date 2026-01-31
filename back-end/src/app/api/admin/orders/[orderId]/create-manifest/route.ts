import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { determineNextWorkflow } from '@/lib/determine-next-workflow';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

/**
 * POST /api/admin/orders/[orderId]/create-manifest
 * 
 * Creates a 1-manifest.json file from Supabase order data and uploads it to R2.
 * 
 * This endpoint is used to recover orders that are missing their 1-manifest.json file.
 * 
 * Body: (none required)
 * 
 * Returns: { success: true, manifestKey: string, orderId: string }
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
    // Fetch order from Supabase
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('amazon_order_id', orderId)
      .single();

    if (fetchError || !order) {
      return NextResponse.json(
        { error: 'Order not found', details: fetchError?.message },
        { status: 404 }
      );
    }

    // Validate required fields
    if (!order.character_specs || !order.product_info) {
      return NextResponse.json(
        { 
          error: 'Order missing required data',
          details: 'character_specs and product_info are required to create manifest'
        },
        { status: 400 }
      );
    }

    // Build manifest structure (matching W0 workflow format)
    const manifest = {
      schema: 'lhb.run-manifest@v2.1',
      runStamp: new Date().toISOString(),
      amazonOrderId: order.amazon_order_id,
      marketplaceId: order.marketplace_id || null,
      order: {
        purchaseDate: order.purchase_date || order.created_at || null,
        buyer: {
          email: order.customer_email || null,
          name: order.customer_name || null
        },
        dedication: order.dedication_text ? {
          raw: order.dedication_text,
          text: order.dedication_text,
          htmlSafe: order.dedication_text
        } : null,
        characterSpecs: order.character_specs,
        bookSpecs: order.product_info?.bookSpecs || {
          title: order.product_info?.title || 'Adventure Book',
          totalPages: 16,
          format: '8.5x8.5_softcover',
          bookType: 'adventure'
        },
        orderDetails: {
          quantity: order.product_info?.quantity || 1,
          shippingAddress: order.product_info?.shippingAddress || order.shipping_address || {}
        }
      }
    };

    // Build R2 key
    const r2Key = `book-mvp-simple-adventure/orders/${orderId}/manifests/1-manifest.json`;

    // Upload to R2
    const manifestJson = JSON.stringify(manifest, null, 2);
    await putObject(
      R2_ORDERS_BUCKET,
      r2Key,
      manifestJson,
      'application/json'
    );

    // Determine correct next_workflow based on order's actual progress
    // Don't blindly set to '2A' - check if order has already completed 2A, 2B, or 3
    const nextWorkflow = determineNextWorkflow({
      one_manifest_url: r2Key, // We just created this
      manifest_2a_url: order.manifest_2a_url,
      manifest_2b_url: order.manifest_2b_url,
      manifest_3_url: order.manifest_3_url,
      workflow_step: order.workflow_step,
      review_stages: order.review_stages as any,
      next_workflow: order.next_workflow,
      customer_approval_required: (order as any).customer_approval_required ?? undefined,
      customer_approval_status: (order as any).customer_approval_status ?? undefined,
    });

    // Update Supabase with manifest URL (store key, not full URL)
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        one_manifest_url: r2Key,
        execution_status: 'ready_for_processing',
        next_workflow: nextWorkflow, // Use determined workflow, not hardcoded '2A'
        error_message: null,
        error_type: null,
        updated_at: new Date().toISOString()
      })
      .eq('amazon_order_id', orderId);

    if (updateError) {
      console.error('[Create Manifest] Failed to update Supabase:', updateError);
      // Manifest was uploaded but Supabase update failed - still return success
      // but log the error
    }

    return NextResponse.json({
      success: true,
      manifestKey: r2Key,
      orderId: orderId,
      message: 'Manifest created and uploaded successfully'
    });

  } catch (error: any) {
    console.error('[Create Manifest] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create manifest',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

