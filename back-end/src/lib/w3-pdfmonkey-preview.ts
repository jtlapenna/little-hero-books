import { inferBookIdFromPathLikes } from '@/lib/order-paths';
import { resolveCanonicalBackendBaseUrl } from '@/lib/backend-url';

type JsonRecord = Record<string, unknown>;

export type W3PreviewDocumentKind = 'page-preview' | 'cover-preview';

export interface W3RenderPreviewDocumentInput extends JsonRecord {
  documentKind: W3PreviewDocumentKind;
  orderId?: string | null;
  amazonOrderId?: string | null;
  rootOrderId?: string | null;
  backendUrl?: string | null;
  workflowJobId?: number | null;
  workflowJobIdempotencyKey?: string | null;
  workflowAttemptId?: number | null;
  pageNumber?: number | null;
  pageHtml?: string | null;
  page_css?: string | null;
  pageImageFilename?: string | null;
  pageImageR2Key?: string | null;
  coverHTML?: string | null;
  cover_html?: string | null;
  coverPngFilename?: string | null;
  coverPngR2Key?: string | null;
  coverImageR2Key?: string | null;
  orderR2BaseKey?: string | null;
  bookId?: string | null;
  useImgBackgrounds?: boolean | null;
  pdfMonkeyTemplateId?: string | null;
  pdfMonkeyImageTemplateId?: string | null;
  pdfMonkeyCoverTemplateId?: string | null;
}

