export const DEFAULT_BOOK_ID = 'book-mvp-simple-adventure';

export type ManifestStage = '1' | '2a' | '2b' | '3' | '4';

export interface ManifestKeyHintOptions {
  bookId?: string | null;
  orderPrefix?: string | null;
  pathLikes?: Array<string | null | undefined>;
}

type OrderLikeRecord = Record<string, unknown>;

function trimToString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOrderPrefixHint(value: string | null | undefined): string {
  const trimmed = trimToString(value);
  if (!trimmed) {
    return '';
  }

  return extractOrderPrefixFromPathLike(trimmed) || trimmed;
}

function toRecord(value: unknown): OrderLikeRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as OrderLikeRecord)
    : null;
}

function getStringField(
  record: OrderLikeRecord | null | undefined,
  key: string,
): string | null {
  if (!record) {
    return null;
  }

  const trimmed = trimToString(record[key]);
  return trimmed || null;
}

function getProductInfoRecord(
  record: OrderLikeRecord | null | undefined,
): OrderLikeRecord | null {
  return toRecord(record?.product_info) ?? toRecord(record?.productInfo);
}

function getBookSpecsRecord(
  record: OrderLikeRecord | null | undefined,
): OrderLikeRecord | null {
  const productInfo = getProductInfoRecord(record);
  return (
    toRecord(record?.book_specs) ??
    toRecord(record?.bookSpecs) ??
    toRecord(productInfo?.bookSpecs) ??
    toRecord(productInfo?.book_specs)
  );
}

function normalizePathLike(value: unknown): string {
  const trimmed = trimToString(value);
  if (!trimmed) {
    return '';
  }

  const withoutQuery = trimmed.split('#')[0]?.split('?')[0] || '';
  if (withoutQuery.includes('/api/manifests/')) {
    return withoutQuery.split('/api/manifests/')[1]?.replace(/^\/+/, '') || '';
  }
  if (withoutQuery.includes('/api/assets/')) {
    return withoutQuery.split('/api/assets/')[1]?.replace(/^\/+/, '') || '';
  }

  return withoutQuery.replace(/^\/+/, '');
}

export function normalizeBookId(bookId: string | null | undefined): string {
  const trimmed = trimToString(bookId);
  if (trimmed) {
    return trimmed;
  }

  throw new Error('bookId is required');
}

export function isOrderAssetKey(key: string): boolean {
  return /^[^/]+\/orders\/.+/.test(normalizePathLike(key));
}

export function buildOrderPrefix(orderId: string, bookId?: string | null): string {
  const normalizedOrderId = trimToString(orderId);
  if (!normalizedOrderId) {
    throw new Error('orderId is required to build an order prefix');
  }

  return `${normalizeBookId(bookId)}/orders/${normalizedOrderId}`;
}

export function normalizeOrderPrefix(
  prefix: string | null | undefined,
  fallbackOrderId?: string | null,
  fallbackBookId?: string | null,
): string {
  const trimmedPrefix = trimToString(prefix).replace(/\/+$/, '');
  if (trimmedPrefix) {
    return trimmedPrefix;
  }

  if (!fallbackOrderId) {
    throw new Error('orderPrefix is missing and no fallback orderId was provided');
  }

  return buildOrderPrefix(fallbackOrderId, fallbackBookId);
}

export function buildManifestKeyFromOrderPrefix(
  orderPrefix: string,
  stage: ManifestStage,
): string {
  return `${normalizeOrderPrefix(orderPrefix)}/manifests/${stage}-manifest.json`;
}

export function extractManifestKey(value: string | null | undefined): string | null {
  const normalized = normalizePathLike(value);
  return normalized || null;
}

export function buildManifestApiUrl(
  orderPrefix: string,
  stage: ManifestStage,
  cacheBust?: string | number | null,
): string {
  const manifestKey = buildManifestKeyFromOrderPrefix(orderPrefix, stage);
  const suffix =
    cacheBust === undefined || cacheBust === null || cacheBust === ''
      ? ''
      : `?v=${encodeURIComponent(String(cacheBust))}`;
  return `/api/manifests/${manifestKey}${suffix}`;
}

export function buildCharacterAssetPrefix(
  characterHash: string,
  bookId?: string | null,
): string {
  const normalizedCharacterHash = trimToString(characterHash);
  if (!normalizedCharacterHash) {
    throw new Error('characterHash is required to build a character asset prefix');
  }

  return `${normalizeBookId(bookId)}/order-generated-assets/characters/${normalizedCharacterHash}`;
}

export function buildBaseCharacterAssetKey(
  characterHash: string,
  bookId?: string | null,
): string {
  return `${buildCharacterAssetPrefix(characterHash, bookId)}/base-character.png`;
}

