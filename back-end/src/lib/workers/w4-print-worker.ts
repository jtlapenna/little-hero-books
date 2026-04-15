import { headObject, putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { resolveOrderPathContext } from '@/lib/order-paths';
import { getSignedUrlForObject } from '@/lib/r2-service';
import { getBucketFromKey, extractR2Key } from '@/lib/r2-utils';
import { updateOrderInSupabase } from '@/lib/supabase-client';
import { resolveCanonicalBackendBaseUrl } from '@/lib/backend-url';

type JsonRecord = Record<string, unknown>;
type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type W4PrintDocumentKind = 'interior-pdf' | 'cover-pdf';

export interface W4RenderPrintDocumentInput extends JsonRecord {
  documentKind: W4PrintDocumentKind;
  orderId?: string | null;
  amazonOrderId?: string | null;
  rootOrderId?: string | null;
  backendUrl?: string | null;
  workflowJobId?: number | null;
  workflowJobIdempotencyKey?: string | null;
  workflowAttemptId?: number | null;
  CONFIG?: JsonRecord;
  pageImageUrls?: string[] | null;
  coverPreviewUrl?: string | null;
  pdfFilename?: string | null;
  coverPdfFilename?: string | null;
  pdfR2Key?: string | null;
  coverPdfR2Key?: string | null;
  runStamp?: string | null;
  pdfMonkeyTemplateId?: string | null;
  pdfMonkeyCoverTemplateId?: string | null;
  pdfMonkeyStatus?: string | null;
  pdfMonkeyStatusUrl?: string | null;
  pdfMonkeyDocumentId?: string | null;
  pdfMonkeyCoverDocumentId?: string | null;
  allowIncomplete?: boolean | null;
  maxPollAttempts?: number | null;
  pollIntervalMs?: number | null;
}

export interface W4MaterializePrintPdfInput extends JsonRecord {
  documentKind?: W4PrintDocumentKind;
  orderId?: string | null;
  amazonOrderId?: string | null;
  rootOrderId?: string | null;
  backendUrl?: string | null;
  workflowJobId?: number | null;
  workflowJobIdempotencyKey?: string | null;
  workflowAttemptId?: number | null;
  pdfDownloadUrl?: string | null;
  coverPdfDownloadUrl?: string | null;
  pdfR2Key?: string | null;
  coverPdfR2Key?: string | null;
  pdfFilename?: string | null;
  coverPdfFilename?: string | null;
  productionDryRun?: boolean | null;
}

export interface W4RunPrintQaInput extends JsonRecord {
  orderId?: string | null;
  amazonOrderId?: string | null;
  rootOrderId?: string | null;
  backendUrl?: string | null;
  workflowJobId?: number | null;
  workflowJobIdempotencyKey?: string | null;
  workflowAttemptId?: number | null;
  CONFIG?: JsonRecord;
  expectedPageCount?: number | string | null;
  pageLabels?: string[] | null;
  pageImageUrls?: string[] | null;
  coverPreviewUrl?: string | null;
  pdfR2Key?: string | null;
  coverPdfR2Key?: string | null;
  pdfUrl?: string | null;
  coverPdfUrl?: string | null;
  pdfDownloadUrl?: string | null;
  coverPdfDownloadUrl?: string | null;
  productionDryRun?: boolean | null;
}

export interface PublishW4PrintManifestInput extends JsonRecord {
  orderId?: string | null;
  amazonOrderId?: string | null;
  rootOrderId?: string | null;
  backendUrl?: string | null;
  workflowJobId?: number | null;
  workflowJobIdempotencyKey?: string | null;
  workflowAttemptId?: number | null;
  orderPrefix?: string | null;
  orderR2BaseKey?: string | null;
  manifestKey?: string | null;
  manifestUrl?: string | null;
  manifestStatus?: 'submitted' | 'error' | string | null;
  pdfR2Key?: string | null;
  coverPdfR2Key?: string | null;
  coverPdfUrl?: string | null;
  luluJobId?: string | null;
  luluStatus?: string | null;
  luluCost?: unknown;
  estimatedShipDate?: string | null;
  submitMode?: string | null;
  errorType?: string | null;
  errorPhase?: string | null;
  errorMessage?: string | null;
  qaInterior?: JsonRecord | null;
  qaCover?: JsonRecord | null;
  qaFailedPages?: unknown[] | null;
  _errorManifest?: JsonRecord | null;
  supabasePatch?: JsonRecord | null;
}

export type W4WorkflowEventResult = {
  success: boolean;
  jobId: number;
  attemptId: number | null;
  currentStatus: string;
  __workflowJobEvent: {
    eventType: string;
    recordedAt: string;
    currentStatus: string;
  };
};

export interface W4WorkerOptions {
  defaultBackendUrl?: string;
  pdfMonkeyApiKey?: string;
  rendererApiBase?: string;
  rendererInternalToken?: string;
  fetchImpl?: FetchImpl;
  sleep?: (ms: number) => Promise<void>;
  recordWorkflowEvent?: (body: JsonRecord) => Promise<JsonRecord>;
  maxPollAttempts?: number;
  pollIntervalMs?: number;
  maxPollRequestErrors?: number;
  headObjectImpl?: typeof headObject;
  putObjectImpl?: typeof putObject;
  signObjectUrl?: typeof getSignedUrlForObject;
  updateOrderImpl?: typeof updateOrderInSupabase;
}

export interface W4RenderPrintDocumentResult extends JsonRecord {
  documentKind: W4PrintDocumentKind;
  orderId: string;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  backendUrl: string;
  pdfMonkeyStatus: string;
  pdfMonkeyPollAttempts: number;
  workflowLogEvent: {
    submitted: W4WorkflowEventResult | null;
    polled: W4WorkflowEventResult | null;
  };
  document: JsonRecord;
  pdfDownloadUrl?: string | null;
  coverPdfDownloadUrl?: string | null;
  pdfMonkeyDocumentId?: string | null;
  pdfMonkeyCoverDocumentId?: string | null;
  pdfMonkeyStatusUrl: string;
  pages_html?: string;
  cover_html?: string;
}

export type W4PollPrintDocumentResult = W4RenderPrintDocumentResult;

export interface W4MaterializePrintPdfResult extends JsonRecord {
  documentKind: W4PrintDocumentKind;
  orderId: string;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  backendUrl: string;
  uploadBucket: string;
  r2Key: string;
  byteSize: number;
  contentType: string;
  uploadedAt: string;
  reusedExisting?: boolean;
  materializationSkipped?: boolean;
  pdfR2Key?: string | null;
  coverPdfR2Key?: string | null;
  pdfUrl?: string | null;
  coverPdfUrl?: string | null;
  workflowLogEvent: {
    materialized: W4WorkflowEventResult | null;
  };
}

export interface W4RunPrintQaResult extends JsonRecord {
  orderId: string;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  backendUrl: string;
  interiorSignedUrl: string;
  coverSignedUrl: string;
  interiorPreviewImageUrls: string[];
  coverPreviewImageUrls: string[];
  qaInterior: JsonRecord;
  qaCover: JsonRecord;
  qaPassed: boolean;
  qaFailedPages: unknown[];
  workflowLogEvent: {
    qaRecorded: W4WorkflowEventResult | null;
  };
}

export interface PublishW4PrintManifestResult extends JsonRecord {
  orderId: string;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  backendUrl: string;
  manifestStatus: 'submitted' | 'error';
  manifest: JsonRecord;
  manifestKey: string;
  manifestUrl: string;
  manifestBucket: string;
  uploadBucket: string;
  manifestReady: true;
  orderUpdateApplied: boolean;
  workflowLogEvent: {
    manifestRecorded: W4WorkflowEventResult | null;
  };
}

const PDFMONKEY_DOCUMENTS_API = 'https://api.pdfmonkey.io/api/v1/documents';
const DEFAULT_INTERIOR_TEMPLATE_ID = '5539DDB4-EC78-4AE9-A3FB-DB1E7F8DD172';
const DEFAULT_COVER_TEMPLATE_ID = 'D52F14C8-BBC3-4058-929F-195DFC707E75';

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  return lowered === 'null' || lowered === 'undefined' ? null : trimmed;
}

function toInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = toInteger(value);
  return parsed && parsed > 0 ? parsed : null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }

  return false;
}

function toJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = toTrimmedString(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveOrderId(input: JsonRecord): string {
  return firstString(input.orderId, input.amazonOrderId, input.rootOrderId) ?? '';
}

function resolveAmazonOrderId(input: JsonRecord, orderId: string): string | null {
  return firstString(input.amazonOrderId, input.rootOrderId, orderId);
}

function resolveRootOrderId(input: JsonRecord, amazonOrderId: string | null, orderId: string): string | null {
  return firstString(input.rootOrderId, amazonOrderId, orderId);
}

function resolveBackendUrl(input: JsonRecord, fallback?: string): string {
  return resolveCanonicalBackendBaseUrl(
    toTrimmedString(input.backendUrl),
    toTrimmedString(fallback),
  );
}

function extractAssetKeysFromHtml(html: string): string[] {
  const prefix = '/api/assets/';
  const keys = new Set<string>();

  for (let i = 0; i < html.length; ) {
    const idx = html.indexOf(prefix, i);
    if (idx === -1) {
      break;
    }

    let j = idx + prefix.length;
    let key = '';
    for (; j < html.length; j += 1) {
      const ch = html[j];
      if (
        ch === '"' ||
        ch === "'" ||
        ch === '?' ||
        ch === '&' ||
        ch === ')' ||
        ch === '>' ||
        ch === ']' ||
        /\s/.test(ch)
      ) {
        break;
      }
      key += ch;
    }

    const cleaned = key.trim();
    if (cleaned) {
      keys.add(cleaned);
    }
    i = j;
  }

  return Array.from(keys);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function presignHtmlAssetRefs(
  html: string,
  signObjectUrl: typeof getSignedUrlForObject,
  expiresIn = 21600,
): Promise<string> {
  const keys = extractAssetKeysFromHtml(html);
  if (!keys.length) {
    return html;
  }

  let output = html;
  for (const key of keys) {
    const signedUrl = await signObjectUrl(key, getBucketFromKey(key), expiresIn);
    const escaped = escapeRegex(key);
    const pattern = new RegExp(
      `((?:https?:\\/\\/[^"'\\s)]*?)?\\/api\\/assets\\/${escaped})(?:[?][^"'\\s)]*)?`,
      'g',
    );
    output = output.replace(pattern, signedUrl);
  }

  return output;
}

function buildInteriorHtml(input: W4RenderPrintDocumentInput): string {
  const pages = Array.isArray(input.pageImageUrls) ? input.pageImageUrls : [];
  if (!pages.length) {
    throw new Error('W4 interior render requires pageImageUrls');
  }

  const css = `
  <style>
    @page { size: 8.75in 8.75in; margin: 0; }
    html, body { margin: 0; padding: 0; }
    .page { width: 8.75in; height: 8.75in; page-break-after: always; }
    .bg { width: 100%; height: 100%; object-fit: cover; display: block; }
  </style>
  `;

  const pagesHtml = pages.map((url) => {
    return `<section class="page"><img class="bg" src="${url}" alt="" /></section>`;
  }).join('\n');

  return `${css}\n${pagesHtml}`;
}

function buildCoverHtml(input: W4RenderPrintDocumentInput): string {
  const coverPreviewUrl = toTrimmedString(input.coverPreviewUrl);
  if (!coverPreviewUrl) {
    throw new Error('W4 cover render requires coverPreviewUrl');
  }

  const runStamp = toTrimmedString(input.runStamp) ?? new Date().toISOString();
  const coverUrl =
    `${coverPreviewUrl}${coverPreviewUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(runStamp)}`;

  return `
  <style>
    @page { size: 17.25in 8.75in; margin: 0; }
    html, body { margin: 0; padding: 0; }
    .page { width: 17.25in; height: 8.75in; page-break-after: always; break-after: page; overflow: hidden; }
    .bg { width: 100%; height: 100%; display: block; object-fit: cover; }
  </style>
  <section class="page"><img class="bg" src="${coverUrl}" alt="" width="5203" height="2625" /></section>
  `.trim();
}

function resolveInteriorTemplateId(input: W4RenderPrintDocumentInput): string {
  return (
    firstString(
      toJsonRecord(toJsonRecord(input.CONFIG).pdfMonkey).templateId,
      input.pdfMonkeyTemplateId,
    ) ??
    DEFAULT_INTERIOR_TEMPLATE_ID
  );
}

function resolveCoverTemplateId(input: W4RenderPrintDocumentInput): string {
  return (
    firstString(
      toJsonRecord(toJsonRecord(input.CONFIG).pdfMonkey).coverTemplateId,
      input.pdfMonkeyCoverTemplateId,
      input.pdfMonkeyTemplateId,
    ) ??
    DEFAULT_COVER_TEMPLATE_ID
  );
}

function resolveInteriorFilename(input: W4RenderPrintDocumentInput, orderId: string): string {
  return firstString(input.pdfFilename, `interior_${orderId}.pdf`) ?? `interior_${orderId}.pdf`;
}

function resolveCoverFilename(input: W4RenderPrintDocumentInput, orderId: string): string {
  return firstString(input.coverPdfFilename, `cover_${orderId}.pdf`) ?? `cover_${orderId}.pdf`;
}

function buildPrintContext(
  input: JsonRecord,
  orderId: string,
  amazonOrderId: string | null,
  rootOrderId: string | null,
  backendUrl: string,
  extra: JsonRecord = {},
): JsonRecord {
  return {
    orderId,
    amazonOrderId,
    rootOrderId,
    backendUrl,
    ...extra,
    workflowJobId: typeof input.workflowJobId === 'number' ? input.workflowJobId : null,
    workflowAttemptId: typeof input.workflowAttemptId === 'number' ? input.workflowAttemptId : null,
    workflowJobIdempotencyKey: toTrimmedString(input.workflowJobIdempotencyKey),
  };
}

async function parseJsonResponse(response: Response): Promise<JsonRecord> {
  try {
    return toJsonRecord(await response.json());
  } catch {
    return {};
  }
}

async function requestJson(
  fetchImpl: FetchImpl,
  url: string,
  init: RequestInit,
): Promise<JsonRecord> {
  const response = await fetchImpl(url, init);
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    const details = (() => {
      try {
        return JSON.stringify(payload).slice(0, 300);
      } catch {
        return '';
      }
    })();
    throw new Error(`Request failed (${response.status}): ${details}`);
  }
  return payload;
}

function toDocumentRecord(value: unknown): JsonRecord {
  return toJsonRecord(value);
}

function resolvePdfRefSignedUrl(
  reference: unknown,
  signObjectUrl: typeof getSignedUrlForObject,
  expiresIn = 21600,
): Promise<string> {
  const raw = String(reference ?? '').trim();
  if (!raw) {
    throw new Error('Missing PDF reference');
  }

  if (/^https?:\/\//i.test(raw)) {
    const extracted = extractR2Key(raw);
    if (!extracted) {
      return Promise.resolve(raw);
    }
    return signObjectUrl(extracted, getBucketFromKey(extracted), expiresIn);
  }

  return signObjectUrl(raw, getBucketFromKey(raw), expiresIn);
}

async function signPreviewReference(
  reference: unknown,
  signObjectUrl: typeof getSignedUrlForObject,
  expiresIn = 21600,
): Promise<string> {
  const raw = String(reference ?? '').trim();
  if (!raw) {
    throw new Error('Missing preview reference');
  }

  if (/^https?:\/\//i.test(raw)) {
    const extracted = extractR2Key(raw);
    if (!extracted) {
      return raw;
    }
    return signObjectUrl(extracted, getBucketFromKey(extracted), expiresIn);
  }

  return signObjectUrl(raw, getBucketFromKey(raw), expiresIn);
}

function parseRendererQaPayload(kind: 'interior' | 'cover', response: JsonRecord, orderId: string): JsonRecord {
  const statusCode = Number(response.statusCode || response.status || 200);
  const headers =
    response && typeof response === 'object' && response.headers && typeof response.headers === 'object'
      ? (response.headers as JsonRecord)
      : {};
  const contentType = String(headers['content-type'] || headers['Content-Type'] || '');
  const rawBody = Object.prototype.hasOwnProperty.call(response, 'body') ? response.body : response;
  let payload: JsonRecord | null = null;

  if (rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)) {
    payload = rawBody as JsonRecord;
  } else if (typeof rawBody === 'string') {
    const trimmed = rawBody.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        payload = JSON.parse(trimmed) as JsonRecord;
      } catch {
        payload = null;
      }
    }
  }

  const bodyPreview = (() => {
    try {
      return typeof rawBody === 'string'
        ? rawBody.slice(0, 280)
        : JSON.stringify(rawBody).slice(0, 280);
    } catch {
      return String(rawBody).slice(0, 280);
    }
  })();

  const label = kind === 'interior' ? 'Interior' : 'Cover';
  const looksLikeProbePayload = Boolean(
    payload &&
      Array.isArray(payload.renderedPages) &&
      typeof payload.pageCount === 'number' &&
      !Object.prototype.hasOwnProperty.call(payload, 'passed'),
  );

  if (statusCode === 401 || statusCode === 403) {
    throw new Error(`[Run W4 Print QA] ${label} auth failure (status=${statusCode}, orderId=${orderId}, contentType=${contentType || 'n/a'}, body=${bodyPreview || 'n/a'})`);
  }
  if (statusCode >= 500) {
    throw new Error(`[Run W4 Print QA] ${label} renderer returned ${statusCode} for orderId=${orderId} (body=${bodyPreview || 'n/a'})`);
  }
  if (looksLikeProbePayload) {
    throw new Error(`[Run W4 Print QA] ${label} renderer returned probe payload instead of QA payload (status=${statusCode}, orderId=${orderId}, body=${bodyPreview || 'n/a'})`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`[Run W4 Print QA] ${label} invalid response payload (status=${statusCode}, orderId=${orderId}, contentType=${contentType || 'n/a'}, body=${bodyPreview || 'n/a'})`);
  }
  if (!Object.prototype.hasOwnProperty.call(payload, 'passed') || typeof payload.passed !== 'boolean' || !Array.isArray(payload.failedPages)) {
    throw new Error(`[Run W4 Print QA] ${label} invalid QA payload (status=${statusCode}, orderId=${orderId}, contentType=${contentType || 'n/a'}, body=${bodyPreview || 'n/a'})`);
  }
  if (statusCode >= 400) {
    throw new Error(`[Run W4 Print QA] ${label} client error (status=${statusCode}, orderId=${orderId}, reason=${String(payload.reasonCode || payload.error || 'unknown')}, body=${bodyPreview || 'n/a'})`);
  }

  return {
    statusCode,
    passed: payload.passed,
    skipped: false,
    reasonCode: payload.reasonCode || 'unknown',
    reason: payload.reason || 'unknown',
    failedPages: Array.isArray(payload.failedPages) ? payload.failedPages : [],
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    raw: payload,
  };
}

