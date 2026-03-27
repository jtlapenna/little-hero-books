import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import {
  buildW3Manifest,
  type BuildW3ManifestResult,
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

export function buildW3ManifestResponse(
  body: JsonRecord,
): BuildW3ManifestResult & { success: true } {
  return {
    success: true,
    ...buildW3Manifest(body),
  };
}

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
    return NextResponse.json(buildW3ManifestResponse(body));
  } catch (error: unknown) {
    console.error('[Internal W3 Build Manifest] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to build W3 manifest',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
