import { parsePrinterFileUrl, verifyPrinterFileUrl } from '../printer-file-grants';
import {digestGelatoFile,MAX_GELATO_FILE_BYTES} from './gelato-file-digest';
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
  const maxFileBytes = Math.min(MAX_GELATO_FILE_BYTES, dependencies.maxFileBytes ?? MAX_GELATO_FILE_BYTES);
  const maxOperationBytes = Math.min(512_000_000, dependencies.maxOperationBytes ?? 512_000_000);
  let operationSignal: AbortSignal | undefined;
  let totalBytes = 0;
  const digests = new Map<string, Promise<string>>();

  async function digest(response: Response, signal: AbortSignal) {
    // Same per-operation transfer cap, with no accumulated PDF buffers.
    return digestGelatoFile(response,{signal,maxFileBytes:Math.min(maxFileBytes,maxOperationBytes-totalBytes),onBytes:bytes=>{
      totalBytes+=bytes;
      if(totalBytes>maxOperationBytes)throw Error('Gelato file verification exceeds byte budget');
    }});
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
        !parsePrinterFileUrl(expectedUrl, key!) || (new URL(expectedUrl).search !== '' && !await verifyPrinterFileUrl(expectedUrl, key!, { historical: true, scope: { key: key!, submissionId: member.submission_id, itemReferenceId: member.item_reference_id, orderDbId: member.child_order_id, configVersion: Number(match[3]), inputFingerprint: member.artifact_fingerprint! } }))) {
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
