import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

async function main() {
  process.env.SUPABASE_URL = 'https://trigger-w0-db.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'YOUR_TRIGGER_W0_SERVER_KEY';
  process.env.N8N_W0_WEBHOOK_URL = 'https://trigger-w0-webhook.example.test';
  const originalFetch = globalThis.fetch;
  let expectedColumn = 'id', expectedValue = 'eq.123';
  let found = false, lookups = 0;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, 'https://trigger-w0-db.example.test', 'no webhook or real transport');
    assert.equal(url.pathname, '/rest/v1/orders');
    assert.equal(request.method, 'GET', 'lookup only');
    assert.equal(url.searchParams.get(expectedColumn), expectedValue, 'resolved Promise order ID reaches database');
    lookups++;
    return Response.json(found ? { id: 123, orderId: 'synthetic-order', shipping_address: null, character_specs: null } : null);
  };
  try {
    const { POST } = await import('../src/app/api/admin/orders/[orderId]/trigger-w0/route');
    const call = (orderId: string) => POST(new NextRequest('https://admin.example.test/api/admin/orders/' + orderId + '/trigger-w0', { method: 'POST' }), { params: Promise.resolve({ orderId }) } as Parameters<typeof POST>[1]);
    assert.equal((await call('123')).status, 404);
    assert.equal(lookups, 1);
    expectedColumn = 'orderId'; expectedValue = 'eq.synthetic-order'; found = true;
    const response = await call('synthetic-order');
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'Order missing required data');
    assert.equal(lookups, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log('Trigger W0 Promise params: numeric and per-book lookup, missing order/data rejection; no writes or webhook traffic');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
