import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { assertPrintAssignmentCompatible } from '../src/lib/books/print-assignment';

async function main() {
  if (process.argv.includes('--replacement-w0-bridge-only')) {
    const names = await testAmazonReplacementApi(true);
    console.log(JSON.stringify({ status: 'passed', scope: 'offline actual Amazon API capture through W0 nodes and in-memory freeze storage', cases: names.length, names }));
    return;
  }
  if (process.argv.includes('--replacement-api-only')) {
    const names = await testAmazonReplacementApi();
    console.log(JSON.stringify({ status: 'passed', scope: 'offline actual normalized Amazon API candidate only', cases: names.length, names }));
    return;
  }
  if (process.argv.includes('--replacement-primitives-only')) {
    const cases = await testAmazonReplacementPrimitives();
    console.log(JSON.stringify({ status: 'passed', scope: 'pure replacement primitives only', cases: cases.length, names: cases }));
    return;
  }
  process.env.SUPABASE_URL = 'https://db.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-test-key';
  const originalFetch = globalThis.fetch;
  let record: Record<string, unknown>;
  let updates = 0, requests = 0;
  globalThis.fetch = async (input, init) => {
    requests++;
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://db.example.test');
    assert.equal(url.pathname, '/rest/v1/orders');
    if (init?.method === 'PATCH') {
      const incoming = JSON.parse(String(init.body));
      assert.equal(Object.hasOwn(incoming, 'print_provider'), false);
      record = { ...record, ...incoming };
      updates++;
    }
    const headers = new Headers(init?.headers);
    const body = headers.get('accept')?.includes('object') ? record! : [record!];
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const { POST } = await import('../src/app/api/amazon/orders/route');
    for (const provider of ['lulu', 'gelato']) {
      record = { id: 7, orderId: `TEST-REPLAY-${provider}`, amazon_order_id: `TEST-REPLAY-${provider}`,
        print_provider: provider, print_config_version: provider === 'lulu' ? 1 : 2,
        status: 'pending_review', execution_status: 'done', next_workflow: '4' };
      const originalRecord = JSON.stringify(record);
      const response = await POST(new NextRequest('https://admin.example.test/api/amazon/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          orderId: record.orderId, amazonOrderId: record.amazon_order_id, buyer: { email: 'synthetic@example.test' }, items: [],
        }),
      }));
      assert.equal(response.status, 409, `${provider} incomplete provenance must refuse before storage`);
      assert.equal(JSON.stringify(record), originalRecord, 'Malformed input must leave the complete saved row unchanged');
      assert.equal(record.print_provider, provider);
      assert.equal(record.execution_status, 'done');
    }
    assert.equal(updates, 0);
    assert.equal(requests, 0, 'Malformed provenance must cause no DB, ZIP or W0 transport');
    assert.doesNotThrow(() => assertPrintAssignmentCompatible({ print_provider: 'gelato' }, { customer_name: 'Synthetic' }));
    assert.throws(() => assertPrintAssignmentCompatible({ print_provider: 'gelato' }, { print_provider: null }), /Frozen print assignment mismatch/);
    assert.throws(() => assertPrintAssignmentCompatible({ print_provider: 'gelato' }, { print_provider: 'lulu' }), /Frozen print assignment mismatch/);
    assert.doesNotThrow(() => assertPrintAssignmentCompatible({ print_provider: 'gelato' }, { print_provider: 'gelato' }));
  } finally { globalThis.fetch = originalFetch; }
  console.log('Malformed Amazon provenance and frozen print-assignment controls passed');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });

