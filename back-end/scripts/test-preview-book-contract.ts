import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { NextRequest } from 'next/server';

async function main() {
  Object.assign(process.env, {
    SUPABASE_URL: 'https://db.example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-preview-proof',
    CLOUDFLARE_ACCOUNT_ID: 'synthetic-preview',
    R2_ACCESS_KEY_ID: 'synthetic-access',
    R2_SECRET_ACCESS_KEY: 'synthetic-secret',
  });
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalWarn = console.warn;
  let bookId = 'book-finding-our-inner-voice';
  let approval = 'pending';
  let tokenState = 'valid';
  const orderId = 'TEST-PREVIEW-CONTRACT-item-1';
  const fixtures: Record<string, unknown> = {};
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    assert.equal(request.method, 'GET', 'preview transport must remain read-only');
    if (url.hostname === 'db.example.test') {
      const row = url.pathname.endsWith('/preview_tokens')
        ? { order_id: orderId, expires_at: tokenState === 'expired' ? '2000-01-01' : '2999-01-01', used_at: tokenState === 'used' ? '2026-01-01' : null }
        : { id: 1, orderId, asset_prefix: `${bookId}/orders/${orderId}`, book_specs: { bookId }, customer_approval_status: approval, character_specs: { childName: 'Test Child', age: 6 }, customer_name: 'Test Parent' };
      const body = request.headers.get('Accept')?.includes('vnd.pgrst.object') ? row : [row];
      return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    }
    assert.equal(url.hostname, 'synthetic-preview.r2.cloudflarestorage.com', 'unexpected external transport');
    assert.ok(url.pathname.includes(`/${bookId}/orders/${orderId}/manifests/`));
    return new Response(JSON.stringify({ order: { orderId, assetPrefix: `${bookId}/orders/${orderId}/`, characterSpecs: { childName: 'Test Child', age: 6 } } }));
  };
  console.log = () => undefined;
  console.warn = () => undefined;
  try {
    const { POST } = await import('../src/app/api/preview/validate-token/route');
    for (bookId of ['book-finding-our-inner-voice', 'book-mvp-simple-adventure']) {
      for (tokenState of ['valid', 'used', 'expired']) {
        for (approval of ['pending', 'approved']) {
          const response = await POST(new NextRequest('http://localhost:3117/api/preview/validate-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'synthetic-preview-token' }) }));
          assert.equal(response.status, 200);
          const body = await response.json();
          assert.equal(body.order.manifest3Key, `${bookId}/orders/${orderId}/manifests/3-manifest.json`);
          assert.equal(body.order.customerApprovalStatus, approval);
          assert.equal(body.valid, tokenState === 'valid');
          assert.equal(Boolean(body.used), tokenState === 'used');
          assert.equal(Boolean(body.expired), tokenState === 'expired');
          fixtures[`${bookId}-${tokenState}-${approval}`] = body;
        }
      }
    }
    if (process.env.PREVIEW_CONTRACT_FIXTURE_OUTPUT) writeFileSync(process.env.PREVIEW_CONTRACT_FIXTURE_OUTPUT, JSON.stringify(fixtures));
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    console.warn = originalWarn;
  }
  console.log('Preview token API: canonical book manifest and approval fields pass');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
