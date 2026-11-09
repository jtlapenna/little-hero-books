import { AwsClient } from 'aws4fetch';
import { XMLParser } from 'fast-xml-parser';

// R2 configuration from environment
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID =
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ||
  process.env.CLOUDFLARE_R2_ACCESS_KEY ||
  process.env.R2_ACCESS_KEY_ID ||
  process.env.R2_ACCESS_ID_KEY;
const SECRET_ACCESS_KEY =
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
  process.env.CLOUDFLARE_R2_SECRET_KEY ||
  process.env.R2_SECRET_ACCESS_KEY;

// Validate required environment variables
const missingVars: string[] = [];
if (!ACCOUNT_ID) missingVars.push('CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID');
if (!ACCESS_KEY_ID) {
  missingVars.push(
    'R2_ACCESS_KEY_ID (or CLOUDFLARE_R2_ACCESS_KEY_ID / CLOUDFLARE_R2_ACCESS_KEY / R2_ACCESS_ID_KEY)'
  );
}
if (!SECRET_ACCESS_KEY) {
  missingVars.push(
    'R2_SECRET_ACCESS_KEY (or CLOUDFLARE_R2_SECRET_ACCESS_KEY / CLOUDFLARE_R2_SECRET_KEY)'
  );
}

// Create aws4fetch client for R2 (Cloudflare Workers compatible)
export const r2Client = new AwsClient({
  accessKeyId: ACCESS_KEY_ID || '',
  secretAccessKey: SECRET_ACCESS_KEY || '',
  service: 's3',
  region: 'auto',
});

// XML parser for S3 ListObjectsV2 responses
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  parseAttributeValue: true,
  isArray: (name) => name === 'Contents' || name === 'CommonPrefixes',
});

export function validateR2Config(): { valid: boolean; missing: string[] } {
  return {
    valid: missingVars.length === 0,
    missing: missingVars,
  };
}

export const R2_PUBLIC_BUCKET =
  process.env.R2_PUBLIC_BUCKET_NAME ||
  process.env.R2_ASSETS_BUCKET_NAME ||
  process.env.R2_PUBLIC_BUCKET ||
  'little-hero-assets';
export const R2_ORDERS_BUCKET =
  process.env.R2_ORDERS_BUCKET_NAME || process.env.R2_ORDERS_BUCKET || 'little-hero-orders';
// Deprecated global prefix. New code should derive per-book paths via buildCharacterAssetPrefix().
export const R2_CHARACTERS_PREFIX =
  process.env.R2_CHARACTERS_PREFIX ||
  '';

const EMPTY_PAYLOAD_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function isReadableStreamBody(body: BodyInit | null | undefined): body is ReadableStream {
  return typeof ReadableStream !== 'undefined' && body instanceof ReadableStream;
}

async function sha256HexFromBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function normalizeBodyForSigning(
  body?: BodyInit | null
): Promise<{ body?: BodyInit; payloadHash?: string; contentLength?: number; streaming?: boolean }> {
  if (body == null) {
    return { payloadHash: EMPTY_PAYLOAD_SHA256 };
  }

  if (isReadableStreamBody(body)) {
    // Let aws4fetch sign S3/R2 stream uploads with UNSIGNED-PAYLOAD so we do not
    // buffer large PDFs in memory just to compute a body hash.
    return {
      body,
      streaming: true,
    };
  }

  if (typeof body === 'string') {
    const bytes = new TextEncoder().encode(body);
    return {
      body,
      payloadHash: await sha256HexFromBytes(bytes),
      contentLength: bytes.byteLength,
    };
  }

  if (body instanceof Uint8Array) {
    return {
      body,
      payloadHash: await sha256HexFromBytes(body),
      contentLength: body.byteLength,
    };
  }

  if (body instanceof ArrayBuffer) {
    const bytes = new Uint8Array(body);
    return {
      body,
      payloadHash: await sha256HexFromBytes(bytes),
      contentLength: bytes.byteLength,
    };
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    const bytes = new Uint8Array(await body.arrayBuffer());
    return {
      body,
      payloadHash: await sha256HexFromBytes(bytes),
      contentLength: body.size,
    };
  }

  const bytes = new Uint8Array(await new Response(body).arrayBuffer());
  return {
    body: bytes,
    payloadHash: await sha256HexFromBytes(bytes),
    contentLength: bytes.byteLength,
  };
}

