/** Byte caps apply to request bodies, independently of Content-Length. */
export const PUBLIC_BODY_LIMITS = {
  preview: 64 * 1024,
  checkout: 256 * 1024,
  stripeWebhook: 1024 * 1024,
} as const;

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

/** Bounded UTF-8 decode. Signed text must preserve BOMs and reject lossy decoding. */
export async function readBoundedRequestText(request: Request, maxBytes: number, decoding: { preserveBOM?: boolean; fatal?: boolean } = {}): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('Invalid body limit');
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    // An unread body can have a cancellation hook that never settles.
    void request.body?.cancel().catch(() => undefined);
    throw new RequestBodyError(/^\d+$/.test(declared) ? 413 : 400);
  }
  if (!request.body) return '';
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
    return new TextDecoder('utf-8', { ignoreBOM: decoding.preserveBOM ?? false, fatal: decoding.fatal ?? false }).decode(bytes.subarray(0, total));
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400);
  } finally {
    if (!complete) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
