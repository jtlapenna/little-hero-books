import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { downloadManifest } from '@/lib/r2-service';
import { normalizeW0Manifest, type NormalizedW0Manifest } from '@/lib/books';
import { determineNextWorkflow, type OrderProgress } from '@/lib/determine-next-workflow';
import { fetchOrderRowByAnyId, updateOrderRowByAnyId } from '@/lib/order-lookup';
import {
  buildManifestKeyCandidates,
  extractManifestKey,
} from '@/lib/order-paths';
import { resolveCanonicalBackendBaseUrl } from '@/lib/backend-url';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const backendUrl = resolveCanonicalBackendBaseUrl();

type JsonRecord = Record<string, unknown>;

type Create2AOrderRow = JsonRecord & {
  orderId?: string;
  order_id?: string;
  root_order_id?: string | null;
  amazon_order_id?: string | null;
  manifest_2a_url?: string | null;
  one_manifest_url?: string | null;
  manifest_2b_url?: string | null;
  manifest_3_url?: string | null;
  character_hash?: string | null;
  character_specs?: JsonRecord;
  product_info?: JsonRecord;
  shipping_address?: JsonRecord;
  purchase_date?: string | null;
  created_at?: string | null;
  customer_email?: string | null;
  customer_name?: string | null;
  dedication_text?: string | null;
  workflow_step?: string | null;
  review_stages?: OrderProgress['review_stages'];
  next_workflow?: string | null;
  customer_approval_required?: boolean | null;
  customer_approval_status?: string | null;
};

type SourceOrderCandidate = {
  amazon_order_id?: string | null;
  orderId?: string | null;
  manifest_2a_url?: string | null;
  character_hash?: string | null;
};

