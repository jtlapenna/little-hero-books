import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildOrderListItem } from '../src/lib/status-display';
import { SiblingCountBadge } from '../src/components/ui/sibling-count-badge';
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
  const hiddenBadge = renderToStaticMarkup(
    React.createElement(SiblingCountBadge, { isSibling: false })
  );
  assert.equal(hiddenBadge, '');

  const countedBadge = renderToStaticMarkup(
    React.createElement(SiblingCountBadge, { isSibling: true, totalSiblings: 3 })
  );
  assert.match(countedBadge, /3 books/);

  const fallbackBadge = renderToStaticMarkup(
    React.createElement(SiblingCountBadge, { isSibling: true })
  );
  assert.match(fallbackBadge, /Multi-book/);

  const order = buildBaseOrder({
    orderId: 'root-uuid-item-2',
    rootOrderId: 'root-uuid',
    isSibling: true,
    itemNumber: 2,
    totalSiblings: 3,
  });
  const listItem = buildOrderListItem(order);
  assert.equal(listItem.rootOrderId, 'root-uuid');
  assert.equal(listItem.isSibling, true);
  assert.equal(listItem.itemNumber, 2);
  assert.equal(listItem.totalSiblings, 3);

  const fallbackListItem = {
    orderId: order.orderId,
    platform: order.platform,
    rootOrderId: order.rootOrderId,
    isSibling: order.isSibling,
    itemNumber: order.itemNumber,
    totalSiblings: order.totalSiblings,
    firstName: order.customer.firstName,
    lastName: order.customer.lastName,
    workflowStatus: 'action_required' as any,
    technicalStatus: 'action_required' as any,
    status: 'action_required' as any,
    rawStatus: order.status,
    phase: 'in_queue' as any,
    orderDate: order.orderDate,
    characterHash: order.characterHash,
    reviewStages: order.reviewStages,
    customerApprovalStatus: order.customerApprovalStatus ?? null,
    hasFlags: order.hasFlags ?? false,
    flags: order.flags || {},
    revisionCount: typeof order.revisionCount === 'number' ? order.revisionCount : 0,
    errors: ['action_required' as any],
    lifecycle_status: (order as any).lifecycle_status || 'active',
  };

  assert.equal(fallbackListItem.rootOrderId, 'root-uuid');
  assert.equal(fallbackListItem.isSibling, true);
  assert.equal(fallbackListItem.itemNumber, 2);
  assert.equal(fallbackListItem.totalSiblings, 3);

  console.log('test-order-list-indicators: ok');
}

run().catch((error) => {
  console.error('test-order-list-indicators: failed');
  console.error(error);
  process.exit(1);
});
