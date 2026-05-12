#!/usr/bin/env tsx

import {
  backfillW4Pdfs,
  parseBackfillW4PdfsArgs,
  type BackfillW4PdfsDependencies,
} from './backfill-w4-pdfs';
import type { BuildW4PrintInputResult } from '@/lib/books/w4-print-input';
import type {
  W4MaterializePrintPdfResult,
  W4RenderPrintDocumentResult,
} from '@/lib/workers/w4-print-worker';

type JsonRecord = Record<string, unknown>;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createPrintInput(orderId: string): BuildW4PrintInputResult {
  return {
    orderId,
    amazonOrderId: null,
    rootOrderId: orderId,
    characterHash: null,
    bookId: 'book-mvp-simple-adventure',
    formatId: '8.5x8.5_softcover',
    orderPrefix: `book-mvp-simple-adventure/orders/${orderId}`,
    orderR2BaseKey: `book-mvp-simple-adventure/orders/${orderId}`,
    oneManifestKey: `book-mvp-simple-adventure/orders/${orderId}/manifests/1-manifest.json`,
    oneManifestUrl: null,
    oneManifestSchema: null,
    manifest3Key: `book-mvp-simple-adventure/orders/${orderId}/manifests/3-manifest.json`,
    manifest3Url: `https://admin.example/api/manifests/book-mvp-simple-adventure/orders/${orderId}/manifests/3-manifest.json`,
    manifest4Key: `book-mvp-simple-adventure/orders/${orderId}/manifests/4-manifest.json`,
    manifest4Url: `https://admin.example/api/manifests/book-mvp-simple-adventure/orders/${orderId}/manifests/4-manifest.json`,
    backendUrl: 'https://admin.example',
    isAmazonOrder: false,
    expectedPageCount: 17,
    pageLabels: ['p00'],
    pagePlan: [],
    pageImageUrls: [`book-mvp-simple-adventure/orders/${orderId}/preview-images/p00.png`],
    pagePreviewImageKeys: [`book-mvp-simple-adventure/orders/${orderId}/preview-images/p00.png`],
    pagesGenerated: 1,
    coverPreviewUrl: `book-mvp-simple-adventure/orders/${orderId}/preview-images/cover-spread.png`,
    coverPreviewImageKey: `book-mvp-simple-adventure/orders/${orderId}/preview-images/cover-spread.png`,
    coverPreviewImageUrls: [
      `book-mvp-simple-adventure/orders/${orderId}/preview-images/cover-spread.png`,
    ],
    interiorPreviewImageUrls: [
      `book-mvp-simple-adventure/orders/${orderId}/preview-images/p00.png`,
    ],
    coverPdfFilename: `cover_${orderId}.pdf`,
    coverPdfR2Key: `book-mvp-simple-adventure/orders/${orderId}/cover_${orderId}.pdf`,
    pdfFilename: `interior_${orderId}.pdf`,
    pdfR2Key: `book-mvp-simple-adventure/orders/${orderId}/interior_${orderId}.pdf`,
    shippingAddress: {},
    customer: {
      email: null,
      name: null,
    },
    title: 'Test Book',
    marketplace_id: null,
    hasP00: true,
    hasPagesWithCloudflare: false,
    shipping_tier: null,
    shippingTier: null,
    ShipmentServiceLevelCategory: null,
    ShipServiceLevel: null,
    amazon_shipment_service_level: null,
    summary: {},
    pages: {},
    pagesWithCloudflare: {},
    pngGeneration: {},
    pdfGeneration: {},
    bookSpecs: {},
    orderDetails: {},
    characterSpecs: {},
    CONFIG: {
      pdfMonkey: {
        token: 'test-token',
      },
    },
    generatedAt: null,
    runStamp: null,
    workflow: null,
    orderDbId: null,
  };
}

