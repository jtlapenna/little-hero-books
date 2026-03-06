import { NextRequest, NextResponse } from 'next/server';
import { getObject, putObject, R2_ORDERS_BUCKET, R2_PUBLIC_BUCKET } from '@/lib/r2-client';
import { buildManifestKey } from '@/lib/r2-service';
import { updateOrderInSupabase } from '@/lib/supabase-client';
import {
  AUTO_FLIP_CONFIDENCE_THRESHOLD,
  AUTO_FLIP_SUPPORTED_POSES,
  type AutoFlipDecisionSource,
  type AutoFlipManifest2A,
  type AutoFlipManifestEntry,
  applyPreBriaFlipMetadata,
  buildCanonicalPoseKey,
  buildPoseReferenceKey,
  canonicalizePoseKey,
  clear2BEntryForReprocessing,
  findOrCreatePoseEntry,
  isIdempotentAutoFlipReplay,
  isNotFoundError,
  parseJsonSafe,
  safeErrorMessage,
} from '@/lib/auto-flip-pose';
import { ensurePngBuffer, flipPngHorizontally } from '@/lib/image-flip';
import { deterministicOrientationCheck, type OrientationCheckResult } from '@/lib/orientation-check';

type AutoFlipPoseRequestBody = {
  poseNumber?: unknown;
  stage?: unknown;
  decisionSource?: unknown;
  generatedImageUrl?: unknown;
  flipRequestId?: unknown;
};

// Build a consistent error payload for all validation failures.
function badRequest(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 });
}

function jsonSuccess(body: Record<string, unknown>) {
  return NextResponse.json({ success: true, ...body });
}

// Parse JSON safely so invalid JSON returns deterministic 400.
async function parseBodySafe(request: NextRequest): Promise<AutoFlipPoseRequestBody | null> {
  try {
    const parsed = (await request.json()) as AutoFlipPoseRequestBody;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return null;
  }
}

