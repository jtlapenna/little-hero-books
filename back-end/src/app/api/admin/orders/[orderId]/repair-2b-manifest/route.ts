import { NextRequest, NextResponse } from 'next/server';
import { downloadManifest, buildManifestKey, getCharacterAssets } from '@/lib/r2-service';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { determineNextWorkflow } from '@/lib/determine-next-workflow';
import { supabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

// PSEUDOCODE
// - Read 2A manifest for order (source of poseNumbers + approvedKey).
// - Build a repaired 2B manifest that sets bgRemovedKey for every pose using canonical naming.
// - Mark all entries briaStatus='completed' (best-effort), update summary.
// - Upload repaired manifest to R2 at the canonical 2B manifest key.
// - Update Supabase pointers (manifest_2b_url/workflow_step/next_workflow) for routing.

function isSameOrigin(request: NextRequest): boolean {
  // Purpose: Keep this as an admin-only endpoint without needing extra auth wiring.
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

function poseNobgKey(characterHash: string, poseNumber: number): string {
  // Purpose: Canonical R2 key for BRIA no-bg sprites.
  const pn = String(poseNumber).padStart(2, '0');
  return `book-mvp-simple-adventure/order-generated-assets/characters/${characterHash}/characters_${characterHash}_pose${pn}_nobg.png`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orderId } = await params;
  const orderIdValue = String(orderId || '').trim();
  if (!orderIdValue) {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
  }

  // Purpose: Repair requires a valid 2A manifest to base off.
  const manifest2aKey = buildManifestKey(orderIdValue, '2a');
  const m2a = await downloadManifest(manifest2aKey).catch(() => null);
  if (!m2a?.schema || !Array.isArray(m2a.entries) || !m2a.characterHash) {
    return NextResponse.json(
      {
        error: 'Missing/invalid 2A manifest',
        details: `Could not load ${manifest2aKey} or required fields were missing`,
      },
      { status: 400 }
    );
  }

  const characterHash: string = String(m2a.characterHash);

  // Prefer R2 inventory keys when available so manifest matches what's actually in R2
  // (fixes Pose 11 "Image not found" when 2B wrote a different key or aggregation missed it)
  const assets = await getCharacterAssets(characterHash).catch(() => []);
  const bgRemovedByPose = new Map<number, string>();
  for (const a of assets) {
    if (a.assetType !== 'background-removed') continue;
    const url = String(a.url || '');
    const key = url.startsWith('/api/assets/') ? url.replace(/^\/api\/assets\//, '') : null;
    if (!key || !Number.isFinite(Number(a.poseNumber))) continue;
    bgRemovedByPose.set(Number(a.poseNumber), key);
  }

  const entries = m2a.entries.map((e: any) => {
    const poseNumber = Number(e?.poseNumber);
    if (!Number.isFinite(poseNumber)) return e;

    const r2Key = bgRemovedByPose.get(poseNumber);
    const keyToUse = r2Key || poseNobgKey(characterHash, poseNumber);

    return {
      ...e,
      briaStatus: 'completed',
      bgRemoved: true,
      bgRemovedStatus: 'completed',
      sourceApprovedKey: e.sourceApprovedKey || e.approvedKey || null,
      bgRemovedKey: keyToUse,
      bgRemovedImageUrl: e.bgRemovedImageUrl || null,
      processedAt: e.processedAt || new Date().toISOString(),
    };
  });

  const approvedCount = entries.filter((e: any) => e?.approved && e?.status === 'approved').length;
  const terminalCount = entries.filter((e: any) => String(e?.briaStatus || '').toLowerCase() === 'completed').length;

  const now = new Date().toISOString();
  const repaired = {
    ...m2a,
    stage: '2b',
    runStamp: now,
    createdAt: m2a.createdAt || now,
    updatedAt: now,
    orderId: orderIdValue,
    amazonOrderId: orderIdValue,
    entries,
    summary: {
      ...(m2a.summary || {}),
      percentComplete: 100,
      approvedPoseCount: approvedCount,
      terminalPoseCount: terminalCount,
      complete: approvedCount > 0 && terminalCount >= approvedCount,
      needsHumanReview: false,
      readyForBook: true,
    },
    workflow: {
      ...(m2a.workflow || {}),
      currentStage: '2B-complete',
      nextWorkflow: '3',
      requiresHumanReview: false,
    },
    generatedAt: now,
  };

  const manifest2bKey = buildManifestKey(orderIdValue, '2b');
  const ok = await putObject(
    R2_ORDERS_BUCKET,
    manifest2bKey,
    JSON.stringify(repaired, null, 2),
    'application/json'
  );
  if (!ok.ok) {
    const body = await ok.text().catch(() => '');
    return NextResponse.json(
      { error: 'Failed to upload repaired 2B manifest', details: `${ok.status} ${ok.statusText} ${body}`.trim() },
      { status: 500 }
    );
  }

  // Purpose: Ensure router/W3 can progress using Supabase as source of truth.
  const { data: orderRow } = await supabase
    .from('orders')
    .select('one_manifest_url, manifest_2a_url, manifest_2b_url, manifest_3_url, workflow_step, review_stages, next_workflow')
    .eq('amazon_order_id', orderIdValue)
    .single();

  const nextWorkflow = determineNextWorkflow({
    one_manifest_url: orderRow?.one_manifest_url || null,
    manifest_2a_url: orderRow?.manifest_2a_url || manifest2aKey,
    manifest_2b_url: manifest2bKey,
    manifest_3_url: orderRow?.manifest_3_url || null,
    workflow_step: orderRow?.workflow_step || null,
    review_stages: (orderRow?.review_stages as any) || null,
    next_workflow: orderRow?.next_workflow || null,
  });

  await supabase
    .from('orders')
    .update({
      manifest_2b_url: manifest2bKey,
      workflow_step: '2B-complete',
      execution_status: 'ready_for_processing',
      next_workflow: nextWorkflow || '3',
      current_workflow: null,
      started_at: null,
      queued_at: now,
      updated_at: now,
    })
    .eq('amazon_order_id', orderIdValue);

  const r2PoseNumbers = Array.from(bgRemovedByPose.keys()).sort((a, b) => a - b);

  return NextResponse.json({
    success: true,
    orderId: orderIdValue,
    manifest2bKey,
    entriesUpdated: entries.length,
    r2PoseNumbers,
    message: 'Repaired 2B manifest uploaded; order re-queued for next workflow.',
  });
}

