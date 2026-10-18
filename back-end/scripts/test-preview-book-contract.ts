import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { NextRequest } from 'next/server';

async function main() {
  Object.assign(process.env, {
    SUPABASE_URL: 'https://db.example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-preview-proof',
    CLOUDFLARE_ACCOUNT_ID: 'synthetic-preview',
    BACKEND_API_TOKEN: 'synthetic-preview-file-authority-with-enough-entropy',
    R2_ACCESS_KEY_ID: 'synthetic-access',
    R2_SECRET_ACCESS_KEY: 'synthetic-secret',
  });
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalWarn = console.warn;
  let bookId = 'book-finding-our-inner-voice';
  let approval = 'pending';
  let tokenState = 'valid';
  let previewState = 'ready';
  let checks = 0;
  const orderId = 'TEST-PREVIEW-CONTRACT-item-1';
  const fixtures: Record<string, unknown> = {};
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    assert.equal(request.method, 'GET', 'preview transport must remain read-only');
    if (url.hostname === 'db.example.test') {
      const row = url.pathname.endsWith('/preview_tokens')
        ? { order_id: orderId, expires_at: tokenState === 'expired' ? '2000-01-01' : '2999-01-01', used_at: tokenState === 'used' ? '2026-01-01' : null }
        : { id: 1, orderId, asset_prefix: `${bookId}/orders/${orderId}`, book_specs: { bookId }, customer_approval_status: approval, character_specs: { childName: 'Test Child', age: 6 }, customer_name: 'Test Parent',
            customer_approval_required: true, manifest_3_url: previewState === 'missing-manifest' ? null : `${bookId}/orders/${orderId}/manifests/3-manifest.json`,
            workflow_step: 'customer_approval', execution_status: previewState === 'busy' ? 'processing' : 'done',
            current_workflow: previewState === 'busy' ? '3' : null, started_at: previewState === 'busy' ? '2026-01-01' : null,
            review_stages: { postPdf: { status: previewState === 'unreviewed' ? 'in_review' : 'approved' } },
            print_submission_id: previewState === 'claimed' ? '11111111-1111-4111-8111-111111111111' : null };
      const body = request.headers.get('Accept')?.includes('vnd.pgrst.object') ? row : [row];
      return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    }
    assert.ok(url.hostname.endsWith('.synthetic-preview.r2.cloudflarestorage.com'), 'unexpected external transport');
    assert.ok(url.pathname.includes(`/${bookId}/orders/${orderId}/manifests/`));
    return new Response(JSON.stringify({ order: { orderId, assetPrefix: `${bookId}/orders/${orderId}/`, characterSpecs: { childName: 'Test Child', age: 6 } } }));
  };
  console.log = () => undefined;
  console.warn = () => undefined;
  try {
    const { POST } = await import('../src/app/api/preview/validate-token/route');
    for (bookId of ['book-finding-our-inner-voice', 'book-mvp-simple-adventure']) {
      for (tokenState of ['valid', 'used', 'expired']) {
        for (approval of ['pending', 'approved', 'revision_requested']) {
          for (previewState of ['ready', 'busy', 'unreviewed', 'missing-manifest', 'claimed']) {
            const response = await POST(new NextRequest('http://localhost:3117/api/preview/validate-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'synthetic-preview-token' }) }));
            checks++;
            assert.equal(response.status, tokenState === 'expired' ? 401 : 200);
            const body = await response.json();
            if (tokenState === 'expired') { assert.equal(body.order, undefined); assert.equal(body.canApprove, false); continue; }
            assert.equal(body.readValid, true);
            assert.equal(body.canApprove, previewState === 'ready' && tokenState === 'valid' && approval === 'pending', [bookId, tokenState, approval, previewState].join('/'));
            assert.equal(body.order.manifest3Key, `${bookId}/orders/${orderId}/manifests/3-manifest.json`);
            assert.equal(body.order.customerApprovalStatus, approval);
            assert.equal(body.valid, tokenState === 'valid');
            assert.equal(Boolean(body.used), tokenState === 'used');
            assert.equal(Boolean(body.expired), tokenState === 'expired');
            if (previewState === 'ready') fixtures[`${bookId}-${tokenState}-${approval}`] = body;
          }
        }
      }
    }
    if (process.env.PREVIEW_CONTRACT_FIXTURE_OUTPUT) writeFileSync(process.env.PREVIEW_CONTRACT_FIXTURE_OUTPUT, JSON.stringify(fixtures));
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    console.warn = originalWarn;
  }
  console.log(JSON.stringify({passed:true,checks,scope:'Actual preview token API: canonical book and completed preview fields, read-only busy/unreviewed/missing/claimed states, used/expired links and revision requested',liveRequests:0}));
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
