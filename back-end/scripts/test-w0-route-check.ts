import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

async function main() {
  const previousToken = process.env.BACKEND_API_TOKEN;
  const previousSetting = process.env.N8N_W0_WEBHOOK_URL;
  const previousFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => { attempts++; throw Error('Network forbidden'); };
  process.env.BACKEND_API_TOKEN = 'synthetic-route-check-token';
  const request = (authorized = true, query = '') => new NextRequest(`https://backend.example.test/api/internal/w0/build-manifest${query}`, {
    headers: authorized ? { Authorization: 'Bearer synthetic-route-check-token' } : {},
  });
  try {
    const { GET } = await import('../src/app/api/internal/w0/build-manifest/route');
    const unauthorized = await GET(request(false));
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await unauthorized.json(), { error: 'Unauthorized' });
    assert.equal((await GET(request(true, '?probe=1'))).status, 400);
    for (const [setting, expected] of [
      [undefined, 'unset'], ['', 'unset'],
      ['https://thepeakbeyond.app.n8n.cloud/webhook/order-intake-repo', 'selected-w0'],
      ['https://thepeakbeyond.app.n8n.cloud/webhook/order-intake-sibtest', 'sibling-w0'],
      ['https://thepeakbeyond.app.n8n.cloud/webhook/order-intake', 'legacy-w0'],
      ['https://other.example.test/webhook/order-intake-repo', 'other'],
      ['https://thepeakbeyond.app.n8n.cloud/webhook/order-intake-repo?token=synthetic-private', 'other'],
      ['https://user:synthetic-private@thepeakbeyond.app.n8n.cloud/webhook/order-intake-repo', 'other'],
      ['https://thepeakbeyond.app.n8n.cloud/webhook/order-intake-repo#synthetic-private', 'other'],
      ['http://thepeakbeyond.app.n8n.cloud/webhook/order-intake-repo', 'other'],
      ['https://thepeakbeyond.app.n8n.cloud/webhook/order-intake-repo/', 'other'],
      ['synthetic-private-invalid-url', 'invalid'],
    ] as const) {
      if (setting === undefined) delete process.env.N8N_W0_WEBHOOK_URL;
      else process.env.N8N_W0_WEBHOOK_URL = setting;
      const response = await GET(request());
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const body = await response.json();
      assert.deepEqual(body, {
        schema: 'lhl.w0-route-check@1', w0Setting: { configured: Boolean(setting), target: expected },
        selectedWorkflowId: '9E0oVs46bMoiyRIP',
      });
      assert.ok(!JSON.stringify(body).includes('synthetic-private'));
    }
    assert.equal(attempts, 0, 'Read-only route check must never call services');
    console.log('Authenticated W0 route check passed: exact target, missing/invalid settings, no raw URL, no fetches');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.BACKEND_API_TOKEN;
    else process.env.BACKEND_API_TOKEN = previousToken;
    if (previousSetting === undefined) delete process.env.N8N_W0_WEBHOOK_URL;
    else process.env.N8N_W0_WEBHOOK_URL = previousSetting;
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
