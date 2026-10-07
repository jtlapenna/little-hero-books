import { downloadManifest } from '@/lib/r2-service';
import { extractManifestKey } from '@/lib/order-paths';
import { hasLegacyPoseProvenance } from './order-pose-context';
import { normalizeW0Manifest, type NormalizedW0Manifest } from './normalize-w0-manifest';
import { validateRenderSnapshot } from './book-render-recipe';
import { parseW3PageSelection, selectW3Pages } from './w3-page-selection';
import type { BookPageConfig } from '@/lib/books/types';
import {
  buildManifestKeyFromOrderPrefix,
  inferBookIdFromPathLikes,
} from '@/lib/order-paths';
import { resolveCanonicalBackendBaseUrl } from '@/lib/backend-url';

type JsonRecord = Record<string, unknown>;

export interface BuildW3ManifestResult extends JsonRecord {
  manifest: JsonRecord;
  orderId: string;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  bookId: string;
  formatId: string | null;
  orderR2BaseKey: string;
  characterHash: string | null;
  manifest3Key: string;
  manifest3Url: string;
  pagePreviewImages: JsonRecord[];
  pageImageUrls: string[];
  coverImage: string | null;
  coverPngR2Key: string | null;
  coverPdfR2Key: string | null;
  coverCloudflareImageId: string | null;
  coverCloudflareImageUrl: string | null;
  cloudflareImagesSummary: {
    totalItems: number;
    pagesWithCloudflare: number;
    coverHasCloudflare: boolean;
  };
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

function resolveBackendUrl(input: JsonRecord): string {
  return resolveCanonicalBackendBaseUrl(toTrimmedString(input.backendUrl));
}

function resolveOrderId(input: JsonRecord): string {
  return (
    toTrimmedString(input.orderId) ??
    toTrimmedString(input.amazonOrderId) ??
    ''
  );
}

function collectBookPathLikes(input: JsonRecord): Array<string | null | undefined> {
  const pagePreviewImages = Array.isArray(input.pagePreviewImages)
    ? input.pagePreviewImages.map(toRecord)
    : [];

  return [
    toTrimmedString(input.orderR2BaseKey),
    toTrimmedString(input.orderPrefix),
    toTrimmedString(input.manifest3Key),
    toTrimmedString(input.manifest3Url),
    toTrimmedString(input.manifestKey),
    toTrimmedString(input.oneManifestKey),
    toTrimmedString(input.oneManifestUrl),
    toTrimmedString(input.coverPngR2Key),
    toTrimmedString(input.coverImageR2Key),
    toTrimmedString(input.coverPdfR2Key),
    toTrimmedString(input.r2Key),
    toTrimmedString(input.path),
    ...pagePreviewImages.flatMap((preview) => [
      toTrimmedString(preview.r2Key),
      toTrimmedString(preview.pageImageR2Key),
      toTrimmedString(preview.imageR2Key),
      toTrimmedString(preview.key),
      toTrimmedString(preview.path),
      toTrimmedString(preview.imageUrl),
      toTrimmedString(preview.cloudflareImageUrl),
    ]),
  ];
}

function resolveBookId(input: JsonRecord, orderId: string): string {
  const explicitBookId = toTrimmedString(input.bookId);
  if (explicitBookId) {
    return explicitBookId;
  }

  const inferredBookId = inferBookIdFromPathLikes(...collectBookPathLikes(input));
  if (inferredBookId) {
    return inferredBookId;
  }

  throw new Error(`W3 manifest assembly requires bookId or per-book path context for ${orderId}`);
}

function resolveOrderR2BaseKey(input: JsonRecord, orderId: string, bookId: string): string {
  return toTrimmedString(input.orderR2BaseKey) ?? `${bookId}/orders/${orderId}`;
}

function resolveManifestKey(input: JsonRecord, orderR2BaseKey: string): string {
  return (
    toTrimmedString(input.manifest3Key) ??
    toTrimmedString(input.manifestKey) ??
    buildManifestKeyFromOrderPrefix(orderR2BaseKey, '3')
  );
}

function extractCoverCloudflare(input: JsonRecord, coverImageKey: string | null): {
  cloudflareImageId: string | null;
  cloudflareImageUrl: string | null;
} {
  if (toTrimmedString(input.coverCloudflareImageId) || toTrimmedString(input.coverCloudflareImageUrl)) {
    return {
      cloudflareImageId: toTrimmedString(input.coverCloudflareImageId),
      cloudflareImageUrl: toTrimmedString(input.coverCloudflareImageUrl),
    };
  }

  const pageType = toTrimmedString(input.pageType);
  const r2Key = toTrimmedString(input.r2Key);
  if (
    pageType === 'cover-spread' ||
    toInteger(input.pageNumber) === -1 ||
    (coverImageKey && r2Key === coverImageKey)
  ) {
    return {
      cloudflareImageId: toTrimmedString(input.cloudflareImageId),
      cloudflareImageUrl: toTrimmedString(input.cloudflareImageUrl),
    };
  }

  return {
    cloudflareImageId: null,
    cloudflareImageUrl: null,
  };
}

export interface W3ManifestOptions { intake?: NormalizedW0Manifest }
function declaresConfiguredProvenance(input: JsonRecord): boolean {
  return input.bookStatus !== undefined || input.testOnly !== undefined || input.renderingSchema !== undefined || input.selectedPageLabels !== undefined;
}
export async function resolveW3ManifestOptions(input: JsonRecord, loadManifest: (key: string) => Promise<unknown | null> = downloadManifest): Promise<W3ManifestOptions> {
  if (input.renderSnapshot !== undefined) return {};
  if (declaresConfiguredProvenance(input)) throw new Error('Configured W3 manifest lost its frozen render snapshot');
  const bookId = resolveBookId(input, resolveOrderId(input));
  if (hasLegacyPoseProvenance(bookId)) return {};
  const hint = toTrimmedString(input.oneManifestKey) ?? toTrimmedString(input.oneManifestUrl);
  const key = hint ? extractManifestKey(hint) : null;
  if (!key) throw new Error('W3 manifest requires frozen intake provenance');
  const raw = await loadManifest(key);
  if (!raw) throw new Error('W3 manifest requires readable frozen intake provenance');
  return { intake: normalizeW0Manifest(raw, { fallbackManifestKey: key }) };
}
export function buildW3Manifest(input: JsonRecord, options: W3ManifestOptions = {}): BuildW3ManifestResult {
  const orderId = resolveOrderId(input);
  if (!orderId) {
    throw new Error('W3 manifest assembly requires orderId');
  }

  const backendUrl = resolveBackendUrl(input);
  const amazonOrderId = toTrimmedString(input.amazonOrderId);
  const rootOrderId = toTrimmedString(input.rootOrderId) ?? amazonOrderId ?? orderId;
  const bookId = resolveBookId(input, orderId);
  const formatId = toTrimmedString(input.formatId);
  const orderR2BaseKey = resolveOrderR2BaseKey(input, orderId, bookId);
  const manifest3Key = resolveManifestKey(input, orderR2BaseKey);
  const manifest3Url =
    toTrimmedString(input.manifest3Url) ??
    toTrimmedString(input.manifest_3_url) ??
    `${backendUrl}/api/manifests/${manifest3Key}`;
  if (input.renderSnapshot === undefined && declaresConfiguredProvenance(input)) throw new Error('Configured W3 manifest lost its frozen render snapshot');
  const snapshotValue = input.renderSnapshot !== undefined ? input.renderSnapshot : options.intake?.renderSnapshot;
  if (snapshotValue === undefined && !hasLegacyPoseProvenance(bookId, options.intake)) throw new Error('W3 manifest requires validated frozen intake provenance');
  const frozen = snapshotValue === undefined ? undefined : validateRenderSnapshot(snapshotValue, { bookId, formatId, version: input.configVersion == null ? undefined : Number(input.configVersion) });
  const pagePlan = frozen ? frozen.bookConfig.formats[frozen.formatId].interior.pageSequence :
    Array.isArray(input.pagePlan) && input.pagePlan.length > 0
      ? (input.pagePlan as BookPageConfig[])
      : [];
  const pageLabels = frozen ? pagePlan.map(page => page.label) :
    Array.isArray(input.pageLabels)
      ? input.pageLabels
      : pagePlan.map((page) => page.label);
  const requiredPoseNumbers = Array.isArray(input.requiredPoseNumbers)
    ? input.requiredPoseNumbers
    : [];
  const requiredPoseSource = toTrimmedString(input.requiredPoseSource) ?? 'legacy-default';
  const oneManifestKey = toTrimmedString(input.oneManifestKey);
  const pagePreviewImages = Array.isArray(input.pagePreviewImages)
    ? input.pagePreviewImages.map(toRecord)
    : [];
  const coverPreviewItem = toRecord(input.coverPreviewItem);
  const coverImageKey =
    toTrimmedString(input.coverPngR2Key) ??
    toTrimmedString(input.coverImageR2Key) ??
    toTrimmedString(coverPreviewItem.coverPngR2Key) ??
    toTrimmedString(coverPreviewItem.coverImageR2Key) ??
    (toTrimmedString(input.pageType) === 'cover-spread' ? toTrimmedString(input.r2Key) : null);
  const coverPdfKey =
    toTrimmedString(input.coverPdfR2Key) ??
    toTrimmedString(coverPreviewItem.coverPdfR2Key);
  const coverCloudflare = extractCoverCloudflare(input, coverImageKey);

  const pagePlanByNumber = new Map(
    pagePlan
      .filter((page) => Number.isFinite(Number(page.index)))
      .map((page) => [Number(page.index), page]),
  );
  const pageIdForNumber = (pageNumber: number): string => {
    const fromPlan = pagePlanByNumber.get(pageNumber);
    if (fromPlan?.label) {
      return String(fromPlan.label);
    }
    const fallbackLabel = pageLabels[pageNumber];
    if (typeof fallbackLabel === 'string' && fallbackLabel.trim()) {
      return fallbackLabel;
    }
    return `p${String(pageNumber).padStart(2, '0')}`;
  };

  const pageImageUrls = pagePreviewImages
    .map((preview) => {
      const cloudflareUrl = toTrimmedString(preview.cloudflareImageUrl);
      if (cloudflareUrl) {
        return cloudflareUrl;
      }
      const key =
        toTrimmedString(preview.r2Key) ??
        toTrimmedString(preview.pageImageR2Key) ??
        toTrimmedString(preview.imageR2Key) ??
        toTrimmedString(preview.key) ??
        toTrimmedString(preview.path);
      if (!key) {
        return null;
      }
      return `${backendUrl}/api/assets/${key}`;
    })
    .filter((value): value is string => !!value);

  const pages: Record<string, string> = {};
  const pagesWithCloudflare: Record<string, { cloudflareImageId: string | null; cloudflareImageUrl: string | null }> = {};

  for (const preview of pagePreviewImages) {
    const pageNumber = toInteger(preview.pageNumber);
    if (pageNumber === null || pageNumber < 0) {
      continue;
    }
    const key =
      toTrimmedString(preview.r2Key) ??
      toTrimmedString(preview.pageImageR2Key) ??
      toTrimmedString(preview.imageR2Key) ??
      toTrimmedString(preview.key) ??
      toTrimmedString(preview.path);
    if (!key) {
      continue;
    }

    const pageId = pageIdForNumber(pageNumber);
    if (frozen && (!pagePlanByNumber.has(pageNumber) || pages[pageId])) throw new Error('Configured preview contains an unknown or duplicate page');
    pages[pageId] = key;

    const pageMeta = pagePlanByNumber.get(pageNumber) ?? null;
    if (pageNumber === 0 && (!pageMeta || String(pageMeta.type || '') === 'dedication')) {
      pages.p00_dedication = key;
    }

    const cloudflareImageId = toTrimmedString(preview.cloudflareImageId);
    const cloudflareImageUrl = toTrimmedString(preview.cloudflareImageUrl);
    if (cloudflareImageId || cloudflareImageUrl) {
      const entry = {
        cloudflareImageId,
        cloudflareImageUrl,
      };
      pagesWithCloudflare[pageId] = entry;
      if (pageNumber === 0 && (!pageMeta || String(pageMeta.type || '') === 'dedication')) {
        pagesWithCloudflare.p00_dedication = entry;
      }
    }
  }

  const overlayImages = Array.isArray(input.overlayImages)
    ? input.overlayImages.map(toRecord)
    : [];
  const renderContext = toRecord(input.renderContext);
  const assetsUsed = {
    font: toTrimmedString(renderContext.font) ?? `${bookId}/fonts/CustomBook.ttf`,
    coversBg: toTrimmedString(renderContext.coversBg) ?? `${bookId}/backgrounds/page00-covers.jpg`,
    coversBgAmazon: toTrimmedString(renderContext.coversBgAmazon),
    dedicationBg:
      toTrimmedString(renderContext.dedicationBg) ??
      `${bookId}/backgrounds/page00-dedication.jpeg`,
    pose00: toTrimmedString(renderContext.pose00),
    overlays: overlayImages
      .map((entry) => toTrimmedString(entry.r2Key))
      .filter((value): value is string => !!value),
  };

  const selectedPageLabels = frozen ? selectW3Pages(pagePlan, parseW3PageSelection(input.testModePages)).map(page => page.label) : undefined;
  const fullConfiguredOutput = frozen ? pagePlan.every(page => Boolean(pages[page.label])) && pagePlan.length === pagePreviewImages.length && Boolean(coverImageKey) : true;
  const configuredReady = frozen ? frozen.bookConfig.status === 'active' && !frozen.testOnly && input.testOnly !== true && options.intake?.bookSpecs.testMode !== true && input.testMode !== true && toRecord(input.bookSpecs).testMode !== true && fullConfiguredOutput && selectedPageLabels?.length === pagePlan.length : true;
  const nowIso = new Date().toISOString();
  const manifest = {
    schema: 'lhb.run-manifest@v2.0',
    runStamp: nowIso,
    orderId,
    rootOrderId,
    amazonOrderId,
    characterHash: toTrimmedString(input.characterHash),
    bookId,
    formatId,
    orderR2BaseKey,
    oneManifestKey,
    pageLabels,
    ...(frozen ? { renderSnapshot: frozen, configVersion: frozen.bookConfig.version, bookStatus: frozen.bookConfig.status, selectedPageLabels, testOnly: frozen.bookConfig.status === 'draft' || !configuredReady } : {}),
    pagePlan,
    requiredPoseNumbers,
    requiredPoseSource,
    pngGeneration: {
      sizeInterior: frozen?.bookConfig.rendering.preview.interiorPx ?? { w: 2625, h: 2625 },
      sizeCover: frozen?.bookConfig.rendering.preview.coverPx ?? { w: 5203, h: 2625 },
      pages,
      pagesWithCloudflare,
      coverSpreadImage: coverImageKey,
      coverCloudflareImageId: coverCloudflare.cloudflareImageId,
      coverCloudflareImageUrl: coverCloudflare.cloudflareImageUrl,
    },
    pdfGeneration: {
      coverPdf: coverPdfKey,
    },
    assetsUsed,
    pages,
    summary: {
      percentComplete: frozen && selectedPageLabels?.length ? Math.min(100, Math.round(selectedPageLabels.filter(label => pages[label]).length / selectedPageLabels.length * 100)) : 100,
      readyForBook: configuredReady,
      needsHumanReview: true,
    },
    generatedAt: nowIso,
  };

  const pageCloudflareCount = Object.keys(pagesWithCloudflare).length;

  return {
    ...input,
    manifest,
    orderId,
    amazonOrderId,
    rootOrderId,
    bookId,
    formatId,
    orderR2BaseKey,
    characterHash: toTrimmedString(input.characterHash),
    manifest3Key,
    manifest3Url,
    pagePreviewImages,
    pageImageUrls,
    coverImage: coverImageKey,
    coverPngR2Key: coverImageKey,
    coverPdfR2Key: coverPdfKey,
    coverCloudflareImageId: coverCloudflare.cloudflareImageId,
    coverCloudflareImageUrl: coverCloudflare.cloudflareImageUrl,
    cloudflareImagesSummary: {
      totalItems: pageCloudflareCount + (coverCloudflare.cloudflareImageId || coverCloudflare.cloudflareImageUrl ? 1 : 0),
      pagesWithCloudflare: pageCloudflareCount,
      coverHasCloudflare: !!(coverCloudflare.cloudflareImageId || coverCloudflare.cloudflareImageUrl),
    },
  };
}