function createDeps(params: {
  existingKeys?: Set<string>;
  renderCalls?: string[];
  materializeCalls?: string[];
} = {}): BackfillW4PdfsDependencies {
  const existingKeys = params.existingKeys ?? new Set<string>();
  const renderCalls = params.renderCalls ?? [];
  const materializeCalls = params.materializeCalls ?? [];

  return {
    buildPrintInput: async (input: JsonRecord) =>
      createPrintInput(String(input.orderId ?? 'ORDER-001')),
    loadManifest: async () => null,
    loadOrder: async () => null,
    headObject: async (_bucket, key) =>
      new Response(null, {
        status: existingKeys.has(key) ? 200 : 404,
        headers: existingKeys.has(key) ? { 'content-length': '42' } : {},
      }),
    renderPrintDocument: async (input: JsonRecord) => {
      const documentKind = String(input.documentKind);
      renderCalls.push(documentKind);
      return {
        ...input,
        documentKind,
        orderId: String(input.orderId),
        amazonOrderId: null,
        rootOrderId: String(input.orderId),
        backendUrl: 'https://admin.example',
        pdfMonkeyStatus: 'success',
        pdfMonkeyPollAttempts: 1,
        workflowLogEvent: {
          submitted: null,
          polled: null,
        },
        document: {},
        pdfMonkeyStatusUrl: `https://api.pdfmonkey.example/${documentKind}`,
        ...(documentKind === 'cover-pdf'
          ? { coverPdfDownloadUrl: 'https://cdn.example/cover.pdf' }
          : { pdfDownloadUrl: 'https://cdn.example/interior.pdf' }),
      } as W4RenderPrintDocumentResult;
    },
    materializePrintPdf: async (input: JsonRecord) => {
      const documentKind = String(input.documentKind);
      materializeCalls.push(documentKind);
      return {
        ...input,
        documentKind,
        orderId: String(input.orderId),
        amazonOrderId: null,
        rootOrderId: String(input.orderId),
        backendUrl: 'https://admin.example',
        uploadBucket: 'little-hero-orders',
        r2Key:
          documentKind === 'cover-pdf'
            ? String(input.coverPdfR2Key)
            : String(input.pdfR2Key),
        byteSize: 123,
        contentType: 'application/pdf',
        uploadedAt: '2026-05-11T12:00:00.000Z',
        downloadAttempts: 1,
        workflowLogEvent: {
          materialized: null,
        },
      } as W4MaterializePrintPdfResult;
    },
  };
}

async function testDryRunReportsMissingWithoutRendering(): Promise<void> {
  const renderCalls: string[] = [];
  const materializeCalls: string[] = [];
  const results = await backfillW4Pdfs(
    {
      orderIds: ['ORDER-MISSING'],
      execute: false,
    },
    createDeps({ renderCalls, materializeCalls }),
  );

  const documents = results[0]?.documents ?? [];
  assert(
    documents.length === 2 &&
      documents.every((document) => document.action === 'would_materialize') &&
      renderCalls.length === 0 &&
      materializeCalls.length === 0,
    'Expected dry-run backfill to report missing PDFs without rendering or uploading',
  );
}

async function testExecuteMaterializesMissingPdfs(): Promise<void> {
  const renderCalls: string[] = [];
  const materializeCalls: string[] = [];
  const results = await backfillW4Pdfs(
    {
      orderIds: ['ORDER-MATERIALIZE'],
      execute: true,
    },
    createDeps({ renderCalls, materializeCalls }),
  );

  const documents = results[0]?.documents ?? [];
  assert(
    documents.length === 2 &&
      documents.every((document) => document.action === 'materialized') &&
      documents.every((document) => document.byteSize === 123) &&
      renderCalls.sort().join(',') === 'cover-pdf,interior-pdf' &&
      materializeCalls.sort().join(',') === 'cover-pdf,interior-pdf',
    'Expected execute backfill to render and materialize both missing PDFs',
  );
}

async function testExecuteSkipsExistingPdfs(): Promise<void> {
  const orderId = 'ORDER-EXISTS';
  const printInput = createPrintInput(orderId);
  const existingKeys = new Set([printInput.pdfR2Key, printInput.coverPdfR2Key]);
  const renderCalls: string[] = [];
  const materializeCalls: string[] = [];
  const results = await backfillW4Pdfs(
    {
      orderIds: [orderId],
      execute: true,
    },
    createDeps({ existingKeys, renderCalls, materializeCalls }),
  );

  const documents = results[0]?.documents ?? [];
  assert(
    documents.length === 2 &&
      documents.every((document) => document.action === 'exists') &&
      documents.every((document) => document.byteSize === 42) &&
      renderCalls.length === 0 &&
      materializeCalls.length === 0,
    'Expected execute backfill to skip already-present PDFs without rendering or uploading',
  );
}

function testParseArgs(): void {
  const parsed = parseBackfillW4PdfsArgs([
    '--order-id',
    'ORDER-1',
    '--order-id=ORDER-2',
    '--book-id',
    'book-mvp-simple-adventure',
    '--backend-url=https://admin.example',
    '--execute',
  ]);

  assert(
    parsed.execute === true &&
      parsed.orderIds.join(',') === 'ORDER-1,ORDER-2' &&
      parsed.bookId === 'book-mvp-simple-adventure' &&
      parsed.backendUrl === 'https://admin.example',
    'Expected backfill CLI parser to collect order ids and execution options',
  );
}

async function main(): Promise<void> {
  testParseArgs();
  await testDryRunReportsMissingWithoutRendering();
  await testExecuteMaterializesMissingPdfs();
  await testExecuteSkipsExistingPdfs();
  console.log('W4 PDF backfill tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
