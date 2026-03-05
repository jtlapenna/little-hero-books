import { NextRequest, NextResponse } from 'next/server';
import { getObject, putObject, R2_ORDERS_BUCKET, R2_PUBLIC_BUCKET } from '@/lib/r2-client';
import { buildManifestKey } from '@/lib/r2-service';
import { updateOrderInSupabase } from '@/lib/supabase-client';

type DecisionSource = 'gemini';
type AutoFlipPoseRequestBody = {
  poseNumber?: unknown;
  stage?: unknown;
  decisionSource?: unknown;
  generatedImageUrl?: unknown;
  flipRequestId?: unknown;
};

type ManifestEntry = {
  poseNumber?: number;
  approvedKey?: string;
  approvedFilename?: string;
  approved?: boolean;
  status?: string;
  needsReview?: boolean;
  reviewReason?: string | null;
  briaStatusUrl?: string | null;
  briaRequestId?: string | null;
  briaStatus?: string | null;
  publicUrl?: string;
  replacedAt?: string;
  replacementCount?: number;
  replacedBy?: string | null;
  replacementHistory?: Array<{ replacedAt: string; replacedBy: string | null }>;
  lastAutoFlipRequestId?: string | null;
  lastAutoFlipAt?: string | null;
};

type Manifest2A = {
  characterHash?: string;
  order?: { characterHash?: string; publicR2Url?: string };
  entries?: ManifestEntry[];
};

// Build a consistent error payload for all validation failures.
function badRequest(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 });
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

function canonicalizePoseKey(rawKey: string): string {
  return rawKey.replace(/_r\d+\.png$/i, '.png').replace(/_TRY\d+\.png$/i, '.png');
}

