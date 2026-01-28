import { NextRequest, NextResponse } from 'next/server';
import { buildManifestKey, downloadManifest, getCharacterAssets } from '@/lib/r2-service';
import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';

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
 * - Backfills missing `bgRemovedKey` for story poses 1..12 when a matching bg-removed asset exists
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

  const manifest2bKey = buildManifestKey(orderId, '2b');
  const manifest2b = await downloadManifest(manifest2bKey).catch(() => null);

  if (!manifest2b || !Array.isArray(manifest2b.entries)) {
    return NextResponse.json(
      {
        error: '2B manifest not found or invalid',
        details: `Could not load ${manifest2bKey} or required fields were missing`,
      },
      { status: 404 }
    );
  }

  const characterHash: string | null =
    (manifest2b.characterHash as string | null) ||
    (manifest2b.order?.characterHash as string | null) ||
    null;

  if (!characterHash) {
    return NextResponse.json(
      { error: 'Cannot sync 2B manifest: characterHash not found' },
      { status: 400 }
    );
  }

  // Build poseNumber -> bg-removed key map from R2 inventory.
  // Note: getCharacterAssets returns URLs like "/api/assets/<r2Key>".
  const assets = await getCharacterAssets(characterHash).catch(() => []);
  const bgRemovedByPose = new Map<number, string>();
  for (const a of assets) {
    if (a.assetType !== 'background-removed') continue;
    const url = String(a.url || '');
    const key = url.startsWith('/api/assets/') ? url.replace(/^\/api\/assets\//, '') : null;
    if (!key) continue;
    const pn = Number(a.poseNumber);
    if (!Number.isFinite(pn)) continue;
    bgRemovedByPose.set(pn, key);
  }

  const updatedPoseNumbers: number[] = [];
  const stillMissingPoseNumbers: number[] = [];
  const nowIso = new Date().toISOString();

  // Only enforce story poses 1..12.
  for (let poseNum = 1; poseNum <= 12; poseNum++) {
    const entry = manifest2b.entries.find((e: any) => Number(e?.poseNumber) === poseNum);
    if (!entry) continue;

    const hasKey = typeof entry.bgRemovedKey === 'string' && entry.bgRemovedKey.length > 0;
    if (hasKey) continue;

    const foundKey = bgRemovedByPose.get(poseNum);
    if (foundKey) {
      entry.bgRemovedKey = foundKey;
      entry.bgRemoved = true;
      entry.bgRemovedStatus = entry.bgRemovedStatus || 'completed';
      entry.processedAt = entry.processedAt || nowIso;
      if (!('bgRemovedImageUrl' in entry)) entry.bgRemovedImageUrl = null;
      if (!('bgRemovedPublicUrl' in entry)) entry.bgRemovedPublicUrl = null;
      updatedPoseNumbers.push(poseNum);
    } else {
      stillMissingPoseNumbers.push(poseNum);
    }
  }

  if (updatedPoseNumbers.length > 0) {
    manifest2b.updatedAt = nowIso;
    manifest2b.runStamp = nowIso;
    await putObject(
      R2_ORDERS_BUCKET,
      manifest2bKey,
      JSON.stringify(manifest2b, null, 2),
      'application/json'
    );
  }

  return NextResponse.json({
    success: true,
    orderId,
    manifest2bKey,
    characterHash,
    updatedPoseNumbers,
    stillMissingPoseNumbers,
    message:
      updatedPoseNumbers.length > 0
        ? '2B manifest updated from R2 inventory.'
        : 'No changes needed; 2B manifest already had bgRemovedKey populated for these poses.',
  });
}

