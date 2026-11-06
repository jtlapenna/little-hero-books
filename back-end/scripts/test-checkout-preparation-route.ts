import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { connect } from 'node:net';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// The wrapper supplies a clean environment and isolates the test from external networks.
Object.assign(process.env, {
  SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic',
  STRIPE_SECRET_KEY: 'sk_test_synthetic', D2C_FRONTEND_ORIGIN: 'https://www.littleherolabs.com',
});
type Call = { method: string; path: string; query: string; headers: Record<string, string>; body: string };
let stripeBehavior: 'success' | 'error' | 'no-url' = 'success';
let calls: Call[] = [];
let failInsertAt = 0, inserted = 0;
let configRow: unknown = null, replay: unknown = null;
const rows: Record<string, unknown>[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url);
  const body = await request.text();
  const headers = Object.fromEntries(request.headers.entries());
  if (url.hostname === 'api.stripe.com' && headers['idempotency-key']) {
    assert.match(headers['idempotency-key'], /^stripe-node-retry-[0-9a-f-]{36}$/);
    headers['idempotency-key'] = 'stripe-node-retry-UUID';
  }
  calls.push({ method: request.method, path: url.hostname + url.pathname, query: url.search, headers, body });
  if (url.hostname === 'db.example.test' && url.pathname === '/rest/v1/idempotency_keys') {
    if (request.method === 'GET') return Response.json(replay);
    assert.equal(request.method, 'POST'); return new Response(null, { status: 201 });
  }
  if (url.hostname === 'db.example.test' && url.pathname === '/rest/v1/book_configs' && request.method === 'GET') return Response.json(configRow);
  if (url.hostname === 'db.example.test' && url.pathname === '/rest/v1/orders' && request.method === 'POST') {
    inserted++;
    if (inserted === failInsertAt) return Response.json({ message: 'synthetic insert failure', code: 'SYNTHETIC' }, { status: 400 });
    rows.push(JSON.parse(body)); return Response.json({ id: inserted });
  }
  if (url.hostname === 'api.stripe.com' && url.pathname === '/v1/checkout/sessions' && request.method === 'POST') {
    if (stripeBehavior === 'error') return Response.json({ error: { type: 'invalid_request_error', message: 'synthetic failure', code: 'synthetic_code' } }, { status: 400 });
    if (stripeBehavior === 'no-url') return Response.json({ id: 'cs_test_synthetic', object: 'checkout.session', url: null });
    return Response.json({ id: 'cs_test_synthetic', object: 'checkout.session', url: 'https://checkout.example.test/synthetic' });
  }
  throw new Error(`Forbidden transport ${request.method} ${url.hostname}${url.pathname}`);
};
async function main() {
  // Refuse execution unless network access is isolated and the outbound probe fails.
  const linuxContainer = process.platform === 'linux';
  if (linuxContainer) assert.deepEqual(readdirSync('/sys/class/net'), ['lo'], 'Linux test must run in an isolated network namespace');
  for (const host of ['127.0.0.1', '192.0.2.1']) {
    await new Promise<void>((resolve, reject) => {
      const socket = connect(443, host);
      socket.setTimeout(1500, () => { socket.destroy(); reject(new Error('Network denial could not be proven')); });
      socket.on('connect', () => { socket.destroy(); reject(new Error('Network unexpectedly connected')); });
      socket.on('error', error => {
        const code = (error as NodeJS.ErrnoException).code ?? '';
        if (['EPERM', 'EACCES'].includes(code) || (linuxContainer && (host === '127.0.0.1' ? code === 'ECONNREFUSED' : code === 'ENETUNREACH'))) resolve();
        else reject(error);
      });
    });
  }
// Frozen from f7efbb3308df1111568890ed6de9ae5c7c38fe74 before the extraction.
// The fixture contains repository code only and uses this test's fake transport.
assert.equal(createHash('sha256').update(readFileSync(join(process.cwd(), 'scripts/fixtures/checkout-route-before-extraction.ts'))).digest('hex'), '433f1b9808f6fc8857bb755ebbbe9b44f41fa02b36823091c3537a53e3018edf');
const { POST: baselinePost } = await import('./fixtures/checkout-route-before-extraction');
let activePost = baselinePost;
Object.defineProperty(globalThis.crypto, 'randomUUID', { value: () => '11111111-1111-4111-8111-111111111111', configurable: true });
const { checkoutPreparationV1: producer } = await import('../src/lib/checkout-preparation-v1');
const base = {
  shipping_address: { name: 'Synthetic Adult', address_line1: '1 Test Lane', city: 'Test City', state: 'CA', postal_code: '00000', country: 'US' },
  customer_email: 'buyer@example.test',
};
const char = { name: 'Example', age: 'bad', favoriteAnimal: 'cat', pronouns: 'she-her', arbitrary: { x: 1 } };
async function run(body: unknown, key = 'key', options: { rawBody?: string; origin?: string } = {}) {
  const request = new NextRequest('https://admin.example.test/api/checkout/create', {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key, origin: options.origin ?? 'https://www.littleherolabs.com' }, body: options.rawBody ?? JSON.stringify(body),
  });
  const response = await activePost(request);
  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: await response.json() };
}
function reset() { calls = []; rows.length = 0; inserted = 0; failInsertAt = 0; configRow = null; replay = null; stripeBehavior = 'success'; }
function compareProducer(body: unknown, response: Record<string, any>) {
  const parsed = producer.parse(body);
  const product = producer.resolveProduct(parsed, 'book-mvp-simple-adventure', 'standard');
  const inputs = producer.bookInputs(parsed);
  for (let index = 0; index < inputs.length; index++) {
    const expected = producer.order({ parsed, bookInputs: inputs, index, rootOrderId: response.order_id,
      displayOrderId: response.display_order_id, shippingTier: parsed.shipping_tier, now: rows[index].created_at as string,
      requestedProductInfo: product.requestedProductInfo, resolvedBookId: product.requestedBookId,
      resolvedFormatId: product.requestedFormatId, innerVoicePageCount: null, innerVoiceConfigVersion: null });
    assert.deepEqual(JSON.parse(JSON.stringify(expected.orderPayload)), rows[index]);
  }
  const quote = producer.quote(inputs, parsed.shipping_tier, process.env.D2C_CHECKOUT_AMOUNT_CENTS);
  const lineItems = producer.lineItems(inputs, quote.bookCents);
  for (let index = 0; index < inputs.length; index++) {
    const price = lineItems[index].price_data!;
    assert.equal(stripe().get(`line_items[${index}][price_data][unit_amount]`), String(price.unit_amount));
    assert.equal(stripe().get(`line_items[${index}][price_data][product_data][name]`), price.product_data!.name);
  }
  assert.equal(stripe().get(`line_items[${inputs.length}][price_data][unit_amount]`), String(quote.shippingCents));
}
function stripe() { const call = calls.find(c => c.path === 'api.stripe.com/v1/checkout/sessions'); assert.ok(call); return new URLSearchParams(call.body); }
const quiet = console.error; console.error = () => {};
try {
  reset();
  const oneInput = { ...base, character_specs: char, dedication: 'For you', product_info: { book_id: 'legacy-book', format_id: 'legacy-format', bookId: 'chosen-book', formatId: 'chosen-format', custom: 'value' } };
  const one = await run(oneInput);
  compareProducer(oneInput, one.body);
  assert.equal(one.status, 201); assert.equal(rows.length, 1); assert.equal(one.body.book_count, 1);
  assert.equal(rows[0].orderId, one.body.order_id); assert.equal(rows[0].root_order_id, one.body.order_id);
  assert.deepEqual(rows[0].character_specs, { ...char, age: null, childName: 'Example', animalGuide: 'cat', clothingStyle: 'dress' });
  assert.equal(rows[0].dedication_text, 'For you');
  assert.equal((rows[0].product_info as Record<string, unknown>).bookId, 'chosen-book');
  assert.equal((rows[0].product_info as Record<string, unknown>).formatId, 'chosen-format');
  assert.equal((rows[0].product_info as Record<string, unknown>).book_id, 'legacy-book');
  assert.equal((rows[0].product_info as Record<string, unknown>).custom, 'value');
  assert.equal(stripe().get('line_items[0][price_data][unit_amount]'), '2999');
  assert.equal(stripe().get('line_items[1][price_data][unit_amount]'), '674');
  assert.equal(stripe().get('metadata[order_id]'), one.body.order_id);
  assert.deepEqual(calls.map(c => c.method + ' ' + c.path), ['GET db.example.test/rest/v1/idempotency_keys', 'POST db.example.test/rest/v1/orders', 'POST api.stripe.com/v1/checkout/sessions', 'POST db.example.test/rest/v1/idempotency_keys']);

  reset();
  const manyInput = { ...base, character_specs: { name: 'Ignored', age: 2 }, shipping_tier: 'express', books: [
    { character_specs: { ...char, childName: 'First', name: 'Alias', animalGuide: 'owl', clothingStyle: 'cape', age: '7years' }, dedication: 'One' },
    { character_specs: { name: 'Second', age: 4 }, dedication: 'Two' },
  ] };
  const many = await run(manyInput);
  compareProducer(manyInput, many.body);
  assert.equal(many.status, 201); assert.equal(many.body.book_count, 2); assert.equal(rows.length, 2);
  assert.equal(rows[0].orderId, `${many.body.order_id}-item-1`); assert.equal(rows[1].orderId, `${many.body.order_id}-item-2`);
  assert.equal((rows[0].character_specs as Record<string, unknown>).childName, 'First');
  assert.equal((rows[0].character_specs as Record<string, unknown>).name, 'Alias');
  assert.equal((rows[0].character_specs as Record<string, unknown>).animalGuide, 'owl');
  assert.equal((rows[0].character_specs as Record<string, unknown>).age, 7);
  assert.equal((rows[1].character_specs as Record<string, unknown>).clothingStyle, 't-shirt and shorts');
  assert.equal((rows[0].product_info as Record<string, unknown>)._sibling_order, false); assert.equal((rows[1].product_info as Record<string, unknown>)._sibling_order, true);
  assert.equal(stripe().get('line_items[2][price_data][unit_amount]'), '3537');
  assert.equal(stripe().get('metadata[root_order_id]'), many.body.order_id); assert.equal(stripe().get('metadata[book_count]'), '2');

  for (const [tier, expected] of [['mail', 674], ['ground_home', 1374], ['priority_mail', 1574], ['expedited', 2174], ['express', 3174]] as const) {
    reset();
    const input = { ...base, shipping_tier: tier, character_specs: { name: 'One', age: '3' } };
    const result = await run(input); assert.equal(result.status, 201); compareProducer(input, result.body);
    assert.equal(stripe().get('line_items[1][price_data][unit_amount]'), String(expected));
  }
  reset(); process.env.D2C_CHECKOUT_AMOUNT_CENTS = '1234extra';
  const priceInput = { ...base, character_specs: { name: 'One', age: 3 } };
  const priceResult = await run(priceInput); compareProducer(priceInput, priceResult.body);
  assert.equal(stripe().get('line_items[0][price_data][unit_amount]'), '1234');
  delete process.env.D2C_CHECKOUT_AMOUNT_CENTS;

  reset(); failInsertAt = 2;
  const failed = await run({ ...base, books: [{ character_specs: { name: 'One', age: 2 } }, { character_specs: { name: 'Two', age: 3 } }] });
  assert.equal(failed.status, 500); assert.equal(failed.body.error, 'Failed to create order: SYNTHETIC'); assert.equal(rows.length, 1);
  assert.equal(calls.filter(c => c.path === 'db.example.test/rest/v1/orders').length, 2); assert.equal(calls.filter(c => c.path.startsWith('api.stripe.com/')).length, 0);

  reset(); delete process.env.STRIPE_SECRET_KEY;
  const noStripe = await run({ ...base, character_specs: { name: 'One', age: 3 } });
  assert.equal(noStripe.status, 500); assert.equal(noStripe.body.error, 'Payment configuration error'); assert.equal(rows.length, 1);
  assert.equal(calls.filter(c => c.path.startsWith('api.stripe.com/')).length, 0);
  process.env.STRIPE_SECRET_KEY = 'sk_test_synthetic';
  reset();
  const noBook = await run(base);
  assert.equal(noBook.status, 500); assert.equal(noBook.body.error, 'Checkout failed'); assert.equal(rows.length, 0);
  assert.equal(calls.length, 1);
  // Characterize the frozen pre-extraction route. Strict checkout has separate
  // actual-route tests because its rejection behavior intentionally differs.
  const normalizeDates = (value: unknown) => JSON.parse(JSON.stringify(value).replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, 'TIME'));
  async function parity(input: unknown, options: { failingInsert?: number; missingKey?: boolean; published?: unknown; replay?: unknown; stripeBehavior?: 'error' | 'no-url'; rawBody?: string; origin?: string; key?: string; status?: number; error?: string } = {}) {
    const results: unknown[] = [];
    for (const post of [baselinePost]) {
      reset(); activePost = post; failInsertAt = options.failingInsert ?? 0; configRow = options.published ?? null; replay = options.replay ?? null; stripeBehavior = options.stripeBehavior ?? 'success';
      if (options.missingKey) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = 'sk_test_synthetic';
      const response = await run(input, options.key, { rawBody: options.rawBody, origin: options.origin });
      if (options.status !== undefined) assert.equal(response.status, options.status);
      if (options.error !== undefined) assert.equal(response.body.error, options.error);
      results.push(normalizeDates({ response, rows, calls }));
    }
    assert.equal(results.length, 1);
    activePost = baselinePost; process.env.STRIPE_SECRET_KEY = 'sk_test_synthetic';
  }
  await parity(oneInput); await parity(manyInput);
  await parity(manyInput, { failingInsert: 2 }); await parity(oneInput, { missingKey: true });
  await parity(oneInput, { stripeBehavior: 'error', status: 500, error: 'Stripe error: synthetic_code' }); await parity(oneInput, { stripeBehavior: 'no-url', status: 500, error: 'Stripe did not return checkout session URL' });
  await parity(oneInput, { key: '', status: 400, error: 'Idempotency-Key header is required' }); await parity(oneInput, { rawBody: '{', status: 400, error: 'Invalid JSON' });
  await parity({ ...oneInput, shipping_address: { ...base.shipping_address, country: 'CA' } }, { status: 400, error: 'Validation failed' });
  await parity({ ...oneInput, customer_email: 'invalid' }, { status: 400, error: 'Validation failed' });
  await parity({ ...oneInput, character_specs: { age: 11, name: 'Example' } }, { status: 400, error: 'Validation failed' });
  await parity(oneInput, { origin: 'https://untrusted.example.test' });
  await parity(oneInput, { replay: { response_status: 201, response_body: { original: true }, created_at: new Date().toISOString() } });
  const { computeBookConfigChecksum } = await import('../src/lib/books/runtime-book-config');
  const draft = (await import('../src/lib/books/configs/book-finding-our-inner-voice/v2.json')).default;
  const activeConfig = { ...draft, status: 'active' };
  const published = { book_id: activeConfig.bookId, version: 2, is_active: true, config_json: activeConfig,
    checksum: computeBookConfigChecksum(activeConfig as Parameters<typeof computeBookConfigChecksum>[0]) };
  process.env.D2C_INNER_VOICE_V2_SALES_ENABLED = '1';
  const innerVoice = { ...oneInput, product_info: { bookId: 'book-finding-our-inner-voice', formatId: 'standard', custom: 'value' } };
  await parity(innerVoice, { published });
  assert.equal(rows.length, 1); assert.equal((rows[0].book_specs as any).title, 'Finding Our Inner Voice');
  assert.equal((rows[0].book_specs as any).totalPages, 32); assert.equal((rows[0].book_specs as any).configVersion, 2);
  delete process.env.D2C_INNER_VOICE_V2_SALES_ENABLED;

  reset();
  const nonUs = await run({ ...base, shipping_address: { ...base.shipping_address, country: 'CA' }, character_specs: char });
  assert.equal(nonUs.status, 400); assert.equal(calls.length, 0);
  console.log('Checkout frozen-route V1 characterization: single, siblings, aliases, pricing and failure ordering passed.');
} finally { globalThis.fetch = originalFetch; console.error = quiet; }

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
