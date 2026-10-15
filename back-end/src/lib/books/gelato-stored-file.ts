import { createHash } from 'node:crypto';
import type { GelatoMember } from './gelato-submission-store';

export type GelatoStoredFileVerifier = (member: GelatoMember, providerUrl: string, expectedUrl: string) => Promise<boolean>;
export const GELATO_STORED_FILE_HOST = 'gelato-api-live.s3.eu-west-1.amazonaws.com';

export function createGelatoStoredFileVerifier(dependencies: {
  loadArtifact: (key: string, signal: AbortSignal) => Promise<Response>;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  budgetMs?: number;
  maxFileBytes?: number;
  maxOperationBytes?: number;
}): GelatoStoredFileVerifier {
  const maxFileBytes = Math.min(256_000_000, dependencies.maxFileBytes ?? 256_000_000);
  const maxOperationBytes = Math.min(512_000_000, dependencies.maxOperationBytes ?? 512_000_000);
  let operationSignal: AbortSignal | undefined;
  let totalBytes = 0;
  const digests = new Map<string, Promise<string>>();

  async function digest(response: Response, signal: AbortSignal) {
    // Workers supports manual redirects; every 3xx must fail without following Location.
    if (!response.ok || !response.body) {
      if (response.body) void response.body.cancel().catch(() => undefined);
      throw new Error('Gelato file verification could not load bytes');
    }
    const size = Number(response.headers.get('content-length'));
    if (size > maxFileBytes || size > maxOperationBytes - totalBytes) {
      void response.body.cancel().catch(() => undefined);
      throw new Error('Gelato file verification exceeds byte budget');
    }
    const hash = createHash('sha256');
    const reader = response.body.getReader();
    let bytes = 0;
    try {
      for (;;) {
        signal.throwIfAborted();
        const chunk = await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
          const abort = () => reject(new Error('Gelato file verification aborted'));
          signal.addEventListener('abort', abort, { once: true });
          reader.read().then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
        });
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        totalBytes += chunk.value.byteLength;
        if (bytes > maxFileBytes || totalBytes > maxOperationBytes) throw new Error('Gelato file verification exceeds byte budget');
        hash.update(chunk.value);
      }
      if (!bytes) throw new Error('Gelato file verification received an empty file');
      return hash.digest('hex');
    } finally {
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }

  return async (member, providerUrl, expectedUrl) => {
    const url = new URL(providerUrl);
    if (url.protocol !== 'https:' || url.hostname !== GELATO_STORED_FILE_HOST || url.port || url.username || url.password) {
      throw new Error('Gelato stored file host is not approved');
    }
    const key = member.artifact_key;
    const match = key?.match(/^([A-Za-z0-9_-]+)\/orders\/([A-Za-z0-9_-]+)\/gelato\/print\/v([1-9]\d*)\/([a-f0-9]{24})\.pdf$/);
    if (!match || match[2] !== member.child_order_key || match[4] !== member.artifact_fingerprint ||
        !member.artifact_claim_token || !Number.isSafeInteger(member.pdf_page_count) || !member.pdf_page_count || member.pdf_page_count < 1 ||
        new URL(expectedUrl).protocol !== 'https:' || new URL(expectedUrl).pathname !== `/api/pdf/${key!.split('/').map(encodeURIComponent).join('/')}`) {
      throw new Error('Gelato stored file has no matching artifact receipt');
    }
    if (!operationSignal) {
      const deadline = AbortSignal.timeout(Math.min(30_000, Math.max(1, dependencies.budgetMs ?? 30_000)));
      operationSignal = dependencies.signal ? AbortSignal.any([dependencies.signal, deadline]) : deadline;
    }
    const signal = operationSignal;
    signal.throwIfAborted();
    const expectedCacheKey = `artifact:${key}`;
    if (!digests.has(expectedCacheKey)) digests.set(expectedCacheKey, dependencies.loadArtifact(key!, signal).then((response) => digest(response, signal)));
    const expected = await digests.get(expectedCacheKey)!;
    if (!digests.has(providerUrl)) {
      digests.set(providerUrl, (dependencies.fetcher ?? fetch)(url, { redirect: 'manual', signal }).then((response) => digest(response, signal)));
    }
    return expected === await digests.get(providerUrl)!;
  };
}
