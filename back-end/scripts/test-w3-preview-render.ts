#!/usr/bin/env tsx

import {
  renderW3PreviewDocument,
  type W3RenderPreviewDocumentOptions,
} from '@/lib/w3-pdfmonkey-preview';
import { renderW3PreviewDocumentResponse } from '@/app/api/internal/w3/render-preview-document/route';

type JsonRecord = Record<string, unknown>;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function jsonResponse(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function createWorkflowEventRecorder(events: JsonRecord[]) {
  return async (body: JsonRecord): Promise<JsonRecord> => {
    events.push(body);
    return {
      success: true,
      jobId: Number(body.jobId ?? 901),
      attemptId: typeof body.attemptId === 'number' ? body.attemptId : 91,
      currentStatus: String(body.jobStatus ?? 'polling'),
      __workflowJobEvent: {
        eventType: String(body.eventType ?? 'unknown'),
        recordedAt: '2026-03-26T20:00:00.000Z',
        currentStatus: String(body.jobStatus ?? 'polling'),
      },
    };
  };
}

async function testPagePreviewRouteSuccess(): Promise<void> {
  const fetchCalls: Array<{
    url: string;
    method: string;
    body: string | null;
  }> = [];
  const workflowEvents: JsonRecord[] = [];

  const options: W3RenderPreviewDocumentOptions = {
    defaultBackendUrl: 'https://preview-admin.example',
    pdfMonkeyApiKey: 'stub-pdfmonkey-key',
    sleep: async () => undefined,
    recordWorkflowEvent: createWorkflowEventRecorder(workflowEvents),
    fetchImpl: async (input, init) => {
      const url = resolveUrl(input);
      const method = String(init?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? init.body : null;
      fetchCalls.push({ url, method, body });

      if (method === 'POST' && url === 'https://api.pdfmonkey.io/api/v1/documents') {
        return jsonResponse({
          data: {
            id: 'pdf-page-123',
            status: 'pending',
          },
        });
      }

      if (method === 'GET' && url === 'https://api.pdfmonkey.io/api/v1/documents/pdf-page-123') {
        const pollCount = fetchCalls.filter(
          (call) => call.method === 'GET' && call.url === url,
        ).length;

        if (pollCount === 1) {
          return jsonResponse({
            data: {
              id: 'pdf-page-123',
              status: 'generating',
            },
          });
        }

        return jsonResponse({
          data: {
            id: 'pdf-page-123',
            status: 'success',
            download_url: 'https://cdn.example.test/previews/p03.png',
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    },
  };

  const result = await renderW3PreviewDocumentResponse(
    {
      documentKind: 'page-preview',
      orderId: 'W3-PREVIEW-ORDER-001',
      amazonOrderId: 'W3-PREVIEW-ORDER-001',
      rootOrderId: 'W3-PREVIEW-ORDER-ROOT-001',
      workflowJobId: 321,
      workflowJobIdempotencyKey: 'wf:3:w3-assembly:W3-PREVIEW-ORDER-001:default:test',
      workflowAttemptId: 654,
      pageNumber: '3',
      pageHtml: '<div class="book-page" id="page-03">Preview content</div>',
      page_css: '.book-page { color: black; }',
      pageImageFilename: 'p03.png',
      pageImageR2Key:
        'book-mvp-simple-adventure/orders/W3-PREVIEW-ORDER-001/preview-images/p03.png',
      orderR2BaseKey: 'book-mvp-simple-adventure/orders/W3-PREVIEW-ORDER-001',
      bookId: 'book-mvp-simple-adventure',
      useImgBackgrounds: true,
      pdfMonkeyImageTemplateId: 'template-page-preview',
    },
    options,
  );

  assert(
    result.documentKind === 'page-preview' &&
      result.orderId === 'W3-PREVIEW-ORDER-001' &&
      result.backendUrl === 'https://preview-admin.example',
    'Expected page-preview route response to preserve canonical order identity and backend URL',
  );
  assert(
    result.pageNumber === 3 &&
      result.pageImageDownloadUrl === 'https://cdn.example.test/previews/p03.png' &&
      result.pageImageR2Key ===
        'book-mvp-simple-adventure/orders/W3-PREVIEW-ORDER-001/preview-images/p03.png',
    'Expected page-preview route response to expose the rendered page artifact details',
  );
  assert(
    result.pdfMonkeyImageDocumentId === 'pdf-page-123' &&
      result.pdfMonkeyImageStatusUrl ===
        'https://api.pdfmonkey.io/api/v1/documents/pdf-page-123' &&
      result.pdfMonkeyPollAttempts === 2,
    'Expected page-preview route response to preserve PDFMonkey tracking identifiers and poll count',
  );
  assert(
    result.workflowLogEvent.submitted?.__workflowJobEvent.eventType === 'provider-submitted' &&
      result.workflowLogEvent.polled?.__workflowJobEvent.eventType === 'poll-tick',
    'Expected page-preview route response to preserve workflow-job submit and poll event details',
  );

  const createCall = fetchCalls[0];
  assert(
    createCall?.method === 'POST' &&
      createCall.url === 'https://api.pdfmonkey.io/api/v1/documents' &&
      typeof createCall.body === 'string',
    'Expected page-preview route to create a PDFMonkey document first',
  );
  const createBody = JSON.parse(createCall.body ?? '{}') as JsonRecord;
  const createDocument = (createBody.document ?? {}) as JsonRecord;
  const createPayload = (createDocument.payload ?? {}) as JsonRecord;
  const createMeta = (createDocument.meta ?? {}) as JsonRecord;

  assert(
    createDocument.document_template_id === 'template-page-preview' &&
      createPayload.page_number === 3 &&
      createPayload.pages_html ===
        '<div class="book-page" id="page-03">Preview content</div>' &&
      createMeta.pageImageR2Key ===
        'book-mvp-simple-adventure/orders/W3-PREVIEW-ORDER-001/preview-images/p03.png',
    'Expected page-preview route to submit the repo-owned PDFMonkey payload shape',
  );
  assert(
    workflowEvents.map((event) => event.eventType).join(',') ===
      'provider-submitted,poll-tick,poll-tick',
    'Expected page-preview route to emit submit plus poll events through workflow-jobs logging',
  );
}

async function testCoverPreviewFailureLogging(): Promise<void> {
  const workflowEvents: JsonRecord[] = [];

  try {
    await renderW3PreviewDocument(
      {
        documentKind: 'cover-preview',
        orderId: 'W3-PREVIEW-ORDER-002',
        amazonOrderId: 'W3-PREVIEW-ORDER-002',
        rootOrderId: 'W3-PREVIEW-ORDER-ROOT-002',
        workflowJobId: 322,
        workflowJobIdempotencyKey: 'wf:3:w3-assembly:W3-PREVIEW-ORDER-002:default:test',
        workflowAttemptId: 655,
        coverHTML: '<section>Cover spread</section>',
        coverPngFilename: 'cover-spread.png',
        coverPngR2Key:
          'book-mvp-simple-adventure/orders/W3-PREVIEW-ORDER-002/preview-images/cover-spread.png',
        orderR2BaseKey: 'book-mvp-simple-adventure/orders/W3-PREVIEW-ORDER-002',
        bookId: 'book-mvp-simple-adventure',
        pdfMonkeyCoverTemplateId: 'template-cover-preview',
      },
      {
        defaultBackendUrl: 'https://preview-admin.example',
        pdfMonkeyApiKey: 'stub-pdfmonkey-key',
        sleep: async () => undefined,
        recordWorkflowEvent: createWorkflowEventRecorder(workflowEvents),
        fetchImpl: async (input, init) => {
          const url = resolveUrl(input);
          const method = String(init?.method ?? 'GET').toUpperCase();

          if (method === 'POST' && url === 'https://api.pdfmonkey.io/api/v1/documents') {
            return jsonResponse({
              data: {
                id: 'pdf-cover-456',
                status: 'pending',
              },
            });
          }

          if (
            method === 'GET' &&
            url === 'https://api.pdfmonkey.io/api/v1/documents/pdf-cover-456'
          ) {
            return jsonResponse({
              data: {
                id: 'pdf-cover-456',
                status: 'error',
              },
            });
          }

          throw new Error(`Unexpected fetch call: ${method} ${url}`);
        },
      },
    );

    throw new Error('Expected cover-preview render to throw when PDFMonkey returns error status');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(
      message.includes('PDFMonkey cover-preview polling failed (status=error)'),
      'Expected cover-preview render to surface the provider polling failure',
    );
  }

  assert(
    workflowEvents.map((event) => event.eventType).join(',') ===
      'provider-submitted,poll-tick,provider-failed',
    'Expected cover-preview failure path to log submitted, poll, and failed workflow-job events',
  );
  const failedEvent = workflowEvents[2] ?? {};
  const failedLastError = (failedEvent.lastError ?? {}) as JsonRecord;
  assert(
    failedEvent.jobStatus === 'failed' &&
      failedEvent.attemptStatus === 'failed' &&
      failedLastError.pdfMonkeyStatus === 'error' &&
      failedLastError.documentKind === 'cover-preview',
    'Expected cover-preview failure logging to mark the workflow job failed with provider status context',
  );
}

async function main(): Promise<void> {
  await testPagePreviewRouteSuccess();
  await testCoverPreviewFailureLogging();
  console.log('W3 preview render tests passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
