import assert from 'node:assert/strict';
import configFile from '../src/lib/books/configs/book-finding-our-inner-voice/v2.json';
import productEvidence from '../../docs/repo-workflows-planning/gelato-product-shipping-evidence-2026-10-11.json';
import { GelatoPrintConfigSchema } from '../src/lib/books/types';
import {
  buildGelatoDraftOrderRequest,
  buildGelatoQuoteRequest,
  gelatoQuoteRequestFingerprint,
  validateGelatoQuote,
  type GelatoPrintItem,
  type GelatoQuoteResponse,
} from '../src/lib/books/gelato-api-contract';
import { claimGelatoPrintRouting } from '../src/lib/books/claim-gelato-print-routing';
import { createGelatoDraft, GelatoDraftOutcomeUnknownError, requestGelatoQuote } from '../src/lib/books/gelato-api-client';
import type { FrozenPrintRouting } from '../src/lib/books/print-routing';

const format = configFile.formats.standard;
assert.ok(format.print.provider === 'gelato');
const unverifiedConfig = GelatoPrintConfigSchema.parse({ ...format.print, apiPageCountVerified: false });
assert.equal(unverifiedConfig.apiPageCountVerified, false);
const config = GelatoPrintConfigSchema.parse({ ...format.print, apiPageCountVerified: true });
const recipient = {
  country: 'US', firstName: 'Taylor', lastName: 'Example', addressLine1: '1 Main St',
  city: 'Seattle', state: 'WA', postCode: '98101', email: 'test@example.com',
};
const items: GelatoPrintItem[] = [
  { itemReferenceId: 'lhb-item-1001', productUid: config.productUid, pageCount: 32, quantity: 1, fileUrl: 'https://files.example.test/1001.pdf' },
  { itemReferenceId: 'lhb-item-1002', productUid: config.productUid, pageCount: 32, quantity: 1, fileUrl: 'https://files.example.test/1002.pdf' },
];
const request = buildGelatoQuoteRequest({
  orderReferenceId: 'lhb-gelato-group-1001', customerReferenceId: 'customer-1', currency: 'USD', recipient, items, config,
});
assert.equal(request.allowMultipleQuotes, false);
assert.deepEqual(request.products.map((product) => product.pageCount), [32, 32]);
assert.equal(request.products[0].pageCount, config.apiPageCount);
assert.deepEqual(request.products.map((product) => product.itemReferenceId), items.map((item) => item.itemReferenceId));

const response: GelatoQuoteResponse = {
  orderReferenceId: request.orderReferenceId,
  quotes: [{
    id: 'quote-1',
    itemReferenceIds: items.map((item) => item.itemReferenceId),
    shipmentMethods: [{ shipmentMethodUid: 'usps_ground_advantage', type: 'normal' }],
    products: items.map((item) => ({
      itemReferenceId: item.itemReferenceId, productUid: item.productUid, quantity: item.quantity, pageCount: item.pageCount,
    })),
  }],
};
const selected = validateGelatoQuote({
  response, request, config, shippingTier: 'standard', quotedAt: '2026-10-11T12:00:00.000Z', now: new Date('2026-10-11T12:14:59.999Z'),
});
assert.deepEqual(selected, { quoteId: 'quote-1', shipmentMethodUid: 'usps_ground_advantage', shipmentPolicyVersion: config.shipmentMethodPolicy.version, quotedAt: '2026-10-11T12:00:00.000Z', requestFingerprint: gelatoQuoteRequestFingerprint(request, config.shipmentMethodPolicy, 'standard', 'usps_ground_advantage'), shippingTier: 'standard' });

const draft = buildGelatoDraftOrderRequest({
  orderReferenceId: request.orderReferenceId, customerReferenceId: 'customer-1', currency: 'USD', recipient, items, config,
  selectedQuote: selected, now: new Date('2026-10-11T12:14:59.999Z'),
});
assert.equal(draft.orderType, 'draft');
assert.equal(draft.shipmentMethodUid, selected.shipmentMethodUid);
assert.deepEqual(draft.items.map((item) => item.itemReferenceId), request.products.map((product) => product.itemReferenceId));

