import assert from 'node:assert/strict';

import { mapSupabaseOrderToOrder } from '../src/lib/order-mapper';

async function run() {
  const singleBook = await mapSupabaseOrderToOrder(
    {
      amazon_order_id: 'AMZ-100',
      customer_name: 'Single Book',
      customer_email: 'single@example.com',
      purchase_date: '2026-03-11T00:00:00.000Z',
      status: 'queued_for_processing',
    },
    { includeStatus: false }
  );

  assert.equal(singleBook.orderId, 'AMZ-100');
  assert.equal(singleBook.amazonOrderId, 'AMZ-100');
  assert.equal(singleBook.rootOrderId, undefined);
  assert.equal(singleBook.isSibling, false);
  assert.equal(singleBook.itemNumber, undefined);

  const sibling = await mapSupabaseOrderToOrder(
    {
      orderId: 'root-uuid-item-2',
      amazon_order_id: 'root-uuid',
      root_order_id: 'root-uuid',
      customer_name: 'Sibling Book',
      customer_email: 'sibling@example.com',
      purchase_date: '2026-03-11T00:00:00.000Z',
      status: 'queued_for_processing',
    },
    { includeStatus: false }
  );

  assert.equal(sibling.orderId, 'root-uuid-item-2');
  assert.equal(sibling.amazonOrderId, 'root-uuid');
  assert.equal(sibling.rootOrderId, 'root-uuid');
  assert.equal(sibling.isSibling, true);
  assert.equal(sibling.itemNumber, 2);

  const noSuffixSibling = await mapSupabaseOrderToOrder(
    {
      orderId: 'custom-child-id',
      amazon_order_id: 'root-uuid',
      root_order_id: 'root-uuid',
      customer_name: 'Custom Child',
      customer_email: 'custom@example.com',
      purchase_date: '2026-03-11T00:00:00.000Z',
      status: 'queued_for_processing',
    },
    { includeStatus: false }
  );

  assert.equal(noSuffixSibling.orderId, 'custom-child-id');
  assert.equal(noSuffixSibling.rootOrderId, 'root-uuid');
  assert.equal(noSuffixSibling.isSibling, true);
  assert.equal(noSuffixSibling.itemNumber, undefined);

  const malformedSuffix = await mapSupabaseOrderToOrder(
    {
      orderId: 'root-uuid-item-abc',
      amazon_order_id: 'root-uuid',
      root_order_id: 'root-uuid',
      customer_name: 'Malformed Child',
      customer_email: 'malformed@example.com',
      purchase_date: '2026-03-11T00:00:00.000Z',
      status: 'queued_for_processing',
    },
    { includeStatus: false }
  );

  assert.equal(malformedSuffix.orderId, 'root-uuid-item-abc');
  assert.equal(malformedSuffix.rootOrderId, 'root-uuid');
  assert.equal(malformedSuffix.isSibling, true);
  assert.equal(malformedSuffix.itemNumber, undefined);

  console.log('test-order-mapper-sibling-identity: ok');
}

run().catch((error) => {
  console.error('test-order-mapper-sibling-identity: failed');
  console.error(error);
  process.exit(1);
});
