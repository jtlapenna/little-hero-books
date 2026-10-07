import { downloadManifest } from '@/lib/r2-service';
import { buildManifestKeyFromOrderPrefix, buildPoseReferenceAssetKey } from '@/lib/order-paths';
import { loadBundledBookConfig } from './load-book-config';
import { normalizeW0Manifest, type NormalizedW0Manifest } from './normalize-w0-manifest';
import { snapshotPoseReferenceKeys } from './book-render-recipe';

export function frozenPoseReferenceKeys(manifest?: NormalizedW0Manifest | null): Record<string, string> | undefined {
  if (!manifest?.renderSnapshot) return undefined;
  const keys = snapshotPoseReferenceKeys(manifest.renderSnapshot);
  keys['0'] ??= `${manifest.renderSnapshot.bookConfig.assets.poses.basePath}/pose00.png`;
  return Object.fromEntries([0, ...manifest.requiredPoseNumbers].map(n => [String(n), keys[String(n)]]));
}
export async function readOrderPoseContext(input: { bookId: string; orderPrefix: string }, loadManifest: (key: string) => Promise<unknown | null> = downloadManifest) {
  let raw: unknown;
  try { raw = await loadManifest(buildManifestKeyFromOrderPrefix(input.orderPrefix, '1')); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/404|not found/i.test(message)) throw error;
    raw = null;
  }
  const normalized = raw ? normalizeW0Manifest(raw, { fallbackManifestKey: buildManifestKeyFromOrderPrefix(input.orderPrefix, '1') }) : null;
  if (normalized?.renderSnapshot) {
    if (normalized.bookId !== input.bookId) throw new Error('Frozen pose reference book identity mismatch');
    return { allowed: [0, ...normalized.requiredPoseNumbers], referenceKeys: frozenPoseReferenceKeys(normalized)! };
  }
  if (normalized?.bookId && normalized.bookId !== input.bookId) throw new Error('Frozen pose reference book identity mismatch');
  const legacy = hasLegacyPoseProvenance(input.bookId, normalized);
  if (!legacy) throw new Error('Configured order has no frozen pose references');
  const allowed = Array.from({ length: 13 }, (_, i) => i);
  return { allowed, referenceKeys: Object.fromEntries(allowed.map(n => [String(n), buildPoseReferenceAssetKey(input.bookId, n)])) };
}

export function orderReviewPoseNumbers(input: { frozen?: NormalizedW0Manifest | null; legacyCount: number }): number[] {
  return input.frozen?.renderSnapshot ? [0, ...input.frozen.requiredPoseNumbers] : Array.from({ length: input.legacyCount }, (_, i) => i);
}

export function hasLegacyPoseProvenance(bookId: string | null, manifest?: NormalizedW0Manifest | null): boolean {
  if (!bookId || manifest?.renderSnapshot || (manifest?.bookId && manifest.bookId !== bookId)) return false;
  try { return !loadBundledBookConfig({ bookId }).rendering.recipe; }
  catch { return !!manifest && manifest.bookId === bookId && ['lhb.run-manifest@v2', 'lhb.run-manifest@v2.0', 'lhb.run-manifest@v3'].includes(manifest.schema ?? ''); }
}
