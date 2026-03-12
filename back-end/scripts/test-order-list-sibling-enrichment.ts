import assert from 'node:assert/strict';

import { buildOrderListItem } from '../src/lib/status-display';
import { Order } from '../src/types/order';

function isChildBookRow(order: Order): boolean {
  return !!(order.rootOrderId && order.rootOrderId !== order.orderId);
}

function isRootGroupRow(order: Order): boolean {
  return !!(order.rootOrderId && order.rootOrderId === order.orderId);
}

function attachListSiblingMetadata(orders: Order[]): Order[] {
  const childGroupSizes = new Map<string, number>();

  for (const order of orders) {
    if (!isChildBookRow(order) || !order.rootOrderId) continue;
    childGroupSizes.set(
      order.rootOrderId,
      (childGroupSizes.get(order.rootOrderId) || 0) + 1
    );
  }

  return orders
    .filter((order) => {
      if (!isRootGroupRow(order) || !order.rootOrderId) {
        return true;
      }

      return (childGroupSizes.get(order.rootOrderId) || 0) === 0;
    })
    .map((order) => {
    if (!order.rootOrderId) {
      return order;
    }

    const groupSize = childGroupSizes.get(order.rootOrderId) || 0;
    return {
      ...order,
      isSibling: isChildBookRow(order) ? true : order.isSibling,
      totalSiblings: groupSize > 1 ? groupSize : order.totalSiblings,
    };
  });
}

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

  assert.equal(enrichedParent, undefined);
  assert.equal(enrichedA?.totalSiblings, 2);
  assert.equal(enrichedB?.totalSiblings, 2);
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
  assert.equal(listItem.totalSiblings, 2);

  console.log('test-order-list-sibling-enrichment: ok');
}

run().catch((error) => {
  console.error('test-order-list-sibling-enrichment: failed');
  console.error(error);
  process.exit(1);
});
