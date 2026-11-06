/** Offline regression: complete canonical handlers, real Next HTTP objects, no business transport. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';

type Log = { level: string; args: unknown[] };
type Exports = {
  GET?: (request: NextRequest) => Promise<Response>;
  authorizeBackendBoundary?: (request: Request) => Promise<Response | null>;
};
const captured = 'SYNTHETIC-CAPTURED-ONLY-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const replacement = 'SYNTHETIC-REPLACEMENT-ONLY-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const supplied = 'SYNTHETIC-SUPPLIED-ONLY-cccccccccccccccccccccccccccccccccccccccc';
const message = '[Cron Amazon Orders] Unauthorized - missing or invalid CRON_SECRET';
const sourceRoot = path.resolve(__dirname, '../src');
let cases = 0;

function load(relative: string, secret: string | undefined) {
  const source = readFileSync(path.join(sourceRoot, relative), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const env: Record<string, string | undefined> = { NODE_ENV: 'test' };
  if (secret !== undefined) env.CRON_SECRET = secret;
  const exports: Exports = {}, logs: Log[] = [];
  let businessCalls = 0, transportCalls = 0;
  const forbidden = () => { businessCalls++; throw Error('Business dependency must not execute'); };
  const businessImports: Record<string, Record<string, unknown>> = {
    '@supabase/supabase-js': { createClient: forbidden },
    '@/lib/character-hash': { calculateCharacterHash: forbidden },
    'node:util': { isDeepStrictEqual: forbidden },
    '@/lib/csv-book-selection': { readCsvRootRows: forbidden, csvRowDeclaresInnerVoice: forbidden, csvRowHasProgress: forbidden },
    '@/lib/w0-payload': { buildPendingW0Payload: forbidden },
    '@/lib/supabase-client': { upsertOrderByPerBookId: forbidden },
    './printer-file-grants': { authorizePrinterFileRequest: forbidden },
    './admin-auth': { requireAdminAuth: forbidden },
    './preview-file-grants': { verifyPreviewImageGrant: forbidden },
    './order-paths': { isOrderAssetKey: forbidden },
    './admin-login-target': { ADMIN_LOGIN_PATH: '/__access_setup', ADMIN_SIGN_IN_HEADER: 'x-lhl-admin-sign-in',
      adminReturnPath: forbidden, adminLoginHref: forbidden, canonicalAdminOrigin: forbidden },
  };
  vm.runInNewContext(compiled.outputText, {
    exports, process: { env }, Request, Response, Headers, URL,
    require: (name: string) => {
      if (name === 'next/server') return { NextRequest, NextResponse };
      assert(Object.hasOwn(businessImports, name), 'Unapproved import: ' + name);
      return businessImports[name];
    },
    fetch: () => { transportCalls++; throw Error('Network forbidden'); },
    console: Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map(level =>
      [level, (...args: unknown[]) => { logs.push({ level, args }); }])),
  }, { timeout: 1000, filename: relative });
  return { exports, env, logs, assertNoEffects: () => {
    assert.equal(businessCalls, 0); assert.equal(transportCalls, 0);
  } };
}

function request(authorization?: string, query = '') {
  return new NextRequest('https://offline.example.test/api/cron/amazon-orders' + query, {
    headers: authorization === undefined ? {} : { Authorization: authorization },
  });
}
function assertPrivateLogs(logs: Log[]) {
  const serialized = JSON.stringify(logs);
  for (const marker of ['SYNTHETIC-', 'CAPTURED-ONLY', 'SUPPLIED-ONLY', 'REPLACEMENT-ONLY']) {
    assert(!serialized.includes(marker), 'Authorization diagnostics must not disclose token material');
  }
}
async function denied(header?: string, query = '') {
  const route = load('app/api/cron/amazon-orders/route.ts', captured);
  assert(route.exports.GET);
  const response = await route.exports.GET(request(header, query));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Unauthorized' });
  assert.deepEqual(route.logs, [{ level: 'error', args: [message] }], 'Rejected auth emits only its fixed diagnostic');
  assertPrivateLogs(route.logs); route.assertNoEffects(); cases++;
}

async function main() {
  if (process.argv.includes('--middleware-backend-only')) {
    const names = await testMiddlewareBackendSubmission();
    console.log(JSON.stringify({ status: 'passed', scope: 'offline middleware handoff and source-preserving normalization only', cases: names.length, names }));
    return;
  }
  for (const header of [undefined, '', 'Bearer ' + supplied, 'bearer ' + captured,
    'Basic ' + supplied, 'Bearer ' + captured + ', Bearer ' + supplied, 'Bearer ' + 'x'.repeat(4096)]) {
    await denied(header);
  }
  await denied('Bearer ' + supplied, '?test=true');
  // Exercise the real central-boundary/handler seam without changing either auth contract.
  {
    const boundary = load('lib/access-boundary.ts', captured);
    assert(boundary.exports.authorizeBackendBoundary);
    assert.equal(await boundary.exports.authorizeBackendBoundary(request('bearer ' + captured)), null);
    boundary.assertNoEffects(); assert.deepEqual(boundary.logs, []);
    await denied('bearer ' + captured); cases++;
  }
  // The module-captured key still wins after a runtime key change. Never log either value.
  {
    const route = load('app/api/cron/amazon-orders/route.ts', captured);
    route.env.CRON_SECRET = replacement; assert(route.exports.GET);
    const response = await route.exports.GET(request('Bearer ' + replacement));
    assert.equal(response.status, 401);
    assert.deepEqual(route.logs, [{ level: 'error', args: [message] }]);
    assertPrivateLogs(route.logs); route.assertNoEffects(); cases++;
    const capturedResponse = await route.exports.GET(request('Bearer ' + captured));
    assert.equal(capturedResponse.status, 500);
    assert.deepEqual(await capturedResponse.json(), { error: 'Supabase credentials not configured' });
    assertPrivateLogs(route.logs); route.assertNoEffects(); cases++;
  }
  // Legitimate auth progresses only to the existing missing-database gate, never a job.
  for (const runtimeFallback of [false, true]) {
    const route = load('app/api/cron/amazon-orders/route.ts', runtimeFallback ? undefined : captured);
    if (runtimeFallback) route.env.CRON_SECRET = replacement;
    assert(route.exports.GET);
    const response = await route.exports.GET(request('Bearer ' + (runtimeFallback ? replacement : captured)));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Supabase credentials not configured' });
    assertPrivateLogs(route.logs); route.assertNoEffects(); cases++;
  }
  for (const missing of [undefined, '']) {
    const route = load('app/api/cron/amazon-orders/route.ts', missing); assert(route.exports.GET);
    const response = await route.exports.GET(request('Bearer ' + supplied));
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, 'Server configuration error');
    assertPrivateLogs(route.logs); route.assertNoEffects(); cases++;
  }
  console.log(JSON.stringify({ cases, externalRequests: 0, businessDependencyCalls: 0, credentialFilesRead: 0,
    actualFullRouteCompiled: true, actualFullBoundaryCompiled: true, realNextHttpObjects: true,
    coverage: 'Offline auth rejection/logging and configuration gates; no business processing or deployed Worker test' }));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });

async function testMiddlewareBackendSubmission(): Promise<string[]> {
  const sourceIndex = process.argv.indexOf('--middleware-source');
  const hashIndex = process.argv.indexOf('--middleware-source-sha');
  assert(sourceIndex > 0 && hashIndex > 0, 'Exact middleware source and SHA required');
  const sourceFile = process.argv[sourceIndex + 1], expected = process.argv[hashIndex + 1];
  assert(sourceFile && /^[a-f0-9]{64}$/.test(expected));
  const source = readFileSync(sourceFile, 'utf8');
  const { createHash } = await import('node:crypto');
  assert.equal(createHash('sha256').update(source).digest('hex'), expected);
  const compiled = ts.transpileModule(source + '\nexport { postOrderToBackend, normalizeOrderPayload, normalizationForCaller, readCompleteOrderItemResponse };\n', {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const token = 'SYNTHETIC-MIDDLEWARE-TOKEN-aaaaaaaaaaaaaaaa';
  const privateBody = 'SYNTHETIC-BACKEND-PRIVATE-bbbbbbbbbbbbbbbb';
  const names: string[] = [];
  type Call = { destination: string; init: Record<string, any> };
  function loadBackend(base: string | undefined, key: string | undefined,
    responder: (call: Call) => Promise<unknown> = async () => ({ ok: true, status: 200,
      json: async () => ({ success: true, privateBody, token }), text: async () => { throw Error('Response body must not be read'); } })) {
    const env: Record<string, string | undefined> = { NODE_ENV: 'test',
      AMZ_LWA_CLIENT_ID_PROD: 'SYNTHETIC-LWA-ID', AMZ_LWA_CLIENT_SECRET_PROD: 'SYNTHETIC-LWA-SECRET',
      AMZ_LWA_REFRESH_TOKEN_PROD: 'SYNTHETIC-LWA-REFRESH' };
    if (base !== undefined) env.BACKEND_API_URL = base;
    if (key !== undefined) env.BACKEND_API_TOKEN = key;
    const calls: Call[] = [], logs: Log[] = [];
    let dotenvCalls = 0, listenCalls = 0;
    const postHandlers = new Map<string, (request: any, response: any) => Promise<void>>();
    const app = { use: () => app, get: () => app,
      post: (route: string, handler: (request: any, response: any) => Promise<void>) => { postHandlers.set(route, handler); return app; },
      listen: () => { listenCalls++; } };
    const express = Object.assign(() => app, { json: () => () => undefined });
    const exports: { postOrderToBackend?: (order: unknown) => Promise<unknown>; normalizeOrderPayload?: (...args: any[]) => unknown; normalizationForCaller?: (order: unknown) => unknown; readCompleteOrderItemResponse?: (response: unknown, orderId: string) => any } = {};
    const businessFetch = async (destination: unknown, init: Record<string, any>) => {
      const call = { destination: String(destination), init }; calls.push(call); return responder(call);
    };
    vm.runInNewContext(compiled.outputText, {
      exports, process: { env }, URL, URLSearchParams,
      require: (name: string) => {
        if (name === 'express') return express;
        if (name === 'dotenv') return { config: () => { dotenvCalls++; return { parsed: {} }; } };
        if (name === 'node-fetch') return businessFetch;
        throw Error('Unapproved middleware import: ' + name);
      },
      console: Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map(level =>
        [level, (...args: unknown[]) => { logs.push({ level, args }); }])),
    }, { timeout: 1000, filename: sourceFile });
    assert.equal(dotenvCalls, 1); assert.equal(listenCalls, 1);
    assert.equal(calls.length, 0); assert.deepEqual(logs, []);
    assert(exports.postOrderToBackend);
    assert(exports.normalizeOrderPayload && exports.normalizationForCaller && exports.readCompleteOrderItemResponse);
    return { submit: exports.postOrderToBackend, normalize: exports.normalizeOrderPayload, forCaller: exports.normalizationForCaller, readItems: exports.readCompleteOrderItemResponse!, processOrder: postHandlers.get('/orders/:orderId/process')!, calls, logs, env };
  }
  async function accepted(name: string, base: string | undefined, key = token, status = 200) {
    const loaded = loadBackend(base, key, async () => ({ ok: true, status,
      json: async () => ({ success: true, privateBody, token }), text: async () => { throw Error('Forbidden response text'); } }));
    const order = { amazonOrderId: '111-2222222-3333333', items: [{ orderItemId: 'line-a' }] };
    const before = JSON.stringify(order);
    assert.deepEqual(JSON.parse(JSON.stringify(await loaded.submit(order))), { success: true });
    assert.equal(JSON.stringify(order), before); assert.equal(loaded.calls.length, 1);
    const call = loaded.calls[0];
    assert.equal(call.destination, (base === undefined || base === '' ? 'http://localhost:3000' : new URL(base).origin) + '/api/amazon/orders');
    assert.equal(call.init.method, 'POST'); assert.equal(call.init.redirect, 'error');
    assert.equal(call.init.headers.Authorization, 'Bearer ' + key.trim());
    assert.equal(call.init.headers['Content-Type'], 'application/json'); assert.equal(call.init.body, before);
    assert.deepEqual(loaded.logs, []); names.push(name);
  }
  async function refused(name: string, base: string | undefined, key: string | undefined,
    expectedCalls: number, responder?: (call: Call) => Promise<unknown>) {
    const loaded = loadBackend(base, key, responder);
    await assert.rejects(loaded.submit({ amazonOrderId: '111-2222222-3333333' }), error => {
      assert.equal((error as Error).message, 'Backend submission failed'); return true;
    });
    assert.equal(loaded.calls.length, expectedCalls);
    if (expectedCalls) assert.equal(loaded.calls[0].init.redirect, 'error');
    assert.deepEqual(loaded.logs, [{ level: 'error', args: ['[Amazon Middleware] Backend submission failed'] }]);
    const printed = JSON.stringify(loaded.logs);
    assert(!printed.includes(token) && !printed.includes(privateBody)); names.push(name);
  }
  await accepted('https-trimmed-token', 'https://admin.littleherolabs.com/', '  ' + token + '  ');
  await accepted('https-created', 'https://admin.littleherolabs.com', token, 201);
  await accepted('documented-local-default', undefined);
  await accepted('documented-local-explicit', 'http://localhost:3000/');
  for (const [i, key] of [undefined, '', '   ', '\r\n', token + '\r\n' + token].entries()) {
    await refused('invalid-token-' + i, 'https://admin.littleherolabs.com', key, 0);
  }
  for (const [i, base] of ['https://foreign.example.test', 'https://admin.littleherolabs.com.foreign.example.test',
    'http://admin.littleherolabs.com', 'https://admin.littleherolabs.com:444', 'http://localhost:3001',
    'https://localhost:3000', 'http://127.0.0.1:3000', 'https://admin.littleherolabs.com/api/amazon/orders',
    'https://admin.littleherolabs.com/?x=1', 'https://admin.littleherolabs.com/#x',
    'https://name:password@admin.littleherolabs.com', '//admin.littleherolabs.com', 'not a URL',
    ' https://admin.littleherolabs.com', 'https://admin.littleherolabs.com '].entries()) {
    await refused('invalid-destination-' + i, base, token, 0);
  }
  for (const status of [301, 302, 307, 308, 400, 401, 409, 500]) {
    await refused('http-refusal-' + status, 'https://admin.littleherolabs.com', token, 1,
      async () => ({ ok: status < 400, status,
        json: async () => { throw Error(privateBody); }, text: async () => { throw Error(privateBody); } }));
  }
  for (const [i, body] of [null, {}, { success: false }, { success: 'true' }, [], 'ok'].entries()) {
    await refused('invalid-acknowledgement-' + i, 'https://admin.littleherolabs.com', token, 1,
      async () => ({ ok: true, status: 200, json: async () => body }));
  }
  await refused('network-error-redacted', 'https://admin.littleherolabs.com', token, 1,
    async () => { throw Error(token + privateBody); });
  await refused('invalid-json-redacted', 'https://admin.littleherolabs.com', token, 1,
    async () => ({ ok: true, status: 200, json: async () => { throw Error(token + privateBody); } }));
  const rotated = loadBackend('https://admin.littleherolabs.com', token);
  await rotated.submit({}); rotated.env.BACKEND_API_TOKEN = ' ' + replacement + ' '; await rotated.submit({});
  assert.equal(rotated.calls[0].init.headers.Authorization, 'Bearer ' + token);
  assert.equal(rotated.calls[1].init.headers.Authorization, 'Bearer ' + replacement);
  assert.deepEqual(rotated.logs, []); names.push('current-token-after-rotation');
  const normalization = loadBackend('https://admin.littleherolabs.com', token);
  const order = { AmazonOrderId: '111-2222222-3333333', PurchaseDate: '2026-11-04T00:00:00Z', MarketplaceId: 'ATVPDKIKX0DER' };
  const itemA = { OrderItemId: 'line-a', ASIN: 'B0G4QPLWKH', SellerSKU: 'KE-3QPF-VN03', QuantityOrdered: 2,
    CustomizedInfo: { childName: 'Alex', age: '7' } };
  const itemB = { ...itemA, OrderItemId: 'line-b', QuantityOrdered: 1, CustomizedInfo: { childName: 'Sam', age: '9' } };
  const buyerRows = { source: 'opaque original item buyer payload' };
  const original = JSON.stringify([order, itemA, itemB, buyerRows]);
  const originalItems = [itemA, itemB];
  const multiple = normalization.normalize(order, originalItems, null, null, buyerRows) as any;
  assert.equal(JSON.stringify([order, itemA, itemB, buyerRows]), original);
  assert.equal(multiple.items[0].customization.childName, 'Alex');
  assert.equal(multiple.items[1].customization.childName, 'Sam');
  assert.equal(multiple.lineItems.length, 2); assert.equal(multiple.lineItems[1].orderItemId, 'line-b');
  assert.equal(multiple.lineItems[1].customizationFields.find((field: any) => field.name === 'childName').text, 'Sam');
  assert.equal(Object.hasOwn(multiple, 'customization'), false); names.push('distinct-source-customization-no-root-merge');
  assert.equal(multiple.orderDetails.quantity, 3); assert.equal(multiple.items[0].quantity, 2);
  assert.equal(multiple.items[1].asin, itemB.ASIN); assert.equal(multiple.items[1].sku, itemB.SellerSKU);
  assert.equal(multiple.lineItems[1].quantity, 1); names.push('source-identity-and-quantity-preserved');
  assert.equal(multiple._raw.items, originalItems);
  assert.equal(multiple._raw.order, order); assert.equal(multiple._raw.items[0], itemA);
  assert.equal(multiple._raw.itemsBuyerInfo, buyerRows); names.push('original-items-and-buyer-payload-preserved');
  for (const key of ['bookSpecs', 'book_specs', 'bookId', 'formatId', 'configVersion', 'characterSpecs', 'character_specs',
    'CharacterSpecs', 'characterHash', 'character_hash', 'dedication', 'Dedication']) assert.equal(Object.hasOwn(multiple, key), false, key);
  names.push('no-book-selection-or-root-character-defaults');
  const single = normalization.normalize(order, [itemA]) as any;
  assert.equal(single.customization, itemA.CustomizedInfo); assert.equal(single.lineItems.length, 1);
  assert.equal(single.orderDetails.quantity, 2); names.push('single-source-root-customization-compatibility');
  const empty = normalization.normalize(order, []) as any;
  assert.equal(empty.items.length, 0); assert.equal(empty.lineItems.length, 0);
  assert.equal(Object.hasOwn(empty, 'customization'), false); assert.equal(Object.hasOwn(empty.orderDetails, 'quantity'), false);
  names.push('absent-items-remain-unclassified');
  const missing = normalization.normalize(order, [{ OrderItemId: 'missing', ASIN: itemA.ASIN, QuantityOrdered: 1 }]) as any;
  assert.equal(Object.keys(missing.items[0].customization).length, 0);
  assert.equal(Object.hasOwn(missing, 'characterSpecs'), false); names.push('missing-customization-no-hero');
  const undated = normalization.normalize({ AmazonOrderId: order.AmazonOrderId }, [itemA]) as any;
  assert.equal(undated.marketplaceId, undefined); assert.equal(undated.purchaseDate, undefined);
  assert.equal(undated.orderDate, undefined); names.push('no-marketplace-or-purchase-invention');
  for (const [index, quantity] of ['2', 0, -1, 201, 1.5, undefined].entries()) {
    const invalid = normalization.normalize(order, [{ ...itemA, QuantityOrdered: quantity }]) as any;
    assert.equal(invalid.items[0].quantity, quantity); assert.equal(Object.hasOwn(invalid.orderDetails, 'quantity'), false);
    names.push('invalid-quantity-retained-for-backend-refusal-' + index);
  }
  const unrecognized = normalization.normalize(order, [{ ...itemA, ASIN: 'UNKNOWN', SellerSKU: 'UNKNOWN', Title: 'Adventure Compass' }]) as any;
  assert.equal(unrecognized.items[0].asin, 'UNKNOWN'); assert.equal(unrecognized.items[0].sku, 'UNKNOWN');
  assert.equal(Object.hasOwn(unrecognized, 'bookSpecs'), false); names.push('unknown-listing-never-selects-a-book');
  for (const [index, input] of [null, [], 'not-an-order'].entries()) {
    assert.throws(() => normalization.normalize(input, []), /Invalid Amazon normalization source/);
    names.push('invalid-root-normalization-source-' + index);
  }
  assert.throws(() => normalization.normalize(order, [null]), /Invalid Amazon source item/);
  names.push('invalid-source-item-refused');
  assert.throws(() => normalization.normalize(order, [{ ...itemA, CustomizedInfo: 'not-an-object' }]), /Invalid Amazon source customization/);
  names.push('invalid-source-customization-refused');
  assert.throws(() => normalization.normalize(order, new Array(1)), /Invalid Amazon source item/);
  names.push('sparse-source-item-refused');
  const caller = normalization.forCaller(multiple) as any;
  assert.equal(Object.hasOwn(caller._raw, 'itemsBuyerInfo'), false);
  assert.equal(multiple._raw.itemsBuyerInfo, buyerRows);
  assert.equal(caller._raw.items, originalItems); assert.equal(caller._raw.order, order);
  assert.equal(caller.items, multiple.items);
  assert.equal(JSON.stringify(caller).includes('opaque original item buyer payload'), false);
  names.push('new-item-buyer-envelope-backend-only');
  const itemResponse = { payload: { AmazonOrderId: order.AmazonOrderId, OrderItems: originalItems } };
  const buyerResponse = { payload: { AmazonOrderId: order.AmazonOrderId, OrderItems: [
    { OrderItemId: 'line-b', BuyerCustomizedInfo: { CustomizedURL: 'https://offline.example.test/b.zip' } },
  ] } };
  const responses = { requestedOrderId: order.AmazonOrderId, items: itemResponse, buyerInfo: buyerResponse };
  assert.equal(normalization.readItems(itemResponse, order.AmazonOrderId), itemResponse.payload);
  assert.equal(normalization.readItems(buyerResponse, order.AmazonOrderId), buyerResponse.payload);
  names.push('both-official-item-response-list-shapes');
  const withResponses = normalization.normalize(order, originalItems, null, null, buyerResponse.payload, responses) as any;
  assert.equal(withResponses._raw.itemResponses, responses);
  assert.equal(withResponses._raw.itemResponses.items.payload.OrderItems, originalItems);
  assert.equal(Object.hasOwn((normalization.forCaller(withResponses) as any)._raw, 'itemResponses'), false);
  assert.equal(withResponses._raw.itemResponses, responses); names.push('complete-item-responses-backend-only-nonmutating');
  for (const [index, response] of [null, {}, { payload: null }, { errors: [{ code: 'FAILURE' }], ...itemResponse },
    { errors: null, ...itemResponse }, { payload: { ...itemResponse.payload, AmazonOrderId: 'foreign-root' } },
    { payload: { ...itemResponse.payload, OrderItems: null } },
    { payload: { ...itemResponse.payload, OrderItems: new Array(1) } },
    { payload: { AmazonOrderId: order.AmazonOrderId, OrderItemsBuyerInfo: [] } },
    ...['next-page', ' ', null, 1].map(NextToken => ({ payload: { ...itemResponse.payload, NextToken } })),
  ].entries()) {
    assert.throws(() => normalization.readItems(response, order.AmazonOrderId), /Incomplete Amazon item response/);
    names.push('incomplete-official-items-response-refused-' + index);
  }
  assert.equal(normalization.readItems({ payload: { AmazonOrderId: order.AmazonOrderId, OrderItems: [], NextToken: '' }, errors: [] }, order.AmazonOrderId).OrderItems.length, 0);
  names.push('verified-empty-item-response-distinct-from-failure');
  async function processCase(name: string, replacePath: string | undefined, replacementBody: unknown,
    transportFailure = false, empty = false) {
    let backendBody: any;
    const loaded = loadBackend('https://admin.littleherolabs.com', token, async call => {
      const url = new URL(call.destination);
      if (url.origin === 'https://api.amazon.com') {
        assert.equal(url.pathname, '/auth/o2/token');
        return { ok: true, json: async () => ({ access_token: 'SYNTHETIC-AMAZON-ACCESS', expires_in: 3600 }) };
      }
      if (url.origin === 'https://admin.littleherolabs.com') {
        assert.equal(url.pathname, '/api/amazon/orders'); backendBody = JSON.parse(call.init.body);
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
      assert.equal(url.origin, 'https://sellingpartnerapi-na.amazon.com');
      const suffix = url.pathname.slice(('/orders/v0/orders/' + order.AmazonOrderId).length);
      assert(url.pathname.startsWith('/orders/v0/orders/' + order.AmazonOrderId));
      if (suffix === replacePath) {
        if (transportFailure) throw Error(privateBody);
        return { ok: true, json: async () => replacementBody };
      }
      const payloads: Record<string, unknown> = {
        '': order,
        '/orderItems': { AmazonOrderId: order.AmazonOrderId, OrderItems: empty ? [] : originalItems },
        '/orderItems/buyerInfo': { AmazonOrderId: order.AmazonOrderId, OrderItems: empty ? [] : buyerResponse.payload.OrderItems },
        '/buyerInfo': { BuyerEmail: 'synthetic@example.test' },
        '/address': { Name: 'Synthetic', AddressLine1: '1 Test', City: 'Test', StateOrRegion: 'CA', PostalCode: '90001', CountryCode: 'US' },
      };
      assert(Object.hasOwn(payloads, suffix), 'Unapproved synthetic process request');
      return { ok: true, json: async () => ({ payload: payloads[suffix] }) };
    });
    assert(loaded.processOrder);
    let status = 200, body: any;
    const response = { status: (code: number) => { status = code; return response; }, json: (value: unknown) => { body = value; return response; } };
    await loaded.processOrder({ params: { orderId: order.AmazonOrderId }, query: { useSandbox: 'false' } }, response);
    const backendCalls = loaded.calls.filter(call => new URL(call.destination).origin === 'https://admin.littleherolabs.com');
    if (replacePath !== undefined) {
      assert.equal(status, 500); assert.equal(body.success, false); assert.equal(body.error, 'Order processing failed');
      assert.equal(JSON.stringify(body).includes(privateBody), false); assert.equal(backendCalls.length, 0);
      assert.equal(backendBody, undefined);
    } else {
      assert.equal(status, 200); assert.equal(body.success, true); assert.equal(backendCalls.length, 1);
      assert.equal(backendBody._raw.itemResponses.requestedOrderId, order.AmazonOrderId);
      assert.deepEqual(backendBody._raw.itemResponses.items.payload.OrderItems, empty ? [] : originalItems);
      assert.deepEqual(backendBody._raw.itemResponses.buyerInfo.payload.OrderItems, empty ? [] : buyerResponse.payload.OrderItems);
      assert.equal(Object.hasOwn(body.normalized._raw, 'itemResponses'), false);
      assert.equal(Object.hasOwn(body.normalized._raw, 'itemsBuyerInfo'), false);
    }
    names.push(name);
  }
  for (const suffix of ['/orderItems', '/orderItems/buyerInfo']) {
    await processCase('actual-process-transport-refusal-' + suffix, suffix, undefined, true);
    await processCase('actual-process-pagination-refusal-' + suffix, suffix,
      { payload: { AmazonOrderId: order.AmazonOrderId, OrderItems: [], NextToken: 'next-page' } });
    await processCase('actual-process-malformed-refusal-' + suffix, suffix, { payload: { AmazonOrderId: order.AmazonOrderId } });
    await processCase('actual-process-foreign-root-refusal-' + suffix, suffix, { payload: { AmazonOrderId: 'foreign', OrderItems: [] } });
    await processCase('actual-process-error-envelope-refusal-' + suffix, suffix,
      { errors: [{ message: privateBody }], payload: { AmazonOrderId: order.AmazonOrderId, OrderItems: [] } });
  }
  await processCase('actual-process-complete-provenance-to-backend', undefined, undefined);
  await processCase('actual-process-verified-empty-to-backend', undefined, undefined, false, true);
  assert.equal(normalization.calls.length, 0); assert.deepEqual(normalization.logs, []);
  assert.equal(new Set(names).size, names.length);
  return names;
}
