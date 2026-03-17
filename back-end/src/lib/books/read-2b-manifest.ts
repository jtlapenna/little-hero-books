import { type CharacterAsset } from '@/lib/r2-service';
import {
  buildManifestKeyCandidates,
  buildManifestKeyFromOrderPrefix,
  extractOrderPrefixFromPathLike,
} from '@/lib/order-paths';
import {
  normalizeW0Manifest,
  type NormalizedW0Manifest,
} from '@/lib/books/normalize-w0-manifest';

type JsonRecord = Record<string, unknown>;

export interface TwoBManifestEntry extends JsonRecord {
  poseNumber?: unknown;
  bgRemovedKey?: unknown;
  bgRemoved?: unknown;
  bgRemovedStatus?: unknown;
  bgRemovedImageUrl?: unknown;
  bgRemovedPublicUrl?: unknown;
  processedAt?: unknown;
}

export interface TwoBManifestRecord extends JsonRecord {
  entries: TwoBManifestEntry[];
}

export interface Read2BManifestOptions {
  manifest: unknown;
  orderId?: string | null;
  loadManifest?: (manifestKey: string) => Promise<unknown | null>;
}

export interface Read2BManifestResult {
  manifest: TwoBManifestRecord;
  entries: TwoBManifestEntry[];
  entryByPoseNumber: Map<number, TwoBManifestEntry>;
  availablePoseNumbers: number[];
  requiredPoseNumbers: number[];
  requiredPoseSource: 'w0-v3' | 'legacy-default';
  orderId: string | null;
  characterHash: string | null;
  oneManifestKey: string | null;
  oneManifestSnapshot: NormalizedW0Manifest | null;
}

export interface Sync2BManifestEntriesOptions {
  entryByPoseNumber: Map<number, TwoBManifestEntry>;
  poseNumbers: number[];
  bgRemovedByPose: Map<number, string>;
  nowIso: string;
  trackMissingEntries: boolean;
  ensureBgRemovedPublicUrlField?: boolean;
}

export interface Sync2BManifestEntriesResult {
  updatedPoseNumbers: number[];
  missingPoseNumbers: number[];
  touched: boolean;
}

