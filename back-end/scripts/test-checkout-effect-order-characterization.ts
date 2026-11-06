import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { NextRequest } from 'next/server';

// This probe measures an unsafe baseline. It is not a production safety gate.
type Json = Record<string, any>;
type Cached = { key: string; response_status: number; response_body: Json; created_at: string };
type Session = { root: string; url: string; retryKey: string };
type Result = { status: number; body: Json };
const mode = process.argv[2];
assert.ok(mode === '--observe' || mode === '--assert-safe', 'Choose --observe or --assert-safe explicitly');
const injectAdapterFailure = process.argv[3] === '--probe-caught-adapter-failure';
assert.ok(process.argv.length === 3 || (process.argv.length === 4 && mode === '--observe' && injectAdapterFailure), 'Unexpected arguments');
let injected = false;
const observing = mode === '--observe';
const observations: Json[] = [];
const unsafe: string[] = [];
const forbidden: string[] = [];
const adapterErrors: string[] = [];
let cache = new Map<string, Cached>();
let rows: Json[] = [], sessions: Session[] = [];
let configRow: Json;
let failWrites = 0, transportCalls = 0;
let missBarrier: (() => Promise<void>) | undefined;

async function proveNetworkDenied() {
  for (const host of ['127.0.0.1', '192.0.2.1']) await new Promise<void>((resolve, reject) => {
    const socket = connect(443, host);
    socket.setTimeout(1500, () => { socket.destroy(); reject(Error('Network denial not proven')); });
    socket.on('connect', () => { socket.destroy(); reject(Error('Network unexpectedly connected')); });
    socket.on('error', error => {
      socket.destroy();
      ['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code || '') ? resolve() : reject(error);
    });
  });
}

function twoMisses() {
  let arrivals = 0, release!: () => void;
  const both = new Promise<void>(resolve => { release = resolve; });
  return async () => {
    assert.ok(++arrivals <= 2, 'Unexpected extra initial cache lookup');
    if (arrivals === 2) release();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([both, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error('Two-miss barrier timed out')), 2000);
      })]);
    } finally { clearTimeout(timer); }
  };
}

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try { return await handleFetch(input, init); }
  catch (error) {
    adapterErrors.push(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function handleFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  transportCalls++;
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url), body = await request.text();
  if (url.origin === 'https://db.example.test' && url.pathname === '/rest/v1/idempotency_keys') {
    if (request.method === 'GET') {
      const predicate = url.searchParams.get('key');
      if (injectAdapterFailure && !injected && predicate === 'eq.evt_synthetic_namespace') {
        injected = true; throw Error('Injected cache lookup transport failure');
      }
      assert.ok(predicate?.startsWith('eq.'), 'Cache query must bind a key');
      const stored = cache.get(predicate!.slice(3));
      const snapshot = stored ? structuredClone(stored) : null;
      if (url.searchParams.get('select')?.includes('created_at') && missBarrier) await missBarrier();
      return Response.json(snapshot);
    }
    if (request.method === 'POST') {
      const value: Cached = JSON.parse(body);
      if (failWrites-- > 0) return Response.json({ code: 'SYNTHETIC', message: 'Synthetic cache write refused' }, { status: 400 });
      if (cache.has(value.key)) return Response.json({ code: '23505', message: 'Synthetic unique-key conflict' }, { status: 409 });
      cache.set(value.key, structuredClone(value));
      return new Response(null, { status: 201 });
    }
  }
  if (url.origin === 'https://db.example.test' && url.pathname === '/rest/v1/book_configs' && request.method === 'GET') return Response.json(configRow);
  if (url.origin === 'https://db.example.test' && url.pathname === '/rest/v1/orders' && request.method === 'POST') {
    rows.push(JSON.parse(body));
    return Response.json({ id: rows.length });
  }
  if (url.origin === 'https://api.stripe.com' && url.pathname === '/v1/checkout/sessions' && request.method === 'POST') {
    const params = new URLSearchParams(body);
    const retryKey = request.headers.get('idempotency-key') || '';
    assert.match(retryKey, /^stripe-node-retry-[0-9a-f-]{36}$/);
    const root = params.get('metadata[root_order_id]') || params.get('metadata[order_id]');
    assert.ok(root, 'Provider request must identify operation');
    const syntheticUrl = `https://checkout.example.test/synthetic-${sessions.length + 1}`;
    sessions.push({ root, url: syntheticUrl, retryKey });
    return Response.json({ id: `cs_test_synthetic_${sessions.length}`, object: 'checkout.session', url: syntheticUrl });
  }
  const attempted = `${request.method} ${url.origin}${url.pathname}`;
  forbidden.push(attempted);
  throw Error('Forbidden transport: ' + attempted);
}