async function testAmazonReplacementPrimitives(): Promise<string[]> {
  const savedUrl = process.env.SUPABASE_URL, savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const savedFetch = globalThis.fetch; let transports = 0;
  process.env.SUPABASE_URL = 'https://replacement-primitives.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-replacement-primitives-only';
  globalThis.fetch = async () => { transports++; throw new Error('Primitive controls forbid every transport'); };
  try {
    const H = await import('../src/lib/csv-book-selection');
    type Row = Record<string, unknown>;
    const names: string[] = [], ROOT = '111-2222222-3333333', US = 'ATVPDKIKX0DER';
    const PURCHASE = '2026-11-04T00:00:00.000Z', CUTOFF = '2026-11-03T00:00:00.000Z';
    const source = (extra: Row = {}): Row => ({ AmazonOrderId: ROOT, MarketplaceId: US, PurchaseDate: PURCHASE, ...extra });
    const auth = () => H.readAmazonReplacementAuthority(ROOT, [source()]);
    const item = (extra: Row = {}): Row => ({ OrderItemId: 'line-a', ASIN: 'B0G4QPLWKH', SellerSKU: 'KE-3QPF-VN03', QuantityOrdered: 1, ...extra });
    const items = () => H.readAmazonReplacementItems([[item()]]);
    const stub = (extra: Row = {}): Row => ({ id: 71, orderId: ROOT, amazon_order_id: ROOT, root_order_id: ROOT,
      platform: 'amazon', status: 'new', execution_status: 'pending_w0', next_workflow: null,
      workflow_step: null, current_workflow: null, updated_at: '2026-11-04T00:01:00.000Z',
      purchase_date: PURCHASE, marketplace_id: US,
      product_info: { _customization_missing: true, _retry_on_next_cron: true }, ...extra });
    const accept = (name: string, run: () => void) => { assert(!names.includes(name)); run(); names.push(name); };
    const refuse = (name: string, run: () => unknown, pattern: RegExp) => accept(name, () => assert.throws(run, pattern));
    accept('known-listing-fresh-choices', () => {
      const choices = H.buildFreshAmazonReplacementChoices(auth(), items(), [], CUTOFF);
      assert.deepEqual(choices, [{ rootOrderId: ROOT, source: { kind: 'order-item-id', value: 'line-a' },
        bookId: 'book-finding-our-inner-voice', formatId: 'amazon' }]);
      assert(Object.isFrozen(choices) && Object.isFrozen(choices[0]) && !Object.hasOwn(choices[0], 'configVersion'));
    });
    accept('equal-original-alias-instants', () => {
      const a = H.readAmazonReplacementAuthority(ROOT, [source(), { amazonOrderId: ROOT, rootOrderId: ROOT,
        marketplaceId: US, purchaseDate: '2026-11-04T01:00:00+01:00' }]);
      assert.equal(a.purchaseDate, PURCHASE);
    });
    refuse('conflicting-root-camel-alias', () => H.readAmazonReplacementAuthority(ROOT, [source({ rootOrderId: 'other-root' })]), /root identity/);
    refuse('missing-root-carrier', () => H.readAmazonReplacementAuthority(ROOT, [{ MarketplaceId: US, PurchaseDate: PURCHASE }]), /root identity/);
    for (const [index, id] of ['../x', 'a/b', 'a?b', 'a#b', 'a\\b'].entries()) {
      refuse('unsafe-root-' + index, () => H.readAmazonReplacementAuthority(id, [source({ AmazonOrderId: id })]), /root identity/);
      refuse('unsafe-item-' + index, () => H.readAmazonReplacementItems([[item({ OrderItemId: id })]]), /source item ID/);
    }
    refuse('missing-marketplace', () => H.readAmazonReplacementAuthority(ROOT, [{ AmazonOrderId: ROOT, PurchaseDate: PURCHASE }]), /marketplace/);
    accept('explicit-polling-marketplace', () => assert.equal(H.readAmazonReplacementAuthority(ROOT,
      [{ AmazonOrderId: ROOT, PurchaseDate: PURCHASE }], US).marketplaceId, US));
    refuse('contradictory-polling-marketplace', () => H.readAmazonReplacementAuthority(ROOT, [source()], 'foreign-marketplace'), /marketplace/);
    refuse('unsupported-marketplace', () => H.readAmazonReplacementAuthority(ROOT, [source({ MarketplaceId: 'foreign-marketplace' })]), /marketplace/);
    refuse('missing-purchase-date', () => H.readAmazonReplacementAuthority(ROOT, [{ AmazonOrderId: ROOT, MarketplaceId: US }]), /purchase date/);
    refuse('changed-purchase-alias', () => H.readAmazonReplacementAuthority(ROOT, [source({ purchaseDate: '2026-11-05T00:00:00Z' })]), /purchase date/);
    for (const [index, date] of ['2026-02-30T00:00:00Z', '2026-11-04T24:00:00Z', '2026-11-04T00:00:00',
      '2026-11-04T00:00:00+14:01', '2026-11-04T00:00:00.1234Z', '9999-12-31T23:59:59-14:00', '0000-01-01T00:00:00+14:00'].entries()) {
      refuse('invalid-purchase-' + index, () => H.readAmazonReplacementAuthority(ROOT, [source({ PurchaseDate: date })]), /purchase date/);
    }
    accept('leap-day-and-boundary-roundtrip', () => {
      for (const date of ['2024-02-29T23:59:59.1Z', '0000-01-01T14:00:00+14:00', '9999-12-31T09:59:59-14:00']) {
        const a = H.readAmazonReplacementAuthority(ROOT, [source({ PurchaseDate: date })]);
        const reread = H.readAmazonReplacementAuthority(ROOT, [source({ PurchaseDate: a.purchaseDate })]);
        assert.equal(reread.purchaseTimestamp, a.purchaseTimestamp);
      }
    });
    refuse('missing-cutover', () => H.buildFreshAmazonReplacementChoices(auth(), items(), [], undefined), /cutover/);
    refuse('nonutc-cutover', () => H.buildFreshAmazonReplacementChoices(auth(), items(), [], '2026-11-03T01:00:00+01:00'), /cutover/);
    refuse('before-cutover', () => H.buildFreshAmazonReplacementChoices(auth(), items(), [], '2026-11-05T00:00:00Z'), /Historical Amazon sale/);
    accept('at-cutover', () => assert.equal(H.buildFreshAmazonReplacementChoices(auth(), items(), [], PURCHASE).length, 1));
    accept('asin-only-and-sku-only', () => {
      assert.equal(H.readAmazonReplacementItems([[item({ SellerSKU: undefined })]])[0].asin, 'B0G4QPLWKH');
      assert.equal(H.readAmazonReplacementItems([[item({ ASIN: undefined })]])[0].sku, 'KE-3QPF-VN03');
    });
    refuse('unknown-asin', () => H.readAmazonReplacementItems([[item({ ASIN: 'B000000000' })]]), /listing/);
    refuse('fallback-sku-not-listing', () => H.readAmazonReplacementItems([[item({ SellerSKU: 'LHB-8X10-SOFTCOVER' })]]), /listing/);
    refuse('contradictory-item-alias', () => H.readAmazonReplacementItems([[item({ asin: 'B000000000' })]]), /ASIN/);
    refuse('missing-both-listing-identifiers', () => H.readAmazonReplacementItems([[item({ ASIN: undefined, SellerSKU: undefined })]]), /listing/);
    refuse('null-listing-identifier', () => H.readAmazonReplacementItems([[item({ ASIN: null })]]), /ASIN/);
    for (const [index, quantity] of [0, -1, 201, 1.5, true, '1', NaN, Infinity].entries()) {
      refuse('invalid-quantity-' + index, () => H.readAmazonReplacementItems([[item({ QuantityOrdered: quantity })]]), /quantity/);
    }
    refuse('duplicate-source-items', () => H.readAmazonReplacementItems([[item()], [item()]]), /Duplicate Amazon source item/);
    refuse('excess-root-quantity', () => H.readAmazonReplacementItems([[item({ QuantityOrdered: 200 })], [item({ OrderItemId: 'line-b' })]]), /cannot exceed 200/);
    accept('maximum-root-quantity', () => assert.equal(H.readAmazonReplacementItems([[item({ QuantityOrdered: 200 })]])[0].quantity, 200));
    accept('signed-url-compatibility-and-canonical-key', () => {
      const url = 'https://zip.example.test/line-a.zip?signature=' + 's'.repeat(5000) + '#old';
      const keyed = H.readAmazonReplacementItems([[item({ customization_url: url })]]);
      assert.equal(keyed[0].source.value, 'line-a');
      const fallback = H.readAmazonReplacementItems([[item({ OrderItemId: undefined, customization_url: url })]]);
      assert.deepEqual(fallback[0].source, { kind: 'customization-key', value: '7719399fad23' });
    });
    refuse('sparse-source-carriers', () => H.readAmazonReplacementAuthority(ROOT, new Array(1)), /source authority/);
    refuse('sparse-item-set', () => H.readAmazonReplacementItems(new Array(1)), /source authority/);
    refuse('forged-root-authority', () => H.buildFreshAmazonReplacementChoices({ ...auth() }, items(), [], CUTOFF), /root authority/);
    refuse('forged-item-authority', () => H.buildFreshAmazonReplacementChoices(auth(), [...items()], [], CUTOFF), /source item set/);
    accept('matching-strict-stub', () => assert.equal(H.buildFreshAmazonReplacementChoices(auth(), items(), [stub()], CUTOFF).length, 1));
    refuse('stub-purchase-redating', () => H.buildFreshAmazonReplacementChoices(auth(), items(), [stub({ purchase_date: '2026-11-02T00:00:00Z' })], CUTOFF), /stub original purchase/);
    refuse('stub-marketplace-change', () => H.buildFreshAmazonReplacementChoices(auth(), items(), [stub({ marketplace_id: 'foreign-marketplace' })], CUTOFF), /marketplace/);
    refuse('multiple-root-stubs', () => H.buildFreshAmazonReplacementChoices(auth(), items(), [stub(), stub({ id: 72 })], CUTOFF), /root authority/);
    refuse('meaningful-root-not-fresh', () => H.buildFreshAmazonReplacementChoices(auth(), items(), [stub({ character_specs: { childName: 'Original' } })], CUTOFF), /frozen original context/);
    refuse('progressed-stub-not-initial', () => H.buildFreshAmazonReplacementChoices(auth(), items(), [stub({ execution_status: 'done' })], CUTOFF), /beyond initial intake/);
    accept('absent-items-unclassified-without-cutover', () => H.assertAmazonUnclassifiedStubAdmission(auth(), [], undefined, false));
    accept('known-missing-customization-unclassified', () => H.assertAmazonUnclassifiedStubAdmission(auth(), [stub()], items(), true));
    refuse('complete-customization-cannot-create-stub', () => H.assertAmazonUnclassifiedStubAdmission(auth(), [], items(), false), /unclassified stub/);
    refuse('forged-stub-item-set', () => H.assertAmazonUnclassifiedStubAdmission(auth(), [], [], true), /unclassified stub/);
    assert.equal(transports, 0, 'Pure replacement controls must not call any transport');
    return names;
  } finally {
    globalThis.fetch = savedFetch;
    if (savedUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  }
}

async function testAmazonReplacementApi(bridgeOnly = false): Promise<string[]> {
  type Row = Record<string, any>;
  const names: string[] = [], ROOT = '111-2222222-3333333', BOOK = 'book-finding-our-inner-voice';
  const PURCHASE = '2026-11-04T00:00:00.000Z', CUTOFF = '2026-11-03T00:00:00.000Z';
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const savedFetch = globalThis.fetch;
  const environment = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AMAZON_INNER_VOICE_CUTOVER_AT', 'N8N_W0_WEBHOOK_URL'];
  const saved = Object.fromEntries(environment.map(key => [key, process.env[key]]));
  for (const key of ['NODE_OPTIONS', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'AMAZON_INNER_VOICE_CUTOVER_AT', 'N8N_W0_WEBHOOK_URL']) assert.equal(process.env[key], undefined, 'Scrubbed runner required: ' + key);
  process.env.SUPABASE_URL = 'https://replacement-db.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'SYNTHETIC-REPLACEMENT-ONLY';
  let records: Row[] = [], writes: Row[] = [], dispatches: Row[] = [], calls = 0, nextId = 1, zipReads = 0, orderReads = 0, configReads = 0;
  let zipBytes: Buffer;
  let mode = 'active', failInsert = 0, insertCount = 0, finalRace = false, mutated = false, alterInsert = false;
  let configBase: Row, checksum: (config: any) => string;
  globalThis.fetch = async (input, init) => {
    calls++;
    const request = input instanceof Request ? input : new Request(input, init), url = new URL(request.url);
    if (url.origin === 'https://replacement-w0.example.test') {
      assert.equal(url.pathname, '/intake'); assert.equal(request.method, 'POST');
      assert.equal(request.redirect, 'error'); dispatches.push(await request.json()); return Response.json({ accepted: true });
    }
    if (url.origin === 'https://replacement-zip.example.test') {
      assert.equal(url.pathname, '/line-a.zip'); assert.equal(request.method, 'GET'); zipReads++;
      return new Response(new Uint8Array(zipBytes), { headers: { 'Content-Type': 'application/zip', 'Content-Length': String(zipBytes.length) } });
    }
    assert.equal(url.origin, 'https://replacement-db.example.test', 'Every unexpected transport refuses');
    if (url.pathname === '/rest/v1/book_configs') {
      configReads++;
      assert.equal(request.method, 'GET'); assert.equal(url.searchParams.get('book_id'), 'eq.' + BOOK);
      if (mode === 'missing') return Response.json([]);
      const exact = url.searchParams.get('version');
      const version = exact ? Number(exact.slice(3)) : mode === 'new-active' ? 3 : 2;
      const config = clone(configBase); config.version = version;
      config.status = mode === 'draft' ? 'draft' : mode === 'new-active' && version === 2 ? 'archived' : 'active';
      const row = { book_id: BOOK, version, status: config.status, is_active: !(mode === 'new-active' && version === 2),
        config_json: config, checksum: mode === 'checksum' ? '0'.repeat(64) : checksum(config) };
      return Response.json([row]);
    }
    assert.equal(url.pathname, '/rest/v1/orders');
    const filter = (row: Row) => [...url.searchParams].every(([key, value]) => {
      if (['select', 'limit', 'order'].includes(key)) return true;
      if (value === 'is.null') return row[key] == null;
      assert(value.startsWith('eq.'), 'Unsupported synthetic database predicate');
      return String(row[key]) === value.slice(3);
    });
    const single = request.headers.get('accept')?.includes('vnd.pgrst.object');
    if (request.method === 'GET') {
      orderReads++;
      if (finalRace && writes.length && !mutated && url.searchParams.has('root_order_id')) {
        records[0].character_hash = 'changed-after-write'; mutated = true;
      }
      const found = records.filter(filter).slice(0, Number(url.searchParams.get('limit') ?? 1000));
      return Response.json(single ? found[0] ?? null : found);
    }
    if (request.method === 'PATCH') {
      const update = await request.json();
      const found = records.filter(filter);
      if (found.length !== 1) return Response.json({ code: 'PGRST116', message: 'Synthetic CAS conflict' }, { status: 409 });
      for (const key of ['id', 'updated_at', 'status', 'execution_status', 'orderId']) assert(url.searchParams.has(key), 'Missing exact initial CAS: ' + key);
      assert.equal(url.searchParams.get('status'), 'eq.new'); assert.equal(url.searchParams.get('execution_status'), 'eq.pending_w0');
      assert.equal(Object.hasOwn(update, 'print_provider'), false); assert.equal(Object.hasOwn(update, 'created_at'), false);
      writes.push({ method: 'PATCH', id: found[0].id, update: clone(update) }); Object.assign(found[0], update);
      return Response.json(single ? { id: found[0].id } : [{ id: found[0].id }]);
    }
    assert.equal(request.method, 'POST'); insertCount++;
    if (failInsert === insertCount) return Response.json({ code: 'SYNTHETIC', message: 'Insert failure' }, { status: 409 });
    const row = await request.json(); assert(!Array.isArray(row));
    if (records.some(existing => existing.orderId === row.orderId)) return Response.json({ code: '23505', message: 'Synthetic unique conflict' }, { status: 409 });
    const inserted = { ...row, id: nextId++ };
    if (alterInsert && inserted.character_specs) {
      inserted.character_specs = { ...inserted.character_specs, childName: 'Substituted Child' };
      const { calculateCharacterHash } = await import('../src/lib/character-hash');
      inserted.character_hash = calculateCharacterHash(inserted.character_specs, inserted.orderId);
    }
    records.push(inserted); writes.push({ method: 'POST', id: inserted.id, row: clone(row) });
    return Response.json(single ? inserted : [inserted]);
  };
  try {
    const { loadBundledBookConfig } = await import('../src/lib/books/load-book-config');
    const { computeBookConfigChecksum } = await import('../src/lib/books/runtime-book-config');
    const { calculateCharacterHash } = await import('../src/lib/character-hash');
    const { buildPendingW0Payload } = await import('../src/lib/w0-payload');
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(undefined, { noSort: true });
    zip.addFile('customization.json', Buffer.from(JSON.stringify({ orderId: ROOT, orderItemId: 'line-a',
      'version3.0': { customizationInfo: { surfaces: [{ areas: [{ label: 'Child Name', text: 'Alex' }, { label: 'Age', optionValue: '7' }] }] } } })));
    zipBytes = zip.toBuffer();
    configBase = clone(loadBundledBookConfig({ bookId: BOOK, version: 2 })); checksum = computeBookConfigChecksum;
    const { POST } = await import('../src/app/api/amazon/orders/route');
    const item = (id = 'line-a', quantity = 1, child = 'Alex') => ({ OrderItemId: id, ASIN: 'B0G4QPLWKH', SellerSKU: 'KE-3QPF-VN03',
      Title: 'Synthetic listing', QuantityOrdered: quantity, CustomizedInfo: { childName: child, age: '7' } });
    const payload = (items = [item()]): Row => {
      const original = clone(items), normalized = items.map(value => ({ orderItemId: value.OrderItemId, asin: value.ASIN, sku: value.SellerSKU,
        title: value.Title, quantity: value.QuantityOrdered, customization: value.CustomizedInfo,
        customizations: Object.entries(value.CustomizedInfo).map(([name, value]) => ({ name, label: name, type: 'text', value: String(value) })) }));
      const buyerInfo = { AmazonOrderId: ROOT, OrderItems: [] };
      return { amazonOrderId: ROOT, orderId: ROOT, id: ROOT, purchaseDate: PURCHASE, orderDate: PURCHASE, marketplaceId: 'ATVPDKIKX0DER',
        buyer: { name: 'Synthetic Adult', email: 'synthetic@example.test' },
        shippingAddress: { name: 'Synthetic Adult', address: '1 Test Lane', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
        items: normalized, lineItems: normalized.map(value => ({ orderItemId: value.orderItemId, asin: value.asin, sku: value.sku,
          quantity: value.quantity, customizationFields: Object.entries(value.customization).map(([name, value]) => ({ name, text: String(value) })) })),
        ...(items.length === 1 ? { customization: items[0].CustomizedInfo } : {}),
        _raw: { order: { AmazonOrderId: ROOT, PurchaseDate: PURCHASE, MarketplaceId: 'ATVPDKIKX0DER' }, items: original, itemsBuyerInfo: buyerInfo,
          itemResponses: { requestedOrderId: ROOT, items: { payload: { AmazonOrderId: ROOT, OrderItems: original } }, buyerInfo: { payload: buyerInfo } } } };
    };
    const reset = () => {
      records = []; writes = []; dispatches = []; nextId = 1; calls = 0; zipReads = 0; orderReads = 0; configReads = 0; mode = 'active'; failInsert = 0; insertCount = 0; finalRace = false; mutated = false; alterInsert = false;
      process.env.AMAZON_INNER_VOICE_CUTOVER_AT = CUTOFF; process.env.N8N_W0_WEBHOOK_URL = 'https://replacement-w0.example.test/intake';
    };
    const invoke = async (body: Row) => {
      const response = await POST(new NextRequest('https://admin.example.test/api/amazon/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
      return { status: response.status, body: await response.json() };
    };
    const check = async (name: string, run: () => Promise<void>) => {
      reset();
      try { await run(); } catch (error) { throw new Error('Amazon API case failed: ' + name, { cause: error }); }
      assert(!names.includes(name)); names.push(name);
    };
    if (bridgeOnly) {
      const { readFileSync } = await import('node:fs');
      const path = await import('node:path');
      const vm = await import('node:vm');
      const { parseW0ManifestRequest } = await import('../src/lib/w0-manifest-request');
      const { buildOrderIntakeManifestFromNormalizedInputRuntime } = await import('../src/lib/w0-manifest-builder');
      const { prepareFrozenW0Manifest } = await import('../src/lib/books/freeze-w0-manifest');
      const graph = JSON.parse(readFileSync(path.resolve('../docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json'), 'utf8'));
      const runNode = (name: string, context: Row): Row => {
        const source = graph.nodes.find((node: Row) => node.name === name)?.parameters?.jsCode;
        assert.equal(typeof source, 'string', 'Missing actual W0 consumer node: ' + name);
        return vm.runInNewContext(`(() => { ${source}\n })()`, context, { timeout: 1000 })[0].json;
      };
      const consume = async (captured: Row) => {
        const before = clone(captured), raw = clone(captured);
        assert.equal(raw.bookSpecs.testMode, undefined, 'Positive bridge must not add testMode');
        const normalized = runNode('Normalize Payload', { $input: { first: () => ({ json: raw }) },
          $item: () => ({ $node: { 'CONFIG (PRODUCTION)': { json: {} } } }) });
        const dedicated = runNode('Extract & Validate Dedication', { $input: { first: () => ({ json: normalized }) } });
        const prepared = runNode('Prepare Build 1 Manifest Body', { $json: dedicated });
        const parsed = parseW0ManifestRequest(JSON.parse(String(prepared.requestBody)));
        const built = await buildOrderIntakeManifestFromNormalizedInputRuntime(parsed.input, parsed.options);
        assert.deepEqual(raw, before, 'Actual captured producer body must remain unchanged');
        assert.deepEqual(captured, before);
        return { parsed, built };
      };
      const memory = (original: Row) => {
        let row: Row = clone(original), creates = 0, persists = 0;
        const objects = new Map<string, Row>();
        const storage = {
          loadOrder: async (orderId: string) => { assert.equal(orderId, original.orderId); return clone(row); },
          loadManifest: async (key: string) => objects.has(key) ? clone(objects.get(key)!) : null,
          createManifest: async (key: string, manifest: Row) => {
            creates++; if (objects.has(key)) return false;
            objects.set(key, clone(manifest)); return true;
          },
          persistOrder: async (update: Row) => {
            persists++; assert.equal(update.orderId, original.orderId);
            assertPrintAssignmentCompatible(row, update); row = { ...row, ...clone(update) };
            return { data: clone(row), error: null };
          },
        };
        return { storage, objects, get creates() { return creates; }, get persists() { return persists; },
          get row() { return row; }, set row(value: Row) { row = clone(value); } };
      };
      const assertBridge = async (captured: Row, original: Row) => {
        const saved = clone(original), { parsed, built } = await consume(captured);
        const manifest = clone(built.manifest) as Row;
        assert.equal(manifest.order.orderId, original.orderId);
        assert.equal(manifest.order.rootOrderId, ROOT); assert.equal(manifest.order.amazonOrderId, ROOT);
        assert.equal(manifest.order.platform, 'amazon');
        assert.equal(manifest.book.bookConfigRef.bookId, BOOK);
        assert.equal(manifest.book.bookConfigRef.formatId, 'amazon'); assert.equal(manifest.book.bookConfigRef.version, 2);
        assert.equal(manifest.book.resolved.expectedPageCount, 32);
        assert.equal(manifest.artifacts.manifestKey, built.manifestKey);
        assert.equal(manifest.artifacts.characterPrefix.split('/').filter(Boolean).at(-1), original.character_hash);
        assert.deepEqual(manifest.input.characterSpecs, original.character_specs);
        assert.equal(manifest.input.dedicationText, original.dedication_text ?? null);
        const context = manifest.input.orderDetails, info = original.product_info;
        for (const key of ['line_item', 'line_items', '_quantity_unit_index', '_quantity_unit_count', '_customized_url_hash']) {
          assert.deepEqual(context[key], info[key], 'Frozen physical-book context: ' + key);
        }
        assert.equal(context._order_item_id, info.line_item.order_item_id ?? null); assert.equal(context.quantity, 1);
        const store = memory(original);
        const frozen = await prepareFrozenW0Manifest(parsed.input, built, store.storage, true);
        assert.equal(frozen.created, true); assert.equal(frozen.published, true);
        assert.equal(store.objects.size, 1); assert.equal(store.creates, 1); assert.equal(store.persists, 1);
        assert.equal(store.row.print_book_id, BOOK); assert.equal(store.row.print_format_id, 'amazon');
        assert.equal(store.row.print_config_version, 2); assert.equal(store.row.print_provider, 'gelato');
        const expectedPrint = configBase.formats.amazon.print;
        assert.equal(store.row.print_product_uid, expectedPrint.productUid);
        assert.equal(store.row.print_inner_page_count, expectedPrint.innerPageCount);
        assert.equal(store.row.print_api_page_count, expectedPrint.apiPageCount);
        assert.equal(store.row.print_expected_pdf_page_count, expectedPrint.expectedPdfPageCount);
        assert.equal(store.row.print_manifest_key, built.manifestKey); assert.equal(store.row.one_manifest_url, built.manifestKey);
        assert.equal(store.row.character_hash, original.character_hash); assert.deepEqual(store.row.character_specs, original.character_specs);
        assert.equal(store.row.dedication_text, original.dedication_text ?? null);
        store.row = { ...store.row, status: 'shipped', execution_status: 'done', next_workflow: '4', workflow_step: 'print_fulfillment', customer_email: 'corrected@example.test' };
        const progressed = clone(store.row), again = await consume(captured);
        const reused = await prepareFrozenW0Manifest(again.parsed.input, again.built, store.storage, true);
        assert.equal(reused.reused, true); assert.deepEqual(reused.manifest, frozen.manifest);
        assert.deepEqual(store.row, progressed, 'Duplicate publication must preserve progressed lifecycle and customer fields');
        assert.equal(store.objects.size, 1); assert.equal(store.creates, 1); assert.equal(store.persists, 2);
        assert.deepEqual(original, saved, 'Memory publication must not mutate the actual API record');
      };
      await check('bridge-fresh-single-dedication', async () => {
        const single = item(); single.CustomizedInfo = { ...single.CustomizedInfo, dedication: 'For Alex, with love.' } as typeof single.CustomizedInfo;
        assert.equal((await invoke(payload([single]))).status, 201);
        assert.equal(dispatches.length, 1); assert.equal(records[0].dedication_text, 'For Alex, with love.');
        await assertBridge(dispatches[0], records[0]);
      });
      await check('bridge-quantity-two-plus-one', async () => {
        assert.equal((await invoke(payload([item('line-a', 2), item('line-b', 1, 'Sam')]))).status, 201);
        assert.equal(dispatches.length, 3); assert.equal(records.length, 3);
        for (const captured of dispatches) {
          const original = records.find(row => row.orderId === captured.orderId); assert(original);
          await assertBridge(captured, original);
        }
      });
      await check('bridge-mixed-progressed-pending', async () => {
        const body = payload([item('line-a'), item('line-b', 1, 'Sam')]); assert.equal((await invoke(body)).status, 201);
        records[0] = { ...records[0], status: 'pending_processing', execution_status: 'ready_for_processing', next_workflow: '2A', workflow_step: 'order_intake', print_provider: 'gelato', print_config_version: 2 };
        const progressed = clone(records[0]); writes = []; dispatches = [];
        assert.equal((await invoke(body)).status, 200); assert.equal(dispatches.length, 1);
        assert.equal(dispatches[0].orderId, records[1].orderId); assert.deepEqual(records[0], progressed);
        await assertBridge(dispatches[0], records[1]); assert.deepEqual(records[0], progressed);
      });
      await check('bridge-frozen-two-with-active-three', async () => {
        const body = payload(); assert.equal((await invoke(body)).status, 201);
        mode = 'new-active'; writes = []; dispatches = [];
        assert.equal((await invoke(body)).status, 200); assert.equal(dispatches.length, 1);
        assert.equal(dispatches[0].configVersion, 2); await assertBridge(dispatches[0], records[0]);
      });
      await check('bridge-draft-refuses-before-publication', async () => {
        assert.equal((await invoke(payload())).status, 201); assert.equal(dispatches.length, 1);
        const store = memory(records[0]), before = clone(store.row); mode = 'draft';
        await assert.rejects(async () => {
          const { parsed, built } = await consume(dispatches[0]);
          await prepareFrozenW0Manifest(parsed.input, built, store.storage, true);
        }, /Draft configured book intake requires bookSpecs.testMode:true/);
        assert.equal(store.creates, 0); assert.equal(store.persists, 0); assert.equal(store.objects.size, 0); assert.deepEqual(store.row, before);
      });
      await check('bridge-corrupt-unit-refuses-before-publication', async () => {
        assert.equal((await invoke(payload())).status, 201); assert.equal(dispatches.length, 1);
        const corrupted = clone(dispatches[0]); corrupted.unitIndex = 99;
        const store = memory(records[0]), before = clone(store.row);
        await assert.rejects(async () => {
          const { parsed, built } = await consume(corrupted);
          await prepareFrozenW0Manifest(parsed.input, built, store.storage, true);
        }, /W0/);
        assert.equal(store.creates, 0); assert.equal(store.persists, 0); assert.equal(store.objects.size, 0); assert.deepEqual(store.row, before);
      });
      await check('bridge-corrupt-stored-unit-refuses-reuse', async () => {
        assert.equal((await invoke(payload())).status, 201); assert.equal(dispatches.length, 1);
        const { parsed, built } = await consume(dispatches[0]), store = memory(records[0]);
        await prepareFrozenW0Manifest(parsed.input, built, store.storage, true);
        assert.equal(store.creates, 1); assert.equal(store.persists, 1);
        const corrupted = clone(store.objects.get(built.manifestKey)!);
        corrupted.input.orderDetails._quantity_unit_index = 99;
        store.objects.set(built.manifestKey, corrupted);
        const before = clone(store.row), storedBefore = clone(corrupted);
        await assert.rejects(
          () => prepareFrozenW0Manifest(parsed.input, built, store.storage, true),
          /Invalid W0 unit context/,
        );
        assert.equal(store.creates, 1); assert.equal(store.persists, 1); assert.equal(store.objects.size, 1);
        assert.deepEqual(store.row, before); assert.deepEqual(store.objects.get(built.manifestKey), storedBefore);
      });
      assert.equal(names.length, 7); assert.equal(new Set(names).size, 7);
      return names;
    }
    for (const [name, body, status] of [
      ['invalid-utf8-body-zero-transport', new Uint8Array([0xff]), 400],
      ['oversized-streamed-body-zero-transport', new Uint8Array(2 * 1024 * 1024 + 1).fill(0x78), 413],
    ] as const) await check(name, async () => {
      const request = new NextRequest('https://admin.example.test/api/amazon/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      assert.equal(request.headers.has('content-length'), false, 'Exercise actual byte counting without a declared length');
      const response = await POST(request); assert.equal(response.status, status);
      assert.equal((await response.json()).success, false);
      assert.equal(calls, 0); assert.deepEqual(records, []);
      assert.equal(writes.length, 0); assert.equal(dispatches.length, 0);
    });
    await check('fresh-single-configured-32-pages', async () => {
      const response = await invoke(payload()); assert.equal(response.status, 201); assert.equal(records.length, 1); assert.equal(dispatches.length, 1);
      assert.equal(records[0].orderId, ROOT); assert.equal(records[0].book_specs.totalPages, 32);
      assert.equal(records[0].book_specs.bookId, BOOK); assert.equal(records[0].character_specs.childName, 'Alex');
      assert.equal(records[0].character_hash, calculateCharacterHash(records[0].character_specs, ROOT));
      assert.deepEqual(dispatches[0], buildPendingW0Payload(records[0]));
      assert.equal(records[0].product_info.line_items[0].asin, 'B0G4QPLWKH');
      assert.equal(JSON.stringify(dispatches).includes('Adventure Compass'), false);
    });
    await check('fresh-two-children-quantity-three', async () => {
      const response = await invoke(payload([item('line-a', 2), item('line-b', 1, 'Sam')]));
      assert.equal(response.status, 201); assert.equal(records.length, 3); assert.equal(dispatches.length, 3);
      assert.deepEqual(records.map(row => row.character_specs.childName), ['Alex', 'Alex', 'Sam']);
      assert.equal(new Set(records.map(row => row.orderId)).size, 3); assert.equal(new Set(records.map(row => row.character_hash)).size, 3);
      for (const row of records) { assert.equal(row.book_specs.totalPages, 32); assert.equal(row.product_info.line_items.length, 2); }
    });
    for (const [name, mutate] of [
      ['missing-cutover', () => { delete process.env.AMAZON_INNER_VOICE_CUTOVER_AT; }],
      ['invalid-cutover', () => { process.env.AMAZON_INNER_VOICE_CUTOVER_AT = 'not-a-date'; }],
      ['late-unseen-old-sale', () => { process.env.AMAZON_INNER_VOICE_CUTOVER_AT = '2026-11-05T00:00:00Z'; }],
    ] as const) await check(name, async () => { mutate(); const response = await invoke(payload()); assert.equal(response.status, 409); assert.equal(writes.length, 0); assert.equal(dispatches.length, 0); });
    for (const value of ['draft', 'missing', 'checksum']) await check('unavailable-config-' + value, async () => {
      mode = value; const response = await invoke(payload());
      assert.equal(response.status, value === 'draft' ? 409 : 503, 'Availability status must survive API error classification: ' + value);
      assert.equal(response.body.success, false); assert.deepEqual(records, []);
      assert.equal(writes.length, 0); assert.equal(dispatches.length, 0);
    });
    for (const [name, mutate] of [
      ['foreign-request-root', (body: Row) => { body._raw.itemResponses.requestedOrderId = 'foreign'; }],
      ['paginated-items', (body: Row) => { body._raw.itemResponses.items.payload.NextToken = 'page'; }],
      ['paginated-buyer-items', (body: Row) => { body._raw.itemResponses.buyerInfo.payload.NextToken = 'page'; }],
      ['duplicate-buyer-item', (body: Row) => { body._raw.itemsBuyerInfo.OrderItems = [{ OrderItemId: 'line-a' }, { OrderItemId: 'line-a' }]; body._raw.itemResponses.buyerInfo.payload = body._raw.itemsBuyerInfo; }],
      ['foreign-buyer-item', (body: Row) => { body._raw.itemsBuyerInfo.OrderItems = [{ OrderItemId: 'foreign' }]; body._raw.itemResponses.buyerInfo.payload = body._raw.itemsBuyerInfo; }],
      ['conflicting-normalized-quantity', (body: Row) => { body.items[0].quantity = 2; }],
      ['unknown-asin', (body: Row) => { body._raw.items[0].ASIN = 'UNKNOWN'; body._raw.itemResponses.items.payload.OrderItems = body._raw.items; }],
      ['conflicting-root-customization', (body: Row) => { body.customization = { childName: 'Other', age: '7' }; }],
      ['conflicting-line-customization', (body: Row) => { body.lineItems[0].customizationFields[0].text = 'Other'; }],
      ['nested-original-customization-conflict', (body: Row) => {
        delete body._raw.items[0].CustomizedInfo; body._raw.items[0].BuyerInfo = { BuyerCustomizedInfo: { CustomizedInfo: { childName: 'Original Other', age: '7' } } };
        body._raw.itemResponses.items.payload.OrderItems = body._raw.items;
      }],
      ['explicit-book-claim', (body: Row) => { body.bookId = 'book-mvp-simple-adventure'; }],
    ] as const) await check(name, async () => {
      const body = payload(); mutate(body); const response = await invoke(body); assert.equal(response.status, 409);
      assert.equal(writes.length, 0); assert.equal(dispatches.length, 0);
    });
    await check('verified-empty-no-cutover-pure-stub', async () => {
      delete process.env.AMAZON_INNER_VOICE_CUTOVER_AT; const response = await invoke(payload([]));
      assert.equal(response.status, 201); assert.equal(records.length, 1); assert.equal(dispatches.length, 0);
      assert.deepEqual(records[0].product_info, { _customization_missing: true, _retry_on_next_cron: true });
      assert.equal(Object.hasOwn(records[0], 'character_hash'), false); assert.equal(Object.hasOwn(records[0], 'book_specs'), false);
      writes = []; const again = await invoke(payload([])); assert.equal(again.status, 200); assert.equal(writes.length, 0);
    });
    await check('missing-customization-stub-then-complete', async () => {
      const body = payload(); body.items[0].customization = {}; body.items[0].customizations = []; body.customization = {};
      body.lineItems[0].customizationFields = []; body._raw.items[0].CustomizedInfo = {}; body._raw.itemResponses.items.payload.OrderItems = body._raw.items;
      const response = await invoke(body); assert.equal(response.status, 201); const id = records[0].id;
      writes = []; const complete = await invoke(payload()); assert.equal(complete.status, 200); assert.equal(records.length, 1);
      assert.equal(records[0].id, id); assert.equal(writes[0].method, 'PATCH'); assert.equal(dispatches.length, 1);
    });
    await check('mixed-progressed-pending-retry-originals-only', async () => {
      const body = payload([item('line-a'), item('line-b', 1, 'Sam')]); assert.equal((await invoke(body)).status, 201);
      records[0].status = 'pending_processing'; records[0].execution_status = 'ready_for_processing'; records[0].next_workflow = '2A'; records[0].workflow_step = 'order_intake';
      records[0].print_provider = 'gelato'; records[0].print_config_version = 2;
      const preserved = clone(records[0]); writes = []; dispatches = []; body.triggerW0 = true;
      for (const entry of body.items) entry.customization.childName = 'Incoming Other';
      for (const entry of body.lineItems) entry.customizationFields.find((field: Row) => field.name === 'childName').text = 'Incoming Other';
      for (const entry of body.items) entry.customizations.find((field: Row) => field.name === 'childName').value = 'Incoming Other';
      const response = await invoke(body); assert.equal(response.status, 200); assert.deepEqual(records[0], preserved);
      assert.equal(writes.length, 1); assert.equal(writes[0].id, records[1].id); assert.equal(dispatches.length, 1);
      assert.equal(dispatches[0].characterSpecs.childName, 'Sam');
    });
    await check('corrupt-preserved-member-blocks-pending', async () => {
      const body = payload([item('line-a'), item('line-b', 1, 'Sam')]); assert.equal((await invoke(body)).status, 201);
      records[0].execution_status = 'done'; records[0].character_hash = 'corrupt'; const before = clone(records);
      writes = []; dispatches = []; assert.equal((await invoke(body)).status, 409);
      assert.deepEqual(records, before); assert.equal(writes.length, 0); assert.equal(dispatches.length, 0);
    });
    await check('frozen-version-two-survives-active-three', async () => {
      const body = payload(); assert.equal((await invoke(body)).status, 201); mode = 'new-active'; writes = []; dispatches = [];
      assert.equal((await invoke(body)).status, 200); assert.equal(records[0].book_specs.configVersion, 2); assert.equal(dispatches[0].configVersion, 2);
    });
    await check('partial-insert-zero-dispatch-then-recovery', async () => {
      const body = payload([item('line-a', 2)]); failInsert = 2;
      assert.equal((await invoke(body)).status, 409); assert.equal(records.length, 1); assert.equal(dispatches.length, 0);
      const saved = clone(records[0]);
      failInsert = 0; writes = []; assert.equal((await invoke(body)).status, 200);
      assert.equal(records.length, 2); assert.equal(dispatches.length, 2);
      const original = records.find(row => row.id === saved.id); assert(original);
      for (const key of ['id', 'orderId', 'root_order_id', 'amazon_order_id', 'marketplace_id', 'purchase_date', 'character_specs', 'character_hash', 'book_specs', 'product_info']) {
        assert.deepEqual(original[key], saved[key], 'Recovery must preserve surviving original context: ' + key);
      }
      assert.equal(writes.filter(row => row.method === 'PATCH').length, 1);
      assert.equal(writes.find(row => row.method === 'PATCH')!.id, saved.id);
      assert.equal(writes.filter(row => row.method === 'POST').length, 1);
      assert.equal(new Set(records.map(row => row.orderId)).size, 2);
      assert.equal(new Set(records.map(row => row.character_hash)).size, 2);
      assert.deepEqual(new Set(dispatches.map(row => row.orderId)), new Set(records.map(row => row.orderId)));
      for (const captured of dispatches) {
        const row = records.find(value => value.orderId === captured.orderId); assert(row);
        assert.deepEqual(row.character_specs, saved.character_specs);
        assert.deepEqual(captured.characterSpecs, saved.character_specs);
        assert.equal(captured.characterHash, row.character_hash);
        assert.deepEqual(captured.bookSpecs, saved.book_specs);
      }
    });
    await check('partial-insert-changed-original-recovery-held', async () => {
      const body = payload([item('line-a', 2)]); failInsert = 2;
      assert.equal((await invoke(body)).status, 409); assert.equal(records.length, 1); assert.equal(dispatches.length, 0);
      const before = clone(records); failInsert = 0;
      writes = []; dispatches = []; calls = 0; zipReads = 0; orderReads = 0; configReads = 0;
      const response = await invoke(payload([item('line-a', 2, 'Changed')]));
      assert.equal(response.status, 409); assert.equal(response.body.success, false);
      assert(orderReads > 0); assert(configReads > 0, 'Coherent source must reach frozen selection and recovery inspection');
      assert.deepEqual(records, before); assert.equal(writes.length, 0); assert.equal(dispatches.length, 0);
    });
    await check('final-reread-context-race-zero-dispatch', async () => {
      finalRace = true; assert.equal((await invoke(payload())).status, 409); assert(mutated); assert.equal(dispatches.length, 0);
    });
    await check('normalized-only-zip-url-no-download-or-write', async () => {
      const body = payload(); delete body._raw.items[0].CustomizedInfo;
      body._raw.itemResponses.items.payload.OrderItems = body._raw.items;
      body.items[0].customization_url = 'https://replacement-zip.example.test/line-a.zip';
      assert.equal((await invoke(body)).status, 409); assert.equal(zipReads, 0); assert.equal(writes.length, 0); assert.equal(dispatches.length, 0);
    });
    await check('nested-raw-buyer-zip-source-positive', async () => {
      const body = payload(); delete body._raw.items[0].CustomizedInfo;
      body._raw.itemResponses.items.payload.OrderItems = body._raw.items;
      body._raw.itemsBuyerInfo.OrderItems = [{ OrderItemId: 'line-a', BuyerCustomizedInfo: { CustomizedURL: 'https://replacement-zip.example.test/line-a.zip' } }];
      body._raw.itemResponses.buyerInfo.payload = body._raw.itemsBuyerInfo;
      body.items[0].customization = {}; body.items[0].customizations = []; body.lineItems[0].customizationFields = []; body.customization = {};
      assert.equal((await invoke(body)).status, 201); assert.equal(zipReads, 1); assert.equal(records[0].character_specs.childName, 'Alex');
      assert.equal(dispatches.length, 1); assert.equal(records[0].product_info.line_item.customization_url, 'https://replacement-zip.example.test/line-a.zip');
    });
    await check('raw-versus-normalized-zip-url-conflict-no-download', async () => {
      const body = payload(); body._raw.items[0].BuyerInfo = { BuyerCustomizedInfo: { CustomizedURL: 'https://replacement-zip.example.test/line-a.zip' } };
      body._raw.itemResponses.items.payload.OrderItems = body._raw.items;
      body.items[0].customization_url = 'https://replacement-zip.example.test/foreign.zip';
      assert.equal((await invoke(body)).status, 409); assert.equal(zipReads, 0); assert.equal(writes.length, 0); assert.equal(dispatches.length, 0);
    });
    await check('self-consistent-insert-return-substitution-zero-dispatch', async () => {
      alterInsert = true; assert.equal((await invoke(payload())).status, 409); assert.equal(records.length, 1);
      assert.equal(records[0].character_specs.childName, 'Substituted Child'); assert.equal(dispatches.length, 0);
    });
    await check('complete-frozen-root-empty-source-retries-stored-context', async () => {
      assert.equal((await invoke(payload())).status, 201); writes = []; dispatches = [];
      assert.equal((await invoke(payload([]))).status, 200); assert.equal(dispatches.length, 1);
      assert.equal(dispatches[0].characterSpecs.childName, 'Alex'); assert.equal(records[0].book_specs.configVersion, 2);
    });
    for (const field of ['next_workflow', 'current_workflow', 'workflow_step']) await check('unknown-stored-workflow-' + field, async () => {
      const body = payload([item('line-a'), item('line-b', 1, 'Sam')]); assert.equal((await invoke(body)).status, 201);
      records[0][field] = 'unknown-workflow'; writes = []; dispatches = [];
      assert.equal((await invoke(body)).status, 409); assert.equal(writes.length, 0); assert.equal(dispatches.length, 0);
    });
    await check('explicit-webhook-required', async () => {
      delete process.env.N8N_W0_WEBHOOK_URL; assert.equal((await invoke(payload())).status, 201); assert.equal(dispatches.length, 0);
    });
    await check('unmarked-historical-array-explicit-hold', async () => {
      records = [{ id: nextId++, orderId: ROOT, amazon_order_id: ROOT, status: 'pending_review', execution_status: 'done', next_workflow: '4',
        purchase_date: PURCHASE, marketplace_id: 'ATVPDKIKX0DER', product_info: [item()], print_provider: 'gelato', print_config_version: 2 }];
      const before = clone(records); assert.equal((await invoke(payload())).status, 409); assert.deepEqual(records, before);
      assert.equal(writes.length, 0); assert.equal(dispatches.length, 0);
    });
    const historicalRow = (provider: 'lulu' | 'gelato', shape: 'object' | 'array'): Row => {
      const specs = { childName: 'Original Legacy Child', age: '5', dedication: 'Original dedication' };
      return {
        id: nextId++, orderId: ROOT, amazon_order_id: ROOT, root_order_id: ROOT, platform: 'amazon',
        status: 'pending_review', execution_status: 'done', next_workflow: '4', workflow_step: 'order_intake',
        purchase_date: PURCHASE, marketplace_id: 'ATVPDKIKX0DER',
        created_at: PURCHASE, updated_at: '2026-11-04T00:01:00.000Z',
        character_specs: specs, character_hash: calculateCharacterHash(specs, ROOT),
        dedication_text: specs.dedication,
        book_specs: { bookId: 'book-mvp-simple-adventure', configVersion: 1, formatId: 'standard', totalPages: 16 },
        product_info: shape === 'array' ? [item()] : { line_items: [item()], legacy_note: 'Retain original context' },
        print_provider: provider, print_config_version: provider === 'lulu' ? 1 : 2,
        manifest_2b_url: 'r2://synthetic-retained/original-manifest.json',
        shipping_address: { name: 'Original Adult', city: 'Original City' },
      };
    };
    for (const provider of ['lulu', 'gelato'] as const) {
      await check('malformed-provenance-preserves-historical-' + provider, async () => {
        records = [historicalRow(provider, 'object')]; const before = clone(records);
        const response = await invoke({ orderId: ROOT, amazonOrderId: ROOT, buyer: { email: 'synthetic@example.test' }, items: [] });
        assert.equal(response.status, 409); assert.equal(response.body.success, false);
        assert.deepEqual(records, before);
        assert.equal(calls, 0, 'Malformed originals must refuse before every transport');
        assert.equal(orderReads, 0); assert.equal(configReads, 0); assert.equal(zipReads, 0);
        assert.equal(writes.length, 0); assert.equal(dispatches.length, 0);
      });
      for (const shape of ['object', 'array'] as const) {
        await check('valid-originals-hold-unmarked-historical-' + provider + '-' + shape, async () => {
          records = [historicalRow(provider, shape)]; const before = clone(records);
          const response = await invoke(payload());
          assert.equal(response.status, 409); assert.equal(response.body.success, false);
          assert(orderReads > 0, 'Valid incoming originals must reach stored-row inspection');
          assert.equal(calls, orderReads, 'Legacy hold must perform only order reads');
          assert.equal(configReads, 0); assert.equal(zipReads, 0);
          assert.equal(writes.length, 0); assert.equal(dispatches.length, 0);
          assert.deepEqual(records, before, 'Historical context, print assignment and unrelated fields must survive');
        });
      }
    }
    for (const source of ['populated', 'empty'] as const) {
      await check('all-progressed-trigger-preserves-root-' + source, async () => {
        const original = payload([item('line-a', 2), item('line-b', 1, 'Sam')]);
        assert.equal((await invoke(original)).status, 201);
        assert.equal(records.length, 3); assert.equal(dispatches.length, 3);
        for (const row of records) {
          row.status = 'pending_processing'; row.execution_status = 'ready_for_processing';
          row.next_workflow = '2A'; row.workflow_step = 'order_intake';
          row.print_provider = 'gelato'; row.print_config_version = 2;
        }
        const before = clone(records);
        writes = []; dispatches = []; calls = 0; zipReads = 0; orderReads = 0; configReads = 0;
        const body = source === 'empty' ? payload([]) : original; body.triggerW0 = true;
        const response = await invoke(body);
        assert.equal(response.status, 200); assert.equal(response.body.success, true);
        assert.equal(response.body.preserved, 3); assert.equal(response.body.w0Attempted, false); assert.equal(response.body.w0Called, 0);
        assert.deepEqual(response.body.orderIds, before.map(row => row.orderId));
        assert(orderReads > 0); assert.equal(zipReads, 0);
        assert.equal(writes.length, 0); assert.equal(dispatches.length, 0);
        assert.deepEqual(records, before, 'Trigger override must preserve every progressed member byte-for-byte in JSON');
      });
    }
    assert.equal(names.length, 47, 'All retained and added actual API cases must run');
    assert.equal(new Set(names).size, names.length);
    return names;
  } finally {
    globalThis.fetch = savedFetch;
    for (const key of environment) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
}