export const LEGACY_REQUIRED_2B_POSE_NUMBERS = Array.from(
  { length: 12 },
  (_, index) => index + 1,
);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toObject(value: unknown): JsonRecord | undefined {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function toStringValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toPoseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function extractManifestKey(value: string): string {
  return value.includes('/api/manifests/')
    ? value.split('/api/manifests/')[1]
    : value;
}

function resolveOneManifestKey(
  manifest: JsonRecord,
  orderId: string | null,
): string | null {
  const order = toObject(manifest.order);
  const orderPrefix =
    toStringValue(order?.assetPrefix) ??
    extractOrderPrefixFromPathLike(toStringValue(manifest.manifestUrl)) ??
    extractOrderPrefixFromPathLike(toStringValue(manifest.oneManifestUrl));
  const explicit =
    toStringValue(order?.oneManifestUrl) ??
    toStringValue(manifest.oneManifestUrl);

  if (explicit) {
    return extractManifestKey(explicit);
  }

  if (orderPrefix) {
    return buildManifestKeyFromOrderPrefix(orderPrefix, '1');
  }

  if (!orderId) {
    return null;
  }

  return (
    buildManifestKeyCandidates(orderId, '1', {
      pathLikes: [
        toStringValue(order?.assetPrefix),
        toStringValue(order?.oneManifestUrl),
        toStringValue(manifest.manifestUrl),
        toStringValue(manifest.oneManifestUrl),
      ],
    })[0] ?? null
  );
}

export function buildBgRemovedAssetMap(assets: CharacterAsset[]): Map<number, string> {
  const bgRemovedByPose = new Map<number, string>();

  for (const asset of assets) {
    if (asset.assetType !== 'background-removed') {
      continue;
    }

    const url = String(asset.url || '');
    const key = url.startsWith('/api/assets/')
      ? url.replace(/^\/api\/assets\//, '')
      : null;
    if (!key) {
      continue;
    }

    const poseNumber = toPoseNumber(asset.poseNumber);
    if (poseNumber === null) {
      continue;
    }

    bgRemovedByPose.set(poseNumber, key);
  }

  return bgRemovedByPose;
}

export async function read2BManifestWithPoseRequirements(
  options: Read2BManifestOptions,
): Promise<Read2BManifestResult> {
  if (!isRecord(options.manifest) || !Array.isArray(options.manifest.entries)) {
    throw new Error('2B manifest must be an object with an entries array');
  }

  const entries = options.manifest.entries.filter(isRecord);
  const order = toObject(options.manifest.order) ?? {};
  const orderId =
    toStringValue(options.manifest.orderId) ??
    toStringValue(order.orderId) ??
    options.orderId ??
    null;
  const characterHash =
    toStringValue(options.manifest.characterHash) ??
    toStringValue(order.characterHash) ??
    null;

  const entryByPoseNumber = new Map<number, TwoBManifestEntry>();
  const availablePoseNumbers: number[] = [];
  for (const entry of entries) {
    const poseNumber = toPoseNumber(entry.poseNumber);
    if (poseNumber === null) {
      continue;
    }
    entryByPoseNumber.set(poseNumber, entry);
    availablePoseNumbers.push(poseNumber);
  }

  const oneManifestKey = resolveOneManifestKey(options.manifest, orderId);
  let oneManifestSnapshot: NormalizedW0Manifest | null = null;
  let requiredPoseNumbers = [...LEGACY_REQUIRED_2B_POSE_NUMBERS];
  let requiredPoseSource: Read2BManifestResult['requiredPoseSource'] = 'legacy-default';

  if (oneManifestKey && options.loadManifest) {
    try {
      const oneManifest = await options.loadManifest(oneManifestKey);
      if (oneManifest) {
        oneManifestSnapshot = normalizeW0Manifest(oneManifest, {
          fallbackManifestKey: oneManifestKey,
        });
        if (oneManifestSnapshot.requiredPoseNumbers.length > 0) {
          requiredPoseNumbers = uniqueSorted(oneManifestSnapshot.requiredPoseNumbers);
          requiredPoseSource = 'w0-v3';
        }
      }
    } catch {
      // Preserve the legacy fallback when the companion W0 manifest cannot be read.
    }
  }

  return {
    manifest: {
      ...options.manifest,
      entries,
    },
    entries,
    entryByPoseNumber,
    availablePoseNumbers: uniqueSorted(availablePoseNumbers),
    requiredPoseNumbers,
    requiredPoseSource,
    orderId,
    characterHash,
    oneManifestKey,
    oneManifestSnapshot,
  };
}

export function sync2BManifestEntries(
  options: Sync2BManifestEntriesOptions,
): Sync2BManifestEntriesResult {
  const poseNumbers = uniqueSorted(options.poseNumbers);
  const updatedPoseNumbers: number[] = [];
  const missingPoseNumbers: number[] = [];
  let touched = false;

  for (const poseNumber of poseNumbers) {
    const entry = options.entryByPoseNumber.get(poseNumber);
    if (!entry) {
      if (options.trackMissingEntries) {
        missingPoseNumbers.push(poseNumber);
      }
      continue;
    }

    const hasKey =
      typeof entry.bgRemovedKey === 'string' && entry.bgRemovedKey.trim().length > 0;
    if (hasKey) {
      continue;
    }

    const foundKey = options.bgRemovedByPose.get(poseNumber);
    if (!foundKey) {
      missingPoseNumbers.push(poseNumber);
      continue;
    }

    entry.bgRemovedKey = foundKey;
    entry.bgRemoved = true;
    entry.bgRemovedStatus =
      typeof entry.bgRemovedStatus === 'string' && entry.bgRemovedStatus.trim().length > 0
        ? entry.bgRemovedStatus
        : 'completed';
    entry.processedAt =
      typeof entry.processedAt === 'string' && entry.processedAt.trim().length > 0
        ? entry.processedAt
        : options.nowIso;

    if (!('bgRemovedImageUrl' in entry)) {
      entry.bgRemovedImageUrl = null;
    }
    if (options.ensureBgRemovedPublicUrlField && !('bgRemovedPublicUrl' in entry)) {
      entry.bgRemovedPublicUrl = null;
    }

    updatedPoseNumbers.push(poseNumber);
    touched = true;
  }

  return {
    updatedPoseNumbers,
    missingPoseNumbers,
    touched,
  };
}
