import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { buildBookConfigPublishPayload } from '../src/lib/books/runtime-book-config';

async function main() {
  Object.assign(process.env, { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-only',
    BACKEND_API_TOKEN: 'synthetic-only', CLOUDFLARE_ACCOUNT_ID: 'synthetic-account',
    CLOUDFLARE_R2_ACCESS_KEY_ID: 'synthetic-access', CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'synthetic-secret' });
  const config = loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 2 });
  const published = buildBookConfigPublishPayload(config, { activate: true });
  const originalFetch = globalThis.fetch;
  let row: Record<string, unknown> | null = null;
  const manifests = new Map<string, unknown>();
  let reads = 0;
  let writes = 0;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const method = init?.method ?? request.method;
    if (method !== 'GET') { writes++; throw new Error('Builder attempted a forbidden external write'); }
    reads++;
    const url = new URL(request.url);
    if (url.origin === 'https://db.example.test') {
      assert(['/rest/v1/orders', '/rest/v1/book_configs'].includes(url.pathname));
      return Response.json(url.pathname.endsWith('book_configs') ? [published] : row ? [row] : []);
    }
    assert.equal(url.hostname, 'little-hero-orders.synthetic-account.r2.cloudflarestorage.com');
    assert.equal(request.headers.get('Authorization')?.startsWith('AWS4-HMAC-SHA256'), true);
    return manifests.has(url.pathname) ? Response.json(manifests.get(url.pathname)) : new Response('absent', { status: 404 });
  };
  try {
    const { POST } = await import('../src/app/api/internal/w0/build-manifest/route');
    for (const format of ['standard', 'amazon']) {
      row = null; manifests.clear();
      const orderId = `TEST-GELATO-BUILD-READONLY-${format}`;
      const body = { schemaVersion: 'v3', bookId: config.bookId, formatId: format, configVersion: 2, configSource: 'published',
        payload: { orderId, ...(format === 'amazon' ? { amazonOrderId: orderId } : {}), bookSpecs: { testMode: true } } };
      const send = () => POST(new NextRequest('https://admin.example.test/api/internal/w0/build-manifest', {
        method: 'POST', headers: { Authorization: 'Bearer synthetic-only', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }));
      for (const state of ['absent', 'held', 'frozen']) {
        const response = await send();
        assert.equal(response.status, 200, `${format}/${state} must build through the actual route without publication`);
        const result = await response.json() as { orderId: string; manifestKey: string; manifest: unknown; orderUpsert: Record<string, unknown> };
        assert.equal(result.orderId, orderId);
        assert.equal(result.orderUpsert.print_provider, 'gelato');
        assert.equal(result.orderUpsert.print_api_page_count, 32);
        assert.equal(result.orderUpsert.print_expected_pdf_page_count, 35);
        assert.equal(writes, 0, 'No database or storage mutation permitted');
        if (state === 'absent') row = { id: 1, ...result.orderUpsert, execution_status: 'done', next_workflow: null };
        if (state === 'held') manifests.set('/' + result.manifestKey, result.manifest);
      }
    }
    assert(reads > 0);
  } finally { globalThis.fetch = originalFetch; }
  console.log('Actual W0 builder: published config -> absent/held/frozen website and Amazon inputs; only signed R2/DB GETs, zero writes, zero real network calls');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