type Existing2AManifest = JsonRecord & {
  schema?: string;
  order?: JsonRecord;
  entries: JsonRecord[];
  orderId?: string;
  rootOrderId?: string;
  amazonOrderId?: string;
  manifestUrl?: string | null;
  originalManifestUrl?: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toObject(value: unknown): JsonRecord | undefined {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function toStringValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildDedication(text: string | null) {
  if (!text) {
    return null;
  }

  return {
    raw: text,
    text,
    htmlSafe: text,
  };
}

function hasKeys(value: JsonRecord | undefined): value is JsonRecord {
  return !!value && Object.keys(value).length > 0;
}

function pickFirstPopulatedRecord(
  ...values: Array<JsonRecord | undefined>
): JsonRecord | undefined {
  return values.find(hasKeys);
}

function assert2AManifest(value: unknown): Existing2AManifest {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    throw new Error('Missing entries array');
  }

  return {
    ...value,
    entries: value.entries.filter(isRecord),
  };
}

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
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
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

  const newOrderId = orderId?.trim();

  if (!newOrderId) {
    return NextResponse.json(
      { error: 'Order ID is required' },
      { status: 400 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Fetch new order from Supabase
    const { row: newOrder } = await fetchOrderRowByAnyId<Create2AOrderRow>(
      supabase,
      newOrderId,
      '*',
    );
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
        const manifestKey = extractManifestKey(newOrder.manifest_2a_url);
        if (!manifestKey) {
          throw new Error('Invalid manifest_2a_url');
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
        await updateOrderRowByAnyId(supabase, perBookOrderId, { manifest_2a_url: null });
      } catch (error: unknown) {
        // File doesn't exist (404 or other error), clear the URL from Supabase and continue
        console.log(
          `[Create 2A Manifest] Manifest file not found in R2, clearing Supabase URL and continuing:`,
          getErrorMessage(error),
        );
        await updateOrderRowByAnyId(supabase, perBookOrderId, { manifest_2a_url: null });
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

    const filtered = ((sourceOrders ?? []) as SourceOrderCandidate[]).filter((candidate) => {
      const id = String(candidate.orderId ?? candidate.amazon_order_id ?? '').trim();
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
    const sourceOrderId = String(
      sourceOrder.amazon_order_id ?? sourceOrder.orderId ?? '',
    ).trim();

    if (!sourceOrder.manifest_2a_url || !sourceOrderId) {
      return NextResponse.json(
        { error: 'Source order manifest URL is missing' },
        { status: 500 }
      );
    }

    // Extract manifest key from URL or construct it
    const sourceManifestKey = extractManifestKey(sourceOrder.manifest_2a_url);
    if (!sourceManifestKey) {
      return NextResponse.json(
        { error: 'Source order manifest URL is invalid' },
        { status: 500 }
      );
    }

    // Download source order's 2A manifest (for image references)
    let source2aManifest: Existing2AManifest;
    try {
      source2aManifest = assert2AManifest(await downloadManifest(sourceManifestKey));
      console.log(`[Create 2A Manifest] Downloaded source 2A manifest with ${source2aManifest?.entries?.length || 0} entries`);
    } catch (error: unknown) {
      return NextResponse.json(
        { 
          error: 'Failed to download source 2A manifest',
          details: getErrorMessage(error) || 'Manifest not found in R2'
        },
        { status: 404 }
      );
    }

    // Download new order's 1-manifest (for order-specific information)
    const oneManifestKey = extractManifestKey(newOrder.one_manifest_url);
    if (!oneManifestKey) {
      return NextResponse.json(
        {
          error: 'Order missing valid 1-manifest URL',
          details: '1-manifest.json is required to create 2A manifest.',
        },
        { status: 400 }
      );
    }
    let oneManifestSnapshot: NormalizedW0Manifest;
    try {
      const oneManifest = await downloadManifest(oneManifestKey);
      console.log(`[Create 2A Manifest] Downloaded 1-manifest for order-specific information`);
      oneManifestSnapshot = normalizeW0Manifest(oneManifest, {
        fallbackManifestKey: oneManifestKey,
      });
    } catch (error: unknown) {
      return NextResponse.json(
        { 
          error: 'Failed to download 1-manifest',
          details: getErrorMessage(error) || '1-manifest.json not found in R2'
        },
        { status: 404 }
      );
    }

    const productInfo = toObject(newOrder.product_info) ?? {};
    const orderBookSpecs = toObject(productInfo.bookSpecs);
    const orderShippingAddress = toObject(newOrder.shipping_address);
    const sourceManifestOrder = toObject(source2aManifest.order) ?? {};
    const sourceManifestOrderDetails = toObject(sourceManifestOrder.orderDetails);

    const rootOrderId = String(
      newOrder.root_order_id ??
        oneManifestSnapshot.rootOrderId ??
        newOrder.amazon_order_id ??
        perBookOrderId,
    ).trim() || perBookOrderId;
    const oneManifestUrl = String(
      newOrder.one_manifest_url ?? oneManifestSnapshot.manifestKey ?? '',
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
        ...sourceManifestOrder,
        // Override with order-specific information from 1-manifest
        orderId: perBookOrderId,
        rootOrderId,
        amazonOrderId: rootOrderId,
        oneManifestUrl,
        purchaseDate:
          toStringValue(newOrder.purchase_date) ??
          toStringValue(newOrder.created_at) ??
          oneManifestSnapshot.purchaseDate ??
          null,
        buyer: {
          email:
            toStringValue(newOrder.customer_email) ??
            oneManifestSnapshot.buyer.email ??
            null,
          name:
            toStringValue(newOrder.customer_name) ??
            oneManifestSnapshot.buyer.name ??
            null,
        },
        dedication:
          buildDedication(toStringValue(newOrder.dedication_text)) ??
          oneManifestSnapshot.dedication ??
          sourceManifestOrder.dedication ??
          null,
        characterSpecs:
          pickFirstPopulatedRecord(
            toObject(newOrder.character_specs),
            oneManifestSnapshot.characterSpecs,
            toObject(sourceManifestOrder.characterSpecs),
          ) ??
          {},
        bookSpecs:
          pickFirstPopulatedRecord(
            orderBookSpecs,
            oneManifestSnapshot.bookSpecs,
            toObject(sourceManifestOrder.bookSpecs),
          ) ??
          {},
        orderDetails: {
          ...(sourceManifestOrderDetails ?? {}),
          quantity:
            productInfo.quantity ??
            oneManifestSnapshot.orderDetails.quantity ??
            sourceManifestOrderDetails?.quantity ??
            1,
          shippingAddress:
            pickFirstPopulatedRecord(
              orderShippingAddress,
              toObject(productInfo.shippingAddress),
              oneManifestSnapshot.shippingAddress,
              toObject(sourceManifestOrderDetails?.shippingAddress),
            ) ??
            {},
        },
      },
      // Copy entries with image references from source 2A manifest (approvedKey, publicUrl, etc.)
      // These point to the shared character hash directory, so they're valid for the new order
      entries: source2aManifest.entries.map((entry) => ({
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
      manifestUrl: null as string | null, // Will be set after upload
      originalManifestUrl: null as string | null, // Will be set after upload
    };

    // Build R2 key for new manifest
    const newManifestKey =
      buildManifestKeyCandidates(perBookOrderId, '2a', {
        pathLikes: [newOrder.one_manifest_url, oneManifestSnapshot.manifestKey],
      })[0];
    if (!newManifestKey) {
      throw new Error('Unable to resolve new 2A manifest key');
    }
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
      } catch (verifyError: unknown) {
        console.error(
          `[Create 2A Manifest] ⚠️ WARNING: Manifest upload succeeded but verification failed:`,
          getErrorMessage(verifyError),
        );
        // Don't fail the request, but log the warning - might be a timing issue
      }
    } catch (uploadError: unknown) {
      console.error(
        `[Create 2A Manifest] Failed to upload manifest to R2:`,
        getErrorMessage(uploadError),
      );
      return NextResponse.json(
        { 
          error: 'Failed to upload manifest to R2',
          details: getErrorMessage(uploadError) || 'Upload failed',
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
      review_stages: newOrder.review_stages,
      next_workflow: newOrder.next_workflow,
      customer_approval_required: newOrder.customer_approval_required ?? undefined,
      customer_approval_status: newOrder.customer_approval_status ?? undefined,
    });

    // Update Supabase with manifest URL and workflow step
    const updateNow = new Date().toISOString();
    try {
      await updateOrderRowByAnyId(supabase, perBookOrderId, {
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

  } catch (error: unknown) {
    console.error('[Create 2A Manifest] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create 2A manifest',
        details: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
