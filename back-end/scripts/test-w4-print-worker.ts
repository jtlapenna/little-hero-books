#!/usr/bin/env tsx

import {
  renderW4PrintDocument,
  runW4PrintQa,
  publishW4PrintManifest,
} from '@/lib/workers/w4-print-worker';
import { renderW4PrintDocumentResponse } from '@/app/api/internal/w4/render-print-document/route';
import { materializeW4PrintPdfResponse } from '@/app/api/internal/w4/materialize-print-pdf/route';
import { runW4PrintQaResponse } from '@/app/api/internal/w4/run-print-qa/route';
import { publishW4PrintManifestResponse } from '@/app/api/internal/w4/publish-print-manifest/route';

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
      jobId: Number(body.jobId ?? 1401),
      attemptId: typeof body.attemptId === 'number' ? body.attemptId : 1402,
      currentStatus: String(body.jobStatus ?? 'polling'),
      __workflowJobEvent: {
        eventType: String(body.eventType ?? 'unknown'),
        recordedAt: '2026-03-27T09:00:00.000Z',
        currentStatus: String(body.jobStatus ?? 'polling'),
      },
    };
  };
}

async function testInteriorRenderRouteWithTransientPollError(): Promise<void> {
  const workflowEvents: JsonRecord[] = [];
  const fetchCalls: Array<{ method: string; url: string; body: string | null }> = [];
  let pollCount = 0;

  const result = await renderW4PrintDocumentResponse(
    {
      documentKind: 'interior-pdf',
      orderId: 'W4-SANDBOX-PROOF-001',
      workflowJobId: 501,
      workflowJobIdempotencyKey: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-001:print:test',
      workflowAttemptId: 601,
      pdfFilename: 'interior_W4-SANDBOX-PROOF-001.pdf',
      pdfR2Key: 'book/orders/W4-SANDBOX-PROOF-001/interior_W4-SANDBOX-PROOF-001.pdf',
      pageImageUrls: [
        'https://admin.littleherolabs.com/api/assets/book/orders/W4-SANDBOX-PROOF-001/preview-images/p00.png',
        'https://admin.littleherolabs.com/api/assets/book/orders/W4-SANDBOX-PROOF-001/preview-images/p01.png',
      ],
    },
    {
      defaultBackendUrl: 'https://admin.littleherolabs.com',
      pdfMonkeyApiKey: 'stub-pdfmonkey-key',
      sleep: async () => undefined,
      recordWorkflowEvent: createWorkflowEventRecorder(workflowEvents),
      signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
      fetchImpl: async (input, init) => {
        const url = resolveUrl(input);
        const method = String(init?.method ?? 'GET').toUpperCase();
        const body = typeof init?.body === 'string' ? init.body : null;
        fetchCalls.push({ method, url, body });

        if (method === 'POST' && url === 'https://api.pdfmonkey.io/api/v1/documents') {
          return jsonResponse({
            data: {
              id: 'pdfmonkey-interior-123',
              status: 'pending',
            },
          });
        }

        if (method === 'GET' && url === 'https://api.pdfmonkey.io/api/v1/documents/pdfmonkey-interior-123') {
          pollCount += 1;
          if (pollCount === 1) {
            throw new Error('temporary transport failure');
          }
          if (pollCount === 2) {
            return jsonResponse({
              data: {
                id: 'pdfmonkey-interior-123',
                status: 'generating',
              },
            });
          }
          return jsonResponse({
            data: {
              id: 'pdfmonkey-interior-123',
              status: 'success',
              download_url: 'https://cdn.example/interior.pdf',
            },
          });
        }

        throw new Error(`Unexpected fetch call: ${method} ${url}`);
      },
    },
  );

  const createPayload = JSON.parse(fetchCalls[0]?.body ?? '{}') as JsonRecord;
  const document = (createPayload.document ?? {}) as JsonRecord;
  const payload = (document.payload ?? {}) as JsonRecord;

  assert(
    result.success === true &&
      result.documentKind === 'interior-pdf' &&
      result.pdfMonkeyDocumentId === 'pdfmonkey-interior-123' &&
      result.pdfDownloadUrl === 'https://cdn.example/interior.pdf',
    'Expected W4 interior render route to return the canonical PDFMonkey tracking and download fields',
  );
  assert(
    typeof payload.pages_html === 'string' &&
      String(payload.pages_html).includes('https://signed.example/little-hero-orders/') &&
      result.pdfMonkeyPollAttempts === 2,
    'Expected W4 interior render route to replace repo asset URLs with signed URLs and recover from one transient poll failure',
  );
  assert(
    workflowEvents.map((event) => event.eventType).join(',') ===
      'provider-submitted,poll-tick,poll-tick,provider-complete',
    'Expected W4 interior render route to emit submit, poll, and completion workflow events',
  );
}