export type W3RenderPreviewWorkflowEvent = {
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

export type W3RenderPreviewDocumentResult = JsonRecord & {
  documentKind: W3PreviewDocumentKind;
  orderId: string;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  backendUrl: string;
  pdfMonkeyStatus: string;
  pdfMonkeyPollAttempts: number;
  workflowLogEvent: {
    submitted: W3RenderPreviewWorkflowEvent | null;
    polled: W3RenderPreviewWorkflowEvent | null;
  };
  document: JsonRecord;
  pageImageDownloadUrl?: string;
  coverPngDownloadUrl?: string;
  pageImageR2Key?: string | null;
  coverPngR2Key?: string | null;
  pageNumber?: number | null;
  pdfMonkeyImageDocumentId?: string;
  pdfMonkeyImageStatusUrl?: string;
  pdfMonkeyCoverDocumentId?: string;
  pdfMonkeyCoverStatusUrl?: string;
  coverDocument?: JsonRecord;
};

type PdfMonkeyFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface W3RenderPreviewDocumentOptions {
  defaultBackendUrl?: string;
  pdfMonkeyApiKey?: string;
  fetchImpl?: PdfMonkeyFetch;
  sleep?: (ms: number) => Promise<void>;
  recordWorkflowEvent?: (body: JsonRecord) => Promise<JsonRecord>;
  maxPollAttempts?: number;
  pollIntervalMs?: number;
  maxPollRequestErrors?: number;
}

const PDFMONKEY_DOCUMENTS_API = 'https://api.pdfmonkey.io/api/v1/documents';
const DEFAULT_PAGE_TEMPLATE_ID = '23277725-4AB0-446A-98C5-CB99C21822B3';
const DEFAULT_COVER_TEMPLATE_ID = 'D0F07D93-9267-47BB-A6AF-D6EC5ACDF476';

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

function toJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function getOrderId(input: W3RenderPreviewDocumentInput): string {
  return (
    toTrimmedString(input.orderId) ??
    toTrimmedString(input.amazonOrderId) ??
    toTrimmedString(input.rootOrderId) ??
    ''
  );
}

function getAmazonOrderId(input: W3RenderPreviewDocumentInput, orderId: string): string | null {
  return (
    toTrimmedString(input.amazonOrderId) ??
    toTrimmedString(input.rootOrderId) ??
    orderId
  );
}

function getRootOrderId(input: W3RenderPreviewDocumentInput, amazonOrderId: string | null, orderId: string): string | null {
  return (
    toTrimmedString(input.rootOrderId) ??
    amazonOrderId ??
    orderId
  );
}

function resolveBackendUrl(input: W3RenderPreviewDocumentInput, fallback?: string): string {
  return resolveCanonicalBackendBaseUrl(
    toTrimmedString(input.backendUrl),
    toTrimmedString(fallback),
  );
}

function resolvePageFileName(input: W3RenderPreviewDocumentInput, pageNumber: number | null): string {
  if (toTrimmedString(input.pageImageFilename)) {
    return input.pageImageFilename!.trim();
  }

  const pageStem = pageNumber === null ? 'p00' : `p${String(pageNumber).padStart(2, '0')}`;
  return `${pageStem}.png`;
}

function resolveCoverFileName(input: W3RenderPreviewDocumentInput): string {
  return (
    toTrimmedString(input.coverPngFilename) ??
    toTrimmedString(input.coverImageR2Key)?.split('/').pop() ??
    'cover-spread.png'
  );
}

function resolveOrderR2BaseKey(input: W3RenderPreviewDocumentInput, orderId: string): string {
  return (
    toTrimmedString(input.orderR2BaseKey) ??
    (() => {
      const bookId =
        toTrimmedString(input.bookId) ??
        inferBookIdFromPathLikes(
          toTrimmedString(input.pageImageR2Key),
          toTrimmedString(input.coverPngR2Key),
          toTrimmedString(input.coverImageR2Key),
        );
      if (!bookId) {
        throw new Error('W3 preview rendering requires bookId or per-book R2 path hints');
      }
      return `${bookId}/orders/${orderId}`;
    })()
  );
}

function resolvePageImageR2Key(input: W3RenderPreviewDocumentInput, orderId: string, pageNumber: number | null): string | null {
  return (
    toTrimmedString(input.pageImageR2Key) ??
    (() => {
      const orderR2BaseKey = resolveOrderR2BaseKey(input, orderId);
      const filename = resolvePageFileName(input, pageNumber);
      return `${orderR2BaseKey}/preview-images/${filename}`;
    })()
  );
}

function resolveCoverPngR2Key(input: W3RenderPreviewDocumentInput, orderId: string): string | null {
  return (
    toTrimmedString(input.coverPngR2Key) ??
    toTrimmedString(input.coverImageR2Key) ??
    (() => {
      const orderR2BaseKey = resolveOrderR2BaseKey(input, orderId);
      const filename = resolveCoverFileName(input);
      return `${orderR2BaseKey}/preview-images/${filename}`;
    })()
  );
}

function resolveTemplateId(input: W3RenderPreviewDocumentInput): string {
  if (input.documentKind === 'cover-preview') {
    return (
      toTrimmedString(input.pdfMonkeyCoverTemplateId) ??
      toTrimmedString(input.pdfMonkeyImageTemplateId) ??
      toTrimmedString(input.pdfMonkeyTemplateId) ??
      DEFAULT_COVER_TEMPLATE_ID
    );
  }

  return (
    toTrimmedString(input.pdfMonkeyImageTemplateId) ??
    toTrimmedString(input.pdfMonkeyTemplateId) ??
    DEFAULT_PAGE_TEMPLATE_ID
  );
}

function buildCreateDocumentPayload(input: W3RenderPreviewDocumentInput, orderId: string, amazonOrderId: string | null, rootOrderId: string | null) {
  if (input.documentKind === 'page-preview') {
    const pageNumber = toInteger(input.pageNumber);
    const fileName = resolvePageFileName(input, pageNumber);
    const pageImageR2Key = resolvePageImageR2Key(input, orderId, pageNumber);
    const pageHtml = toTrimmedString(input.pageHtml);

    if (!pageHtml) {
      throw new Error('W3 page preview render requires pageHtml');
    }
    if (!pageImageR2Key) {
      throw new Error('W3 page preview render requires pageImageR2Key');
    }

    return {
      document: {
        document_template_id: resolveTemplateId(input),
        status: 'pending',
        meta: {
          _filename: fileName,
          _type: 'png',
          _width: 2625,
          _height: 2625,
          orderId,
          amazonOrderId: amazonOrderId ?? '',
          rootOrderId: rootOrderId ?? '',
          pageImageR2Key,
        },
        payload: {
          pages_html: pageHtml,
          page_css: toTrimmedString(input.page_css) ?? '',
          page_number: pageNumber,
          page_image_r2_key: pageImageR2Key,
          order_id: orderId,
          amazon_order_id: amazonOrderId ?? '',
          root_order_id: rootOrderId ?? '',
          useImgBackgrounds: asBoolean(input.useImgBackgrounds, true),
        },
      },
      pageNumber,
      fileName,
      pageImageR2Key,
      coverPngR2Key: null,
    };
  }

  const coverHtml = toTrimmedString(input.coverHTML) ?? toTrimmedString(input.cover_html);
  const coverPngR2Key = resolveCoverPngR2Key(input, orderId);
  const fileName = resolveCoverFileName(input);

  if (!coverHtml) {
    throw new Error('W3 cover preview render requires coverHTML or cover_html');
  }
  if (!coverPngR2Key) {
    throw new Error('W3 cover preview render requires coverPngR2Key');
  }

  return {
    document: {
      document_template_id: resolveTemplateId(input),
      status: 'pending',
      meta: {
        _type: 'png',
        _width: 5203,
        _height: 2625,
        _filename: fileName,
        _kind: 'cover-png',
        orderId,
        amazonOrderId: amazonOrderId ?? '',
        rootOrderId: rootOrderId ?? '',
        coverPngR2Key,
      },
      payload: {
        pages_html: coverHtml,
        order_id: orderId,
        amazon_order_id: amazonOrderId ?? '',
        root_order_id: rootOrderId ?? '',
        cover_png_r2_key: coverPngR2Key,
      },
    },
    pageNumber: null,
    fileName,
    pageImageR2Key: null,
    coverPngR2Key,
  };
}

function parseApiResponse(text: string): JsonRecord {
  if (!text.trim()) {
    return {};
  }

  try {
    return toJsonRecord(JSON.parse(text));
  } catch {
    throw new Error(`Invalid JSON response from PDFMonkey: ${text.slice(0, 200)}`);
  }
}

async function requestPdfMonkey(
  fetchImpl: PdfMonkeyFetch,
  apiKey: string,
  url: string,
  init: RequestInit,
): Promise<JsonRecord> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PDFMonkey request failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return parseApiResponse(text);
}

