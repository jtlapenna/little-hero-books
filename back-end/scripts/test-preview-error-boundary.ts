import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { calculatePreviewHash } from '../src/lib/character-hash';
import { buildCharacterAssetPrefix } from '../src/lib/order-paths';

async function main() {
  Object.assign(process.env, {
    SUPABASE_URL: 'https://preview-db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-preview-server',
    CLOUDFLARE_ACCOUNT_ID: 'synthetic-preview', R2_ACCESS_KEY_ID: 'synthetic-preview-access', R2_SECRET_ACCESS_KEY: 'synthetic-preview-secret',
    GOOGLE_GEMINI_API_KEY: 'synthetic-preview-api-key', BOOK_CONFIG_RUNTIME_SOURCE: 'bundled',
    PREVIEW_HAIR_FALLBACK_DIR: '',
  });
  const marker = 'SYNTHETIC_PRIVATE_DIAGNOSTIC_49836';
  const originalFetch = globalThis.fetch, originalLog = console.log, originalWarn = console.warn, originalError = console.error;
  const logs: string[] = [], calls: string[] = [];
  let checks = 0, writes = 0, upstreamBodyReads = 0;
  let mode = 'success', providerStatus = 400, storedPreview = false;
  const log = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  console.log = log; console.warn = log; console.error = log;
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url); calls.push(request.method + ' ' + url.hostname + url.pathname);
    if (url.origin === 'https://preview-db.example.test') {
      assert.equal(request.method, 'GET');
      if (url.pathname === '/rest/v1/orders' && mode === 'cache-db-error') return Response.json({ message: marker, code: 'XX000' }, { status: 400 });
      if (url.pathname === '/rest/v1/book_configs' && mode === 'config-error') return Response.json({ message: marker, code: 'XX000' }, { status: 400 });
      throw new Error('Unapproved synthetic database path');
    }
    if (url.hostname.endsWith('.synthetic-preview.r2.cloudflarestorage.com')) {
      if (request.method === 'HEAD') {
        if (mode === 'cache-error') throw new Error(marker);
        return new Response(null, { status: storedPreview ? 200 : 404 });
      }
      if (request.method === 'GET') {
        if (mode === 'base-error' && url.pathname.includes('/bases/')) throw new Error(marker);
        if (['hair-error', 'fallback-error'].includes(mode) && url.pathname.includes('/hairstyles/')) throw new Error(marker);
        return new Response(png, { headers: { 'content-type': 'image/png' } });
      }
      assert.equal(request.method, 'PUT');
      if (mode === 'write-error') throw new Error(marker);
      assert.deepEqual(new Uint8Array(await request.arrayBuffer()), png); writes++; storedPreview = true;
      return new Response(null, { status: 200 });
    }
    assert.equal(url.origin, 'https://generativelanguage.googleapis.com', 'All transports must remain synthetic');
    assert.equal(request.method, 'POST');
    assert.equal(url.searchParams.get('key'), 'synthetic-preview-api-key');
    if (mode === 'provider-error') {
      const response = new Response(marker, { status: providerStatus });
      response.text = async () => { upstreamBodyReads++; return marker; };
      return response;
    }
    if (mode === 'provider-transport-error') throw new Error(marker);
    if (mode === 'invalid-json') return new Response(marker, { headers: { 'content-type': 'application/json' } });
    if (mode === 'missing-image') return Response.json({ candidates: [] });
    return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from(png).toString('base64') } }] } }] });
  };
  try {
    const { POST } = await import('../src/app/api/preview/generate/route');
    const bookId = 'book-mvp-simple-adventure';
    const specs = { skinTone: 'light', hairStyle: 'curly-short', hairColor: 'medium-brown', favoriteColor: 'blue', pronouns: 'he-him' };
    const hash = calculatePreviewHash(specs);
    const expectedUrl = `/api/assets/${buildCharacterAssetPrefix(hash, bookId)}/preview.png`;
    async function run(force = true) {
      return POST(new NextRequest('https://admin.example.test/api/preview/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ character_specs: specs, bookId, forceRegenerate: force }) }));
    }
    for (const [failureMode, status, message] of [
      ['base-error', 502, 'Base character image not available'],
      ['hair-error', 502, 'Hairstyle reference not available'],
      ['fallback-error', 502, 'Hairstyle reference not available'],
      ['provider-transport-error', 500, 'Preview generation failed'],
      ['invalid-json', 500, 'Preview generation failed'],
      ['missing-image', 500, 'No image in preview response'],
      ['write-error', 500, 'Preview generation failed'],
      ['config-error', 500, 'Preview generation failed'],
    ] as const) {
      mode = failureMode; logs.length = 0; calls.length = 0;
      process.env.BOOK_CONFIG_RUNTIME_SOURCE = mode === 'config-error' ? 'published' : 'bundled';
      process.env.PREVIEW_HAIR_FALLBACK_DIR = mode === 'fallback-error' ? '/private/tmp/lhl-nonexistent-' + marker : '';
      const response = await run(); assert.equal(response.status, status, mode); assert.deepEqual(await response.json(), { error: message }, mode);
      assert.equal(response.headers.get('access-control-allow-origin'), '*');
      assert.ok(!logs.join('\n').includes(marker), mode + ': no raw exception in any log channel'); checks++;
    }
    process.env.BOOK_CONFIG_RUNTIME_SOURCE = 'bundled'; process.env.PREVIEW_HAIR_FALLBACK_DIR = '';
    mode = 'provider-error';
    for (const status of [400, 403, 429, 500, 503]) {
      providerStatus = status; logs.length = 0;
      const response = await run(); assert.equal(response.status, status >= 500 ? 502 : 400);
      assert.deepEqual(await response.json(), { error: 'Character preview generation failed' }); assert.ok(!logs.join('\n').includes(marker)); checks++;
    }
    assert.equal(upstreamBodyReads, 0, 'Provider rejection bodies must not be read or logged');
    for (const cacheFailure of ['cache-error', 'cache-db-error']) {
      mode = cacheFailure; storedPreview = false; logs.length = 0;
      const response = await run(false); assert.equal(response.status, 200); const body = await response.json();
      assert.equal(body.cached, false); assert.equal(body.imageUrl, expectedUrl); assert.ok(!logs.join('\n').includes(marker)); checks++;
    }
    mode = 'success'; storedPreview = false; calls.length = 0;
    const generated = await run(); assert.equal(generated.status, 200); assert.deepEqual(await generated.json(), { imageUrl: expectedUrl, hash, cached: false }); checks++;
    const written = writes; calls.length = 0;
    const cached = await run(false); assert.equal(cached.status, 200); assert.deepEqual(await cached.json(), { imageUrl: expectedUrl, hash, cached: true });
    assert.equal(writes, written); assert.equal(calls.length, 1); assert.ok(calls[0].startsWith('HEAD ')); checks++;
    // Stage-only diagnostics also cover missing provider configuration.
    process.env.GOOGLE_GEMINI_API_KEY = ''; calls.length = 0;
    const missing = await run(); assert.equal(missing.status, 500); assert.deepEqual(await missing.json(), { error: 'Preview generation unavailable' }); assert.deepEqual(calls, []); checks++;
    originalLog(`Preview diagnostics: ${checks} actual-handler cases passed; only synthetic intercepted transport, zero live requests`);
  } finally { globalThis.fetch = originalFetch; console.log = originalLog; console.warn = originalWarn; console.error = originalError; }
}
void main().catch(error => { console.error(String(error)); process.exitCode = 1; });
