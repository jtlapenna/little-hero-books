import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { determineNextWorkflow, OrderProgress } from '@/lib/determine-next-workflow';
import { fetchOrderRowByAnyId, updateOrderRowByAnyId } from '@/lib/order-lookup';
import {
  BuildOrderIntakeManifestOptions,
  buildOrderIntakeManifestFromOrder,
  resolveW0ManifestSchemaVersion,
} from '@/lib/w0-manifest-builder';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

type CreateManifestOrderRow = Record<string, unknown> & {
  orderId?: string;
  order_id?: string;
  characterSpecs?: Record<string, unknown>;
  character_specs?: Record<string, unknown>;
  productInfo?: Record<string, unknown>;
  product_info?: Record<string, unknown>;
  bookSpecs?: Record<string, unknown>;
  book_specs?: Record<string, unknown>;
  manifest_2a_url?: string | null;
  manifest_2b_url?: string | null;
  manifest_3_url?: string | null;
  workflow_step?: string | null;
  review_stages?: OrderProgress['review_stages'];
  next_workflow?: string | null;
  customer_approval_required?: boolean | null;
  customer_approval_status?: string | null;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * POST /api/admin/orders/[orderId]/create-manifest
 * 
 * Creates a 1-manifest.json file from Supabase order data and uploads it to R2.
 * 
 * This endpoint is used to recover orders that are missing their 1-manifest.json file.
 * 
 * Body: optional JSON
 * {
 *   "schemaVersion": "v2.1" | "v3",
 *   "bookId": "book-mvp-simple-adventure",
 *   "configVersion": 1,
 *   "formatId": "standard" | "amazon"
 * }
 * 
 * Returns: { success: true, manifestKey: string, orderId: string }
 */

async function readManifestOptions(
  request: NextRequest,
): Promise<BuildOrderIntakeManifestOptions> {
  const rawBody = await request.text();
  if (rawBody.trim().length === 0) {
    return {};
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    throw new Error('Invalid JSON body');
  }

  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
    throw new Error('Request body must be a JSON object');
  }

  const body = parsedBody as Record<string, unknown>;
  const configVersion =
    typeof body.configVersion === 'number' && Number.isInteger(body.configVersion)
      ? body.configVersion
      : undefined;

  return {
    schemaVersion: resolveW0ManifestSchemaVersion(body.schemaVersion),
    bookId: typeof body.bookId === 'string' ? body.bookId.trim() || undefined : undefined,
    configVersion,
    formatId: typeof body.formatId === 'string' ? body.formatId.trim() || undefined : undefined,
  };
}

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

  if (!orderId) {
    return NextResponse.json(
      { error: 'Order ID is required' },
      { status: 400 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  let manifestOptions: BuildOrderIntakeManifestOptions;

  try {
    manifestOptions = await readManifestOptions(request);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: 'Invalid request body',
        details: getErrorMessage(error),
      },
      { status: 400 }
    );
  }

  try {
    // Fetch order from Supabase
    const { row: order } = await fetchOrderRowByAnyId<CreateManifestOrderRow>(
      supabase,
      orderId,
      '*',
    );
    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Validate required fields
    const hasCharacterSpecs =
      order.character_specs ||
      order.characterSpecs;
    const hasBookInput =
      order.product_info ||
      order.productInfo ||
      order.book_specs ||
      order.bookSpecs;

    if (!hasCharacterSpecs || !hasBookInput) {
      return NextResponse.json(
        { 
          error: 'Order missing required data',
          details: 'character_specs and product_info/book_specs are required to create manifest'
        },
        { status: 400 }
      );
    }

    const perBookOrderId = (order.orderId ?? order.order_id ?? orderId) as string;
    const builtManifest = buildOrderIntakeManifestFromOrder(
      order,
      perBookOrderId,
      manifestOptions,
    );
    const { manifest, manifestKey: r2Key } = builtManifest;

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
      review_stages: order.review_stages,
      next_workflow: order.next_workflow,
      customer_approval_required: order.customer_approval_required ?? undefined,
      customer_approval_status: order.customer_approval_status ?? undefined,
    });

    // Update Supabase with manifest URL (store key, not full URL)
    try {
      await updateOrderRowByAnyId(supabase, perBookOrderId, {
        one_manifest_url: r2Key,
        execution_status: 'ready_for_processing',
        next_workflow: nextWorkflow, // Use determined workflow, not hardcoded '2A'
        error_message: null,
        error_type: null,
        updated_at: new Date().toISOString(),
      });
    } catch (updateError: unknown) {
      console.error('[Create Manifest] Failed to update Supabase:', updateError);
    }

    return NextResponse.json({
      success: true,
      manifestKey: r2Key,
      orderId: perBookOrderId,
      bookId: builtManifest.bookId,
      formatId: builtManifest.formatId,
      schemaVersion: builtManifest.schemaVersion,
      manifestSchema:
        typeof manifest.schema === 'string' ? manifest.schema : null,
      message: 'Manifest created and uploaded successfully'
    });

  } catch (error: unknown) {
    console.error('[Create Manifest] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create manifest',
        details: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
