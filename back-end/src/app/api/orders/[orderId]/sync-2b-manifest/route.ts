import { NextRequest, NextResponse } from 'next/server';
import { downloadManifest, getCharacterAssets } from '@/lib/r2-service';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import {
  buildBgRemovedAssetMap,
  read2BManifestWithPoseRequirements,
  sync2BManifestEntries,
} from '@/lib/books';
import {
  buildManifestKeyCandidates,
  buildManifestKeyHintOptionsFromOrderLike,
} from '@/lib/order-paths';

/**
 * Sync/repair a 2B manifest using the current R2 inventory.
 *
 * Use case:
 * - Background-removed images (2B) were uploaded/replaced manually (or otherwise exist in R2),
 *   but `2b-manifest.json` is missing `bgRemovedKey` for some poses.
 * - W3 relies on `bgRemovedKey` to assemble sprites onto backgrounds.
 *
 * POST /api/orders/[orderId]/sync-2b-manifest
 *
 * Behavior:
 * - Loads `2b-manifest.json`
 * - Lists character assets from R2 (public bucket) for the manifest's characterHash
 * - Backfills missing `bgRemovedKey` for the current manifest pose set, while using
 *   W0 pose requirements when available
 * - Writes the manifest back to R2 if changes were made
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId: rawOrderId } = await params;
  const orderId = String(rawOrderId || '').trim();
  if (!orderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
  }

  const currentOrder = await getOrderFromSupabase(orderId).catch(() => null);
  const manifestHints = buildManifestKeyHintOptionsFromOrderLike(currentOrder);
  const manifest2bKeys = buildManifestKeyCandidates(orderId, '2b', manifestHints);
  let manifest2bKey = manifest2bKeys[0] ?? '';
  let manifest2b: unknown = null;

  for (const candidateKey of manifest2bKeys) {
    const candidateManifest = await downloadManifest(candidateKey).catch(() => null);
    if (candidateManifest) {
      manifest2bKey = candidateKey;
      manifest2b = candidateManifest;
      break;
    }
  }

  if (!manifest2b) {
    return NextResponse.json(
      {
        error: '2B manifest not found or invalid',
        details: `Could not load ${manifest2bKey} or required fields were missing`,
      },
      { status: 404 }
    );
  }

  const manifestSnapshot = await read2BManifestWithPoseRequirements({
    manifest: manifest2b,
    orderId,
    loadManifest: downloadManifest,
  }).catch(() => null);
  if (!manifestSnapshot) {
    return NextResponse.json(
      {
        error: '2B manifest not found or invalid',
        details: `Could not parse ${manifest2bKey} or required fields were missing`,
      },
      { status: 404 }
    );
  }

  const { characterHash } = manifestSnapshot;

  if (!characterHash) {
    return NextResponse.json(
      { error: 'Cannot sync 2B manifest: characterHash not found' },
      { status: 400 }
    );
  }

  const assets = await getCharacterAssets(characterHash).catch(() => []);
  const bgRemovedByPose = buildBgRemovedAssetMap(assets);
  const nowIso = new Date().toISOString();
  const r2PoseNumbers = Array.from(bgRemovedByPose.keys()).sort((a, b) => a - b);
  const poseNumbersToSync = Array.from(
    new Set([
      ...manifestSnapshot.availablePoseNumbers,
      ...manifestSnapshot.requiredPoseNumbers,
    ]),
  ).sort((left, right) => left - right);
  const {
    updatedPoseNumbers,
    missingPoseNumbers: stillMissingPoseNumbers,
    touched,
  } = sync2BManifestEntries({
    entryByPoseNumber: manifestSnapshot.entryByPoseNumber,
    poseNumbers: poseNumbersToSync,
    bgRemovedByPose,
    nowIso,
    trackMissingEntries: false,
    ensureBgRemovedPublicUrlField: true,
  });

  if (touched) {
    manifestSnapshot.manifest.updatedAt = nowIso;
    manifestSnapshot.manifest.runStamp = nowIso;
    await putObject(
      R2_ORDERS_BUCKET,
      manifest2bKey,
      JSON.stringify(manifestSnapshot.manifest, null, 2),
      'application/json'
    );
  }

  return NextResponse.json({
    success: true,
    orderId,
    manifest2bKey,
    characterHash,
    requiredPoseNumbers: manifestSnapshot.requiredPoseNumbers,
    requiredPoseSource: manifestSnapshot.requiredPoseSource,
    updatedPoseNumbers,
    stillMissingPoseNumbers,
    r2PoseNumbers,
    message:
      updatedPoseNumbers.length > 0
        ? '2B manifest updated from R2 inventory.'
        : stillMissingPoseNumbers.length > 0
          ? `No new updates; R2 has poses ${r2PoseNumbers.join(', ')}. Missing in R2 or manifest: ${stillMissingPoseNumbers.join(', ')}.`
          : 'No changes needed; 2B manifest already had bgRemovedKey populated for these poses.',
  });
}
