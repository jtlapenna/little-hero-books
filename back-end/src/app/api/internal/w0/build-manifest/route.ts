import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import type { BookConfigRuntimeSource } from '@/lib/books/runtime-book-config';
import {
  buildOrderIntakeManifestFromNormalizedInputRuntime,
  buildW0OrderUpsertPayload,
  resolveW0ManifestSchemaVersion,
  type BuildOrderIntakeManifestOptions,
  type NormalizedW0WorkflowInput,
} from '@/lib/w0-manifest-builder';

export const dynamic = 'force-dynamic';

function unwrapPayloadObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const nested = record.payload;

  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }

  return record;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseConfigSource(value: unknown): BookConfigRuntimeSource | undefined {
  const candidate = typeof value === 'string' ? value.trim() : '';

  if (
    candidate === 'bundled' ||
    candidate === 'published' ||
    candidate === 'published-first'
  ) {
    return candidate;
  }

  return undefined;
}

function buildManifestOptions(
  body: Record<string, unknown>,
): BuildOrderIntakeManifestOptions {
  const configVersion =
    typeof body.configVersion === 'number' && Number.isInteger(body.configVersion)
      ? body.configVersion
      : undefined;

  return {
    schemaVersion: resolveW0ManifestSchemaVersion(body.schemaVersion ?? 'v3'),
    bookId: typeof body.bookId === 'string' ? body.bookId.trim() || undefined : undefined,
    formatId: typeof body.formatId === 'string' ? body.formatId.trim() || undefined : undefined,
    configVersion,
    configSource: parseConfigSource(body.configSource) ?? 'published-first',
  };
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

  const body = unwrapPayloadObject(parsedBody);

  if (!body) {
    return NextResponse.json(
      { error: 'Request body must be a JSON object' },
      { status: 400 },
    );
  }
  const manifestOptions = buildManifestOptions(body);

  try {
    const builtManifest = await buildOrderIntakeManifestFromNormalizedInputRuntime(
      body as NormalizedW0WorkflowInput,
      manifestOptions,
    );
    const { manifest, manifestKey } = builtManifest;
    const orderUpsert = buildW0OrderUpsertPayload({
      normalizedInput: body as NormalizedW0WorkflowInput,
      manifest,
      manifestKey,
    });

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
