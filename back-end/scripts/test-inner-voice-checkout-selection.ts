import assert from 'node:assert/strict';
import nodeCrypto, { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, readdirSync, realpathSync, writeSync } from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { connect } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Data = Record<string, unknown>;
type Wire = { method: string; url: string; headers: Array<[string, string]>; body: string; response?: { status: number; headers: Array<[string, string]>; body: string } };
type Expectation = { status: number; book?: string; format?: string; rows?: number; paymentCalls?: number; error?: string; field?: string; orderedFields?: string[] };
type PublishedMode = 'active' | 'draft' | 'inactive-reply' | 'active-v1' | 'baseline-v1' | 'missing' | 'query-error' | 'missing-active-column' | 'checksum' | 'schema' | 'semantic' | 'wrong-book';
type Fixture = { id: string; body: unknown; old: Expectation; fixed: Expectation; comparison: 'exact' | 'alias-delta' | 'rejection-delta';
  rawBody?: string; key?: string | null; published?: PublishedMode; sales?: boolean; insertFailure?: number; stripeFailure?: boolean; replay?: boolean };
const IV = 'book-finding-our-inner-voice';
const MVP = 'book-mvp-simple-adventure';
const FIXED_TIME = '2026-01-02T03:04:05.000Z';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function object(value: unknown): Data {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value)); return value as Data;
}
const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
function options(): Map<string, string> {
  const values = new Map<string, string>(); const args = process.argv.slice(2);
  assert.equal(args.length % 2, 0);
  for (let i = 0; i < args.length; i += 2) { assert.ok(args[i].startsWith('--')); assert.ok(!values.has(args[i])); values.set(args[i], args[i + 1]); }
  assert.ok([...values.keys()].every(key => ['--expectation', '--default-book', '--route', '--route-sha', '--observations'].includes(key)));
  return values;
}
function writeAll(fd: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.length) {
    const count = writeSync(fd, bytes, offset, bytes.length - offset);
    if (!Number.isInteger(count) || count <= 0 || count > bytes.length - offset) throw new Error('Invalid observation write progress');
    offset += count;
  }
}
async function denialProbe(): Promise<void> {
  const linuxNamespace = process.platform === 'linux';
  if (linuxNamespace) assert.deepEqual(readdirSync('/sys/class/net'), ['lo'], 'Use an isolated network namespace');
  for (const host of ['127.0.0.1', '192.0.2.1']) await new Promise<void>((resolve, reject) => {
    const socket = connect(443, host);
    socket.setTimeout(1500, () => { socket.destroy(); reject(new Error('Network denial probe timed out')); });
    socket.on('connect', () => { socket.destroy(); reject(new Error('Network unexpectedly connected')); });
    socket.on('error', error => {
      socket.destroy(); const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES' || (linuxNamespace && code === (host === '127.0.0.1' ? 'ECONNREFUSED' : 'ENETUNREACH'))) resolve();
      else reject(error);
    });
  });
}

