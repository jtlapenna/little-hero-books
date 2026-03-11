import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { normalizeCharacterSpecs } from '@/lib/customization-utils';
import { fetchOrderRowByAnyId } from '@/lib/order-lookup';
import { supabase } from '@/lib/supabase-client';

const PayloadSchema = z.object({
  orderId: z.string().min(1),
  manifestUrl: z.string().url().or(z.string().min(1)),
  characterHash: z.string().min(1).optional(),
  amazonOrderId: z.string().min(1).optional(),
  posesGenerated: z.number().int().optional(),
  needsReview: z.boolean().optional(),
});

type ExactOrderRow = {
  id: number;
  orderId?: string | null;
  order_id?: string | null;
  root_order_id?: string | null;
  amazon_order_id?: string | null;
};

type ManifestLike = {
  orderId?: string | null;
  rootOrderId?: string | null;
  amazonOrderId?: string | null;
  manifestUrl?: string | null;
  originalManifestUrl?: string | null;
  characterHash?: string | null;
  characterSpecs?: Record<string, unknown>;
  order?: {
    orderId?: string | null;
    rootOrderId?: string | null;
    amazonOrderId?: string | null;
    characterHash?: string | null;
  } | null;
} & Record<string, unknown>;

function normalizeManifestRef(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.includes('/api/manifests/')) {
    return trimmed.split('/api/manifests/')[1] ?? '';
  }
  return trimmed.replace(/^https?:\/\/[^/]+\//i, '');
}

async function resolveExactOrderRow(orderId: string): Promise<ExactOrderRow> {
  const byOrderId = await supabase
    .from('orders')
    .select('id, orderId, order_id, root_order_id, amazon_order_id')
    .eq('orderId', orderId);
  if (byOrderId.error && byOrderId.error.code !== '42703') throw byOrderId.error;
  if (byOrderId.data && byOrderId.data.length > 1) {
    throw new Error(`workflow-2a-complete: orderId matched ${byOrderId.data.length} rows`);
  }
  if (byOrderId.data?.length === 1) {
    return byOrderId.data[0] as ExactOrderRow;
  }

  const byOrderIdSnake = await supabase
    .from('orders')
    .select('id, orderId, order_id, root_order_id, amazon_order_id')
    .eq('order_id', orderId);
  if (byOrderIdSnake.error && byOrderIdSnake.error.code !== '42703') throw byOrderIdSnake.error;
  if (byOrderIdSnake.data && byOrderIdSnake.data.length > 1) {
    throw new Error(`workflow-2a-complete: order_id matched ${byOrderIdSnake.data.length} rows`);
  }
  if (byOrderIdSnake.data?.length === 1) {
    return byOrderIdSnake.data[0] as ExactOrderRow;
  }

  const fallback = await fetchOrderRowByAnyId<ExactOrderRow>(
    supabase,
    orderId,
    'id, orderId, order_id, root_order_id, amazon_order_id',
  );
  if (!fallback.row) {
    throw new Error(`workflow-2a-complete: order row not found for per-item orderId ${orderId}`);
  }
  if (fallback.used === 'root_order_id' || fallback.used === 'amazon_order_id') {
    throw new Error(
      `workflow-2a-complete: rejected group-key lookup via ${fallback.used}; per-item orderId required`,
    );
  }

  throw new Error(`workflow-2a-complete: unresolved exact row for per-item orderId ${orderId}`);
}

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  try {
    const json = await request.json();
    const payload = PayloadSchema.parse(json);

    const expectedManifestKey = buildManifestKey(payload.orderId, '2a');
    const payloadManifestKey = normalizeManifestRef(payload.manifestUrl);
    if (payloadManifestKey && payloadManifestKey !== expectedManifestKey) {
      throw new Error(
        `workflow-2a-complete: manifestUrl does not match expected per-item manifest key (${payloadManifestKey} !== ${expectedManifestKey})`,
      );
    }

    const manifest = (await downloadManifest(expectedManifestKey)) as ManifestLike;
    if (manifest?.characterSpecs) {
      manifest.characterSpecs = normalizeCharacterSpecs(manifest.characterSpecs);
    }

    const manifestTopOrderId = String(manifest?.orderId ?? '').trim();
    const manifestNestedOrderId = String(manifest?.order?.orderId ?? '').trim();
    const manifestRootOrderId = String(
      manifest?.order?.rootOrderId ??
        manifest?.rootOrderId ??
        manifest?.order?.amazonOrderId ??
        manifest?.amazonOrderId ??
        '',
    ).trim();
    const manifestCharacterHash = String(
      manifest?.characterHash ?? manifest?.order?.characterHash ?? '',
    ).trim();
    const manifestBodyKey = normalizeManifestRef(
      manifest?.manifestUrl ?? manifest?.originalManifestUrl ?? '',
    );

    if (manifestTopOrderId !== payload.orderId || manifestNestedOrderId !== payload.orderId) {
      throw new Error('workflow-2a-complete: manifest body orderId does not match payload orderId');
    }
    if (manifestBodyKey && manifestBodyKey !== expectedManifestKey) {
      throw new Error(
        `workflow-2a-complete: manifest body manifestUrl does not match expected key (${manifestBodyKey} !== ${expectedManifestKey})`,
      );
    }
    if (payload.amazonOrderId && manifestRootOrderId !== payload.amazonOrderId) {
      throw new Error('workflow-2a-complete: manifest root/amazon orderId does not match payload amazonOrderId');
    }
    if (payload.characterHash && manifestCharacterHash && manifestCharacterHash !== payload.characterHash) {
      throw new Error('workflow-2a-complete: manifest characterHash does not match payload characterHash');
    }

    const orderRow = await resolveExactOrderRow(payload.orderId);
    const rowPerBookOrderId = String(orderRow.orderId ?? orderRow.order_id ?? '').trim();
    const rowRootOrderId = String(orderRow.root_order_id ?? orderRow.amazon_order_id ?? '').trim();

    if (rowPerBookOrderId && rowPerBookOrderId !== payload.orderId) {
      throw new Error('workflow-2a-complete: resolved row per-item orderId does not match payload');
    }
    if (payload.amazonOrderId && rowRootOrderId && rowRootOrderId !== payload.amazonOrderId) {
      throw new Error('workflow-2a-complete: resolved row root orderId does not match payload amazonOrderId');
    }

    const manifestUrl =
      payload.manifestUrl || `https://admin.littleherolabs.com/api/manifests/${expectedManifestKey}`;
    const updateNow = new Date().toISOString();
    const updateRes = await supabase
      .from('orders')
      .update({
        workflow_step: '2A-complete',
        manifest_2a_url: manifestUrl,
        execution_status: payload.needsReview ? 'processing' : 'done',
        started_at: null,
        current_workflow: null,
        updated_at: updateNow,
      })
      .eq('id', orderRow.id)
      .select('id');
    if (updateRes.error) throw updateRes.error;
    if (!updateRes.data || updateRes.data.length !== 1) {
      throw new Error('workflow-2a-complete: expected exactly one updated row');
    }

    return NextResponse.json({
      success: true,
      orderId: payload.orderId,
      stage: '2a',
      manifestKey: expectedManifestKey,
      manifestLoaded: true,
      updatedRowId: orderRow.id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
