import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest } from '@/lib/r2-service';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import {
  buildW4PrintInput,
  type BuildW4PrintInputResult,
  type LoadManifestForW4,
  type LoadOrderForW4,
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

export async function buildW4PrintInputResponse(
  body: JsonRecord,
  options: {
    loadManifest?: LoadManifestForW4;
    loadOrder?: LoadOrderForW4;
  } = {},
): Promise<BuildW4PrintInputResult & { success: true }> {
  const result = await buildW4PrintInput(body, {
    loadManifest: options.loadManifest ?? downloadManifest,
    loadOrder: options.loadOrder ?? getOrderFromSupabase,
  });

  return {
    success: true,
    ...result,
  };
}

/**
 * POST /api/internal/w4/build-print-input
 *
 * Internal endpoint for the repo-centric W4 orchestrator. It resolves the
 * canonical print-fulfillment context from the current payload plus companion
 * manifests/order data, then returns the normalized payload needed by the
 * remaining n8n PDF/Lulu/upload steps.
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
    const response = await buildW4PrintInputResponse(body);
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('[Internal W4 Build Print Input] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to build W4 print input',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
