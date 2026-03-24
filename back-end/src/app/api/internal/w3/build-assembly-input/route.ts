import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest } from '@/lib/r2-service';
import {
  buildW3AssemblyInput,
  type BuildW3AssemblyInputResult,
  type LoadManifestForW3,
} from '@/lib/books';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapPayloadObject(value: unknown): JsonRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  return isRecord(value.payload) ? value.payload : value;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function buildW3AssemblyInputResponse(
  body: JsonRecord,
  options: { loadManifest?: LoadManifestForW3 } = {},
): Promise<BuildW3AssemblyInputResult & { success: true }> {
  const result = await buildW3AssemblyInput(body, {
    loadManifest: options.loadManifest ?? downloadManifest,
  });

  return {
    success: true,
    ...result,
  };
}

/**
 * POST /api/internal/w3/build-assembly-input
 *
 * Internal endpoint for the repo-centric W3 orchestrator. It resolves the
 * canonical per-order assembly context, loads the companion 1/2B manifests,
 * and returns a normalized payload for the remaining n8n render/upload steps.
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

  try {
    const response = await buildW3AssemblyInputResponse(body);
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('[Internal W3 Build Assembly Input] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to build W3 assembly input',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
