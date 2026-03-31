import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import {
  finalizeW2ABaseResult,
  type FinalizeW2ABaseResultOutput,
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

export function finalizeW2ABaseResultResponse(
  body: JsonRecord,
): FinalizeW2ABaseResultOutput {
  return finalizeW2ABaseResult(body);
}

/**
 * POST /api/internal/w2a/finalize-base-result
 *
 * Internal endpoint for the repo-centric W2A SW0 slice. It normalizes the
 * extracted generated-image result into the lean envelope expected by the
 * downstream W2A orchestrator while preserving the deterministic upload key
 * used by the existing n8n upload node.
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
    const response = finalizeW2ABaseResultResponse(body);
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('[Internal W2A Finalize Base Result] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to finalize W2A base result',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
