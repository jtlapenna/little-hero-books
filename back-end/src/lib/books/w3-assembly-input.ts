import { isHistoricalBookConfigRef, stableBookValue } from './book-legacy-compatibility';
import { inspectWorkflowBookIdentity, assertWorkflowMatchesW0, workflowBookContexts } from './workflow-book-identity';
import { parseW3PageSelection } from './w3-page-selection';
import { validateRenderSnapshot, snapshotPoseReferenceKeys, pagePoseNumbers, coverPoseNumbers } from './book-render-recipe';
import type { BookSnapshotFields } from './book-snapshot';
import {
  buildAssetApiUrl,
  buildBgRemovedPoseAssetKey,
  buildManifestKeyCandidates,
  buildManifestKeyFromOrderPrefix,
  collectOrderPathLikes,
  extractManifestKey,
  resolveOrderPathContext,
} from '@/lib/order-paths';
import {
  normalizeW0Manifest,
  type NormalizedW0Manifest,
} from '@/lib/books/normalize-w0-manifest';
import { LEGACY_REQUIRED_2B_POSE_NUMBERS } from '@/lib/books/read-2b-manifest';
import type { BookPageConfig } from '@/lib/books/types';
import { resolveCanonicalBackendBaseUrl } from '@/lib/backend-url';
import { buildLegacyBookPagePlan } from '@/lib/books/legacy-page-plan';
import { loadBundledBookConfig } from '@/lib/books/load-book-config';
import { resolvePagePlan } from '@/lib/books/resolve-page-plan';
import type {
  NormalizePoseScaleFn,
  NormalizePoseScaleResult,
} from '@/lib/pose-scale-normalization';

type JsonRecord = Record<string, unknown>;

type ManifestRecord = JsonRecord & {
  entries: JsonRecord[];
};

export type LoadManifestForW3 = (manifestKey: string) => Promise<unknown | null>;

export interface W3ProcessedImage {
  poseNumber: number;
  fileName: string;
  r2Path: string;
  publicUrl: string;
  briaProcessed: boolean;
  briaStatus: string;
  flipped: boolean;
  flippedAt: string | null;
  sourceKey: 'bgRemovedKey' | 'approvedKey';
}

export interface BuildW3AssemblyInputResult extends BookSnapshotFields {
  orderId: string;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  characterHash: string;
  bookId: string;
  formatId: string | null;
  orderPrefix: string;
  orderR2BaseKey: string;
  oneManifestKey: string | null;
  oneManifestUrl: string | null;
  oneManifestSchema: string | null;
  manifest2bKey: string;
  manifest2bUrl: string;
  manifest3Key: string;
  manifest3Url: string;
  backendUrl: string;
  isAmazonOrder: boolean;
  expectedPageCount: number;
  pagePlan: BookPageConfig[];
  pageLabels: string[];
  pagePlanSource: 'w0-v3' | 'runtime-config' | 'legacy-default';
  requiredPoseNumbers: number[];
  requiredPoseSource: 'w0-v3' | 'runtime-config' | 'legacy-default';
  processedImages: W3ProcessedImage[];
  missingBgRemovedPoseNumbers: number[];
  dedicationText: string | null;
  testMode: boolean;
  testModePages: number | number[];
  characterSpecs: JsonRecord;
  bookSpecs: JsonRecord;
  orderDetails: JsonRecord;
  publicR2Url: string | null;
  marketplace_id: string | null;
}

export interface BuildW3AssemblyInputOptions {
  loadManifest: LoadManifestForW3;
  defaultBackendUrl?: string;
  normalizePoseScale?: NormalizePoseScaleFn;
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
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  return lowered === 'null' || lowered === 'undefined' ? null : trimmed;
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

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return values.filter(
    (value, index, allValues): value is string =>
      Boolean(value) && allValues.indexOf(value) === index,
  );
}

function buildAbsoluteApiUrl(backendUrl: string, relativeUrl: string): string {
  return `${backendUrl.replace(/\/$/, '')}/${relativeUrl.replace(/^\/+/, '')}`;
}

function buildManifestApiUrlAbsolute(
  backendUrl: string,
  manifestKey: string,
): string {
  return buildAbsoluteApiUrl(
    backendUrl,
    `api/manifests/${manifestKey.replace(/^\/+/, '')}`,
  );
}

function buildAssetApiUrlAbsolute(
  backendUrl: string,
  assetKey: string,
  flipped: boolean,
  flippedAt: string | null,
): string {
  const relativeUrl = buildAssetApiUrl(assetKey);
  let absoluteUrl = buildAbsoluteApiUrl(backendUrl, relativeUrl);

  if (flipped && flippedAt) {
    const cacheBuster = new Date(flippedAt).getTime();
    if (Number.isFinite(cacheBuster)) {
      absoluteUrl = `${absoluteUrl}${absoluteUrl.includes('?') ? '&' : '?'}v=${cacheBuster}`;
    }
  }

  return absoluteUrl;
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
  loadManifest: LoadManifestForW3,
): Promise<{ manifestKey: string | null; manifest: ManifestRecord | null }> {
  for (const manifestKey of candidates) {
    const loaded = await loadManifest(manifestKey).catch(() => null);
    if (!loaded) {
      continue;
    }

    if (label === '1-manifest') {
      if (!isRecord(loaded)) {
        continue;
      }

      return {
        manifestKey,
        manifest: loaded as ManifestRecord,
      };
    }

    return {
      manifestKey,
      manifest: asManifestRecord(loaded, label),
    };
  }

  return {
    manifestKey: candidates[0] ?? null,
    manifest: null,
  };
}