function resolveManifestKey(input: PublishW4PrintManifestInput, orderId: string, manifestStatus: 'submitted' | 'error'): string {
  const explicit = toTrimmedString(input.manifestKey);
  if (explicit) {
    return explicit;
  }

  const orderPrefix = resolveOrderPathContext(orderId, {
    bookId: toTrimmedString(input.bookId),
    orderPrefix: firstString(input.orderPrefix, input.orderR2BaseKey),
    pathLikes: [
      toTrimmedString(input.orderPrefix),
      toTrimmedString(input.orderR2BaseKey),
      toTrimmedString(input.manifestKey),
      toTrimmedString(input.pdfR2Key),
      toTrimmedString(input.coverPdfR2Key),
    ],
  }).orderPrefix;

  if (manifestStatus === 'error') {
    return `${orderPrefix}/manifests/4-qa-fail-manifest.json`;
  }

  return `${orderPrefix}/manifests/4-manifest.json`;
}

function buildSuccessManifest(input: PublishW4PrintManifestInput, orderId: string): JsonRecord {
  const { status: luluStatus, detail: luluStatusDetail } = normalizeLuluStatusValue(input.luluStatus);

  return {
    schema: 'lhb.run-manifest@v2.0',
    stage: '4-print-fulfillment',
    createdAt: new Date().toISOString(),
    orderId,
    submitMode: toTrimmedString(input.submitMode) ?? null,
    artifacts: {
      interiorPdfR2Key: input.pdfR2Key || null,
      coverPdfR2Key: input.coverPdfR2Key || null,
      coverPdfUrl: input.coverPdfUrl || null,
    },
    lulu: {
      jobId: input.luluJobId ?? null,
      status: luluStatus,
      statusDetail: luluStatusDetail,
      cost: input.luluCost ?? null,
      estimatedShipDate: input.estimatedShipDate ?? null,
    },
  };
}

function normalizeLuluStatusValue(value: unknown): { status: string | null; detail: JsonRecord | null } {
  const direct = toTrimmedString(value);
  if (direct) {
    return { status: direct, detail: null };
  }

  const detail = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
  if (!detail) {
    return { status: null, detail: null };
  }

  const status =
    firstString(detail.name, detail.status, detail.state) ??
    null;

  return { status, detail };
}

function normalizeManifestSupabasePatch(
  patchLike: JsonRecord,
  input: PublishW4PrintManifestInput,
): JsonRecord {
  const patch = { ...patchLike };
  const luluJobId = toTrimmedString(input.luluJobId);
  const { status: luluStatus } = normalizeLuluStatusValue(
    patch.lulu_status ?? patch.luluStatus ?? input.luluStatus,
  );

  if (luluJobId && (patch.lulu_job_id === undefined || patch.lulu_job_id === null || patch.lulu_job_id === '')) {
    patch.lulu_job_id = luluJobId;
  }
  if (luluStatus) {
    patch.lulu_status = luluStatus;
  } else if (patch.lulu_status && typeof patch.lulu_status === 'object') {
    delete patch.lulu_status;
  }

  if (patch.luluStatus !== undefined) {
    delete patch.luluStatus;
  }

  return patch;
}

