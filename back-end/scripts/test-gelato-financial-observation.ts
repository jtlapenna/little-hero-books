import assert from 'node:assert/strict';
import { observeGelatoFinance, observeGelatoMonetaryQuote, gelatoDecimal, bindGelatoFinancialGraph } from '../src/lib/books/gelato-financial-observation';
import { GelatoProviderOrderSchema } from '../src/lib/books/gelato-provider-snapshot';
import { buildGelatoLifecycleResults, refreshGelatoSubmission } from '../src/lib/books/gelato-lifecycle';

async function main() {
  Object.assign(process.env, { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-finance-proof' });
  const original = globalThis.fetch; globalThis.fetch = async () => { throw Error('No real finance/provider calls'); };
  try {
    const { fixture } = await import('./test-gelato-engineering-automation');
    const { getGelatoOrder } = await import('../src/lib/books/gelato-api-client');
    const { runEngineeringConversion } = await import('../src/lib/books/gelato-engineering-conversion');
    const f = await fixture('amazon', 2, 90, false, 'TEST-GELATO-FINANCE', true);
    const saved = JSON.stringify(f.context.submission.request_snapshot);
    const monetary = (f.context.submission.request_snapshot as { monetaryQuote: ReturnType<typeof observeGelatoMonetaryQuote> }).monetaryQuote;
    assert.deepEqual(monetary.products.map(p => p.price), ['12.18', '12.18']); assert.equal(monetary.shippingOptions[0].price, '5');
    assert(!saved.includes('PRIVATE-QUOTE-MARKER')); assert.equal(monetary.shippingOptions.length, 1, 'Shared shipping is retained once');
    assert.equal((await runEngineeringConversion(f.a.id, 'convert', f.d.conversion)).state, 'converted');
    assert.equal(JSON.stringify(f.context.submission.request_snapshot), saved, 'A later diagnostic reprice cannot replace the submitted monetary quote');
    const raw = { ...f.raw(), privateBilling: 'PRIVATE-RAW-MARKER', receipts: [{ id: 'receipt-1', orderId: f.a.provider_root_id, transactionType: 'purchase', currency: 'USD', isCalculated: false,
      total: 0, privateBilling: 'PRIVATE-RECEIPT-MARKER', items: [{ id: 'line-1', referenceId: 'provider-item-0', type: 'product', amount: 1, price: 0, vat: 0, priceInclVat: 0, currency: 'USD', billingAddress: 'PRIVATE-LINE-MARKER' }] }] };
    const parsed = await getGelatoOrder(f.a.provider_root_id, { apiKey: 'synthetic', fetcher: async () => Response.json(raw) });
    const finance = parsed.financialObservation!;
    assert.equal(finance.status, 'pending'); assert.equal(finance.receipts?.[0].amounts.total, '0'); assert.equal(finance.receipts?.[0].isCalculated, false);
    assert(!JSON.stringify(parsed).includes('PRIVATE-')); assert.equal(observeGelatoFinance({ ...raw, receipts: undefined }, 'USD').receipts, null);
    assert.deepEqual(observeGelatoFinance({ ...raw, receipts: [] }, 'USD').receipts, []);
    assert.equal(observeGelatoFinance({ ...raw, receipts: Array(101).fill({}) }, 'USD').reviewReason, 'malformed_receipts');
    assert.equal(observeGelatoFinance({ ...raw, financialStatus: 'future-status' }, 'USD').status, 'unknown');
    assert.equal(observeGelatoFinance({ ...raw, financialStatus: 'unknown' }, 'USD').reviewReason, 'unknown_financial_status');
    assert.equal(observeGelatoFinance({ ...raw, receipts: [{ currency: 'EUR' }] }, 'USD').reviewReason, 'receipt_currency_mismatch');
    assert.equal(gelatoDecimal(NaN), null); assert.equal(gelatoDecimal('12.1800'), '12.18'); assert.equal(gelatoDecimal('bad'), null);
    const selection = { quoteId: 'quantity-two', quotedAt: '2026-10-17T00:00:00Z', requestFingerprint: 'a'.repeat(64), shipmentMethodUid: 'service' };
    const q = { quotes: [{ id: selection.quoteId, private: 'PRIVATE-QUOTE', products: [{ itemReferenceId: 'one', productUid: 'product', quantity: 2, price: 24.36, currency: 'USD' }],
      shipmentMethods: [{ shipmentMethodUid: 'service', price: 5, currency: 'USD' }] }] };
    assert.equal(observeGelatoMonetaryQuote(q, selection, 'USD').products[0].price, '24.36', 'Reported product line aggregate must not be multiplied by quantity again');
    assert.throws(() => observeGelatoMonetaryQuote({ quotes: [{ ...q.quotes[0], products: [{ ...q.quotes[0].products[0], currency: 'EUR' }] }] }, selection, 'USD'), /currency/);

    // Optional finance bootstraps a legacy snapshot at the same provider timestamp.
    const before = GelatoProviderOrderSchema.parse(f.raw());
    Object.assign(f.context.providerOrders[0], { snapshot: before, status: 'created', order_type: 'order' });
    const observed = GelatoProviderOrderSchema.parse({ ...before, financialObservation: finance });
    let result = buildGelatoLifecycleResults(f.context, [observed])[0];
    assert.equal(result.accepted, true); assert.equal(result.financialAccepted, true);
    for (const receipts of [
      [{ ...raw.receipts[0], orderId: 'foreign-order' }],
      [{ ...raw.receipts[0], items: [{ ...raw.receipts[0].items[0], referenceId: 'foreign-item' }] }],
      [{ ...raw.receipts[0], orderId: 'foreign/order' }],
      [{ ...raw.receipts[0], orderId: 123 }],
      [{ ...raw.receipts[0], items: [{ ...raw.receipts[0].items[0], referenceId: 'foreign/item' }] }],
    ]) {
      const foreign = await getGelatoOrder(f.a.provider_root_id, { apiKey: 'synthetic', fetcher: async () => Response.json({ ...raw, receipts }) });
      const rejected = buildGelatoLifecycleResults(f.context, [foreign])[0];
      assert.equal(rejected.accepted, true); assert.equal(rejected.financialAccepted, false);
      assert.equal(rejected.financialActionReason, 'receipt_identity_mismatch');
    }
    const connectedFinance = { ...finance, receipts: [{ ...finance.receipts![0], orderId: 'connected-root', items: [{ ...finance.receipts![0].items![0], referenceId: 'connected-item' }] }] };
    const connected = bindGelatoFinancialGraph([{ id: observed.id, items: observed.items, financialObservation: connectedFinance }, { id: 'connected-root', items: [{ id: 'connected-item' }] }]);
    assert.equal(connected[0].financialObservation?.reviewReason, null, 'Owned connected-order receipts remain valid');
    f.context.providerOrders[0].financial_observation = finance;
    const changed = GelatoProviderOrderSchema.parse({ ...observed, financialObservation: { ...finance, status: 'paid' } });
    result = buildGelatoLifecycleResults(f.context, [changed])[0];
    assert.equal(result.accepted, true); assert.equal(result.financialAccepted, false); assert.equal(result.financialActionReason, 'same_timestamp_financial_change');
    const later = GelatoProviderOrderSchema.parse({ ...changed, updatedAt: '2026-10-17T01:00:00Z' });
    assert.equal(buildGelatoLifecycleResults(f.context, [later])[0].financialAccepted, true);
    const invalid = { ...later, shippingAddress: { ...later.shippingAddress, city: 'Different' } };
    const writes: string[] = [];
    await assert.rejects(() => refreshGelatoSubmission(f.context.submission.id, { store: { load: async () => f.context, transition: async name => { writes.push(name); return null; } }, get: async () => invalid, verifyStoredFile: async () => true }));
    assert.deepEqual(writes, ['hold_gelato_provider_refresh'], 'Invalid recipient cannot publish finance');
  } finally { globalThis.fetch = original; }
  console.log('PASS: quote -> saved request -> conversion, redacted financial API observations, unknown/zero/empty, quantity semantics, legacy bootstrap and same-time financial hold');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
