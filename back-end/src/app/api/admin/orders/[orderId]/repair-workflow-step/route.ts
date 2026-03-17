import { NextRequest, NextResponse } from 'next/server';
import { headObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';
import { WorkflowStep } from '@/constants/statuses';
import { determineNextWorkflow, type OrderProgress } from '@/lib/determine-next-workflow';
import {
  buildManifestKeyCandidates,
  buildManifestKeyHintOptionsFromOrderLike,
} from '@/lib/order-paths';

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
  return !!(
    !origin ||
    origin.includes(siteUrl) ||
    referer?.includes(siteUrl) ||
    origin.includes('littleherolabs.com') ||
    referer?.includes('littleherolabs.com')
  );
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toBooleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

async function manifestExists(manifestKeys: string[]): Promise<boolean> {
  // Purpose: existence check without pulling full object body.
  for (const key of manifestKeys) {
    const resp = await headObject(R2_ORDERS_BUCKET, key);
    if (resp.ok) {
      return true;
    }
  }

  return false;
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
  const manifestHints = buildManifestKeyHintOptionsFromOrderLike(orderRow);

  const found = {
    m3: await manifestExists(buildManifestKeyCandidates(orderId, '3', manifestHints)).catch(() => false),
    m2b: await manifestExists(buildManifestKeyCandidates(orderId, '2b', manifestHints)).catch(() => false),
    m2a: await manifestExists(buildManifestKeyCandidates(orderId, '2a', manifestHints)).catch(() => false),
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
    one_manifest_url: toStringOrNull(row.one_manifest_url),
    manifest_2a_url: toStringOrNull(row.manifest_2a_url),
    manifest_2b_url: toStringOrNull(row.manifest_2b_url),
    manifest_3_url: found.m3 ? (toStringOrNull(row.manifest_3_url) || 'repaired') : toStringOrNull(row.manifest_3_url),
    workflow_step: nextStep,
    review_stages: (row.review_stages as OrderProgress['review_stages']) ?? null,
    next_workflow: toStringOrNull(row.next_workflow),
    customer_approval_required: toBooleanOrNull(row.customer_approval_required),
    customer_approval_status: toStringOrNull(row.customer_approval_status),
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
    .update(updatePayload as never)
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
