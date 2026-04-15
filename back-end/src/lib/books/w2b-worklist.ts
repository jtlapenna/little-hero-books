import {
  DEFAULT_BOOK_ID,
  buildManifestKeyCandidates,
  buildManifestKeyFromOrderPrefix,
  extractManifestKey,
  resolveOrderPathContext,
} from '@/lib/order-paths';
import { resolveCanonicalBackendBaseUrl } from '@/lib/backend-url';

type JsonRecord = Record<string, unknown>;

type ManifestRecord = JsonRecord & {
  entries: JsonRecord[];
};

export type LoadManifestForW2B = (manifestKey: string) => Promise<unknown | null>;

export interface W2BWorklistItem {
  orderId: string;
  rootOrderId: string | null;
  amazonOrderId: string | null;
  bookId: string;
  orderPrefix: string;
  characterHash: string;
  poseNumber: number;
  approvedKey: string | null;
  replacedAt: string | null;
  replacementCount: number;
  manifest2aUrl: string;
  manifest2bKey: string;
  backendUrl: string;
  callbackUrl: string;
  force: boolean;
  workflowJobId?: number | null;
  workflowJobIdempotencyKey?: string | null;
  workflowJobStatus?: string | null;
  workflowAttemptId?: number | null;
  workflowAttempt?: number | null;
  workflowClaimed?: boolean;
}

export interface W2BWorklistSummary {
  scheduled: number;
  totalApproved: number;
  skippedByBriaStatus: number;
  skippedBy2BManifest: number;
  skippedTotal: number;
  reason: 'NO_APPROVED_POSES' | 'ALL_POSES_ALREADY_PROCESSED' | null;
}

export interface BuildW2BWorklistResult {
  orderId: string;
  rootOrderId: string | null;
  amazonOrderId: string | null;
  characterHash: string;
  bookId: string;
  orderPrefix: string;
  manifest2aUrl: string;
  manifest2bKey: string;
  backendUrl: string;
  callbackUrl: string;
  batchSize: number;
  force: boolean;
  summary: W2BWorklistSummary;
  workItems: W2BWorklistItem[];
}

export interface BuildW2BWorklistOptions {
  loadManifest: LoadManifestForW2B;
  defaultBackendUrl?: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }

  return false;
}

function isNonEmpty(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value !== 'string') {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && normalized !== 'undefined' && normalized !== 'null';
}

function pickFirstNonEmpty<T>(...values: T[]): T | null {
  for (const value of values) {
    if (isNonEmpty(value)) {
      return value;
    }
  }

  return null;
}

function joinManifestApiUrl(backendUrl: string, manifestKey: string): string {
  return `${backendUrl.replace(/\/$/, '')}/api/manifests/${manifestKey.replace(/^\/+/, '')}`;
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return values.filter(
    (value, index, allValues): value is string =>
      Boolean(value) && allValues.indexOf(value) === index,
  );
}

function collectPathLikes(input: JsonRecord, orderContext: JsonRecord): string[] {
  const productInfo = toRecord(
    pickFirstNonEmpty(input.product_info, input.productInfo, orderContext.product_info, orderContext.productInfo),
  );

  return dedupeStrings([
    toTrimmedString(input.manifestUrl),
    toTrimmedString(input.originalManifestUrl),
    toTrimmedString(input.manifest2aUrl),
    toTrimmedString(input.oneManifestUrl),
    toTrimmedString(input.one_manifest_url),
    toTrimmedString(input.orderPrefix),
    toTrimmedString(input.order_prefix),
    toTrimmedString(input.assetPrefix),
    toTrimmedString(input.asset_prefix),
    toTrimmedString(orderContext.manifestUrl),
    toTrimmedString(orderContext.originalManifestUrl),
    toTrimmedString(orderContext.manifest2aUrl),
    toTrimmedString(orderContext.oneManifestUrl),
    toTrimmedString(orderContext.one_manifest_url),
    toTrimmedString(orderContext.orderPrefix),
    toTrimmedString(orderContext.order_prefix),
    toTrimmedString(orderContext.assetPrefix),
    toTrimmedString(orderContext.asset_prefix),
    toTrimmedString(productInfo._order_prefix),
    toTrimmedString(productInfo._manifest_2a_url),
  ]);
}

