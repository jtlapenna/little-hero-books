import { NextRequest, NextResponse } from 'next/server';
import { downloadManifest, buildManifestKey, getCharacterAssets } from '@/lib/r2-service';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { determineNextWorkflow } from '@/lib/determine-next-workflow';
import { getOrderFromSupabase, updateOrderInSupabase } from '@/lib/supabase-client';

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
    // Only set bgRemovedKey when we have an actual R2 asset (never invent keys that don't exist)
    const hasBgRemoved = !!r2Key;

    return {
      ...e,
      briaStatus: hasBgRemoved ? 'completed' : (e.briaStatus ?? null),
      bgRemoved: hasBgRemoved,
      bgRemovedStatus: hasBgRemoved ? 'completed' : (e.bgRemovedStatus ?? null),
      sourceApprovedKey: e.sourceApprovedKey || e.approvedKey || null,
      bgRemovedKey: r2Key ?? e.bgRemovedKey ?? null,
      bgRemovedImageUrl: hasBgRemoved ? (e.bgRemovedImageUrl || null) : (e.bgRemovedImageUrl ?? null),
      processedAt: hasBgRemoved ? (e.processedAt || new Date().toISOString()) : (e.processedAt ?? null),
    };
  });

  // Require all story poses (1..12) to have bgRemovedKey before uploading (W3 must not use 2A fallback)
  const storyPoseNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const missingStoryPoses = storyPoseNumbers.filter((poseNum) => {
    const entry = entries.find((e: any) => Number(e?.poseNumber) === poseNum);
    return !entry || typeof entry.bgRemovedKey !== 'string' || !entry.bgRemovedKey.trim();
  });
  if (missingStoryPoses.length > 0) {
    return NextResponse.json(
      {
        error: 'Cannot repair: 2B manifest would be incomplete',
        details: 'The following story poses have no bg-removed image in R2. Re-run workflow 2B to process all poses, then call repair again.',
        missingStoryPoses,
        r2PoseNumbers: Array.from(bgRemovedByPose.keys()).sort((a, b) => a - b),
      },
      { status: 400 }
    );
  }

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
  const orderRow = await getOrderFromSupabase(orderIdValue).catch(() => null);

  const nextWorkflow = determineNextWorkflow({
    one_manifest_url: (orderRow as any)?.one_manifest_url || null,
    manifest_2a_url: (orderRow as any)?.manifest_2a_url || manifest2aKey,
    manifest_2b_url: manifest2bKey,
    manifest_3_url: (orderRow as any)?.manifest_3_url || null,
    workflow_step: (orderRow as any)?.workflow_step || null,
    review_stages: ((orderRow as any)?.review_stages as any) || null,
    next_workflow: (orderRow as any)?.next_workflow || null,
    customer_approval_required: (orderRow as any)?.customer_approval_required ?? undefined,
    customer_approval_status: (orderRow as any)?.customer_approval_status ?? undefined,
  });

  await updateOrderInSupabase(orderIdValue, {
    manifest_2b_url: manifest2bKey,
    workflow_step: '2B-complete',
    execution_status: 'ready_for_processing',
    next_workflow: nextWorkflow || '3',
    current_workflow: null,
    started_at: null,
    queued_at: now,
    updated_at: now,
  });

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

