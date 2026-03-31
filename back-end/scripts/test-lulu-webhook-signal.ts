#!/usr/bin/env tsx

import { buildLuluWebhookSignal } from '@/lib/lulu-webhook-signal';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function testNotApplicableWithoutJob(): void {
  const signal = buildLuluWebhookSignal({
    luluJobId: null,
    currentStatus: null,
    webhookLog: null,
  });

  assertEqual(signal.deliveryState, 'not_applicable', 'missing lulu job should be not applicable');
  assertEqual(signal.deliveryReason, 'no_lulu_job_id', 'missing lulu job should explain why');
}

function testMissingWebhookDelivery(): void {
  const signal = buildLuluWebhookSignal({
    luluJobId: '2807941',
    currentStatus: 'UNPAID',
    webhookLog: null,
  });

  assertEqual(signal.deliveryState, 'missing', 'missing webhook row should be reported');
}

function testWebhookErrorSignal(): void {
  const signal = buildLuluWebhookSignal({
    luluJobId: '2807941',
    currentStatus: 'UNPAID',
    webhookLog: {
      received_at: '2026-03-30T20:00:00.000Z',
      status_name: 'UNPAID',
      updated: false,
      error_message: 'update failed',
    },
  });

  assertEqual(signal.deliveryState, 'error', 'failed webhook application should be reported');
  assertEqual(signal.deliveryReason, 'webhook_update_failed', 'error reason should be stable');
}

function testStaleWebhookSignal(): void {
  const signal = buildLuluWebhookSignal({
    luluJobId: '2807941',
    currentStatus: 'CANCELED',
    webhookLog: {
      received_at: '2026-03-30T20:00:00.000Z',
      status_name: 'PRODUCTION_DELAYED',
      updated: true,
      error_message: null,
    },
  });

  assertEqual(signal.deliveryState, 'stale', 'status mismatch should be stale');
  assertEqual(
    signal.deliveryReason,
    'order_status_differs_from_latest_webhook',
    'stale reason should be stable',
  );
}

function testReceivedWebhookSignal(): void {
  const signal = buildLuluWebhookSignal({
    luluJobId: '2807941',
    currentStatus: 'CANCELED',
    webhookLog: {
      received_at: '2026-03-30T20:00:00.000Z',
      status_name: 'CANCELED',
      updated: true,
      error_message: null,
    },
  });

  assertEqual(signal.deliveryState, 'received', 'matching applied webhook should be received');
  assert(signal.latestReceivedAt?.startsWith('2026-03-30T20:00:00'), 'received timestamp should normalize');
}

function main(): void {
  testNotApplicableWithoutJob();
  testMissingWebhookDelivery();
  testWebhookErrorSignal();
  testStaleWebhookSignal();
  testReceivedWebhookSignal();
  console.log('Lulu webhook signal tests passed');
}

main();
