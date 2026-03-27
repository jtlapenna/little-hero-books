import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import {
  markW3PreviewsReady,
  type MarkW3PreviewsReadyInput,
  type MarkW3PreviewsReadyResult,
} from '@/lib/workers/w3-assembly-worker';

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

export function markW3PreviewsReadyResponse(
  body: MarkW3PreviewsReadyInput,
): MarkW3PreviewsReadyResult & { success: true } {
  return {
    success: true,
    ...markW3PreviewsReady(body),
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
    return NextResponse.json(
      markW3PreviewsReadyResponse(body as MarkW3PreviewsReadyInput),
    );
  } catch (error: unknown) {
    console.error('[Internal W3 Mark Previews Ready] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to mark W3 previews ready',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
