import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import {
  materializeW4PrintPdf,
  type W4MaterializePrintPdfInput,
  type W4MaterializePrintPdfResult,
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

export async function materializeW4PrintPdfResponse(
  body: W4MaterializePrintPdfInput,
  options: W4WorkerOptions = {},
): Promise<W4MaterializePrintPdfResult & { success: true }> {
  return {
    success: true,
    ...(await materializeW4PrintPdf(body, options)),
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
      await materializeW4PrintPdfResponse(body as W4MaterializePrintPdfInput),
    );
  } catch (error: unknown) {
    console.error('[Internal W4 Materialize Print PDF] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to materialize W4 print PDF',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
