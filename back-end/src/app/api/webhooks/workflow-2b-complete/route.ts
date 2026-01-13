import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';
import { normalizeCharacterSpecs } from '@/lib/customization-utils';
import { updateOrderStatus } from '@/lib/status-service';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import { determineNextWorkflow } from '@/lib/determine-next-workflow';
import { ReviewStageStatus } from '@/constants/statuses';

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
    /**
     * Pseudocode (2B completion):
     * - Validate payload
     * - Load existing order (to preserve review_stages + manifest urls)
     * - Merge review_stages:
     *   - keep preBria/postPdf as-is
     *   - set postBria.status to "in-review" unless already approved
     * - Compute next_workflow from true progress (so we don't advance to 3 before postBria approval)
     * - Update Supabase status fields (workflow_step, manifest_2b_url, review_stages, next_workflow, execution_status)
     */
    const json = await request.json();
    const payload = PayloadSchema.parse(json);

    // Download manifest from R2
    const manifest: any = await downloadManifest(buildManifestKey(payload.orderId, '2b'));
    if (manifest && manifest.characterSpecs) {
      manifest.characterSpecs = normalizeCharacterSpecs(manifest.characterSpecs);
    }

    // Load current order state (preserve/merge review_stages)
    const currentOrder = await getOrderFromSupabase(payload.orderId).catch(() => null);
    const existingStages = (currentOrder?.review_stages && typeof currentOrder.review_stages === 'object')
      ? currentOrder.review_stages
      : {};

    const currentPostBriaStatus = String(existingStages?.postBria?.status || '').toLowerCase();
    const postBriaStatus = (currentPostBriaStatus === ReviewStageStatus.APPROVED)
      ? ReviewStageStatus.APPROVED
      : ReviewStageStatus.IN_REVIEW;

    const review_stages = {
      ...existingStages,
      postBria: {
        ...(existingStages?.postBria || {}),
        status: postBriaStatus,
      },
    };

    const next_workflow = determineNextWorkflow({
      one_manifest_url: currentOrder?.one_manifest_url ?? null,
      manifest_2a_url: currentOrder?.manifest_2a_url ?? null,
      manifest_2b_url: payload.manifestUrl,
      manifest_3_url: currentOrder?.manifest_3_url ?? null,
      workflow_step: currentOrder?.workflow_step ?? null,
      review_stages,
      next_workflow: currentOrder?.next_workflow ?? null,
    });

    // Update Supabase with workflow completion
    // CRITICAL: Reset execution_status when workflow completes
    // If needsReview is true, keep 'processing' (wait for approval)
    // If needsReview is false, set to 'done' (workflow complete, not processing anymore)
    await updateOrderStatus(payload.orderId, {
      workflow_step: 'bria_processing_complete',
      manifest_2b_url: payload.manifestUrl,
      review_stages,
      next_workflow,
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