function asManifestRecord(value: unknown, label: string): ManifestRecord {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    throw new Error(`${label} must be an object with an entries array`);
  }

  return {
    ...value,
    entries: value.entries.filter(isRecord),
  };
}

async function loadFirstManifest(
  label: string,
  candidates: string[],
  loadManifest: LoadManifestForW2B,
): Promise<{ manifestKey: string; manifest: ManifestRecord | null }> {
  for (const manifestKey of candidates) {
    const loaded = await loadManifest(manifestKey).catch(() => null);
    if (!loaded) {
      continue;
    }

    return {
      manifestKey,
      manifest: asManifestRecord(loaded, label),
    };
  }

  return {
    manifestKey: candidates[0] ?? '',
    manifest: null,
  };
}

function buildExisting2BEntryMap(manifest: ManifestRecord | null): Map<number, JsonRecord> {
  const entries = manifest?.entries ?? [];
  const entryByPose = new Map<number, JsonRecord>();

  for (const entry of entries) {
    const poseNumber = toInteger(entry.poseNumber);
    if (poseNumber === null) {
      continue;
    }

    entryByPose.set(poseNumber, entry);
  }

  return entryByPose;
}

export async function buildW2BWorklist(
  input: JsonRecord,
  options: BuildW2BWorklistOptions,
): Promise<BuildW2BWorklistResult> {
  const orderContext = toRecord(input.orderContext);
  const productInfo = toRecord(
    pickFirstNonEmpty(input.product_info, input.productInfo, orderContext.product_info, orderContext.productInfo),
  );

  const orderId = toTrimmedString(
    pickFirstNonEmpty(input.orderId, orderContext.orderId),
  );
  if (!orderId) {
    throw new Error('W2B worklist requires orderId');
  }

  const rootOrderId = toTrimmedString(
    pickFirstNonEmpty(
      input.rootOrderId,
      input.root_order_id,
      orderContext.rootOrderId,
      orderContext.root_order_id,
      input.amazonOrderId,
      input.amazon_order_id,
      orderContext.amazonOrderId,
      orderContext.amazon_order_id,
      productInfo._root_order_id,
    ),
  );
  const amazonOrderId = toTrimmedString(
    pickFirstNonEmpty(
      input.amazonOrderId,
      input.amazon_order_id,
      orderContext.amazonOrderId,
      orderContext.amazon_order_id,
      rootOrderId,
    ),
  );
  const backendUrl =
    toTrimmedString(
      pickFirstNonEmpty(input.backendUrl, orderContext.backendUrl),
    ) ??
    resolveCanonicalBackendBaseUrl(options.defaultBackendUrl);
  const callbackUrl =
    toTrimmedString(
      pickFirstNonEmpty(input.callbackUrl, orderContext.callbackUrl),
    ) ??
    `${backendUrl.replace(/\/$/, '')}/webhook/2b-callback`;
  const force = toBoolean(pickFirstNonEmpty(input.force, orderContext.force, false));
  const pathLikes = collectPathLikes(input, orderContext);

  const { bookId, orderPrefix } = resolveOrderPathContext(orderId, {
    bookId:
      toTrimmedString(
        pickFirstNonEmpty(
          input.bookId,
          input.book_id,
          orderContext.bookId,
          orderContext.book_id,
        ),
      ) ?? DEFAULT_BOOK_ID,
    orderPrefix:
      toTrimmedString(
        pickFirstNonEmpty(
          input.orderPrefix,
          input.order_prefix,
          orderContext.orderPrefix,
          orderContext.order_prefix,
        ),
      ) ?? undefined,
    pathLikes,
  });

  const manifest2aKey = buildManifestKeyFromOrderPrefix(orderPrefix, '2a');
  const manifest2bKey = buildManifestKeyFromOrderPrefix(orderPrefix, '2b');
  const explicit2aKeys = dedupeStrings([
    extractManifestKey(toTrimmedString(input.manifestUrl)),
    extractManifestKey(toTrimmedString(input.originalManifestUrl)),
    extractManifestKey(toTrimmedString(orderContext.manifestUrl)),
    extractManifestKey(toTrimmedString(orderContext.originalManifestUrl)),
  ]);
  const manifest2aCandidates = dedupeStrings([
    manifest2aKey,
    ...explicit2aKeys,
    ...buildManifestKeyCandidates(orderId, '2a', {
      bookId,
      orderPrefix,
      pathLikes,
    }),
  ]);
  const manifest2bCandidates = dedupeStrings([
    manifest2bKey,
    ...buildManifestKeyCandidates(orderId, '2b', {
      bookId,
      orderPrefix,
      pathLikes,
    }),
  ]);

  const loaded2A = await loadFirstManifest('2A manifest', manifest2aCandidates, options.loadManifest);
  if (!loaded2A.manifest) {
    throw new Error(
      `W2B worklist could not load the 2A manifest (${loaded2A.manifestKey || manifest2aKey})`,
    );
  }

  const loaded2B = await loadFirstManifest('2B manifest', manifest2bCandidates, options.loadManifest);
  const order = toRecord(loaded2A.manifest.order);
  const characterHash = toTrimmedString(
    pickFirstNonEmpty(
      loaded2A.manifest.characterHash,
      order.characterHash,
      input.characterHash,
      orderContext.characterHash,
    ),
  );
  if (!characterHash) {
    throw new Error('W2B worklist requires characterHash from the 2A manifest or request body');
  }

  const existingByPose = buildExisting2BEntryMap(loaded2B.manifest);
  const approved = loaded2A.manifest.entries.filter(
    (entry) => entry.approved === true && entry.status === 'approved',
  );

  const skippedByBriaStatus = 0;
  let skippedBy2BManifest = 0;

  const manifest2aUrl = joinManifestApiUrl(backendUrl, loaded2A.manifestKey || manifest2aKey);
  const workItems: W2BWorklistItem[] = [];

  for (const entry of approved) {
    const poseNumber = toInteger(entry.poseNumber);
    if (poseNumber === null) {
      continue;
    }

    if (!force) {
      const existing = existingByPose.get(poseNumber);
      if (existing) {
        const sourceApprovedKey = toTrimmedString(existing.sourceApprovedKey);
        const sourceReplacedAt = toTrimmedString(existing.sourceReplacedAt);
        const sourceReplacementCount = toInteger(existing.sourceReplacementCount) ?? 0;
        const approvedKey = toTrimmedString(entry.approvedKey);
        const replacedAt = toTrimmedString(entry.replacedAt);
        const replacementCount = toInteger(entry.replacementCount) ?? 0;
        const alreadyCompleted =
          Boolean(toTrimmedString(existing.bgRemovedKey)) &&
          String(existing.briaStatus || '').toLowerCase() === 'completed' &&
          sourceApprovedKey === approvedKey &&
          (sourceReplacedAt === replacedAt || sourceReplacementCount === replacementCount);

        if (alreadyCompleted) {
          skippedBy2BManifest += 1;
          continue;
        }
      }
    }

    workItems.push({
      orderId,
      rootOrderId,
      amazonOrderId,
      bookId,
      orderPrefix,
      characterHash,
      poseNumber,
      approvedKey: toTrimmedString(entry.approvedKey),
      replacedAt: toTrimmedString(entry.replacedAt),
      replacementCount: toInteger(entry.replacementCount) ?? 0,
      manifest2aUrl,
      manifest2bKey,
      backendUrl,
      callbackUrl,
      force,
    });
  }

  const summary: W2BWorklistSummary = {
    scheduled: workItems.length,
    totalApproved: approved.length,
    skippedByBriaStatus,
    skippedBy2BManifest,
    skippedTotal: skippedByBriaStatus + skippedBy2BManifest,
    reason:
      approved.length === 0
        ? 'NO_APPROVED_POSES'
        : workItems.length === 0
          ? 'ALL_POSES_ALREADY_PROCESSED'
          : null,
  };

  return {
    orderId,
    rootOrderId,
    amazonOrderId,
    characterHash,
    bookId,
    orderPrefix,
    manifest2aUrl,
    manifest2bKey,
    backendUrl,
    callbackUrl,
    batchSize: 1,
    force,
    summary,
    workItems,
  };
}
