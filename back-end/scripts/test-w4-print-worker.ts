#!/usr/bin/env tsx

import {
  renderW4PrintDocument,
  runW4PrintQa,
  publishW4PrintManifest,
} from '@/lib/workers/w4-print-worker';
import { renderW4PrintDocumentResponse } from '@/app/api/internal/w4/render-print-document/route';
import { pollW4PrintDocumentResponse } from '@/app/api/internal/w4/poll-print-document/route';
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

async function testInteriorRenderCanReturnIncompleteForFollowupPoll(): Promise<void> {
  const workflowEvents: JsonRecord[] = [];
  let pollCount = 0;

  const result = await renderW4PrintDocumentResponse(
    {
      documentKind: 'interior-pdf',
      orderId: 'W4-SANDBOX-PROOF-002B',
      workflowJobId: 5021,
      workflowJobIdempotencyKey: 'wf:4.1:w4-sibling-aggregation:W4-SANDBOX-PROOF-002B:print:test',
      workflowAttemptId: 6021,
      pdfFilename: 'interior_W4-SANDBOX-PROOF-002B.pdf',
      pdfR2Key: 'book/orders/W4-SANDBOX-PROOF-002B/interior_W4-SANDBOX-PROOF-002B.pdf',
      pageImageUrls: [
        'https://admin.littleherolabs.com/api/assets/book/orders/W4-SANDBOX-PROOF-002B/preview-images/p00.png',
      ],
      allowIncomplete: true,
      maxPollAttempts: 1,
      pollIntervalMs: 1,
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

        if (method === 'POST' && url === 'https://api.pdfmonkey.io/api/v1/documents') {
          return jsonResponse({
            data: {
              id: 'pdfmonkey-incomplete-123',
              status: 'pending',
            },
          });
        }

        if (method === 'GET' && url === 'https://api.pdfmonkey.io/api/v1/documents/pdfmonkey-incomplete-123') {
          pollCount += 1;
          return jsonResponse({
            data: {
              id: 'pdfmonkey-incomplete-123',
              status: 'generating',
            },
          });
        }

        throw new Error(`Unexpected fetch call: ${method} ${url}`);
      },
    },
  );

  assert(
    result.success === true &&
      result.pdfMonkeyStatus === 'generating' &&
      result.pdfMonkeyDocumentId === 'pdfmonkey-incomplete-123' &&
      !result.pdfDownloadUrl,
    'Expected W4 render route to return an incomplete-but-trackable PDFMonkey document when allowIncomplete is enabled',
  );
  assert(
    pollCount === 1 &&
      workflowEvents.map((event) => event.eventType).join(',') ===
        'provider-submitted,poll-tick',
    'Expected allowIncomplete render path to emit submit and poll events without forcing a terminal failure',
  );
}

async function testPollPrintDocumentRouteContinuesExistingDocument(): Promise<void> {
  const workflowEvents: JsonRecord[] = [];
  let pollCount = 0;

  const result = await pollW4PrintDocumentResponse(
    {
      documentKind: 'interior-pdf',
      orderId: 'W4-SANDBOX-PROOF-002B',
      workflowJobId: 5022,
      workflowJobIdempotencyKey: 'wf:4.1:w4-sibling-aggregation:W4-SANDBOX-PROOF-002B:print:test',
      workflowAttemptId: 6022,
      pdfMonkeyDocumentId: 'pdfmonkey-incomplete-123',
      pdfMonkeyStatusUrl: 'https://api.pdfmonkey.io/api/v1/documents/pdfmonkey-incomplete-123',
      pdfMonkeyStatus: 'generating',
      pdfMonkeyPollAttempts: 1,
      pdfR2Key: 'book/orders/W4-SANDBOX-PROOF-002B/interior_W4-SANDBOX-PROOF-002B.pdf',
      maxPollAttempts: 3,
      pollIntervalMs: 1,
    },
    {
      defaultBackendUrl: 'https://admin.littleherolabs.com',
      pdfMonkeyApiKey: 'stub-pdfmonkey-key',
      sleep: async () => undefined,
      recordWorkflowEvent: createWorkflowEventRecorder(workflowEvents),
      fetchImpl: async (input, init) => {
        const url = resolveUrl(input);
        const method = String(init?.method ?? 'GET').toUpperCase();
        if (method !== 'GET' || url !== 'https://api.pdfmonkey.io/api/v1/documents/pdfmonkey-incomplete-123') {
          throw new Error(`Unexpected poll call: ${method} ${url}`);
        }
        pollCount += 1;
        return jsonResponse({
          data: {
            id: 'pdfmonkey-incomplete-123',
            status: pollCount === 1 ? 'generating' : 'success',
            download_url: pollCount === 1 ? null : 'https://cdn.example/interior-followup.pdf',
          },
        });
      },
    },
  );

  assert(
    result.success === true &&
      result.pdfMonkeyStatus === 'success' &&
      result.pdfDownloadUrl === 'https://cdn.example/interior-followup.pdf',
    'Expected W4 poll route to continue polling an existing PDFMonkey document until it becomes downloadable',
  );
  assert(
    workflowEvents.map((event) => event.eventType).join(',') ===
      'poll-tick,poll-tick,provider-complete',
    'Expected W4 poll route to emit poll and completion workflow events for a resumed PDFMonkey document',
  );
}

