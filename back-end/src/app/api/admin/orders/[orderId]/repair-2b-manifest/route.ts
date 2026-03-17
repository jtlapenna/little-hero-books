import { NextRequest, NextResponse } from 'next/server';
import { downloadManifest, getCharacterAssets } from '@/lib/r2-service';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { determineNextWorkflow, type OrderProgress } from '@/lib/determine-next-workflow';
import { getOrderFromSupabase, updateOrderInSupabase } from '@/lib/supabase-client';
import {
  buildBgRemovedAssetMap,
  read2BManifestWithPoseRequirements,
  sync2BManifestEntries,
  type TwoBManifestEntry,
} from '@/lib/books';
import { buildManifestKeyCandidates } from '@/lib/order-paths';

export const dynamic = 'force-dynamic';

type RepairOrderRow = OrderProgress & {
  one_manifest_url?: string | null;
  manifest_2a_url?: string | null;
  manifest_3_url?: string | null;
};

type RepairManifestEntry = TwoBManifestEntry & {
  approved?: unknown;
  status?: unknown;
  briaStatus?: unknown;
  bgRemovedStatus?: unknown;
  sourceApprovedKey?: unknown;
};

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
    !!referer?.includes(siteUrl) ||
    origin.includes('littleherolabs.com') ||
    !!referer?.includes('littleherolabs.com')
  );
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

  const orderRow = (await getOrderFromSupabase(orderIdValue).catch(() => null)) as RepairOrderRow | null;

  // Purpose: Repair requires a valid 2A manifest to base off.
  const manifest2aKey =
    buildManifestKeyCandidates(orderIdValue, '2a', {
      pathLikes: [orderRow?.manifest_2a_url, orderRow?.one_manifest_url],
    })[0];
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
  const bgRemovedByPose = buildBgRemovedAssetMap(assets);
  const now = new Date().toISOString();
  const manifestSnapshot = await read2BManifestWithPoseRequirements({
    manifest: {
      ...m2a,
      stage: '2b',
      runStamp: now,
      createdAt: m2a.createdAt || now,
      updatedAt: now,
      generatedAt: now,
      orderId: orderIdValue,
      amazonOrderId: orderIdValue,
      entries: m2a.entries.map((entry: TwoBManifestEntry) => ({
        ...entry,
        sourceApprovedKey: entry.sourceApprovedKey || entry.approvedKey || null,
        bgRemovedImageUrl: entry.bgRemovedImageUrl ?? null,
        bgRemovedPublicUrl: entry.bgRemovedPublicUrl ?? null,
        processedAt: entry.processedAt ?? null,
      })),
    },
    orderId: orderIdValue,
    loadManifest: downloadManifest,
  });
  sync2BManifestEntries({
    entryByPoseNumber: manifestSnapshot.entryByPoseNumber,
    poseNumbers: [
      ...new Set([
        ...manifestSnapshot.availablePoseNumbers,
        ...manifestSnapshot.requiredPoseNumbers,
      ]),
    ],
    bgRemovedByPose,
    nowIso: now,
    trackMissingEntries: false,
    ensureBgRemovedPublicUrlField: true,
  });

  const entries: RepairManifestEntry[] = manifestSnapshot.entries.map((entry) => {
    const hasBgRemoved =
      typeof entry.bgRemovedKey === 'string' && entry.bgRemovedKey.trim().length > 0;

    return {
      ...entry,
      briaStatus: hasBgRemoved ? 'completed' : (entry.briaStatus ?? null),
      bgRemoved: hasBgRemoved,
      bgRemovedStatus: hasBgRemoved ? 'completed' : (entry.bgRemovedStatus ?? null),
      sourceApprovedKey: entry.sourceApprovedKey || entry.approvedKey || null,
      bgRemovedImageUrl: entry.bgRemovedImageUrl ?? null,
      bgRemovedPublicUrl: entry.bgRemovedPublicUrl ?? null,
      processedAt: hasBgRemoved ? (entry.processedAt || now) : (entry.processedAt ?? null),
    };
  });

  // Require all helper-resolved poses to have bgRemovedKey before uploading (W3 must not use 2A fallback)
  const missingRequiredPoses = manifestSnapshot.requiredPoseNumbers.filter((poseNum) => {
    const entry = entries.find((candidate) => Number(candidate.poseNumber) === poseNum);
    return !entry || typeof entry.bgRemovedKey !== 'string' || !entry.bgRemovedKey.trim();
  });
  if (missingRequiredPoses.length > 0) {
    return NextResponse.json(
      {
        error: 'Cannot repair: 2B manifest would be incomplete',
        details: 'The required poses for this book/format have no bg-removed image in R2. Re-run workflow 2B to process all required poses, then call repair again.',
        missingRequiredPoses,
        requiredPoseNumbers: manifestSnapshot.requiredPoseNumbers,
        requiredPoseSource: manifestSnapshot.requiredPoseSource,
        r2PoseNumbers: Array.from(bgRemovedByPose.keys()).sort((a, b) => a - b),
      },
      { status: 400 }
    );
  }

  const approvedCount = entries.filter((entry) => entry.approved === true && entry.status === 'approved').length;
  const terminalCount = entries.filter((entry) => String(entry.briaStatus || '').toLowerCase() === 'completed').length;

  const repaired = {
    ...manifestSnapshot.manifest,
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

  const manifest2bKey =
    buildManifestKeyCandidates(orderIdValue, '2b', {
      pathLikes: [orderRow?.manifest_2a_url, orderRow?.one_manifest_url],
    })[0];
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
  const nextWorkflow = determineNextWorkflow({
    one_manifest_url: orderRow?.one_manifest_url || null,
    manifest_2a_url: orderRow?.manifest_2a_url || manifest2aKey,
    manifest_2b_url: manifest2bKey,
    manifest_3_url: orderRow?.manifest_3_url || null,
    workflow_step: orderRow?.workflow_step || null,
    review_stages: orderRow?.review_stages || null,
    next_workflow: orderRow?.next_workflow || null,
    customer_approval_required: orderRow?.customer_approval_required ?? undefined,
    customer_approval_status: orderRow?.customer_approval_status ?? undefined,
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
    requiredPoseNumbers: manifestSnapshot.requiredPoseNumbers,
    requiredPoseSource: manifestSnapshot.requiredPoseSource,
    r2PoseNumbers,
    message: 'Repaired 2B manifest uploaded; order re-queued for next workflow.',
  });
}
