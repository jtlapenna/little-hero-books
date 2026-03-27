import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { getSignedUrlForObject } from '@/lib/r2-service';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import {
  buildW4SubmitInput,
  type BuildW4SubmitInputOptions,
  type BuildW4SubmitInputResult,
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

export async function buildW4SubmitInputResponse(
  body: JsonRecord,
  options: Partial<BuildW4SubmitInputOptions> = {},
): Promise<BuildW4SubmitInputResult & { success: true }> {
  return {
    success: true,
    ...(await buildW4SubmitInput(body, {
      loadOrder: options.loadOrder ?? getOrderFromSupabase,
      signObjectUrl: options.signObjectUrl ?? getSignedUrlForObject,
      signedUrlExpiresIn: options.signedUrlExpiresIn,
    })),
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

  const body = unwrapPayloadObject(parsedBody);
  if (!body) {
    return NextResponse.json(
      { error: 'Request body must be a JSON object' },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await buildW4SubmitInputResponse(body));
  } catch (error: unknown) {
    console.error('[Internal W4 Build Submit Input] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to build W4 submit input',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