async function testMaterializePrintPdfRoute(): Promise<void> {
  const putCalls: Array<{
    bucket: string;
    key: string;
    contentType?: string;
    byteLength: number;
    streamed: boolean;
  }> = [];
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
      headObjectImpl: async () => new Response(null, { status: 404 }),
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
        const streamed = typeof ReadableStream !== 'undefined' && body instanceof ReadableStream;
        const bytes = new Uint8Array(await new Response(body).arrayBuffer());
        putCalls.push({ bucket, key, contentType, byteLength: bytes.byteLength, streamed });
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
      putCalls[0]?.contentType === 'application/pdf' &&
      putCalls[0]?.streamed === true,
    'Expected W4 materialize route to stream the downloaded PDF into the orders bucket',
  );
  assert(
    result.downloadAttempts === 1,
    'Expected W4 materialize route to report a single download attempt when the source PDF is immediately available',
  );
}

async function testMaterializePrintPdfRouteRetriesTransientDownload503(): Promise<void> {
  const workflowEvents: JsonRecord[] = [];
  const statuses: number[] = [];

  const result = await materializeW4PrintPdfResponse(
    {
      documentKind: 'interior-pdf',
      orderId: 'W4-SANDBOX-PROOF-003A',
      workflowJobId: 5030,
      workflowAttemptId: 6030,
      workflowJobIdempotencyKey: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-003A:print:test',
      pdfDownloadUrl: 'https://cdn.example/interior-materialize-retry.pdf',
      pdfR2Key: 'book/orders/W4-SANDBOX-PROOF-003A/interior_W4-SANDBOX-PROOF-003A.pdf',
    },
    {
      headObjectImpl: async () => new Response(null, { status: 404 }),
      sleep: async () => undefined,
      fetchImpl: async (input) => {
        const url = resolveUrl(input);
        if (url !== 'https://cdn.example/interior-materialize-retry.pdf') {
          throw new Error(`Unexpected materialize retry URL: ${url}`);
        }
        if (statuses.length === 0) {
          statuses.push(503);
          return new Response('temporary unavailable', { status: 503 });
        }
        statuses.push(200);
        return new Response(new Uint8Array([7, 8, 9]), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
          },
        });
      },
      putObjectImpl: async (_bucket, _key, body) => {
        await new Response(body).arrayBuffer();
        return { ok: true };
      },
      recordWorkflowEvent: createWorkflowEventRecorder(workflowEvents),
      materializeDownloadAttempts: 3,
      materializeDownloadRetryDelayMs: 1,
    },
  );

  assert(
    statuses.join(',') === '503,200' &&
      result.success === true &&
      result.byteSize === 3 &&
      result.downloadAttempts === 2,
    'Expected W4 materialize route to retry one transient 503 from the PDF source and succeed on the follow-up attempt',
  );
  assert(
    workflowEvents.length === 1 &&
      workflowEvents[0]?.eventType === 'artifact-materialized' &&
      (workflowEvents[0]?.payload as JsonRecord | undefined)?.downloadAttempts === 2,
    'Expected W4 materialize route to record the final download attempt count in the artifact-materialized event',
  );
}