function buildErrorManifest(input: PublishW4PrintManifestInput, orderId: string): JsonRecord {
  if (input._errorManifest && typeof input._errorManifest === 'object') {
    return {
      ...(input._errorManifest as JsonRecord),
      orderId,
    };
  }

  return {
    schema: 'lhb.run-manifest@v2.0',
    stage: '4-print-fulfillment',
    createdAt: new Date().toISOString(),
    orderId,
    status: 'error',
    errorType: toTrimmedString(input.errorType) ?? 'print_fulfillment_error',
    errorPhase: toTrimmedString(input.errorPhase) ?? 'unknown',
    errorMessage: toTrimmedString(input.errorMessage) ?? 'Unknown error',
    qaInterior: toJsonRecord(input.qaInterior),
    qaCover: toJsonRecord(input.qaCover),
    qaFailedPages: Array.isArray(input.qaFailedPages) ? input.qaFailedPages : [],
  };
}

export async function renderW4PrintDocument(
  input: W4RenderPrintDocumentInput,
  options: W4WorkerOptions = {},
): Promise<W4RenderPrintDocumentResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? (async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const recordWorkflowEvent = options.recordWorkflowEvent ?? (async () => ({}));
  const signObjectUrl = options.signObjectUrl ?? getSignedUrlForObject;
  const pdfMonkeyApiKey =
    firstString(options.pdfMonkeyApiKey, toJsonRecord(toJsonRecord(input.CONFIG).pdfMonkey).token, process.env.PDFMONKEY_API_KEY) ?? '';
  if (!pdfMonkeyApiKey) {
    throw new Error('PDFMONKEY_API_KEY is not configured');
  }

  const orderId = resolveOrderId(input);
  if (!orderId) {
    throw new Error('W4 print render requires orderId');
  }
  const amazonOrderId = resolveAmazonOrderId(input, orderId);
  const rootOrderId = resolveRootOrderId(input, amazonOrderId, orderId);
  const backendUrl = resolveBackendUrl(input, options.defaultBackendUrl);
  const workflowJobId =
    typeof input.workflowJobId === 'number' && Number.isFinite(input.workflowJobId)
      ? input.workflowJobId
      : null;
  const workflowAttemptId =
    typeof input.workflowAttemptId === 'number' && Number.isFinite(input.workflowAttemptId)
      ? input.workflowAttemptId
      : null;
  const workflowJobIdempotencyKey = toTrimmedString(input.workflowJobIdempotencyKey);
  const maxPollAttempts = toPositiveInteger(input.maxPollAttempts) ?? options.maxPollAttempts ?? 40;
  const pollIntervalMs = toPositiveInteger(input.pollIntervalMs) ?? options.pollIntervalMs ?? 1500;
  const maxPollRequestErrors = options.maxPollRequestErrors ?? 3;
  const allowIncomplete = toBoolean(input.allowIncomplete);

  const basePayload = input.documentKind === 'cover-pdf'
    ? {
        filename: resolveCoverFilename(input, orderId),
        templateId: resolveCoverTemplateId(input),
        htmlKey: 'cover_html',
        html: await presignHtmlAssetRefs(buildCoverHtml(input), signObjectUrl),
      }
    : {
        filename: resolveInteriorFilename(input, orderId),
        templateId: resolveInteriorTemplateId(input),
        htmlKey: 'pages_html',
        html: await presignHtmlAssetRefs(buildInteriorHtml(input), signObjectUrl),
      };

  const createPayload = {
    document: {
      document_template_id: basePayload.templateId,
      status: 'pending',
      meta: { _filename: basePayload.filename },
      payload: {
        [basePayload.htmlKey]: basePayload.html,
      },
    },
  };

  const createResponse = await requestJson(fetchImpl, PDFMONKEY_DOCUMENTS_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pdfMonkeyApiKey}`,
    },
    body: JSON.stringify(createPayload),
  });

  const createdDocument = toDocumentRecord(
    createResponse.data ?? createResponse.document ?? createResponse,
  );
  const documentId = toTrimmedString(
    createdDocument.id ?? createdDocument.document_id ?? toJsonRecord(createdDocument.data).id,
  );
  if (!documentId) {
    throw new Error('PDFMonkey create response missing id');
  }

  const statusUrl = `${PDFMONKEY_DOCUMENTS_API}/${documentId}`;
  let currentDocument = createdDocument;
  let status = toTrimmedString(createdDocument.status) ?? 'queued';
  let downloadUrl =
    toTrimmedString(createdDocument.download_url) ??
    toTrimmedString(createdDocument.file_url);
  let attempts = 0;
  let consecutivePollRequestErrors = 0;

  const externalContext =
    input.documentKind === 'cover-pdf'
      ? { documentKind: input.documentKind, coverPdfR2Key: toTrimmedString(input.coverPdfR2Key) }
      : { documentKind: input.documentKind, pdfR2Key: toTrimmedString(input.pdfR2Key) };

  const logEvent = async (body: JsonRecord): Promise<W4WorkflowEventResult | null> => {
    if (!workflowJobId && !workflowJobIdempotencyKey) {
      return null;
    }

    const response = await recordWorkflowEvent({
      jobId: workflowJobId ?? undefined,
      idempotencyKey: workflowJobIdempotencyKey ?? undefined,
      attemptId: workflowAttemptId,
      externalProvider: 'pdfmonkey',
      externalRequestId: documentId,
      externalStatusUrl: statusUrl,
      ...body,
    });

    return response as unknown as W4WorkflowEventResult;
  };

  let submitLog: W4WorkflowEventResult | null = null;
  let lastPollLog: W4WorkflowEventResult | null = null;

  try {
    submitLog = await logEvent({
      eventType: 'provider-submitted',
      jobStatus: 'polling',
      attemptStatus: 'polling',
      payload: {
        orderId,
        ...externalContext,
      },
      context: buildPrintContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
        ...externalContext,
        pdfMonkeyStatus: status,
      }),
    });

    while (attempts < maxPollAttempts) {
      if (status === 'success' && downloadUrl) {
        break;
      }

      let polled: JsonRecord;
      try {
        polled = await requestJson(fetchImpl, statusUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${pdfMonkeyApiKey}`,
          },
        });
        consecutivePollRequestErrors = 0;
      } catch (error) {
        consecutivePollRequestErrors += 1;
        if (consecutivePollRequestErrors > maxPollRequestErrors) {
          throw new Error(
            `PDFMonkey ${input.documentKind} poll request failed after ${consecutivePollRequestErrors} consecutive transport errors: ${getErrorMessage(error)}`,
          );
        }
        await sleep(pollIntervalMs);
        continue;
      }

      currentDocument = toDocumentRecord(polled.data ?? polled.document ?? polled);
      status = toTrimmedString(currentDocument.status) ?? status;
      downloadUrl =
        toTrimmedString(currentDocument.download_url) ??
        toTrimmedString(currentDocument.file_url) ??
        downloadUrl;
      attempts += 1;

      lastPollLog = await logEvent({
        eventType: 'poll-tick',
        jobStatus: 'polling',
        attemptStatus: 'polling',
        payload: {
          orderId,
          ...externalContext,
          pollAttempt: attempts,
          pdfMonkeyStatus: status ?? null,
        },
        context: buildPrintContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
          ...externalContext,
          pollAttempt: attempts,
          pdfMonkeyStatus: status,
        }),
      });

      if (status === 'error' || status === 'failure') {
        throw new Error(`PDFMonkey ${input.documentKind} polling failed (status=${status})`);
      }

      if (status === 'success' && downloadUrl) {
        break;
      }

      await sleep(pollIntervalMs);
    }

    if (status !== 'success' || !downloadUrl) {
      if (allowIncomplete) {
        return {
          ...input,
          documentKind: input.documentKind,
          orderId,
          amazonOrderId,
          rootOrderId,
          backendUrl,
          document: currentDocument,
          pdfMonkeyStatus: status,
          pdfMonkeyPollAttempts: attempts,
          workflowLogEvent: {
            submitted: submitLog,
            polled: lastPollLog,
          },
          pdfMonkeyStatusUrl: statusUrl,
          pdfMonkeyDocumentId: input.documentKind === 'interior-pdf' ? documentId : null,
          pdfMonkeyCoverDocumentId: input.documentKind === 'cover-pdf' ? documentId : null,
          pdfDownloadUrl: input.documentKind === 'interior-pdf' ? downloadUrl : null,
          coverPdfDownloadUrl: input.documentKind === 'cover-pdf' ? downloadUrl : null,
          ...(input.documentKind === 'interior-pdf'
            ? { pages_html: basePayload.html }
            : { cover_html: basePayload.html }),
        };
      }
      throw new Error(`PDFMonkey ${input.documentKind} not ready after polling (status=${status})`);
    }

    await logEvent({
      eventType: 'provider-complete',
      payload: {
        orderId,
        ...externalContext,
        pdfMonkeyStatus: status,
      },
      context: buildPrintContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
        ...externalContext,
        pdfMonkeyStatus: status,
      }),
    });

    return {
      ...input,
      documentKind: input.documentKind,
      orderId,
      amazonOrderId,
      rootOrderId,
      backendUrl,
      document: currentDocument,
      pdfMonkeyStatus: status,
      pdfMonkeyPollAttempts: attempts,
      workflowLogEvent: {
        submitted: submitLog,
        polled: lastPollLog,
      },
      pdfMonkeyStatusUrl: statusUrl,
      pdfMonkeyDocumentId: input.documentKind === 'interior-pdf' ? documentId : null,
      pdfMonkeyCoverDocumentId: input.documentKind === 'cover-pdf' ? documentId : null,
      pdfDownloadUrl: input.documentKind === 'interior-pdf' ? downloadUrl : null,
      coverPdfDownloadUrl: input.documentKind === 'cover-pdf' ? downloadUrl : null,
      ...(input.documentKind === 'interior-pdf' ? { pages_html: basePayload.html } : { cover_html: basePayload.html }),
    };
  } catch (error) {
    const message = getErrorMessage(error);
    await logEvent({
      eventType: 'provider-failed',
      jobStatus: 'failed',
      attemptStatus: 'failed',
      lastError: {
        message,
        orderId,
        ...externalContext,
        pollAttempt: attempts || null,
        pdfMonkeyStatus: status || null,
      },
      payload: {
        orderId,
        ...externalContext,
        pollAttempt: attempts || null,
        pdfMonkeyStatus: status || null,
      },
      context: buildPrintContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
        ...externalContext,
        errorMessage: message,
        pdfMonkeyStatus: status,
        pollAttempt: attempts,
      }),
    });
    throw error;
  }
}