export function buildGeneratedPoseAssetKey(
  characterHash: string,
  poseNumber: number,
  bookId?: string | null,
): string {
  const poseNN = String(Math.max(0, poseNumber)).padStart(2, '0');
  return `${buildCharacterAssetPrefix(characterHash, bookId)}/poses/pose${poseNN}.png`;
}

export function buildBgRemovedPoseAssetKey(
  characterHash: string,
  poseNumber: number,
  bookId?: string | null,
): string {
  const normalizedCharacterHash = trimToString(characterHash);
  if (!normalizedCharacterHash) {
    throw new Error('characterHash is required to build a background-removed pose key');
  }

  const poseNN = String(Math.max(0, poseNumber)).padStart(2, '0');
  return `${buildCharacterAssetPrefix(normalizedCharacterHash, bookId)}/characters_${normalizedCharacterHash}_pose${poseNN}_nobg.png`;
}

export function buildPoseReferenceAssetKey(
  bookId: string | null | undefined,
  poseNumber: number,
): string {
  const poseNN = String(Math.max(0, poseNumber)).padStart(2, '0');
  return `${normalizeBookId(bookId)}/characters/poses/pose${poseNN}.png`;
}

export function buildPreviewImageAssetKey(
  orderPrefix: string,
  pageLabel: string,
): string {
  const normalizedPageLabel = trimToString(pageLabel);
  if (!normalizedPageLabel) {
    throw new Error('pageLabel is required to build a preview-image key');
  }

  return `${normalizeOrderPrefix(orderPrefix)}/preview-images/${normalizedPageLabel}.png`;
}

export function buildPendingPoseRevisionKey(
  orderPrefix: string,
  poseNumber: number,
): string {
  const poseNN = String(Math.max(0, poseNumber)).padStart(2, '0');
  return `${normalizeOrderPrefix(orderPrefix)}/revisions/pending/pose${poseNN}-option.png`;
}

export function buildAssetApiUrl(
  assetKey: string,
  cacheBust?: string | number | null,
): string {
  const normalizedKey = normalizePathLike(assetKey);
  const suffix =
    cacheBust === undefined || cacheBust === null || cacheBust === ''
      ? ''
      : `?v=${encodeURIComponent(String(cacheBust))}`;
  return `/api/assets/${normalizedKey}${suffix}`;
}

export function extractOrderPrefixFromPathLike(value: string | null | undefined): string | null {
  const normalized = normalizePathLike(value);
  if (!normalized) {
    return null;
  }

  const manifestIndex = normalized.indexOf('/manifests/');
  if (manifestIndex > 0) {
    return normalized.slice(0, manifestIndex);
  }

  const ordersMatch = normalized.match(/^([^/]+\/orders\/[^/]+)/);
  return ordersMatch?.[1] ?? null;
}

export function extractBookIdFromOrderPathLike(value: string | null | undefined): string | null {
  const orderPrefix = extractOrderPrefixFromPathLike(value);
  if (!orderPrefix) {
    return null;
  }

  const marker = '/orders/';
  const markerIndex = orderPrefix.indexOf(marker);
  return markerIndex > 0 ? orderPrefix.slice(0, markerIndex) : null;
}

export function extractBookIdFromPathLike(value: string | null | undefined): string | null {
  const normalized = normalizePathLike(value);
  if (!normalized) {
    return null;
  }

  const [bookId] = normalized.split('/');
  return bookId ? trimToString(bookId) || null : null;
}

export function inferOrderPrefixFromPathLikes(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const orderPrefix = extractOrderPrefixFromPathLike(value);
    if (orderPrefix) {
      return orderPrefix;
    }
  }

  return null;
}

export function inferBookIdFromPathLikes(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const bookId =
      extractBookIdFromOrderPathLike(value) ??
      extractBookIdFromPathLike(value);
    if (bookId) {
      return bookId;
    }
  }

  return null;
}

export function collectOrderPathLikes(orderLike: unknown): string[] {
  const record = toRecord(orderLike);
  const bookContext = toRecord(record?.bookContext);
  const productInfo = getProductInfoRecord(record);
  const values = [
    getStringField(bookContext, 'orderPrefix'),
    getStringField(record, 'orderPrefix'),
    getStringField(record, 'order_prefix'),
    getStringField(productInfo, '_order_prefix'),
    getStringField(record, 'assetPrefix'),
    getStringField(record, 'asset_prefix'),
    getStringField(record, 'oneManifestUrl'),
    getStringField(record, 'one_manifest_url'),
    getStringField(record, 'manifest2aUrl'),
    getStringField(record, 'manifest_2a_url'),
    getStringField(productInfo, '_manifest_2a_url'),
    getStringField(record, 'manifest2bUrl'),
    getStringField(record, 'manifest_2b_url'),
    getStringField(productInfo, '_manifest_2b_url'),
    getStringField(record, 'manifest3Url'),
    getStringField(record, 'manifest_3_url'),
    getStringField(productInfo, '_manifest_3_url'),
    getStringField(record, 'finalBookUrl'),
    getStringField(record, 'final_book_url'),
    getStringField(record, 'finalCoverUrl'),
    getStringField(record, 'final_cover_url'),
    getStringField(record, 'cover_image_url'),
  ];

  return values.filter(
    (value, index, allValues): value is string =>
      !!value && allValues.indexOf(value) === index,
  );
}

