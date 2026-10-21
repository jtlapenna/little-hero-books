import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { PUBLIC_BODY_LIMITS, readBoundedRequestText, RequestBodyError } from '../src/lib/request-body';

const encoder = new TextEncoder();
const origin = 'https://admin.example.test';
let checks = 0;
function streamed(body: string | Uint8Array, headers: Record<string, string> = {}, chunkSize = 8192, failAfterBody = false, signal?: AbortSignal) {
  const bytes = typeof body === 'string' ? encoder.encode(body) : body;
  let offset = 0, pulls = 0, cancels = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      if (offset < bytes.length) {
        controller.enqueue(bytes.slice(offset, offset += chunkSize));
      } else if (failAfterBody) {
        controller.error(new Error('Synthetic interrupted transport'));
      } else controller.close();
    },
    cancel() { cancels++; },
  }, { highWaterMark: 0 });
  const init: NonNullable<ConstructorParameters<typeof NextRequest>[1]> & { duplex: 'half' } = { method: 'POST', headers, body: stream, duplex: 'half', signal };
  return { request: new NextRequest(origin, init), pulls: () => pulls, cancels: () => cancels };
}
async function expectBodyError(request: Request, max: number, status: number) {
  await assert.rejects(readBoundedRequestText(request, max), error => error instanceof RequestBodyError && error.status === status);
  checks++;
}
async function helperCases() {
  const lengthHeaders: Record<string, string>[] = [{}, { 'content-length': '1' }, { 'content-length': '8' }];
  for (const headers of lengthHeaders) {
    assert.equal(await readBoundedRequestText(streamed('12345678', headers, 1).request, 8), '12345678'); checks++;
    await expectBodyError(streamed('123456789', headers, 1).request, 8, 413);
  }
  const tooLarge = streamed('not read', { 'content-length': '9999999999999999999999' });
  await expectBodyError(tooLarge.request, 8, 413);
  assert.equal(tooLarge.pulls(), 0); assert.equal(tooLarge.cancels(), 1);
  for (const length of ['-1', '1.5', 'NaN', '1, 2']) await expectBodyError(streamed('', { 'content-length': length }).request, 8, 400);
  const stopped = streamed('x'.repeat(100), {}, 9);
  await expectBodyError(stopped.request, 8, 413); assert.equal(stopped.pulls(), 1); assert.equal(stopped.cancels(), 1);
  assert.equal(await readBoundedRequestText(streamed('x'.repeat(20000), {}, 1).request, 20000), 'x'.repeat(20000)); checks++;
  const unicode = 'é🐕';
  assert.equal(await readBoundedRequestText(streamed(unicode, {}, 1).request, 6), unicode); checks++;
  await expectBodyError(streamed(unicode, {}, 1).request, 5, 413);
  for (const bytes of [new Uint8Array([0xef, 0xbb, 0xbf, 0x61]), new Uint8Array([0xff, 0x61])]) {
    assert.equal(await readBoundedRequestText(streamed(bytes, {}, 1).request, 8), await new Response(bytes).text()); checks++;
  }
  assert.equal(await readBoundedRequestText(new Request(origin, { method: 'POST' }), 8), ''); checks++;
  await expectBodyError(streamed('{}', {}, 1, true).request, 8, 400);
  const alreadyAborted = new AbortController(); alreadyAborted.abort();
  await expectBodyError(streamed('{}', {}, 1, false, alreadyAborted.signal).request, 8, 400);
  const abort = new AbortController();
  const pending = new Request(origin, { method: 'POST', signal: abort.signal, body: new ReadableStream({ pull: () => new Promise(() => {}), cancel: () => new Promise(() => {}) }), duplex: 'half' } as RequestInit);
  const rejected = expectBodyError(pending, 8, 400); abort.abort(); await rejected;
  // Rejection must not wait for an uncooperative cancellation hook.
  const hanging = new Request(origin, { method: 'POST', headers: { 'content-length': '2' }, body: new ReadableStream({ cancel: () => new Promise(() => {}) }), duplex: 'half' } as RequestInit);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([expectBodyError(hanging, 1, 413), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Body cancellation blocked rejection')), 250); })]);
  } finally { if (timer) clearTimeout(timer); }
}

async function main() {
  // These are public synthetic fixtures, never environment-file credentials.
  Object.assign(process.env, {
    SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-body-test',
    STRIPE_SECRET_KEY: 'sk_test_synthetic_body', STRIPE_WEBHOOK_SECRET: 'whsec_synthetic_body',
    CLOUDFLARE_ACCOUNT_ID: 'synthetic-body', R2_ACCESS_KEY_ID: 'synthetic-access', R2_SECRET_ACCESS_KEY: 'synthetic-secret',
    D2C_FRONTEND_ORIGIN: 'https://www.littleherolabs.com', GOOGLE_GEMINI_API_KEY: '',
  });
  const originalFetch = globalThis.fetch, originalLog = console.log, originalError = console.error;
  let transport: 'deny' | 'checkout' | 'stripe' | 'cache' = 'deny';
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    calls.push(request.method + ' ' + url.hostname + url.pathname);
    if ((transport === 'checkout' || transport === 'stripe') && url.hostname === 'db.example.test') {
      if (url.pathname === '/rest/v1/idempotency_keys') {
        assert.ok(['GET', 'POST'].includes(request.method));
        return new Response(request.method === 'GET' ? 'null' : null, { status: request.method === 'GET' ? 200 : 201, headers: { 'content-type': 'application/json' } });
      }
      assert.equal(transport, 'checkout'); assert.equal(url.pathname, '/rest/v1/orders'); assert.equal(request.method, 'POST');
      return Response.json({ id: 1 });
    }
    if (transport === 'checkout' && url.hostname === 'api.stripe.com') {
      assert.equal(url.pathname, '/v1/checkout/sessions'); assert.equal(request.method, 'POST');
      return Response.json({ id: 'cs_test_synthetic', object: 'checkout.session', url: 'https://checkout.example.test/synthetic' });
    }
    if (transport === 'cache' && url.hostname.endsWith('.synthetic-body.r2.cloudflarestorage.com')) {
      assert.equal(request.method, 'HEAD'); return new Response(null, { status: 200 });
    }
    throw new Error('Unapproved synthetic transport: ' + request.method + ' ' + url.hostname + url.pathname);
  };
  console.log = () => {}; console.error = () => {};
  try {
    // The hanging cancellation test requires an oversized declared length.
    await helperCases();
    const preview = await import('../src/app/api/preview/generate/route');
    const checkout = await import('../src/app/api/checkout/create/route');
    const stripeHook = await import('../src/app/api/webhooks/stripe/route');
    const stripe = new Stripe('sk_test_synthetic_body');
    const event = JSON.stringify({ id: 'evt_synthetic_body', object: 'event', type: 'synthetic.unsupported', data: { object: { name: 'é🐕' } } }, null, 2) + '\n';
    const signed = stripe.webhooks.generateTestHeaderString({ payload: event, secret: process.env.STRIPE_WEBHOOK_SECRET! });
    const routes: Array<{ name: string; post: (request: NextRequest) => Promise<Response>; limit: number; headers: Record<string, string> }> = [
      { name: 'preview', post: preview.POST, limit: PUBLIC_BODY_LIMITS.preview, headers: { 'content-type': 'application/json' } },
      { name: 'checkout', post: checkout.POST, limit: PUBLIC_BODY_LIMITS.checkout, headers: { 'content-type': 'application/json', 'idempotency-key': 'synthetic-body' } },
      { name: 'stripe', post: stripeHook.POST, limit: PUBLIC_BODY_LIMITS.stripeWebhook, headers: { 'stripe-signature': signed } },
    ];
    for (const route of routes) {
      for (const declared of [undefined, '1', String(route.limit + 1)]) {
        calls.length = 0;
        const headers: Record<string, string> = { ...route.headers };
        if (declared !== undefined) headers['content-length'] = declared;
        const fixture = streamed(' '.repeat(route.limit + 1), headers);
        const response = await route.post(fixture.request);
        assert.equal(response.status, 413, route.name + '/' + declared);
        assert.equal((await response.json()).error, 'Request body too large');
        assert.deepEqual(calls, [], 'oversize cannot touch DB/storage/provider');
        if (route.name !== 'stripe') assert.ok(response.headers.get('access-control-allow-origin'));
        if (declared === String(route.limit + 1)) assert.equal(fixture.pulls(), 0);
        checks++;
      }
      calls.length = 0;
      const incomplete = await route.post(streamed('{}', { ...route.headers }, 1, true).request);
      assert.equal(incomplete.status, 400, route.name + '/interrupted'); assert.deepEqual(calls, []); checks++;
      const abort = new AbortController(); abort.abort(); calls.length = 0;
      assert.equal((await route.post(streamed('{}', { ...route.headers }, 1, false, abort.signal).request)).status, 400);
      assert.deepEqual(calls, []); checks++;
      calls.length = 0;
      const malformedLength = await route.post(streamed('{}', { ...route.headers, 'content-length': '-1' }).request);
      assert.equal(malformedLength.status, 400); assert.deepEqual(calls, []); checks++;
    }
    const validPreview = { character_specs: { name: 'Synthetic é🐕', age: 5, hometown: 'Test Town', skinTone: 'light', hairStyle: 'curly-short', hairColor: 'brown', favoriteColor: 'blue', favoriteAnimal: 'dog' }, bookId: 'book-mvp-simple-adventure', formatId: 'standard' };
    calls.length = 0;
    assert.equal((await preview.POST(streamed(JSON.stringify(validPreview), {}, 1, true).request)).status, 400);
    assert.deepEqual(calls, [], 'even a complete valid JSON prefix cannot hide a stream failure'); checks++;
    for (const [label, value, status] of [['malformed', '{', 400], ['empty', '', 400]] as const) {
      calls.length = 0;
      assert.equal((await preview.POST(streamed(value).request)).status, status, label);
      assert.deepEqual(calls, []); checks++;
    }
    calls.length = 0;
    assert.equal((await checkout.POST(streamed('{}').request)).status, 400); assert.deepEqual(calls, []); checks++;
    assert.equal((await stripeHook.POST(streamed('oversized', { 'content-length': String(PUBLIC_BODY_LIMITS.stripeWebhook + 1) }).request)).status, 401); checks++;
    transport = 'cache'; calls.length = 0;
    const cached = await preview.POST(streamed(JSON.stringify(validPreview), {}, 1).request);
    assert.equal(cached.status, 200); assert.equal((await cached.json()).cached, true); assert.equal(calls.length, 1); checks++;
    transport = 'deny'; calls.length = 0;
    const forced = await preview.POST(streamed(JSON.stringify({ ...validPreview, forceRegenerate: true })).request);
    assert.equal(forced.status, 500); assert.equal((await forced.json()).error, 'Gemini API key not configured'); assert.deepEqual(calls, []); checks++;
    const validShape = {
      shipping_address: { name: 'Synthetic Adult', address_line1: '1 Test Lane', city: 'Test City', state: 'CA', postal_code: '00000', country: 'US' },
      customer_email: 'buyer@example.test', shipping_tier: 'mail',
      product_info: { bookId: validPreview.bookId, formatId: 'standard' },
      books: Array.from({ length: 5 }, () => ({ character_specs: validPreview.character_specs, dedication: 'é'.repeat(200) })),
    };
    assert.ok(encoder.encode(JSON.stringify(validShape)).length < PUBLIC_BODY_LIMITS.checkout);
    transport = 'checkout'; calls.length = 0;
    const result = await checkout.POST(streamed(JSON.stringify(validShape), { 'idempotency-key': 'synthetic-five-books', origin: 'https://www.littleherolabs.com' }, 1).request);
    assert.equal(result.status, 201); const receipt = await result.json();
    assert.equal(receipt.book_count, 5); assert.equal(receipt.order_ids.length, 5); assert.equal(receipt.stripe_checkout_session_url, 'https://checkout.example.test/synthetic');
    assert.equal(calls.filter(call => call === 'POST db.example.test/rest/v1/orders').length, 5);
    assert.equal(calls.filter(call => call === 'POST api.stripe.com/v1/checkout/sessions').length, 1); checks++;
    transport = 'stripe'; calls.length = 0;
    const verified = await stripeHook.POST(streamed(event, { 'stripe-signature': signed }, 1).request);
    assert.equal(verified.status, 200); assert.deepEqual(await verified.json(), { received: true }); assert.equal(calls.length, 2); checks++;
    calls.length = 0;
    const invalidUtf8 = new Uint8Array([0xff, ...encoder.encode(event)]);
    assert.equal((await stripeHook.POST(streamed(invalidUtf8, { 'stripe-signature': signed }).request)).status, 400);
    assert.deepEqual(calls, []); checks++;
    for (const [payload, signature] of [[event + ' ', signed], ['\uFEFF' + event, signed], ['\uFEFF\uFEFF' + event, signed], [event, stripe.webhooks.generateTestHeaderString({ payload: event, secret: 'wrong-synthetic-secret' })], [event, stripe.webhooks.generateTestHeaderString({ payload: event, secret: process.env.STRIPE_WEBHOOK_SECRET!, timestamp: 1 })]]) {
      calls.length = 0;
      assert.equal((await stripeHook.POST(streamed(payload, { 'stripe-signature': signature }, 1).request)).status, 401);
      assert.deepEqual(calls, []); checks++;
    }
  } finally { globalThis.fetch = originalFetch; console.log = originalLog; console.error = originalError; }
  console.log(`Bounded public bodies: ${checks} helper/actual-route cases passed; only synthetic intercepted transport, zero live requests`);
}
// An unresolved Promise alone does not keep Node alive: fail rather than silently
// passing if an abort/cancellation regression leaves a test suspended.
const watchdog = setTimeout(() => { console.error('Bounded body regression timed out'); process.exit(1); }, 30_000);
void main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
