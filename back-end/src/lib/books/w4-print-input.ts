import {
  buildAssetApiUrl,
  buildManifestKeyCandidates,
  buildManifestKeyFromOrderPrefix,
  buildPreviewImageAssetKey,
  collectOrderPathLikes,
  extractManifestKey,
  resolveOrderPathContext,
} from '@/lib/order-paths';
import {
  normalizeW0Manifest,
  type NormalizedW0Manifest,
} from '@/lib/books/normalize-w0-manifest';
import type { BookPageConfig } from '@/lib/books/types';
import { resolveCanonicalBackendBaseUrl } from '@/lib/backend-url';

type JsonRecord = Record<string, unknown>;

export type LoadManifestForW4 = (manifestKey: string) => Promise<unknown | null>;
export type LoadOrderForW4 = (orderId: string) => Promise<unknown | null>;

export interface BuildW4PrintInputResult {
  [key: string]: unknown;
  orderId: string;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  characterHash: string | null;
  bookId: string;
  formatId: string | null;
  orderPrefix: string;
  orderR2BaseKey: string;
  oneManifestKey: string | null;
  oneManifestUrl: string | null;
  oneManifestSchema: string | null;
  manifest3Key: string;
  manifest3Url: string;
  manifest4Key: string;
  manifest4Url: string;
  backendUrl: string;
  isAmazonOrder: boolean;
  expectedPageCount: number;
  pageLabels: string[];
  pagePlan: BookPageConfig[];
  pageImageUrls: string[];
  pagePreviewImageKeys: string[];
  pagesGenerated: number;
  coverPreviewUrl: string;
  coverPreviewImageKey: string;
  coverPreviewImageUrls: string[];
  interiorPreviewImageUrls: string[];
  coverPdfFilename: string;
  coverPdfR2Key: string;
  pdfFilename: string;
  pdfR2Key: string;
  shippingAddress: JsonRecord;
  customer: {
    email: string | null;
    name: string | null;
  };
  title: string;
  marketplace_id: string | null;
  hasP00: boolean;
  hasPagesWithCloudflare: boolean;
  shipping_tier: string | null;
  shippingTier: string | null;
  ShipmentServiceLevelCategory: string | null;
  ShipServiceLevel: string | null;
  amazon_shipment_service_level: string | null;
  summary: JsonRecord;
  pages: JsonRecord;
  pagesWithCloudflare: JsonRecord;
  pngGeneration: JsonRecord;
  pdfGeneration: JsonRecord;
  bookSpecs: JsonRecord;
  orderDetails: JsonRecord;
  characterSpecs: JsonRecord;
  CONFIG?: JsonRecord;
  generatedAt: string | null;
  runStamp: string | null;
  workflow: string | null;
  orderDbId: number | null;
}

export interface BuildW4PrintInputOptions {
  loadManifest: LoadManifestForW4;
  loadOrder?: LoadOrderForW4;
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

function toObject(value: unknown): JsonRecord | undefined {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
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

function buildManifestApiUrlAbsolute(backendUrl: string, manifestKey: string): string {
  return buildAbsoluteApiUrl(
    backendUrl,
    `api/manifests/${manifestKey.replace(/^\/+/, '')}`,
  );
}

function buildAssetApiUrlAbsolute(backendUrl: string, assetKey: string): string {
  return buildAbsoluteApiUrl(backendUrl, buildAssetApiUrl(assetKey));
}

function normalizeShippingAddress(rawShipping: unknown): JsonRecord {
  const shipping =
    toObject(rawShipping) ??
    (typeof rawShipping === 'string' ? toObject(rawShipping) : undefined) ??
    {};

  const normalized: JsonRecord = { ...shipping };
  const firstNonEmptyString = (...values: unknown[]) =>
    toTrimmedString(pickFirstNonEmpty(...values));

  const addressLine1 = firstNonEmptyString(
    shipping.address_line_1,
    shipping.address_line1,
    shipping.address1,
    shipping.street1,
    shipping.street,
    shipping.address,
  );
  const addressLine2 = firstNonEmptyString(
    shipping.address_line_2,
    shipping.address_line2,
    shipping.address2,
    shipping.street2,
  );
  const city = firstNonEmptyString(shipping.city);
  const stateCode = firstNonEmptyString(shipping.state_code, shipping.state);
  const postalCode = firstNonEmptyString(
    shipping.postal_code,
    shipping.postcode,
    shipping.zip,
  );
  const countryCode = firstNonEmptyString(
    shipping.country_code,
    shipping.country,
  );
  const name = firstNonEmptyString(
    shipping.name,
    shipping.recipient_name,
  );
  const phone = firstNonEmptyString(
    shipping.phone_number,
    shipping.phone,
    shipping.phoneNumber,
  );
  const email = firstNonEmptyString(shipping.email);

  if (addressLine1) {
    normalized.address_line_1 = addressLine1;
    normalized.address_line1 = addressLine1;
    normalized.address = addressLine1;
    normalized.street1 = addressLine1;
  }
  if (addressLine2) {
    normalized.address_line_2 = addressLine2;
    normalized.address_line2 = addressLine2;
    normalized.address2 = addressLine2;
    normalized.street2 = addressLine2;
  }
  if (city) {
    normalized.city = city;
  }
  if (stateCode) {
    normalized.state_code = stateCode;
    normalized.state = stateCode;
  }
  if (postalCode) {
    normalized.postal_code = postalCode;
    normalized.postcode = postalCode;
    normalized.zip = postalCode;
  }
  if (countryCode) {
    normalized.country_code = countryCode;
    normalized.country = countryCode;
  }
  if (name) {
    normalized.name = name;
    normalized.recipient_name = name;
  }
  if (phone) {
    normalized.phone_number = phone;
    normalized.phone = phone;
    normalized.phoneNumber = phone;
  }
  if (email) {
    normalized.email = email;
  }

  return normalized;
}

function applyTestModeShippingPhoneFallback(
  shippingAddress: JsonRecord,
  config: JsonRecord,
): void {
  const defaults = pickJsonRecord(config.defaults);
  if (!toBoolean(defaults.testMode)) {
    return;
  }

  const existingPhone = toTrimmedString(
    pickFirstNonEmpty(
      shippingAddress.phone_number,
      shippingAddress.phone,
      shippingAddress.phoneNumber,
    ),
  );
  if (existingPhone) {
    return;
  }

  const fallbackPhone =
    toTrimmedString(
      pickFirstNonEmpty(defaults.testPhoneNumber, defaults.phoneNumber),
    ) ?? '555-555-5555';

  shippingAddress.phone_number = fallbackPhone;
  shippingAddress.phone = fallbackPhone;
  shippingAddress.phoneNumber = fallbackPhone;
}

function pickJsonRecord(...values: unknown[]): JsonRecord {
  for (const value of values) {
    const record = toObject(value);
    if (record) {
      return record;
    }
  }

  return {};
}

function buildDefaultPageLabels(count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    return `p${String(index).padStart(2, '0')}`;
  });
}

