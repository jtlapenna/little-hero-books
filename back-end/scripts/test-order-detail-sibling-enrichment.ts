import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { mapSupabaseOrderToOrder } from '../src/lib/order-mapper';
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
    { orderId: currentSibling.orderId, root_order_id: 'root-uuid', created_at: currentSibling.createdAt, manifest_2a_url: currentSibling.manifest2aUrl },
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

  assert.equal(enriched.totalSiblings, 4);
  assert.equal(enriched.siblingOrders?.length, 4);
  assert.deepEqual(
    enriched.siblingOrders?.map((s) => s.orderId),
    ['root-uuid', 'root-uuid-item-1', 'root-uuid-item-2', 'root-uuid-item-3']
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

  for (const fixture of ['actual-csv-complete.json', 'actual-csv-mixed.json']) {
    const producerRows = readProducerRows(fixture);
    for (const current of producerRows) {
      const order = await mapSupabaseOrderToOrder(current, { includeStatus: false });
      const summary = attachSiblingOrderSummaries(order, producerRows);
      assert.deepEqual(summary.siblingOrders?.map(member => member.orderId).sort(), producerRows.map(row => row.orderId).sort());
      assert.equal(summary.totalSiblings, producerRows.length);
      assert.equal(summary.siblingOrders?.filter(member => member.isCurrent).length, 1);
      assert.equal(summary.siblingOrders?.find(member => member.isCurrent)?.characterHash, current.character_hash);
      assert.throws(() => attachSiblingOrderSummaries(order, producerRows.filter(row => row.id !== current.id)), /Current order is missing/);
      assert.throws(() => attachSiblingOrderSummaries(order, [...producerRows, producerRows[0]]), /Duplicate/);
    }
  }
  for (const id of ['canonical-frontend-single', 'canonical-frontend-siblings']) {
    const source = readWebsiteProducer(id);
    for (const row of source) {
      const order = await mapSupabaseOrderToOrder(row, { includeStatus: false });
      const detail = attachSiblingOrderSummaries(order, source);
      assert.deepEqual(detail.siblingOrders?.map(member => member.orderId).sort(), source.map(row => row.orderId).sort());
      assert.equal(detail.totalSiblings, source.length);
    }
  }
  console.log('test-order-detail-sibling-enrichment: ok');
}

run().catch((error) => {
  console.error('test-order-detail-sibling-enrichment: failed');
  console.error(error);
  process.exit(1);
});

function readProducerRows(name: string): Record<string, any>[] {
  const directory = process.env.GROUP_CONSUMER_PRODUCER_INPUT;
  assert.ok(directory, 'GROUP_CONSUMER_PRODUCER_INPUT must name the accepted producer output');
  const expected: Record<string, string> = {"actual-csv-complete.json": "6e764c2eba29f92815f48bb88f2dd0e4bc487a6420556782559e08d869e168a7", "actual-csv-partial.json": "ebf16c0c1c4b083e76855426940b8482d8e8cb4c9e7c8a639dd27e5a29752785", "actual-csv-mixed.json": "2c4eb0a6e3c2d72f47e0fbb31393d993d5099037e2b886ea3bb37a53a2bea39a", "actual-csv-legacy.json": "d714d7f50bd88080622b677454d3093e92f58f39b258d2d845bcf0c4cbfe579d"};
  assert.ok(expected[name], 'Unknown producer fixture');
  const bytes = readFileSync(resolve(directory, name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected[name], 'Producer bytes changed');
  const parsed = JSON.parse(bytes.toString());
  return Array.isArray(parsed) ? parsed : [parsed];
}

function readWebsiteProducer(id: string): Record<string, any>[] {
  const file = process.env.GROUP_CONSUMER_D2C_INPUT;
  assert.ok(file, 'GROUP_CONSUMER_D2C_INPUT must name the accepted checkout observations');
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '8f09a33294819762e8db308ac4fd8f1dc6a610874eef45a8aa81603bc2f0e89e');
  const frame = bytes.toString().trim().split('\n').map(line => JSON.parse(line)).find(frame => frame.kind === 'case' && frame.id === id);
  assert.equal(frame?.observation.response.status, 201);
  assert.deepEqual(frame.observation.unexpected, []);
  return frame.observation.rows.map((row: Record<string, unknown>, index: number) => ({ ...row, id: row.id ?? 101 + index }));
}