export async function pollW4PrintDocument(
  input: W4RenderPrintDocumentInput,
  options: W4WorkerOptions = {},
): Promise<W4PollPrintDocumentResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const recordWorkflowEvent = options.recordWorkflowEvent ?? (async () => ({}));
  const pdfMonkeyApiKey =
    toTrimmedString(options.pdfMonkeyApiKey) ??
    toTrimmedString(process.env.PDFMONKEY_API_KEY);
  if (!pdfMonkeyApiKey) {
    throw new Error('PDFMONKEY_API_KEY is not configured');
  }

  const documentKind = input.documentKind === 'cover-pdf' ? 'cover-pdf' : 'interior-pdf';
  const orderId = resolveOrderId(input);
  if (!orderId) {
    throw new Error('W4 print poll requires orderId');
  }
  const amazonOrderId = resolveAmazonOrderId(input, orderId);
  const rootOrderId = resolveRootOrderId(input, amazonOrderId, orderId);
  const backendUrl = resolveBackendUrl(input, options.defaultBackendUrl);
  const workflowJobId =
    typeof input.workflowJobId === 'number' && Number.isFinite(input.workflowJobId)
      ? input.workflowJobId
      : null;
  const workflowAttemptId =
    typeof input.workflowAttemptId === 'number' && Number.isFinite(input.workflowAttemptId)
      ? input.workflowAttemptId
      : null;
  const workflowJobIdempotencyKey = toTrimmedString(input.workflowJobIdempotencyKey);
  const maxPollAttempts = toPositiveInteger(input.maxPollAttempts) ?? options.maxPollAttempts ?? 30;
  const pollIntervalMs = toPositiveInteger(input.pollIntervalMs) ?? options.pollIntervalMs ?? 1500;
  const maxPollRequestErrors = options.maxPollRequestErrors ?? 3;
  const allowIncomplete = toBoolean(input.allowIncomplete);

  const documentId =
    firstString(
      documentKind === 'cover-pdf' ? input.pdfMonkeyCoverDocumentId : input.pdfMonkeyDocumentId,
      input.pdfMonkeyDocumentId,
      input.pdfMonkeyCoverDocumentId,
    ) ?? null;
  if (!documentId) {
    throw new Error(`W4 ${documentKind} poll requires pdfMonkey document id`);
  }

  const statusUrl =
    firstString(input.pdfMonkeyStatusUrl, `${PDFMONKEY_DOCUMENTS_API}/${documentId}`) ??
    `${PDFMONKEY_DOCUMENTS_API}/${documentId}`;
  let currentDocument = toDocumentRecord(input.document);
  let status = firstString(input.pdfMonkeyStatus, currentDocument.status, 'queued') ?? 'queued';
  let downloadUrl =
    firstString(
      documentKind === 'cover-pdf' ? input.coverPdfDownloadUrl : input.pdfDownloadUrl,
      input.pdfDownloadUrl,
      input.coverPdfDownloadUrl,
      currentDocument.download_url,
      currentDocument.file_url,
    ) ?? null;
  let attempts = toPositiveInteger(input.pdfMonkeyPollAttempts) ?? 0;
  let consecutivePollRequestErrors = 0;

  const externalContext =
    documentKind === 'cover-pdf'
      ? { documentKind, coverPdfR2Key: toTrimmedString(input.coverPdfR2Key) }
      : { documentKind, pdfR2Key: toTrimmedString(input.pdfR2Key) };

  const logEvent = async (body: JsonRecord): Promise<W4WorkflowEventResult | null> => {
    if (!workflowJobId && !workflowJobIdempotencyKey) {
      return null;
    }

    const response = await recordWorkflowEvent({
      jobId: workflowJobId ?? undefined,
      idempotencyKey: workflowJobIdempotencyKey ?? undefined,
      attemptId: workflowAttemptId,
      externalProvider: 'pdfmonkey',
      externalRequestId: documentId,
      externalStatusUrl: statusUrl,
      ...body,
    });

    return response as unknown as W4WorkflowEventResult;
  };

  let lastPollLog: W4WorkflowEventResult | null = null;

  try {
    while (attempts < maxPollAttempts) {
      if (status === 'success' && downloadUrl) {
        break;
      }

      let polled: JsonRecord;
      try {
        polled = await requestJson(fetchImpl, statusUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${pdfMonkeyApiKey}`,
          },
        });
        consecutivePollRequestErrors = 0;
      } catch (error) {
        consecutivePollRequestErrors += 1;
        if (consecutivePollRequestErrors > maxPollRequestErrors) {
          throw new Error(
            `PDFMonkey ${documentKind} poll request failed after ${consecutivePollRequestErrors} consecutive transport errors: ${getErrorMessage(error)}`,
          );
        }
        await sleep(pollIntervalMs);
        continue;
      }

      currentDocument = toDocumentRecord(polled.data ?? polled.document ?? polled);
      status = toTrimmedString(currentDocument.status) ?? status;
      downloadUrl =
        toTrimmedString(currentDocument.download_url) ??
        toTrimmedString(currentDocument.file_url) ??
        downloadUrl;
      attempts += 1;

      lastPollLog = await logEvent({
        eventType: 'poll-tick',
        jobStatus: 'polling',
        attemptStatus: 'polling',
        payload: {
          orderId,
          ...externalContext,
          pollAttempt: attempts,
          pdfMonkeyStatus: status ?? null,
        },
        context: buildPrintContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
          ...externalContext,
          pollAttempt: attempts,
          pdfMonkeyStatus: status,
        }),
      });

      if (status === 'error' || status === 'failure') {
        throw new Error(`PDFMonkey ${documentKind} polling failed (status=${status})`);
      }

      if (status === 'success' && downloadUrl) {
        break;
      }

      await sleep(pollIntervalMs);
    }

    if (status !== 'success' || !downloadUrl) {
      if (allowIncomplete) {
        return {
          ...input,
          documentKind,
          orderId,
          amazonOrderId,
          rootOrderId,
          backendUrl,
          document: currentDocument,
          pdfMonkeyStatus: status,
          pdfMonkeyPollAttempts: attempts,
          workflowLogEvent: {
            submitted: null,
            polled: lastPollLog,
          },
          pdfMonkeyStatusUrl: statusUrl,
          pdfMonkeyDocumentId: documentKind === 'interior-pdf' ? documentId : null,
          pdfMonkeyCoverDocumentId: documentKind === 'cover-pdf' ? documentId : null,
          pdfDownloadUrl: documentKind === 'interior-pdf' ? downloadUrl : null,
          coverPdfDownloadUrl: documentKind === 'cover-pdf' ? downloadUrl : null,
        };
      }
      throw new Error(`PDFMonkey ${documentKind} not ready after polling (status=${status})`);
    }

    await logEvent({
      eventType: 'provider-complete',
      payload: {
        orderId,
        ...externalContext,
        pdfMonkeyStatus: status,
      },
      context: buildPrintContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
        ...externalContext,
        pdfMonkeyStatus: status,
      }),
    });

    return {
      ...input,
      documentKind,
      orderId,
      amazonOrderId,
      rootOrderId,
      backendUrl,
      document: currentDocument,
      pdfMonkeyStatus: status,
      pdfMonkeyPollAttempts: attempts,
      workflowLogEvent: {
        submitted: null,
        polled: lastPollLog,
      },
      pdfMonkeyStatusUrl: statusUrl,
      pdfMonkeyDocumentId: documentKind === 'interior-pdf' ? documentId : null,
      pdfMonkeyCoverDocumentId: documentKind === 'cover-pdf' ? documentId : null,
      pdfDownloadUrl: documentKind === 'interior-pdf' ? downloadUrl : null,
      coverPdfDownloadUrl: documentKind === 'cover-pdf' ? downloadUrl : null,
    };
  } catch (error) {
    const message = getErrorMessage(error);
    await logEvent({
      eventType: 'provider-failed',
      jobStatus: 'failed',
      attemptStatus: 'failed',
      lastError: {
        message,
        orderId,
        ...externalContext,
        pollAttempt: attempts || null,
        pdfMonkeyStatus: status || null,
      },
      payload: {
        orderId,
        ...externalContext,
        pollAttempt: attempts || null,
        pdfMonkeyStatus: status || null,
      },
      context: buildPrintContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
        ...externalContext,
        pollAttempt: attempts,
        pdfMonkeyStatus: status,
      }),
    });
    throw error;
  }
}

export async function materializeW4PrintPdf(
  input: W4MaterializePrintPdfInput,
  options: W4WorkerOptions = {},
): Promise<W4MaterializePrintPdfResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headObjectImpl = options.headObjectImpl ?? headObject;
  const putObjectImpl = options.putObjectImpl ?? putObject;
  const recordWorkflowEvent = options.recordWorkflowEvent ?? (async () => ({}));
  const documentKind = input.documentKind === 'cover-pdf' ? 'cover-pdf' : 'interior-pdf';
  const orderId = resolveOrderId(input);
  if (!orderId) {
    throw new Error('W4 materialize print pdf requires orderId');
  }
  const amazonOrderId = resolveAmazonOrderId(input, orderId);
  const rootOrderId = resolveRootOrderId(input, amazonOrderId, orderId);
  const backendUrl = resolveBackendUrl(input, options.defaultBackendUrl);
  const workflowJobId =
    typeof input.workflowJobId === 'number' && Number.isFinite(input.workflowJobId)
      ? input.workflowJobId
      : null;
  const workflowAttemptId =
    typeof input.workflowAttemptId === 'number' && Number.isFinite(input.workflowAttemptId)
      ? input.workflowAttemptId
      : null;
  const workflowJobIdempotencyKey = toTrimmedString(input.workflowJobIdempotencyKey);
  const downloadUrl =
    firstString(
      documentKind === 'cover-pdf' ? input.coverPdfDownloadUrl : input.pdfDownloadUrl,
      input.pdfDownloadUrl,
      input.coverPdfDownloadUrl,
    ) ?? '';
  const r2Key =
    firstString(
      documentKind === 'cover-pdf' ? input.coverPdfR2Key : input.pdfR2Key,
      input.pdfR2Key,
      input.coverPdfR2Key,
    ) ?? '';

  if (!downloadUrl || !r2Key) {
    throw new Error(`W4 ${documentKind} materialization requires downloadUrl and r2Key`);
  }

  const uploadBucket = getBucketFromKey(r2Key);
  const publicUrl = `${backendUrl}/api/assets/${r2Key}`;
  const shouldSkipUploadForDryRun = toBoolean(input.productionDryRun);

  const logEvent = async (body: JsonRecord): Promise<W4WorkflowEventResult | null> => {
    if (!workflowJobId && !workflowJobIdempotencyKey) {
      return null;
    }

    const response = await recordWorkflowEvent({
      jobId: workflowJobId ?? undefined,
      idempotencyKey: workflowJobIdempotencyKey ?? undefined,
      attemptId: workflowAttemptId,
      externalProvider: 'r2',
      ...body,
    });

    return response as unknown as W4WorkflowEventResult;
  };

  try {
    if (shouldSkipUploadForDryRun) {
      const uploadedAt = new Date().toISOString();
      const materialized = await logEvent({
        eventType: 'artifact-materialization-skipped',
        payload: {
          orderId,
          documentKind,
          r2Key,
          sourceUrl: downloadUrl,
          reason: 'production_dry_run_direct_url',
        },
        context: buildPrintContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
          documentKind,
          r2Key,
          sourceUrl: downloadUrl,
          materializationSkipped: true,
        }),
      });

      return {
        ...input,
        documentKind,
        orderId,
        amazonOrderId,
        rootOrderId,
        backendUrl,
        uploadBucket,
        r2Key,
        byteSize: 0,
        contentType: 'application/pdf',
        uploadedAt,
        materializationSkipped: true,
        workflowLogEvent: {
          materialized,
        },
        pdfR2Key: documentKind === 'interior-pdf' ? r2Key : toTrimmedString(input.pdfR2Key),
        coverPdfR2Key: documentKind === 'cover-pdf' ? r2Key : toTrimmedString(input.coverPdfR2Key),
        pdfUrl: documentKind === 'interior-pdf' ? downloadUrl : toTrimmedString(input.pdfUrl),
        coverPdfUrl:
          documentKind === 'cover-pdf' ? downloadUrl : toTrimmedString(input.coverPdfUrl),
      };
    }

    const existingObject = await headObjectImpl(uploadBucket, r2Key);
    if (existingObject.ok) {
      const contentType = existingObject.headers.get('content-type') || 'application/pdf';
      const byteSize = Number.parseInt(existingObject.headers.get('content-length') || '0', 10);
      const uploadedAt = new Date().toISOString();
      const materialized = await logEvent({
        eventType: 'artifact-materialized',
        payload: {
          orderId,
          documentKind,
          r2Key,
          byteSize: Number.isFinite(byteSize) ? byteSize : 0,
          reusedExisting: true,
        },
        context: buildPrintContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
          documentKind,
          r2Key,
          byteSize: Number.isFinite(byteSize) ? byteSize : 0,
          reusedExisting: true,
        }),
      });

      return {
        ...input,
        documentKind,
        orderId,
        amazonOrderId,
        rootOrderId,
        backendUrl,
        uploadBucket,
        r2Key,
        byteSize: Number.isFinite(byteSize) ? byteSize : 0,
        contentType,
        uploadedAt,
        reusedExisting: true,
        workflowLogEvent: {
          materialized,
        },
        pdfR2Key: documentKind === 'interior-pdf' ? r2Key : toTrimmedString(input.pdfR2Key),
        coverPdfR2Key: documentKind === 'cover-pdf' ? r2Key : toTrimmedString(input.coverPdfR2Key),
        pdfUrl: documentKind === 'interior-pdf' ? publicUrl : null,
        coverPdfUrl: documentKind === 'cover-pdf' ? publicUrl : null,
      };
    }

    const response = await fetchImpl(downloadUrl);
    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`);
    }

    const contentType = response.headers.get('content-type') || 'application/pdf';
    let byteSize = Number.parseInt(response.headers.get('content-length') || '0', 10);
    if (response.body) {
      let streamedBytes = 0;
      const countingStream = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            streamedBytes += chunk.byteLength;
            controller.enqueue(chunk);
          },
        }),
      );
      await putObjectImpl(uploadBucket, r2Key, countingStream, contentType);
      if (!Number.isFinite(byteSize) || byteSize <= 0) {
        byteSize = streamedBytes;
      }
    } else {
      const bytes = new Uint8Array(await response.arrayBuffer());
      byteSize = bytes.byteLength;
      await putObjectImpl(uploadBucket, r2Key, bytes, contentType);
    }

    const uploadedAt = new Date().toISOString();
    const materialized = await logEvent({
      eventType: 'artifact-materialized',
      payload: {
        orderId,
        documentKind,
        r2Key,
        byteSize,
      },
      context: buildPrintContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
        documentKind,
        r2Key,
        byteSize,
      }),
    });

    return {
      ...input,
      documentKind,
      orderId,
      amazonOrderId,
      rootOrderId,
      backendUrl,
      uploadBucket,
      r2Key,
      byteSize,
      contentType,
      uploadedAt,
      workflowLogEvent: {
        materialized,
      },
      pdfR2Key: documentKind === 'interior-pdf' ? r2Key : toTrimmedString(input.pdfR2Key),
      coverPdfR2Key: documentKind === 'cover-pdf' ? r2Key : toTrimmedString(input.coverPdfR2Key),
      pdfUrl: documentKind === 'interior-pdf' ? publicUrl : null,
      coverPdfUrl: documentKind === 'cover-pdf' ? publicUrl : null,
    };
  } catch (error) {
    const message = getErrorMessage(error);
    await logEvent({
      eventType: 'artifact-materialization-failed',
      jobStatus: 'failed',
      attemptStatus: 'failed',
      lastError: {
        message,
        orderId,
        documentKind,
        r2Key,
      },
      payload: {
        orderId,
        documentKind,
        r2Key,
      },
      context: buildPrintContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
        documentKind,
        r2Key,
        errorMessage: message,
      }),
    });
    throw error;
  }
}

