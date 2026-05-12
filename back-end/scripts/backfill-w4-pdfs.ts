#!/usr/bin/env tsx

import { basename } from 'node:path';
import { buildW4PrintInput, type BuildW4PrintInputResult } from '@/lib/books/w4-print-input';
import { downloadManifest } from '@/lib/r2-service';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import { headObject } from '@/lib/r2-client';
import { getBucketFromKey } from '@/lib/r2-utils';
import {
  materializeW4PrintPdf,
  renderW4PrintDocument,
  type W4MaterializePrintPdfResult,
  type W4RenderPrintDocumentResult,
} from '@/lib/workers/w4-print-worker';

type JsonRecord = Record<string, unknown>;
type W4BackfillDocumentKind = 'interior-pdf' | 'cover-pdf';
type W4BackfillAction = 'exists' | 'would_materialize' | 'materialized';

export type BackfillW4PdfsOptions = {
  orderIds: string[];
  execute?: boolean;
  bookId?: string;
  backendUrl?: string;
};

export type BackfillW4PdfDocumentResult = {
  documentKind: W4BackfillDocumentKind;
  bucket: string;
  r2Key: string;
  existedBefore: boolean;
  action: W4BackfillAction;
  byteSize: number | null;
  downloadAttempts: number | null;
};

export type BackfillW4PdfOrderResult = {
  orderId: string;
  execute: boolean;
  printOrderId: string;
  orderPrefix: string;
  manifest3Key: string;
  documents: BackfillW4PdfDocumentResult[];
};

export type BackfillW4PdfsDependencies = {
  buildPrintInput?: typeof buildW4PrintInput;
  loadManifest?: (manifestKey: string) => Promise<unknown | null>;
  loadOrder?: (orderId: string) => Promise<unknown | null>;
  headObject?: (bucket: string, key: string) => Promise<Response>;
  renderPrintDocument?: typeof renderW4PrintDocument;
  materializePrintPdf?: typeof materializeW4PrintPdf;
};