for (const changed of [
  { config: { ...config, shipmentMethodPolicy: { ...config.shipmentMethodPolicy, tiers: {} } } },
  { selectedQuote: { ...selected, shipmentMethodUid: 'other-method' } },
  { selectedQuote: { ...selected, shippingTier: 'priority' } },
  { orderReferenceId: 'other-order' }, { customerReferenceId: 'other-customer' }, { currency: 'CAD' },
  { recipient: { ...recipient, postCode: '10001' } },
  { items: items.map((item) => ({ ...item, quantity: 2 })) },
  { items: items.map((item) => ({ ...item, fileUrl: 'https://files.example.test/changed.pdf' })) },
]) {
  assert.throws(() => buildGelatoDraftOrderRequest({ orderReferenceId: request.orderReferenceId,
    customerReferenceId: request.customerReferenceId, currency: 'USD', recipient, items, config,
    selectedQuote: selected, now: new Date('2026-10-11T12:01:00Z'), ...changed }), /differ from the validated quote request/);
}
async function testGelatoApiClient() {
  const calls: Array<{ url: string; apiKey: string | null; body: Record<string, unknown> }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, apiKey: headers.get('X-API-KEY'), body });
    const itemsResponse = draft.items.map((item) => ({
      itemReferenceId: item.itemReferenceId, productUid: item.productUid, quantity: item.quantity, pageCount: item.pageCount,
    }));
    const responseBody = url.endsWith('/orders:quote')
      ? response
      : { id: 'gelato-draft-1', orderType: body.orderType, orderReferenceId: draft.orderReferenceId, items: itemsResponse };
    return new Response(JSON.stringify(responseBody), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  await requestGelatoQuote(request, { apiKey: 'synthetic-test-key', fetcher });
  const draftResponse = await createGelatoDraft(draft, { apiKey: 'synthetic-test-key', fetcher });
  assert.equal(draftResponse.orderType, 'draft');
  await assert.rejects(() => createGelatoDraft(draft, { apiKey: 'synthetic-test-key', fetcher: async () => new Response(JSON.stringify({
    id: 'accepted-malformed', orderReferenceId: draft.orderReferenceId, orderType: 'draft', items: [{ quantity: 'bad' }],
  }), { status: 200 }) }), (error: unknown) => error instanceof GelatoDraftOutcomeUnknownError && error.acceptedRootOrderId === 'accepted-malformed');
  assert.equal(calls[0].url, 'https://order.gelatoapis.com/v4/orders:quote');
  assert.equal(calls[1].url, 'https://order.gelatoapis.com/v4/orders');
  assert.equal(calls[0].apiKey, 'synthetic-test-key');
  assert.equal(calls[1].body.orderType, 'draft');
  assert.deepEqual(calls[1].body.items, draft.items);
  await assert.rejects(() => createGelatoDraft(draft, {
    apiKey: 'synthetic-test-key',
    fetcher: async () => new Response(JSON.stringify({ id: 'gelato-order-1', orderType: 'order', orderReferenceId: draft.orderReferenceId, items: [] }), { status: 200 }),
  }), GelatoDraftOutcomeUnknownError);
}