async function main(): Promise<void> {
  const args = options(); const family = args.get('--expectation') ?? 'fixed'; const profile = args.get('--default-book');
  assert.ok(family === 'old' || family === 'fixed'); assert.ok(profile === 'mvp' || profile === 'iv', 'Choose one isolated default profile');
  const cwd = realpathSync(process.cwd());
  assert.ok(readFileSync(path.join(cwd, 'package.json'), 'utf8').includes('next'), 'Run from the reviewed backend source root');
  const routePath = path.resolve(args.get('--route') ?? path.join(cwd, 'src/app/api/checkout/create/route.ts'));
  assert.equal(realpathSync(routePath), routePath);
  if (args.has('--route')) { assert.match(args.get('--route-sha') ?? '', /^[a-f0-9]{64}$/); assert.equal(sha(routePath), args.get('--route-sha')); }
  const output = args.get('--observations'); assert.ok(output, 'Guarded caller must supply an explicit observation destination');
  assert.equal(path.resolve(output), output); assert.equal(realpathSync(path.dirname(output)), path.dirname(output));
  const fd = openSync(output, 'wx', 0o600);
  const emit = (value: unknown) => writeAll(fd, Buffer.from(JSON.stringify(value) + '\n', 'utf8'));
  const originalFetch = globalThis.fetch; const originalDate = globalThis.Date;
  const originalNodeUUID = nodeCrypto.randomUUID;
  const webDescriptor = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
  const inherited: Record<string, string | undefined> = {};
  const environment = {
    SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic',
    STRIPE_SECRET_KEY: 'sk_test_synthetic', D2C_FRONTEND_ORIGIN: 'https://www.littleherolabs.com',
    D2C_DEFAULT_BOOK_ID: profile === 'iv' ? IV : MVP, D2C_DEFAULT_FORMAT_ID: 'standard',
    D2C_INNER_VOICE_V2_SALES_ENABLED: '1', D2C_CHECKOUT_AMOUNT_CENTS: '2999',
  };
  let webUUID = 0; let sdkUUID = 0; let calls: Wire[] = []; let rows: Data[] = []; let unexpected: Data[] = [];
  let active: Fixture; let insertAttempts = 0; let cases = 0;
  try {
    emit({ kind: 'scope', family, profile, routePath, routeSha256: sha(routePath), scope: 'Actual POST -> synthetic pending rows -> actual D2C W0 producer. No browser, installed workflow, hosted publication or payment proof.' });
    await denialProbe();
    for (const key of ['NODE_OPTIONS', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_SANDBOX_SECRET_KEY', 'BACKEND_API_TOKEN']) {
      assert.equal(process.env[key], undefined, `Use scrubbed runner; inherited ${key}`);
    }
    for (const [key, value] of Object.entries(environment)) { inherited[key] = process.env[key]; process.env[key] = value; }
    globalThis.Date = new Proxy(originalDate, {
      construct(target, values) { return Reflect.construct(target, values.length ? values : [FIXED_TIME]); },
      apply() { return new originalDate(FIXED_TIME).toString(); },
      get(target, property) { return property === 'now' ? () => originalDate.parse(FIXED_TIME) : Reflect.get(target, property, target); },
    });
    Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: () => `11111111-1111-4111-8111-${String(++webUUID).padStart(12, '0')}` });
    nodeCrypto.randomUUID = (() => `22222222-2222-4222-8222-${String(++sdkUUID).padStart(12, '0')}`) as typeof nodeCrypto.randomUUID;
    syncBuiltinESMExports();
    let checksum: (config: unknown) => string;
    let loadBundled: (input: { bookId: string; version: number }) => unknown;
    function configRow(version = 2, status = 'active', isActive = true): Data {
      const config = object(clone(loadBundled({ bookId: IV, version }))); config.status = status;
      if (active.published === 'schema') config.formats = null;
      if (active.published === 'semantic') {
        const interior = object(object(object(config.formats).standard).interior);
        assert.ok(Array.isArray(interior.pageSequence)); interior.expectedPageCount = interior.pageSequence.length + 1;
      }
      return { book_id: active.published === 'wrong-book' ? MVP : IV, version, is_active: isActive, config_json: config,
        checksum: active.published === 'checksum' ? '0'.repeat(64) : checksum(config) };
    }
    globalThis.fetch = async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init); const url = new URL(request.url); const body = await request.text();
      const wire: Wire = { method: request.method, url: request.url, headers: [...request.headers.entries()], body }; calls.push(wire);
      const reply = async (response: Response): Promise<Response> => {
        wire.response = { status: response.status, headers: [...response.headers.entries()], body: await response.clone().text() };
        return response;
      };
      try {
        if (url.hostname === 'db.example.test' && url.pathname === '/rest/v1/book_configs' && request.method === 'GET') {
          assert.equal(url.searchParams.get('book_id'), `eq.${IV}`);
          const activeQuery = url.searchParams.has('is_active');
          if (activeQuery) { assert.equal(url.searchParams.get('is_active'), 'eq.true'); assert.equal(url.searchParams.get('order'), 'version.desc'); assert.equal(url.searchParams.get('limit'), '1'); }
          else assert.equal(url.searchParams.get('version'), 'eq.1');
          if (active.published === 'query-error') return await reply(Response.json({ code: 'SYNTHETIC_LOOKUP', message: 'synthetic failure' }, { status: 400 }));
          if (activeQuery && active.published === 'missing-active-column') return await reply(Response.json({ code: '42703', message: 'synthetic missing column' }, { status: 400 }));
          if (active.published === 'missing') return await reply(Response.json(null));
          if (activeQuery && (active.published === 'baseline-v1' || active.published === 'missing-active-column')) return await reply(Response.json(null));
          if (!activeQuery) return await reply(Response.json(configRow(1, 'active', false)));
          return await reply(Response.json(configRow(active.published === 'active-v1' ? 1 : 2, active.published === 'draft' ? 'draft' : 'active', active.published !== 'inactive-reply')));
        }
        if (url.hostname === 'db.example.test' && url.pathname === '/rest/v1/idempotency_keys') {
          if (request.method === 'GET') return await reply(Response.json(active.replay ? { response_status: 201, response_body: { order_id: 'SYNTHETIC-REPLAY', replay: true }, created_at: FIXED_TIME } : null));
          assert.equal(request.method, 'POST'); return await reply(new Response(null, { status: 201 }));
        }
        if (url.hostname === 'db.example.test' && url.pathname === '/rest/v1/orders' && request.method === 'POST') {
          insertAttempts += 1;
          if (insertAttempts === active.insertFailure) return await reply(Response.json({ message: 'synthetic insert failure', code: 'SYNTHETIC_INSERT' }, { status: 400 }));
          rows.push(object(JSON.parse(body))); return await reply(Response.json({ id: insertAttempts }));
        }
        if (url.hostname === 'api.stripe.com' && url.pathname === '/v1/checkout/sessions' && request.method === 'POST') {
          if (active.stripeFailure) return await reply(Response.json({ error: { type: 'invalid_request_error', message: 'synthetic payment failure', code: 'SYNTHETIC_PAYMENT' } }, { status: 400 }));
          return await reply(Response.json({ id: 'cs_test_synthetic', object: 'checkout.session', url: 'https://checkout.example.test/synthetic' }));
        }
        throw new Error(`Forbidden test transport ${request.method} ${request.url}`);
      } catch (error) {
        const caught = error as Error; unexpected.push({ name: caught.name, message: caught.message, stack: caught.stack ?? '' }); throw error;
      }
    };
    const moduleAt = (relative: string) => pathToFileURL(path.join(cwd, relative)).href;
    const runtime = await import(moduleAt('src/lib/books/runtime-book-config.ts')) as { computeBookConfigChecksum: (config: unknown) => string };
    const bundled = await import(moduleAt('src/lib/books/load-book-config.ts')) as { loadBundledBookConfig: (options: { bookId: string; version: number }) => unknown };
    checksum = runtime.computeBookConfigChecksum; loadBundled = bundled.loadBundledBookConfig;
    const { buildD2CW0Payload } = await import(moduleAt('src/lib/w0-payload.ts')) as { buildD2CW0Payload: (row: Data) => Data };
    const { calculateCharacterHash } = await import(moduleAt('src/lib/character-hash.ts')) as { calculateCharacterHash: (specs: Data, id: string) => string };
    const backendRequire = createRequire(path.join(cwd, 'package.json')); 
    const { NextRequest } = backendRequire('next/server') as { NextRequest: new (url: string, init: RequestInit) => Request };
    const { POST } = await import(pathToFileURL(routePath).href) as { POST: (request: Request) => Promise<Response> };
    assert.equal(typeof POST, 'function');
    emit({ kind: 'import-transports', calls: clone(calls), unexpected: clone(unexpected) });
    assert.deepEqual(unexpected, [], 'Unexpected transport during module import');
    assert.equal(calls.length, 0, 'Import transport must be reviewed before cases');
    const character = { name: 'A<&lex', childName: 'A<&lex', age: 7, favoriteAnimal: 'cat', animalGuide: 'cat', clothingStyle: 'dress', pronouns: 'she-her', hometown: 'Synthetic Town' };
    const base: Data = { shipping_address: { name: 'Synthetic Adult', address_line1: '1 Test Lane', city: 'Test City', state: 'CA', postal_code: '00000', country: 'US' }, customer_email: 'synthetic@example.test', character_specs: character, dedication: 'For <Alex> & friends' };
    const payload = (product: Data): Data => ({ ...clone(base), product_info: product });
    const iv = (extras: Data = {}): Data => ({ bookId: IV, formatId: 'standard', ...extras });
    const success = (book = IV, format = 'standard', rowCount = 1): Expectation => ({ status: 201, book, format, rows: rowCount, paymentCalls: 1 });
    const reject = (status: number, field?: string, error?: string): Expectation => ({ status, field, error, rows: 0, paymentCalls: 0 });
    const fixtures: Fixture[] = [];
    const same = (id: string, body: unknown, expected: Expectation, extra: Partial<Fixture> = {}) => fixtures.push({ id, body, old: expected, fixed: expected, comparison: 'exact', ...extra });
    const changed = (id: string, body: unknown, prior: Expectation, fixed: Expectation, extra: Partial<Fixture> = {}) => fixtures.push({ id, body, old: prior, fixed, comparison: 'rejection-delta', ...extra });
    const defaultId = profile === 'iv' ? IV : MVP;
    same('canonical-frontend-single', payload(iv()), success());
    same('unrelated-product-metadata', payload(iv({ custom: { nested: 'preserve' }, skuNote: 'synthetic' })), success());
    const multiple = { ...payload(iv()), books: [{ character_specs: character, dedication: 'First' }, { character_specs: { ...character, childName: 'Blake', name: 'Blake', animalGuide: 'dog', favoriteAnimal: 'dog' }, dedication: 'Second' }] }; delete (multiple as Data).character_specs; delete (multiple as Data).dedication;
    same('canonical-frontend-siblings', multiple, success(IV, 'standard', 2));
    same('default-identity-omission', clone(base), success(defaultId));
    same('default-version-omission', payload({}), success(defaultId));
    same('matching-version', payload(iv({ configVersion: 2 })), success());
    same('matching-version-aliases', payload(iv({ configVersion: 2, config_version: 2 })), success());
    same('version-alias-only', payload(iv({ config_version: 2 })), success());
    same('consistent-string-aliases', payload(iv({ book_id: IV, format_id: 'standard' })), success());
    same('opaque-unsupported-metadata', { ...payload(iv()), productInfo: { note: 'opaque data' }, bookSpecs: null }, success());
    fixtures.push({ id: 'padded-alias-normalization', body: payload(iv({ bookId: ` ${IV} `, book_id: ` ${IV} `, format_id: ' standard ' })), old: success(), fixed: success(), comparison: 'alias-delta' });
    changed('book-alias-conflict-IV-first', payload(iv({ book_id: MVP })), success(), reject(400, 'product_info.bookId'));
    changed('book-alias-conflict-MVP-first', payload({ bookId: MVP, book_id: IV, formatId: 'standard' }), success(MVP), reject(400, 'product_info.bookId'));
    changed('format-alias-conflict', payload(iv({ format_id: 'amazon' })), success(), reject(400, 'product_info.formatId'));
    changed('caller-version-mismatch', payload(iv({ configVersion: 3 })), success(), reject(409, undefined, 'The selected book version has changed. Refresh and try again.'));
    changed('version-alias-conflict', payload(iv({ configVersion: 2, config_version: 3 })), success(), reject(400, 'product_info.configVersion'));
    for (const value of [null, '', ' ', 0, -1, 1.5, '2', false, [], {}, Number.MAX_SAFE_INTEGER + 1]) {
      changed(`invalid-version-${JSON.stringify(value)}`, payload(iv({ configVersion: value })), success(), reject(400, 'product_info.configVersion'));
    }
    for (const value of [null, '', ' ', 3, false, [], {}]) {
      changed(`invalid-format-${JSON.stringify(value)}`, payload(iv({ formatId: value })), success(), reject(400, 'product_info.formatId'));
      changed(`invalid-book-alias-${JSON.stringify(value)}`, payload({ bookId: value, book_id: IV, formatId: 'standard' }), success(), reject(400, 'product_info.bookId'));
    }
    const unsupportedSelectors = [['bookId', IV], ['book_id', IV], ['formatId', 'standard'], ['format_id', 'standard'], ['configVersion', 2], ['config_version', 2]] as const;
    for (const [field, value] of unsupportedSelectors) {
      changed(`unsupported-root-${field}`, { ...payload(iv()), [field]: value }, success(), reject(400, field));
    }
    for (const field of ['bookId', 'book_id']) changed(`unsupported-root-intent-only-${field}`, { ...clone(base), [field]: IV }, success(defaultId), reject(400, field));
    for (const carrier of ['productInfo', 'bookSpecs', 'book_specs']) {
      for (const [field, value] of unsupportedSelectors) changed(`unsupported-${carrier}-${field}`, { ...payload(iv()), [carrier]: { [field]: value } }, success(), reject(400, `${carrier}.${field}`));
      changed(`unsupported-intent-only-${carrier}`, { ...clone(base), [carrier]: { book_id: IV } }, success(defaultId), reject(400, `${carrier}.book_id`));
    }
    same('default-matching-version', payload({ configVersion: 2 }), success(defaultId));
    changed('dual-malformed-selectors', payload(iv({ formatId: null, configVersion: 0 })), success(), { ...reject(400, 'product_info.formatId'), orderedFields: ['product_info.formatId', 'product_info.configVersion'] });
    const defaultInvalidVersion = payload({ configVersion: 0 });
    if (profile === 'iv') {
      changed('default-invalid-version', defaultInvalidVersion, success(IV), reject(400, 'product_info.configVersion'));
      changed('default-blank-book', payload({ bookId: ' ' }), success(IV), reject(400, 'product_info.bookId'));
      changed('default-null-format', payload({ formatId: null }), success(IV), reject(400, 'product_info.formatId'));
      changed('default-version-mismatch', payload({ configVersion: 3 }), success(IV), reject(409));
    } else {
      same('default-invalid-version', defaultInvalidVersion, success(MVP));
      same('default-blank-book', payload({ bookId: ' ' }), success(MVP));
      same('default-null-format', payload({ formatId: null }), success(MVP));
      same('default-version-mismatch', payload({ configVersion: 3 }), success(MVP));
    }
    same('explicit-MVP-legacy', payload({ bookId: MVP, formatId: 'standard', configVersion: 0 }), success(MVP));
    same('explicit-other-legacy', payload({ bookId: 'synthetic-other-book', formatId: 'custom-format' }), success('synthetic-other-book', 'custom-format'));
    same('legacy-conflicting-aliases', payload({ bookId: MVP, book_id: 'synthetic-other-book', formatId: 'standard', format_id: 'other', configVersion: 'not-a-version' }), success(MVP));
    same('body-null', null, reject(400)); same('body-array', [], reject(400));
    same('product-info-null', { ...clone(base), product_info: null }, reject(400, 'product_info'));
    same('product-info-array', { ...clone(base), product_info: [] }, reject(400, 'product_info'));
    same('body-schema-before-selectors', { ...payload(iv({ configVersion: 0 })), customer_email: 'invalid' }, reject(400, 'customer_email'));
    same('missing-idempotency-before-body', null, reject(400, undefined, 'Idempotency-Key header is required'), { key: null, rawBody: '{' });
    same('empty-idempotency-before-body', null, reject(400, undefined, 'Idempotency-Key header is required'), { key: '', rawBody: '{' });
    same('invalid-json', null, reject(400, undefined, 'Invalid JSON'), { rawBody: '{' });
    same('non-US', { ...payload(iv()), shipping_address: { ...object(base.shipping_address), country: 'CA' } }, reject(400, 'shipping_address.country'));
    changed('selector-before-country', { ...payload(iv({ configVersion: 0 })), shipping_address: { ...object(base.shipping_address), country: 'CA' } }, reject(400, 'shipping_address.country'), reject(400, 'product_info.configVersion'));
    same('existing-name-limit', { ...payload(iv()), character_specs: { ...character, childName: 'A'.repeat(100), name: 'A'.repeat(100) } }, reject(400, 'character_specs.childName'));
    same('sales-disabled', payload(iv()), reject(409), { sales: false });
    same('amazon-channel-rejected', payload(iv({ formatId: 'amazon' })), reject(409));
    same('unknown-format', payload(iv({ formatId: 'not-published' })), reject(409));
    for (const published of ['draft', 'inactive-reply', 'active-v1', 'baseline-v1', 'missing-active-column'] as const) same(`published-${published}`, payload(iv()), reject(409), { published });
    for (const published of ['missing', 'query-error', 'checksum', 'schema', 'semantic', 'wrong-book'] as const) same(`published-${published}`, payload(iv()), reject(503), { published });
    same('idempotent-legacy-replay', payload({ bookId: MVP }), { status: 201, rows: 0, paymentCalls: 0 }, { replay: true });
    same('idempotent-IV-replay', payload(iv({ configVersion: 2 })), { status: 201, rows: 0, paymentCalls: 0 }, { replay: true });
    same('partial-insert-preserved', multiple, { status: 500, rows: 1, paymentCalls: 0, error: 'Failed to create order: SYNTHETIC_INSERT' }, { insertFailure: 2 });
    same('payment-failure-preserved', payload(iv()), { status: 500, rows: 1, paymentCalls: 1, error: 'Stripe error: SYNTHETIC_PAYMENT' }, { stripeFailure: true });
    assert.equal(new Set(fixtures.map(fixture => fixture.id)).size, fixtures.length);
    for (const fixture of fixtures) {
      active = fixture; calls = []; rows = []; unexpected = []; webUUID = 0; sdkUUID = 0; insertAttempts = 0;
      process.env.D2C_INNER_VOICE_V2_SALES_ENABLED = fixture.sales === false ? '0' : '1';
      const rawBody = fixture.rawBody ?? JSON.stringify(fixture.body);
      const headers: Record<string, string> = { 'content-type': 'application/json', origin: 'https://www.littleherolabs.com' };
      if (fixture.key !== null) headers['idempotency-key'] = fixture.key ?? fixture.id;
      let response: { status: number; headers: Array<[string, string]>; body: string } | undefined;
      let failure: { name: string; message: string; stack: string } | undefined;
      const w0: Data[] = [];
      try {
        const result = await POST(new NextRequest('https://admin.example.test/api/checkout/create', { method: 'POST', headers, body: rawBody }));
        response = { status: result.status, headers: [...result.headers.entries()], body: await result.text() };
        for (const row of rows) w0.push(buildD2CW0Payload(clone(row)));
      } catch (error) { const caught = error as Error; failure = { name: caught.name, message: caught.message, stack: caught.stack ?? '' }; }
      const observation = { request: { url: 'https://admin.example.test/api/checkout/create', method: 'POST', headers, body: rawBody }, response, calls: clone(calls), rows: clone(rows), w0: clone(w0), entropy: { webUUID, sdkUUID }, unexpected: clone(unexpected), failure };
      const expected = family === 'fixed' ? fixture.fixed : fixture.old;
      emit({ kind: 'case', id: fixture.id, family, profile, comparison: fixture.comparison, expected, observation }); cases += 1;
      assert.equal(failure, undefined, fixture.id); assert.deepEqual(unexpected, [], fixture.id); assert.ok(response, fixture.id);
      assert.equal(response.status, expected.status, fixture.id + ': ' + response.body);
      const body = object(JSON.parse(response.body));
      if (expected.error) assert.equal(body.error, expected.error, fixture.id);
      if (expected.field) { assert.ok(Array.isArray(body.fields)); assert.ok(body.fields.some(field => object(field).path === expected.field), fixture.id); }
      if (expected.orderedFields) { assert.ok(Array.isArray(body.fields)); assert.deepEqual(body.fields.map(field => object(field).path), expected.orderedFields, fixture.id); }
      assert.equal(rows.length, expected.rows ?? 0, fixture.id);
      const payment = calls.filter(call => call.url.startsWith('https://api.stripe.com/v1/checkout/sessions'));
      assert.equal(payment.length, expected.paymentCalls ?? 0, fixture.id);
      if ((expected.status >= 400 && expected.status < 500) || expected.status === 503) assert.equal(calls.filter(call => call.method === 'POST').length, 0, fixture.id);
      if (expected.status === 400 || fixture.sales === false) assert.equal(calls.filter(call => new URL(call.url).pathname === '/rest/v1/book_configs').length, 0, fixture.id);
      for (const [index, row] of rows.entries()) {
        const rowProduct = object(row.product_info); const rowSpecs = object(row.book_specs); const specs = object(row.character_specs);
        const originalBody = object(fixture.body);
        const originalItems = Array.isArray(originalBody.books) ? originalBody.books.map(object) : [{ character_specs: originalBody.character_specs, dedication: originalBody.dedication }];
        const originalSpecs = object(originalItems[index].character_specs);
        assert.deepEqual(specs, originalSpecs, fixture.id + ': explicitly supplied fixture specs changed');
        assert.equal(row.character_hash, calculateCharacterHash(originalSpecs, String(row.orderId)), fixture.id);
        assert.equal(row.dedication_text, originalItems[index].dedication ?? null, fixture.id);
        assert.equal(row.root_order_id, '11111111-1111-4111-8111-000000000001', fixture.id);
        if (fixture.id === 'unrelated-product-metadata') {
          assert.deepEqual(rowProduct.custom, { nested: 'preserve' }); assert.equal(rowProduct.skuNote, 'synthetic');
        }
        assert.equal(rowProduct.bookId, expected.book ?? IV, fixture.id); assert.equal(rowSpecs.bookId, expected.book ?? IV, fixture.id);
        assert.equal(w0[index].orderId, row.orderId); assert.equal(w0[index].characterHash, row.character_hash); assert.deepEqual(w0[index].characterSpecs, specs);
        assert.equal(w0[index].bookId, rowProduct.bookId); assert.equal(w0[index].formatId, rowProduct.formatId); assert.equal(object(w0[index].orderDetails).quantity, 1);
        if (rowProduct.bookId === IV) { assert.equal(rowProduct.configVersion, 2); assert.equal(rowSpecs.configVersion, 2); assert.equal(w0[index].configVersion, 2); }
        if (fixture.id === 'padded-alias-normalization' && family === 'fixed') { assert.equal(rowProduct.book_id, IV); assert.equal(rowProduct.format_id, 'standard'); }
        if (expected.format) { assert.equal(rowProduct.formatId, expected.format); assert.equal(rowSpecs.formatId, expected.format); }
      }
      if (fixture.id === 'canonical-frontend-siblings') {
        assert.equal(rows[0].orderId, '11111111-1111-4111-8111-000000000001-item-1');
        assert.equal(rows[1].orderId, '11111111-1111-4111-8111-000000000001-item-2');
        assert.notEqual(rows[0].character_hash, rows[1].character_hash); assert.equal(object(rows[0].character_specs).childName, 'A<&lex'); assert.equal(object(rows[1].character_specs).childName, 'Blake');
        assert.equal(rows[0].root_order_id, rows[1].root_order_id); assert.equal(rows[0].dedication_text, 'First'); assert.equal(rows[1].dedication_text, 'Second');
      }
      for (const call of payment) {
        const wireHeaders = new Headers(call.headers); assert.match(wireHeaders.get('idempotency-key') ?? '', /^stripe-node-retry-22222222-2222-4222-8222-[0-9]{12}$/);
        assert.ok(call.body.length > 0, 'Retain full Stripe body');
      }
    }
    emit({ kind: 'summary', family, profile, cases, status: 'passed', scope: 'Bounded B1 actual-handler synthetic behavior only; no hosted, payment, full B/C, CI or print acceptance' });
  } catch (error) {
    const caught = error as Error; emit({ kind: 'test-failure', name: caught.name, message: caught.message, stack: caught.stack ?? '', cases, calls, rows, unexpected }); throw error;
  } finally {
    globalThis.fetch = originalFetch; globalThis.Date = originalDate; nodeCrypto.randomUUID = originalNodeUUID; syncBuiltinESMExports();
    if (webDescriptor) Object.defineProperty(globalThis.crypto, 'randomUUID', webDescriptor); else delete (globalThis.crypto as unknown as Data).randomUUID;
    for (const [key, value] of Object.entries(inherited)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    closeSync(fd);
  }
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
