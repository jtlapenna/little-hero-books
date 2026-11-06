import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

async function main(): Promise<string[]> {
  type Row = Record<string, any>;
  const names: string[] = [], ROOT = '111-2222222-3333333', BOOK = 'book-finding-our-inner-voice';
  const PURCHASE = '2026-11-04T00:00:00.000Z', CUTOFF = '2026-11-03T00:00:00.000Z';
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const savedFetch = globalThis.fetch;
  const environment = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AMAZON_INNER_VOICE_CUTOVER_AT', 'N8N_W0_WEBHOOK_URL', 'CRON_SECRET'];
  const saved = Object.fromEntries(environment.map(key => [key, process.env[key]]));
  for (const key of ['NODE_OPTIONS', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'AMAZON_INNER_VOICE_CUTOVER_AT', 'N8N_W0_WEBHOOK_URL']) assert.equal(process.env[key], undefined, 'Scrubbed runner required: ' + key);
  process.env.SUPABASE_URL = 'https://replacement-db.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'SYNTHETIC-REPLACEMENT-ONLY';
  let records: Row[] = [], writes: Row[] = [], dispatches: Row[] = [], calls = 0, nextId = 1, zipReads = 0, orderReads = 0, configReads = 0;
  let mutationAttempts: Row[] = [];
  let discoveryOrders: Row[] = [], providerCalls: string[] = [], unexpected: string[] = [], webhookFailure = false;
  let zipBytes: Buffer;
  let mode = 'active', failInsert = 0, insertCount = 0, finalRace = false, mutated = false, alterInsert = false;
  let configBase: Row, checksum: (config: any) => string;
  globalThis.fetch = async (input, init) => {
    try {
    calls++;
    const request = input instanceof Request ? input : new Request(input, init), url = new URL(request.url);
    if (url.origin === 'https://replacement-db.example.test' && !['GET', 'HEAD'].includes(request.method)) mutationAttempts.push({ method: request.method, url: request.url });
    if (url.origin === 'https://api.amazon.com') {
      assert.equal(url.pathname, '/auth/o2/token'); assert.equal(request.method, 'POST'); providerCalls.push('token');
      return Response.json({ access_token: 'SYNTHETIC-NATIVE-TOKEN' });
    }
    if (url.origin === 'https://sellingpartnerapi-na.amazon.com') {
      assert.equal(request.method, 'GET');
      if (url.pathname.endsWith('/orderItems')) {
        providerCalls.push('items');
        return Response.json({ payload: { OrderItems: [{ OrderItemId: 'line-a', ASIN: 'B0G4QPLWKH', QuantityOrdered: 1,
          CustomizedInfo: { "Child's Name": 'Changed incoming', "Child's Age": '8' } }] } });
      }
      assert.equal(url.pathname, '/orders/v0/orders'); providerCalls.push('orders');
      return Response.json({ payload: { Orders: clone(discoveryOrders) } });
    }
    if (url.origin === 'https://replacement-w0.example.test') {
      assert.equal(url.pathname, '/intake'); assert.equal(request.method, 'POST');
      assert.equal(request.redirect, 'error'); dispatches.push(await request.json()); return Response.json(webhookFailure ? { error: 'Synthetic unavailable' } : { accepted: true }, { status: webhookFailure ? 503 : 200 });
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
    } catch (error) { unexpected.push(error instanceof Error ? error.message : String(error)); throw error; }
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
    process.env.CRON_SECRET = 'SYNTHETIC-NATIVE-CRON';
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
      discoveryOrders = []; providerCalls = []; unexpected = []; mutationAttempts = []; webhookFailure = false; records = []; writes = []; dispatches = []; nextId = 1; calls = 0; zipReads = 0; orderReads = 0; configReads = 0; mode = 'active'; failInsert = 0; insertCount = 0; finalRace = false; mutated = false; alterInsert = false;
      process.env.AMAZON_INNER_VOICE_CUTOVER_AT = CUTOFF; process.env.N8N_W0_WEBHOOK_URL = 'https://replacement-w0.example.test/intake';
    };
    const invoke = async (body: Row) => {
      const response = await POST(new NextRequest('https://admin.example.test/api/amazon/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
      return { status: response.status, body: await response.json() };
    };
    const check = async (name: string, run: () => Promise<void>) => {
      reset();
      try { await run(); } catch (error) {
        console.error(JSON.stringify({ status: 'failed', case: name, records, writes, dispatches, providerCalls, unexpected, mutationAttempts }));
        throw new Error('Native Amazon recovery case failed: ' + name, { cause: error });
      }
      assert(!names.includes(name)); names.push(name);
    };
    const args = process.argv.slice(2);
    assert(args.length === 0 || args.length === 4);
    if (args.length) { assert.equal(args[0], '--csv-source'); assert.equal(args[2], '--csv-source-sha'); }
    const fixturePath = args.length ? args[1] : path.resolve('scripts/fixtures/amazon-native-mixed-csv.json');
    const fixtureSha = 'd42236c23ec9e8b0328239daf6b740596e07a8022a9bd42fc7a6116a43691743';
    if (args.length) assert.equal(args[3], fixtureSha);
    assert(path.isAbsolute(fixturePath) && realpathSync(fixturePath) === fixturePath);
    const csvBytes = readFileSync(fixturePath); assert.equal(createHash('sha256').update(csvBytes).digest('hex'), fixtureSha);
    const csvRows = JSON.parse(csvBytes.toString('utf8')) as Row[];
    assert.equal(csvRows.length, 2); assert(csvRows.some(row => row.product_info.bookId === 'book-mvp-simple-adventure'));
    assert(csvRows.some(row => row.product_info.bookId === BOOK));
    const { createClient } = await import('@supabase/supabase-js');
    const native = await import('../src/app/api/cron/amazon-orders/route');
    const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const discovery = () => ({ AmazonOrderId: ROOT, MarketplaceId: 'ATVPDKIKX0DER', PurchaseDate: PURCHASE,
      BuyerInfo: { BuyerName: 'Changed incoming', BuyerEmail: 'changed@example.test' },
      ShippingAddress: { Name: 'Changed incoming', AddressLine1: '99 Changed Lane', City: 'Changed City', StateOrRegion: 'CA', PostalCode: '90002', CountryCode: 'US' },
      OrderItems: [{ CustomizedInfo: { "Child's Name": 'Changed incoming', "Child's Age": '8' } }] });
    const recover = async (webhook = 'https://replacement-w0.example.test/intake') => {
      discoveryOrders = [discovery()]; providerCalls = []; unexpected = []; writes = []; dispatches = []; mutationAttempts = []; orderReads = 0; configReads = 0; zipReads = 0;
      const before = clone(records);
      const result = await native.processAmazonOrders(db, { executionId: 'synthetic-native-recovery', testMode: false,
        supabaseUrl: process.env.SUPABASE_URL!, supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!, n8nW0WebhookUrl: webhook,
        amazonClientId: 'SYNTHETIC-CLIENT', amazonClientSecret: 'SYNTHETIC-SECRET', amazonRefreshToken: 'SYNTHETIC-REFRESH',
        amazonMarketplaceId: 'ATVPDKIKX0DER', amazonRegion: 'na', amazonSandboxMode: false });
      assert.deepEqual(records, before, 'Native recovery must preserve every stored row');
      assert.deepEqual(writes, [], 'Native recovery has no storage-write authority');
      assert.deepEqual(mutationAttempts, [], 'Native recovery must not attempt any database mutation');
      assert.deepEqual(providerCalls, ['token', 'orders'], 'Recovery must not fetch or normalize incoming item customization');
      assert.deepEqual(unexpected, [], 'Synthetic transport assertions must not be swallowed');
      assert(orderReads > 0, 'Recovery must inspect actual stored root membership'); assert.equal(configReads, 0); assert.equal(zipReads, 0);
      return result;
    };
    const assertRecovered = (expected: Row[]) => {
      assert.deepEqual(dispatches.map(row => row.orderId), expected.map(row => row.orderId));
      for (const captured of dispatches) {
        const row = expected.find(row => row.orderId === captured.orderId)!;
        assert.equal(captured.rootOrderId, row.root_order_id); assert.equal(captured.amazonOrderId, row.amazon_order_id);
        assert.deepEqual(captured.characterSpecs, row.character_specs); assert.deepEqual(captured.CharacterSpecs, row.character_specs);
        assert.equal(captured.characterHash, row.character_hash); assert.equal(captured.character_hash, row.character_hash);
        assert.deepEqual(captured.bookSpecs, row.book_specs); assert.deepEqual(captured.book_specs, row.book_specs);
        assert.equal(captured.bookId, row.book_specs.bookId); assert.equal(captured.formatId, 'amazon');
        assert.equal(captured.configVersion, row.book_specs.configVersion);
        assert.equal(captured.bookSpecs.totalPages, row.book_specs.bookId === BOOK ? 32 : 16);
        assert.deepEqual(captured.lineItem, row.product_info.line_item); assert.deepEqual(captured.items, row.product_info.line_items);
        assert.equal(captured.unitIndex, row.product_info._quantity_unit_index); assert.equal(captured.unitCount, row.product_info._quantity_unit_count);
        assert.deepEqual(captured.shippingAddress, row.shipping_address); assert.equal(captured.dedication, row.dedication_text ?? row.dedication ?? '');
      }
    };
    const progress = (row: Row) => Object.assign(row, { status: 'pending_processing', execution_status: 'ready_for_processing', next_workflow: '2A', workflow_step: 'order_intake' });
    await check('fresh-customized-discovery-requires-canonical-admission', async () => {
      const result = await recover(); assert.equal(result.ordersProcessed, 0); assert.equal(result.errors?.length, 1);
      assert.equal(result.errors![0].error, 'Amazon fresh intake requires verified middleware/API admission'); assert.deepEqual(dispatches, []);
    });
    await check('canonical-empty-source-placeholder-held-without-write', async () => {
      assert.equal((await invoke(payload([]))).status, 201); assert.equal(records.length, 1);
      assert.deepEqual(records[0].product_info, { _customization_missing: true, _retry_on_next_cron: true });
      const result = await recover(); assert.equal(result.ordersProcessed, 0);
      assert.equal(result.errors![0].error, 'Amazon fresh intake requires verified middleware/API admission'); assert.deepEqual(dispatches, []);
    });
    await check('canonical-pending-original-dedication-recovered', async () => {
      const single = item(); single.CustomizedInfo = { ...single.CustomizedInfo, dedication: 'For Alex, with love.' } as typeof single.CustomizedInfo;
      assert.equal((await invoke(payload([single]))).status, 201); const originals = clone(records);
      const result = await recover(); assert.equal(result.ordersProcessed, 1); assert.equal(result.errors, undefined); assertRecovered(originals);
      assert.equal(dispatches[0].dedication, 'For Alex, with love.');
    });
    await check('canonical-quantity-two-plus-one-recovered', async () => {
      assert.equal((await invoke(payload([item('line-a', 2), item('line-b', 1, 'Sam')]))).status, 201);
      const originals = clone(records); const result = await recover(); assert.equal(result.ordersProcessed, 3); assert.equal(result.errors, undefined); assertRecovered(originals);
    });
    await check('canonical-mixed-progressed-pending-only-pending', async () => {
      assert.equal((await invoke(payload([item('line-a'), item('line-b', 1, 'Sam')]))).status, 201); progress(records[0]);
      const pending = clone([records[1]]); const result = await recover(); assert.equal(result.ordersProcessed, 1); assert.equal(result.errors, undefined); assertRecovered(pending);
    });
    await check('canonical-all-progressed-unchanged', async () => {
      assert.equal((await invoke(payload([item('line-a'), item('line-b', 1, 'Sam')]))).status, 201); records.forEach(progress);
      const result = await recover(); assert.equal(result.ordersProcessed, 0); assert.equal(result.errors, undefined); assert.deepEqual(dispatches, []);
    });
    for (const [label, corrupt] of [
      ['hash', (row: Row) => { row.character_hash = 'corrupt-progressed-hash'; }],
      ['spec-alias', (row: Row) => { row.CharacterSpecs = { ...row.character_specs, childName: 'Corrupt progressed alias' }; }],
    ] as const) await check('canonical-corrupt-progressed-' + label + '-holds-pending-sibling', async () => {
      assert.equal((await invoke(payload([item('line-a'), item('line-b', 1, 'Sam')]))).status, 201); progress(records[0]); corrupt(records[0]);
      const result = await recover(); assert.equal(result.ordersProcessed, 0); assert.equal(result.errors?.length, 1);
      assert.equal(result.errors![0].error, label === 'hash' ? 'Invalid pending W0 original order-scoped character hash' : 'Conflicting Amazon retry original character specs'); assert.deepEqual(dispatches, []);
    });
    await check('canonical-partial-insert-held-before-any-dispatch', async () => {
      failInsert = 2; assert.equal((await invoke(payload([item('line-a', 2)]))).status, 409); assert.equal(records.length, 1);
      const result = await recover(); assert.equal(result.ordersProcessed, 0); assert.equal(result.errors?.length, 1); assert.equal(result.errors![0].error, 'Incomplete Amazon root unit partition'); assert.deepEqual(dispatches, []);
    });
    await check('actual-csv-mixed-root-original-context-recovered', async () => {
      records = clone(csvRows); const result = await recover(); assert.equal(result.ordersProcessed, 2); assert.equal(result.errors, undefined); assertRecovered(csvRows);
    });
    await check('actual-csv-corrupt-progressed-legacy-holds-IV', async () => {
      records = clone(csvRows); const legacy = records.find(row => row.product_info.bookId !== BOOK)!; progress(legacy); legacy.character_hash = 'corrupt-legacy-original';
      const result = await recover(); assert.equal(result.ordersProcessed, 0); assert.equal(result.errors?.length, 1); assert.equal(result.errors![0].error, 'Invalid mixed pending W0 original hash'); assert.deepEqual(dispatches, []);
    });
    await check('actual-csv-progressed-IV-preserved-legacy-recovered', async () => {
      records = clone(csvRows); progress(records.find(row => row.product_info.bookId === BOOK)!);
      const legacy = clone(records.filter(row => row.product_info.bookId !== BOOK)); const result = await recover(); assert.equal(result.ordersProcessed, 1); assert.equal(result.errors, undefined); assertRecovered(legacy);
    });
    await check('missing-explicit-W0-zero-dispatch', async () => {
      assert.equal((await invoke(payload())).status, 201); const result = await recover('');
      assert.equal(result.ordersProcessed, 0); assert.equal(result.errors![0].error, 'W0 webhook is not configured'); assert.deepEqual(dispatches, []);
    });
    await check('W0-unavailable-preserves-pending-source', async () => {
      assert.equal((await invoke(payload())).status, 201); webhookFailure = true; const result = await recover();
      assert.equal(result.ordersProcessed, 0); assert.equal(result.errors![0].error, 'W0 retry failed: 503'); assert.equal(dispatches.length, 1);
    });
    for (const authorization of [undefined, 'Bearer WRONG-SYNTHETIC']) await check('direct-GET-auth-' + (authorization ? 'wrong' : 'missing'), async () => {
      const before = clone(records); calls = 0; providerCalls = []; writes = []; dispatches = [];
      const response = await native.GET(new NextRequest('https://admin.example.test/api/cron/amazon-orders', { headers: authorization ? { authorization } : {} }));
      assert.equal(response.status, 401); assert.equal(calls, 0); assert.deepEqual(records, before); assert.deepEqual(writes, []); assert.deepEqual(dispatches, []);
    });
    for (const shape of ['array', 'object'] as const) await check('unclassified-stored-' + shape + '-requires-assignment', async () => {
      const original = payload(); assert.equal((await invoke(original)).status, 201);
      for (const key of ['book_specs', 'bookSpecs', 'bookId', 'book_id', 'project', 'formatId', 'format_id',
        'configVersion', 'config_version', 'version', 'print_book_id', 'printBookId', 'print_format_id', 'printFormatId',
        'print_config_version', 'printConfigVersion', 'productInfo']) delete records[0][key];
      records[0].product_info = shape === 'array' ? clone(original._raw.items) : { line_items: clone(original._raw.items) };
      const result = await recover(); assert.equal(result.ordersProcessed, 0); assert.equal(result.errors?.length, 1);
      assert.equal(result.errors![0].error, 'Unclassified Amazon intake requires authenticated operator assignment'); assert.deepEqual(dispatches, []);
    });
    assert.equal(names.length, 18); assert.equal(new Set(names).size, 18);
    return names;
  } finally {
    globalThis.fetch = savedFetch;
    for (const key of environment) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
}
void main().then(names => console.log(JSON.stringify({ status: 'passed', scope: 'Offline actual API and retained exact CSV producer rows into native cron recovery; no live services', cases: names.length, names }))).catch(error => { console.error(error); process.exitCode = 1; });
