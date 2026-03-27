import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { downloadManifest } from '@/lib/r2-service';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import {
  buildW4SiblingPrintInput,
  type BuildW4SiblingPrintInputResult,
  type BuildW4SiblingPrintInputOptions,
} from '@/lib/books';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapPayload(value: unknown): JsonRecord | unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (Array.isArray(value.payload)) {
    return value.payload;
  }

  return isRecord(value.payload) ? value.payload : value;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function buildW4SiblingPrintInputResponse(
  body: JsonRecord | unknown[],
  options: Partial<BuildW4SiblingPrintInputOptions> = {},
): Promise<BuildW4SiblingPrintInputResult & { success: true }> {
  const result = await buildW4SiblingPrintInput(body, {
    loadManifest: options.loadManifest ?? downloadManifest,
    loadOrder: options.loadOrder ?? getOrderFromSupabase,
    defaultBackendUrl: options.defaultBackendUrl,
  });

  return {
    success: true,
    ...result,
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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const body = unwrapPayload(parsedBody);
  if (!body) {
    return NextResponse.json(
      { error: 'Request body must be a JSON object or array' },
      { status: 400 },
    );
  }

  try {
    const response = await buildW4SiblingPrintInputResponse(body);
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('[Internal W4 Build Sibling Print Input] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to build W4 sibling print input',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