async function testCoverRenderDirectRecovery(): Promise<void> {
  let pollCount = 0;

  const result = await renderW4PrintDocument(
    {
      documentKind: 'cover-pdf',
      orderId: 'W4-SANDBOX-PROOF-002',
      workflowJobId: 502,
      workflowJobIdempotencyKey: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-002:print:test',
      workflowAttemptId: 602,
      coverPreviewUrl: 'https://admin.littleherolabs.com/api/assets/book/orders/W4-SANDBOX-PROOF-002/preview-images/cover-spread.png',
      coverPdfFilename: 'cover_W4-SANDBOX-PROOF-002.pdf',
      coverPdfR2Key: 'book/orders/W4-SANDBOX-PROOF-002/cover_W4-SANDBOX-PROOF-002.pdf',
      runStamp: '2026-03-27T09:03:00.000Z',
    },
    {
      pdfMonkeyApiKey: 'stub-pdfmonkey-key',
      sleep: async () => undefined,
      signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
      fetchImpl: async (input, init) => {
        const url = resolveUrl(input);
        const method = String(init?.method ?? 'GET').toUpperCase();

        if (method === 'POST' && url === 'https://api.pdfmonkey.io/api/v1/documents') {
          return jsonResponse({
            data: {
              id: 'pdfmonkey-cover-123',
              status: 'pending',
            },
          });
        }

        if (method === 'GET' && url === 'https://api.pdfmonkey.io/api/v1/documents/pdfmonkey-cover-123') {
          pollCount += 1;
          if (pollCount === 1) {
            throw new Error('temporary cover poll failure');
          }
          return jsonResponse({
            data: {
              id: 'pdfmonkey-cover-123',
              status: 'success',
              download_url: 'https://cdn.example/cover.pdf',
            },
          });
        }

        throw new Error(`Unexpected fetch call: ${method} ${url}`);
      },
    },
  );

  assert(
    result.coverPdfDownloadUrl === 'https://cdn.example/cover.pdf' &&
      result.pdfMonkeyCoverDocumentId === 'pdfmonkey-cover-123',
    'Expected W4 cover render to recover from a transient poll error and still return the cover artifact fields',
  );
}

async function testMaterializePrintPdfRoute(): Promise<void> {
  const putCalls: Array<{ bucket: string; key: string; contentType?: string; byteLength: number }> = [];
  const result = await materializeW4PrintPdfResponse(
    {
      documentKind: 'interior-pdf',
      orderId: 'W4-SANDBOX-PROOF-003',
      workflowJobId: 503,
      workflowAttemptId: 603,
      workflowJobIdempotencyKey: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-003:print:test',
      pdfDownloadUrl: 'https://cdn.example/interior-materialize.pdf',
      pdfR2Key: 'book/orders/W4-SANDBOX-PROOF-003/interior_W4-SANDBOX-PROOF-003.pdf',
    },
    {
      fetchImpl: async (input) => {
        const url = resolveUrl(input);
        if (url !== 'https://cdn.example/interior-materialize.pdf') {
          throw new Error(`Unexpected materialize download URL: ${url}`);
        }
        return new Response(new Uint8Array([1, 2, 3, 4, 5]), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
          },
        });
      },
      putObjectImpl: async (bucket, key, body, contentType) => {
        const bytes = new Uint8Array(await new Response(body).arrayBuffer());
        putCalls.push({ bucket, key, contentType, byteLength: bytes.byteLength });
        return { ok: true };
      },
      recordWorkflowEvent: createWorkflowEventRecorder([]),
    },
  );

  assert(
    result.success === true &&
      result.r2Key === 'book/orders/W4-SANDBOX-PROOF-003/interior_W4-SANDBOX-PROOF-003.pdf' &&
      result.byteSize === 5 &&
      result.pdfUrl ===
        'https://admin.littleherolabs.com/api/assets/book/orders/W4-SANDBOX-PROOF-003/interior_W4-SANDBOX-PROOF-003.pdf',
    'Expected W4 materialize route to upload the PDF to the canonical asset URL',
  );
  assert(
    putCalls.length === 1 &&
      putCalls[0]?.bucket === 'little-hero-orders' &&
      putCalls[0]?.contentType === 'application/pdf',
    'Expected W4 materialize route to upload the downloaded PDF into the orders bucket',
  );
}