async function signR2Request(input: {
  url: string;
  method: 'GET' | 'HEAD' | 'PUT' | 'DELETE' | 'POST';
  headers?: Record<string, string>;
  body?: BodyInit | null;
}): Promise<Request> {
  const urlObj = new URL(input.url);
  const normalized = await normalizeBodyForSigning(input.body);
  const headers: Record<string, string> = {
    Host: urlObj.hostname,
    ...input.headers,
  };

  if (normalized.payloadHash) {
    headers['x-amz-content-sha256'] = normalized.payloadHash;
  }

  if (normalized.contentLength !== undefined) {
    headers['Content-Length'] = String(normalized.contentLength);
  }

  const unsignedRequest = new Request(input.url, {
    method: input.method,
    headers,
    body: normalized.body,
    ...(normalized.streaming ? ({ duplex: 'half' } as RequestInit) : {}),
  });

  return r2Client.sign(unsignedRequest);
}

export interface ListObjectsV2Response {
  ListBucketResult: {
    IsTruncated?: boolean;
    Contents?: Array<{
      Key: string;
      LastModified?: string;
      ETag?: string;
      Size?: number;
      StorageClass?: string;
    }>;
    CommonPrefixes?: Array<{
      Prefix: string;
    }>;
    KeyCount?: number;
    MaxKeys?: number;
    Prefix?: string;
    Delimiter?: string;
    NextContinuationToken?: string;
  };
}

export async function listObjects(
  bucket: string,
  options: {
    prefix?: string;
    delimiter?: string;
    maxKeys?: number;
    continuationToken?: string;
  } = {}
): Promise<ListObjectsV2Response['ListBucketResult']> {
  if (!ACCOUNT_ID) {
    throw new Error('R2 endpoint not configured: CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID is missing');
  }

  const { prefix, delimiter, maxKeys, continuationToken } = options;
  const params = new URLSearchParams({ 'list-type': '2' });

  if (prefix) params.set('prefix', prefix);
  if (delimiter) params.set('delimiter', delimiter);
  if (maxKeys) params.set('max-keys', String(maxKeys));
  if (continuationToken) params.set('continuation-token', continuationToken);

  const url = `https://${bucket}.${ACCOUNT_ID}.r2.cloudflarestorage.com?${params.toString()}`;
  const signedRequest = await signR2Request({
    url,
    method: 'GET',
  });
  const response = await fetch(signedRequest);
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`R2 listObjects failed: ${response.status} ${response.statusText} - ${responseText}`);
  }

  const parsed = xmlParser.parse(responseText) as ListObjectsV2Response;
  const result = parsed.ListBucketResult;

  if (result.Contents && !Array.isArray(result.Contents)) {
    result.Contents = [result.Contents];
  }
  if (result.CommonPrefixes && !Array.isArray(result.CommonPrefixes)) {
    result.CommonPrefixes = [result.CommonPrefixes];
  }

  return result;
}

