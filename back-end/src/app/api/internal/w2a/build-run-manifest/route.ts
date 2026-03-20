import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { buildW2ARunManifest, uploadW2AManifest } from '@/lib/books';

export const dynamic = 'force-dynamic';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapPayloadObject(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  return isRecord(value.payload) ? value.payload : value;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * POST /api/internal/w2a/build-run-manifest
 *
 * Internal endpoint for the sibling W2A orchestrator. It accepts the reduced
 * pose-result envelope gathered in n8n, builds the canonical 2A run manifest
 * in repo code, uploads it to R2, and returns the manifest metadata needed by
 * the existing 2A-complete webhook.
 *
 * Auth: Authorization: Bearer <BACKEND_API_TOKEN>
 */
export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: `Unauthorized - ${auth.error}` },
      { status: 401 },
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const body = unwrapPayloadObject(parsedBody);

  if (!body) {
    return NextResponse.json(
      { error: 'Request body must be a JSON object' },
      { status: 400 },
    );
  }

  try {
    const built = buildW2ARunManifest(body);
    await uploadW2AManifest(built.manifestKey, built.manifest);

    return NextResponse.json({
      success: true,
      orderId: built.orderId,
      rootOrderId: built.rootOrderId,
      amazonOrderId: built.amazonOrderId,
      oneManifestUrl: built.oneManifestUrl,
      characterHash: built.characterHash,
      bookId: built.bookId,
      orderPrefix: built.orderPrefix,
      assetsRoot: built.assetsRoot,
      publicR2Url: built.publicR2Url,
      manifestKey: built.manifestKey,
      manifestUrl: built.manifestUrl,
      manifest: built.manifest,
      manifestReady: true,
      uploadBucket: 'little-hero-orders',
    });
  } catch (error: unknown) {
    console.error('[Internal W2A Build Run Manifest] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to build W2A run manifest',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
