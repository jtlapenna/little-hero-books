type JsonRecord = Record<string, unknown>;

const DEFAULT_BACKEND_URL = 'https://admin.littleherolabs.com';

export interface PrepareW3AssemblyRunResult extends JsonRecord {
  orderId: string;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  characterHash: string;
  status: 'book_assembly_in_progress';
  assemblyStartedAt: string;
  pagesGenerated: number;
  totalPagesRequired: number;
  assemblyProgress: number;
  processedImages: JsonRecord[];
  pagePlan: JsonRecord[];
  pageLabels: unknown[];
  pagePlanSource: string;
  requiredPoseNumbers: unknown[];
  requiredPoseSource: string;
  dedicationText: string | null;
  testModePages: number;
  isAmazonOrder: boolean;
  expectedPageCount: number;
}

export interface CollectW3PreviewImagesInput extends JsonRecord {
  current?: JsonRecord;
  ready?: JsonRecord;
  build?: JsonRecord;
  previewItems?: unknown[];
  cloudflareItems?: unknown[];
}

export interface CollectW3PreviewImagesResult extends JsonRecord {
  orderId: string;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  status: 'book_assembly_in_progress' | 'book_assembly_previews_ready';
  assemblyStartedAt: string;
  pagesGenerated: number;
  totalPagesRequired: number;
  assemblyProgress: number;
  totalPages: number;
  imagesCollectedAt: string;
  success: boolean;
  pagePreviewImages: JsonRecord[];
}

export interface MarkW3PreviewsReadyInput extends JsonRecord {
  current?: JsonRecord;
  collected?: JsonRecord;
  ready?: JsonRecord;
  prep?: JsonRecord;
}

