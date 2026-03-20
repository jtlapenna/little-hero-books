import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { buildW2ABootstrapManifest, uploadW2AManifest } from '@/lib/books';

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
 * POST /api/internal/w2a/bootstrap-manifest
 *
 * Internal endpoint for the sibling W2A orchestrator. It builds the canonical
 * per-item 2A bootstrap manifest in repo code and uploads it to R2 so later
 * W2A steps do not need to hardcode manifest keys in n8n.
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
    const built = buildW2ABootstrapManifest(body);
    await uploadW2AManifest(built.manifestKey, built.manifest);

    return NextResponse.json({
      success: true,
      ...body,
      orderId: built.orderId,
      rootOrderId: built.rootOrderId,
      amazonOrderId: built.amazonOrderId,
      characterHash: built.characterHash,
      bookId: built.bookId,
      orderPrefix: built.orderPrefix,
      assetsRoot: built.assetsRoot,
      publicR2Url: built.publicR2Url,
      manifestKey: built.manifestKey,
      manifestUrl: built.manifestUrl,
      manifest: built.manifest,
      manifestBootstrapReady: true,
      uploadBucket: 'little-hero-orders',
    });
  } catch (error: unknown) {
    console.error('[Internal W2A Bootstrap Manifest] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to bootstrap W2A manifest',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