async function testQaPassAndFailPaths(): Promise<void> {
  const passEvents: JsonRecord[] = [];
  const passResult = await runW4PrintQaResponse(
    {
      orderId: 'W4-SANDBOX-PROOF-004',
      workflowJobId: 504,
      workflowAttemptId: 604,
      workflowJobIdempotencyKey: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-004:print:test',
      CONFIG: {
        renderer: {
          apiBase: 'https://renderer.example',
          internalToken: 'renderer-token',
        },
      },
      expectedPageCount: 2,
      pageLabels: ['p00', 'p01'],
      pageImageUrls: [
        'book/orders/W4-SANDBOX-PROOF-004/preview-images/p00.png',
        'book/orders/W4-SANDBOX-PROOF-004/preview-images/p01.png',
      ],
      coverPreviewUrl: 'book/orders/W4-SANDBOX-PROOF-004/preview-images/cover-spread.png',
      pdfR2Key: 'book/orders/W4-SANDBOX-PROOF-004/interior.pdf',
      coverPdfR2Key: 'book/orders/W4-SANDBOX-PROOF-004/cover.pdf',
    },
    {
      signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
      recordWorkflowEvent: createWorkflowEventRecorder(passEvents),
      fetchImpl: async (input, init) => {
        const url = resolveUrl(input);
        const method = String(init?.method ?? 'GET').toUpperCase();
        if (method !== 'POST' || url !== 'https://renderer.example/qa-pdf') {
          throw new Error(`Unexpected QA call: ${method} ${url}`);
        }
        const parsed = JSON.parse(String(init?.body ?? '{}')) as JsonRecord;
        return jsonResponse({
          passed: true,
          failedPages: [],
          warnings: [],
          reasonCode: `${String(parsed.type)}-ok`,
        });
      },
    },
  );

  assert(
    passResult.success === true &&
      passResult.qaPassed === true &&
      passResult.qaFailedPages.length === 0 &&
      passResult.interiorSignedUrl.includes('https://signed.example/little-hero-orders/'),
    'Expected W4 QA route to sign both PDFs and succeed when the renderer approves interior and cover',
  );
  assert(
    passEvents.map((event) => event.eventType).join(',') === 'qa-passed',
    'Expected W4 QA pass path to emit a qa-passed workflow event',
  );

  const failEvents: JsonRecord[] = [];
  const failResult = await runW4PrintQa(
    {
      orderId: 'W4-SANDBOX-PROOF-005',
      workflowJobId: 505,
      workflowAttemptId: 605,
      workflowJobIdempotencyKey: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-005:print:test',
      CONFIG: {
        renderer: {
          apiBase: 'https://renderer.example',
          internalToken: 'renderer-token',
        },
      },
      expectedPageCount: 1,
      pageLabels: ['p00'],
      pageImageUrls: ['book/orders/W4-SANDBOX-PROOF-005/preview-images/p00.png'],
      coverPreviewUrl: 'book/orders/W4-SANDBOX-PROOF-005/preview-images/cover-spread.png',
      pdfR2Key: 'book/orders/W4-SANDBOX-PROOF-005/interior.pdf',
      coverPdfR2Key: 'book/orders/W4-SANDBOX-PROOF-005/cover.pdf',
    },
    {
      signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
      recordWorkflowEvent: createWorkflowEventRecorder(failEvents),
      fetchImpl: async (input, init) => {
        const url = resolveUrl(input);
        if (url !== 'https://renderer.example/qa-pdf') {
          throw new Error(`Unexpected QA failure call: ${url}`);
        }
        const parsed = JSON.parse(String(init?.body ?? '{}')) as JsonRecord;
        return jsonResponse(
          String(parsed.type) === 'interior'
            ? {
                passed: false,
                failedPages: [{ pageLabel: 'p00', reason: 'trim' }],
                warnings: [],
                reasonCode: 'trim',
              }
            : {
                passed: true,
                failedPages: [],
                warnings: [],
                reasonCode: 'ok',
              },
        );
      },
    },
  );

  assert(
    failResult.qaPassed === false &&
      failResult.qaFailedPages.length === 1,
    'Expected W4 QA worker to preserve failed-page details when renderer QA rejects the interior PDF',
  );
  assert(
    failEvents.map((event) => event.eventType).join(',') === 'qa-failed',
    'Expected W4 QA failure path to emit a terminal qa-failed workflow event',
  );
}

