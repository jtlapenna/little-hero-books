#!/usr/bin/env tsx

import {
  getCronExcludedOrderReason,
  splitCronExcludedOrders,
} from '@/lib/cron-order-guards';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function main(): void {
  const explicitTest = getCronExcludedOrderReason({
    orderId: 'TEST-REPO-W0DOC-1773977219719',
    customer_email: 'jeff+repo-smoke@example.com',
  });
  assert(
    explicitTest === 'analytics_explicit_test_marker',
    'Expected TEST-* order ids to be excluded through the shared explicit test-marker rule',
  );

  const directSmoke = getCronExcludedOrderReason({
    orderId: 'DIRECT-W2A-1773975480881',
    customer_email: 'realistic@example.net',
  });
  assert(
    directSmoke === 'order_id_prefix_direct_',
    'Expected DIRECT-* smoke fixtures to be excluded from cron routing',
  );

  const exampleDomain = getCronExcludedOrderReason({
    orderId: 'LH-REAL-ISH-001',
    customer_email: 'jeff+repo-smoke@example.com',
  });
  assert(
    exampleDomain === 'customer_email_example_domain',
    'Expected example.com addresses to be excluded from cron routing',
  );

  const repoSmoke = getCronExcludedOrderReason({
    orderId: 'LH-REAL-ISH-002',
    customer_email: 'jeff+repo-smoke@littlehero.example',
  });
  assert(
    repoSmoke === 'customer_email_marker_repo_smoke',
    'Expected repo-smoke mailboxes to be excluded from cron routing',
  );

  const productionLike = getCronExcludedOrderReason({
    platform: 'amazon',
    orderId: '112-7311035-1437035',
    amazon_order_id: '112-7311035-1437035',
    customer_email: 'customer@example.org',
    customer_name: 'Real Customer',
  });
  assert(
    productionLike === null,
    'Expected production-looking orders to remain eligible for cron routing',
  );

  const split = splitCronExcludedOrders([
    {
      id: 1,
      orderId: 'TEST-ORDER-001',
      customer_email: 'jeff+repo-smoke@example.com',
    },
    {
      id: 2,
      orderId: '112-7311035-1437035',
      amazon_order_id: '112-7311035-1437035',
      customer_email: 'customer@example.org',
      customer_name: 'Real Customer',
    },
  ]);

  assert(
    split.excluded.length === 1 && split.included.length === 1,
    'Expected splitCronExcludedOrders to separate explicit smoke fixtures from production-looking orders',
  );

  console.log('test-cron-order-guards: ok');
}

main();