function encodeS3Key(key: string): string {
  return key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

export async function getObject(bucket: string, key: string, options: { allowNotFound?: boolean; allowErrorResponse?: boolean; signal?: AbortSignal; redirect?: RequestRedirect } = {}): Promise<Response> {
  if (!ACCOUNT_ID) {
    throw new Error('R2 endpoint not configured: CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID is missing');
  }

  const encodedKey = encodeS3Key(key);
  const url = `https://${bucket}.${ACCOUNT_ID}.r2.cloudflarestorage.com/${encodedKey}`;
  const signedRequest = await signR2Request({
    url,
    method: 'GET',
  });
  const response = await fetch(signedRequest, { signal: options.signal, redirect: options.redirect });

  if (!response.ok && !options.allowErrorResponse && !(options.allowNotFound && response.status === 404)) {
    const errorText = await response.text();
    throw new Error(`R2 getObject failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response;
}

export async function headObject(bucket: string, key: string): Promise<Response> {
  if (!ACCOUNT_ID) {
    throw new Error('R2 endpoint not configured: CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID is missing');
  }

  const encodedKey = encodeS3Key(key);
  const url = `https://${bucket}.${ACCOUNT_ID}.r2.cloudflarestorage.com/${encodedKey}`;
  const signedRequest = await signR2Request({
    url,
    method: 'HEAD',
  });
  const response = await fetch(signedRequest);

  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 headObject failed: ${response.status} ${response.statusText} - ${bucket}/${key}`);
  }

  return response;
}

/** Part size for streamed uploads. R2 requires every part except the last to be at least 5 MiB. */
export const R2_STREAM_PART_BYTES = 8 * 1024 * 1024;

async function readStreamPart(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  carry: Uint8Array[],
  carryBytes: { value: number },
  partBytes: number,
): Promise<{ part: Uint8Array | null; done: boolean }> {
  let done = false;
  while (carryBytes.value < partBytes && !done) {
    const next = await reader.read();
    if (next.done) { done = true; break; }
    if (next.value && next.value.byteLength > 0) {
      carry.push(next.value);
      carryBytes.value += next.value.byteLength;
    }
  }
  if (carryBytes.value === 0) return { part: null, done };
  const take = Math.min(carryBytes.value, partBytes);
  const part = new Uint8Array(take);
  let offset = 0;
  while (offset < take) {
    const head = carry[0];
    const room = take - offset;
    if (head.byteLength <= room) {
      part.set(head, offset);
      offset += head.byteLength;
      carry.shift();
    } else {
      part.set(head.subarray(0, room), offset);
      carry[0] = head.subarray(room);
      offset += room;
    }
  }
  carryBytes.value -= take;
  return { part, done: done && carryBytes.value === 0 };
}

/**
 * Upload a stream of unknown length without holding it in memory. Streams that fit in one part use a plain
 * PUT; larger streams use an S3 multipart upload with one buffered part at a time (a Worker has about 128 MB).
 */
async function putObjectFromStream(
  bucket: string,
  key: string,
  stream: ReadableStream,
  contentType: string | undefined,
  partBytes: number = R2_STREAM_PART_BYTES,
): Promise<Response> {
  const objectUrl = `https://${bucket}.${ACCOUNT_ID}.r2.cloudflarestorage.com/${encodeS3Key(key)}`;
  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  const carry: Uint8Array[] = [];
  const carryBytes = { value: 0 };
  const first = await readStreamPart(reader, carry, carryBytes, partBytes);
  if (first.done) {
    // A stream that fits in one part keeps the original contract: a single PUT that still carries a stream body.
    const bytes = first.part ?? new Uint8Array(0);
    const body = new ReadableStream<Uint8Array>({ start(controller) { if (bytes.byteLength > 0) controller.enqueue(bytes); controller.close(); } });
    const response = await fetch(await signR2Request({ url: objectUrl, method: 'PUT', headers: contentType ? { 'Content-Type': contentType } : {}, body }));
    if (!response.ok) throw new Error(`R2 putObject failed: ${response.status} ${response.statusText} - ${await response.text()}`);
    return response;
  }
  const created = await fetch(await signR2Request({ url: `${objectUrl}?uploads`, method: 'POST', headers: contentType ? { 'Content-Type': contentType } : {} }));
  const createdText = await created.text();
  const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(createdText)?.[1];
  if (!created.ok || !uploadId) throw new Error(`R2 multipart create failed: ${created.status} ${created.statusText} - ${createdText.slice(0, 300)}`);
  const uploadUrl = `${objectUrl}?uploadId=${encodeURIComponent(uploadId)}`;
  const parts: Array<{ number: number; etag: string }> = [];
  try {
    let current = first.part;
    let finished = false;
    for (let number = 1; current; number += 1) {
      const partResponse = await fetch(await signR2Request({
        url: `${objectUrl}?partNumber=${number}&uploadId=${encodeURIComponent(uploadId)}`, method: 'PUT', body: current,
      }));
      if (!partResponse.ok) {
        const detail = await partResponse.text().catch(() => '');
        throw new Error(`R2 multipart part ${number} failed: ${partResponse.status} ${partResponse.statusText} (${current.byteLength} bytes) - ${detail.slice(0, 300)}`);
      }
      await partResponse.arrayBuffer().catch(() => undefined);
      const etag = partResponse.headers.get('ETag');
      if (!etag) throw new Error(`R2 multipart part ${number} returned no ETag`);
      parts.push({ number, etag });
      current = null;
      if (!finished) {
        const next = await readStreamPart(reader, carry, carryBytes, partBytes);
        current = next.part;
        finished = next.done;
      }
    }
    const xml = '<CompleteMultipartUpload>' + parts.map((part) => `<Part><PartNumber>${part.number}</PartNumber><ETag>${part.etag}</ETag></Part>`).join('') + '</CompleteMultipartUpload>';
    const completed = await fetch(await signR2Request({ url: uploadUrl, method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: xml }));
    const completedText = await completed.text();
    if (!completed.ok || /<Error>/.test(completedText)) throw new Error(`R2 multipart complete failed: ${completed.status} ${completed.statusText} - ${completedText.slice(0, 300)}`);
    return completed;
  } catch (error) {
    try { await reader.cancel(); } catch { /* producer already finished */ }
    try { (await fetch(await signR2Request({ url: uploadUrl, method: 'DELETE' }))).body?.cancel().catch(() => undefined); } catch { /* best-effort abort */ }
    throw error;
  }
}

export async function putObject(
  bucket: string,
  key: string,
  body: Blob | ArrayBuffer | ReadableStream | Uint8Array | string,
  contentType?: string,
  conditions?: { ifNoneMatch: '*' },
): Promise<Response> {
  if (!ACCOUNT_ID) {
    throw new Error('R2 endpoint not configured: CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID is missing');
  }

  if (!conditions && typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    return putObjectFromStream(bucket, key, body, contentType);
  }

  const encodedKey = encodeS3Key(key);
  const url = `https://${bucket}.${ACCOUNT_ID}.r2.cloudflarestorage.com/${encodedKey}`;
  const headers: Record<string, string> = {};

  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  if (conditions) headers['If-None-Match'] = conditions.ifNoneMatch;

  let requestBody: BodyInit;
  if (typeof body === 'string') {
    requestBody = body;
  } else if (body instanceof Uint8Array) {
    requestBody = body;
  } else if (body instanceof ArrayBuffer) {
    requestBody = new Uint8Array(body);
  } else if (typeof Blob !== 'undefined' && body instanceof Blob) {
    requestBody = body;
  } else {
    requestBody = body as BodyInit;
  }

  const signedRequest = await signR2Request({
    url,
    method: 'PUT',
    headers,
    body: requestBody,
  });
  const response = await fetch(signedRequest);

  if (conditions && response.status === 412) return response;
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`R2 putObject failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response;
}

export async function deleteObject(bucket: string, key: string): Promise<Response> {
  if (!ACCOUNT_ID) {
    throw new Error('R2 endpoint not configured: CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID is missing');
  }

  const encodedKey = encodeS3Key(key);
  const url = `https://${bucket}.${ACCOUNT_ID}.r2.cloudflarestorage.com/${encodedKey}`;
  const signedRequest = await signR2Request({
    url,
    method: 'DELETE',
  });
  const response = await fetch(signedRequest);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`R2 deleteObject failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response;
}

export function getObjectUrl(bucket: string, key: string): string {
  if (!ACCOUNT_ID) {
    throw new Error('R2 endpoint not configured: CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID is missing');
  }
  return `https://${bucket}.${ACCOUNT_ID}.r2.cloudflarestorage.com/${encodeS3Key(key)}`;
}
