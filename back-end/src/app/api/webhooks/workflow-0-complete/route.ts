import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { updateOrderStatus } from '@/lib/status-service';
import { determineNextWorkflow } from '@/lib/determine-next-workflow';

export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  orderId: z.string().min(1),
  manifestUrl: z.string().url().or(z.string().min(1)).optional(),
  characterHash: z.string().min(1).optional(),
});

/**
 * POST /api/webhooks/workflow-0-complete
 * 
 * Called by n8n W0 workflow when order intake is complete.
 * Updates order to ready_for_processing with correct next_workflow.
 */
export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  try {
    const json = await request.json();
    const payload = PayloadSchema.parse(json);

    // Determine next workflow based on order progress
    // For W0 completion, next workflow should be '2A' (character generation)
    // But we'll use determineNextWorkflow to be safe in case order has other progress
    const { getOrderFromSupabase } = await import('@/lib/supabase-client');
    const order = await getOrderFromSupabase(payload.orderId).catch(() => null);
    
    let nextWorkflow = '2A'; // Default for W0 completion
    if (order) {
      // Use determineNextWorkflow to calculate based on actual order progress
      const calculated = determineNextWorkflow({
        one_manifest_url: order.one_manifest_url || payload.manifestUrl,
        manifest_2a_url: order.manifest_2a_url,
        manifest_2b_url: order.manifest_2b_url,
        manifest_3_url: order.manifest_3_url,
        workflow_step: order.workflow_step,
        review_stages: order.review_stages,
        next_workflow: order.next_workflow,
        customer_approval_required: (order as any).customer_approval_required ?? undefined,
        customer_approval_status: (order as any).customer_approval_status ?? undefined,
      });
      if (calculated) {
        nextWorkflow = calculated;
      }
    }

    // Update Supabase with workflow completion
    // CRITICAL: Set execution_status to 'ready_for_processing' and next_workflow
    await updateOrderStatus(payload.orderId, {
      workflow_step: 'order_intake',
      one_manifest_url: payload.manifestUrl || undefined,
      execution_status: 'ready_for_processing', // Ready for router to pick up
      next_workflow: nextWorkflow, // Set to '2A' for character generation
      started_at: null, // Clear processing timestamp
      current_workflow: null, // Clear current workflow
      // Status will be recalculated automatically by updateOrderStatus
    });

    return NextResponse.json({ 
      success: true, 
      orderId: payload.orderId, 
      stage: '0', 
      next_workflow: nextWorkflow,
      message: 'Order intake complete, ready for workflow 2A'
    });
  } catch (error: any) {
    console.error('[workflow-0-complete] Error:', error);
    return NextResponse.json({ 
      error: error?.message || 'Internal Server Error',
      details: error?.stack 
    }, { status: 500 });
  }
}

