import {
  buildAssetApiUrl,
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

export interface BuildW3AssemblyInputResult {
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
  pagePlanSource: 'w0-v3' | 'legacy-default';
  requiredPoseNumbers: number[];
  requiredPoseSource: 'w0-v3' | 'legacy-default';
  processedImages: W3ProcessedImage[];
  missingBgRemovedPoseNumbers: number[];
  dedicationText: string | null;
  testMode: boolean;
  testModePages: number;
  characterSpecs: JsonRecord;
  bookSpecs: JsonRecord;
  orderDetails: JsonRecord;
  publicR2Url: string | null;
  marketplace_id: string | null;
}

export interface BuildW3AssemblyInputOptions {
  loadManifest: LoadManifestForW3;
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

function buildLegacyPagePlan(isAmazonOrder: boolean): BookPageConfig[] {
  const storyPages: BookPageConfig[] = Array.from({ length: 14 }, (_, index) => {
    const storyPageNumber = index + 1;
    const pageIndex = isAmazonOrder ? index + 3 : index + 1;

    return {
      index: pageIndex,
      id: `story_${String(storyPageNumber).padStart(2, '0')}`,
      label: `p${String(pageIndex).padStart(2, '0')}`,
      type: 'story',
      storyPageNumber,
      backgroundSlot: `story_${String(storyPageNumber).padStart(2, '0')}`,
      poseNumber:
        storyPageNumber === 7 || storyPageNumber === 13
          ? null
          : storyPageNumber < 8
            ? storyPageNumber
            : storyPageNumber - 1,
      overlaySlot: storyPageNumber === 5 ? 'animalTracks' : null,
      required: true,
    };
  });

  if (!isAmazonOrder) {
    return [
      {
        index: 0,
        id: 'dedication',
        label: 'p00',
        type: 'dedication',
        storyPageNumber: null,
        backgroundSlot: 'dedication',
        poseNumber: null,
        overlaySlot: null,
        required: true,
      },
      ...storyPages,
    ];
  }

  return [
    {
      index: 0,
      id: 'title',
      label: 'p00',
      type: 'title',
      storyPageNumber: null,
      backgroundSlot: 'titlePage',
      poseNumber: null,
      overlaySlot: null,
      required: true,
    },
    {
      index: 1,
      id: 'blank_front_matter',
      label: 'p01',
      type: 'blank',
      storyPageNumber: null,
      backgroundSlot: 'blank',
      poseNumber: null,
      overlaySlot: null,
      required: true,
    },
    {
      index: 2,
      id: 'dedication',
      label: 'p02',
      type: 'dedication',
      storyPageNumber: null,
      backgroundSlot: 'dedication',
      poseNumber: null,
      overlaySlot: null,
      required: true,
    },
    ...storyPages,
  ];
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
  pagePlanSource: 'w0-v3' | 'legacy-default';
  requiredPoseNumbers: number[];
  requiredPoseSource: 'w0-v3' | 'legacy-default';
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
  const isAmazonOrder =
    explicitIsAmazon !== null
      ? toBoolean(explicitIsAmazon)
      : formatId === 'amazon' ||
        marketplaceId === 'ATVPDKIKX0DER' ||
        toTrimmedString(manifestOrder.amazonOrderId) !== null;

  const pagePlan =
    normalizedOneManifest?.pagePlan?.length
      ? normalizedOneManifest.pagePlan
      : buildLegacyPagePlan(isAmazonOrder);
  const pageLabels =
    normalizedOneManifest?.pageLabels?.length
      ? normalizedOneManifest.pageLabels
      : pagePlan.map((page) => page.label);
  const pagePlanSource: BuildW3AssemblyInputResult['pagePlanSource'] =
    normalizedOneManifest?.pagePlan?.length ? 'w0-v3' : 'legacy-default';
  const requiredPoseNumbers =
    normalizedOneManifest?.requiredPoseNumbers?.length
      ? [...normalizedOneManifest.requiredPoseNumbers]
      : [...LEGACY_REQUIRED_2B_POSE_NUMBERS];
  const requiredPoseSource: BuildW3AssemblyInputResult['requiredPoseSource'] =
    normalizedOneManifest?.requiredPoseNumbers?.length ? 'w0-v3' : 'legacy-default';

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
    expectedPageCount: pagePlan.length || (isAmazonOrder ? 17 : 15),
  };
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
  const testModePages = toInteger(
    pickFirstNonEmpty(
      primary.testModePages,
      nested.testModePages,
      orderContext.testModePages,
      testMode ? 2 : 0,
    ),
  ) ?? 0;

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
  const orderPrefixResolved = resolveOrderPathContext(identity.orderId, {
    bookId: bookState.bookId,
    orderPrefix: explicitOrderPrefix,
  }).orderPrefix;
  const manifest3Key = buildManifestKeyFromOrderPrefix(orderPrefixResolved, '3');
  const manifest2bKeyResolved = loaded2B.manifestKey ?? manifest2bKey;
  const oneManifestKeyResolved = loadedOneManifest.manifestKey ?? oneManifestKey;
  const { processedImages, missingBgRemovedPoseNumbers } = buildProcessedImages(
    loaded2B.manifest,
    bookState.requiredPoseNumbers,
    backendUrl,
  );

  if (!processedImages.length) {
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

  return {
    orderId: identity.orderId,
    amazonOrderId: identity.amazonOrderId,
    rootOrderId: identity.rootOrderId,
    characterHash: identity.characterHash,
    bookId: bookState.bookId,
    formatId: bookState.formatId,
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