function reset() { cache = new Map(); rows = []; sessions = []; failWrites = 0; missBarrier = undefined; }
function safety(label: string, condition: boolean) { if (!condition) unsafe.push(label); }
function boundResponse(result: Result) {
  return result.status === 201 && sessions.some(s => s.root === result.body.order_id && s.url === result.body.stripe_checkout_session_url);
}
function verifyEffects(bookId: string, children: number, operations: number) {
  assert.equal(rows.length, children * operations);
  assert.equal(sessions.length, operations);
  assert.equal(new Set(sessions.map(s => s.root)).size, operations);
  assert.equal(new Set(sessions.map(s => s.retryKey)).size, operations);
  for (const session of sessions) {
    const members = rows.filter(row => row.root_order_id === session.root);
    assert.equal(members.length, children);
    assert.deepEqual(members.map(row => row.orderId), children === 1 ? [session.root] : [session.root + '-item-1', session.root + '-item-2']);
    for (const row of members) {
      assert.equal(row.product_info.bookId, bookId);
      assert.equal(row.status, 'pending_payment');
    }
  }
}

function hashSources() {
  const paths = [
      'src/lib/idempotency.ts', 'src/app/api/checkout/create/route.ts', 'src/app/api/webhooks/stripe/route.ts',
      'src/lib/checkout-preparation-strict.ts', 'src/lib/checkout-preparation-v1.ts',
      'src/lib/books/configs/book-finding-our-inner-voice/v2.json', 'package-lock.json',
      'scripts/test-checkout-effect-order-characterization.ts',
    ];
  return Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
}

