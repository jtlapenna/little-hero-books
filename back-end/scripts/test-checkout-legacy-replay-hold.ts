import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { connect } from 'node:net';

async function main() {
  for (const host of ['127.0.0.1', '192.0.2.1']) await new Promise<void>((resolve, reject) => {
    const socket = connect(443, host);
    socket.setTimeout(1500, () => { socket.destroy(); reject(Error('Network denial not proven')); });
    socket.on('connect', () => { socket.destroy(); reject(Error('Network unexpectedly connected')); });
    socket.on('error', error => ['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code || '') ? resolve() : reject(error));
  });
  Object.assign(process.env, { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic', STRIPE_SECRET_KEY: 'sk_test_synthetic', D2C_FRONTEND_ORIGIN: 'https://www.littleherolabs.com' });
  const oldSession = { order_id: 'synthetic-old-order', stripe_checkout_session_url: 'https://checkout.example.test/old' };
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    calls.push(`${request.method} ${url.hostname}${url.pathname}`);
    if (request.method === 'GET' && url.hostname === 'db.example.test' && url.pathname === '/rest/v1/idempotency_keys') {
      return Response.json({ response_status: 201, response_body: oldSession, created_at: new Date().toISOString() });
    }
    throw Error(`Unexpected transport: ${request.method} ${url.hostname}${url.pathname}`);
  };
  const { POST: oldPost } = await import('./fixtures/checkout-route-before-extraction');
  const { POST: strictPost } = await import('../src/app/api/checkout/create/route');
  const body = {
    shipping_address: { name: 'Test Adult', address_line1: '1 Test Lane', city: 'Test', state: 'CA', postal_code: '00000', country: 'US' },
    customer_email: 'buyer@example.test', character_specs: { name: 'A', age: '7years', favoriteAnimal: 'cat' },
  };
  const request = (payload: unknown) => new NextRequest('https://admin.example.test/api/checkout/create', {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'synthetic-legacy-key' }, body: JSON.stringify(payload),
  });
  const baseline = await oldPost(request(body));
  assert.equal(baseline.status, 201);
  assert.deepEqual(await baseline.json(), oldSession);
  assert.deepEqual(calls, ['GET db.example.test/rest/v1/idempotency_keys']);
  calls.length = 0;
  const invalid = await strictPost(request(body));
  assert.equal(invalid.status, 400);
  const invalidBody = await invalid.json();
  assert.ok(invalidBody.fields.some((field: { path: string }) => field.path === 'character_specs.age'));
  assert.deepEqual(calls, [], 'Strict parsing rejects a previously replayable request before the cache lookup');
  const corrected = await strictPost(request({ ...body, character_specs: { ...body.character_specs, age: 7 } }));
  assert.equal(corrected.status, 201);
  assert.deepEqual(await corrected.json(), oldSession, 'An edited request with the same key receives the unbound old session');
  assert.deepEqual(calls, ['GET db.example.test/rest/v1/idempotency_keys']);
  console.log('Legacy replay hold reproduced: strict retry rejects; edited retry receives prior unbound session.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
