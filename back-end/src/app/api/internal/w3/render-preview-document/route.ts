import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { recordWorkflowJobEventResponse } from '@/app/api/internal/workflow-jobs/log-event/route';
import {
  renderW3PreviewDocument,
  type W3RenderPreviewDocumentInput,
  type W3RenderPreviewDocumentOptions,
} from '@/lib/w3-pdfmonkey-preview';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

const PayloadSchema = z.object({
  documentKind: z.enum(['page-preview', 'cover-preview']),
  orderId: z.string().trim().min(1).optional(),
  amazonOrderId: z.string().trim().min(1).nullable().optional(),
  rootOrderId: z.string().trim().min(1).nullable().optional(),
  backendUrl: z.string().trim().min(1).nullable().optional(),
  workflowJobId: z.number().int().positive().nullable().optional(),
  workflowJobIdempotencyKey: z.string().trim().min(1).nullable().optional(),
  workflowAttemptId: z.number().int().positive().nullable().optional(),
  pageNumber: z.coerce.number().int().min(0).nullable().optional(),
  pageHtml: z.string().optional(),
  page_css: z.string().optional(),
  pageImageFilename: z.string().trim().min(1).nullable().optional(),
  pageImageR2Key: z.string().trim().min(1).nullable().optional(),
  coverHTML: z.string().optional(),
  cover_html: z.string().optional(),
  coverPngFilename: z.string().trim().min(1).nullable().optional(),
  coverPngR2Key: z.string().trim().min(1).nullable().optional(),
  coverImageR2Key: z.string().trim().min(1).nullable().optional(),
  orderR2BaseKey: z.string().trim().min(1).nullable().optional(),
  bookId: z.string().trim().min(1).nullable().optional(),
  useImgBackgrounds: z.boolean().nullable().optional(),
  pdfMonkeyTemplateId: z.string().trim().min(1).nullable().optional(),
  pdfMonkeyImageTemplateId: z.string().trim().min(1).nullable().optional(),
  pdfMonkeyCoverTemplateId: z.string().trim().min(1).nullable().optional(),
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

export async function renderW3PreviewDocumentResponse(
  body: JsonRecord,
  options: W3RenderPreviewDocumentOptions = {},
) {
  const parsed = PayloadSchema.parse(body);

  return await renderW3PreviewDocument(parsed as W3RenderPreviewDocumentInput, {
    ...options,
    recordWorkflowEvent: options.recordWorkflowEvent ?? recordWorkflowJobEventResponse,
  });
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
    const response = await renderW3PreviewDocumentResponse(body, {
      defaultBackendUrl: request.nextUrl.origin,
    });
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('[Internal W3 Render Preview Document] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to render W3 preview document',
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