function canonicalizePageLabel(value: string | null | undefined): string | null {
  const label = toTrimmedString(value);
  if (!label) {
    return null;
  }

  if (label === 'p00_dedication') {
    return 'p00';
  }

  return /^p\d{2,}$/.test(label) ? label : null;
}

function pageLabelSortValue(label: string): number {
  const match = /^p(\d{2,})$/.exec(label);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number.parseInt(match[1], 10);
}

function sortPageLabels(labels: string[]): string[] {
  return [...labels].sort((left, right) => {
    const leftSort = pageLabelSortValue(left);
    const rightSort = pageLabelSortValue(right);
    if (leftSort !== rightSort) {
      return leftSort - rightSort;
    }
    return left.localeCompare(right);
  });
}

function extractPageLabelsFromPages(...pageSources: JsonRecord[]): string[] {
  const labels = new Set<string>();

  for (const pageSource of pageSources) {
    for (const key of Object.keys(pageSource)) {
      const label = canonicalizePageLabel(key);
      if (label) {
        labels.add(label);
      }
    }
  }

  return sortPageLabels([...labels]);
}

function filterPagePlanByLabels(
  pagePlan: BookPageConfig[],
  pageLabels: string[],
): BookPageConfig[] {
  if (!pagePlan.length || !pageLabels.length) {
    return [];
  }

  const pageLabelSet = new Set(pageLabels);
  return pagePlan
    .filter((page) => pageLabelSet.has(page.label))
    .sort((left, right) => left.index - right.index);
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
    toTrimmedString(primary.manifest3Url),
    toTrimmedString(primary.manifest_3_url),
    toTrimmedString(primary.manifest3Key),
    toTrimmedString(primary.manifest_3_key),
    toTrimmedString(primary.manifestKey),
    toTrimmedString(nested.manifestUrl),
    toTrimmedString(nested.originalManifestUrl),
    toTrimmedString(nested.oneManifestUrl),
    toTrimmedString(nested.one_manifest_url),
    toTrimmedString(nested.manifest3Url),
    toTrimmedString(nested.manifest_3_url),
    toTrimmedString(nested.manifest3Key),
    toTrimmedString(nested.manifest_3_key),
    toTrimmedString(nested.manifestKey),
    toTrimmedString(orderContext.manifestUrl),
    toTrimmedString(orderContext.originalManifestUrl),
    toTrimmedString(orderContext.oneManifestUrl),
    toTrimmedString(orderContext.one_manifest_url),
    toTrimmedString(orderContext.manifest3Url),
    toTrimmedString(orderContext.manifest_3_url),
    toTrimmedString(orderContext.manifest3Key),
    toTrimmedString(orderContext.manifest_3_key),
    toTrimmedString(orderContext.manifestKey),
  ]);
}

function asManifestRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`${label} must be a JSON object`);
  }

  return value;
}

