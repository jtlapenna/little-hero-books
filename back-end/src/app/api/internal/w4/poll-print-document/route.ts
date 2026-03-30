import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { recordWorkflowJobEventResponse } from '@/app/api/internal/workflow-jobs/log-event/route';
import {
  pollW4PrintDocument,
  type W4RenderPrintDocumentInput,
  type W4PollPrintDocumentResult,
  type W4WorkerOptions,
} from '@/lib/workers/w4-print-worker';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

const PayloadSchema = z.object({
  documentKind: z.enum(['interior-pdf', 'cover-pdf']),
  orderId: z.string().trim().min(1).optional(),
  amazonOrderId: z.string().trim().min(1).nullable().optional(),
  rootOrderId: z.string().trim().min(1).nullable().optional(),
  backendUrl: z.string().trim().min(1).nullable().optional(),
  workflowJobId: z.number().int().positive().nullable().optional(),
  workflowJobIdempotencyKey: z.string().trim().min(1).nullable().optional(),
  workflowAttemptId: z.number().int().positive().nullable().optional(),
  pdfMonkeyDocumentId: z.string().trim().min(1).nullable().optional(),
  pdfMonkeyCoverDocumentId: z.string().trim().min(1).nullable().optional(),
  pdfMonkeyStatusUrl: z.string().trim().min(1).nullable().optional(),
  pdfMonkeyStatus: z.string().trim().min(1).nullable().optional(),
  pdfMonkeyPollAttempts: z.number().int().nonnegative().nullable().optional(),
  maxPollAttempts: z.number().int().positive().nullable().optional(),
  pollIntervalMs: z.number().int().positive().nullable().optional(),
  allowIncomplete: z.boolean().nullable().optional(),
}).passthrough();

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

export async function pollW4PrintDocumentResponse(
  body: JsonRecord,
  options: W4WorkerOptions = {},
): Promise<W4PollPrintDocumentResult & { success: true }> {
  const parsed = PayloadSchema.parse(body);

  return {
    success: true,
    ...(await pollW4PrintDocument(parsed as W4RenderPrintDocumentInput, {
      ...options,
      recordWorkflowEvent: options.recordWorkflowEvent ?? recordWorkflowJobEventResponse,
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
      await pollW4PrintDocumentResponse(body, {
        defaultBackendUrl: request.nextUrl.origin,
      }),
    );
  } catch (error: unknown) {
    console.error('[Internal W4 Poll Print Document] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to poll W4 print document',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
