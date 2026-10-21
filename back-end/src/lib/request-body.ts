/** Byte caps apply to request bodies, independently of Content-Length. */
export const PUBLIC_BODY_LIMITS = {
  preview: 64 * 1024,
  checkout: 256 * 1024,
  stripeWebhook: 1024 * 1024,
} as const;

/** Total multipart envelope; the existing CSV file cap remains 10MiB. */
export const ADMIN_BODY_LIMITS = { csvUpload: 11 * 1024 * 1024 } as const;

export class RequestBodyError extends Error {
  constructor(readonly status: 400 | 413) {
    super(status === 413 ? 'Request body too large' : 'Invalid request body');
    this.name = 'RequestBodyError';
  }
}

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal) {
  if (signal.aborted) throw new RequestBodyError(400);
  return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    const stop = () => reject(new RequestBodyError(400));
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) { signal.removeEventListener('abort', stop); stop(); return; }
    reader.read().then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

/** Accumulate at most maxBytes before any text or multipart parsing. */
export async function readBoundedRequestBytes(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('Invalid body limit');
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    // An unread body can have a cancellation hook that never settles.
    void request.body?.cancel().catch(() => undefined);
    throw new RequestBodyError(/^\d+$/.test(declared) ? 413 : 400);
  }
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  let bytes = new Uint8Array(Math.min(maxBytes, 8192));
  let total = 0;
  let complete = false;
  try {
    for (;;) {
      const { value, done } = await readChunk(reader, request.signal);
      if (done) break;
      const nextTotal = total + value.byteLength;
      if (nextTotal > maxBytes) throw new RequestBodyError(413);
      if (nextTotal > bytes.byteLength) {
        const grown = new Uint8Array(Math.min(maxBytes, Math.max(nextTotal, bytes.byteLength * 2)));
        grown.set(bytes); bytes = grown;
      }
      bytes.set(value, total); total = nextTotal;
    }
    complete = true;
    return bytes.subarray(0, total);
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400);
  } finally {
    if (!complete) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Bounded UTF-8 decode. Signed text must preserve BOMs and reject lossy decoding. */
export async function readBoundedRequestText(request: Request, maxBytes: number, decoding: { preserveBOM?: boolean; fatal?: boolean } = {}): Promise<string> {
  const bytes = await readBoundedRequestBytes(request, maxBytes);
  try {
    return new TextDecoder('utf-8', { ignoreBOM: decoding.preserveBOM ?? false, fatal: decoding.fatal ?? false }).decode(bytes);
  } catch {
    throw new RequestBodyError(400);
  }
}

/** Preserve multipart bytes and boundary; never call the unbounded request parser. */
export async function readBoundedRequestFormData(request: Request, maxBytes: number): Promise<FormData> {
  const bytes = await readBoundedRequestBytes(request, maxBytes);
  try {
    return await new Response(bytes, {
      headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
    }).formData();
  } catch {
    throw new RequestBodyError(400);
  }
}