async function loadFirstManifest(
  label: string,
  candidates: string[],
  loadManifest: LoadManifestForW4,
): Promise<{ manifestKey: string | null; manifest: JsonRecord | null }> {
  for (const manifestKey of candidates) {
    const loaded = await loadManifest(manifestKey).catch(() => null);
    if (!loaded || !isRecord(loaded)) {
      continue;
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

async function loadFirstOrder(
  candidates: string[],
  loadOrder?: LoadOrderForW4,
): Promise<JsonRecord | null> {
  if (!loadOrder) {
    return null;
  }

  for (const candidate of dedupeStrings(candidates)) {
    const record = await loadOrder(candidate).catch(() => null);
    if (isRecord(record)) {
      return record;
    }
  }

  return null;
}

function buildManifestPayload(
  sourcePayload: JsonRecord,
  loadedManifest: JsonRecord | null,
): JsonRecord {
  const { CONFIG: _config, body: _body, ...payloadWithoutConfig } = sourcePayload;
  return {
    ...(loadedManifest ?? {}),
    ...payloadWithoutConfig,
  };
}

function deriveIdentity(
  primary: JsonRecord,
  nested: JsonRecord,
  orderContext: JsonRecord,
  manifest3: JsonRecord,
  orderRecord: JsonRecord | null,
  normalizedOneManifest: NormalizedW0Manifest | null,
): {
  orderId: string;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  characterHash: string | null;
} {
  const orderId = toTrimmedString(
    pickFirstNonEmpty(
      primary.orderId,
      primary.order_id,
      nested.orderId,
      nested.order_id,
      orderContext.orderId,
      orderContext.order_id,
      manifest3.orderId,
      orderRecord?.orderId,
      orderRecord?.order_id,
      orderRecord?.amazon_order_id,
      normalizedOneManifest?.orderId,
      primary.amazonOrderId,
      nested.amazonOrderId,
    ),
  );
  if (!orderId) {
    throw new Error('W4 print input requires orderId');
  }

  const amazonOrderId = toTrimmedString(
    pickFirstNonEmpty(
      primary.amazonOrderId,
      primary.amazon_order_id,
      nested.amazonOrderId,
      nested.amazon_order_id,
      orderContext.amazonOrderId,
      orderContext.amazon_order_id,
      manifest3.amazonOrderId,
      orderRecord?.amazon_order_id,
      normalizedOneManifest?.amazonOrderId,
      null,
    ),
  );

  const rootOrderId = toTrimmedString(
    pickFirstNonEmpty(
      primary.rootOrderId,
      primary.root_order_id,
      nested.rootOrderId,
      nested.root_order_id,
      orderContext.rootOrderId,
      orderContext.root_order_id,
      manifest3.rootOrderId,
      orderRecord?.root_order_id,
      normalizedOneManifest?.rootOrderId,
      amazonOrderId,
      orderId,
    ),
  );

  const characterHash = toTrimmedString(
    pickFirstNonEmpty(
      primary.characterHash,
      nested.characterHash,
      orderContext.characterHash,
      manifest3.characterHash,
      orderRecord?.character_hash,
      normalizedOneManifest?.characterSpecs.characterHash,
    ),
  );

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
  manifest3: JsonRecord,
  orderRecord: JsonRecord | null,
  normalizedOneManifest: NormalizedW0Manifest | null,
  fallbackBookId: string,
): {
  bookId: string;
  formatId: string | null;
  isAmazonOrder: boolean;
  marketplaceId: string | null;
  bookSpecs: JsonRecord;
  orderDetails: JsonRecord;
  characterSpecs: JsonRecord;
} {
  const orderRecordProductInfo = toObject(orderRecord?.product_info) ?? {};
  const orderRecordBookSpecs =
    toObject(orderRecord?.book_specs) ??
    toObject(orderRecordProductInfo.bookSpecs) ??
    {};
  const orderRecordOrderDetails =
    toObject(orderRecord?.order_details) ??
    toObject(orderRecordProductInfo.orderDetails) ??
    {};

  const marketplaceId = toTrimmedString(
    pickFirstNonEmpty(
      primary.marketplace_id,
      primary.marketplaceId,
      nested.marketplace_id,
      nested.marketplaceId,
      orderContext.marketplace_id,
      orderContext.marketplaceId,
      manifest3.marketplace_id,
      manifest3.marketplaceId,
      orderRecord?.marketplace_id,
    ),
  );

  const bookId =
    toTrimmedString(
      pickFirstNonEmpty(
        primary.bookId,
        primary.book_id,
        nested.bookId,
        nested.book_id,
        orderContext.bookId,
        orderContext.book_id,
        manifest3.bookId,
        orderRecord?.project,
        normalizedOneManifest?.bookId,
      ),
    ) ?? fallbackBookId;

  const formatId = toTrimmedString(
    pickFirstNonEmpty(
      primary.formatId,
      primary.format_id,
      nested.formatId,
      nested.format_id,
      orderContext.formatId,
      orderContext.format_id,
      manifest3.formatId,
      normalizedOneManifest?.formatId,
      orderRecordBookSpecs.formatId,
    ),
  );

  const explicitAmazonOrder = pickFirstNonEmpty(
    primary.isAmazonOrder,
    nested.isAmazonOrder,
    orderContext.isAmazonOrder,
  );
  const amazonOrderId = toTrimmedString(
    pickFirstNonEmpty(
      manifest3.amazonOrderId,
      orderRecord?.amazon_order_id,
      normalizedOneManifest?.amazonOrderId,
    ),
  );
  const orderId = toTrimmedString(
    pickFirstNonEmpty(
      primary.orderId,
      nested.orderId,
      manifest3.orderId,
      orderRecord?.orderId,
      orderRecord?.order_id,
    ),
  );
  const orderIdLooksAmazon = Boolean(orderId && /^\d{3}-\d{7}-\d{7}$/.test(orderId));
  const isAmazonOrder =
    explicitAmazonOrder !== null
      ? toBoolean(explicitAmazonOrder)
      : formatId === 'amazon' ||
        marketplaceId === 'ATVPDKIKX0DER' ||
        Boolean(amazonOrderId) ||
        orderIdLooksAmazon;

  return {
    bookId,
    formatId,
    isAmazonOrder,
    marketplaceId,
    bookSpecs: pickJsonRecord(
      primary.bookSpecs,
      nested.bookSpecs,
      manifest3.bookSpecs,
      orderRecordBookSpecs,
      normalizedOneManifest?.bookSpecs,
    ),
    orderDetails: pickJsonRecord(
      primary.orderDetails,
      nested.orderDetails,
      manifest3.orderDetails,
      orderRecordOrderDetails,
      normalizedOneManifest?.orderDetails,
    ),
    characterSpecs: pickJsonRecord(
      primary.characterSpecs,
      nested.characterSpecs,
      manifest3.characterSpecs,
      orderRecord?.character_specs,
      normalizedOneManifest?.characterSpecs,
    ),
  };
}

function toPageSourceRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function getPageAssetReference(
  pageEntry: unknown,
): { key: string | null; url: string | null } {
  if (typeof pageEntry === 'string') {
    const trimmed = pageEntry.trim();
    return {
      key: /^https?:\/\//i.test(trimmed) ? null : trimmed || null,
      url: /^https?:\/\//i.test(trimmed) ? trimmed || null : null,
    };
  }

  if (!isRecord(pageEntry)) {
    return { key: null, url: null };
  }

  const key = toTrimmedString(
    pickFirstNonEmpty(
      pageEntry.r2Key,
      pageEntry.key,
      pageEntry.path,
    ),
  );
  const url = toTrimmedString(
    pickFirstNonEmpty(
      pageEntry.url,
      pageEntry.cloudflareImageUrl,
    ),
  );

  return { key, url };
}

function resolvePageAssetUrl(
  backendUrl: string,
  pagesR2: JsonRecord,
  pagesWithCloudflare: JsonRecord,
  pageLabel: string,
): { url: string | null; key: string | null } {
  const lookupCandidates =
    pageLabel === 'p00' ? ['p00', 'p00_dedication'] : [pageLabel];

  for (const lookupCandidate of lookupCandidates) {
    const pageEntry = pagesR2[lookupCandidate];
    const assetRef = getPageAssetReference(pageEntry);
    if (assetRef.url) {
      return { url: assetRef.url, key: assetRef.key };
    }
    if (assetRef.key) {
      return {
        url: buildAssetApiUrlAbsolute(backendUrl, assetRef.key),
        key: assetRef.key,
      };
    }
  }

  for (const lookupCandidate of lookupCandidates) {
    const pageEntry = pagesWithCloudflare[lookupCandidate];
    const assetRef = getPageAssetReference(pageEntry);
    if (assetRef.url) {
      return { url: assetRef.url, key: assetRef.key };
    }
    if (assetRef.key) {
      return {
        url: buildAssetApiUrlAbsolute(backendUrl, assetRef.key),
        key: assetRef.key,
      };
    }
  }

  return { url: null, key: null };
}

function buildBustedUrl(url: string, seed: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(seed)}`;
}

function derivePreviewPageState(params: {
  backendUrl: string;
  orderPrefix: string;
  manifestPayload: JsonRecord;
  normalizedOneManifest: NormalizedW0Manifest | null;
  isAmazonOrder: boolean;
}): {
  pageLabels: string[];
  pagePlan: BookPageConfig[];
  pageImageUrls: string[];
  pagePreviewImageKeys: string[];
  expectedPageCount: number;
  pagesGenerated: number;
  hasP00: boolean;
  hasPagesWithCloudflare: boolean;
  pages: JsonRecord;
  pagesWithCloudflare: JsonRecord;
  pngGeneration: JsonRecord;
  summary: JsonRecord;
} {
  const { backendUrl, orderPrefix, manifestPayload, normalizedOneManifest, isAmazonOrder } = params;

  const pngGeneration = pickJsonRecord(manifestPayload.pngGeneration);
  const pages = toPageSourceRecord(pickFirstNonEmpty(pngGeneration.pages, manifestPayload.pages));
  const pagesWithCloudflare = toPageSourceRecord(
    pickFirstNonEmpty(
      pngGeneration.pagesWithCloudflare,
      manifestPayload.pagesWithCloudflare,
    ),
  );
  const summary = pickJsonRecord(manifestPayload.summary);

  if (summary.readyForBook === false) {
    throw new Error('W4 print input rejected because summary.readyForBook is false');
  }

  const explicitPagePlan = (Array.isArray(manifestPayload.pagePlan)
    ? manifestPayload.pagePlan.filter((page): page is BookPageConfig => isRecord(page))
    : []) as BookPageConfig[];
  const explicitPageLabels = sortPageLabels(
    dedupeStrings(
      (Array.isArray(manifestPayload.pageLabels) ? manifestPayload.pageLabels : [])
        .map((value) => canonicalizePageLabel(typeof value === 'string' ? value : null)),
    ),
  );
  const derivedPageLabels = extractPageLabelsFromPages(pages, pagesWithCloudflare);
  const oneManifestPageLabels = normalizedOneManifest?.pageLabels ?? [];
  const legacyPageImageUrls = Array.isArray(manifestPayload.pageImageUrls)
    ? manifestPayload.pageImageUrls
        .map((value) => toTrimmedString(value))
        .filter((value): value is string => Boolean(value))
    : [];
  const hasPageSources =
    Object.keys(pages).length > 0 || Object.keys(pagesWithCloudflare).length > 0;

  const expectedFirstRequiredLabel =
    explicitPageLabels[0] ??
    explicitPagePlan[0]?.label ??
    normalizedOneManifest?.pageLabels[0] ??
    normalizedOneManifest?.pagePlan[0]?.label ??
    'p00';

  const expectedFirstCandidates =
    expectedFirstRequiredLabel === 'p00'
      ? ['p00', 'p00_dedication']
      : [expectedFirstRequiredLabel];
  const hasFirstPage = expectedFirstCandidates.some((candidate) => {
    return Boolean(pages[candidate] ?? pagesWithCloudflare[candidate]);
  });
  if (hasPageSources && !hasFirstPage) {
    throw new Error(
      `W4 print input is missing the first required page (${expectedFirstCandidates.join(' or ')})`,
    );
  }

  let pageLabels =
    explicitPageLabels.length > 0
      ? explicitPageLabels
      : derivedPageLabels.length > 0
        ? derivedPageLabels
        : legacyPageImageUrls.length > 0 &&
            (oneManifestPageLabels.length === 0 ||
              legacyPageImageUrls.length !== oneManifestPageLabels.length)
          ? buildDefaultPageLabels(legacyPageImageUrls.length)
        : oneManifestPageLabels.length > 0
          ? [...oneManifestPageLabels]
          : [];

  const explicitExpectedCount = toInteger(manifestPayload.expectedPageCount);
  if (!pageLabels.length) {
    pageLabels = buildDefaultPageLabels(explicitExpectedCount ?? (isAmazonOrder ? 17 : 15));
  }

  const pagePlan =
    explicitPagePlan.length > 0
      ? filterPagePlanByLabels(explicitPagePlan, pageLabels)
      : normalizedOneManifest?.pagePlan?.length
        ? filterPagePlanByLabels(normalizedOneManifest.pagePlan, pageLabels)
        : [];

  let pageImageUrls: string[] = [];
  const pagePreviewImageKeys: string[] = [];

  if (hasPageSources) {
    for (const pageLabel of pageLabels) {
      const resolved = resolvePageAssetUrl(
        backendUrl,
        pages,
        pagesWithCloudflare,
        pageLabel,
      );
      if (!resolved.url) {
        throw new Error(`W4 print input is missing a preview image for ${pageLabel}`);
      }

      pageImageUrls.push(resolved.url);
      pagePreviewImageKeys.push(
        resolved.key ?? buildPreviewImageAssetKey(orderPrefix, pageLabel),
      );
    }
  }

  if (!pageImageUrls.length && legacyPageImageUrls.length > 0) {
    pageImageUrls = [...legacyPageImageUrls];
    if (pageImageUrls.length !== pageLabels.length) {
      throw new Error(
        `W4 print input received ${pageImageUrls.length} legacy pageImageUrls for ${pageLabels.length} pages`,
      );
    }
    for (const pageLabel of pageLabels) {
      pagePreviewImageKeys.push(buildPreviewImageAssetKey(orderPrefix, pageLabel));
    }
  }

  const cacheBustSeed =
    toTrimmedString(
      pickFirstNonEmpty(
        manifestPayload.runStamp,
        manifestPayload.generatedAt,
        manifestPayload.runId,
      ),
    ) ?? orderPrefix;

  pageImageUrls = pageImageUrls.map((url, index) => {
    const trimmed = toTrimmedString(url);
    if (!trimmed) {
      throw new Error(`W4 print input resolved an empty pageImageUrls[${index}] value`);
    }
    return buildBustedUrl(trimmed, cacheBustSeed);
  });

  return {
    pageLabels,
    pagePlan,
    pageImageUrls,
    pagePreviewImageKeys,
    expectedPageCount: pageLabels.length,
    pagesGenerated: pageLabels.length,
    hasP00: Boolean(pages.p00 ?? pages.p00_dedication ?? pagesWithCloudflare.p00 ?? pagesWithCloudflare.p00_dedication),
    hasPagesWithCloudflare: Object.keys(pagesWithCloudflare).length > 0,
    pages,
    pagesWithCloudflare,
    pngGeneration,
    summary,
  };
}

function buildCoverPreviewState(params: {
  backendUrl: string;
  orderPrefix: string;
  manifestPayload: JsonRecord;
}): {
  coverPreviewUrl: string;
  coverPreviewImageKey: string;
} {
  const { backendUrl, orderPrefix, manifestPayload } = params;
  const pngGeneration = pickJsonRecord(manifestPayload.pngGeneration);
  const coverPreviewCandidates = [
    manifestPayload.coverImageUrl,
    Array.isArray(manifestPayload.coverImageUrls)
      ? manifestPayload.coverImageUrls[0]
      : undefined,
    manifestPayload.coverPngR2Key,
    pngGeneration.coverSpreadImage,
    pngGeneration.coverCloudflareImageUrl,
    `${orderPrefix}/preview-images/cover-spread.png`,
  ];

  for (const candidate of coverPreviewCandidates) {
    const trimmed = toTrimmedString(candidate);
    if (!trimmed) {
      continue;
    }

    const isAbsolute = /^https?:\/\//i.test(trimmed);
    return {
      coverPreviewUrl: buildBustedUrl(
        isAbsolute ? trimmed : buildAssetApiUrlAbsolute(backendUrl, trimmed),
        toTrimmedString(pickFirstNonEmpty(manifestPayload.runStamp, manifestPayload.generatedAt, orderPrefix)) ?? orderPrefix,
      ),
      coverPreviewImageKey: isAbsolute
        ? `${orderPrefix}/preview-images/cover-spread.png`
        : trimmed,
    };
  }

  throw new Error('W4 print input could not resolve a cover preview image');
}

function normalizeCustomer(
  primary: JsonRecord,
  nested: JsonRecord,
  manifestPayload: JsonRecord,
  orderRecord: JsonRecord | null,
  normalizedOneManifest: NormalizedW0Manifest | null,
): { email: string | null; name: string | null } {
  const customerRecord = pickJsonRecord(
    primary.customer,
    nested.customer,
    manifestPayload.customer,
  );

  return {
    email:
      toTrimmedString(
        pickFirstNonEmpty(
          customerRecord.email,
          primary.customer_email,
          nested.customer_email,
          manifestPayload.customer_email,
          orderRecord?.customer_email,
          normalizedOneManifest?.buyer.email,
        ),
      ) ?? null,
    name:
      toTrimmedString(
        pickFirstNonEmpty(
          customerRecord.name,
          primary.customer_name,
          nested.customer_name,
          manifestPayload.customer_name,
          orderRecord?.customer_name,
          normalizedOneManifest?.buyer.name,
        ),
      ) ?? null,
  };
}

function normalizeTitle(
  primary: JsonRecord,
  nested: JsonRecord,
  manifestPayload: JsonRecord,
  orderRecord: JsonRecord | null,
  bookSpecs: JsonRecord,
  normalizedOneManifest: NormalizedW0Manifest | null,
): string {
  const orderRecordProductInfo = toObject(orderRecord?.product_info) ?? {};
  const title =
    toTrimmedString(
      pickFirstNonEmpty(
        primary.title,
        nested.title,
        manifestPayload.title,
        bookSpecs.title,
        toObject(orderRecordProductInfo.bookSpecs)?.title,
        orderRecordProductInfo.title,
        normalizedOneManifest?.bookSpecs.title,
      ),
    ) ?? 'Little Hero Book';

  return title;
}

function normalizeWorkflowAuditFields(
  primary: JsonRecord,
  nested: JsonRecord,
  manifestPayload: JsonRecord,
  orderRecord: JsonRecord | null,
): {
  shipping_tier: string | null;
  shippingTier: string | null;
  ShipmentServiceLevelCategory: string | null;
  ShipServiceLevel: string | null;
  amazon_shipment_service_level: string | null;
  workflow: string | null;
  orderDbId: number | null;
} {
  const shippingTier =
    toTrimmedString(
      pickFirstNonEmpty(
        primary.shipping_tier,
        primary.shippingTier,
        nested.shipping_tier,
        nested.shippingTier,
        manifestPayload.shipping_tier,
        manifestPayload.shippingTier,
        orderRecord?.shipping_tier,
      ),
    ) ?? null;
  const shipmentService =
    toTrimmedString(
      pickFirstNonEmpty(
        primary.ShipmentServiceLevelCategory,
        primary.ShipServiceLevel,
        nested.ShipmentServiceLevelCategory,
        nested.ShipServiceLevel,
        manifestPayload.ShipmentServiceLevelCategory,
        manifestPayload.ShipServiceLevel,
        orderRecord?.amazon_shipment_service_level,
      ),
    ) ?? null;

  return {
    shipping_tier: shippingTier,
    shippingTier,
    ShipmentServiceLevelCategory: shipmentService,
    ShipServiceLevel: shipmentService,
    amazon_shipment_service_level: shipmentService,
    workflow:
      toTrimmedString(
        pickFirstNonEmpty(
          primary.workflow,
          nested.workflow,
          manifestPayload.workflow,
        ),
      ) ?? null,
    orderDbId:
      toInteger(
        pickFirstNonEmpty(
          primary.orderDbId,
          primary.order_db_id,
          nested.orderDbId,
          nested.order_db_id,
          manifestPayload.orderDbId,
          manifestPayload.order_db_id,
          orderRecord?.id,
        ),
      ) ?? null,
  };
}

export async function buildW4PrintInput(
  input: JsonRecord,
  options: BuildW4PrintInputOptions,
): Promise<BuildW4PrintInputResult> {
  const nested = toRecord(input.body);
  const primary = nested === input ? input : toRecord(input);
  const orderContext = pickJsonRecord(primary.orderContext, nested.orderContext);
  const config = pickJsonRecord(primary.CONFIG, nested.CONFIG, input.CONFIG);
  const sourcePayload = nested === input ? { ...input } : { ...nested };

  const backendUrl =
    toTrimmedString(
      pickFirstNonEmpty(
        primary.backendUrl,
        nested.backendUrl,
        orderContext.backendUrl,
      ),
    ) ??
    resolveCanonicalBackendBaseUrl(options.defaultBackendUrl);

  const pathLikes = collectPathLikes(primary, nested, orderContext);
  const explicitOrderId = toTrimmedString(
    pickFirstNonEmpty(
      primary.orderId,
      primary.order_id,
      nested.orderId,
      nested.order_id,
      orderContext.orderId,
      orderContext.order_id,
      primary.amazonOrderId,
      nested.amazonOrderId,
    ),
  );
  if (!explicitOrderId) {
    throw new Error('W4 print input requires orderId');
  }

  const explicitOrderPrefix =
    toTrimmedString(
      pickFirstNonEmpty(
        primary.orderPrefix,
        primary.order_prefix,
        primary.orderR2BaseKey,
        nested.orderPrefix,
        nested.order_prefix,
        nested.orderR2BaseKey,
        orderContext.orderPrefix,
        orderContext.order_prefix,
      ),
    ) ?? undefined;

  const hintedPathContext = resolveOrderPathContext(explicitOrderId, {
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

  const manifest3KeyFallback = buildManifestKeyFromOrderPrefix(
    hintedPathContext.orderPrefix,
    '3',
  );
  const manifest3Candidates = pickManifestKeyCandidates(
    [
      primary.manifest3Key,
      primary.manifest_3_key,
      primary.manifest3Url,
      primary.manifest_3_url,
      primary.manifestUrl,
      primary.originalManifestUrl,
      primary.manifestKey,
      nested.manifest3Key,
      nested.manifest_3_key,
      nested.manifest3Url,
      nested.manifest_3_url,
      nested.manifestUrl,
      nested.originalManifestUrl,
      nested.manifestKey,
      orderContext.manifest3Key,
      orderContext.manifest3Url,
      orderContext.manifestKey,
    ],
    manifest3KeyFallback,
    buildManifestKeyCandidates(explicitOrderId, '3', {
      bookId: hintedPathContext.bookId,
      orderPrefix: hintedPathContext.orderPrefix,
      pathLikes,
    }),
  );

  const loadedThreeManifest = await loadFirstManifest(
    '3-manifest',
    manifest3Candidates,
    options.loadManifest,
  );
  if (!loadedThreeManifest.manifest) {
    throw new Error(
      `W4 print input could not load the 3-manifest (${loadedThreeManifest.manifestKey ?? manifest3KeyFallback})`,
    );
  }

  const preliminaryOrderRecord = await loadFirstOrder(
    [
      explicitOrderId,
      toTrimmedString(primary.amazonOrderId),
      toTrimmedString(primary.rootOrderId),
    ].filter((value): value is string => Boolean(value)),
    options.loadOrder,
  );

  const preliminaryIdentity = deriveIdentity(
    primary,
    nested,
    orderContext,
    loadedThreeManifest.manifest,
    preliminaryOrderRecord,
    null,
  );

  const orderRecord = preliminaryOrderRecord
    ? preliminaryOrderRecord
    : await loadFirstOrder(
        [
          preliminaryIdentity.orderId,
          preliminaryIdentity.amazonOrderId,
          preliminaryIdentity.rootOrderId,
        ].filter((value): value is string => Boolean(value)),
        options.loadOrder,
      );

  const orderRecordPathLikes = orderRecord
    ? collectOrderPathLikes(orderRecord)
    : [];

  const preliminaryBookState = deriveBookState(
    primary,
    nested,
    orderContext,
    loadedThreeManifest.manifest,
    orderRecord,
    null,
    hintedPathContext.bookId,
  );

  const preliminaryOrderPrefix = resolveOrderPathContext(
    preliminaryIdentity.orderId,
    {
      bookId: preliminaryBookState.bookId,
      orderPrefix: explicitOrderPrefix,
      pathLikes: [...pathLikes, ...orderRecordPathLikes, loadedThreeManifest.manifestKey],
    },
  ).orderPrefix;

  const oneManifestKeyFallback = buildManifestKeyFromOrderPrefix(
    preliminaryOrderPrefix,
    '1',
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
      toTrimmedString(orderRecord?.one_manifest_url),
    ],
    oneManifestKeyFallback,
    buildManifestKeyCandidates(preliminaryIdentity.orderId, '1', {
      bookId: preliminaryBookState.bookId,
      orderPrefix: preliminaryOrderPrefix,
      pathLikes: [
        ...pathLikes,
        ...orderRecordPathLikes,
        loadedThreeManifest.manifestKey,
        toTrimmedString(orderRecord?.one_manifest_url),
      ],
    }),
  );

  const loadedOneManifest = await loadFirstManifest(
    '1-manifest',
    oneManifestCandidates,
    options.loadManifest,
  );
  const normalizedOneManifest =
    loadedOneManifest.manifest && loadedOneManifest.manifestKey
      ? normalizeW0Manifest(loadedOneManifest.manifest, {
          fallbackManifestKey: loadedOneManifest.manifestKey,
        })
      : null;

  const identity = deriveIdentity(
    primary,
    nested,
    orderContext,
    loadedThreeManifest.manifest,
    orderRecord,
    normalizedOneManifest,
  );
  const bookState = deriveBookState(
    primary,
    nested,
    orderContext,
    loadedThreeManifest.manifest,
    orderRecord,
    normalizedOneManifest,
    preliminaryBookState.bookId,
  );

  const orderPrefix = resolveOrderPathContext(identity.orderId, {
    bookId: bookState.bookId,
    orderPrefix: explicitOrderPrefix,
    pathLikes: [
      ...pathLikes,
      ...orderRecordPathLikes,
      loadedThreeManifest.manifestKey,
      loadedOneManifest.manifestKey,
    ],
  }).orderPrefix;

  const manifest3Key = buildManifestKeyFromOrderPrefix(orderPrefix, '3');
  const manifest4Key = buildManifestKeyFromOrderPrefix(orderPrefix, '4');
  const oneManifestKey = loadedOneManifest.manifestKey ?? oneManifestKeyFallback;
  const manifestPayload = buildManifestPayload(
    sourcePayload,
    loadedThreeManifest.manifest,
  );

  const previewState = derivePreviewPageState({
    backendUrl,
    orderPrefix,
    manifestPayload,
    normalizedOneManifest,
    isAmazonOrder: bookState.isAmazonOrder,
  });
  const coverState = buildCoverPreviewState({
    backendUrl,
    orderPrefix,
    manifestPayload,
  });

  const shippingAddress = normalizeShippingAddress(
    pickFirstNonEmpty(
      primary.shippingAddress,
      primary.shipping_address,
      nested.shippingAddress,
      nested.shipping_address,
      manifestPayload.shippingAddress,
      manifestPayload.shipping_address,
      orderRecord?.shipping_address,
      normalizedOneManifest?.shippingAddress,
      bookState.orderDetails.shippingAddress,
      bookState.orderDetails.shipping_address,
    ),
  );
  const customer = normalizeCustomer(
    primary,
    nested,
    manifestPayload,
    orderRecord,
    normalizedOneManifest,
  );
  if (customer.email && !shippingAddress.email) {
    shippingAddress.email = customer.email;
  }
  if (customer.name && !shippingAddress.name) {
    shippingAddress.name = customer.name;
  }
  applyTestModeShippingPhoneFallback(shippingAddress, config);

  const title = normalizeTitle(
    primary,
    nested,
    manifestPayload,
    orderRecord,
    bookState.bookSpecs,
    normalizedOneManifest,
  );
  const workflowAudit = normalizeWorkflowAuditFields(
    primary,
    nested,
    manifestPayload,
    orderRecord,
  );

  const pdfFilename = `interior_${identity.orderId}.pdf`;
  const coverPdfFilename = `cover_${identity.orderId}.pdf`;

  const coverPdfR2Key =
    toTrimmedString(
      pickFirstNonEmpty(
        primary.coverPdfR2Key,
        nested.coverPdfR2Key,
        manifestPayload.coverPdfR2Key,
        pickJsonRecord(manifestPayload.pdfGeneration).coverPdf,
      ),
    ) ?? `${orderPrefix}/${coverPdfFilename}`;

  return {
    ...manifestPayload,
    CONFIG: config,
    orderId: identity.orderId,
    amazonOrderId: identity.amazonOrderId,
    rootOrderId: identity.rootOrderId,
    characterHash: identity.characterHash,
    bookId: bookState.bookId,
    formatId: bookState.formatId,
    orderPrefix,
    orderR2BaseKey: orderPrefix,
    oneManifestKey,
    oneManifestUrl: loadedOneManifest.manifest
      ? buildManifestApiUrlAbsolute(backendUrl, oneManifestKey)
      : null,
    oneManifestSchema: normalizedOneManifest?.schema ?? null,
    manifest3Key,
    manifest3Url: buildManifestApiUrlAbsolute(backendUrl, manifest3Key),
    manifest4Key,
    manifest4Url: buildManifestApiUrlAbsolute(backendUrl, manifest4Key),
    backendUrl,
    isAmazonOrder: bookState.isAmazonOrder,
    expectedPageCount: previewState.expectedPageCount,
    pageLabels: previewState.pageLabels,
    pagePlan: previewState.pagePlan,
    pageImageUrls: previewState.pageImageUrls,
    pagePreviewImageKeys: previewState.pagePreviewImageKeys,
    pagesGenerated: previewState.pagesGenerated,
    coverPreviewUrl: coverState.coverPreviewUrl,
    coverPreviewImageKey: coverState.coverPreviewImageKey,
    coverPreviewImageUrls: [coverState.coverPreviewUrl],
    interiorPreviewImageUrls: previewState.pageImageUrls,
    coverPdfFilename,
    coverPdfR2Key,
    pdfFilename,
    pdfR2Key: `${orderPrefix}/${pdfFilename}`,
    shippingAddress,
    customer,
    title,
    marketplace_id: bookState.marketplaceId,
    hasP00: previewState.hasP00,
    hasPagesWithCloudflare: previewState.hasPagesWithCloudflare,
    shipping_tier: workflowAudit.shipping_tier,
    shippingTier: workflowAudit.shippingTier,
    ShipmentServiceLevelCategory: workflowAudit.ShipmentServiceLevelCategory,
    ShipServiceLevel: workflowAudit.ShipServiceLevel,
    amazon_shipment_service_level: workflowAudit.amazon_shipment_service_level,
    summary: previewState.summary,
    pages: previewState.pages,
    pagesWithCloudflare: previewState.pagesWithCloudflare,
    pngGeneration: previewState.pngGeneration,
    pdfGeneration: pickJsonRecord(manifestPayload.pdfGeneration),
    bookSpecs: {
      ...bookState.bookSpecs,
      title,
      formatId: bookState.formatId ?? bookState.bookSpecs.formatId ?? null,
      totalPages: previewState.expectedPageCount,
    },
    orderDetails: {
      ...bookState.orderDetails,
      shippingAddress,
      shipping_address: shippingAddress,
    },
    characterSpecs: bookState.characterSpecs,
    generatedAt: toTrimmedString(manifestPayload.generatedAt),
    runStamp:
      toTrimmedString(
        pickFirstNonEmpty(manifestPayload.runStamp, manifestPayload.generatedAt),
      ) ?? null,
    workflow: workflowAudit.workflow,
    orderDbId: workflowAudit.orderDbId,
  };
}