async function main() {
  const sourceHashes = hashSources();
  await proveNetworkDenied();
  Object.assign(process.env, {
    SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic',
    STRIPE_SECRET_KEY: 'sk_test_synthetic', STRIPE_WEBHOOK_SECRET: 'whsec_synthetic',
    D2C_FRONTEND_ORIGIN: 'https://www.littleherolabs.com', D2C_INNER_VOICE_V2_SALES_ENABLED: '1',
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  try {
    const { POST: checkout } = await import('../src/app/api/checkout/create/route');
    const { POST: webhook } = await import('../src/app/api/webhooks/stripe/route');
    const { default: Stripe } = await import('stripe');
    const { loadBundledBookConfig } = await import('../src/lib/books/load-book-config');
    const { computeBookConfigChecksum } = await import('../src/lib/books/runtime-book-config');
    const inner = { ...loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 2 }), status: 'active' as const };
    configRow = { book_id: inner.bookId, version: 2, is_active: true, config_json: inner, checksum: computeBookConfigChecksum(inner) };
    const base = {
      shipping_address: { name: 'Synthetic Adult', address_line1: '1 Test Lane', city: 'Test', state: 'CA', postal_code: '00000', country: 'US' },
      customer_email: 'buyer@example.test',
    };
    function payload(bookId: string, children: number): Json {
      const characters = [{ name: 'Alexandra', age: 5, animalGuide: 'cat' }, { name: 'James', age: 7, animalGuide: 'owl' }];
      return { ...base, product_info: { bookId, formatId: 'standard' }, ...(children === 1 ? { character_specs: characters[0] } : { books: characters.map(character_specs => ({ character_specs })) }) };
    }
    async function run(body: Json, key: string): Promise<Result> {
      const response = await checkout(new NextRequest('https://admin.example.test/api/checkout/create', {
        method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body),
      }));
      return { status: response.status, body: await response.json() };
    }
    for (const bookId of ['book-mvp-simple-adventure', 'book-finding-our-inner-voice']) for (const children of [1, 2]) {
      const label = `${bookId}/${children}`, input = payload(bookId, children);
      reset(); missBarrier = twoMisses();
      const raced = await Promise.all([run(input, 'race'), run(input, 'race')]);
      missBarrier = undefined;
      assert.deepEqual(raced.map(r => r.status), [201, 201]);
      verifyEffects(bookId, children, sessions.length);
      const equalResponses = JSON.stringify(raced[0]) === JSON.stringify(raced[1]);
      if (observing) { assert.deepEqual(raced[0], raced[1]); assert.equal(sessions.length, 2); }
      observations.push({ scenario: 'concurrent-miss', label, rows: rows.length, sessions: sessions.length, distinctRoots: new Set(sessions.map(s => s.root)).size, distinctRetryKeys: new Set(sessions.map(s => s.retryKey)).size, equalResponses });
      safety(label + ': concurrent single execution', sessions.length === 1 && equalResponses && raced.every(boundResponse));

      reset();
      const stale = { order_id: 'expired-operation', stripe_checkout_session_url: 'https://checkout.example.test/expired' };
      cache.set('expired', { key: 'expired', response_status: 201, response_body: stale, created_at: new Date(Date.now() - 48 * 3600000).toISOString() });
      const expired = await run(input, 'expired');
      assert.equal(expired.status, 201);
      verifyEffects(bookId, children, sessions.length);
      if (observing) { assert.deepEqual(expired.body, stale); assert.equal(sessions.length, 1); }
      observations.push({ scenario: 'expired-cache', label, rows: rows.length, sessions: sessions.length, returnedOldSessionAfterNewEffect: sessions.length > 0 && expired.body.stripe_checkout_session_url === stale.stripe_checkout_session_url });
      safety(label + ': expired response binds effects', sessions.length <= 1 && (sessions.length === 0 ? expired.body.order_id === stale.order_id && expired.body.stripe_checkout_session_url === stale.stripe_checkout_session_url : boundResponse(expired)));

      reset(); failWrites = 1;
      const lost = await run(input, 'write-failure');
      assert.equal(lost.status, 201); if (observing) assert.equal(cache.size, 0);
      const retried = await run(input, 'write-failure');
      assert.equal(retried.status, 201);
      verifyEffects(bookId, children, sessions.length);
      const changedReturnedSession = lost.body.stripe_checkout_session_url !== retried.body.stripe_checkout_session_url;
      if (observing) { assert.notEqual(lost.body.order_id, retried.body.order_id); assert.ok(changedReturnedSession); assert.equal(sessions.length, 2); }
      observations.push({ scenario: 'cache-write-failure-retry', label, rows: rows.length, sessions: sessions.length, changedReturnedSession });
      safety(label + ': failed cache write does not duplicate', sessions.length === 1 && !changedReturnedSession && lost.body.order_id === retried.body.order_id && boundResponse(lost) && boundResponse(retried));
    }

    reset();
    const event = { id: 'evt_synthetic_namespace', object: 'event', type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_test_no_metadata', object: 'checkout.session', metadata: {} } } };
    const raw = JSON.stringify(event);
    const stripe = new Stripe('sk_test_synthetic');
    const signature = stripe.webhooks.generateTestHeaderString({ payload: raw, secret: 'whsec_synthetic' });
    const beforeInvalid = transportCalls;
    const invalid = await webhook(new NextRequest('https://admin.example.test/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 'invalid' }, body: raw }));
    assert.equal(invalid.status, 401); assert.equal(transportCalls, beforeInvalid);
    const signed = await webhook(new NextRequest('https://admin.example.test/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': signature }, body: raw }));
    assert.equal(signed.status, 200); assert.deepEqual(await signed.json(), { received: true });
    const collided = await run(payload('book-mvp-simple-adventure', 1), event.id);
    verifyEffects('book-mvp-simple-adventure', 1, sessions.length);
    if (observing) {
      assert.equal(collided.status, 200); assert.deepEqual(collided.body, { received: true });
      assert.equal(rows.length, 0); assert.equal(sessions.length, 0);
    }
    observations.push({ scenario: 'signed-webhook-checkout-namespace', invalidSignatureTransportCalls: 0, validWebhookStatus: 200, checkoutStatus: collided.status, checkoutReceivedWebhookBody: collided.body.received === true });
    safety('checkout response separated from webhook event identity', sessions.length === 1 && rows.length === 1 && boundResponse(collided));
    assert.deepEqual(forbidden, [], 'Unexpected transport remains a failure even when callers catch it');
    assert.deepEqual(adapterErrors, [], 'Adapter failures remain failures even when PostgREST catches them');
    assert.equal(observations.length, 13); if (observing) assert.equal(unsafe.length, 13);
    assert.deepEqual(hashSources(), sourceHashes, 'Source changed during characterization');
    console.log(JSON.stringify({ schema: 'lhb.checkout-effect-order-characterization@v1', mode, sourceHashes,
      sourceScope: 'Listed files only; transitive runtime is not fully inventoried', networkDenied: true, unexpectedTransport: forbidden, adapterErrors,
      observations, safetyFailures: unsafe, productionSafe: false, externalEffects: 0, expectedExit: observing || unsafe.length === 0 ? 0 : 1 }));
    if (!observing && unsafe.length > 0) { console.error(`SAFETY_REGRESSION_FAILED: ${unsafe.length} observed checkout/cache boundary violations`); process.exitCode = 1; }
  } finally { globalThis.fetch = originalFetch; }
}
void main().catch(error => { console.error('CHARACTERIZATION_HARNESS_FAILED', error); process.exitCode = 2; });