// Validate that optional URL-like strings are syntactically valid.
function isValidUrlLike(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function loadBuffer(bucket: string, key: string): Promise<Buffer> {
  const response = await getObject(bucket, key);
  return Buffer.from(await response.arrayBuffer());
}

async function loadFromKnownBuckets(key: string): Promise<{ buffer: Buffer; bucket: string }> {
  try {
    return { buffer: await loadBuffer(R2_ORDERS_BUCKET, key), bucket: R2_ORDERS_BUCKET };
  } catch (ordersError) {
    const ordersMessage = safeErrorMessage(ordersError);
    if (!isNotFoundError(ordersMessage)) throw ordersError;
    return { buffer: await loadBuffer(R2_PUBLIC_BUCKET, key), bucket: R2_PUBLIC_BUCKET };
  }
}

async function loadManifest2A(
  orderId: string,
  logContext: Record<string, unknown>,
): Promise<
  | { manifestKey: string; manifest: AutoFlipManifest2A | null }
  | { manifestKey: string; error: NextResponse }
> {
  const manifestKey = buildManifestKey(orderId, '2a');
  try {
    const manifestResponse = await getObject(R2_ORDERS_BUCKET, manifestKey);
    const manifestText = await manifestResponse.text();
    const manifest = parseJsonSafe<AutoFlipManifest2A>(manifestText);
    return { manifestKey, manifest };
  } catch (error) {
    const message = safeErrorMessage(error);
    console.error('[AutoFlipPoseAPI] manifest_load_failed', { ...logContext, manifestKey, message });
    return {
      manifestKey,
      error: NextResponse.json(
        { success: false, error: 'Failed to load 2a manifest' },
        { status: isNotFoundError(message) ? 404 : 500 },
      ),
    };
  }
}

async function invalidate2BManifest(orderId: string, poseNumber: number, logContext: Record<string, unknown>) {
  try {
    const manifest2bKey = buildManifestKey(orderId, '2b');
    let manifest2b: { entries?: AutoFlipManifestEntry[] } | null = null;

    try {
      const manifest2bResponse = await getObject(R2_ORDERS_BUCKET, manifest2bKey);
      const manifest2bText = await manifest2bResponse.text();
      manifest2b = parseJsonSafe<{ entries?: AutoFlipManifestEntry[] }>(manifest2bText);
    } catch (error) {
      const message = safeErrorMessage(error);
      if (!isNotFoundError(message)) {
        console.warn('[AutoFlipPoseAPI] manifest_2b_load_failed', { ...logContext, manifest2bKey, message });
      }
      return;
    }

    const entry2b = manifest2b?.entries?.find((item) => item.poseNumber === poseNumber);
    if (!manifest2b || !entry2b) return;
    clear2BEntryForReprocessing(entry2b);
    await putObject(R2_ORDERS_BUCKET, manifest2bKey, JSON.stringify(manifest2b, null, 2), 'application/json');
  } catch (error) {
    console.warn('[AutoFlipPoseAPI] manifest_2b_invalidation_failed', {
      ...logContext,
      message: safeErrorMessage(error),
    });
  }
}

// Enforce bearer token for internal callers when configured.
function requireInternalToken(request: NextRequest): { ok: true } | { ok: false; response: NextResponse } {
  const expectedToken = process.env.BACKEND_INTERNAL_TOKEN;
  if (!expectedToken) return { ok: true };
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Unauthorized - missing or invalid Authorization header' },
        { status: 401 },
      ),
    };
  }
  const token = authHeader.slice(7);
  if (token !== expectedToken) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Unauthorized - invalid token' }, { status: 401 }),
    };
  }
  return { ok: true };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  // Auth gate for internal n8n/backend callers.
  const authCheck = requireInternalToken(request);
  if (!authCheck.ok) return authCheck.response;

  const { orderId } = await params;

  if (!orderId?.trim()) {
    console.error('[AutoFlipPoseAPI] validation_failed', { error: 'Missing orderId' });
    return badRequest('Missing orderId');
  }

  const body = await parseBodySafe(request);
  if (body === null) {
    console.error('[AutoFlipPoseAPI] validation_failed', { orderId, error: 'Invalid JSON body' });
    return badRequest('Invalid JSON body');
  }

  const { poseNumber, stage, decisionSource, generatedImageUrl, flipRequestId } = body;
  const poseNumberValue = Number(poseNumber);

  if (!Number.isInteger(poseNumber) || poseNumberValue < 0) {
    console.error('[AutoFlipPoseAPI] validation_failed', { orderId, error: 'Invalid poseNumber', poseNumber });
    return badRequest('Invalid poseNumber: must be an integer >= 0');
  }

  if (stage !== 'preBria') {
    console.error('[AutoFlipPoseAPI] validation_failed', { orderId, error: 'Invalid stage', stage });
    return badRequest('Invalid stage. auto-flip-pose currently supports preBria only');
  }

  if (
    decisionSource !== undefined &&
    decisionSource !== 'gemini' &&
    decisionSource !== 'deterministic'
  ) {
    console.error('[AutoFlipPoseAPI] validation_failed', {
      orderId,
      error: 'Invalid decisionSource',
      decisionSource,
    });
    return badRequest('Invalid decisionSource');
  }

  if (
    generatedImageUrl !== undefined &&
    (typeof generatedImageUrl !== 'string' || !isValidUrlLike(generatedImageUrl))
  ) {
    console.error('[AutoFlipPoseAPI] validation_failed', {
      orderId,
      error: 'Invalid generatedImageUrl',
      generatedImageUrl,
    });
    return badRequest('Invalid generatedImageUrl');
  }

  if (
    flipRequestId !== undefined &&
    (typeof flipRequestId !== 'string' || !flipRequestId.trim() || flipRequestId.length > 200)
  ) {
    console.error('[AutoFlipPoseAPI] validation_failed', {
      orderId,
      error: 'Invalid flipRequestId',
      flipRequestId,
    });
    return badRequest('Invalid flipRequestId');
  }

  const logContext: {
    route: string;
    orderId: string;
    poseNumber: number;
    stage: 'preBria';
    decisionSource: AutoFlipDecisionSource | null;
  } = {
    route: 'POST /api/orders/[orderId]/auto-flip-pose',
    orderId,
    poseNumber: poseNumberValue,
    stage: 'preBria',
    decisionSource:
      decisionSource === 'gemini' || decisionSource === 'deterministic'
        ? (decisionSource as AutoFlipDecisionSource)
        : null,
  };
  console.log('[AutoFlipPoseAPI] request_validated', logContext);

  try {
    if (!AUTO_FLIP_SUPPORTED_POSES.has(poseNumberValue)) {
      return jsonSuccess({
        checked: false,
        flipped: false,
        orderId,
        poseNumber: poseNumberValue,
        stage: 'preBria',
        skipReason: 'pose_not_supported',
      });
    }

    const manifestResult = await loadManifest2A(orderId, logContext);
    if ('error' in manifestResult) return manifestResult.error;
    const { manifestKey, manifest } = manifestResult;

    if (!manifest || !Array.isArray(manifest.entries)) {
      console.error('[AutoFlipPoseAPI] manifest_invalid', { ...logContext, manifestKey });
      return NextResponse.json({ success: false, error: 'Invalid 2a manifest structure' }, { status: 400 });
    }

    const entry = findOrCreatePoseEntry(manifest, poseNumberValue);

    // Idempotency guard: duplicate request id should be a safe no-op.
    const requestId = typeof flipRequestId === 'string' ? flipRequestId.trim() : '';
    if (isIdempotentAutoFlipReplay(entry, requestId)) {
      console.log('[AutoFlipPoseAPI] idempotent_replay_noop', {
        ...logContext,
        requestId,
      });
      return jsonSuccess({
        checked: true,
        flipped: false,
        idempotent: true,
        orderId,
        poseNumber: poseNumberValue,
        stage: 'preBria',
        r2Key: entry.approvedKey || null,
        replacedAt: entry.replacedAt || null,
        decisionSource: 'deterministic',
      });
    }

    const characterHash = manifest.characterHash || manifest.order?.characterHash;
    if (!characterHash) {
      console.error('[AutoFlipPoseAPI] character_hash_missing', logContext);
      return NextResponse.json(
        { success: false, error: 'Cannot resolve characterHash from 2a manifest' },
        { status: 400 },
      );
    }

    const fallbackKey = buildCanonicalPoseKey(characterHash, poseNumberValue);
    const sourceKey = typeof entry.approvedKey === 'string' && entry.approvedKey ? entry.approvedKey : fallbackKey;
    const canonicalKey = canonicalizePoseKey(sourceKey);
    const poseRefKey = buildPoseReferenceKey(poseNumberValue);

    let sourceImage: Buffer | null = null;
    let sourceBucket = R2_ORDERS_BUCKET;
    let resolvedSourceKey = canonicalKey;
    try {
      const source = await loadFromKnownBuckets(canonicalKey);
      sourceImage = source.buffer;
      sourceBucket = source.bucket;
    } catch (canonicalError) {
      const canonicalMessage = safeErrorMessage(canonicalError);
      if (!isNotFoundError(canonicalMessage) || sourceKey === canonicalKey) {
        console.error('[AutoFlipPoseAPI] source_image_load_failed', {
          ...logContext,
          bucket: sourceBucket,
          sourceKey,
          canonicalKey,
          message: canonicalMessage,
        });
        return NextResponse.json(
          { success: false, error: 'Failed to load source image for flipping' },
          { status: isNotFoundError(canonicalMessage) ? 404 : 500 },
        );
      }

      try {
        const source = await loadFromKnownBuckets(sourceKey);
        sourceImage = source.buffer;
        sourceBucket = source.bucket;
        resolvedSourceKey = sourceKey;
      } catch (sourceError) {
        const sourceMessage = safeErrorMessage(sourceError);
        console.error('[AutoFlipPoseAPI] source_image_load_failed', {
          ...logContext,
          bucket: sourceBucket,
          sourceKey,
          canonicalKey,
          message: sourceMessage,
        });
        return NextResponse.json(
          { success: false, error: 'Failed to load source image for flipping' },
          { status: isNotFoundError(sourceMessage) ? 404 : 500 },
        );
      }
    }

    if (!sourceImage) {
      console.error('[AutoFlipPoseAPI] source_image_unavailable', { ...logContext, sourceKey, canonicalKey });
      return NextResponse.json({ success: false, error: 'Failed to load source image for flipping' }, { status: 500 });
    }

    let poseReference: Buffer;
    try {
      poseReference = await loadBuffer(R2_PUBLIC_BUCKET, poseRefKey);
    } catch (error) {
      const message = safeErrorMessage(error);
      console.error('[AutoFlipPoseAPI] pose_reference_load_failed', { ...logContext, poseRefKey, message });
      return NextResponse.json(
        { success: false, error: 'Failed to load pose reference image' },
        { status: isNotFoundError(message) ? 404 : 500 },
      );
    }

    let sourcePng: Buffer;
    let poseRefPng: Buffer;
    try {
      sourcePng = ensurePngBuffer(sourceImage, 'preBria_pose');
      poseRefPng = ensurePngBuffer(poseReference, 'pose_reference');
    } catch (error) {
      const message = safeErrorMessage(error);
      console.warn('[AutoFlipPoseAPI] unsupported_source_format', { ...logContext, canonicalKey, poseRefKey, message });
      return jsonSuccess({
        checked: true,
        flipped: false,
        orderId,
        poseNumber: poseNumberValue,
        stage: 'preBria',
        r2Key: canonicalKey,
        decisionSource: 'deterministic',
        skipReason: 'unsupported_image_format',
        message: 'Deterministic auto-flip currently supports PNG inputs only.',
      });
    }

    let orientationResult: OrientationCheckResult | null = null;
    try {
      orientationResult = deterministicOrientationCheck(poseRefPng, sourcePng);
    } catch (error) {
      console.warn('[AutoFlipPoseAPI] deterministic_check_failed', {
        ...logContext,
        canonicalKey,
        poseRefKey,
        message: safeErrorMessage(error),
      });
    }

    if (!orientationResult) {
      return jsonSuccess({
        checked: true,
        flipped: false,
        orderId,
        poseNumber: poseNumberValue,
        stage: 'preBria',
        r2Key: canonicalKey,
        decisionSource: 'deterministic',
        skipReason: 'inconclusive',
      });
    }

    if (orientationResult.confidence < AUTO_FLIP_CONFIDENCE_THRESHOLD) {
      return jsonSuccess({
        checked: true,
        flipped: false,
        orderId,
        poseNumber: poseNumberValue,
        stage: 'preBria',
        r2Key: canonicalKey,
        decisionSource: 'deterministic',
        confidence: orientationResult.confidence,
        refDiff: orientationResult.refDiff,
        flippedDiff: orientationResult.flippedDiff,
        skipReason: 'inconclusive',
      });
    }

    if (!orientationResult.needsFlip) {
      return jsonSuccess({
        checked: true,
        flipped: false,
        orderId,
        poseNumber: poseNumberValue,
        stage: 'preBria',
        r2Key: canonicalKey,
        decisionSource: 'deterministic',
        confidence: orientationResult.confidence,
        refDiff: orientationResult.refDiff,
        flippedDiff: orientationResult.flippedDiff,
        skipReason: 'no_flip_needed',
      });
    }

    let flippedImage: Buffer;
    try {
      flippedImage = flipPngHorizontally(sourcePng);
    } catch (error) {
      console.error('[AutoFlipPoseAPI] image_flip_failed', {
        ...logContext,
        canonicalKey,
        message: safeErrorMessage(error),
      });
      return NextResponse.json({ success: false, error: 'Failed to flip image bytes' }, { status: 500 });
    }

    try {
      await putObject(sourceBucket, canonicalKey, flippedImage, 'image/png');
    } catch (error) {
      const message = safeErrorMessage(error);
      console.error('[AutoFlipPoseAPI] r2_upload_failed', {
        ...logContext,
        bucket: sourceBucket,
        canonicalKey,
        message,
      });
      return NextResponse.json({ success: false, error: 'Failed to upload flipped image' }, { status: 500 });
    }

    const replacedAt = new Date().toISOString();
    applyPreBriaFlipMetadata({
      entry,
      poseNumber: poseNumberValue,
      canonicalKey,
      publicR2Url: manifest.order?.publicR2Url,
      replacedAt,
      requestId,
    });

    await putObject(R2_ORDERS_BUCKET, manifestKey, JSON.stringify(manifest, null, 2), 'application/json');

    await invalidate2BManifest(orderId, poseNumberValue, logContext);

    try {
      await updateOrderInSupabase(orderId, { updated_at: replacedAt });
    } catch (error) {
      console.warn('[AutoFlipPoseAPI] supabase_touch_failed', {
        ...logContext,
        message: safeErrorMessage(error),
      });
    }

    console.log('[AutoFlipPoseAPI] flip_completed', {
      ...logContext,
      sourceKey: resolvedSourceKey,
      r2Key: canonicalKey,
      replacedAt,
    });
    return NextResponse.json({
      success: true,
      checked: true,
      flipped: true,
      orderId,
      poseNumber: poseNumberValue,
      stage: 'preBria',
      r2Key: canonicalKey,
      replacedAt,
      decisionSource: 'deterministic',
      confidence: orientationResult.confidence,
      refDiff: orientationResult.refDiff,
      flippedDiff: orientationResult.flippedDiff,
    });
  } catch (error) {
    console.error('[AutoFlipPoseAPI] unexpected_error', {
      ...logContext,
      message: safeErrorMessage(error),
    });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
