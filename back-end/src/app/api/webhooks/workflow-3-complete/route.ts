import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest } from '@/lib/r2-service';
import { normalizeCharacterSpecs } from '@/lib/customization-utils';
import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';
import { completeW3AssemblyJobForOrder } from '@/lib/workflow-jobs';
import {
  buildManifestKeyCandidates,
  buildManifestKeyHintOptionsFromOrderLike,
  extractManifestKey,
} from '@/lib/order-paths';

// Force dynamic rendering - this route should never be statically generated
export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  orderId: z.string().min(1),
  manifestUrl: z.string().url().or(z.string().min(1)),
});

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  try {
    /**
     * Resilient update: some environments don't have `final_cover_url` (they may use `cover_image_url`).
     * Attempt update, and if PostgREST says a column doesn't exist (PGRST204/42703), drop it and retry.
     */
    const parseMissingColumn = (err: unknown): string | null => {
      const record = err && typeof err === 'object' ? (err as Record<string, unknown>) : {};
      const details = String(record.details || record.message || '');
      const m = details.match(/Could not find the '([^']+)' column/i) || details.match(/'([^']+)'\s+column/i);
      return m?.[1] ? String(m[1]) : null;
    };

    const updateOrderRowResilient = async (orderId: string, updateData: Record<string, unknown>) => {
      const dataToUpdate: Record<string, unknown> = { ...updateData };
      let lastError: unknown = null;

      for (let i = 0; i < 6; i++) {
        // Purpose: update by per-book identity (orderId), not amazon_order_id (which can be a group key).
        const attempt1 = await supabase
          .from('orders')
          .update(dataToUpdate as never)
          .eq('orderId', orderId)
          .select('id');
        const { data, error } =
          attempt1.error?.code === '42703'
            ? await supabase.from('orders').update(dataToUpdate as never).eq('order_id', orderId).select('id')
            : attempt1;

        if (!error) {
          if (!data || data.length === 0) throw new Error(`Order not found for update: ${orderId}`);
          return;
        }

        lastError = error;
        const code = String(error?.code || '');
        const missingCol = (code === 'PGRST204' || code === '42703') ? parseMissingColumn(error) : null;
        if (!missingCol || !(missingCol in dataToUpdate)) throw error;

        delete dataToUpdate[missingCol];
      }

      throw lastError || new Error('Failed to update order (unknown error)');
    };

    const json = await request.json();
    const payload = PayloadSchema.parse(json);

    const currentOrder = await getOrderFromSupabase(payload.orderId).catch(() => null);
    const orderHints = buildManifestKeyHintOptionsFromOrderLike(currentOrder);
    const payloadManifestKey = extractManifestKey(payload.manifestUrl);
    const manifestKeyCandidates = buildManifestKeyCandidates(payload.orderId, '3', {
      ...orderHints,
      pathLikes: [payload.manifestUrl, ...(orderHints.pathLikes ?? [])],
    });
    const manifestKeys = [
      payloadManifestKey,
      ...manifestKeyCandidates,
    ].filter((value, index, values): value is string => !!value && values.indexOf(value) === index);

    if (payloadManifestKey && !manifestKeyCandidates.includes(payloadManifestKey)) {
      throw new Error(
        `workflow-3-complete: manifestUrl does not match expected per-item manifest keys (${payloadManifestKey})`,
      );
    }

    let manifest: Record<string, unknown> | null = null;
    for (const manifestKey of manifestKeys) {
      try {
        manifest = await downloadManifest(manifestKey);
        break;
      } catch (error) {
        if (manifestKey === manifestKeys[manifestKeys.length - 1]) {
          throw error;
        }
      }
    }

    if (manifest && manifest.characterSpecs) {
      manifest.characterSpecs = normalizeCharacterSpecs(manifest.characterSpecs);
    }

    // Extract final book URL from manifest
    const finalBookUrl = manifest?.finalBookUrl || manifest?.bookUrl || manifest?.order?.finalBookUrl || null;
    const finalCoverUrl = manifest?.finalCoverUrl || manifest?.coverUrl || manifest?.order?.finalCoverUrl || null;

    // Update Supabase with workflow completion
    // CRITICAL: Reset execution_status when workflow completes
    // Workflow 3 doesn't require review, so set to 'done' (workflow complete, not processing anymore)
    const nowIso = new Date().toISOString();
    await updateOrderRowResilient(payload.orderId, {
      workflow_step: 'book_assembly_completed',
      manifest_3_url: payload.manifestUrl,
      final_book_url: finalBookUrl,
      // Some schemas use `cover_image_url` instead of `final_cover_url`
      final_cover_url: finalCoverUrl,
      cover_image_url: finalCoverUrl,
      execution_status: 'done',
      started_at: null,
      current_workflow: null,
      updated_at: nowIso,
    });

    try {
      const manifestPages = Array.isArray(manifest?.pagePreviewImages)
        ? manifest.pagePreviewImages.length
        : Array.isArray(manifest?.pages)
          ? manifest.pages.length
          : Array.isArray(manifest?.interiorPages)
            ? manifest.interiorPages.length
            : null;
      const manifestExpectedPages =
        typeof manifest?.totalPagesRequired === 'number' && Number.isFinite(manifest.totalPagesRequired)
          ? manifest.totalPagesRequired
          : typeof manifest?.pagesGenerated === 'number' && Number.isFinite(manifest.pagesGenerated)
            ? manifest.pagesGenerated
            : manifestPages;
      const manifestAssemblyProgress =
        typeof manifest?.assemblyProgress === 'number' && Number.isFinite(manifest.assemblyProgress)
          ? manifest.assemblyProgress
          : manifestPages && manifestExpectedPages
            ? Math.round((manifestPages / manifestExpectedPages) * 100) / 100
            : null;

      await completeW3AssemblyJobForOrder({
        orderId: payload.orderId,
        manifestUrl: payload.manifestUrl,
        manifestKey: payloadManifestKey,
        finalBookUrl,
        finalCoverUrl,
        pagesGenerated: manifestPages,
        totalPagesRequired: manifestExpectedPages,
        assemblyProgress: manifestAssemblyProgress,
      });
    } catch (workflowJobError) {
      console.warn(
        `[workflow-3-complete] Non-fatal: failed to mark W3 workflow job complete for ${payload.orderId}:`,
        workflowJobError,
      );
    }

    return NextResponse.json({ success: true, orderId: payload.orderId, stage: '3', manifestLoaded: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
