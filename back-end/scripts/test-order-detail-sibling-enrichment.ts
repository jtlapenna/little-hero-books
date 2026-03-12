import assert from 'node:assert/strict';

import { attachSiblingOrderSummaries } from '../src/lib/order-sibling-summary';
import { Order } from '../src/types/order';

function buildBaseOrder(overrides: Partial<Order> = {}): Order {
  return {
    orderId: 'single-order',
    platform: 'd2c',
    project: 'book-mvp-simple-adventure',
    customer: {
      firstName: 'Test',
      lastName: 'Customer',
      email: 'test@example.com',
    },
    orderDate: '2026-03-11T00:00:00.000Z',
    status: 'queued_for_processing',
    characterSpecs: {},
    bookSpecs: {},
    orderDetails: {},
    assetPrefix: 'book-mvp-simple-adventure/orders/single-order/',
    reviewStages: {
      preBria: { status: 'pending' },
      postBria: { status: 'pending' },
      postPdf: { status: 'pending' },
    },
    webhooks: {
      onApprove: 'https://example.com/webhook',
    },
    ...overrides,
  };
}

async function run() {
  const nonSiblingOrder = buildBaseOrder();
  const untouched = attachSiblingOrderSummaries(nonSiblingOrder, []);
  assert.equal(untouched.siblingOrders, undefined);
  assert.equal(untouched.totalSiblings, undefined);

  const currentSibling = buildBaseOrder({
    orderId: 'root-uuid-item-2',
    rootOrderId: 'root-uuid',
    isSibling: true,
    itemNumber: 2,
    displayOrderId: 'LH-ROOT-2',
    manifest2aUrl: 'https://example.com/item-2-2a.json',
    executionStatus: 'processing',
    workflowStep: '2A',
    characterHash: 'hash-2',
    createdAt: '2026-03-11T10:02:00.000Z',
    customer: {
      firstName: 'Joe',
      lastName: 'Two',
      email: 'joe2@example.com',
    },
  });

  const enriched = attachSiblingOrderSummaries(currentSibling, [
    {
      orderId: 'root-uuid',
      root_order_id: 'root-uuid',
      display_order_id: 'LH-ROOT',
      customer_name: 'Parent Root',
      execution_status: 'queued',
      workflow_step: '1',
      manifest_2a_url: '',
      character_hash: 'hash-root',
      created_at: '2026-03-11T10:00:00.000Z',
    },
    {
      orderId: 'root-uuid-item-3',
      root_order_id: 'root-uuid',
      display_order_id: 'LH-ROOT-3',
      customer_name: 'Joe Three',
      execution_status: 'queued',
      workflow_step: '2A',
      manifest_2a_url: '',
      character_hash: 'hash-3',
      created_at: '2026-03-11T10:03:00.000Z',
    },
    {
      orderId: 'root-uuid-item-1',
      root_order_id: 'root-uuid',
      display_order_id: 'LH-ROOT-1',
      customer_name: 'Joe One',
      execution_status: 'complete',
      workflow_step: '2A-complete',
      manifest_2a_url: 'https://example.com/item-1-2a.json',
      character_hash: 'hash-1',
      created_at: '2026-03-11T10:01:00.000Z',
    },
  ]);

  assert.equal(enriched.totalSiblings, 3);
  assert.equal(enriched.siblingOrders?.length, 3);
  assert.deepEqual(
    enriched.siblingOrders?.map((s) => s.orderId),
    ['root-uuid-item-1', 'root-uuid-item-2', 'root-uuid-item-3']
  );
  assert.equal(
    enriched.siblingOrders?.filter((s) => s.isCurrent).length,
    1
  );
  assert.equal(
    enriched.siblingOrders?.find((s) => s.isCurrent)?.orderId,
    'root-uuid-item-2'
  );
  assert.equal(
    enriched.siblingOrders?.find((s) => s.orderId === 'root-uuid-item-1')?.manifest2aUrl,
    'https://example.com/item-1-2a.json'
  );
  assert.equal(
    enriched.siblingOrders?.find((s) => s.orderId === 'root-uuid-item-2')?.manifest2aUrl,
    'https://example.com/item-2-2a.json'
  );

  console.log('test-order-detail-sibling-enrichment: ok');
}

run().catch((error) => {
  console.error('test-order-detail-sibling-enrichment: failed');
  console.error(error);
  process.exit(1);
});