function isNotFoundError(message: string): boolean {
  return message.includes('404') || message.includes('Not Found');
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function parseJsonSafe<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function flipImageHorizontallyToPng(input: Buffer): Promise<Buffer> {
  try {
    // Lazy-load sharp so route validation can still run on runtimes without native sharp support.
    const sharpModule = await import('sharp');
    const sharpFactory = sharpModule.default;
    return sharpFactory(input).flop().png().toBuffer();
  } catch (error) {
    throw new Error(`IMAGE_FLIP_RUNTIME_UNSUPPORTED:${safeErrorMessage(error)}`);
  }
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

  if (!Number.isInteger(poseNumber) || Number(poseNumber) < 0) {
    console.error('[AutoFlipPoseAPI] validation_failed', { orderId, error: 'Invalid poseNumber', poseNumber });
    return badRequest('Invalid poseNumber: must be an integer >= 0');
  }

  if (stage !== 'preBria') {
    console.error('[AutoFlipPoseAPI] validation_failed', { orderId, error: 'Invalid stage', stage });
    return badRequest('Invalid stage. auto-flip-pose currently supports preBria only');
  }

  if (decisionSource !== undefined && decisionSource !== 'gemini') {
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
    decisionSource: DecisionSource | null;
  } = {
    route: 'POST /api/orders/[orderId]/auto-flip-pose',
    orderId,
    poseNumber: Number(poseNumber),
    stage: 'preBria',
    decisionSource: decisionSource === 'gemini' ? 'gemini' : null,
  };
  console.log('[AutoFlipPoseAPI] request_validated', logContext);

  try {
    const manifestKey = buildManifestKey(orderId, '2a');
    let manifest: Manifest2A | null = null;

    try {
      const manifestResponse = await getObject(R2_ORDERS_BUCKET, manifestKey);
      const manifestText = await manifestResponse.text();
      manifest = parseJsonSafe<Manifest2A>(manifestText);
    } catch (error) {
      const message = safeErrorMessage(error);
      console.error('[AutoFlipPoseAPI] manifest_load_failed', { ...logContext, manifestKey, message });
      return NextResponse.json(
        { success: false, error: 'Failed to load 2a manifest' },
        { status: isNotFoundError(message) ? 404 : 500 },
      );
    }

    if (!manifest || !Array.isArray(manifest.entries)) {
      console.error('[AutoFlipPoseAPI] manifest_invalid', { ...logContext, manifestKey });
      return NextResponse.json({ success: false, error: 'Invalid 2a manifest structure' }, { status: 400 });
    }

    const poseNumberValue = Number(poseNumber);
    let entry = manifest.entries.find((item) => item.poseNumber === poseNumberValue);
    if (!entry) {
      entry = { poseNumber: poseNumberValue, status: 'approved', approved: true };
      manifest.entries.push(entry);
      manifest.entries.sort((a, b) => Number(a.poseNumber ?? 0) - Number(b.poseNumber ?? 0));
    }

    // Idempotency guard: duplicate request id should be a safe no-op.
    const requestId = typeof flipRequestId === 'string' ? flipRequestId.trim() : '';
    if (requestId && entry.lastAutoFlipRequestId === requestId) {
      console.log('[AutoFlipPoseAPI] idempotent_replay_noop', {
        ...logContext,
        requestId,
      });
      return NextResponse.json({
        success: true,
        flipped: false,
        idempotent: true,
        orderId,
        poseNumber: poseNumberValue,
        stage: 'preBria',
        r2Key: entry.approvedKey || null,
        replacedAt: entry.replacedAt || null,
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

    const poseNN = String(poseNumberValue).padStart(2, '0');
    const fallbackKey = `book-mvp-simple-adventure/order-generated-assets/characters/${characterHash}/poses/pose${poseNN}.png`;
    const sourceKey = typeof entry.approvedKey === 'string' && entry.approvedKey ? entry.approvedKey : fallbackKey;
    const canonicalKey = canonicalizePoseKey(sourceKey);
    const bucket = canonicalKey.includes('/characters/') ? R2_PUBLIC_BUCKET : R2_ORDERS_BUCKET;

    let sourceImage: Buffer | null = null;
    let resolvedSourceKey = canonicalKey;
    try {
      const canonicalImageResponse = await getObject(bucket, canonicalKey);
      sourceImage = Buffer.from(await canonicalImageResponse.arrayBuffer());
    } catch (canonicalError) {
      const canonicalMessage = safeErrorMessage(canonicalError);
      if (!isNotFoundError(canonicalMessage) || sourceKey === canonicalKey) {
        console.error('[AutoFlipPoseAPI] source_image_load_failed', {
          ...logContext,
          bucket,
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
        const sourceImageResponse = await getObject(bucket, sourceKey);
        sourceImage = Buffer.from(await sourceImageResponse.arrayBuffer());
        resolvedSourceKey = sourceKey;
      } catch (sourceError) {
        const sourceMessage = safeErrorMessage(sourceError);
        console.error('[AutoFlipPoseAPI] source_image_load_failed', {
          ...logContext,
          bucket,
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

    let flippedImage: Buffer;
    try {
      flippedImage = await flipImageHorizontallyToPng(sourceImage);
    } catch (error) {
      const message = safeErrorMessage(error);
      if (message.startsWith('IMAGE_FLIP_RUNTIME_UNSUPPORTED:')) {
        console.error('[AutoFlipPoseAPI] runtime_unsupported', { ...logContext, canonicalKey, message });
        return NextResponse.json(
          {
            success: false,
            error:
              'Auto-flip runtime unsupported in this deployment. Use non-Worker runtime for pixel flip operations.',
          },
          { status: 501 },
        );
      }
      console.error('[AutoFlipPoseAPI] image_flip_failed', { ...logContext, canonicalKey, message });
      return NextResponse.json({ success: false, error: 'Failed to flip image bytes' }, { status: 500 });
    }

    try {
      await putObject(bucket, canonicalKey, flippedImage, 'image/png');
    } catch (error) {
      const message = safeErrorMessage(error);
      console.error('[AutoFlipPoseAPI] r2_upload_failed', { ...logContext, bucket, canonicalKey, message });
      return NextResponse.json({ success: false, error: 'Failed to upload flipped image' }, { status: 500 });
    }

    const replacedAt = new Date().toISOString();
    const publicR2Url = manifest.order?.publicR2Url;
    const backendUrl = 'https://admin.littleherolabs.com';
    entry.approvedKey = canonicalKey;
    entry.approvedFilename = `pose${poseNN}.png`;
    entry.approved = true;
    entry.status = 'approved';
    entry.needsReview = false;
    entry.reviewReason = null;
    entry.briaStatusUrl = null;
    entry.briaRequestId = null;
    entry.briaStatus = null;
    entry.publicUrl = publicR2Url
      ? `${publicR2Url}/${canonicalKey}`
      : `${backendUrl}/api/assets/${canonicalKey}`;
    entry.replacedAt = replacedAt;
    entry.replacementCount = (entry.replacementCount || 0) + 1;
    entry.replacedBy = null;
    entry.lastAutoFlipRequestId = requestId || null;
    entry.lastAutoFlipAt = replacedAt;
    entry.replacementHistory = [
      ...(entry.replacementHistory || []),
      { replacedAt, replacedBy: null },
    ];

    await putObject(R2_ORDERS_BUCKET, manifestKey, JSON.stringify(manifest, null, 2), 'application/json');

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
      flipped: true,
      orderId,
      poseNumber: poseNumberValue,
      stage: 'preBria',
      r2Key: canonicalKey,
      replacedAt,
    });
  } catch (error) {
    console.error('[AutoFlipPoseAPI] unexpected_error', {
      ...logContext,
      message: safeErrorMessage(error),
    });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