async function testQaRouteFallsBackToEnvRendererToken(): Promise<void> {
  const previousRendererToken = process.env.RENDERER_INTERNAL_TOKEN;
  const previousRendererApiBase = process.env.RENDERER_API_BASE;
  process.env.RENDERER_INTERNAL_TOKEN = 'env-renderer-token';
  delete process.env.RENDERER_API_BASE;

  try {
    const result = await runW4PrintQaResponse(
      {
        orderId: 'W4-SANDBOX-PROOF-004B',
        workflowJobId: 5041,
        workflowAttemptId: 6041,
        workflowJobIdempotencyKey: 'wf:4.1:w4-sibling-aggregation:W4-SANDBOX-PROOF-004B:print:test',
        CONFIG: {
          renderer: {
            apiBase: 'https://renderer.example',
          },
        },
        expectedPageCount: 1,
        pageLabels: ['p00'],
        pageImageUrls: ['book/orders/W4-SANDBOX-PROOF-004B/preview-images/p00.png'],
        coverPreviewUrl: 'book/orders/W4-SANDBOX-PROOF-004B/preview-images/cover-spread.png',
        pdfR2Key: 'book/orders/W4-SANDBOX-PROOF-004B/interior.pdf',
        coverPdfR2Key: 'book/orders/W4-SANDBOX-PROOF-004B/cover.pdf',
      },
      {
        signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
        recordWorkflowEvent: createWorkflowEventRecorder([]),
        fetchImpl: async (input, init) => {
          const url = resolveUrl(input);
          const method = String(init?.method ?? 'GET').toUpperCase();
          const authHeader = String(
            (init?.headers as Record<string, string> | undefined)?.Authorization ?? '',
          );
          if (method !== 'POST' || url !== 'https://renderer.example/qa-pdf') {
            throw new Error(`Unexpected QA env fallback call: ${method} ${url}`);
          }
          assert(
            authHeader === 'Bearer env-renderer-token',
            'Expected W4 QA route to fall back to RENDERER_INTERNAL_TOKEN when the payload omits renderer.internalToken',
          );
          return jsonResponse({
            passed: true,
            failedPages: [],
            warnings: [],
            reasonCode: 'env-fallback-ok',
          });
        },
      },
    );

    assert(
      result.success === true && result.qaPassed === true,
      'Expected W4 QA route env fallback path to complete successfully',
    );
  } finally {
    if (previousRendererToken === undefined) {
      delete process.env.RENDERER_INTERNAL_TOKEN;
    } else {
      process.env.RENDERER_INTERNAL_TOKEN = previousRendererToken;
    }

    if (previousRendererApiBase === undefined) {
      delete process.env.RENDERER_API_BASE;
    } else {
      process.env.RENDERER_API_BASE = previousRendererApiBase;
    }
  }
}

async function testQaProbePayloadRejection(): Promise<void> {
  try {
    await runW4PrintQa(
      {
        orderId: 'W4-SANDBOX-PROOF-006',
        workflowJobId: 506,
        workflowAttemptId: 606,
        workflowJobIdempotencyKey: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-006:print:test',
        CONFIG: {
          renderer: {
            apiBase: 'https://renderer.example',
            internalToken: 'renderer-token',
          },
        },
        expectedPageCount: 1,
        pageLabels: ['p00'],
        pageImageUrls: ['book/orders/W4-SANDBOX-PROOF-006/preview-images/p00.png'],
        coverPreviewUrl: 'book/orders/W4-SANDBOX-PROOF-006/preview-images/cover-spread.png',
        pdfR2Key: 'book/orders/W4-SANDBOX-PROOF-006/interior.pdf',
        coverPdfR2Key: 'book/orders/W4-SANDBOX-PROOF-006/cover.pdf',
      },
      {
        signObjectUrl: async (key, bucket) => `https://signed.example/${bucket}/${key}`,
        recordWorkflowEvent: createWorkflowEventRecorder([]),
        fetchImpl: async () =>
          jsonResponse({
            renderedPages: [{ pageNumber: 1 }],
            pageCount: 1,
          }),
      },
    );
    throw new Error('Expected W4 QA probe payload to throw');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(
      message.includes('probe payload instead of QA payload'),
      'Expected W4 QA worker to reject renderer probe payloads instead of treating them as QA success',
    );
  }
}

