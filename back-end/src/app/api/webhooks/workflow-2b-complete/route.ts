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
  characterHash: z.string().min(1).optional(),
  posesProcessed: z.number().int().optional(),
  posesSucceeded: z.number().int().optional(),
  posesFailed: z.number().int().optional(),
  needsReview: z.boolean().optional(),
  errors: z.array(z.any()).optional(),
});

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  try {
    const json = await request.json();
    const payload = PayloadSchema.parse(json);

    // Download manifest from R2
           const manifest: any = await downloadManifest(buildManifestKey(payload.orderId, '2b'));
           if (manifest && manifest.characterSpecs) {
             manifest.characterSpecs = normalizeCharacterSpecs(manifest.characterSpecs);
           }

    // Update Supabase with workflow completion
    // CRITICAL: Reset execution_status when workflow completes
    // If needsReview is true, keep 'processing' (wait for approval)
    // If needsReview is false, set to 'done' (workflow complete, not processing anymore)
    await updateOrderStatus(payload.orderId, {
      workflow_step: 'bria_processing_complete',
      manifest_2b_url: payload.manifestUrl,
      execution_status: payload.needsReview ? 'processing' : 'done',
      started_at: null, // Clear processing timestamp
      current_workflow: null, // Clear current workflow
      // Status will be recalculated automatically by updateOrderStatus
    });

    return NextResponse.json({ success: true, orderId: payload.orderId, stage: '2b', manifestLoaded: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}


