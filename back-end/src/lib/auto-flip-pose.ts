export type AutoFlipDecisionSource = 'deterministic' | 'gemini';

export type AutoFlipManifestEntry = {
  poseNumber?: number;
  approvedKey?: string;
  approvedFilename?: string;
  approved?: boolean;
  status?: string;
  needsReview?: boolean;
  reviewReason?: string | null;
  briaStatusUrl?: string | null;
  briaRequestId?: string | null;
  briaStatus?: string | null;
  publicUrl?: string;
  replacedAt?: string;
  replacementCount?: number;
  replacedBy?: string | null;
  replacementHistory?: Array<{ replacedAt: string; replacedBy: string | null }>;
  lastAutoFlipRequestId?: string | null;
  lastAutoFlipAt?: string | null;
  bgRemovedKey?: string;
  bgRemovedFilename?: string;
  bgRemovedImageUrl?: string;
  bgRemovedPublicUrl?: string;
  bgRemoved?: boolean;
  bgRemovedStatus?: string;
  [key: string]: unknown;
};

export type AutoFlipManifest2A = {
  characterHash?: string;
  order?: { characterHash?: string; publicR2Url?: string };
  entries?: AutoFlipManifestEntry[];
};

export const AUTO_FLIP_SUPPORTED_POSES = new Set([3, 11]);
export const AUTO_FLIP_CONFIDENCE_THRESHOLD = 1.5;

// Keep error messages deterministic across routes.
export function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Treat common storage misses as 404-like failures.
export function isNotFoundError(message: string): boolean {
  return message.includes('404') || message.includes('Not Found');
}

// Parse JSON safely when reading manifests from R2.
export function parseJsonSafe<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// Strip retry suffixes so flips always overwrite the canonical pose asset.
export function canonicalizePoseKey(rawKey: string): string {
  return rawKey.replace(/_r\d+\.png$/i, '.png').replace(/_TRY\d+\.png$/i, '.png');
}

// Build the expected canonical 2A pose key when the manifest entry is sparse.
export function buildCanonicalPoseKey(characterHash: string, poseNumber: number): string {
  const poseNN = String(poseNumber).padStart(2, '0');
  return `book-mvp-simple-adventure/order-generated-assets/characters/${characterHash}/poses/pose${poseNN}.png`;
}

// Resolve the canonical public pose asset used for orientation comparison.
export function buildPoseReferenceKey(poseNumber: number): string {
  const poseNN = String(poseNumber).padStart(2, '0');
  return `book-mvp-simple-adventure/characters/poses/pose${poseNN}.png`;
}

// Reuse the same public URL fallback as the replacement route.
export function buildAssetPublicUrl(key: string, publicR2Url?: string | null): string {
  if (publicR2Url) return `${publicR2Url}/${key}`;
  return `https://admin.littleherolabs.com/api/assets/${key}`;
}

// Keep duplicate flip requests idempotent.
export function isIdempotentAutoFlipReplay(entry: AutoFlipManifestEntry, requestId: string): boolean {
  return !!requestId && entry.lastAutoFlipRequestId === requestId;
}

// Ensure the 2A manifest always has a pose entry to mutate.
export function findOrCreatePoseEntry(manifest: AutoFlipManifest2A, poseNumber: number): AutoFlipManifestEntry {
  if (!Array.isArray(manifest.entries)) manifest.entries = [];
  let entry = manifest.entries.find((item) => item.poseNumber === poseNumber);
  if (entry) return entry;
  entry = { poseNumber, status: 'approved', approved: true };
  manifest.entries.push(entry);
  manifest.entries.sort((a, b) => Number(a.poseNumber ?? 0) - Number(b.poseNumber ?? 0));
  return entry;
}

// Apply the same canonical approved-image fields every backend flip should stamp.
export function applyPreBriaFlipMetadata(input: {
  entry: AutoFlipManifestEntry;
  poseNumber: number;
  canonicalKey: string;
  publicR2Url?: string | null;
  replacedAt: string;
  requestId?: string;
}): void {
  const { entry, poseNumber, canonicalKey, publicR2Url, replacedAt, requestId } = input;
  const poseNN = String(poseNumber).padStart(2, '0');

  entry.approvedKey = canonicalKey;
  entry.approvedFilename = `pose${poseNN}.png`;
  entry.approved = true;
  entry.status = 'approved';
  entry.needsReview = false;
  entry.reviewReason = null;
  entry.briaStatusUrl = null;
  entry.briaRequestId = null;
  entry.briaStatus = null;
  entry.publicUrl = buildAssetPublicUrl(canonicalKey, publicR2Url);
  entry.replacedAt = replacedAt;
  entry.replacementCount = (entry.replacementCount || 0) + 1;
  entry.replacedBy = null;
  entry.lastAutoFlipRequestId = requestId || null;
  entry.lastAutoFlipAt = replacedAt;
  entry.replacementHistory = [
    ...(entry.replacementHistory || []),
    { replacedAt, replacedBy: null },
  ];
}

// Clear 2B-derived fields so downstream background removal cannot reuse stale output.
export function clear2BEntryForReprocessing(entry: AutoFlipManifestEntry): void {
  delete entry.bgRemovedKey;
  delete entry.bgRemovedFilename;
  delete entry.bgRemovedImageUrl;
  delete entry.bgRemovedPublicUrl;
  entry.bgRemoved = false;
  entry.bgRemovedStatus = undefined;
  delete entry.briaStatusUrl;
  delete entry.briaRequestId;
  delete entry.briaStatus;
}
