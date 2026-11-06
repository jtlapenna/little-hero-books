import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { attachListSiblingMetadata } from '../src/lib/order-sibling-summary';
import { mapSupabaseOrderToOrder } from '../src/lib/order-mapper';
import assert from 'node:assert/strict';

import { buildOrderListItem } from '../src/lib/status-display';
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
  const parentRow = buildBaseOrder({
    orderId: 'root-uuid',
    rootOrderId: 'root-uuid',
    isSibling: false,
    itemNumber: undefined,
  });
  const siblingA = buildBaseOrder({
    orderId: 'root-uuid-item-1',
    rootOrderId: 'root-uuid',
    isSibling: true,
    itemNumber: 1,
  });
  const siblingB = buildBaseOrder({
    orderId: 'root-uuid-item-2',
    rootOrderId: 'root-uuid',
    isSibling: true,
    itemNumber: 2,
  });
  const singleton = buildBaseOrder({
    orderId: 'solo-order',
    rootOrderId: undefined,
    isSibling: undefined,
    itemNumber: undefined,
  });
  const errorSibling = buildBaseOrder({
    orderId: 'other-root-item-9',
    rootOrderId: 'other-root',
    isSibling: true,
    itemNumber: 9,
    errorType: 'mapping_error',
  });

  const enriched = attachListSiblingMetadata([
    parentRow,
    siblingA,
    siblingB,
    singleton,
    errorSibling,
  ]);

  const enrichedParent = enriched.find((o) => o.orderId === 'root-uuid');
  const enrichedA = enriched.find((o) => o.orderId === 'root-uuid-item-1');
  const enrichedB = enriched.find((o) => o.orderId === 'root-uuid-item-2');
  const enrichedSingleton = enriched.find((o) => o.orderId === 'solo-order');
  const enrichedErrorSibling = enriched.find((o) => o.orderId === 'other-root-item-9');

  assert.equal(enrichedParent?.totalSiblings, 3);
  assert.equal(enrichedParent?.isSibling, true);
  assert.equal(enrichedA?.totalSiblings, 3);
  assert.equal(enrichedB?.totalSiblings, 3);
  assert.equal(enrichedA?.isSibling, true);
  assert.equal(enrichedB?.isSibling, true);
  assert.equal(enrichedA?.itemNumber, 1);
  assert.equal(enrichedB?.itemNumber, 2);

  assert.equal(enrichedSingleton?.totalSiblings, undefined);
  assert.equal(enrichedSingleton?.isSibling, undefined);

  assert.equal(enrichedErrorSibling?.isSibling, true);
  assert.equal(enrichedErrorSibling?.totalSiblings, undefined);
  assert.equal(enrichedErrorSibling?.itemNumber, 9);

  const listItem = buildOrderListItem(enrichedB!);
  assert.equal(listItem.rootOrderId, 'root-uuid');
  assert.equal(listItem.isSibling, true);
  assert.equal(listItem.itemNumber, 2);
  assert.equal(listItem.totalSiblings, 3);

  for (const fixture of ['actual-csv-complete.json', 'actual-csv-mixed.json']) {
    const producerRows = readProducerRows(fixture);
    const mapped = await Promise.all(producerRows.map(row => mapSupabaseOrderToOrder(row, { includeStatus: false })));
    const actual = attachListSiblingMetadata(mapped);
    assert.deepEqual(actual.map(order => order.orderId).sort(), producerRows.map(row => row.orderId).sort());
    for (const order of actual) {
      assert.equal(order.totalSiblings, producerRows.length);
      assert.equal(order.isSibling, true);
      assert.equal(order.characterHash, producerRows.find(row => row.orderId === order.orderId)?.character_hash);
    }
    assert.equal(attachListSiblingMetadata([...mapped, mapped[0]])[0].totalSiblings, producerRows.length);
  }
  for (const id of ['canonical-frontend-single', 'canonical-frontend-siblings']) {
    const source = readWebsiteProducer(id);
    const orders = await Promise.all(source.map(row => mapSupabaseOrderToOrder(row, { includeStatus: false })));
    const listed = attachListSiblingMetadata(orders);
    assert.deepEqual(listed.map(order => order.orderId).sort(), source.map(row => row.orderId).sort());
    if (source.length > 1) for (const order of listed) assert.equal(order.totalSiblings, source.length);
  }
  console.log('test-order-list-sibling-enrichment: ok');
}

run().catch((error) => {
  console.error('test-order-list-sibling-enrichment: failed');
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