export async function runW4PrintQa(
  input: W4RunPrintQaInput,
  options: W4WorkerOptions = {},
): Promise<W4RunPrintQaResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const signObjectUrl = options.signObjectUrl ?? getSignedUrlForObject;
  const recordWorkflowEvent = options.recordWorkflowEvent ?? (async () => ({}));
  const orderId = resolveOrderId(input);
  if (!orderId) {
    throw new Error('W4 print QA requires orderId');
  }
  const amazonOrderId = resolveAmazonOrderId(input, orderId);
  const rootOrderId = resolveRootOrderId(input, amazonOrderId, orderId);
  const backendUrl = resolveBackendUrl(input, options.defaultBackendUrl);
  const workflowJobId =
    typeof input.workflowJobId === 'number' && Number.isFinite(input.workflowJobId)
      ? input.workflowJobId
      : null;
  const workflowAttemptId =
    typeof input.workflowAttemptId === 'number' && Number.isFinite(input.workflowAttemptId)
      ? input.workflowAttemptId
      : null;
  const workflowJobIdempotencyKey = toTrimmedString(input.workflowJobIdempotencyKey);
  const rendererConfig = toJsonRecord(toJsonRecord(input.CONFIG).renderer);
  const rendererApiBase =
    firstString(options.rendererApiBase, rendererConfig.apiBase) ?? '';
  const rendererInternalToken =
    firstString(options.rendererInternalToken, rendererConfig.internalToken) ?? '';
  if (!rendererApiBase || !rendererInternalToken) {
    throw new Error('W4 print QA requires renderer apiBase and internalToken');
  }

  const allowDirectPdfUrls = toBoolean(input.productionDryRun);
  const pdfR2Key = toTrimmedString(input.pdfR2Key);
  const coverPdfR2Key = toTrimmedString(input.coverPdfR2Key);
  const directInteriorUrl = firstString(input.pdfUrl, input.pdfDownloadUrl);
  const directCoverUrl = firstString(input.coverPdfUrl, input.coverPdfDownloadUrl);
  const interiorSignedUrl =
    allowDirectPdfUrls && directInteriorUrl
      ? directInteriorUrl
      : pdfR2Key
        ? await resolvePdfRefSignedUrl(pdfR2Key, signObjectUrl)
        : null;
  const coverSignedUrl =
    allowDirectPdfUrls && directCoverUrl
      ? directCoverUrl
      : coverPdfR2Key
        ? await resolvePdfRefSignedUrl(coverPdfR2Key, signObjectUrl)
        : null;
  if (!interiorSignedUrl || !coverSignedUrl) {
    throw new Error('W4 print QA requires interior and cover PDF references');
  }
  const pageImageUrls = Array.isArray(input.pageImageUrls) ? input.pageImageUrls : [];
  const interiorPreviewImageUrls = await Promise.all(
    pageImageUrls.map((reference) => signPreviewReference(reference, signObjectUrl)),
  );
  const coverPreviewUrl = toTrimmedString(input.coverPreviewUrl);
  if (!coverPreviewUrl) {
    throw new Error('W4 print QA requires coverPreviewUrl');
  }
  const coverPreviewImageUrls = [await signPreviewReference(coverPreviewUrl, signObjectUrl)];
  const pageLabels =
    Array.isArray(input.pageLabels) && input.pageLabels.length === interiorPreviewImageUrls.length
      ? input.pageLabels.map((value) => String(value))
      : Array.from({ length: interiorPreviewImageUrls.length }, (_, index) => `p${String(index).padStart(2, '0')}`);
  const expectedPageCount = toInteger(input.expectedPageCount) ?? interiorPreviewImageUrls.length;

  const logEvent = async (body: JsonRecord): Promise<W4WorkflowEventResult | null> => {
    if (!workflowJobId && !workflowJobIdempotencyKey) {
      return null;
    }

    const response = await recordWorkflowEvent({
      jobId: workflowJobId ?? undefined,
      idempotencyKey: workflowJobIdempotencyKey ?? undefined,
      attemptId: workflowAttemptId,
      externalProvider: 'renderer',
      ...body,
    });

    return response as unknown as W4WorkflowEventResult;
  };

  const requestQa = async (body: JsonRecord): Promise<JsonRecord> => {
    const response = await fetchImpl(`${rendererApiBase.replace(/\/$/, '')}/qa-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${rendererInternalToken}`,
      },
      body: JSON.stringify(body),
    });

    const payload = await parseJsonResponse(response);
    return {
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: payload,
    };
  };

  try {
    const interiorResponse = await requestQa({
      orderId,
      type: 'interior',
      pdfUrl: interiorSignedUrl,
      expectedPageCount,
      previewImageUrls: interiorPreviewImageUrls,
      pageLabels,
    });
    const qaInterior = parseRendererQaPayload('interior', interiorResponse, orderId);

    const coverResponse = await requestQa({
      orderId,
      type: 'cover',
      pdfUrl: coverSignedUrl,
      expectedPageCount: 1,
      previewImageUrls: coverPreviewImageUrls,
      pageLabels: ['cover'],
    });
    const qaCover = parseRendererQaPayload('cover', coverResponse, orderId);

    const qaPassed = Boolean(qaInterior.passed) && Boolean(qaCover.passed);
    const qaFailedPages = [
      ...(Array.isArray(qaInterior.failedPages) ? qaInterior.failedPages : []),
      ...(Array.isArray(qaCover.failedPages) ? qaCover.failedPages : []),
    ];

    const qaRecorded = await logEvent(
      qaPassed
        ? {
            eventType: 'qa-passed',
            payload: {
              orderId,
              qaPassed: true,
            },
            context: buildPrintContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
              qaPassed: true,
            }),
          }
        : {
            eventType: 'qa-failed',
            jobStatus: 'failed',
            attemptStatus: 'failed',
            lastError: {
              message: `[W4 QA] Failed before Lulu submit`,
              orderId,
              qaInterior,
              qaCover,
              qaFailedPages,
            },
            payload: {
              orderId,
              qaPassed: false,
              qaFailedPages,
              qaInterior,
              qaCover,
            },
            context: buildPrintContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
              qaPassed: false,
              qaFailedPages,
            }),
          },
    );

    return {
      ...input,
      orderId,
      amazonOrderId,
      rootOrderId,
      backendUrl,
      interiorSignedUrl,
      coverSignedUrl,
      interiorPreviewImageUrls,
      coverPreviewImageUrls,
      qaInterior,
      qaCover,
      qaPassed,
      qaFailedPages,
      workflowLogEvent: {
        qaRecorded,
      },
    };
  } catch (error) {
    const message = getErrorMessage(error);
    await logEvent({
      eventType: 'qa-provider-failed',
      jobStatus: 'failed',
      attemptStatus: 'failed',
      lastError: {
        message,
        orderId,
      },
      payload: {
        orderId,
      },
      context: buildPrintContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
        errorMessage: message,
      }),
    });
    throw error;
  }
}

