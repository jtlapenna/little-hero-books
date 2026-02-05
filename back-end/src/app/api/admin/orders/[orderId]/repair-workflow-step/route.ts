import { NextRequest, NextResponse } from 'next/server';
import { headObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { buildManifestKey } from '@/lib/r2-service';
import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';
import { WorkflowStep } from '@/constants/statuses';

export const dynamic = 'force-dynamic';

// PSEUDOCODE
// - Only allow same-origin (admin UI) calls
// - Detect highest manifest present in R2 (HEAD requests; no downloads)
// - Update ONLY workflow_step (and updated_at) on the existing Supabase row
// - Do not change next_workflow, status, customer approval, review stages, or manifests

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

  const { data, error } = await supabase
    .from('orders')
    .update({
      workflow_step: nextStep,
      updated_at: nowIso,
    })
    .eq('id', orderRowId)
    .select('id, workflow_step');

  if (error) {
    return NextResponse.json(
      { error: 'Failed to update workflow_step', details: error.message, code: error.code, hint: error.hint },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    orderId,
    previousWorkflowStep: prev || null,
    repairedWorkflowStep: nextStep,
    detected: found,
    updated: data?.[0] || null,
  });
}