function toDocumentRecord(value: unknown): JsonRecord {
  const asRecord = toJsonRecord(value);
  if (Object.keys(asRecord).length > 0) {
    return asRecord;
  }
  return {};
}

function buildContext(
  input: W3RenderPreviewDocumentInput,
  orderId: string,
  amazonOrderId: string | null,
  rootOrderId: string | null,
  backendUrl: string,
  extra: JsonRecord,
): JsonRecord {
  return {
    ...input,
    orderId,
    amazonOrderId,
    rootOrderId,
    backendUrl,
    ...extra,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function renderW3PreviewDocument(
  rawInput: W3RenderPreviewDocumentInput,
  options: W3RenderPreviewDocumentOptions = {},
): Promise<W3RenderPreviewDocumentResult> {
  const input = { ...rawInput };
  const orderId = getOrderId(input);
  if (!orderId) {
    throw new Error('W3 preview render requires orderId');
  }

  const amazonOrderId = getAmazonOrderId(input, orderId);
  const rootOrderId = getRootOrderId(input, amazonOrderId, orderId);
  const backendUrl = resolveBackendUrl(input, options.defaultBackendUrl);
  const pdfMonkeyApiKey = toTrimmedString(options.pdfMonkeyApiKey ?? process.env.PDFMONKEY_API_KEY);
  if (!pdfMonkeyApiKey) {
    throw new Error('PDFMONKEY_API_KEY is not configured');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxPollAttempts = Math.max(1, options.maxPollAttempts ?? 30);
  const pollIntervalMs = Math.max(0, options.pollIntervalMs ?? 1800);
  const maxPollRequestErrors = Math.max(0, options.maxPollRequestErrors ?? 3);
  const workflowJobId = typeof input.workflowJobId === 'number' ? input.workflowJobId : null;
  const workflowJobIdempotencyKey = toTrimmedString(input.workflowJobIdempotencyKey);
  const workflowAttemptId = typeof input.workflowAttemptId === 'number' ? input.workflowAttemptId : null;
  const recordWorkflowEvent = options.recordWorkflowEvent ?? (async () => ({}));

  const createPayload = buildCreateDocumentPayload(input, orderId, amazonOrderId, rootOrderId);
  const createResponse = await requestPdfMonkey(
    fetchImpl,
    pdfMonkeyApiKey,
    PDFMONKEY_DOCUMENTS_API,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createPayload),
    },
  );

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

  const baseContext = buildContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
    pageNumber: createPayload.pageNumber,
    pageImageR2Key: createPayload.pageImageR2Key,
    coverPngR2Key: createPayload.coverPngR2Key,
  });

  let submitLog: W3RenderPreviewWorkflowEvent | null = null;
  let lastPollLog: W3RenderPreviewWorkflowEvent | null = null;

  const documentKind = input.documentKind;
  const externalContext =
    documentKind === 'page-preview'
      ? {
          documentKind,
          pageNumber: createPayload.pageNumber,
          pageImageR2Key: createPayload.pageImageR2Key,
        }
      : {
          documentKind,
          coverPngR2Key: createPayload.coverPngR2Key,
        };

  const logEvent = async (body: JsonRecord): Promise<W3RenderPreviewWorkflowEvent | null> => {
    if (!workflowJobId && !workflowJobIdempotencyKey) {
      return null;
    }

    const response = await recordWorkflowEvent({
      jobId: workflowJobId ?? undefined,
      idempotencyKey: workflowJobIdempotencyKey ?? undefined,
      attemptId: workflowAttemptId ?? null,
      externalProvider: 'pdfmonkey',
      externalRequestId: documentId,
      externalStatusUrl: statusUrl,
      ...body,
    });

    return response as unknown as W3RenderPreviewWorkflowEvent;
  };

  try {
    submitLog = await logEvent({
      eventType: 'provider-submitted',
      jobStatus: 'polling',
      attemptStatus: 'polling',
      payload: {
        orderId,
        ...externalContext,
      },
      context: buildContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
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
        polled = await requestPdfMonkey(fetchImpl, pdfMonkeyApiKey, statusUrl, {
          method: 'GET',
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
        context: buildContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
          ...externalContext,
          pdfMonkeyStatus: status,
          pollAttempt: attempts,
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
      throw new Error(`PDFMonkey ${documentKind} not ready after polling (status=${status})`);
    }

    const result: W3RenderPreviewDocumentResult = {
      ...input,
      ...baseContext,
      documentKind,
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
    };

    if (documentKind === 'page-preview') {
      result.pageNumber = createPayload.pageNumber;
      result.pageImageR2Key = createPayload.pageImageR2Key;
      result.pageImageDownloadUrl = downloadUrl;
      result.pdfMonkeyImageDocumentId = documentId;
      result.pdfMonkeyImageStatusUrl = statusUrl;
    } else {
      result.coverPngR2Key = createPayload.coverPngR2Key;
      result.coverPngDownloadUrl = downloadUrl;
      result.pdfMonkeyCoverDocumentId = documentId;
      result.pdfMonkeyCoverStatusUrl = statusUrl;
      result.coverDocument = currentDocument;
    }

    return result;
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
      context: buildContext(input, orderId, amazonOrderId, rootOrderId, backendUrl, {
        ...externalContext,
        errorMessage: message,
        pdfMonkeyStatus: status,
        pollAttempt: attempts,
      }),
    });

    throw error;
  }
}
