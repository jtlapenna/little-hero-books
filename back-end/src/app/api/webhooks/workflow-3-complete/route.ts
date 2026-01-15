import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { normalizeCharacterSpecs } from '@/lib/customization-utils';
import { supabase } from '@/lib/supabase-client';

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
    const parseMissingColumn = (err: any): string | null => {
      const details = String(err?.details || err?.message || '');
      const m = details.match(/Could not find the '([^']+)' column/i) || details.match(/'([^']+)'\s+column/i);
      return m?.[1] ? String(m[1]) : null;
    };

    const updateOrderRowResilient = async (amazonOrderId: string, updateData: Record<string, unknown>) => {
      const dataToUpdate: Record<string, unknown> = { ...updateData };
      let lastError: any = null;

      for (let i = 0; i < 6; i++) {
        const { data, error } = await supabase
          .from('orders')
          .update(dataToUpdate)
          .eq('amazon_order_id', amazonOrderId)
          .select('id');

        if (!error) {
          if (!data || data.length === 0) throw new Error(`Order not found for update: ${amazonOrderId}`);
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

    // Download manifest from R2
           const manifest: any = await downloadManifest(buildManifestKey(payload.orderId, '3'));
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

    return NextResponse.json({ success: true, orderId: payload.orderId, stage: '3', manifestLoaded: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}