async function testManifestPublishSuccessAndError(): Promise<void> {
  const successEvents: JsonRecord[] = [];
  let successUpload: { bucket: string; key: string; body: string; contentType?: string } | null = null;
  let successPatch: { orderId: string; updates: JsonRecord } | null = null;

  const successResult = await publishW4PrintManifestResponse(
    {
      orderId: 'W4-SANDBOX-PROOF-007',
      workflowJobId: 507,
      workflowAttemptId: 607,
      workflowJobIdempotencyKey: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-007:print:test',
      orderPrefix: 'book/orders/W4-SANDBOX-PROOF-007',
      pdfR2Key: 'book/orders/W4-SANDBOX-PROOF-007/interior.pdf',
      coverPdfR2Key: 'book/orders/W4-SANDBOX-PROOF-007/cover.pdf',
      submitMode: 'sandbox',
      luluJobId: 'sandbox-job-007',
      luluStatus: 'CREATED',
      supabasePatch: {
        status: 'pending_print',
      },
    },
    {
      recordWorkflowEvent: createWorkflowEventRecorder(successEvents),
      putObjectImpl: async (bucket, key, body, contentType) => {
        successUpload = { bucket, key, body: String(body), contentType };
        return { ok: true };
      },
      updateOrderImpl: async (orderId, updates) => {
        successPatch = { orderId, updates };
        return { id: 77 };
      },
    },
  );

  assert(
    successResult.success === true &&
      successResult.manifestStatus === 'submitted' &&
      successResult.manifestUrl.endsWith('/api/manifests/book/orders/W4-SANDBOX-PROOF-007/manifests/4-manifest.json'),
    'Expected W4 manifest publish route to persist the canonical success manifest URL',
  );
  assert(
    successUpload?.bucket === 'little-hero-orders' &&
      successUpload.key === 'book/orders/W4-SANDBOX-PROOF-007/manifests/4-manifest.json' &&
      successPatch?.orderId === 'W4-SANDBOX-PROOF-007',
    'Expected W4 manifest publish route to upload the manifest and apply the requested order patch',
  );
  assert(
    successEvents.map((event) => event.eventType).join(',') === 'manifest-published',
    'Expected W4 success manifest publish to emit a manifest-published workflow event',
  );

  const errorEvents: JsonRecord[] = [];
  const errorResult = await publishW4PrintManifest(
    {
      orderId: 'W4-SANDBOX-PROOF-008',
      workflowJobId: 508,
      workflowAttemptId: 608,
      workflowJobIdempotencyKey: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-008:print:test',
      orderPrefix: 'book/orders/W4-SANDBOX-PROOF-008',
      manifestStatus: 'error',
      _errorManifest: {
        status: 'error',
        errorType: 'qa_failed',
        errorMessage: 'Trim issue',
      },
    },
    {
      recordWorkflowEvent: createWorkflowEventRecorder(errorEvents),
      putObjectImpl: async () => ({ ok: true }),
      updateOrderImpl: async () => ({ id: 88 }),
    },
  );

  assert(
    errorResult.manifestStatus === 'error' &&
      errorResult.manifestKey === 'book/orders/W4-SANDBOX-PROOF-008/manifests/4-qa-fail-manifest.json',
    'Expected W4 error manifest publish to use the canonical QA failure manifest key',
  );
  assert(
    errorEvents.map((event) => event.eventType).join(',') === 'error-manifest-published',
    'Expected W4 error manifest publish to emit a terminal error-manifest-published workflow event',
  );
}

async function main(): Promise<void> {
  await testInteriorRenderRouteWithTransientPollError();
  await testCoverRenderDirectRecovery();
  await testMaterializePrintPdfRoute();
  await testQaPassAndFailPaths();
  await testQaRouteFallsBackToEnvRendererToken();
  await testQaProbePayloadRejection();
  await testManifestPublishSuccessAndError();
  console.log('W4 print worker tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
