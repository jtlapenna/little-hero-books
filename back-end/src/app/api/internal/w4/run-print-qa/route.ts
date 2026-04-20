import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { recordWorkflowJobEventResponse } from '@/app/api/internal/workflow-jobs/log-event/route';
import {
  runW4PrintQa,
  type W4RunPrintQaInput,
  type W4RunPrintQaResult,
  type W4WorkerOptions,
} from '@/lib/workers/w4-print-worker';

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

function firstNonEmptyEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

export async function runW4PrintQaResponse(
  body: W4RunPrintQaInput,
  options: W4WorkerOptions = {},
): Promise<W4RunPrintQaResult & { success: true }> {
  return {
    success: true,
    ...(await runW4PrintQa(body, {
      ...options,
      recordWorkflowEvent: options.recordWorkflowEvent ?? recordWorkflowJobEventResponse,
      rendererApiBase:
        options.rendererApiBase ??
        firstNonEmptyEnv('RENDERER_API_BASE', 'RENDERER_BASE_URL', 'RENDERER_URL'),
      rendererInternalToken:
        options.rendererInternalToken ??
        firstNonEmptyEnv('RENDERER_INTERNAL_TOKEN', 'RENDERER_API_TOKEN'),
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
    return NextResponse.json(
      await runW4PrintQaResponse(body as W4RunPrintQaInput, {
        defaultBackendUrl: request.nextUrl.origin,
      }),
    );
  } catch (error: unknown) {
    console.error('[Internal W4 Run Print QA] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to run W4 print QA',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