export interface MarkW3PreviewsReadyResult extends JsonRecord {
  orderId: string;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  backendUrl: string;
  manifestKey: string | null;
  manifest3Url: string | null;
  manifest_3_url: string | null;
  status: 'book_assembly_previews_ready';
  bookAssemblyCompletedAt: string;
  totalPagesRequired: number;
  assemblyProgress: number;
  totalAssemblyTime: number | null;
  averageTimePerPage: number | null;
  pagesGenerated: number;
  pagePreviewImages: JsonRecord[];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function toRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(toRecord) : [];
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

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = toTrimmedString(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function extractPageNumber(value: unknown): number | null {
  const match = /p(\d+)\.png$/i.exec(String(value || ''));
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPublicUrl(
  backendUrl: string,
  publicR2Url: string | null,
  r2Key: string | null,
): string | null {
  if (!r2Key) {
    return null;
  }

  if (backendUrl) {
    return `${backendUrl}/api/assets/${r2Key}`;
  }

  if (publicR2Url) {
    return `${publicR2Url.replace(/\/$/, '')}/${r2Key}`;
  }

  return null;
}

function asOrderBase(
  ...records: JsonRecord[]
): JsonRecord {
  return Object.assign({}, ...records);
}

export function prepareW3AssemblyRun(input: JsonRecord): PrepareW3AssemblyRunResult {
  const payload = toRecord(input.body ?? input);

  const orderId = firstString(payload.orderId, payload.amazonOrderId);
  const amazonOrderId = firstString(payload.amazonOrderId);
  const rootOrderId =
    firstString(payload.rootOrderId) ??
    amazonOrderId ??
    orderId;
  const characterHash = firstString(payload.characterHash);
  const processedImages = toRecords(payload.processedImages);
  const pagePlan = toRecords(payload.pagePlan);
  const pageLabels = Array.isArray(payload.pageLabels) ? payload.pageLabels : [];
  const requiredPoseNumbers = Array.isArray(payload.requiredPoseNumbers)
    ? payload.requiredPoseNumbers
    : [];

  let dedicationText = payload.dedicationText ?? null;
  if (dedicationText === 'null' || dedicationText === '') {
    dedicationText = null;
  }

  if (!orderId || !characterHash) {
    throw new Error('Missing required order data: orderId or characterHash');
  }

  if (!processedImages.length) {
    throw new Error('No processed images received from Workflow 2B');
  }

  const testMode = toBoolean(payload.testMode);
  const testModePages = toInteger(payload.testModePages ?? (testMode ? 2 : 0)) ?? 0;
  const numericExpected = toInteger(payload.expectedPageCount);
  const expectedPageCount =
    pagePlan.length > 0
      ? pagePlan.length
      : numericExpected && numericExpected > 0
        ? numericExpected
        : toBoolean(payload.isAmazonOrder)
          ? 17
          : 15;

  return {
    ...payload,
    status: 'book_assembly_in_progress',
    assemblyStartedAt: new Date().toISOString(),
    pagesGenerated: 0,
    totalPagesRequired: expectedPageCount,
    assemblyProgress: 0,
    orderId,
    amazonOrderId,
    rootOrderId,
    characterHash,
    processedImages,
    pagePlan,
    pageLabels,
    pagePlanSource: firstString(payload.pagePlanSource) ?? 'legacy-default',
    requiredPoseNumbers,
    requiredPoseSource: firstString(payload.requiredPoseSource) ?? 'legacy-default',
    dedicationText: typeof dedicationText === 'string' ? dedicationText : null,
    testModePages,
    isAmazonOrder: toBoolean(payload.isAmazonOrder),
    expectedPageCount,
  };
}

export function collectW3PreviewImages(
  input: CollectW3PreviewImagesInput,
): CollectW3PreviewImagesResult {
  const current = toRecord(input.current);
  const ready = toRecord(input.ready);
  const build = toRecord(input.build);
  const previewItems = toRecords(input.previewItems);
  const cloudflareItems = toRecords(input.cloudflareItems);

  const orderId =
    firstString(ready.orderId, build.orderId, current.orderId, current.amazonOrderId) ?? '';
  const amazonOrderId =
    firstString(
      ready.amazonOrderId,
      build.amazonOrderId,
      current.amazonOrderId,
      ready.rootOrderId,
      build.rootOrderId,
      orderId,
    ) ?? null;
  const rootOrderId =
    firstString(ready.rootOrderId, build.rootOrderId, current.rootOrderId, amazonOrderId) ?? amazonOrderId;

  if (!orderId) {
    throw new Error('Collect W3 preview images could not resolve current child orderId');
  }

  const availableOrderIds = [
    ...new Set(
      previewItems.map((item) => firstString(item.orderId, item.amazonOrderId) ?? 'UNKNOWN'),
    ),
  ];

  const previews = previewItems.filter((item) => {
    const itemOrderId = firstString(item.orderId, item.amazonOrderId);
    return itemOrderId === orderId;
  });

  if (!previews.length) {
    throw new Error(
      `No preview items found for orderId=${orderId}. Available orderIds: ${availableOrderIds.join(', ')}`,
    );
  }

  const base = asOrderBase(build, ready, previews[0] ?? {});
  const backendUrl =
    firstString(base.backendUrl, ready.backendUrl, build.backendUrl, current.backendUrl) ??
    DEFAULT_BACKEND_URL;
  const publicR2Url =
    firstString(base.publicR2Url, ready.publicR2Url, build.publicR2Url, current.publicR2Url) ?? null;

  const cloudflareDataMap = new Map<number, { cloudflareImageId: string | null; cloudflareImageUrl: string | null }>();
  for (const item of cloudflareItems) {
    const data = toRecord(item);
    const meta = toRecord(data.result).meta;
    const metaRecord = toRecord(meta);
    const cloudflareOrderId =
      firstString(metaRecord.orderId, data.orderId, data.amazonOrderId) ?? '';

    if (cloudflareOrderId && cloudflareOrderId !== orderId) {
      continue;
    }

    let pageNum = toInteger(metaRecord.pageNumber ?? data.pageNumber);
    if (pageNum === null) {
      pageNum = extractPageNumber(
        firstString(data.filename, toRecord(data.result).filename, data.pageImageFilename),
      );
    }
    if (pageNum === null) {
      continue;
    }

    const resultRecord = toRecord(data.result);
    const images = Array.isArray(resultRecord.images) ? resultRecord.images.map(toRecord) : [];
    cloudflareDataMap.set(pageNum, {
      cloudflareImageId:
        firstString(data.cloudflareImageId, resultRecord.id, images[0]?.id) ?? null,
      cloudflareImageUrl:
        firstString(
          data.cloudflareImageUrl,
          Array.isArray(resultRecord.variants) ? resultRecord.variants[1] : null,
          Array.isArray(resultRecord.variants) ? resultRecord.variants[0] : null,
        ) ?? null,
    });
  }

  const pagePreviewImages = previews
    .map((item) => {
      const pageNumber = toInteger(item.pageNumber);
      const r2Key = firstString(item.pageImageR2Key, item.r2Key);
      if (pageNumber === null || !r2Key) {
        return null;
      }

      const cloudflare = cloudflareDataMap.get(pageNumber);
      return {
        orderId,
        amazonOrderId,
        rootOrderId,
        pageNumber,
        r2Key,
        filename:
          firstString(item.pageImageFilename) ??
          r2Key.split('/').pop() ??
          null,
        imageUrl: toPublicUrl(backendUrl, publicR2Url, r2Key),
        cloudflareImageId: cloudflare?.cloudflareImageId ?? firstString(item.cloudflareImageId) ?? null,
        cloudflareImageUrl: cloudflare?.cloudflareImageUrl ?? firstString(item.cloudflareImageUrl) ?? null,
      };
    })
    .filter((value): value is JsonRecord => Boolean(value))
    .sort((left, right) => (toInteger(left.pageNumber) ?? 0) - (toInteger(right.pageNumber) ?? 0));

  const pagesGenerated = pagePreviewImages.length;
  const totalFromStory = Array.isArray(base.storyTexts) ? base.storyTexts.length : 0;
  const totalFromBackgrounds = Array.isArray(base.backgroundImages) ? base.backgroundImages.length : 0;
  const bookSpecs = toRecord(base.bookSpecs);
  const totalFromBookSpecs =
    toInteger(bookSpecs.totalPages) !== null
      ? Math.max((toInteger(bookSpecs.totalPages) ?? 0) - (toInteger(bookSpecs.frontMatterPages) ?? 2), 0)
      : 0;
  const totalPagesRequired =
    toInteger(current.totalPagesRequired) ??
    toInteger(ready.totalPagesRequired) ??
    toInteger(ready.expectedPageCount) ??
    Math.max(totalFromStory, totalFromBackgrounds, totalFromBookSpecs, 0) ??
    pagePreviewImages.length;
  const normalizedTotalPagesRequired =
    totalPagesRequired > 0 ? totalPagesRequired : pagePreviewImages.length;
  const assemblyProgress =
    normalizedTotalPagesRequired > 0
      ? Math.round((pagesGenerated / normalizedTotalPagesRequired) * 100) / 100
      : 0;

  return {
    ...base,
    orderId,
    amazonOrderId,
    rootOrderId,
    status:
      pagesGenerated >= normalizedTotalPagesRequired
        ? 'book_assembly_previews_ready'
        : 'book_assembly_in_progress',
    assemblyStartedAt:
      firstString(current.assemblyStartedAt, ready.assemblyStartedAt) ?? new Date().toISOString(),
    pagesGenerated,
    totalPagesRequired: normalizedTotalPagesRequired,
    assemblyProgress,
    pagePreviewImages,
    totalPages: pagePreviewImages.length,
    imagesCollectedAt: new Date().toISOString(),
    success: pagePreviewImages.length > 0,
  };
}

export function markW3PreviewsReady(
  input: MarkW3PreviewsReadyInput,
): MarkW3PreviewsReadyResult {
  const current = toRecord(input.current);
  const collected = toRecord(input.collected);
  const ready = toRecord(input.ready);
  const prep = toRecord(input.prep);

  const orderId =
    firstString(
      current.orderId,
      current.order_id,
      collected.orderId,
      ready.orderId,
      prep.orderId,
      current.amazonOrderId,
      current.amazon_order_id,
    ) ?? '';
  const amazonOrderId =
    firstString(
      current.amazonOrderId,
      current.amazon_order_id,
      collected.amazonOrderId,
      ready.amazonOrderId,
      ready.rootOrderId,
      orderId,
    ) ?? null;
  const rootOrderId =
    firstString(
      current.rootOrderId,
      current.root_order_id,
      collected.rootOrderId,
      ready.rootOrderId,
      amazonOrderId,
      orderId,
    ) ?? amazonOrderId;

  const pagePreviewImages = Array.isArray(current.pagePreviewImages)
    ? current.pagePreviewImages.map(toRecord)
    : Array.isArray(collected.pagePreviewImages)
      ? collected.pagePreviewImages.map(toRecord)
      : [];
  const pagesGenerated =
    pagePreviewImages.length ||
    toInteger(current.pagesGenerated) ||
    toInteger(collected.pagesGenerated) ||
    toInteger(current.totalPages) ||
    0;
  const totalPagesRequired =
    toInteger(current.totalPagesRequired) ??
    toInteger(collected.totalPagesRequired) ??
    toInteger(ready.totalPagesRequired) ??
    toInteger(ready.expectedPageCount) ??
    0;
  const backendUrl =
    firstString(current.backendUrl, collected.backendUrl, ready.backendUrl, prep.backendUrl) ??
    DEFAULT_BACKEND_URL;
  const manifestKey =
    firstString(current.manifestKey, prep.manifestKey, ready.manifest3Key) ?? null;
  const manifestUrl =
    firstString(
      current.manifest3Url,
      current.manifest_3_url,
      current.manifestUrl,
      prep.manifestUrl,
      manifestKey ? `${backendUrl}/api/manifests/${manifestKey}` : null,
    ) ?? null;
  const assemblyStartedAt =
    firstString(current.assemblyStartedAt, collected.assemblyStartedAt, ready.assemblyStartedAt) ??
    null;
  const assemblyProgress =
    totalPagesRequired > 0
      ? Math.round((pagesGenerated / totalPagesRequired) * 100) / 100
      : toInteger(current.assemblyProgress) ?? toInteger(collected.assemblyProgress) ?? 0;

  const now = Date.now();
  const assemblyStartedAtMs = assemblyStartedAt ? Date.parse(assemblyStartedAt) : Number.NaN;
  const totalAssemblyTime =
    Number.isFinite(assemblyStartedAtMs) ? now - assemblyStartedAtMs : null;

  return {
    ...ready,
    ...collected,
    ...current,
    orderId,
    amazonOrderId,
    rootOrderId,
    backendUrl,
    manifestKey,
    manifest3Url: manifestUrl,
    manifest_3_url: manifestUrl,
    pagePreviewImages,
    status: 'book_assembly_previews_ready',
    bookAssemblyCompletedAt: new Date().toISOString(),
    totalPagesRequired,
    assemblyProgress,
    totalAssemblyTime,
    averageTimePerPage:
      totalAssemblyTime !== null && totalPagesRequired > 0
        ? Math.round((totalAssemblyTime / totalPagesRequired) / 1000)
        : null,
    pagesGenerated,
  };
}