export async function publishW4PrintManifest(
  input: PublishW4PrintManifestInput,
  options: W4WorkerOptions = {},
): Promise<PublishW4PrintManifestResult> {
  const putObjectImpl = options.putObjectImpl ?? putObject;
  const updateOrderImpl = options.updateOrderImpl ?? updateOrderInSupabase;
  const recordWorkflowEvent = options.recordWorkflowEvent ?? (async () => ({}));
  const orderId = resolveOrderId(input);
  if (!orderId) {
    throw new Error('W4 publish manifest requires orderId');
  }
  const amazonOrderId = resolveAmazonOrderId(input, orderId);
  const rootOrderId = resolveRootOrderId(input, amazonOrderId, orderId);
  const backendUrl = resolveBackendUrl(input, options.defaultBackendUrl);
  const workflowJobId =
    typeof input.workflowJobId === 'number' && Number.isFinite(input.workflowJobId)
      ? input.workflowJobId
      : null;
  const workflowAttemptId =
    typeof input.workflowAttemptId === 'number' && Number.isFinite(input.workflowAttemptId)
      ? input.workflowAttemptId
      : null;
  const workflowJobIdempotencyKey = toTrimmedString(input.workflowJobIdempotencyKey);

  const manifestStatus = String(input.manifestStatus || 'submitted').trim().toLowerCase() === 'error'
    ? 'error'
    : 'submitted';
  const manifestKey = resolveManifestKey(input, orderId, manifestStatus);
  const manifestUrl = `${backendUrl}/api/manifests/${manifestKey}`;
  const manifest =
    manifestStatus === 'error'
      ? buildErrorManifest(input, orderId)
      : buildSuccessManifest(input, orderId);

  const logEvent = async (body: JsonRecord): Promise<W4WorkflowEventResult | null> => {
    if (!workflowJobId && !workflowJobIdempotencyKey) {
      return null;
    }

    const response = await recordWorkflowEvent({
      jobId: workflowJobId ?? undefined,
      idempotencyKey: workflowJobIdempotencyKey ?? undefined,
      attemptId: workflowAttemptId,
      externalProvider: manifestStatus === 'error' ? 'workflow' : 'r2',
      ...body,
    });

    return response as unknown as W4WorkflowEventResult;
  };

  await putObjectImpl(
    R2_ORDERS_BUCKET,
    manifestKey,
    JSON.stringify(manifest, null, 2),
    'application/json',
  );

  let orderUpdateApplied = false;
  const supabasePatch = normalizeManifestSupabasePatch(toJsonRecord(input.supabasePatch), input);
  if (Object.keys(supabasePatch).length > 0) {
    const result = await updateOrderImpl(orderId, supabasePatch);
    orderUpdateApplied = Boolean(result);
  }

  const manifestRecorded = await logEvent(
    manifestStatus === 'error'
      ? {
          eventType: 'error-manifest-published',
          jobStatus: 'failed',
          attemptStatus: 'failed',
          lastError: {
            message: String(manifest.errorMessage || 'W4 print failure recorded'),
            orderId,
            manifestKey,
          },
          payload: {
            orderId,
            manifestKey,
            manifestStatus,
          },
          context: buildPrintContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
            manifestKey,
            manifestStatus,
          }),
        }
      : {
          eventType: 'manifest-published',
          payload: {
            orderId,
            manifestKey,
            manifestStatus,
          },
          context: buildPrintContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
            manifestKey,
            manifestStatus,
          }),
        },
  );

  return {
    ...input,
    orderId,
    amazonOrderId,
    rootOrderId,
    backendUrl,
    manifestStatus,
    manifest,
    manifestKey,
    manifestUrl,
    manifestBucket: R2_ORDERS_BUCKET,
    uploadBucket: R2_ORDERS_BUCKET,
    manifestReady: true,
    orderUpdateApplied,
    workflowLogEvent: {
      manifestRecorded,
    },
  };
}