function collectPathLikes(
  primary: JsonRecord,
  nested: JsonRecord,
  orderContext: JsonRecord,
): string[] {
  return dedupeStrings([
    ...collectOrderPathLikes(primary),
    ...collectOrderPathLikes(nested),
    ...collectOrderPathLikes(orderContext),
    toTrimmedString(primary.manifestUrl),
    toTrimmedString(primary.originalManifestUrl),
    toTrimmedString(primary.oneManifestUrl),
    toTrimmedString(primary.one_manifest_url),
    toTrimmedString(primary.manifest2bUrl),
    toTrimmedString(primary.manifest_2b_url),
    toTrimmedString(primary.manifest2bKey),
    toTrimmedString(primary.manifest_2b_key),
    toTrimmedString(primary.manifestKey),
    toTrimmedString(nested.manifestUrl),
    toTrimmedString(nested.originalManifestUrl),
    toTrimmedString(nested.oneManifestUrl),
    toTrimmedString(nested.one_manifest_url),
    toTrimmedString(nested.manifest2bUrl),
    toTrimmedString(nested.manifest_2b_url),
    toTrimmedString(nested.manifest2bKey),
    toTrimmedString(nested.manifest_2b_key),
    toTrimmedString(nested.manifestKey),
    toTrimmedString(orderContext.manifestUrl),
    toTrimmedString(orderContext.originalManifestUrl),
    toTrimmedString(orderContext.oneManifestUrl),
    toTrimmedString(orderContext.one_manifest_url),
    toTrimmedString(orderContext.manifest2bUrl),
    toTrimmedString(orderContext.manifest_2b_url),
    toTrimmedString(orderContext.manifest2bKey),
    toTrimmedString(orderContext.manifest_2b_key),
    toTrimmedString(orderContext.manifestKey),
  ]);
}

function normalizeDedicationText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = toTrimmedString(value);
    if (text) {
      return text;
    }
  }

  return null;
}

function pickJsonRecord(...values: unknown[]): JsonRecord {
  for (const value of values) {
    if (isRecord(value)) {
      return value;
    }
  }

  return {};
}

function pickManifestKeyCandidates(
  explicit: Array<string | null | undefined>,
  fallbackKey: string,
  generatedCandidates: string[],
): string[] {
  return dedupeStrings([
    ...explicit.map((value) => extractManifestKey(value ?? null)),
    fallbackKey,
    ...generatedCandidates,
  ]);
}

function deriveIdentity(
  primary: JsonRecord,
  nested: JsonRecord,
  orderContext: JsonRecord,
  manifest2b: ManifestRecord,
  normalizedOneManifest: NormalizedW0Manifest | null,
): {
  orderId: string;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  characterHash: string;
} {
  const manifestOrder = pickJsonRecord(manifest2b.order);
  const orderDataPrimary = pickJsonRecord(primary.orderData);
  const orderDataNested = pickJsonRecord(nested.orderData);

  const orderId = toTrimmedString(
    pickFirstNonEmpty(
      primary.orderId,
      nested.orderId,
      orderDataPrimary.orderId,
      orderDataNested.orderId,
      orderContext.orderId,
      normalizedOneManifest?.orderId,
      manifestOrder.orderId,
      manifest2b.orderId,
      primary.amazonOrderId,
      nested.amazonOrderId,
      manifestOrder.amazonOrderId,
    ),
  );
  if (!orderId) {
    throw new Error('W3 assembly input requires orderId');
  }

  const rootOrderId = toTrimmedString(
    pickFirstNonEmpty(
      primary.rootOrderId,
      primary.root_order_id,
      nested.rootOrderId,
      nested.root_order_id,
      orderDataPrimary.rootOrderId,
      orderDataPrimary.root_order_id,
      orderDataNested.rootOrderId,
      orderDataNested.root_order_id,
      orderContext.rootOrderId,
      orderContext.root_order_id,
      normalizedOneManifest?.rootOrderId,
      manifestOrder.rootOrderId,
      manifestOrder.root_order_id,
      primary.amazonOrderId,
      nested.amazonOrderId,
      orderContext.amazonOrderId,
      normalizedOneManifest?.amazonOrderId,
      manifestOrder.amazonOrderId,
      orderId,
    ),
  );

  const amazonOrderId = toTrimmedString(
    pickFirstNonEmpty(
      primary.amazonOrderId,
      primary.amazon_order_id,
      nested.amazonOrderId,
      nested.amazon_order_id,
      orderDataPrimary.amazonOrderId,
      orderDataPrimary.amazon_order_id,
      orderDataNested.amazonOrderId,
      orderDataNested.amazon_order_id,
      orderContext.amazonOrderId,
      orderContext.amazon_order_id,
      normalizedOneManifest?.amazonOrderId,
      manifestOrder.amazonOrderId,
      manifestOrder.amazon_order_id,
      null,
    ),
  );

  const characterHash = toTrimmedString(
    pickFirstNonEmpty(
      primary.characterHash,
      nested.characterHash,
      orderDataPrimary.characterHash,
      orderDataNested.characterHash,
      orderContext.characterHash,
      manifest2b.characterHash,
      manifestOrder.characterHash,
    ),
  );
  if (!characterHash) {
    throw new Error('W3 assembly input requires characterHash');
  }

  return {
    orderId,
    amazonOrderId,
    rootOrderId,
    characterHash,
  };
}