async function testMaterializePrintPdfRouteRefreshesPdfMonkeyDownloadUrlAfterWarmup503s(): Promise<void> {
  const workflowEvents: JsonRecord[] = [];
  const downloadTargets: string[] = [];
  let statusRefreshCount = 0;

  const result = await materializeW4PrintPdfResponse(
    {
      documentKind: 'interior-pdf',
      orderId: 'W4-SANDBOX-PROOF-003A2',
      workflowJobId: 50301,
      workflowAttemptId: 60301,
      workflowJobIdempotencyKey: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-003A2:print:test',
      pdfDownloadUrl: 'https://cdn.example/interior-materialize-warming.pdf',
      pdfMonkeyDocumentId: 'pdfmonkey-materialize-123',
      pdfMonkeyStatusUrl: 'https://api.pdfmonkey.io/api/v1/documents/pdfmonkey-materialize-123',
      pdfR2Key: 'book/orders/W4-SANDBOX-PROOF-003A2/interior_W4-SANDBOX-PROOF-003A2.pdf',
      CONFIG: {
        pdfMonkey: {
          token: 'stub-pdfmonkey-key',
        },
      },
    },
    {
      headObjectImpl: async () => new Response(null, { status: 404 }),
      sleep: async () => undefined,
      fetchImpl: async (input) => {
        const url = resolveUrl(input);

        if (url === 'https://cdn.example/interior-materialize-warming.pdf') {
          downloadTargets.push(url);
          return new Response('temporary unavailable', { status: 503 });
        }

        if (url === 'https://cdn.example/interior-materialize-stable.pdf') {
          downloadTargets.push(url);
          return new Response(new Uint8Array([4, 5, 6, 7]), {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
            },
          });
        }

        if (url === 'https://api.pdfmonkey.io/api/v1/documents/pdfmonkey-materialize-123') {
          statusRefreshCount += 1;
          return jsonResponse({
            data: {
              id: 'pdfmonkey-materialize-123',
              status: 'success',
              download_url:
                statusRefreshCount >= 2
                  ? 'https://cdn.example/interior-materialize-stable.pdf'
                  : 'https://cdn.example/interior-materialize-warming.pdf',
            },
          });
        }

        throw new Error(`Unexpected materialize warmup URL: ${url}`);
      },
      putObjectImpl: async (_bucket, _key, body) => {
        await new Response(body).arrayBuffer();
        return { ok: true };
      },
      recordWorkflowEvent: createWorkflowEventRecorder(workflowEvents),
      materializeDownloadAttempts: 4,
      materializeDownloadRetryDelayMs: 1,
    },
  );

  assert(
    downloadTargets.join(',') ===
      'https://cdn.example/interior-materialize-warming.pdf,https://cdn.example/interior-materialize-warming.pdf,https://cdn.example/interior-materialize-stable.pdf' &&
      statusRefreshCount === 2 &&
      result.success === true &&
      result.byteSize === 4 &&
      result.downloadAttempts === 3,
    'Expected W4 materialize route to refresh the PDFMonkey document state after repeated warm-up 503s and switch to a stabilized download URL',
  );
  assert(
    workflowEvents.length === 1 &&
      workflowEvents[0]?.eventType === 'artifact-materialized' &&
      (workflowEvents[0]?.payload as JsonRecord | undefined)?.downloadAttempts === 3,
    'Expected W4 materialize route to preserve the final stabilized download attempt count after PDFMonkey state refreshes',
  );
}

async function testMaterializePrintPdfRouteReusesExistingObject(): Promise<void> {
  let fetchCalled = false;
  let putCalled = false;
  const workflowEvents: JsonRecord[] = [];

  const result = await materializeW4PrintPdfResponse(
    {
      documentKind: 'interior-pdf',
      orderId: 'W4-SANDBOX-PROOF-003B',
      workflowJobId: 5031,
      workflowAttemptId: 6031,
      workflowJobIdempotencyKey: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-003B:print:test',
      pdfDownloadUrl: 'https://cdn.example/interior-materialize.pdf',
      pdfR2Key: 'book/orders/W4-SANDBOX-PROOF-003B/interior_W4-SANDBOX-PROOF-003B.pdf',
    },
    {
      headObjectImpl: async () =>
        new Response(null, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': '42',
          },
        }),
      fetchImpl: async () => {
        fetchCalled = true;
        throw new Error('Expected existing-object reuse to avoid downloading the PDF again');
      },
      putObjectImpl: async () => {
        putCalled = true;
        throw new Error('Expected existing-object reuse to avoid uploading the PDF again');
      },
      recordWorkflowEvent: createWorkflowEventRecorder(workflowEvents),
    },
  );

  assert(
    result.success === true &&
      result.reusedExisting === true &&
      result.byteSize === 42 &&
      result.pdfUrl ===
        'https://admin.littleherolabs.com/api/assets/book/orders/W4-SANDBOX-PROOF-003B/interior_W4-SANDBOX-PROOF-003B.pdf',
    'Expected W4 materialize route to reuse an already-materialized PDF object when the canonical key already exists',
  );
  assert(
    fetchCalled === false && putCalled === false,
    'Expected W4 materialize route to skip both download and upload when the target PDF is already present in R2',
  );
  assert(
    workflowEvents.length === 1 &&
      workflowEvents[0]?.eventType === 'artifact-materialized' &&
      workflowEvents[0]?.payload &&
      (workflowEvents[0].payload as JsonRecord).reusedExisting === true,
    'Expected W4 materialize route to record a reused-existing artifact event when it short-circuits to an existing R2 object',
  );
}

