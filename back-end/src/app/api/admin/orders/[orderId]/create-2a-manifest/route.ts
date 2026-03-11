import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { determineNextWorkflow } from '@/lib/determine-next-workflow';
import { fetchOrderRowByAnyId, updateOrderRowByAnyId } from '@/lib/order-lookup';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const backendUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://admin.littleherolabs.com';

/**
 * POST /api/admin/orders/[orderId]/create-2a-manifest
 * 
 * Creates a 2A-manifest.json for a new order by copying image references from
 * another order with the same character_hash that already has a 2A manifest.
 * 
 * This allows reusing generated poses without regenerating them.
 * The new manifest retains the 1-manifest information (order details, customer info, etc.)
 * but uses the image references from the source order's 2A manifest.
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
    const { row: newOrder } = await fetchOrderRowByAnyId<any>(supabase as any, newOrderId, '*');
    if (!newOrder) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }
    const perBookOrderId = (newOrder.orderId ?? newOrder.order_id ?? newOrderId) as string;

    // Check if order already has a 2A manifest (verify file actually exists in R2)
    if (newOrder.manifest_2a_url) {
      // Verify the manifest file actually exists in R2
      // Supabase might have a URL but the file could have been deleted
      try {
        let manifestKey = newOrder.manifest_2a_url;
        if (manifestKey.includes('/api/manifests/')) {
          manifestKey = manifestKey.split('/api/manifests/')[1];
        } else if (manifestKey.includes('manifests/2a-manifest.json')) {
          // Already a key
        }
        
        const existingManifest = await downloadManifest(manifestKey);
        if (existingManifest) {
          // File exists, order already has a valid 2A manifest
          return NextResponse.json(
            { 
              error: 'Order already has a 2A manifest',
              details: `Manifest URL: ${newOrder.manifest_2a_url}`
            },
            { status: 400 }
          );
        }
        // File doesn't exist, clear the URL from Supabase and continue
        console.log(`[Create 2A Manifest] Supabase has manifest_2a_url but file doesn't exist, clearing URL and continuing`);
        await updateOrderRowByAnyId(supabase as any, perBookOrderId, { manifest_2a_url: null });
      } catch (error: any) {
        // File doesn't exist (404 or other error), clear the URL from Supabase and continue
        console.log(`[Create 2A Manifest] Manifest file not found in R2, clearing Supabase URL and continuing:`, error?.message);
        await updateOrderRowByAnyId(supabase as any, perBookOrderId, { manifest_2a_url: null });
      }
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

    // Check if order has a 1-manifest (needed for order-specific information)
    if (!newOrder.one_manifest_url) {
      return NextResponse.json(
        { 
          error: 'Order missing 1-manifest',
          details: '1-manifest.json is required to create 2A manifest. Please create 1-manifest first.'
        },
        { status: 400 }
      );
    }

    // Find another order with the same character_hash that has a 2A manifest
    const { data: sourceOrders, error: sourceError } = await supabase
      .from('orders')
      .select('amazon_order_id, orderId, manifest_2a_url, character_hash')
      .eq('character_hash', newOrder.character_hash)
      .not('manifest_2a_url', 'is', null)
      .limit(5);

    const filtered = (sourceOrders ?? []).filter((o: any) => {
      const id = String(o?.orderId ?? o?.amazon_order_id ?? '').trim();
      return id && id !== perBookOrderId;
    });
    if (sourceError || filtered.length === 0) {
      return NextResponse.json(
        { 
          error: 'No source order found',
          details: `No other order with character_hash ${newOrder.character_hash} has a 2A manifest. Cannot reuse images.`
        },
        { status: 404 }
      );
    }

    const sourceOrder = filtered[0];
    const sourceOrderId = sourceOrder.amazon_order_id || sourceOrder.orderId;

    if (!sourceOrder.manifest_2a_url) {
      return NextResponse.json(
        { error: 'Source order manifest URL is missing' },
        { status: 500 }
      );
    }

    // Extract manifest key from URL or construct it
    let sourceManifestKey = sourceOrder.manifest_2a_url;
    // If it's a full URL, extract the key part
    if (sourceManifestKey.includes('/api/manifests/')) {
      sourceManifestKey = sourceManifestKey.split('/api/manifests/')[1];
    } else if (sourceManifestKey.includes('manifests/2a-manifest.json')) {
      // Already a key
    } else {
      // Construct from order ID
      sourceManifestKey = buildManifestKey(sourceOrderId, '2a');
    }

    // Download source order's 2A manifest (for image references)
    let source2aManifest: any;
    try {
      source2aManifest = await downloadManifest(sourceManifestKey);
      console.log(`[Create 2A Manifest] Downloaded source 2A manifest with ${source2aManifest?.entries?.length || 0} entries`);
    } catch (error: any) {
      return NextResponse.json(
        { 
          error: 'Failed to download source 2A manifest',
          details: error?.message || 'Manifest not found in R2'
        },
        { status: 404 }
      );
    }

    // Download new order's 1-manifest (for order-specific information)
    let oneManifestKey = newOrder.one_manifest_url;
    if (oneManifestKey.includes('/api/manifests/')) {
      oneManifestKey = oneManifestKey.split('/api/manifests/')[1];
    }

    let oneManifest: any;
    try {
      oneManifest = await downloadManifest(oneManifestKey);
      console.log(`[Create 2A Manifest] Downloaded 1-manifest for order-specific information`);
    } catch (error: any) {
      return NextResponse.json(
        { 
          error: 'Failed to download 1-manifest',
          details: error?.message || '1-manifest.json not found in R2'
        },
        { status: 404 }
      );
    }

    // Validate source manifest structure
    if (!source2aManifest || !source2aManifest.entries || !Array.isArray(source2aManifest.entries)) {
      return NextResponse.json(
        { error: 'Invalid source 2A manifest structure', details: 'Missing entries array' },
        { status: 500 }
      );
    }

    const rootOrderId = String(
      newOrder.root_order_id ?? newOrder.amazon_order_id ?? perBookOrderId,
    ).trim() || perBookOrderId;
    const oneManifestUrl = String(
      newOrder.one_manifest_url ?? oneManifest.order?.oneManifestUrl ?? '',
    ).trim() || null;

    // Build new 2A manifest by:
    // 1. Using image references from source 2A manifest (approvedKey, publicUrl, etc.)
    // 2. Using order-specific information from 1-manifest (customer info, dedication, etc.)
    const now = new Date().toISOString();
    const newManifest = {
      ...source2aManifest,
      schema: source2aManifest.schema || 'lhb.run-manifest@v2.0',
      runStamp: now,
      characterHash: newOrder.character_hash,
      generatedAt: now, // Update to current timestamp (was from source order)
      order: {
        ...source2aManifest.order,
        // Override with order-specific information from 1-manifest
        orderId: perBookOrderId,
        rootOrderId,
        amazonOrderId: rootOrderId,
        oneManifestUrl,
        purchaseDate: newOrder.purchase_date || newOrder.created_at || oneManifest.order?.purchaseDate || null,
        buyer: {
          email: newOrder.customer_email || oneManifest.order?.buyer?.email || null,
          name: newOrder.customer_name || oneManifest.order?.buyer?.name || null
        },
        dedication: newOrder.dedication_text ? {
          raw: newOrder.dedication_text,
          text: newOrder.dedication_text,
          htmlSafe: newOrder.dedication_text
        } : (oneManifest.order?.dedication || source2aManifest.order?.dedication || null),
        characterSpecs: newOrder.character_specs || oneManifest.order?.characterSpecs || source2aManifest.order?.characterSpecs || {},
        bookSpecs: newOrder.product_info?.bookSpecs || oneManifest.order?.bookSpecs || source2aManifest.order?.bookSpecs || {},
        orderDetails: {
          ...source2aManifest.order?.orderDetails,
          quantity: newOrder.product_info?.quantity || oneManifest.order?.orderDetails?.quantity || source2aManifest.order?.orderDetails?.quantity || 1,
          shippingAddress: newOrder.shipping_address || newOrder.product_info?.shippingAddress || oneManifest.order?.orderDetails?.shippingAddress || source2aManifest.order?.orderDetails?.shippingAddress || {}
        }
      },
      // Copy entries with image references from source 2A manifest (approvedKey, publicUrl, etc.)
      // These point to the shared character hash directory, so they're valid for the new order
      entries: source2aManifest.entries.map((entry: any) => ({
        ...entry,
        // Keep all image references from source (approvedKey, publicUrl, approvedFilename, etc.)
        // These point to the shared character hash directory, so they're valid for the new order
      })),
      // Clear order-specific review queue (from source order)
      reviewQueue: [], // Will be recalculated by workflow if needed
      // Clear order-specific revision history (from source order)
      revisions: {
        history: [], // Order-specific revision history should not be copied
        pending: {}
      },
      // Update top-level orderId
      orderId: perBookOrderId,
      rootOrderId,
      amazonOrderId: rootOrderId,
      // Update manifest URL references
      manifestUrl: null, // Will be set after upload
      originalManifestUrl: null, // Will be set after upload
    };

    // Build R2 key for new manifest
    const newManifestKey = buildManifestKey(perBookOrderId, '2a');
    const newManifestUrl = `${backendUrl}/api/manifests/${newManifestKey}`;

    // Update manifest URLs in the manifest itself
    newManifest.manifestUrl = newManifestUrl;
    newManifest.originalManifestUrl = newManifestUrl;

    // Upload to R2
    const manifestJson = JSON.stringify(newManifest, null, 2);
    try {
      const uploadResponse = await putObject(
        R2_ORDERS_BUCKET,
        newManifestKey,
        manifestJson,
        'application/json'
      );
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`R2 upload failed: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}`);
      }
      
      console.log(`[Create 2A Manifest] Uploaded new manifest to: ${newManifestKey}`);
      
      // Verify the file was actually uploaded by trying to download it
      try {
        const verifyManifest = await downloadManifest(newManifestKey);
        if (!verifyManifest || !verifyManifest.orderId) {
          throw new Error('Uploaded manifest verification failed: manifest is invalid');
        }
        console.log(`[Create 2A Manifest] Verified manifest exists in R2: ${newManifestKey}`);
      } catch (verifyError: any) {
        console.error(`[Create 2A Manifest] ⚠️ WARNING: Manifest upload succeeded but verification failed:`, verifyError?.message);
        // Don't fail the request, but log the warning - might be a timing issue
      }
    } catch (uploadError: any) {
      console.error(`[Create 2A Manifest] Failed to upload manifest to R2:`, uploadError?.message);
      return NextResponse.json(
        { 
          error: 'Failed to upload manifest to R2',
          details: uploadError?.message || 'Upload failed',
          manifestKey: newManifestKey
        },
        { status: 500 }
      );
    }

    // Determine correct next_workflow based on order's actual progress
    const nextWorkflow = determineNextWorkflow({
      one_manifest_url: newOrder.one_manifest_url,
      manifest_2a_url: newManifestKey, // We just created this
      manifest_2b_url: newOrder.manifest_2b_url,
      manifest_3_url: newOrder.manifest_3_url,
      workflow_step: newOrder.workflow_step,
      review_stages: newOrder.review_stages as any,
      next_workflow: newOrder.next_workflow,
      customer_approval_required: (newOrder as any).customer_approval_required ?? undefined,
      customer_approval_status: (newOrder as any).customer_approval_status ?? undefined,
    });

    // Update Supabase with manifest URL and workflow step
    const updateNow = new Date().toISOString();
    try {
      await updateOrderRowByAnyId(supabase as any, perBookOrderId, {
        manifest_2a_url: newManifestKey,
        workflow_step: 'ai_generation_completed',
        execution_status: 'ready_for_processing', // Ready for next workflow (usually 2B)
        next_workflow: nextWorkflow, // Usually '2B' for background removal
        queued_at: updateNow, // Set queued_at so router picks it up
        updated_at: updateNow,
      });
    } catch (updateError: unknown) {
      console.error('[Create 2A Manifest] Failed to update Supabase:', updateError);
    }

    return NextResponse.json({
      success: true,
      manifestKey: newManifestKey,
      manifestUrl: newManifestUrl,
      orderId: perBookOrderId,
      sourceOrderId: sourceOrderId,
      entriesCount: newManifest.entries.length,
      message: `2A manifest created successfully by reusing images from order ${sourceOrderId}`
    });

  } catch (error: any) {
    console.error('[Create 2A Manifest] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create 2A manifest',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