const testRejects = (name: string, fn: () => unknown) => {
  assert.throws(fn, /./, name);
};
testRejects('missing item URL must fail', () => buildGelatoQuoteRequest({
  orderReferenceId: 'order', customerReferenceId: 'customer', currency: 'USD', recipient,
  items: [{ ...items[0], fileUrl: 'http://files.example.test/book.pdf' }], config,
}));
testRejects('unverified product page count must fail closed', () => buildGelatoQuoteRequest({
  orderReferenceId: 'order', customerReferenceId: 'customer', currency: 'USD', recipient, items: [items[0]], config: unverifiedConfig,
}));
testRejects('unverified destination country must fail closed', () => buildGelatoQuoteRequest({
  orderReferenceId: 'order', customerReferenceId: 'customer', currency: 'USD', recipient: { ...recipient, country: 'CA' }, items: [items[0]], config,
}));
testRejects('missing configured shipment UID must fail closed', () => validateGelatoQuote({
  response: { ...response, quotes: [{ ...response.quotes[0], shipmentMethods: [{ shipmentMethodUid: 'another-normal-method', type: 'normal' }] }] },
  request, config, shippingTier: 'standard', quotedAt: '2026-10-11T12:00:00Z', now: new Date('2026-10-11T12:01:00Z'),
}));
testRejects('wrong frozen page count must fail', () => buildGelatoQuoteRequest({
  orderReferenceId: 'order', customerReferenceId: 'customer', currency: 'USD', recipient,
  items: [{ ...items[0], pageCount: 35 }], config,
}));
testRejects('multiple quote response must fail', () => validateGelatoQuote({
  response: { ...response, quotes: [...response.quotes, ...response.quotes] }, request, config, shippingTier: 'standard', quotedAt: '2026-10-11T12:00:00Z', now: new Date('2026-10-11T12:01:00Z'),
}));
testRejects('changed group membership must fail', () => validateGelatoQuote({
  response: { ...response, quotes: [{ ...response.quotes[0], itemReferenceIds: ['lhb-item-1001'] }] }, request, config, shippingTier: 'standard', quotedAt: '2026-10-11T12:00:00Z', now: new Date('2026-10-11T12:01:00Z'),
}));
testRejects('wrong product count must fail', () => validateGelatoQuote({
  response: { ...response, quotes: [{ ...response.quotes[0], products: response.quotes[0].products.slice(0, 1) }] }, request, config, shippingTier: 'standard', quotedAt: '2026-10-11T12:00:00Z', now: new Date('2026-10-11T12:01:00Z'),
}));
testRejects('wrong product UID must fail', () => validateGelatoQuote({
  response: { ...response, quotes: [{ ...response.quotes[0], products: response.quotes[0].products.map((product) => ({ ...product, productUid: 'wrong' })) }] }, request, config, shippingTier: 'standard', quotedAt: '2026-10-11T12:00:00Z', now: new Date('2026-10-11T12:01:00Z'),
}));
testRejects('wrong page count must fail when Gelato returns it', () => validateGelatoQuote({
  response: { ...response, quotes: [{ ...response.quotes[0], products: response.quotes[0].products.map((product) => ({ ...product, pageCount: 35 })) }] }, request, config, shippingTier: 'standard', quotedAt: '2026-10-11T12:00:00Z', now: new Date('2026-10-11T12:01:00Z'),
}));
testRejects('stale quote must fail', () => validateGelatoQuote({
  response, request, config, shippingTier: 'standard', quotedAt: '2026-10-11T12:00:00Z', now: new Date('2026-10-11T12:16:00Z'),
}));
testRejects('unknown shipping tier must fail', () => validateGelatoQuote({
  response, request, config, shippingTier: 'unknown', quotedAt: '2026-10-11T12:00:00Z', now: new Date('2026-10-11T12:01:00Z'),
}));
testRejects('draft must use selected policy version', () => buildGelatoDraftOrderRequest({
  orderReferenceId: request.orderReferenceId, customerReferenceId: 'customer-1', currency: 'USD', recipient, items, config,
  selectedQuote: { ...selected, shipmentPolicyVersion: selected.shipmentPolicyVersion + 1 }, now: new Date('2026-10-11T12:14:59.999Z'),
}));
testRejects('draft must reject a quote older than 15 minutes', () => buildGelatoDraftOrderRequest({
  orderReferenceId: request.orderReferenceId, customerReferenceId: 'customer-1', currency: 'USD', recipient, items, config,
  selectedQuote: { ...selected, quotedAt: '2026-10-11T11:45:00.000Z' }, now: new Date('2026-10-11T12:01:00.000Z'),
}));

