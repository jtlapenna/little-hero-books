import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest } from '@/lib/r2-service';
import { normalizeCharacterSpecs } from '@/lib/customization-utils';
import { fetchOrderRowByAnyId } from '@/lib/order-lookup';
import { supabase } from '@/lib/supabase-client';
import {
  buildManifestKeyCandidates,
  buildManifestKeyHintOptionsFromOrderLike,
  extractManifestKey,
} from '@/lib/order-paths';

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
  project?: string | null;
  asset_prefix?: string | null;
  one_manifest_url?: string | null;
  manifest_2a_url?: string | null;
  manifest_2b_url?: string | null;
  manifest_3_url?: string | null;
  final_book_url?: string | null;
  final_cover_url?: string | null;
  cover_image_url?: string | null;
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

async function resolveExactOrderRow(orderId: string): Promise<ExactOrderRow> {
  const exactSelect =
    'id, orderId, order_id, root_order_id, amazon_order_id, project, asset_prefix, one_manifest_url, manifest_2a_url, manifest_2b_url, manifest_3_url, final_book_url, final_cover_url, cover_image_url';
  const byOrderId = await supabase
    .from('orders')
    .select(exactSelect)
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
    .select(exactSelect)
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

    const orderRow = await resolveExactOrderRow(payload.orderId);
    const payloadManifestKey = extractManifestKey(payload.manifestUrl) ?? '';
    const orderHints = buildManifestKeyHintOptionsFromOrderLike(orderRow);
    const expectedManifestKeys = buildManifestKeyCandidates(payload.orderId, '2a', {
      ...orderHints,
      pathLikes: [payload.manifestUrl, ...(orderHints.pathLikes ?? [])],
    });
    const expectedManifestKey = payloadManifestKey || expectedManifestKeys[0];

    if (!expectedManifestKey) {
      throw new Error('workflow-2a-complete: unable to resolve expected manifest key');
    }
    if (payloadManifestKey && !expectedManifestKeys.includes(payloadManifestKey)) {
      throw new Error(
        `workflow-2a-complete: manifestUrl does not match expected per-item manifest keys (${payloadManifestKey})`,
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
    const manifestBodyKey =
      extractManifestKey(
        String(manifest?.manifestUrl ?? manifest?.originalManifestUrl ?? ''),
      ) ?? '';

    if (manifestTopOrderId !== payload.orderId || manifestNestedOrderId !== payload.orderId) {
      throw new Error('workflow-2a-complete: manifest body orderId does not match payload orderId');
    }
    if (manifestBodyKey && !expectedManifestKeys.includes(manifestBodyKey)) {
      throw new Error(
        `workflow-2a-complete: manifest body manifestUrl does not match expected keys (${manifestBodyKey})`,
      );
    }
    if (payload.amazonOrderId && manifestRootOrderId !== payload.amazonOrderId) {
      throw new Error('workflow-2a-complete: manifest root/amazon orderId does not match payload amazonOrderId');
    }
    if (payload.characterHash && manifestCharacterHash && manifestCharacterHash !== payload.characterHash) {
      throw new Error('workflow-2a-complete: manifest characterHash does not match payload characterHash');
    }

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
      } as never)
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
