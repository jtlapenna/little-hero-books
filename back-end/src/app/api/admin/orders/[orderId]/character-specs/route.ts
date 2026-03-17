import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';
import { downloadManifest } from '@/lib/r2-service';
import {
  buildManifestKeyCandidates,
  buildManifestKeyFromOrderPrefix,
  buildManifestKeyHintOptionsFromOrderLike,
  resolveOrderPathContext,
} from '@/lib/order-paths';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/orders/[orderId]/character-specs
 *
 * Updates character_specs, rebuilds 1-manifest, and optionally triggers
 * regeneration from W2A — single action for customer revision handling.
 *
 * Body: { specs: Partial<CharacterSpecs>, regenerate?: boolean }
 *   specs       — fields to merge into existing character_specs (e.g. { skinTone: "brown-deep" })
 *   regenerate  — if true (default), resets order state to re-run from W2A
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) return auth.response;

  const { orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
  }

  let body: { specs?: Record<string, unknown>; regenerate?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { specs, regenerate = true } = body;
  if (!specs || typeof specs !== 'object' || Object.keys(specs).length === 0) {
    return NextResponse.json({ error: 'specs object is required and must not be empty' }, { status: 400 });
  }

  try {
    // 1. Fetch current order
    const order = await getOrderFromSupabase(orderId).catch(() => null);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const rowId = Number(order.id);
    if (!Number.isFinite(rowId)) {
      return NextResponse.json({ error: 'Order row missing numeric id' }, { status: 500 });
    }

    // 2. Merge new specs into existing character_specs
    let existing: Record<string, unknown> = {};
    if (order.character_specs) {
      existing = typeof order.character_specs === 'string'
        ? JSON.parse(order.character_specs)
        : order.character_specs;
    }
    const merged = { ...existing, ...specs };

    // 3. Build update payload
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      character_specs: merged,
      updated_at: now,
    };

    if (regenerate) {
      Object.assign(updateData, {
        next_workflow: '2A',
        execution_status: 'ready_for_processing',
        queued_at: now,
        started_at: null,
        current_workflow: null,
        workflow_step: 'order_intake',
        manifest_2a_url: '',
        manifest_2b_url: '',
        manifest_3_url: '',
        final_book_url: '',
        cover_image_url: '',
        status: 'queued_for_processing',
        error_message: null,
        error_type: null,
        retry_count: 0,
        last_error_at: null,
        next_retry_at: null,
      });
    }

    // 4. Update Supabase
    const { error: updateError } = await supabase
      .from('orders')
      .update(updateData as never)
      .eq('id', rowId);
    if (updateError) throw updateError;

    // 5. Rebuild 1-manifest in R2 with updated specs
    const perBookId = String((order as any).orderId ?? (order as any).order_id ?? orderId).trim();
    const manifestHints = buildManifestKeyHintOptionsFromOrderLike(order as Record<string, unknown>);
    const { bookId, orderPrefix } = resolveOrderPathContext(perBookId, manifestHints);
    const manifestKey = buildManifestKeyFromOrderPrefix(orderPrefix, '1');
    let manifestRebuilt = false;
    try {
      const manifest = {
        schema: 'lhb.run-manifest@v2.1',
        runStamp: now,
        amazonOrderId: (order as any).amazon_order_id ?? null,
        marketplaceId: (order as any).marketplace_id ?? null,
        order: {
          purchaseDate: (order as any).purchase_date ?? (order as any).created_at ?? null,
          buyer: {
            email: (order as any).customer_email ?? null,
            name: (order as any).customer_name ?? null,
          },
          dedication: (order as any).dedication_text
            ? { raw: (order as any).dedication_text, text: (order as any).dedication_text, htmlSafe: (order as any).dedication_text }
            : null,
          project: bookId,
          characterSpecs: merged,
          bookSpecs: (order as any).product_info?.bookSpecs ?? {
            title: 'Adventure Book',
            totalPages: 16,
            format: '8.5x8.5_softcover',
            bookType: 'adventure',
          },
          orderDetails: {
            quantity: (order as any).product_info?.quantity ?? 1,
            shippingAddress: (order as any).product_info?.shippingAddress ?? (order as any).shipping_address ?? {},
          },
        },
      };
      await putObject(R2_ORDERS_BUCKET, manifestKey, JSON.stringify(manifest, null, 2), 'application/json');
      manifestRebuilt = true;
    } catch (e: unknown) {
      console.error('[character-specs] Failed to rebuild 1-manifest:', e);
    }

    // 6. If regenerating, also clear 2A manifest bria fields (same as regenerate-2a)
    let manifest2aCleared = false;
    if (regenerate) {
      try {
        const key2aCandidates = buildManifestKeyCandidates(perBookId, '2a', manifestHints);
        for (const key2a of key2aCandidates) {
          const m2a = await downloadManifest(key2a).catch(() => null);
          if (!m2a || !Array.isArray(m2a.entries)) {
            continue;
          }

          let modified = false;
          for (const entry of m2a.entries) {
            if (entry.briaStatusUrl || entry.briaRequestId || entry.bgRemovedKey || entry.bgRemovedImageUrl) {
              delete entry.briaStatusUrl;
              delete entry.briaRequestId;
              delete entry.bgRemovedKey;
              delete entry.bgRemovedImageUrl;
              modified = true;
            }
            if (entry.needsReview !== undefined || entry.reviewReason || entry.isFlagged !== undefined) {
              entry.needsReview = false;
              entry.reviewReason = null;
              entry.isFlagged = false;
              modified = true;
            }
          }
          if (modified) {
            await putObject(R2_ORDERS_BUCKET, key2a, JSON.stringify(m2a, null, 2), 'application/json');
            manifest2aCleared = true;
          }
          break;
        }
      } catch (e: unknown) {
        console.error('[character-specs] Failed to clear 2A manifest:', e);
      }
    }

    return NextResponse.json({
      success: true,
      orderId: perBookId,
      updatedSpecs: merged,
      manifestRebuilt,
      manifest2aCleared,
      regenerateQueued: regenerate,
      message: regenerate
        ? 'Character specs updated. Order queued for W2A regeneration.'
        : 'Character specs updated (no regeneration triggered).',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[character-specs] Error:', error);
    return NextResponse.json({ error: 'Failed to update character specs', details: msg }, { status: 500 });
  }
}
