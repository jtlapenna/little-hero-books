import { NextRequest, NextResponse } from 'next/server';
import { headObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { buildManifestKey } from '@/lib/r2-service';
import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';
import { WorkflowStep } from '@/constants/statuses';
import { determineNextWorkflow, type OrderProgress } from '@/lib/determine-next-workflow';

export const dynamic = 'force-dynamic';

// PSEUDOCODE
// - Only allow same-origin (admin UI) calls
// - Detect highest manifest present in R2 (HEAD requests; no downloads)
// - Update workflow_step, next_workflow, execution_status (and clear started_at/current_workflow) so UI columns match
// - next_workflow is derived from determineNextWorkflow so e.g. "pending customer approval" stays at next_workflow '3'
// - Do not change customer approval, review stages, or manifest URL fields

function isSameOrigin(request: NextRequest): boolean {
  // Purpose: keep this admin-only endpoint without extra auth wiring.
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  return (
    !origin ||
    origin.includes(siteUrl) ||
    referer?.includes(siteUrl) ||
    origin.includes('littleherolabs.com') ||
    referer?.includes('littleherolabs.com')
  );
}

async function manifestExists(orderId: string, stage: '2a' | '2b' | '3'): Promise<boolean> {
  // Purpose: existence check without pulling full object body.
  const key = buildManifestKey(orderId, stage);
  const resp = await headObject(R2_ORDERS_BUCKET, key);
  return resp.ok;
}

function computeWorkflowStepFromManifests(found: { m3: boolean; m2b: boolean; m2a: boolean }): WorkflowStep | null {
  // Purpose: map the highest known manifest to a workflow_step value used by status routing.
  if (found.m3) return WorkflowStep.BOOK_ASSEMBLY_COMPLETED;
  if (found.m2b) return WorkflowStep.BRIA_PROCESSING_COMPLETE;
  if (found.m2a) return WorkflowStep.W2A_COMPLETE;
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orderId: rawOrderId } = await params;
  const orderId = String(rawOrderId || '').trim();
  if (!orderId) return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });

  const orderRow = await getOrderFromSupabase(orderId).catch(() => null);
  if (!orderRow) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const found = {
    m3: await manifestExists(orderId, '3').catch(() => false),
    m2b: await manifestExists(orderId, '2b').catch(() => false),
    m2a: await manifestExists(orderId, '2a').catch(() => false),
  };

  const nextStep = computeWorkflowStepFromManifests(found);
  if (!nextStep) {
    return NextResponse.json(
      { error: 'No manifests found to infer workflow_step', details: found },
      { status: 400 }
    );
  }

  const orderRowId = Number((orderRow as any).id);
  if (!Number.isFinite(orderRowId)) {
    return NextResponse.json({ error: 'Order row is missing numeric id' }, { status: 500 });
  }

  const prev = String((orderRow as any).workflow_step || '');
  const nowIso = new Date().toISOString();

  // Derive next_workflow so workflow/status/next-workflow columns display correctly (e.g. pending customer approval → '3')
  const row = orderRow as Record<string, unknown>;
  const next_workflow = determineNextWorkflow({
    one_manifest_url: row.one_manifest_url ?? null,
    manifest_2a_url: row.manifest_2a_url ?? null,
    manifest_2b_url: row.manifest_2b_url ?? null,
    manifest_3_url: found.m3 ? (row.manifest_3_url || 'repaired') : (row.manifest_3_url ?? null),
    workflow_step: nextStep,
    review_stages: (row.review_stages as OrderProgress['review_stages']) ?? null,
    next_workflow: row.next_workflow ?? null,
    customer_approval_required: row.customer_approval_required ?? null,
    customer_approval_status: row.customer_approval_status ?? null,
  });

  const updatePayload: Record<string, unknown> = {
    workflow_step: nextStep,
    execution_status: 'done',
    started_at: null,
    current_workflow: null,
    updated_at: nowIso,
  };
  if (next_workflow != null) updatePayload.next_workflow = next_workflow;

  const { data, error } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', orderRowId)
    .select('id, workflow_step, next_workflow, execution_status');

  if (error) {
    return NextResponse.json(
      { error: 'Failed to update workflow state', details: error.message, code: error.code, hint: error.hint },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    orderId,
    previousWorkflowStep: prev || null,
    repairedWorkflowStep: nextStep,
    next_workflow: next_workflow ?? undefined,
    execution_status: 'done',
    detected: found,
    updated: data?.[0] || null,
  });
}

