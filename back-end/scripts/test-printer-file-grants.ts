import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { createPrinterFileUrl, newPrinterFileWindow, verifyPrinterFileUrl, PRINTER_FILE_ORIGIN, PRINTER_FILE_SEND_MARGIN_SECONDS } from '../src/lib/printer-file-grants';
import { withBackendAccess } from '../src/lib/access-boundary';
import { middleware } from '../src/middleware';
import { createGelatoStoredFileVerifier, GELATO_STORED_FILE_HOST } from '../src/lib/books/gelato-stored-file';
import type { GelatoMember } from '../src/lib/books/gelato-submission-store';

async function main() {
  Object.assign(process.env, { BACKEND_API_TOKEN: 'synthetic-printer-authority-only-at-least-32-characters', CLOUDFLARE_ACCOUNT_ID: 'synthetic-printer', R2_ACCESS_KEY_ID: 'synthetic-access', R2_SECRET_ACCESS_KEY: 'synthetic-secret' });
  const pdf = await import('../src/app/api/pdf/[...path]/route');
  const scope = { key: `book-synthetic/orders/TEST-SYNTHETIC/gelato/print/v2/${'a'.repeat(24)}.pdf`, submissionId: '11111111-1111-4111-8111-111111111111', itemReferenceId: 'item-1', orderDbId: 1, configVersion: 2, inputFingerprint: 'a'.repeat(24) };
  const now = new Date(), window = newPrinterFileWindow(now), url = await createPrinterFileUrl(scope, window, PRINTER_FILE_ORIGIN);
  assert.equal(url, await createPrinterFileUrl(scope, window, PRINTER_FILE_ORIGIN));
  assert(await verifyPrinterFileUrl(url, scope.key, { now, scope }));
  assert(await verifyPrinterFileUrl(url, scope.key, { now: new Date((window.expiresAt - PRINTER_FILE_SEND_MARGIN_SECONDS) * 1000), minimumRemainingSeconds: PRINTER_FILE_SEND_MARGIN_SECONDS }));
  assert.equal(await verifyPrinterFileUrl(url, scope.key, { now: new Date((window.expiresAt - PRINTER_FILE_SEND_MARGIN_SECONDS + 1) * 1000), minimumRemainingSeconds: PRINTER_FILE_SEND_MARGIN_SECONDS }), false);
  for (const field of ['submissionId', 'itemReferenceId', 'orderDbId', 'configVersion', 'inputFingerprint'] as const) {
    const other = { ...scope, [field]: field === 'orderDbId' ? 2 : field === 'configVersion' ? 3 : field === 'submissionId' ? '22222222-2222-4222-8222-222222222222' : field === 'inputFingerprint' ? 'b'.repeat(24) : 'other' };
    assert.equal(await verifyPrinterFileUrl(url, scope.key, { scope: other }), false);
  }
  const pastWindow = { version: 1 as const, issuedAt: window.issuedAt - 90000, expiresAt: window.issuedAt - 3600 };
  const expired = await createPrinterFileUrl(scope, pastWindow, PRINTER_FILE_ORIGIN);
  const future = await createPrinterFileUrl(scope, { version: 1, issuedAt: window.issuedAt + 60, expiresAt: window.expiresAt }, PRINTER_FILE_ORIGIN);
  assert.equal(await verifyPrinterFileUrl(expired, scope.key), false);
  assert.equal(await verifyPrinterFileUrl(expired, scope.key, { historical: true, scope }), true);
  await assert.rejects(createPrinterFileUrl(scope, { ...window, expiresAt: window.expiresAt + 1 }, PRINTER_FILE_ORIGIN));
  await assert.rejects(createPrinterFileUrl(scope, window, 'https://evil.example'));
  const oldFetch = globalThis.fetch, log = console.log, error = console.error;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init), target = new URL(req.url);
    assert.equal(target.hostname, 'little-hero-orders.synthetic-printer.r2.cloudflarestorage.com');
    assert.equal(decodeURIComponent(target.pathname.slice(1)), scope.key); calls++;
    assert(['GET', 'HEAD'].includes(req.method));
    return new Response(req.method === 'HEAD' ? null : 'synthetic-PDF-bytes', { headers: { 'content-type': 'application/pdf', 'content-length': '19' } });
  };
  console.log = () => undefined; console.error = () => undefined;
  const run = (value: string, method: 'GET' | 'HEAD' | 'POST' = 'GET', headers = {}) => withBackendAccess(new Request(value, { method, headers }), async clean => {
    const request = new NextRequest(clean), next = await middleware(request);
    if (next.headers.get('x-middleware-next') !== '1') return next;
    assert.notEqual(method, 'POST');
    return pdf[method as 'GET' | 'HEAD'](request, { params: Promise.resolve({ path: new URL(value).pathname.slice('/api/pdf/'.length).split('/').map(decodeURIComponent) }) });
  });
  try {
    for (const method of ['GET', 'HEAD'] as const) {
      const response = await run(url, method, { range: 'bytes=0-5' });
      assert.equal(response.status, 200); assert.match(response.headers.get('cache-control')!, /no-store/);
      assert.equal(response.headers.get('content-range'), null);
      assert.equal(await response.text(), method === 'HEAD' ? '' : 'synthetic-PDF-bytes');
    }
    const bad = [url + '&format=json', url + '&printerGrant=duplicate', url + '&proxy=true', url.replace('/TEST-SYNTHETIC/', '/OTHER/'), url + 'tampered', url.replace(PRINTER_FILE_ORIGIN, 'https://direct.pages.dev'), expired, future, url.split('?')[0], url.replace('printerGrant=', 'previewGrant='), url.replace('/api/pdf/', '/api/manifests/'), url.replace('/api/pdf/', '/api/assets/')];
    for (const value of bad) {
      const before = calls; assert.equal((await run(value)).status, 401, 'Capability cannot authorize another resource/query or expired download'); assert.equal(calls, before);
    }
    const before = calls; assert.equal((await run(url, 'POST')).status, 401); assert.equal(calls, before);
    process.env.BACKEND_API_TOKEN = 'synthetic-rotated-printer-authority-32-characters';
    assert.equal(await verifyPrinterFileUrl(url, scope.key), false);
    process.env.BACKEND_API_TOKEN = 'synthetic-printer-authority-only-at-least-32-characters';
    const member = { submission_id: scope.submissionId, child_order_id: 1, item_reference_id: 'item-1', child_order_key: 'TEST-SYNTHETIC', artifact_key: scope.key, artifact_fingerprint: scope.inputFingerprint, artifact_claim_token: '22222222-2222-4222-8222-222222222222', pdf_page_count: 35 } as GelatoMember;
    const stored = createGelatoStoredFileVerifier({ loadArtifact: async () => new Response('same'), fetcher: async () => new Response('same') });
    assert(await stored(member, `https://${GELATO_STORED_FILE_HOST}/synthetic.pdf`, expired), 'Historical byte verification survives grant expiry');
    assert(await stored(member, `https://${GELATO_STORED_FILE_HOST}/synthetic.pdf`, url.split('?')[0]), 'Historical unsigned canonical receipt remains inspectable');
  } finally { globalThis.fetch = oldFetch; console.log = log; console.error = error; }
  console.log('Printer capabilities: real raw boundary→middleware→PDF GET/HEAD, full Range200, zero-I/O denials, exact scope/time/rotation and historical byte proof passed; zero live traffic');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