async function testMaterializePrintPdfRouteSkipsUploadForProductionDryRun(): Promise<void> {
  let headCalled = false;
  let fetchCalled = false;
  let putCalled = false;
  const workflowEvents: JsonRecord[] = [];

  const result = await materializeW4PrintPdfResponse(
    {
      documentKind: 'interior-pdf',
      orderId: 'W4-SANDBOX-PROOF-003C',
      workflowJobId: 5032,
      workflowAttemptId: 6032,
      workflowJobIdempotencyKey: 'wf:4.1:w4-sibling-aggregation:W4-SANDBOX-PROOF-003C:print:test',
      productionDryRun: true,
      pdfDownloadUrl: 'https://cdn.example/interior-materialize-dry-run.pdf',
      pdfR2Key: 'book/orders/W4-SANDBOX-PROOF-003C/interior_W4-SANDBOX-PROOF-003C.pdf',
    },
    {
      headObjectImpl: async () => {
        headCalled = true;
        throw new Error('Expected production dry-run materialization to bypass headObject');
      },
      fetchImpl: async () => {
        fetchCalled = true;
        throw new Error('Expected production dry-run materialization to bypass PDF download');
      },
      putObjectImpl: async () => {
        putCalled = true;
        throw new Error('Expected production dry-run materialization to bypass R2 upload');
      },
      recordWorkflowEvent: createWorkflowEventRecorder(workflowEvents),
    },
  );

  assert(
    result.success === true &&
      result.materializationSkipped === true &&
      result.pdfUrl === 'https://cdn.example/interior-materialize-dry-run.pdf',
    'Expected W4 materialize route to short-circuit to the direct PDF URL for production dry-runs',
  );
  assert(
    headCalled === false && fetchCalled === false && putCalled === false,
    'Expected production dry-run materialization to avoid object checks, downloads, and uploads',
  );
  assert(
    workflowEvents.length === 1 &&
      workflowEvents[0]?.eventType === 'artifact-materialization-skipped' &&
      ((workflowEvents[0]?.payload as JsonRecord | undefined)?.reason ===
        'production_dry_run_direct_url'),
    'Expected production dry-run materialization to record a skipped-upload workflow event',
  );
}

async function testMaterializePrintPdfRouteSkipsUploadForDirectUrlMode(): Promise<void> {
  let headCalled = false;
  let fetchCalled = false;
  let putCalled = false;
  const workflowEvents: JsonRecord[] = [];

  const result = await materializeW4PrintPdfResponse(
    {
      documentKind: 'interior-pdf',
      orderId: 'W4-SANDBOX-PROOF-003D',
      workflowJobId: 5033,
      workflowAttemptId: 6033,
      workflowJobIdempotencyKey: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-003D:print:test',
      allowDirectPdfUrls: true,
      pdfDownloadUrl: 'https://cdn.example/interior-materialize-direct.pdf',
      pdfR2Key: 'book/orders/W4-SANDBOX-PROOF-003D/interior_W4-SANDBOX-PROOF-003D.pdf',
    },
    {
      headObjectImpl: async () => {
        headCalled = true;
        throw new Error('Expected direct-url mode materialization to bypass headObject');
      },
      fetchImpl: async () => {
        fetchCalled = true;
        throw new Error('Expected direct-url mode materialization to bypass PDF download');
      },
      putObjectImpl: async () => {
        putCalled = true;
        throw new Error('Expected direct-url mode materialization to bypass R2 upload');
      },
      recordWorkflowEvent: createWorkflowEventRecorder(workflowEvents),
    },
  );

  assert(
    result.success === true &&
      result.materializationSkipped === true &&
      result.pdfUrl === 'https://cdn.example/interior-materialize-direct.pdf',
    'Expected W4 materialize route to short-circuit to the direct PDF URL when direct-url mode is enabled',
  );
  assert(
    headCalled === false && fetchCalled === false && putCalled === false,
    'Expected direct-url mode materialization to avoid object checks, downloads, and uploads',
  );
  assert(
    workflowEvents.length === 1 &&
      workflowEvents[0]?.eventType === 'artifact-materialization-skipped' &&
      ((workflowEvents[0]?.payload as JsonRecord | undefined)?.reason === 'direct_url_mode'),
    'Expected direct-url mode materialization to record a skipped-upload workflow event',
  );
}

