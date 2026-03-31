import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { buildW2ABaseInput, type BuildW2ABaseInputResult } from '@/lib/books';

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

export async function buildW2ABaseInputResponse(
  body: JsonRecord,
  options: {
    defaultBackendUrl?: string;
  } = {},
): Promise<BuildW2ABaseInputResult & { success: true }> {
  const result = await buildW2ABaseInput(body, {
    defaultBackendUrl: options.defaultBackendUrl,
  });

  return {
    success: true,
    ...result,
  };
}

/**
 * POST /api/internal/w2a/build-base-input
 *
 * Internal endpoint for the repo-centric W2A SW0 slice. It resolves canonical
 * base-generation context, prompt text, asset keys, and deterministic upload
 * pathing so the remaining n8n nodes can focus on binary transport and the live
 * Gemini call.
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
    const response = await buildW2ABaseInputResponse(body, {
      defaultBackendUrl: request.nextUrl.origin,
    });
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('[Internal W2A Build Base Input] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to build W2A base input',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
