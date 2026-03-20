import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import {
  resolveOrderPathContext,
  buildManifestKeyFromOrderPrefix,
} from '@/lib/order-paths';

type JsonRecord = Record<string, unknown>;

export interface BuildW2AManifestBaseContext {
  orderId: string;
  rootOrderId: string | null;
  amazonOrderId: string | null;
  characterHash: string | null;
  childName: string | null;
  characterSpecs: JsonRecord;
  bookSpecs: JsonRecord;
  orderDetails: JsonRecord;
  oneManifestUrl: string | null;
  publicR2Url: string | null;
  backendUrl: string;
  bookId: string;
  orderPrefix: string;
  manifestKey: string;
  manifestUrl: string;
  assetsRoot: string;
}

export interface BuildW2ABootstrapManifestResult extends BuildW2AManifestBaseContext {
  manifest: JsonRecord;
}

export interface BuildW2ARunManifestResult extends BuildW2AManifestBaseContext {
  manifest: JsonRecord;
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

function toInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

function sanitizePath(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function ensureIso(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

function joinUrl(base: string | null | undefined, key: string | null | undefined): string | null {
  const normalizedBase = toTrimmedString(base);
  const normalizedKey = sanitizePath(key);

  if (!normalizedBase || !normalizedKey) {
    return null;
  }

  return `${normalizedBase.replace(/\/$/, '')}/${normalizedKey}`;
}

function extractCharacterHashFromString(value: unknown): string | null {
  const candidate = toTrimmedString(value);
  if (!candidate) {
    return null;
  }

  const strictMatch = candidate.match(/(?:^|\/)characters\/([a-f0-9]{12,64})(?:\/|$)/i);
  if (strictMatch) {
    return strictMatch[1] ?? null;
  }

  const looseMatch =
    candidate.match(/characters[_-]([a-f0-9]{12,64})[_-]pose\d{1,3}/i) ??
    candidate.match(/characters[_-]([a-f0-9]{12,64})[_-]/i);

  return looseMatch?.[1] ?? null;
}

function extractPoseNumberFromString(value: unknown): number | null {
  const candidate = toTrimmedString(value);
  if (!candidate) {
    return null;
  }

  const match = candidate.match(/pose[_-]?(\d{1,3})/i);
  return match ? toInteger(match[1]) : null;
}

function resolveBaseContext(input: JsonRecord): BuildW2AManifestBaseContext {
  const orderContext = toRecord(input.orderContext);
  const characterSpecs = toRecord(
    pickFirstNonEmpty(input.characterSpecs, orderContext.characterSpecs),
  );
  const bookSpecs = toRecord(
    pickFirstNonEmpty(input.bookSpecs, orderContext.bookSpecs),
  );
  const orderDetails = toRecord(
    pickFirstNonEmpty(input.orderDetails, orderContext.orderDetails),
  );

  const orderId = toTrimmedString(
    pickFirstNonEmpty(input.orderId, orderContext.orderId),
  );
  if (!orderId) {
    throw new Error('W2A manifest build requires orderId');
  }

  const oneManifestUrl = toTrimmedString(
    pickFirstNonEmpty(
      input.oneManifestUrl,
      input.one_manifest_url,
      orderContext.oneManifestUrl,
      orderContext.one_manifest_url,
    ),
  );

  const pathLikes = [
    toTrimmedString(input.orderPrefix),
    toTrimmedString(input.order_prefix),
    toTrimmedString(input.assetPrefix),
    toTrimmedString(input.asset_prefix),
    oneManifestUrl,
    toTrimmedString(input.manifestKey),
    toTrimmedString(input.manifestUrl),
  ].filter((value): value is string => Boolean(value));

  const { bookId, orderPrefix } = resolveOrderPathContext(orderId, {
    bookId:
      toTrimmedString(
        pickFirstNonEmpty(
          input.bookId,
          orderContext.bookId,
          bookSpecs.bookId,
        ),
      ) ?? undefined,
    orderPrefix:
      toTrimmedString(
        pickFirstNonEmpty(
          input.orderPrefix,
          input.order_prefix,
          orderContext.orderPrefix,
        ),
      ) ?? undefined,
    pathLikes,
  });

  const manifestKey = buildManifestKeyFromOrderPrefix(orderPrefix, '2a');
  const backendUrl =
    toTrimmedString(
      pickFirstNonEmpty(input.backendUrl, orderContext.backendUrl),
    ) ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'https://admin.littleherolabs.com';

  const rootOrderId = toTrimmedString(
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
  );

  const amazonOrderId = toTrimmedString(
    pickFirstNonEmpty(
      input.amazonOrderId,
      input.amazon_order_id,
      rootOrderId,
      orderContext.amazonOrderId,
      orderContext.amazon_order_id,
      orderContext.rootOrderId,
      orderContext.root_order_id,
    ),
  );

  const characterHash = toTrimmedString(
    pickFirstNonEmpty(input.characterHash, orderContext.characterHash),
  );

  return {
    orderId,
    rootOrderId,
    amazonOrderId,
    characterHash,
    childName:
      toTrimmedString(
        pickFirstNonEmpty(
          input.childName,
          orderContext.childName,
          characterSpecs.childName,
        ),
      ) ?? null,
    characterSpecs,
    bookSpecs,
    orderDetails,
    oneManifestUrl,
    publicR2Url:
      toTrimmedString(
        pickFirstNonEmpty(input.publicR2Url, orderContext.publicR2Url),
      ) ?? null,
    backendUrl: backendUrl.replace(/\/$/, ''),
    bookId,
    orderPrefix,
    manifestKey,
    manifestUrl: `${backendUrl.replace(/\/$/, '')}/api/manifests/${manifestKey}`,
    assetsRoot:
      sanitizePath(
        toTrimmedString(
          pickFirstNonEmpty(input.assetsRoot, orderContext.assetsRoot),
        ) ?? `${bookId}/order-generated-assets`,
      ) || `${bookId}/order-generated-assets`,
  };
}

export function buildW2ABootstrapManifest(
  input: JsonRecord,
): BuildW2ABootstrapManifestResult {
  const context = resolveBaseContext(input);

  if (!context.characterHash) {
    throw new Error(`W2A bootstrap manifest requires characterHash for ${context.orderId}`);
  }

  const now = ensureIso(new Date());
  const manifest: JsonRecord = {
    schema: 'lhb.run-manifest@v2.0',
    runStamp: now,
    generatedAt: now,
    bookId: context.bookId,
    characterHash: context.characterHash,
    orderId: context.orderId,
    rootOrderId: context.rootOrderId,
    amazonOrderId: context.amazonOrderId,
    manifestUrl: context.manifestUrl,
    originalManifestUrl: context.manifestUrl,
    order: {
      orderId: context.orderId,
      rootOrderId: context.rootOrderId,
      amazonOrderId: context.amazonOrderId,
      oneManifestUrl: context.oneManifestUrl,
      childName: context.childName,
      characterSpecs: context.characterSpecs,
      bookSpecs: context.bookSpecs,
      orderDetails: context.orderDetails,
      publicR2Url: context.publicR2Url,
      r2BucketName: 'little-hero-assets',
    },
    poses: {
      total: 0,
      approved: 0,
      exhausted: 0,
      retried: 0,
      failed: 0,
      needingReview: 0,
    },
    entries: [],
    reviewQueue: [],
    summary: {
      percentComplete: 0,
      readyForBook: false,
      needsHumanReview: false,
    },
    workflow: {
      currentStage: '2A-bootstrap',
      nextWorkflow: '2A',
      requiresHumanReview: false,
    },
  };

  return {
    ...context,
    manifest,
  };
}

function collectPoseResults(input: JsonRecord): JsonRecord[] {
  const poseResults = Array.isArray(input.poseResults)
    ? input.poseResults
    : Array.isArray(input.results)
      ? input.results
      : [];

  return poseResults.filter(isRecord);
}

function buildEmptyW2ARunManifest(
  input: JsonRecord,
  context: BuildW2AManifestBaseContext,
): BuildW2ARunManifestResult {
  const runStamp = ensureIso(input.runStamp);
  const manifest: JsonRecord = {
    schema: 'lhb.run-manifest@v2.0',
    runStamp,
    generatedAt: ensureIso(new Date()),
    bookId: context.bookId,
    characterHash: context.characterHash ?? 'unknown',
    orderId: context.orderId,
    rootOrderId: context.rootOrderId,
    amazonOrderId: context.amazonOrderId,
    manifestUrl: context.manifestUrl,
    originalManifestUrl: context.manifestUrl,
    order: {
      orderId: context.orderId,
      rootOrderId: context.rootOrderId,
      amazonOrderId: context.amazonOrderId,
      oneManifestUrl: context.oneManifestUrl,
      childName: context.childName,
      characterSpecs: context.characterSpecs,
      bookSpecs: context.bookSpecs,
      orderDetails: context.orderDetails,
      publicR2Url: context.publicR2Url,
      r2BucketName: 'little-hero-assets',
    },
    poses: {
      total: 0,
      approved: 0,
      exhausted: 0,
      retried: 0,
      failed: 0,
      needingReview: 0,
    },
    entries: [],
    reviewQueue: [],
    summary: {
      percentComplete: 0,
      readyForBook: false,
      needsHumanReview: false,
    },
    workflow: {
      currentStage: '2A-complete',
      nextWorkflow: 'unknown',
      requiresHumanReview: false,
    },
    _note: 'EMPTY MANIFEST: no_pose_results_found',
  };

  return {
    ...context,
    manifest,
  };
}

export function buildW2ARunManifest(
  input: JsonRecord,
): BuildW2ARunManifestResult {
  const poseResults = collectPoseResults(input);
  const firstResult = poseResults[0] ?? {};
  const mergedInput: JsonRecord = {
    ...input,
    orderContext: toRecord(
      pickFirstNonEmpty(input.orderContext, firstResult.orderContext, firstResult.orderData),
    ),
    characterHash: pickFirstNonEmpty(
      input.characterHash,
      firstResult.characterHash,
      toRecord(firstResult.ctx).characterHash,
    ),
    publicR2Url: pickFirstNonEmpty(
      input.publicR2Url,
      firstResult.publicR2Url,
      toRecord(input.orderContext).publicR2Url,
    ),
    assetsRoot: pickFirstNonEmpty(
      input.assetsRoot,
      firstResult.assetsRoot,
      toRecord(input.orderContext).assetsRoot,
    ),
    bookId: pickFirstNonEmpty(
      input.bookId,
      toRecord(input.orderContext).bookId,
      toRecord(firstResult.orderContext).bookId,
    ),
  };
  const context = resolveBaseContext(mergedInput);

  if (poseResults.length === 0) {
    return buildEmptyW2ARunManifest(input, context);
  }

  const runStamp = ensureIso(
    pickFirstNonEmpty(
      input.runStamp,
      firstResult.runStamp,
      toRecord(firstResult.ctx).runStamp,
    ),
  );

  let characterHash =
    context.characterHash ??
    toTrimmedString(
      pickFirstNonEmpty(
        firstResult.characterHash,
        toRecord(firstResult.ctx).characterHash,
      ),
    );
  const poseIndexFixes: Array<{
    inputNumeric: number;
    fromPath: number;
    used: number;
    key: string;
  }> = [];
  const byPose = new Map<number, JsonRecord>();

  for (const result of poseResults) {
    const qaRecord = toRecord(result.qa);
    const qaPoseRecord = toRecord(qaRecord.pose);
    const qaStyleRecord = toRecord(qaRecord.style);
    const qaStyleScoreRecord = toRecord(qaStyleRecord.score);
    const numericPose = toInteger(
      pickFirstNonEmpty(
        result.poseNumber,
        result.currentPoseNumber,
        result.pose_index,
        result.index,
      ),
    );
    const poseFromPath = extractPoseNumberFromString(
      pickFirstNonEmpty(
        result.approvedKey,
        result.uploadKey,
        result.storageKey,
        result.generatedFileName,
        result.publicUrl,
        result.__uuid,
      ),
    );
    const poseNumber = poseFromPath ?? numericPose;
    if (poseNumber === null) {
      continue;
    }

    if (
      numericPose !== null &&
      poseFromPath !== null &&
      numericPose !== poseFromPath
    ) {
      poseIndexFixes.push({
        inputNumeric: numericPose,
        fromPath: poseFromPath,
        used: poseNumber,
        key:
          toTrimmedString(
            pickFirstNonEmpty(
              result.approvedKey,
              result.uploadKey,
              result.storageKey,
              result.generatedFileName,
            ),
          ) ?? '(none)',
      });
    }

    const attempt = toInteger(result.retryAttempt) ?? 0;
    const qaPass =
      result.qaPass === true ||
      result.qaCombinedPass === true ||
      result.success === true;
    const approvedKey = toTrimmedString(
      pickFirstNonEmpty(result.approvedKey, result.uploadKey, result.storageKey),
    );
    const approvedFilename =
      approvedKey?.split('/').pop() ??
      toTrimmedString(result.generatedFileName);
    const qaReasons = Array.isArray(result.qaReasons)
      ? result.qaReasons.filter((value): value is string => typeof value === 'string')
      : Array.isArray(qaStyleRecord.reasons)
        ? (qaStyleRecord.reasons as string[])
        : [];
    const maxRetries =
      toInteger(pickFirstNonEmpty(result.maxPoseRetries, result.maxRetries)) ?? 3;
    const needsReview = result.needsReview === true;
    const reviewReason = toTrimmedString(result.reviewReason);

    const existing = byPose.get(poseNumber) ?? {
      poseNumber,
      attempts: 0,
      approvedKey: null,
      approvedFilename: null,
      anyPass: false,
      exhausted: false,
      qaScore: null,
      styleScore: null,
      qaReasons: [] as string[],
      needsReview: false,
      reviewReason: null,
      maxRetries,
      retryHistory: [] as Array<Record<string, unknown>>,
      publicUrl: null,
      correlationId: null,
      qaPoseNotes: null,
      qaStyleNotes: null,
    };

    if (attempt > (existing.attempts as number)) {
      existing.attempts = attempt;
    }

    if (!qaPass && qaReasons.length) {
      existing.qaReasons = Array.from(
        new Set([...(existing.qaReasons as string[]), ...qaReasons]),
      );
    }

    if (attempt > 0) {
      (existing.retryHistory as Array<Record<string, unknown>>).push({
        attempt,
        passed: qaPass,
        qaScore: result.qaScore ?? qaPoseRecord.score ?? null,
        styleScore: result.styleScore ?? qaStyleScoreRecord.style_cohesion ?? null,
        reasons: qaReasons.length ? qaReasons : null,
      });
    }

    existing.anyPass = Boolean(existing.anyPass) || qaPass;

    if (qaPass && (approvedKey || approvedFilename)) {
      if (approvedKey) {
        existing.approvedKey = approvedKey;
      }
      if (approvedFilename) {
        existing.approvedFilename = approvedFilename;
      }

      const publicUrl = toTrimmedString(result.publicUrl);
      const correlationId = toTrimmedString(result.correlationId);
      if (publicUrl) {
        existing.publicUrl = publicUrl;
      }
      if (correlationId) {
        existing.correlationId = correlationId;
      }
    }

    const qaPoseNotes = toTrimmedString(qaPoseRecord.notes);
    const qaStyleNotes = toTrimmedString(qaStyleRecord.notes);
    if (qaPoseNotes) {
      existing.qaPoseNotes = qaPoseNotes;
    }
    if (qaStyleNotes) {
      existing.qaStyleNotes = qaStyleNotes;
    }

    if (needsReview) {
      existing.needsReview = true;
      existing.reviewReason = reviewReason ?? existing.reviewReason;
    }

    if (attempt >= (existing.maxRetries as number)) {
      existing.exhausted = true;
    }

    if (result.qaScore !== undefined && result.qaScore !== null) {
      existing.qaScore = result.qaScore;
    } else if (qaPoseRecord.score !== undefined) {
      existing.qaScore = qaPoseRecord.score;
    }

    const styleScore = result.styleScore ?? qaStyleScoreRecord.style_cohesion ?? null;
    if (styleScore !== null && styleScore !== undefined) {
      existing.styleScore = styleScore;
    }

    byPose.set(poseNumber, existing);
  }

  if (!characterHash) {
    for (const entry of byPose.values()) {
      const derived =
        extractCharacterHashFromString(entry.approvedKey) ??
        extractCharacterHashFromString(entry.approvedFilename);
      if (derived) {
        characterHash = derived;
        break;
      }
    }
  }

  const entries: JsonRecord[] = [];
  const reviewQueue: JsonRecord[] = [];
  let approvedCount = 0;
  let exhaustedCount = 0;
  let retriedCount = 0;
  let needsReviewCount = 0;

  const poseNumbers = Array.from(byPose.keys()).sort((left, right) => left - right);
  for (const poseNumber of poseNumbers) {
    const pose = byPose.get(poseNumber)!;
    const approvedFilename =
      toTrimmedString(pose.approvedFilename) ??
      toTrimmedString(pose.approvedKey)?.split('/').pop() ??
      null;
    let approvedKey = toTrimmedString(pose.approvedKey);

    if (!approvedKey && approvedFilename && characterHash) {
      approvedKey = sanitizePath(
        `${context.assetsRoot}/characters/${characterHash}/poses/${approvedFilename}`,
      );
    }

    const publicUrl =
      toTrimmedString(pose.publicUrl) ?? joinUrl(context.publicR2Url, approvedKey);
    let status = 'failed_qa';
    if (pose.anyPass === true && approvedKey) {
      status = 'approved';
      approvedCount += 1;
    } else if (pose.anyPass === true) {
      status = 'passed_qa';
    }

    const isExhausted = pose.exhausted === true && status !== 'approved';
    if (isExhausted) {
      status = 'exhausted';
      exhaustedCount += 1;
    }

    const needsReview = pose.needsReview === true || isExhausted;
    if (needsReview) {
      needsReviewCount += 1;
    }

    if ((pose.attempts as number) >= 1) {
      retriedCount += 1;
    }

    const entry: JsonRecord = {
      poseNumber,
      attempts: pose.attempts,
      status,
      approved: status === 'approved',
      approvedKey,
      approvedFilename,
      publicUrl,
      correlationId: pose.correlationId,
      qaScore: pose.qaScore,
      styleScore: pose.styleScore,
      needsReview,
      reviewReason:
        toTrimmedString(pose.reviewReason) ??
        (isExhausted ? 'Exhausted retry attempts' : null),
    };

    if (pose.qaPoseNotes || pose.qaStyleNotes) {
      entry.qaNotes = {};
      if (pose.qaPoseNotes) {
        (entry.qaNotes as JsonRecord).pose = pose.qaPoseNotes;
      }
      if (pose.qaStyleNotes) {
        (entry.qaNotes as JsonRecord).style = pose.qaStyleNotes;
      }
    }

    if ((pose.attempts as number) >= 1) {
      entry.retryHistory =
        Array.isArray(pose.retryHistory) && pose.retryHistory.length > 0
          ? pose.retryHistory
          : null;
      entry.qaReasons =
        Array.isArray(pose.qaReasons) && pose.qaReasons.length > 0
          ? pose.qaReasons
          : null;
    }

    entries.push(entry);

    if (needsReview) {
      reviewQueue.push({
        poseNumber,
        reason: entry.reviewReason,
        publicUrl,
        qaScore: pose.qaScore,
        styleScore: pose.styleScore,
        attempts: pose.attempts,
        correlationId: pose.correlationId,
      });
    }
  }

  const totalPoses = poseNumbers.length;
  const percentComplete =
    totalPoses > 0 ? Math.round((approvedCount / totalPoses) * 100) : 0;
  const readyForBook = approvedCount === totalPoses && totalPoses > 0;
  const needsHumanReview = needsReviewCount > 0;

  const manifest: JsonRecord = {
    schema: 'lhb.run-manifest@v2.0',
    runStamp,
    generatedAt: ensureIso(new Date()),
    bookId: context.bookId,
    characterHash: characterHash ?? 'unknown',
    orderId: context.orderId,
    rootOrderId: context.rootOrderId,
    amazonOrderId: context.amazonOrderId,
    manifestUrl: context.manifestUrl,
    originalManifestUrl: context.manifestUrl,
    order: {
      orderId: context.orderId,
      rootOrderId: context.rootOrderId,
      amazonOrderId: context.amazonOrderId,
      oneManifestUrl: context.oneManifestUrl,
      childName: context.childName,
      characterSpecs: context.characterSpecs,
      bookSpecs: context.bookSpecs,
      orderDetails: context.orderDetails,
      publicR2Url: context.publicR2Url,
      r2BucketName: 'little-hero-assets',
    },
    poses: {
      total: totalPoses,
      approved: approvedCount,
      exhausted: exhaustedCount,
      retried: retriedCount,
      failed: Math.max(totalPoses - approvedCount - exhaustedCount, 0),
      needingReview: needsReviewCount,
    },
    entries,
    reviewQueue,
    summary: {
      percentComplete,
      readyForBook,
      needsHumanReview,
    },
    workflow: {
      currentStage: '2A-complete',
      nextWorkflow:
        totalPoses === 0
          ? 'unknown'
          : needsHumanReview
            ? '2B-retry'
            : '2B',
      requiresHumanReview: needsHumanReview,
    },
    _debug: {
      poseIndexFixes,
    },
  };

  return {
    ...context,
    characterHash: characterHash ?? 'unknown',
    manifest,
  };
}

export async function uploadW2AManifest(
  manifestKey: string,
  manifest: JsonRecord,
): Promise<void> {
  await putObject(
    R2_ORDERS_BUCKET,
    manifestKey,
    JSON.stringify(manifest, null, 2),
    'application/json',
  );
}
