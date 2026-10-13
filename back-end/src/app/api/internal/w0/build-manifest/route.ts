import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { parseW0ManifestRequest } from '@/lib/w0-manifest-request';
import {
  buildOrderIntakeManifestFromNormalizedInputRuntime,
} from '@/lib/w0-manifest-builder';
import { prepareFrozenW0Manifest } from '@/lib/books/freeze-w0-manifest';
import { w0ManifestStorage } from '@/lib/books/w0-manifest-storage';

export const dynamic = 'force-dynamic';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * POST /api/internal/w0/build-manifest
 *
 * Internal endpoint for n8n W0 to build the canonical 1-manifest from
 * normalized order input using the repo-owned W0 manifest builder.
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
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  let parsedRequest: ReturnType<typeof parseW0ManifestRequest>;
  try {
    parsedRequest = parseW0ManifestRequest(parsedBody, { allowLegacyMvpIntake: true });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid W0 config selection', details: getErrorMessage(error) }, { status: 400 });
  }
  const body = parsedRequest.input;
  const manifestOptions = parsedRequest.options;

  try {
    const builtManifest = await buildOrderIntakeManifestFromNormalizedInputRuntime(
      body,
      manifestOptions,
    );
    const frozen = await prepareFrozenW0Manifest(body, builtManifest, w0ManifestStorage);
    const { manifest, manifestKey, orderUpsert } = frozen;

    return NextResponse.json({
      success: true,
      orderId: orderUpsert.orderId,
      bookId: builtManifest.bookId,
      formatId: builtManifest.formatId,
      schemaVersion: builtManifest.schemaVersion,
      manifestSchema:
        typeof manifest.schema === 'string' ? manifest.schema : null,
      r2Key: manifestKey,
      manifestKey,
      manifest,
      orderUpsert,
      _config:
        body._config && typeof body._config === 'object' && !Array.isArray(body._config)
          ? body._config
          : undefined,
    });
  } catch (error: unknown) {
    console.error('[Internal W0 Build Manifest] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to build W0 manifest',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
