import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { determineNextWorkflow } from '@/lib/determine-next-workflow';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const backendUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://admin.littleherolabs.com';

/**
 * POST /api/admin/orders/[orderId]/create-2b-manifest
 * 
 * Creates a 2B-manifest.json for a new order by copying image references from
 * another order with the same character_hash that already has a 2B manifest.
 * 
 * This allows reusing background-removed images without regenerating them.
 * 
 * Body: (none required, automatically finds source order with same character_hash)
 * 
 * Returns: { success: true, manifestKey: string, orderId: string, sourceOrderId: string }
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

  const newOrderId = params.orderId?.trim();

  if (!newOrderId) {
    return NextResponse.json(
      { error: 'Order ID is required' },
      { status: 400 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Fetch new order from Supabase
    const { data: newOrder, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('amazon_order_id', newOrderId)
      .single();

    if (fetchError || !newOrder) {
      return NextResponse.json(
        { error: 'Order not found', details: fetchError?.message },
        { status: 404 }
      );
    }

    // Check if order already has a 2B manifest
    if (newOrder.manifest_2b_url) {
      return NextResponse.json(
        { 
          error: 'Order already has a 2B manifest',
          details: `Manifest URL: ${newOrder.manifest_2b_url}`
        },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!newOrder.character_hash) {
      return NextResponse.json(
        { 
          error: 'Order missing character_hash',
          details: 'Cannot find source order without character_hash'
        },
        { status: 400 }
      );
    }

    // Find another order with the same character_hash that has a 2B manifest
    const { data: sourceOrders, error: sourceError } = await supabase
      .from('orders')
      .select('amazon_order_id, orderId, manifest_2b_url, character_hash')
      .eq('character_hash', newOrder.character_hash)
      .neq('amazon_order_id', newOrderId)
      .not('manifest_2b_url', 'is', null)
      .limit(1);

    if (sourceError || !sourceOrders || sourceOrders.length === 0) {
      return NextResponse.json(
        { 
          error: 'No source order found',
          details: `No other order with character_hash ${newOrder.character_hash} has a 2B manifest. Cannot reuse images.`
        },
        { status: 404 }
      );
    }

    const sourceOrder = sourceOrders[0];
    const sourceOrderId = sourceOrder.amazon_order_id || sourceOrder.orderId;

    if (!sourceOrder.manifest_2b_url) {
      return NextResponse.json(
        { error: 'Source order manifest URL is missing' },
        { status: 500 }
      );
    }

    // Extract manifest key from URL or construct it
    let sourceManifestKey = sourceOrder.manifest_2b_url;
    // If it's a full URL, extract the key part
    if (sourceManifestKey.includes('/api/manifests/')) {
      sourceManifestKey = sourceManifestKey.split('/api/manifests/')[1];
    } else if (sourceManifestKey.includes('manifests/2b-manifest.json')) {
      // Already a key
    } else {
      // Construct from order ID
      sourceManifestKey = buildManifestKey(sourceOrderId, '2b');
    }

    console.log(`[Create 2B Manifest] Source order: ${sourceOrderId}, manifest key: ${sourceManifestKey}`);

    // Download source order's 2B manifest (for image references)
    let sourceManifest: any;
    try {
      sourceManifest = await downloadManifest(sourceManifestKey);
      console.log(`[Create 2B Manifest] Downloaded source 2B manifest with ${sourceManifest?.entries?.length || 0} entries`);
    } catch (error: any) {
      return NextResponse.json(
        { 
          error: 'Failed to download source 2B manifest',
          details: error?.message || 'Manifest not found in R2'
        },
        { status: 404 }
      );
    }

    // Validate source manifest structure
    if (!sourceManifest || !sourceManifest.entries || !Array.isArray(sourceManifest.entries)) {
      return NextResponse.json(
        { error: 'Invalid source manifest structure', details: 'Missing entries array' },
        { status: 500 }
      );
    }

    // Download new order's 1-manifest (for order-specific information) - prefer this over Supabase
    let oneManifest: any = null;
    if (newOrder.one_manifest_url) {
      try {
        let oneManifestKey = newOrder.one_manifest_url;
        if (oneManifestKey.includes('/api/manifests/')) {
          oneManifestKey = oneManifestKey.split('/api/manifests/')[1];
        }
        oneManifest = await downloadManifest(oneManifestKey);
        console.log(`[Create 2B Manifest] Downloaded 1-manifest for order-specific information`);
      } catch (error: any) {
        console.warn(`[Create 2B Manifest] Failed to download 1-manifest, will use Supabase data:`, error?.message);
        // Continue without 1-manifest, will use Supabase data as fallback
      }
    }

    // Build new manifest by copying image references but updating order-specific fields
    // Use 1-manifest for order info (most accurate), fallback to Supabase, then source manifest
    const newManifest = {
      ...sourceManifest,
      schema: sourceManifest.schema || 'lhb.run-manifest@v2.0',
      runStamp: new Date().toISOString(),
      characterHash: newOrder.character_hash,
      order: {
        ...sourceManifest.order,
        // Override with order-specific information from 1-manifest (preferred) or Supabase
        amazonOrderId: newOrderId,
        purchaseDate: newOrder.purchase_date || newOrder.created_at || oneManifest?.order?.purchaseDate || sourceManifest.order?.purchaseDate || null,
        buyer: {
          email: newOrder.customer_email || oneManifest?.order?.buyer?.email || sourceManifest.order?.buyer?.email || null,
          name: newOrder.customer_name || oneManifest?.order?.buyer?.name || sourceManifest.order?.buyer?.name || null
        },
        dedication: newOrder.dedication_text ? {
          raw: newOrder.dedication_text,
          text: newOrder.dedication_text,
          htmlSafe: newOrder.dedication_text
        } : (oneManifest?.order?.dedication || sourceManifest.order?.dedication || null),
        characterSpecs: newOrder.character_specs || oneManifest?.order?.characterSpecs || sourceManifest.order?.characterSpecs || {},
        bookSpecs: newOrder.product_info?.bookSpecs || oneManifest?.order?.bookSpecs || sourceManifest.order?.bookSpecs || {},
        orderDetails: {
          ...sourceManifest.order?.orderDetails,
          quantity: newOrder.product_info?.quantity || oneManifest?.order?.orderDetails?.quantity || sourceManifest.order?.orderDetails?.quantity || 1,
          shippingAddress: newOrder.shipping_address || newOrder.product_info?.shippingAddress || oneManifest?.order?.orderDetails?.shippingAddress || sourceManifest.order?.orderDetails?.shippingAddress || {}
        }
      },
      // Copy entries with image references (bgRemovedKey, bgRemovedImageUrl, etc.)
      entries: sourceManifest.entries.map((entry: any) => ({
        ...entry,
        // Keep all image references from source (bgRemovedKey, bgRemovedImageUrl, etc.)
        // These point to the shared character hash directory, so they're valid for the new order
      })),
      // Update top-level orderId
      orderId: newOrderId,
      amazonOrderId: newOrderId,
      // Update manifest URL references
      manifestUrl: null, // Will be set after upload
      originalManifestUrl: null, // Will be set after upload
    };

    // Build R2 key for new manifest
    const newManifestKey = buildManifestKey(newOrderId, '2b');
    const newManifestUrl = `${backendUrl}/api/manifests/${newManifestKey}`;

    // Update manifest URLs in the manifest itself
    newManifest.manifestUrl = newManifestUrl;
    newManifest.originalManifestUrl = newManifestUrl;

    // Upload to R2
    const manifestJson = JSON.stringify(newManifest, null, 2);
    await putObject(
      R2_ORDERS_BUCKET,
      newManifestKey,
      manifestJson,
      'application/json'
    );

    console.log(`[Create 2B Manifest] Uploaded new manifest to: ${newManifestKey}`);

    // Determine correct next_workflow based on order's actual progress
    const nextWorkflow = determineNextWorkflow({
      one_manifest_url: newOrder.one_manifest_url,
      manifest_2a_url: newOrder.manifest_2a_url,
      manifest_2b_url: newManifestKey, // We just created this
      manifest_3_url: newOrder.manifest_3_url,
      workflow_step: newOrder.workflow_step,
      review_stages: newOrder.review_stages as any,
      next_workflow: newOrder.next_workflow
    });

    // Update Supabase with manifest URL and workflow step
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        manifest_2b_url: newManifestKey,
        workflow_step: 'bria_processing_complete',
        execution_status: 'done', // 2B is complete (images reused, no processing needed)
        next_workflow: nextWorkflow, // Usually '3' for book assembly
        updated_at: new Date().toISOString()
      })
      .eq('amazon_order_id', newOrderId);

    if (updateError) {
      console.error('[Create 2B Manifest] Failed to update Supabase:', updateError);
      // Manifest was uploaded but Supabase update failed - still return success
      // but log the error
    }

    return NextResponse.json({
      success: true,
      manifestKey: newManifestKey,
      manifestUrl: newManifestUrl,
      orderId: newOrderId,
      sourceOrderId: sourceOrderId,
      entriesCount: newManifest.entries.length,
      message: `2B manifest created successfully by reusing images from order ${sourceOrderId}`
    });

  } catch (error: any) {
    console.error('[Create 2B Manifest] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create 2B manifest',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

