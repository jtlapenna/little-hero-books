import {
  buildAssetApiUrl,
  buildBgRemovedPoseAssetKey,
  resolveOrderPathContext,
} from '@/lib/order-paths';

type JsonRecord = Record<string, unknown>;

export interface BuildW2BPoseInputResult {
  orderId: string;
  rootOrderId: string | null;
  amazonOrderId: string | null;
  bookId: string;
  orderPrefix: string;
  backendUrl: string;
  callbackUrl: string;
  characterHash: string;
  poseNumber: number;
  approvedKey: string;
  replacedAt: string | null;
  replacementCount: number;
  manifest2aUrl: string | null;
  manifest2bKey: string | null;
  sourceCacheBust: string | null;
  sourceApiPath: string;
  sourceUrl: string;
  briaPayload: JsonRecord;
  briaSource: 'url';
  bgRemovedKey: string;
  bgRemovedApiPath: string;
  qaBackgroundBucket: string;
  qaBackgroundKey: string;
  qaBackgroundBinary: string;
  correlationId: string;
  testMode: boolean;
  workflowJobId: number | null;
  workflowJobIdempotencyKey: string | null;
  workflowJobStatus: string | null;
  workflowAttemptId: number | null;
  workflowAttempt: number | null;
  workflowClaimed: boolean;
}

export interface BuildW2BPoseInputOptions {
  defaultBackendUrl?: string;
  defaultQaBackgroundBucket?: string;
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

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 && normalized !== 'undefined' && normalized !== 'null';
  }

  return true;
}

function pickFirstNonEmpty<T>(...values: T[]): T | null {
  for (const value of values) {
    if (isNonEmpty(value)) {
      return value;
    }
  }

  return null;
}