export function inferOrderPrefixHintFromOrderLike(
  orderLike: unknown,
): string | null {
  const record = toRecord(orderLike);
  const bookContext = toRecord(record?.bookContext);
  return (
    getStringField(bookContext, 'orderPrefix') ??
    getStringField(record, 'orderPrefix') ??
    getStringField(record, 'order_prefix') ??
    inferOrderPrefixFromPathLikes(...collectOrderPathLikes(record))
  );
}

export function inferBookIdHintFromOrderLike(
  orderLike: unknown,
): string | null {
  const record = toRecord(orderLike);
  const bookContext = toRecord(record?.bookContext);
  const productInfo = getProductInfoRecord(record);
  const bookSpecs = getBookSpecsRecord(record);
  return (
    getStringField(bookContext, 'bookId') ??
    getStringField(record, 'bookId') ??
    getStringField(record, 'book_id') ??
    getStringField(bookSpecs, 'bookId') ??
    getStringField(bookSpecs, 'book_id') ??
    getStringField(productInfo, 'bookId') ??
    getStringField(productInfo, 'book_id') ??
    getStringField(record, 'project') ??
    inferBookIdFromPathLikes(...collectOrderPathLikes(record))
  );
}

export function buildManifestKeyHintOptionsFromOrderLike(
  orderLike: unknown,
): ManifestKeyHintOptions {
  const record = toRecord(orderLike);
  const pathLikes = collectOrderPathLikes(record);

  return {
    bookId: inferBookIdHintFromOrderLike(record),
    orderPrefix: inferOrderPrefixHintFromOrderLike(record),
    pathLikes,
  };
}

export function resolveOrderPathContext(
  orderId: string,
  options: ManifestKeyHintOptions = {},
): { bookId: string; orderPrefix: string } {
  const pathLikes = options.pathLikes ?? [];
  const normalizedOrderPrefixHint = normalizeOrderPrefixHint(options.orderPrefix);
  const hintedOrderPrefix =
    normalizedOrderPrefixHint || inferOrderPrefixFromPathLikes(...pathLikes);
  const hintedBookId =
    trimToString(options.bookId) ||
    extractBookIdFromOrderPathLike(normalizedOrderPrefixHint) ||
    inferBookIdFromPathLikes(...pathLikes);
  const orderPrefix = normalizeOrderPrefix(
    hintedOrderPrefix,
    orderId,
    hintedBookId || null,
  );
  const resolvedBookId =
    extractBookIdFromOrderPathLike(orderPrefix) || hintedBookId;

  if (!resolvedBookId) {
    throw new Error(
      `Unable to resolve bookId for order ${trimToString(orderId) || '<unknown>'}`,
    );
  }

  return {
    bookId: normalizeBookId(resolvedBookId),
    orderPrefix,
  };
}

export function buildManifestKeyCandidates(
  orderId: string,
  stage: ManifestStage,
  options: ManifestKeyHintOptions = {},
): string[] {
  const pathLikes = options.pathLikes ?? [];
  const normalizedOrderPrefixHint = normalizeOrderPrefixHint(options.orderPrefix);
  const inferredOrderPrefix = inferOrderPrefixFromPathLikes(...pathLikes);
  const hintedBookId =
    trimToString(options.bookId) ||
    extractBookIdFromOrderPathLike(normalizedOrderPrefixHint) ||
    inferBookIdFromPathLikes(...pathLikes);
  const candidates = [
    normalizedOrderPrefixHint
      ? buildManifestKeyFromOrderPrefix(normalizedOrderPrefixHint, stage)
      : null,
    inferredOrderPrefix
      ? buildManifestKeyFromOrderPrefix(
          inferredOrderPrefix,
          stage,
        )
      : null,
    hintedBookId
      ? buildManifestKeyFromOrderPrefix(
          buildOrderPrefix(orderId, hintedBookId),
          stage,
        )
      : null,
    inferBookIdFromPathLikes(...pathLikes)
      ? buildManifestKeyFromOrderPrefix(
          buildOrderPrefix(orderId, inferBookIdFromPathLikes(...pathLikes)),
          stage,
        )
      : null,
  ];

  return candidates.filter(
    (value, index, values): value is string =>
      !!value && values.indexOf(value) === index,
  );
}