function deriveBookState(
  primary: JsonRecord,
  nested: JsonRecord,
  orderContext: JsonRecord,
  manifest2b: ManifestRecord,
  normalizedOneManifest: NormalizedW0Manifest | null,
  fallbackBookId: string,
): {
  bookId: string;
  formatId: string | null;
  isAmazonOrder: boolean;
  pagePlan: BookPageConfig[];
  pageLabels: string[];
  pagePlanSource: 'w0-v3' | 'runtime-config' | 'legacy-default';
  requiredPoseNumbers: number[];
  requiredPoseSource: 'w0-v3' | 'runtime-config' | 'legacy-default';
  marketplace_id: string | null;
  expectedPageCount: number;
} {
  const manifestOrder = pickJsonRecord(manifest2b.order);
  const bookSpecs = pickJsonRecord(
    primary.bookSpecs,
    nested.bookSpecs,
    manifestOrder.bookSpecs,
    normalizedOneManifest?.bookSpecs,
  );

  const marketplaceId = toTrimmedString(
    pickFirstNonEmpty(
      primary.marketplace_id,
      primary.marketplaceId,
      nested.marketplace_id,
      nested.marketplaceId,
      manifest2b.marketplace_id,
      manifest2b.marketplaceId,
      manifestOrder.marketplace_id,
      manifestOrder.marketplaceId,
      orderContext.marketplace_id,
      orderContext.marketplaceId,
    ),
  );

  const explicitBookId = toTrimmedString(
    pickFirstNonEmpty(
      primary.bookId,
      primary.book_id,
      nested.bookId,
      nested.book_id,
      orderContext.bookId,
      orderContext.book_id,
      normalizedOneManifest?.bookId,
      manifest2b.bookId,
      manifestOrder.bookId,
    ),
  );

  const bookId = explicitBookId ?? fallbackBookId;
  const formatId = toTrimmedString(
    pickFirstNonEmpty(
      primary.formatId,
      primary.format_id,
      nested.formatId,
      nested.format_id,
      orderContext.formatId,
      orderContext.format_id,
      normalizedOneManifest?.formatId,
      bookSpecs.formatId,
      manifest2b.formatId,
      manifestOrder.formatId,
    ),
  );

  const explicitIsAmazon = pickFirstNonEmpty(
    primary.isAmazonOrder,
    nested.isAmazonOrder,
    orderContext.isAmazonOrder,
  );
  const normalizedFormatId = formatId?.trim().toLowerCase() ?? null;
  const isAmazonOrder =
    explicitIsAmazon !== null
      ? toBoolean(explicitIsAmazon)
      : normalizedFormatId
        ? normalizedFormatId === 'amazon'
        : marketplaceId === 'ATVPDKIKX0DER' ||
          toTrimmedString(manifestOrder.amazonOrderId) !== null;

  let runtimePlan: ReturnType<typeof resolvePagePlan> | null = null;
  try {
    const config = loadBundledBookConfig({ bookId });
    runtimePlan = resolvePagePlan(config, formatId ?? undefined);
  } catch {
    runtimePlan = null;
  }

  const pagePlan =
    normalizedOneManifest?.pagePlan?.length
      ? normalizedOneManifest.pagePlan
      : runtimePlan?.pagePlan?.length
        ? runtimePlan.pagePlan
        : buildLegacyBookPagePlan(isAmazonOrder);
  const pageLabels =
    normalizedOneManifest?.pageLabels?.length
      ? normalizedOneManifest.pageLabels
      : runtimePlan?.pageLabels?.length
        ? runtimePlan.pageLabels
        : pagePlan.map((page) => page.label);
  const pagePlanSource: BuildW3AssemblyInputResult['pagePlanSource'] =
    normalizedOneManifest?.pagePlan?.length
      ? 'w0-v3'
      : runtimePlan?.pagePlan?.length
        ? 'runtime-config'
        : 'legacy-default';
  const requiredPoseNumbers =
    (normalizedOneManifest?.renderSnapshot || normalizedOneManifest?.requiredPoseNumbers?.length)
      ? [...normalizedOneManifest.requiredPoseNumbers]
      : runtimePlan?.qaPolicy.pose.requiredPoseNumbers?.length
        ? [...runtimePlan.qaPolicy.pose.requiredPoseNumbers]
        : [...LEGACY_REQUIRED_2B_POSE_NUMBERS];
  const requiredPoseSource: BuildW3AssemblyInputResult['requiredPoseSource'] =
    (normalizedOneManifest?.renderSnapshot || normalizedOneManifest?.requiredPoseNumbers?.length)
      ? 'w0-v3'
      : runtimePlan?.qaPolicy.pose.requiredPoseNumbers?.length
        ? 'runtime-config'
        : 'legacy-default';

  return {
    bookId,
    formatId,
    isAmazonOrder,
    pagePlan,
    pageLabels,
    pagePlanSource,
    requiredPoseNumbers,
    requiredPoseSource,
    marketplace_id: marketplaceId,
    expectedPageCount:
      (normalizedOneManifest?.pagePlan.length ? pagePlan.length : runtimePlan?.expectedPageCount) ??
      pagePlan.length ??
      (isAmazonOrder ? 17 : 15),
  };
}