function absoluteUrl(backendUrl: string, path: string): string {
  return `${backendUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function buildStableCacheBust(replacedAt: string | null, replacementCount: number): string | null {
  if (replacedAt) {
    const parsed = Date.parse(replacedAt);
    if (!Number.isNaN(parsed)) {
      return String(parsed);
    }
  }

  if (replacementCount > 0) {
    return String(replacementCount);
  }

  return null;
}

function resolvePathLikes(primary: JsonRecord, orderContext: JsonRecord): string[] {
  const values = [
    primary.manifest2aUrl,
    primary.orderPrefix,
    primary.order_prefix,
    primary.approvedKey,
    orderContext.manifest2aUrl,
    orderContext.orderPrefix,
    orderContext.order_prefix,
    orderContext.approvedKey,
  ];

  return values
    .map((value) => toTrimmedString(value))
    .filter((value): value is string => Boolean(value));
}

function buildCorrelationId(orderId: string, characterHash: string, poseNumber: number): string {
  const poseNN = String(Math.max(0, poseNumber)).padStart(2, '0');
  return `${orderId.replace(/[^a-z0-9._-]+/gi, '-')}-${characterHash.slice(0, 16)}-BG${poseNN}`;
}

export function buildW2BPoseInput(
  input: JsonRecord,
  options: BuildW2BPoseInputOptions = {},
): BuildW2BPoseInputResult {
  const orderContext = toRecord(input.orderContext);
  const orderId = toTrimmedString(
    pickFirstNonEmpty(input.orderId, orderContext.orderId),
  );
  if (!orderId) {
    throw new Error('W2B pose input requires orderId');
  }

  const characterHash = toTrimmedString(
    pickFirstNonEmpty(input.characterHash, orderContext.characterHash),
  );
  if (!characterHash) {
    throw new Error('W2B pose input requires characterHash');
  }

  const poseNumber = toInteger(
    pickFirstNonEmpty(input.poseNumber, orderContext.poseNumber),
  );
  if (poseNumber === null || poseNumber < 0) {
    throw new Error('W2B pose input requires poseNumber');
  }

  const approvedKey = toTrimmedString(
    pickFirstNonEmpty(input.approvedKey, orderContext.approvedKey),
  );
  if (!approvedKey) {
    throw new Error('W2B pose input requires approvedKey');
  }

  const pathLikes = resolvePathLikes(input, orderContext);
  const explicitOrderPrefix = toTrimmedString(
    pickFirstNonEmpty(input.orderPrefix, input.order_prefix, orderContext.orderPrefix, orderContext.order_prefix),
  );
  const explicitBookId = toTrimmedString(
    pickFirstNonEmpty(input.bookId, orderContext.bookId),
  );
  const { bookId, orderPrefix } = resolveOrderPathContext(orderId, {
    bookId: explicitBookId ?? undefined,
    orderPrefix: explicitOrderPrefix ?? undefined,
    pathLikes,
  });

  const backendUrl =
    toTrimmedString(pickFirstNonEmpty(input.backendUrl, orderContext.backendUrl)) ??
    options.defaultBackendUrl ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'https://admin.littleherolabs.com';
  const callbackUrl =
    toTrimmedString(pickFirstNonEmpty(input.callbackUrl, orderContext.callbackUrl)) ??
    `${backendUrl.replace(/\/$/, '')}/webhook/2b-callback`;
  const replacedAt =
    toTrimmedString(pickFirstNonEmpty(input.replacedAt, orderContext.replacedAt)) ?? null;
  const replacementCount =
    Math.max(0, toInteger(pickFirstNonEmpty(input.replacementCount, orderContext.replacementCount)) ?? 0);
  const sourceCacheBust = buildStableCacheBust(replacedAt, replacementCount);
  const sourceApiPath = buildAssetApiUrl(approvedKey, sourceCacheBust);
  const sourceUrl = absoluteUrl(backendUrl, sourceApiPath);
  const correlationId =
    toTrimmedString(pickFirstNonEmpty(input.correlationId, orderContext.correlationId)) ??
    buildCorrelationId(orderId, characterHash, poseNumber);
  const bgRemovedKey = buildBgRemovedPoseAssetKey(characterHash, poseNumber, bookId);
  const bgRemovedApiPath = buildAssetApiUrl(bgRemovedKey);
  const qaBackgroundKey =
    toTrimmedString(pickFirstNonEmpty(input.qaBackgroundKey, orderContext.qaBackgroundKey)) ??
    `${bookId}/backgrounds/transparency-qa/neon-background.png`;
  const testMode = [
    input.testMode,
    input.__testMode,
    orderContext.testMode,
    orderContext.__testMode,
  ].some(toBoolean);

  return {
    orderId,
    rootOrderId:
      toTrimmedString(
        pickFirstNonEmpty(
          input.rootOrderId,
          input.root_order_id,
          input.amazonOrderId,
          input.amazon_order_id,
          orderContext.rootOrderId,
          orderContext.root_order_id,
          orderContext.amazonOrderId,
          orderContext.amazon_order_id,
        ),
      ) ?? null,
    amazonOrderId:
      toTrimmedString(
        pickFirstNonEmpty(
          input.amazonOrderId,
          input.amazon_order_id,
          orderContext.amazonOrderId,
          orderContext.amazon_order_id,
          input.rootOrderId,
          orderContext.rootOrderId,
        ),
      ) ?? null,
    bookId,
    orderPrefix,
    backendUrl,
    callbackUrl,
    characterHash,
    poseNumber,
    approvedKey,
    replacedAt,
    replacementCount,
    manifest2aUrl:
      toTrimmedString(pickFirstNonEmpty(input.manifest2aUrl, orderContext.manifest2aUrl)) ?? null,
    manifest2bKey:
      toTrimmedString(pickFirstNonEmpty(input.manifest2bKey, orderContext.manifest2bKey)) ?? null,
    sourceCacheBust,
    sourceApiPath,
    sourceUrl,
    briaPayload: {
      image: sourceUrl,
      meta: {
        correlationId,
        pose: poseNumber,
        characterHash,
        source: 'url',
      },
    },
    briaSource: 'url',
    bgRemovedKey,
    bgRemovedApiPath,
    qaBackgroundBucket: options.defaultQaBackgroundBucket ?? 'little-hero-assets',
    qaBackgroundKey,
    qaBackgroundBinary: 'bg',
    correlationId,
    testMode,
    workflowJobId: toInteger(pickFirstNonEmpty(input.workflowJobId, orderContext.workflowJobId)),
    workflowJobIdempotencyKey: toTrimmedString(
      pickFirstNonEmpty(input.workflowJobIdempotencyKey, orderContext.workflowJobIdempotencyKey),
    ),
    workflowJobStatus: toTrimmedString(
      pickFirstNonEmpty(input.workflowJobStatus, orderContext.workflowJobStatus),
    ),
    workflowAttemptId: toInteger(
      pickFirstNonEmpty(input.workflowAttemptId, orderContext.workflowAttemptId),
    ),
    workflowAttempt: toInteger(
      pickFirstNonEmpty(input.workflowAttempt, orderContext.workflowAttempt),
    ),
    workflowClaimed: toBoolean(
      pickFirstNonEmpty(input.workflowClaimed, orderContext.workflowClaimed, false),
    ),
  };
}