const ambiguousConfig = GelatoPrintConfigSchema.parse({
  ...config,
  shipmentMethodPolicy: { ...config.shipmentMethodPolicy, tiers: { standard: { kind: 'type', type: 'normal' } } },
});
testRejects('ambiguous shipment type must fail without UID priority', () => validateGelatoQuote({
  response: { ...response, quotes: [{ ...response.quotes[0], shipmentMethods: [
    { shipmentMethodUid: 'method-a', type: 'normal' }, { shipmentMethodUid: 'method-b', type: 'normal' },
  ] }] },
  request, config: ambiguousConfig, shippingTier: 'standard', quotedAt: '2026-10-11T12:00:00Z', now: new Date('2026-10-11T12:01:00Z'),
}));
testRejects('malformed shipment method must fail schema validation', () => validateGelatoQuote({
  response: { ...response, quotes: [{ ...response.quotes[0], shipmentMethods: [{ type: 'normal' }] }] },
  request, config, shippingTier: 'standard', quotedAt: '2026-10-11T12:00:00Z', now: new Date('2026-10-11T12:01:00Z'),
}));
const separateApiCountConfig = GelatoPrintConfigSchema.parse({ ...config, apiPageCount: 35 });
const separatePageRequest = buildGelatoQuoteRequest({
  orderReferenceId: 'separate-count-order', customerReferenceId: 'customer-1', currency: 'USD', recipient,
  items: [{ ...items[0], pageCount: 35 }], config: separateApiCountConfig,
});
assert.equal(separatePageRequest.products[0].pageCount, 35);
assert.equal(separateApiCountConfig.innerPageCount, 32);
assert.equal(separateApiCountConfig.expectedPdfPageCount, 35);

for (const observed of productEvidence.quotes.filter((quote) => quote.status === 200 && quote.requestPageCount === 32)) {
  const observedItems: GelatoPrintItem[] = Array.from({ length: observed.itemCount }, (_, index) => ({
    itemReferenceId: `synthetic-item-${index + 1}`, productUid: config.productUid,
    pageCount: config.apiPageCount, quantity: 1, fileUrl: 'https://synthetic.example.test/35-page-proof.pdf',
  }));
  const observedRequest = buildGelatoQuoteRequest({
    orderReferenceId: observed.orderReferenceId!, customerReferenceId: 'LHL-SYNTHETIC-API-PROBE',
    currency: 'USD', recipient, items: observedItems, config,
  });
  for (const tier of ['standard', 'priority', 'expedited']) {
    const observedSelection = validateGelatoQuote({
      response: { orderReferenceId: observed.orderReferenceId, quotes: observed.quotes }, request: observedRequest,
      config, shippingTier: tier, quotedAt: productEvidence.timestamp, now: new Date(Date.parse(productEvidence.timestamp) + 1000),
    });
    const rule = config.shipmentMethodPolicy.tiers[tier];
    assert.equal(observedSelection.shipmentMethodUid, rule.kind === 'uid' ? rule.uid : undefined);
  }
}

const frozenRoutes: FrozenPrintRouting[] = items.map((item, index) => ({
  orderDbId: 1001 + index,
  orderId: `ORDER-${1001 + index}`,
  rootOrderId: 'ORDER-1001',
  provider: 'gelato',
  bookId: 'book-finding-our-inner-voice',
  configVersion: 2,
  formatId: 'standard',
  productUid: config.productUid,
  innerPageCount: config.innerPageCount,
  apiPageCount: config.apiPageCount,
  expectedPdfPageCount: config.expectedPdfPageCount,
}));
let claimCalls = 0;
async function testPrintClaims() {
  await testGelatoApiClient();
  const claimed = await claimGelatoPrintRouting(frozenRoutes, 'w1.1:group-1001', async (routes, key) => {
    claimCalls += 1;
    assert.equal(routes.length, 2);
    assert.equal(key, 'w1.1:group-1001');
    return { dispatch: true, submissionId: 'submission-1', claimToken: 'token-1', orderReferenceId: 'lhb-gelato-1' };
  });
  assert.equal(claimed.provider, 'gelato');
  assert.equal(claimed.claim?.dispatch, true);
  assert.equal(claimCalls, 1);
  const luluRoutes = frozenRoutes.map((route) => ({ ...route, provider: 'lulu' as const }));
  const lulu = await claimGelatoPrintRouting(luluRoutes, 'w1.1:group-lulu', async () => {
    claimCalls += 1;
    return { dispatch: true };
  });
  assert.equal(lulu.claim, null);
  assert.equal(claimCalls, 1);
  await assert.rejects(claimGelatoPrintRouting([frozenRoutes[0], { ...frozenRoutes[1], provider: 'lulu' }], 'mixed', async () => ({ dispatch: true })), /Mixed print providers/);
  await assert.rejects(claimGelatoPrintRouting(frozenRoutes, 'x'.repeat(256), async () => ({ dispatch: true })), /Invalid print routing claim/);
  console.log('Gelato API request contract checks passed');
}

void testPrintClaims().catch((error) => { console.error(error); process.exitCode = 1; });