async function normalizeBgRemovedPoses(
  manifest2b: ManifestRecord,
  requiredPoseNumbers: number[],
  bookId: string,
  normalizePoseScale?: NormalizePoseScaleFn,
  referenceKeys?: Record<string, string>,
): Promise<void> {
  if (!normalizePoseScale) {
    return;
  }

  const requiredPoseSet = new Set(requiredPoseNumbers);
  const uniqueEntries = new Map<number, JsonRecord>();

  for (const entry of manifest2b.entries) {
    const poseNumber = toInteger(entry.poseNumber);
    const bgRemovedKey = toTrimmedString(entry.bgRemovedKey);
    if (
      poseNumber === null ||
      !requiredPoseSet.has(poseNumber) ||
      !bgRemovedKey ||
      uniqueEntries.has(poseNumber)
    ) {
      continue;
    }
    uniqueEntries.set(poseNumber, entry);
  }

  for (const [poseNumber, entry] of uniqueEntries.entries()) {
    const bgRemovedKey = toTrimmedString(entry.bgRemovedKey);
    if (!bgRemovedKey) {
      continue;
    }

    let result: NormalizePoseScaleResult;
    try {
      result = await normalizePoseScale({
        imageKey: bgRemovedKey,
        poseNumber,
        bookId,
        referenceKey: referenceKeys?.[String(poseNumber)],
        characterHash: toTrimmedString(entry.characterHash),
        mode: 'strict',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `W3 pose normalization failed for pose ${poseNumber} (${bgRemovedKey}): ${message}`,
      );
    }

    if (!result.sourceBBoxFound) {
      throw new Error(
        `W3 pose normalization found no character bbox for pose ${poseNumber} (${bgRemovedKey})`,
      );
    }
    if (!result.referenceBBoxFound) {
      throw new Error(
        `W3 pose normalization found no reference bbox for pose ${poseNumber} (${result.refKey})`,
      );
    }
  }
}

async function normalizeCoverPose00(
  characterHash: string | null | undefined,
  bookId: string,
  normalizePoseScale?: NormalizePoseScaleFn,
  referenceKeys?: Record<string, string>,
): Promise<void> {
  if (!normalizePoseScale || !characterHash) {
    return;
  }

  const imageKey = buildBgRemovedPoseAssetKey(characterHash, 0, bookId);

  let result: NormalizePoseScaleResult;
  try {
    result = await normalizePoseScale({
      imageKey,
      poseNumber: 0,
      bookId,
      referenceKey: referenceKeys?.['0'],
      characterHash,
      mode: 'strict',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `W3 cover pose normalization failed for pose 00 (${imageKey}): ${message}`,
    );
  }

  if (!result.sourceBBoxFound) {
    throw new Error(
      `W3 cover pose normalization found no character bbox for pose 00 (${imageKey})`,
    );
  }
  if (!result.referenceBBoxFound) {
    throw new Error(
      `W3 cover pose normalization found no reference bbox for pose 00 (${result.refKey})`,
    );
  }
}

function buildProcessedImages(
  manifest2b: ManifestRecord,
  requiredPoseNumbers: number[],
  backendUrl: string,
): {
  processedImages: W3ProcessedImage[];
  missingBgRemovedPoseNumbers: number[];
} {
  const requiredPoseSet = new Set(requiredPoseNumbers);
  const missingBgRemovedPoseNumbers: number[] = [];

  const processedImages = manifest2b.entries
    .filter((entry) => {
      const poseNumber = toInteger(entry.poseNumber);
      if (poseNumber === null) {
        return false;
      }

      return Boolean(
        toTrimmedString(entry.bgRemovedKey) ??
          toTrimmedString(entry.approvedKey) ??
          toTrimmedString(entry.sourceApprovedKey),
      );
    })
    .map((entry) => {
      const poseNumber = toInteger(entry.poseNumber) as number;
      const bgRemovedKey = toTrimmedString(entry.bgRemovedKey);
      const approvedKey =
        toTrimmedString(entry.approvedKey) ??
        toTrimmedString(entry.sourceApprovedKey);
      const key = bgRemovedKey ?? approvedKey;
      if (!key) {
        throw new Error(`W3 assembly input entry for pose ${poseNumber} is missing an asset key`);
      }

      if (requiredPoseSet.has(poseNumber) && !bgRemovedKey) {
        missingBgRemovedPoseNumbers.push(poseNumber);
      }

      const flipped = toBoolean(entry.flipped);
      const flippedAt = toTrimmedString(entry.flippedAt);

      return {
        poseNumber,
        fileName:
          key.split('/').pop() ?? `pose${String(poseNumber).padStart(2, '0')}.png`,
        r2Path: key,
        publicUrl: buildAssetApiUrlAbsolute(
          backendUrl,
          key,
          flipped,
          flippedAt,
        ),
        briaProcessed: Boolean(bgRemovedKey),
        briaStatus:
          toTrimmedString(entry.briaStatus) ??
          toTrimmedString(entry.bgRemovedStatus) ??
          (bgRemovedKey ? 'completed' : 'not_bg_removed'),
        flipped,
        flippedAt,
        sourceKey: bgRemovedKey ? 'bgRemovedKey' : 'approvedKey',
      };
    })
    .sort((left, right) => left.poseNumber - right.poseNumber);

  return {
    processedImages,
    missingBgRemovedPoseNumbers: [...new Set(missingBgRemovedPoseNumbers)].sort(
      (left, right) => left - right,
    ),
  };
}

export async function buildW3AssemblyInput(
  input: JsonRecord,
  options: BuildW3AssemblyInputOptions,
): Promise<BuildW3AssemblyInputResult> {
  const nested = toRecord(input.body);
  const primary = nested === input ? input : toRecord(input);
  const orderContext = pickJsonRecord(primary.orderContext, nested.orderContext);

  const backendUrl =
    toTrimmedString(
      pickFirstNonEmpty(primary.backendUrl, nested.backendUrl, orderContext.backendUrl),
    ) ??
    resolveCanonicalBackendBaseUrl(options.defaultBackendUrl);
  const testMode = toBoolean(
    pickFirstNonEmpty(primary.testMode, nested.testMode, orderContext.testMode, false),
  );
  const testModeSelector = pickFirstNonEmpty(
      primary.testModePages,
      nested.testModePages,
      orderContext.testModePages,
      testMode ? 2 : 0,
    );
  const testModePages = parseW3PageSelection(testModeSelector);

  const pathLikes = collectPathLikes(primary, nested, orderContext);
  const explicitOrderId = toTrimmedString(
    pickFirstNonEmpty(
      primary.orderId,
      nested.orderId,
      primary.order_id,
      nested.order_id,
      pickJsonRecord(primary.orderData).orderId,
      pickJsonRecord(nested.orderData).orderId,
      orderContext.orderId,
      primary.amazonOrderId,
      nested.amazonOrderId,
    ),
  );
  if (!explicitOrderId) {
    throw new Error('W3 assembly input requires orderId');
  }

  const explicitOrderPrefix =
    toTrimmedString(
      pickFirstNonEmpty(
        primary.orderPrefix,
        primary.order_prefix,
        nested.orderPrefix,
        nested.order_prefix,
        orderContext.orderPrefix,
        orderContext.order_prefix,
      ),
    ) ?? undefined;

  const { bookId: hintedBookId, orderPrefix: manifestLookupOrderPrefix } =
    resolveOrderPathContext(explicitOrderId, {
    bookId:
      toTrimmedString(
        pickFirstNonEmpty(
          primary.bookId,
          primary.book_id,
          nested.bookId,
          nested.book_id,
          orderContext.bookId,
          orderContext.book_id,
        ),
      ) ?? undefined,
    orderPrefix: explicitOrderPrefix,
    pathLikes,
  });

  const manifest2bKey = buildManifestKeyFromOrderPrefix(
    manifestLookupOrderPrefix,
    '2b',
  );
  const oneManifestKey = buildManifestKeyFromOrderPrefix(
    manifestLookupOrderPrefix,
    '1',
  );

  const manifest2bCandidates = pickManifestKeyCandidates(
    [
      primary.manifest2bKey,
      primary.manifest_2b_key,
      nested.manifest2bKey,
      nested.manifest_2b_key,
      primary.manifest2bUrl,
      primary.manifest_2b_url,
      nested.manifest2bUrl,
      nested.manifest_2b_url,
      primary.manifestUrl,
      primary.originalManifestUrl,
      primary.manifestKey,
      nested.manifestUrl,
      nested.originalManifestUrl,
      nested.manifestKey,
      orderContext.manifest2bKey,
      orderContext.manifest2bUrl,
      orderContext.manifestKey,
    ],
    manifest2bKey,
    buildManifestKeyCandidates(explicitOrderId, '2b', {
      bookId: hintedBookId,
      orderPrefix: manifestLookupOrderPrefix,
      pathLikes,
    }),
  );
  const oneManifestCandidates = pickManifestKeyCandidates(
    [
      primary.oneManifestKey,
      primary.oneManifestUrl,
      primary.one_manifest_url,
      nested.oneManifestKey,
      nested.oneManifestUrl,
      nested.one_manifest_url,
      orderContext.oneManifestKey,
      orderContext.oneManifestUrl,
      orderContext.one_manifest_url,
    ],
    oneManifestKey,
    buildManifestKeyCandidates(explicitOrderId, '1', {
      bookId: hintedBookId,
      orderPrefix: manifestLookupOrderPrefix,
      pathLikes,
    }),
  );

  const loaded2B = await loadFirstManifest(
    '2b-manifest',
    manifest2bCandidates,
    options.loadManifest,
  );
  if (!loaded2B.manifest) {
    throw new Error(
      `W3 assembly input could not load the 2B manifest (${loaded2B.manifestKey || manifest2bKey})`,
    );
  }

  const loadedOneManifest = await loadFirstManifest(
    '1-manifest',
    oneManifestCandidates,
    options.loadManifest,
  );
  const normalizedOneManifest =
    loadedOneManifest.manifest && isRecord(loadedOneManifest.manifest)
      ? normalizeW0Manifest(loadedOneManifest.manifest, {
          fallbackManifestKey: loadedOneManifest.manifestKey ?? oneManifestKey,
        })
      : null;

  const identity = deriveIdentity(
    primary,
    nested,
    orderContext,
    loaded2B.manifest,
    normalizedOneManifest,
  );
  const bookState = deriveBookState(
    primary,
    nested,
    orderContext,
    loaded2B.manifest,
    normalizedOneManifest,
    hintedBookId,
  );
  if (normalizedOneManifest?.renderSnapshot) validateRenderSnapshot(normalizedOneManifest.renderSnapshot, { bookId: bookState.bookId, formatId: bookState.formatId, version: toInteger(primary.configVersion ?? nested.configVersion ?? orderContext.configVersion) });
  if (!normalizedOneManifest?.renderSnapshot) {
    const declaredSelections = [inspectWorkflowBookIdentity(primary), inspectWorkflowBookIdentity(nested)];
    if (declaredSelections.some(selection => selection.snapshots.length)) throw new Error('Configured W3 request requires its original frozen W0 manifest');
    for (const selection of declaredSelections) {
      if (selection.bookId && selection.bookId !== bookState.bookId) throw new Error('W3 requested book conflicts with selected W0');
    }
    const versions = [...declaredSelections.map(selection => selection.version), normalizedOneManifest?.configVersion]
      .filter((value): value is number => value !== undefined);
    if (new Set(versions).size > 1) throw new Error('Conflicting W3 configVersion identity');
    let selected;
    try { selected = loadBundledBookConfig({ bookId: bookState.bookId, version: versions[0] }); }
    catch (error) {
      if (error instanceof Error && error.message.startsWith('Unknown bundled book config:')) throw new Error('Configured or unknown book requires its frozen W0 snapshot');
      throw error;
    }
    const selectedFormat = bookState.formatId ?? selected.defaultFormatId;
    for (const selection of declaredSelections) if (selection.formatId && selection.formatId !== selectedFormat) throw new Error('W3 requested format conflicts with selected W0');
    if (!selected.formats[selectedFormat]) throw new Error(`Unknown configured format ${selectedFormat}`);
    if (selected.rendering.recipe || !isHistoricalBookConfigRef({ bookId: selected.bookId, version: selected.version, formatId: selectedFormat })) {
      throw new Error('Configured or unknown book requires its frozen W0 snapshot');
    }
  }
  const renderSnapshot = normalizedOneManifest?.renderSnapshot;
  if (renderSnapshot) {
    const frozen = normalizedOneManifest!;
    const frozenHash = frozen.characterHash;
    if (!frozenHash) throw new Error('W3 configured rendering requires a frozen W0 character identity');
    const declared = (value: unknown, expected: string, label: string) => {
      if (value === undefined || value === null || value === '') return;
      if (typeof value !== 'string' || !value.trim() || value.trim() !== expected) throw new Error(`W3 ${label} conflicts with frozen W0`);
    };
    const prefix = renderSnapshot.bookConfig.assets.generated.orderPrefix.replaceAll('{orderId}', frozen.orderId!);
    const expectedW0Key = buildManifestKeyFromOrderPrefix(prefix, '1');
    if (explicitOrderPrefix !== undefined && explicitOrderPrefix !== prefix) throw new Error('W3 order prefix conflicts with frozen W0');
    if (loadedOneManifest.manifestKey !== expectedW0Key) throw new Error('W3 selected W0 manifest key conflicts with frozen W0');
    if (loaded2B.manifestKey !== buildManifestKeyFromOrderPrefix(prefix, '2b')) throw new Error('W3 selected W2B manifest key conflicts with frozen W0');
    for (const carrier of [primary, nested]) {
      const selection = inspectWorkflowBookIdentity(carrier);
      assertWorkflowMatchesW0({ ...selection, orderId: selection.orderId ?? explicitOrderId }, frozen,
        loadedOneManifest.manifest, expectedW0Key, 'W3');
      for (const context of workflowBookContexts(carrier)) {
        for (const field of ['orderId', 'order_id']) declared(context[field], frozen.orderId!, 'child order identity');
        for (const field of ['bookId', 'book_id']) declared(context[field], frozen.bookId!, 'book identity');
        for (const field of ['formatId', 'format_id']) declared(context[field], frozen.formatId!, 'format identity');
        for (const field of ['rootOrderId', 'root_order_id']) declared(context[field], frozen.rootOrderId!, 'root order identity');
        for (const field of ['amazonOrderId', 'amazon_order_id']) {
          if (context[field] !== undefined && context[field] !== null && context[field] !== '') declared(context[field], frozen.amazonOrderId ?? '', 'Amazon root identity');
        }
        for (const field of ['characterHash', 'character_hash']) declared(context[field], frozenHash, 'character identity');
        for (const field of ['characterSpecs', 'character_specs']) {
          const value = context[field];
          if (value === undefined || value === null || value === '') continue;
          if (!isRecord(value) || Object.keys(value).length && stableBookValue(value) !== stableBookValue(frozen.characterSpecs)) throw new Error('W3 character specs conflict with frozen W0');
        }
      }
    }
    declared(identity.characterHash, frozenHash, 'character identity');
    const currentOrder = pickJsonRecord(loaded2B.manifest.order);
    // Reused manifests may retain a source orderId only at the top level.
    declared(currentOrder.orderId ?? loaded2B.manifest.orderId, frozen.orderId!, 'W2B child order identity');
    for (const context of [loaded2B.manifest, currentOrder]) {
      declared(context.characterHash, frozenHash, 'W2B character identity');
      declared(context.bookId, frozen.bookId!, 'W2B book identity');
      declared(context.formatId, frozen.formatId!, 'W2B format identity');
      if (context.configVersion !== undefined && Number(context.configVersion) !== frozen.configVersion) throw new Error('W3 W2B configVersion conflicts with frozen W0');
    }
    const required = new Set([...bookState.requiredPoseNumbers,
      ...renderSnapshot.bookConfig.formats[renderSnapshot.formatId].interior.pageSequence.flatMap(pagePoseNumbers),
      ...coverPoseNumbers(renderSnapshot.bookConfig.rendering.recipe!.covers[renderSnapshot.formatId].layers)]);
    const allowed = new Set([0, ...Object.values(renderSnapshot.bookConfig.rendering.recipe!.poses).map(pose => pose.poseNumber)]);
    const seen = new Set<number>();
    for (const entry of loaded2B.manifest.entries) {
      const number = typeof entry.poseNumber === 'string' && /^\d+$/.test(entry.poseNumber.trim()) ? Number(entry.poseNumber.trim()) : entry.poseNumber;
      if (typeof number !== 'number' || !Number.isSafeInteger(number) || !allowed.has(number) || seen.has(number)) throw new Error('W3 configured pose identity is invalid or duplicated');
      seen.add(number);
      declared(entry.characterHash, frozenHash, 'pose character identity');
      if (required.has(number) && !toTrimmedString(entry.bgRemovedKey)) throw new Error(`W3 configured required pose ${number} has no background-removed asset`);
      if (entry.bgRemovedKey !== undefined && entry.bgRemovedKey !== null && entry.bgRemovedKey !== '' && entry.bgRemovedKey !== buildBgRemovedPoseAssetKey(frozenHash, number, frozen.bookId!)) {
        // Same fail-closed rejection; the message names which identity failed.
        const otherPoseKey = [...allowed].some(candidate => candidate !== number && entry.bgRemovedKey === buildBgRemovedPoseAssetKey(frozenHash, candidate, frozen.bookId!));
        throw new Error(otherPoseKey
          ? 'W3 configured pose identity conflicts with manifest entry: background-removed key belongs to another pose'
          : 'W3 configured pose key character identity is unverified or conflicts with frozen W0');
      }
      for (const value of [entry.approvedKey, entry.sourceApprovedKey]) {
        const key = toTrimmedString(value);
        if (key && (!key.startsWith(`${frozen.bookId}/order-generated-assets/characters/${frozenHash}/`) || key.split('/').some(part => part === '.' || part === '..'))) throw new Error('W3 configured source pose key conflicts with frozen W0');
        const generated = key?.match(/\/poses\/pose(\d{2})(?:_r\d+|_TRY\d+)?\.png$/i);
        const backgroundRemoved = key?.match(/\/characters_[^/]+_pose(\d{2})_nobg\.png$/);
        if (generated && Number(generated[1]) !== number || backgroundRemoved && key !== buildBgRemovedPoseAssetKey(frozenHash, number, frozen.bookId!)) throw new Error('W3 configured source pose identity conflicts with manifest entry');
      }
    }
    // Missing zero uses the existing canonical book/hash fallback; explicit entries remain checked above.
    for (const number of required) if (number !== 0 && !seen.has(number)) throw new Error(`W3 configured required pose ${number} is missing from the manifest`);
  }
  if (!renderSnapshot) {
    const manifestOrder = pickJsonRecord(loaded2B.manifest.order);
    // A reused 2B manifest rewrites order.orderId, but may retain the source
    // orderId at the top level. Do not confuse that with the current order.
    const manifestOrderId = toTrimmedString(manifestOrder.orderId) ?? toTrimmedString(loaded2B.manifest.orderId);
    const primaryOrderData = pickJsonRecord(primary.orderData);
    const nestedOrderData = pickJsonRecord(nested.orderData);
    for (const value of [explicitOrderId, primary.orderId, primary.order_id, nested.orderId, nested.order_id,
      primaryOrderData.orderId, primaryOrderData.order_id, nestedOrderData.orderId, nestedOrderData.order_id,
      orderContext.orderId, orderContext.order_id, normalizedOneManifest?.orderId, manifestOrderId]) {
      const declared = toTrimmedString(value);
      if (declared && declared !== identity.orderId) throw new Error('W3 legacy order identity conflicts with sibling manifest');
    }
    const expectedHash = normalizedOneManifest?.characterHash ?? identity.characterHash;
    const rawW0 = pickJsonRecord(loadedOneManifest.manifest);
    const rawW0Order = pickJsonRecord(rawW0.order);
    for (const value of [identity.characterHash, primary.characterHash, nested.characterHash,
      primaryOrderData.characterHash, nestedOrderData.characterHash, orderContext.characterHash,
      loaded2B.manifest.characterHash, manifestOrder.characterHash, rawW0.characterHash, rawW0Order.characterHash]) {
      const declared = toTrimmedString(value);
      if (declared && declared !== expectedHash) throw new Error('W3 legacy character identity conflicts with W0');
    }
    for (const entry of loaded2B.manifest.entries) {
      const entryHash = toTrimmedString(entry.characterHash);
      if (entryHash && entryHash !== expectedHash) throw new Error('W3 legacy pose character identity conflicts with W0');
      for (const value of [entry.bgRemovedKey, entry.approvedKey, entry.sourceApprovedKey]) {
        const key = toTrimmedString(value);
        const prefix = `${bookState.bookId}/order-generated-assets/characters/${expectedHash}/`;
        if (key && (!key.startsWith(prefix) || key.length === prefix.length || key.split('/').some(part => part === '.' || part === '..'))) {
          throw new Error('W3 legacy pose character identity conflicts with W0');
        }
      }
    }
  }
  // Check every configured asset before normalization can write any of them.
  // Repaired noncanonical keys need a separately verified ownership record.
  if (renderSnapshot) {
    const frozenHash = normalizedOneManifest?.characterHash;
    if (!frozenHash) throw new Error('W3 configured rendering requires a frozen W0 character identity');
    const recipe = renderSnapshot.bookConfig.rendering.recipe!;
    const frozenPages = renderSnapshot.bookConfig.formats[renderSnapshot.formatId].interior.pageSequence;
    const requiredPoses = new Set([
      ...bookState.requiredPoseNumbers,
      ...frozenPages.flatMap(pagePoseNumbers),
      ...coverPoseNumbers(recipe.covers[renderSnapshot.formatId].layers),
    ]);
    const allowedPoses = new Set([
      0,
      ...requiredPoses,
      ...Object.values(recipe.poses).map(pose => pose.poseNumber),
    ]);
    const manifestOrder = pickJsonRecord(loaded2B.manifest.order);
    const primaryOrderData = pickJsonRecord(primary.orderData);
    const nestedOrderData = pickJsonRecord(nested.orderData);
    for (const value of [identity.characterHash, primary.characterHash, nested.characterHash,
      primaryOrderData.characterHash, nestedOrderData.characterHash, orderContext.characterHash,
      loaded2B.manifest.characterHash, manifestOrder.characterHash]) {
      const declared = toTrimmedString(value);
      if (declared && declared !== frozenHash) throw new Error('W3 character identity conflicts with frozen W0');
    }
    const seenPoseNumbers = new Set<number>();
    for (const entry of loaded2B.manifest.entries) {
      const rawPoseNumber = entry.poseNumber;
      const entryPoseNumber = typeof rawPoseNumber === 'number' ? rawPoseNumber :
        typeof rawPoseNumber === 'string' && /^\d+$/.test(rawPoseNumber.trim()) ? Number(rawPoseNumber.trim()) : NaN;
      if (!Number.isInteger(entryPoseNumber) || !allowedPoses.has(entryPoseNumber)) {
        throw new Error('Invalid or unknown W3 configured pose entry');
      }
      if (seenPoseNumbers.has(entryPoseNumber)) throw new Error('Duplicate W3 configured pose entry');
      seenPoseNumbers.add(entryPoseNumber);
      const entryCharacter = toTrimmedString(entry.characterHash);
      if (entryCharacter && entryCharacter !== frozenHash) {
        throw new Error('W3 pose character identity conflicts with frozen W0');
      }
      const bgRemovedKey = toTrimmedString(entry.bgRemovedKey);
      if (requiredPoses.has(entryPoseNumber) && !bgRemovedKey) {
        throw new Error(`W3 configured required pose ${entryPoseNumber} has no background-removed asset`);
      }
      if (bgRemovedKey && (entryPoseNumber === null || entryPoseNumber < 0 || entryPoseNumber > 99 ||
          bgRemovedKey !== buildBgRemovedPoseAssetKey(frozenHash, entryPoseNumber, bookState.bookId))) {
        throw new Error('W3 configured pose identity or character identity is unverified for background-removed key');
      }
      for (const value of [entry.bgRemovedKey, entry.approvedKey, entry.sourceApprovedKey]) {
        const key = toTrimmedString(value);
        const match = key?.match(/^([^/]+)\/order-generated-assets\/characters\/([^/]+)\//);
        if (match && (match[1] !== bookState.bookId || match[2] !== frozenHash)) {
          throw new Error('W3 pose character identity conflicts with frozen W0');
        }
        const poseFile = key?.match(/\/characters_[^/]+_pose(\d{2})_nobg\.png$/);
        const poseNumber = toInteger(entry.poseNumber);
        if (match && poseFile && (poseNumber !== Number(poseFile[1]) ||
          key !== buildBgRemovedPoseAssetKey(frozenHash, poseNumber, bookState.bookId))) {
          throw new Error('W3 pose identity conflicts with manifest entry');
        }
        const generatedPoseFile = key?.match(/\/poses\/pose(\d{2})(?:_r\d+|_TRY\d+)?\.png$/i);
        if (match && generatedPoseFile && poseNumber !== Number(generatedPoseFile[1])) {
          throw new Error('W3 generated pose identity conflicts with manifest entry');
        }
      }
    }
    for (const poseNumber of requiredPoses) {
      if (poseNumber !== 0 && !seenPoseNumbers.has(poseNumber)) {
        throw new Error(`W3 configured required pose ${poseNumber} is missing from the manifest`);
      }
    }
  }
  const referenceKeys = renderSnapshot ? snapshotPoseReferenceKeys(renderSnapshot) : undefined;
  const usedZero = renderSnapshot ? [...bookState.pagePlan.flatMap(pagePoseNumbers), ...coverPoseNumbers(renderSnapshot.bookConfig.rendering.recipe!.covers[renderSnapshot.formatId].layers)].includes(0) : true;
  const orderPrefixResolved = resolveOrderPathContext(identity.orderId, {
    bookId: bookState.bookId,
    orderPrefix: explicitOrderPrefix,
  }).orderPrefix;
  const manifest3Key = buildManifestKeyFromOrderPrefix(orderPrefixResolved, '3');
  const manifest2bKeyResolved = loaded2B.manifestKey ?? manifest2bKey;
  const oneManifestKeyResolved = loadedOneManifest.manifestKey ?? oneManifestKey;
  await normalizeBgRemovedPoses(
    loaded2B.manifest,
    bookState.requiredPoseNumbers,
    bookState.bookId,
    options.normalizePoseScale,
    referenceKeys,
  );
  if (usedZero) await normalizeCoverPose00(
    identity.characterHash,
    bookState.bookId,
    options.normalizePoseScale,
    referenceKeys,
  );
  const { processedImages, missingBgRemovedPoseNumbers } = buildProcessedImages(
    loaded2B.manifest,
    bookState.requiredPoseNumbers,
    backendUrl,
  );

  if (!processedImages.length && !(normalizedOneManifest?.renderSnapshot && bookState.requiredPoseNumbers.length === 0)) {
    throw new Error('W3 assembly input found no processedImages in the 2B manifest');
  }

  const manifestOrder = pickJsonRecord(loaded2B.manifest.order);
  const characterSpecs = pickJsonRecord(
    primary.characterSpecs,
    nested.characterSpecs,
    pickJsonRecord(primary.orderData).characterSpecs,
    pickJsonRecord(nested.orderData).characterSpecs,
    orderContext.characterSpecs,
    normalizedOneManifest?.characterSpecs,
    manifestOrder.characterSpecs,
  );
  const bookSpecs = pickJsonRecord(
    primary.bookSpecs,
    nested.bookSpecs,
    pickJsonRecord(primary.orderData).bookSpecs,
    pickJsonRecord(nested.orderData).bookSpecs,
    orderContext.bookSpecs,
    normalizedOneManifest?.bookSpecs,
    manifestOrder.bookSpecs,
  );
  const orderDetails = pickJsonRecord(
    primary.orderDetails,
    nested.orderDetails,
    pickJsonRecord(primary.orderData).orderDetails,
    pickJsonRecord(nested.orderData).orderDetails,
    orderContext.orderDetails,
    normalizedOneManifest?.orderDetails,
    manifestOrder.orderDetails,
  );
  const canonicalAmazonOrderId = bookState.isAmazonOrder
    ? identity.amazonOrderId
    : null;
  const canonicalRootOrderId = bookState.isAmazonOrder
    ? identity.rootOrderId
    : identity.orderId;

  return {
    orderId: identity.orderId,
    amazonOrderId: canonicalAmazonOrderId,
    rootOrderId: canonicalRootOrderId,
    characterHash: identity.characterHash,
    bookId: bookState.bookId,
    formatId: bookState.formatId,
    ...(normalizedOneManifest?.renderSnapshot ? { renderSnapshot: normalizedOneManifest.renderSnapshot, configVersion: normalizedOneManifest.configVersion } : {}),
    orderPrefix: orderPrefixResolved,
    orderR2BaseKey: orderPrefixResolved,
    oneManifestKey: oneManifestKeyResolved,
    oneManifestUrl: loadedOneManifest.manifest
      ? buildManifestApiUrlAbsolute(backendUrl, oneManifestKeyResolved)
      : loadedOneManifest.manifestKey
        ? buildManifestApiUrlAbsolute(backendUrl, loadedOneManifest.manifestKey)
        : null,
    oneManifestSchema: normalizedOneManifest?.schema ?? null,
    manifest2bKey: manifest2bKeyResolved,
    manifest2bUrl: buildManifestApiUrlAbsolute(backendUrl, manifest2bKeyResolved),
    manifest3Key,
    manifest3Url: buildManifestApiUrlAbsolute(backendUrl, manifest3Key),
    backendUrl,
    isAmazonOrder: bookState.isAmazonOrder,
    expectedPageCount: bookState.expectedPageCount,
    pagePlan: bookState.pagePlan,
    pageLabels: bookState.pageLabels,
    pagePlanSource: bookState.pagePlanSource,
    requiredPoseNumbers: bookState.requiredPoseNumbers,
    requiredPoseSource: bookState.requiredPoseSource,
    processedImages,
    missingBgRemovedPoseNumbers,
    dedicationText: normalizeDedicationText(
      primary.dedicationText,
      nested.dedicationText,
      orderContext.dedicationText,
      normalizedOneManifest?.dedication?.text,
      pickJsonRecord(primary.orderData).dedicationText,
      pickJsonRecord(nested.orderData).dedicationText,
    ),
    testMode,
    testModePages,
    characterSpecs,
    bookSpecs: {
      ...bookSpecs,
      formatId: bookState.formatId ?? bookSpecs.formatId ?? null,
      totalPages: bookState.expectedPageCount,
    },
    orderDetails,
    publicR2Url: toTrimmedString(
      pickFirstNonEmpty(
        primary.publicR2Url,
        nested.publicR2Url,
        orderContext.publicR2Url,
        manifestOrder.publicR2Url,
      ),
    ),
    marketplace_id: bookState.marketplace_id,
  };
}