async function testCoverMaterializationPreservesInteriorDirectUrls(): Promise<void> {
  const result = await materializeW4PrintPdfResponse(
    {
      documentKind: 'cover-pdf',
      orderId: 'W4-SANDBOX-PROOF-003E',
      workflowJobId: 5034,
      workflowAttemptId: 6034,
      workflowJobIdempotencyKey: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-003E:print:test',
      allowDirectPdfUrls: true,
      pdfUrl: 'https://cdn.example/W4-SANDBOX-PROOF-003E/interior.pdf',
      pdfDownloadUrl: 'https://cdn.example/W4-SANDBOX-PROOF-003E/interior.pdf',
      coverPdfDownloadUrl: 'https://cdn.example/W4-SANDBOX-PROOF-003E/cover.pdf',
      coverPdfR2Key: 'book/orders/W4-SANDBOX-PROOF-003E/cover_W4-SANDBOX-PROOF-003E.pdf',
    },
    {
      headObjectImpl: async () => {
        throw new Error('Expected cover direct-url mode materialization to bypass headObject');
      },
      fetchImpl: async () => {
        throw new Error('Expected cover direct-url mode materialization to bypass PDF download');
      },
      putObjectImpl: async () => {
        throw new Error('Expected cover direct-url mode materialization to bypass R2 upload');
      },
      recordWorkflowEvent: createWorkflowEventRecorder([]),
    },
  );

  assert(
    result.success === true &&
      result.materializationSkipped === true &&
      result.pdfUrl === 'https://cdn.example/W4-SANDBOX-PROOF-003E/interior.pdf' &&
      result.coverPdfUrl === 'https://cdn.example/W4-SANDBOX-PROOF-003E/cover.pdf' &&
      result.pdfDownloadUrl === 'https://cdn.example/W4-SANDBOX-PROOF-003E/interior.pdf' &&
      result.coverPdfDownloadUrl === 'https://cdn.example/W4-SANDBOX-PROOF-003E/cover.pdf',
    'Expected cover materialization to preserve the interior direct PDF URLs while adding the cover direct PDF URL',
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

async function testQaUsesDirectPdfUrlsForProductionDryRun(): Promise<void> {
  const signCalls: string[] = [];
  const result = await runW4PrintQaResponse(
    {
      orderId: 'W4-SANDBOX-PROOF-004C',
      workflowJobId: 5042,
      workflowAttemptId: 6042,
      workflowJobIdempotencyKey: 'wf:4.1:w4-sibling-aggregation:W4-SANDBOX-PROOF-004C:print:test',
      productionDryRun: true,
      CONFIG: {
        renderer: {
          apiBase: 'https://renderer.example',
          internalToken: 'renderer-token',
        },
      },
      expectedPageCount: 1,
      pageLabels: ['p00'],
      pageImageUrls: ['book/orders/W4-SANDBOX-PROOF-004C/preview-images/p00.png'],
      coverPreviewUrl: 'book/orders/W4-SANDBOX-PROOF-004C/preview-images/cover-spread.png',
      pdfUrl: 'https://cdn.example/W4-SANDBOX-PROOF-004C/interior.pdf',
      coverPdfUrl: 'https://cdn.example/W4-SANDBOX-PROOF-004C/cover.pdf',
    },
    {
      signObjectUrl: async (key, bucket) => {
        signCalls.push(`${bucket}:${key}`);
        return `https://signed.example/${bucket}/${key}`;
      },
      recordWorkflowEvent: createWorkflowEventRecorder([]),
      fetchImpl: async (input, init) => {
        const url = resolveUrl(input);
        const method = String(init?.method ?? 'GET').toUpperCase();
        if (method !== 'POST' || url !== 'https://renderer.example/qa-pdf') {
          throw new Error(`Unexpected QA direct-url call: ${method} ${url}`);
        }
        const parsed = JSON.parse(String(init?.body ?? '{}')) as JsonRecord;
        const directUrlMatches =
          (String(parsed.type) === 'interior' &&
            String(parsed.pdfUrl) === 'https://cdn.example/W4-SANDBOX-PROOF-004C/interior.pdf') ||
          (String(parsed.type) === 'cover' &&
            String(parsed.pdfUrl) === 'https://cdn.example/W4-SANDBOX-PROOF-004C/cover.pdf');
        return jsonResponse({
          passed: true,
          failedPages: [],
          warnings: [],
          reasonCode: directUrlMatches ? 'direct-url-ok' : 'direct-url-mismatch',
        });
      },
    },
  );

  assert(
    result.success === true &&
      result.qaPassed === true &&
      result.interiorSignedUrl === 'https://cdn.example/W4-SANDBOX-PROOF-004C/interior.pdf' &&
      result.coverSignedUrl === 'https://cdn.example/W4-SANDBOX-PROOF-004C/cover.pdf',
    'Expected W4 QA to use direct PDF URLs during production dry-runs instead of requiring R2-signed PDF assets',
  );
  assert(
    signCalls.length === 2 &&
      signCalls.every((entry) => entry.includes('/preview-images/')),
    'Expected production dry-run QA to presign only preview images while leaving direct PDF URLs untouched',
  );
}

async function testQaUsesDirectPdfUrlsWhenMaterializationWasSkipped(): Promise<void> {
  const signCalls: string[] = [];
  const result = await runW4PrintQaResponse(
    {
      orderId: 'W4-SANDBOX-PROOF-004D',
      workflowJobId: 5043,
      workflowAttemptId: 6043,
      workflowJobIdempotencyKey: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-004D:print:test',
      allowDirectPdfUrls: true,
      materializationSkipped: true,
      CONFIG: {
        renderer: {
          apiBase: 'https://renderer.example',
          internalToken: 'renderer-token',
        },
      },
      expectedPageCount: 1,
      pageLabels: ['p00'],
      pageImageUrls: ['book/orders/W4-SANDBOX-PROOF-004D/preview-images/p00.png'],
      coverPreviewUrl: 'book/orders/W4-SANDBOX-PROOF-004D/preview-images/cover-spread.png',
      pdfUrl: 'https://cdn.example/W4-SANDBOX-PROOF-004D/interior.pdf',
      coverPdfUrl: 'https://cdn.example/W4-SANDBOX-PROOF-004D/cover.pdf',
    },
    {
      signObjectUrl: async (key, bucket) => {
        signCalls.push(`${bucket}:${key}`);
        return `https://signed.example/${bucket}/${key}`;
      },
      recordWorkflowEvent: createWorkflowEventRecorder([]),
      fetchImpl: async (input, init) => {
        const url = resolveUrl(input);
        const method = String(init?.method ?? 'GET').toUpperCase();
        if (method !== 'POST' || url !== 'https://renderer.example/qa-pdf') {
          throw new Error(`Unexpected QA skipped-materialization call: ${method} ${url}`);
        }
        const parsed = JSON.parse(String(init?.body ?? '{}')) as JsonRecord;
        return jsonResponse({
          passed:
            (String(parsed.type) === 'interior' &&
              String(parsed.pdfUrl) === 'https://cdn.example/W4-SANDBOX-PROOF-004D/interior.pdf') ||
            (String(parsed.type) === 'cover' &&
              String(parsed.pdfUrl) === 'https://cdn.example/W4-SANDBOX-PROOF-004D/cover.pdf'),
          failedPages: [],
          warnings: [],
          reasonCode: 'direct-url-ok',
        });
      },
    },
  );

  assert(
    result.success === true &&
      result.qaPassed === true &&
      result.interiorSignedUrl === 'https://cdn.example/W4-SANDBOX-PROOF-004D/interior.pdf' &&
      result.coverSignedUrl === 'https://cdn.example/W4-SANDBOX-PROOF-004D/cover.pdf',
    'Expected W4 QA to honor direct-url mode after materialization is intentionally skipped',
  );
  assert(
    signCalls.length === 2 &&
      signCalls.every((entry) => entry.includes('/preview-images/')),
    'Expected skipped-materialization QA to presign only preview images while leaving direct PDF URLs untouched',
  );
}

async function testQaSignsCloudflareStorageUrlsWhenDirectInteriorUrlIsMissing(): Promise<void> {
  const signCalls: string[] = [];
  const rendererCalls: Array<{ type: string; pdfUrl: string }> = [];

  const result = await runW4PrintQaResponse(
    {
      orderId: 'W4-SANDBOX-PROOF-004E',
      workflowJobId: 5044,
      workflowAttemptId: 6044,
      workflowJobIdempotencyKey: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-004E:print:test',
      allowDirectPdfUrls: true,
      materializationSkipped: true,
      CONFIG: {
        renderer: {
          apiBase: 'https://renderer.example',
          internalToken: 'renderer-token',
        },
      },
      expectedPageCount: 1,
      pageLabels: ['p00'],
      pageImageUrls: ['book/orders/W4-SANDBOX-PROOF-004E/preview-images/p00.png'],
      coverPreviewUrl: 'book/orders/W4-SANDBOX-PROOF-004E/preview-images/cover-spread.png',
      pdfR2Key:
        'https://little-hero-orders.3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com/book/orders/W4-SANDBOX-PROOF-004E/interior.pdf',
      coverPdfUrl: 'https://cdn.example/W4-SANDBOX-PROOF-004E/cover.pdf',
      coverPdfR2Key:
        'https://little-hero-orders.3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com/book/orders/W4-SANDBOX-PROOF-004E/cover.pdf',
    },
    {
      signObjectUrl: async (key, bucket) => {
        signCalls.push(`${bucket}:${key}`);
        return `https://signed.example/${bucket}/${key}`;
      },
      recordWorkflowEvent: createWorkflowEventRecorder([]),
      fetchImpl: async (input, init) => {
        const url = resolveUrl(input);
        const method = String(init?.method ?? 'GET').toUpperCase();
        if (method !== 'POST' || url !== 'https://renderer.example/qa-pdf') {
          throw new Error(`Unexpected QA cloudflarestorage call: ${method} ${url}`);
        }

        const parsed = JSON.parse(String(init?.body ?? '{}')) as JsonRecord;
        rendererCalls.push({
          type: String(parsed.type),
          pdfUrl: String(parsed.pdfUrl),
        });

        return jsonResponse({
          passed: true,
          failedPages: [],
          warnings: [],
          reasonCode: 'cloudflarestorage-ok',
        });
      },
    },
  );

  assert(
    result.success === true &&
      result.qaPassed === true &&
      result.interiorSignedUrl ===
        'https://signed.example/little-hero-orders/book/orders/W4-SANDBOX-PROOF-004E/interior.pdf' &&
      result.coverSignedUrl === 'https://cdn.example/W4-SANDBOX-PROOF-004E/cover.pdf',
    'Expected W4 QA to sign Cloudflare storage URLs for missing interior direct URLs while preserving direct cover URLs',
  );
  assert(
    rendererCalls.length === 2 &&
      rendererCalls.some(
        (call) =>
          call.type === 'interior' &&
          call.pdfUrl ===
            'https://signed.example/little-hero-orders/book/orders/W4-SANDBOX-PROOF-004E/interior.pdf',
      ) &&
      rendererCalls.some(
        (call) =>
          call.type === 'cover' &&
          call.pdfUrl === 'https://cdn.example/W4-SANDBOX-PROOF-004E/cover.pdf',
      ),
    'Expected renderer QA calls to receive a signed interior PDF URL and the preserved direct cover URL',
  );
  assert(
    signCalls.includes('little-hero-orders:book/orders/W4-SANDBOX-PROOF-004E/interior.pdf') &&
      signCalls.filter((entry) => entry.includes('/preview-images/')).length === 2,
    'Expected QA fallback to presign the Cloudflare storage interior PDF reference plus the preview images',
  );
}

async function testQaRouteFallsBackToEnvRendererToken(): Promise<void> {
  const previousRendererToken = process.env.RENDERER_INTERNAL_TOKEN;
  const previousRendererApiBase = process.env.RENDERER_API_BASE;
  const previousRendererBaseUrl = process.env.RENDERER_BASE_URL;
  const previousRendererUrl = process.env.RENDERER_URL;
  process.env.RENDERER_INTERNAL_TOKEN = 'env-renderer-token';
  delete process.env.RENDERER_API_BASE;
  delete process.env.RENDERER_BASE_URL;
  process.env.RENDERER_URL = 'https://renderer.littleherobooks.com';

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
            'Expected W4 QA route to use the payload renderer apiBase while falling back to RENDERER_INTERNAL_TOKEN when the payload omits renderer.internalToken',
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

    if (previousRendererBaseUrl === undefined) {
      delete process.env.RENDERER_BASE_URL;
    } else {
      process.env.RENDERER_BASE_URL = previousRendererBaseUrl;
    }

    if (previousRendererUrl === undefined) {
      delete process.env.RENDERER_URL;
    } else {
      process.env.RENDERER_URL = previousRendererUrl;
    }
  }
}

async function testQaNormalizesLegacyRendererHostFromPayloadConfig(): Promise<void> {
  const result = await runW4PrintQaResponse(
    {
      orderId: 'W4-SANDBOX-PROOF-004F',
      workflowJobId: 5045,
      workflowAttemptId: 6045,
      workflowJobIdempotencyKey: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-004F:print:test',
      CONFIG: {
        renderer: {
          apiBase: 'https://renderer.littleherobooks.com',
          internalToken: 'renderer-token',
        },
      },
      expectedPageCount: 1,
      pageLabels: ['p00'],
      pageImageUrls: ['book/orders/W4-SANDBOX-PROOF-004F/preview-images/p00.png'],
      coverPreviewUrl: 'book/orders/W4-SANDBOX-PROOF-004F/preview-images/cover-spread.png',
      pdfR2Key: 'book/orders/W4-SANDBOX-PROOF-004F/interior.pdf',
      coverPdfR2Key: 'book/orders/W4-SANDBOX-PROOF-004F/cover.pdf',
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
        if (method !== 'POST' || url !== 'https://renderer-eta.vercel.app/qa-pdf') {
          throw new Error(`Unexpected QA legacy-renderer rewrite call: ${method} ${url}`);
        }
        assert(
          authHeader === 'Bearer renderer-token',
          'Expected W4 QA to preserve the renderer token while rewriting the legacy renderer host',
        );
        return jsonResponse({
          passed: true,
          failedPages: [],
          warnings: [],
          reasonCode: 'legacy-renderer-rewrite-ok',
        });
      },
    },
  );

  assert(
    result.success === true && result.qaPassed === true,
    'Expected W4 QA to normalize legacy renderer host config and still complete successfully',
  );
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
      luluStatus: {
        name: 'CREATED',
        message: 'Print-job is currently being validated',
      },
      supabasePatch: {
        status: 'pending_print',
        lulu_status: {
          name: 'CREATED',
          message: 'Print-job is currently being validated',
        },
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
    typeof (successResult.manifest.lulu as JsonRecord | undefined)?.status === 'string' &&
      (successResult.manifest.lulu as JsonRecord).status === 'CREATED' &&
      typeof (successResult.manifest.lulu as JsonRecord).statusDetail === 'object',
    'Expected W4 success manifest publish to normalize structured Lulu status objects while preserving the original detail payload',
  );
  assert(
    successUpload?.bucket === 'little-hero-orders' &&
      successUpload.key === 'book/orders/W4-SANDBOX-PROOF-007/manifests/4-manifest.json' &&
      successPatch?.orderId === 'W4-SANDBOX-PROOF-007',
    'Expected W4 manifest publish route to upload the manifest and apply the requested order patch',
  );
  assert(
    successPatch?.updates.lulu_status === 'CREATED',
    'Expected W4 manifest publish route to normalize structured Lulu status objects before persisting them to Supabase',
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
  await testInteriorRenderCanReturnIncompleteForFollowupPoll();
  await testPollPrintDocumentRouteContinuesExistingDocument();
  await testMaterializePrintPdfRoute();
  await testMaterializePrintPdfRouteRetriesTransientDownload503();
  await testMaterializePrintPdfRouteRefreshesPdfMonkeyDownloadUrlAfterWarmup503s();
  await testMaterializePrintPdfRouteReusesExistingObject();
  await testMaterializePrintPdfRouteSkipsUploadForProductionDryRun();
  await testMaterializePrintPdfRouteSkipsUploadForDirectUrlMode();
  await testCoverMaterializationPreservesInteriorDirectUrls();
  await testQaPassAndFailPaths();
  await testQaUsesDirectPdfUrlsForProductionDryRun();
  await testQaUsesDirectPdfUrlsWhenMaterializationWasSkipped();
  await testQaSignsCloudflareStorageUrlsWhenDirectInteriorUrlIsMissing();
  await testQaRouteFallsBackToEnvRendererToken();
  await testQaNormalizesLegacyRendererHostFromPayloadConfig();
  await testQaProbePayloadRejection();
  await testManifestPublishSuccessAndError();
  console.log('W4 print worker tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
