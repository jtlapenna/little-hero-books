import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { calculatePreviewHash } from '../src/lib/character-hash';
import { buildCharacterAssetPrefix } from '../src/lib/order-paths';
import { PUBLIC_BODY_LIMITS } from '../src/lib/request-body';

async function main() {
  Object.assign(process.env, { SUPABASE_URL: 'https://cache-db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-cache-server', CLOUDFLARE_ACCOUNT_ID: 'synthetic-cache', R2_ACCESS_KEY_ID: 'synthetic-cache-access', R2_SECRET_ACCESS_KEY: 'synthetic-cache-secret' });
  const originalFetch = globalThis.fetch, originalLog = console.log, originalWarn = console.warn, originalError = console.error;
  const logs: string[] = [], calls: string[] = [];
  const marker = 'SYNTHETIC_PRIVATE_CACHE_DIAGNOSTIC_72931';
  const specs = { skinTone: 'light', hairStyle: 'curly-short', hairColor: 'medium-brown', favoriteColor: 'blue', pronouns: 'he-him' };
  const bookId = 'book-mvp-simple-adventure', hash = calculatePreviewHash(specs), fallbackHash = '1234567890abcdef';
  let mode = 'hit', checks = 0;
  const capture = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  console.log = capture; console.warn = capture; console.error = capture;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init), url = new URL(request.url);
    calls.push(request.method + ' ' + url.origin + url.pathname);
    if (url.origin === 'https://cache-db.example.test') {
      assert.equal(request.method, 'GET'); assert.equal(url.pathname, '/rest/v1/orders');
      if (mode === 'db-error') return Response.json({ message: marker }, { status: 400 });
      return Response.json(mode === 'fallback' ? [{ character_hash: fallbackHash, book_id: bookId }, { character_hash: 'abcdef1234567890', book_id: 'different-book' }] : []);
    }
    assert.ok(url.hostname.endsWith('.synthetic-cache.r2.cloudflarestorage.com'), 'Transport must remain synthetic');
    assert.equal(request.method, 'HEAD');
    if (mode === 'error') throw new Error(marker);
    return new Response(null, { status: mode === 'hit' || (mode === 'fallback' && url.pathname.endsWith('/base-character.png')) ? 200 : 404 });
  };
  try {
    const { GET, POST, OPTIONS } = await import('../src/app/api/preview/check/route');
    const origin = 'https://admin.example.test/api/preview/check';
    function streamed(text: string, headers: Record<string, string> = {}, fail = false, signal?: AbortSignal) {
      const bytes = new TextEncoder().encode(text); let offset = 0, pulls = 0, canceled = false;
      const body = new ReadableStream<Uint8Array>({ pull(c) { pulls++; if (offset < bytes.length) c.enqueue(bytes.subarray(offset, offset += 1024)); else if (fail) c.error(new Error(marker)); else c.close(); }, cancel() { canceled = true; } }, { highWaterMark: 0 });
      return { request: new NextRequest(origin, { method: 'POST', body, duplex: 'half', headers, signal } as RequestInit), pulls: () => pulls, canceled: () => canceled };
    }
    const payload = JSON.stringify({ character_specs: specs, bookId, formatId: 'standard' });
    const exact = payload + ' '.repeat(PUBLIC_BODY_LIMITS.preview - Buffer.byteLength(payload));
    for (const headers of [{}, { 'content-length': '1' }, { 'content-length': String(PUBLIC_BODY_LIMITS.preview) }]) {
      const r = await POST(streamed(exact, headers).request); assert.equal(r.status, 200); assert.deepEqual(await r.json(), { exists: true, imageUrl: `/api/assets/${buildCharacterAssetPrefix(hash, bookId)}/preview.png`, source: 'preview', hash }); checks++;
    }
    for (const headers of [{}, { 'content-length': '1' }]) {
      calls.length = 0; const over = streamed(exact + ' ', headers), r = await POST(over.request);
      assert.equal(r.status, 413); assert.deepEqual(await r.json(), { error: 'Request body too large', exists: false }); assert.ok(over.canceled()); assert.deepEqual(calls, []); checks++;
    }
    for (const [declared, status] of [[String(PUBLIC_BODY_LIMITS.preview + 1), 413], ['-1', 400]] as const) {
      calls.length = 0; const early = streamed(payload, { 'content-length': declared }), r = await POST(early.request);
      assert.equal(r.status, status); assert.equal(early.pulls(), 0); assert.deepEqual(calls, []); checks++;
    }
    for (const body of ['', '{', 'null', '[]', '1', '"text"', '{}', '{"character_specs":[]}', '{"character_specs":"text"}', '{"character_specs":1}', JSON.stringify({ character_specs: specs })]) {
      calls.length = 0; const r = await POST(streamed(body).request); assert.equal(r.status, 400); assert.equal((await r.json()).exists, false); assert.deepEqual(calls, []); checks++;
    }
    const failed = await POST(streamed(payload, {}, true).request); assert.equal(failed.status, 400); checks++;
    const controller = new AbortController();controller.abort(); const aborted = await POST(streamed(payload, {}, false, controller.signal).request); assert.equal(aborted.status, 400); checks++;
    for (const body of [{ character_specs: specs, bookId }, { characterSpecs: specs, book_id: bookId }, { character_specs: { ...specs, bookId } }, { characterSpecs: { ...specs, book_id: bookId } }]) {
      const r = await POST(streamed(JSON.stringify(body)).request); assert.equal(r.status, 200); assert.equal((await r.json()).hash, hash); checks++;
    }
    for (const query of ['', '?hash=bad&bookId=' + bookId, '?hash=' + hash]) {
      calls.length = 0; const r = await GET(new NextRequest(origin + query));assert.equal(r.status, 400);assert.deepEqual(calls, []);checks++;
    }
    for (mode of ['hit', 'miss', 'fallback', 'db-error']) {
      logs.length = 0;
      for (const handler of ['GET', 'POST']) {
        const r = handler === 'GET' ? await GET(new NextRequest(origin + `?hash=${hash}&bookId=${bookId}`)) : await POST(streamed(payload).request);
        assert.equal(r.status, 200); const body = await r.json(); assert.equal(body.hash, hash); assert.equal(body.exists, mode === 'hit' || mode === 'fallback');
        if (mode === 'fallback') { assert.equal(body.source, 'base-character'); assert.equal(body.imageUrl, `/api/assets/${buildCharacterAssetPrefix(fallbackHash, bookId)}/base-character.png`); }
        assert.ok(!JSON.stringify(body).includes(marker));assert.ok(!logs.join('\n').includes(marker));checks++;
      }
    }
    mode = 'error';logs.length = 0;
    for (const handler of ['GET', 'POST']) {
      const r = handler === 'GET' ? await GET(new NextRequest(origin + `?hash=${hash}&bookId=${bookId}`)) : await POST(streamed(payload).request);
      assert.equal(r.status, 500); assert.deepEqual(await r.json(), { error: 'Cache check failed', exists: false }); assert.equal(r.headers.get('access-control-allow-origin'), '*'); assert.ok(!logs.join('\n').includes(marker)); checks++;
    }
    const options = await OPTIONS();assert.equal(options.status, 204);assert.match(options.headers.get('access-control-allow-methods')!, /POST/);checks++;
    originalLog(`Preview cache boundary: ${checks} actual-handler cases passed; all transport synthetic, zero live requests`);
  } finally { globalThis.fetch = originalFetch;console.log = originalLog;console.warn = originalWarn;console.error = originalError; }
}
void main().catch(error => { console.error(error);process.exitCode = 1; });
