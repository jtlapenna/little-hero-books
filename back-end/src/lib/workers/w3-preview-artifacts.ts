import { putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import type { W3PreviewDocumentKind } from '@/lib/w3-pdfmonkey-preview';
import { resolveCanonicalBackendBaseUrl } from '@/lib/backend-url';

type JsonRecord = Record<string, unknown>;

export interface MaterializeW3PreviewArtifactInput extends JsonRecord {
  documentKind?: W3PreviewDocumentKind;
  orderId?: string | null;
  amazonOrderId?: string | null;
  rootOrderId?: string | null;
  backendUrl?: string | null;
  pageNumber?: number | string | null;
  pageType?: string | null;
  pageImageDownloadUrl?: string | null;
  coverPngDownloadUrl?: string | null;
  pageImageR2Key?: string | null;
  coverPngR2Key?: string | null;
  pageImageFilename?: string | null;
  coverPngFilename?: string | null;
  coverImageR2Key?: string | null;
  r2Key?: string | null;
  imageUrl?: string | null;
  coverCloudflareImageId?: string | null;
  coverCloudflareImageUrl?: string | null;
  cloudflareImageId?: string | null;
  cloudflareImageUrl?: string | null;
}

export interface MaterializeW3PreviewArtifactResult extends JsonRecord {
  documentKind: W3PreviewDocumentKind;
  orderId: string;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  backendUrl: string;
  pageNumber: number;
  pageType: string;
  filename: string;
  r2Key: string;
  imageUrl: string;
  contentType: string;
  byteSize: number;
  uploadBucket: string;
  cloudflareImageId: string | null;
  cloudflareImageUrl: string | null;
  cloudflareUploaded: boolean;
  pageImageR2Key?: string | null;
  coverPngR2Key?: string | null;
  pageImageFilename?: string | null;
  coverPngFilename?: string | null;
  coverCloudflareImageId?: string | null;
  coverCloudflareImageUrl?: string | null;
}

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type PutObjectImpl = (
  bucket: string,
  key: string,
  body: Blob | ArrayBuffer | ReadableStream | Uint8Array | string,
  contentType?: string,
) => Promise<unknown>;

export interface MaterializeW3PreviewArtifactOptions {
  defaultBackendUrl?: string;
  fetchImpl?: FetchImpl;
  putObjectImpl?: PutObjectImpl;
  cloudflareAccountId?: string;
  cloudflareImagesApiToken?: string;
  cloudflareImagesAccountHash?: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

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

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = toTrimmedString(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function resolveBackendUrl(
  input: MaterializeW3PreviewArtifactInput,
  fallback?: string,
): string {
  return resolveCanonicalBackendBaseUrl(
    toTrimmedString(input.backendUrl),
    toTrimmedString(fallback),
  );
}

function resolveOrderId(input: MaterializeW3PreviewArtifactInput): string {
  return (
    firstString(input.orderId, input.amazonOrderId, input.rootOrderId) ?? ''
  );
}

function resolveAmazonOrderId(
  input: MaterializeW3PreviewArtifactInput,
  orderId: string,
): string | null {
  return firstString(input.amazonOrderId, input.rootOrderId, orderId);
}

function resolveRootOrderId(
  input: MaterializeW3PreviewArtifactInput,
  amazonOrderId: string | null,
  orderId: string,
): string | null {
  return firstString(input.rootOrderId, amazonOrderId, orderId);
}

function resolveDocumentKind(
  input: MaterializeW3PreviewArtifactInput,
): W3PreviewDocumentKind {
  return input.documentKind === 'cover-preview' ? 'cover-preview' : 'page-preview';
}

function resolveDownloadUrl(
  input: MaterializeW3PreviewArtifactInput,
  documentKind: W3PreviewDocumentKind,
): string {
  return (
    firstString(
      documentKind === 'cover-preview' ? input.coverPngDownloadUrl : input.pageImageDownloadUrl,
      input.pageImageDownloadUrl,
      input.coverPngDownloadUrl,
    ) ?? ''
  );
}

function resolveR2Key(
  input: MaterializeW3PreviewArtifactInput,
  documentKind: W3PreviewDocumentKind,
): string {
  return (
    firstString(
      documentKind === 'cover-preview' ? input.coverPngR2Key : input.pageImageR2Key,
      input.r2Key,
      input.pageImageR2Key,
      input.coverPngR2Key,
      input.coverImageR2Key,
    ) ?? ''
  );
}

function resolveFilename(
  input: MaterializeW3PreviewArtifactInput,
  documentKind: W3PreviewDocumentKind,
  r2Key: string,
): string {
  return (
    firstString(
      documentKind === 'cover-preview' ? input.coverPngFilename : input.pageImageFilename,
      input.pageImageFilename,
      input.coverPngFilename,
      r2Key.split('/').pop(),
    ) ?? (documentKind === 'cover-preview' ? 'cover-spread.png' : 'preview.png')
  );
}

function resolvePageNumber(
  input: MaterializeW3PreviewArtifactInput,
  documentKind: W3PreviewDocumentKind,
): number {
  if (documentKind === 'cover-preview') {
    return -1;
  }

  return toInteger(input.pageNumber) ?? 0;
}

function resolvePageType(
  input: MaterializeW3PreviewArtifactInput,
  documentKind: W3PreviewDocumentKind,
): string {
  return (
    toTrimmedString(input.pageType) ??
    (documentKind === 'cover-preview' ? 'cover-spread' : 'interior')
  );
}

function resolveCloudflareVariant(
  documentKind: W3PreviewDocumentKind,
): string {
  return documentKind === 'cover-preview' ? 'public' : 'preview?width=1024';
}

async function parseJsonResponse(response: Response): Promise<JsonRecord> {
  try {
    const payload = await response.json();
    return toRecord(payload);
  } catch {
    return {};
  }
}

async function uploadToCloudflare(
  input: {
    documentKind: W3PreviewDocumentKind;
    orderId: string;
    pageNumber: number;
    pageType: string;
    fileName: string;
    contentType: string;
    bytes: Uint8Array;
  },
  options: MaterializeW3PreviewArtifactOptions,
): Promise<{
  cloudflareImageId: string | null;
  cloudflareImageUrl: string | null;
}> {
  const accountId =
    options.cloudflareAccountId ??
    process.env.CLOUDFLARE_ACCOUNT_ID ??
    null;
  const apiToken =
    options.cloudflareImagesApiToken ??
    process.env.CLOUDFLARE_IMAGES_API_TOKEN ??
    null;
  const accountHash =
    options.cloudflareImagesAccountHash ??
    process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH ??
    process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH ??
    null;

  if (!accountId || !apiToken) {
    return {
      cloudflareImageId: null,
      cloudflareImageUrl: null,
    };
  }

  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const cloudflareFormData = new FormData();
    const blob = new Blob([input.bytes], { type: input.contentType });
    cloudflareFormData.append('file', blob, input.fileName);
    cloudflareFormData.append(
      'metadata',
      JSON.stringify({
        orderId: input.orderId,
        pageNumber: input.pageNumber,
        pageType: input.pageType,
        documentKind: input.documentKind,
        uploadedAt: new Date().toISOString(),
      }),
    );

    const response = await fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
        body: cloudflareFormData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(
        `[W3 Preview Artifacts] Cloudflare upload failed (${response.status}): ${errorText}`,
      );
      return {
        cloudflareImageId: null,
        cloudflareImageUrl: null,
      };
    }

    const payload = await parseJsonResponse(response);
    const result = toRecord(payload.result);
    const images = Array.isArray(result.images)
      ? result.images.map(toRecord)
      : [];
    const cloudflareImageId = firstString(result.id, images[0]?.id);
    const variant = resolveCloudflareVariant(input.documentKind);
    const cloudflareImageUrl =
      firstString(
        Array.isArray(result.variants) ? result.variants[0] : null,
        Array.isArray(result.variants) ? result.variants[1] : null,
      ) ??
      (cloudflareImageId && accountHash
        ? `https://imagedelivery.net/${accountHash}/${cloudflareImageId}/${variant}`
        : null);

    return {
      cloudflareImageId,
      cloudflareImageUrl,
    };
  } catch (error) {
    console.warn('[W3 Preview Artifacts] Cloudflare upload error:', error);
    return {
      cloudflareImageId: null,
      cloudflareImageUrl: null,
    };
  }
}

export async function materializeW3PreviewArtifact(
  input: MaterializeW3PreviewArtifactInput,
  options: MaterializeW3PreviewArtifactOptions = {},
): Promise<MaterializeW3PreviewArtifactResult> {
  const documentKind = resolveDocumentKind(input);
  const orderId = resolveOrderId(input);
  if (!orderId) {
    throw new Error('W3 preview artifact materialization requires orderId');
  }

  const downloadUrl = resolveDownloadUrl(input, documentKind);
  if (!downloadUrl) {
    throw new Error(`W3 ${documentKind} materialization requires a download URL`);
  }

  const r2Key = resolveR2Key(input, documentKind);
  if (!r2Key) {
    throw new Error(`W3 ${documentKind} materialization requires an R2 key`);
  }

  const backendUrl = resolveBackendUrl(input, options.defaultBackendUrl);
  const amazonOrderId = resolveAmazonOrderId(input, orderId);
  const rootOrderId = resolveRootOrderId(input, amazonOrderId, orderId);
  const pageNumber = resolvePageNumber(input, documentKind);
  const pageType = resolvePageType(input, documentKind);
  const filename = resolveFilename(input, documentKind, r2Key);

  const fetchImpl = options.fetchImpl ?? fetch;
  const downloadResponse = await fetchImpl(downloadUrl, {
    method: 'GET',
    headers: {
      Accept: 'image/png',
    },
  });

  if (!downloadResponse.ok) {
    throw new Error(
      `W3 ${documentKind} download failed: ${downloadResponse.status} ${downloadResponse.statusText}`,
    );
  }

  const contentType =
    firstString(downloadResponse.headers.get('content-type')) ?? 'image/png';
  const bytes = new Uint8Array(await downloadResponse.arrayBuffer());
  const putObjectImpl = options.putObjectImpl ?? putObject;
  await putObjectImpl(R2_ORDERS_BUCKET, r2Key, bytes, contentType);

  const cloudflare = await uploadToCloudflare(
    {
      documentKind,
      orderId,
      pageNumber,
      pageType,
      fileName: filename,
      contentType,
      bytes,
    },
    options,
  );

  const baseResult: MaterializeW3PreviewArtifactResult = {
    ...input,
    documentKind,
    orderId,
    amazonOrderId,
    rootOrderId,
    backendUrl,
    pageNumber,
    pageType,
    filename,
    r2Key,
    imageUrl: `${backendUrl}/api/assets/${r2Key}`,
    contentType,
    byteSize: bytes.byteLength,
    uploadBucket: R2_ORDERS_BUCKET,
    cloudflareImageId: cloudflare.cloudflareImageId,
    cloudflareImageUrl: cloudflare.cloudflareImageUrl,
    cloudflareUploaded: Boolean(
      cloudflare.cloudflareImageId || cloudflare.cloudflareImageUrl,
    ),
  };

  if (documentKind === 'cover-preview') {
    baseResult.coverPngR2Key = r2Key;
    baseResult.coverPngFilename = filename;
    baseResult.coverCloudflareImageId = cloudflare.cloudflareImageId;
    baseResult.coverCloudflareImageUrl = cloudflare.cloudflareImageUrl;
  } else {
    baseResult.pageImageR2Key = r2Key;
    baseResult.pageImageFilename = filename;
  }

  return baseResult;
}