function usage(): string {
  return [
    'usage: npm run backfill:w4-pdfs -- --order-id <orderId> [--order-id <orderId> ...] [--execute]',
    '',
    'Options:',
    '  --order-id <id>      Order id to inspect/backfill. May be repeated.',
    '  --book-id <id>       Book id fallback when the order row is not available.',
    '  --backend-url <url>  Backend URL used for generated asset URLs.',
    '  --execute           Actually render and upload missing PDFs. Defaults to dry run.',
  ].join('\n');
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parsePositiveIntegerHeader(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseBackfillW4PdfsArgs(argv: string[]): BackfillW4PdfsOptions {
  const orderIds: string[] = [];
  let execute = false;
  let bookId: string | undefined;
  let backendUrl: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      throw new Error(usage());
    }
    if (arg === '--execute') {
      execute = true;
      continue;
    }
    if (arg === '--dry-run') {
      execute = false;
      continue;
    }
    if (arg === '--order-id') {
      const value = toTrimmedString(argv[index + 1]);
      if (!value) throw new Error('--order-id requires a value');
      orderIds.push(value);
      index += 1;
      continue;
    }
    if (arg.startsWith('--order-id=')) {
      const value = toTrimmedString(arg.slice('--order-id='.length));
      if (!value) throw new Error('--order-id requires a value');
      orderIds.push(value);
      continue;
    }
    if (arg === '--book-id') {
      const value = toTrimmedString(argv[index + 1]);
      if (!value) throw new Error('--book-id requires a value');
      bookId = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--book-id=')) {
      const value = toTrimmedString(arg.slice('--book-id='.length));
      if (!value) throw new Error('--book-id requires a value');
      bookId = value;
      continue;
    }
    if (arg === '--backend-url') {
      const value = toTrimmedString(argv[index + 1]);
      if (!value) throw new Error('--backend-url requires a value');
      backendUrl = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--backend-url=')) {
      const value = toTrimmedString(arg.slice('--backend-url='.length));
      if (!value) throw new Error('--backend-url requires a value');
      backendUrl = value;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}\n${usage()}`);
    }
    const positional = toTrimmedString(arg);
    if (positional) orderIds.push(positional);
  }

  const uniqueOrderIds = [...new Set(orderIds)];
  if (uniqueOrderIds.length === 0) {
    throw new Error(`At least one order id is required.\n${usage()}`);
  }

  return {
    orderIds: uniqueOrderIds,
    execute,
    ...(bookId ? { bookId } : {}),
    ...(backendUrl ? { backendUrl } : {}),
  };
}

async function inspectPdf(key: string, deps: Required<Pick<BackfillW4PdfsDependencies, 'headObject'>>): Promise<{
  bucket: string;
  exists: boolean;
  byteSize: number | null;
}> {
  const bucket = getBucketFromKey(key);
  const response = await deps.headObject(bucket, key);
  return {
    bucket,
    exists: response.ok,
    byteSize: response.ok ? parsePositiveIntegerHeader(response.headers.get('content-length')) : null,
  };
}

function buildFallbackOrderInput(orderId: string, options: BackfillW4PdfsOptions, orderRow: unknown): JsonRecord {
  if (orderRow && typeof orderRow === 'object' && !Array.isArray(orderRow)) {
    return {
      ...(orderRow as JsonRecord),
      backendUrl: options.backendUrl ?? (orderRow as JsonRecord).backendUrl,
    };
  }

  const bookId = options.bookId ?? 'book-mvp-simple-adventure';
  const orderPrefix = `${bookId}/orders/${orderId}`;
  return {
    orderId,
    bookId,
    orderPrefix,
    manifest3Key: `${orderPrefix}/manifests/3-manifest.json`,
    backendUrl: options.backendUrl,
  };
}

function materializeInputFor(
  printInput: BuildW4PrintInputResult,
  renderResult: W4RenderPrintDocumentResult,
  documentKind: W4BackfillDocumentKind,
): JsonRecord {
  return {
    ...printInput,
    ...renderResult,
    documentKind,
    allowDirectPdfUrls: false,
    materializationSkipped: false,
    productionDryRun: false,
  };
}

async function backfillDocument(params: {
  documentKind: W4BackfillDocumentKind;
  printInput: BuildW4PrintInputResult;
  execute: boolean;
  deps: Required<
    Pick<
      BackfillW4PdfsDependencies,
      'headObject' | 'renderPrintDocument' | 'materializePrintPdf'
    >
  >;
  backendUrl?: string;
}): Promise<BackfillW4PdfDocumentResult> {
  const r2Key =
    params.documentKind === 'cover-pdf'
      ? params.printInput.coverPdfR2Key
      : params.printInput.pdfR2Key;
  const inspected = await inspectPdf(r2Key, { headObject: params.deps.headObject });

  if (inspected.exists) {
    return {
      documentKind: params.documentKind,
      bucket: inspected.bucket,
      r2Key,
      existedBefore: true,
      action: 'exists',
      byteSize: inspected.byteSize,
      downloadAttempts: null,
    };
  }

  if (!params.execute) {
    return {
      documentKind: params.documentKind,
      bucket: inspected.bucket,
      r2Key,
      existedBefore: false,
      action: 'would_materialize',
      byteSize: null,
      downloadAttempts: null,
    };
  }

  const renderResult = await params.deps.renderPrintDocument(
    {
      ...params.printInput,
      documentKind: params.documentKind,
    },
    {
      defaultBackendUrl: params.backendUrl,
    },
  );
  const materialized = (await params.deps.materializePrintPdf(
    materializeInputFor(params.printInput, renderResult, params.documentKind),
    {
      defaultBackendUrl: params.backendUrl,
    },
  )) as W4MaterializePrintPdfResult;

  return {
    documentKind: params.documentKind,
    bucket: inspected.bucket,
    r2Key,
    existedBefore: false,
    action: 'materialized',
    byteSize: typeof materialized.byteSize === 'number' ? materialized.byteSize : null,
    downloadAttempts:
      typeof materialized.downloadAttempts === 'number' ? materialized.downloadAttempts : null,
  };
}

export async function backfillW4Pdfs(
  options: BackfillW4PdfsOptions,
  dependencies: BackfillW4PdfsDependencies = {},
): Promise<BackfillW4PdfOrderResult[]> {
  const deps = {
    buildPrintInput: dependencies.buildPrintInput ?? buildW4PrintInput,
    loadManifest: dependencies.loadManifest ?? downloadManifest,
    loadOrder: dependencies.loadOrder ?? getOrderFromSupabase,
    headObject: dependencies.headObject ?? headObject,
    renderPrintDocument: dependencies.renderPrintDocument ?? renderW4PrintDocument,
    materializePrintPdf: dependencies.materializePrintPdf ?? materializeW4PrintPdf,
  };
  const execute = Boolean(options.execute);

  return Promise.all(
    options.orderIds.map(async (orderId): Promise<BackfillW4PdfOrderResult> => {
      const orderRow = await deps.loadOrder(orderId).catch(() => null);
      const printInput = await deps.buildPrintInput(buildFallbackOrderInput(orderId, options, orderRow), {
        loadManifest: deps.loadManifest,
        loadOrder: deps.loadOrder,
        defaultBackendUrl: options.backendUrl,
      });
      const documents = await Promise.all([
        backfillDocument({
          documentKind: 'interior-pdf',
          printInput,
          execute,
          deps,
          backendUrl: options.backendUrl,
        }),
        backfillDocument({
          documentKind: 'cover-pdf',
          printInput,
          execute,
          deps,
          backendUrl: options.backendUrl,
        }),
      ]);

      return {
        orderId,
        execute,
        printOrderId: printInput.orderId,
        orderPrefix: printInput.orderPrefix,
        manifest3Key: printInput.manifest3Key,
        documents,
      };
    }),
  );
}

async function main(): Promise<void> {
  const options = parseBackfillW4PdfsArgs(process.argv.slice(2));
  const results = await backfillW4Pdfs(options);
  console.log(JSON.stringify({ execute: Boolean(options.execute), results }, null, 2));
}

if (basename(process.argv[1] ?? '') === 'backfill-w4-pdfs.ts') {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
