import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { normalizeCharacterSpecs } from '@/lib/customization-utils';
import { updateOrderStatus } from '@/lib/status-service';

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
    await updateOrderStatus(payload.orderId, {
      workflow_step: 'book_assembly_completed',
      manifest_3_url: payload.manifestUrl,
      final_book_url: finalBookUrl,
      final_cover_url: finalCoverUrl,
      execution_status: 'done', // Workflow complete, not processing anymore
      started_at: null, // Clear processing timestamp
      current_workflow: null, // Clear current workflow
      // Status will be recalculated automatically by updateOrderStatus
    });

    return NextResponse.json({ success: true, orderId: payload.orderId, stage: '3', manifestLoaded: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}


