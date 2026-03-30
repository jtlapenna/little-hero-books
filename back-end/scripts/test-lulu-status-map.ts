#!/usr/bin/env tsx

import { buildLuluOrderUpdate } from '@/lib/lulu-status-map';

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

function testShippedDoesNotMarkDelivered(): void {
  const patch = buildLuluOrderUpdate({
    statusName: 'SHIPPED',
    order: {
      shipped_at: null,
      delivered_at: null,
      error_type: 'workflow_timeout',
    },
    changedAt: '2026-03-30T05:10:00.000Z',
    trackingNumber: 'TRACK-001',
    trackingUrl: 'https://tracking.example/TRACK-001',
    carrier: 'OSM',
    now: '2026-03-30T05:11:00.000Z',
  });

  assertEqual(patch.lulu_status, 'SHIPPED', 'SHIPPED patch should persist Lulu status');
  assertEqual(patch.status, 'shipped', 'SHIPPED patch should map to shipped order status');
  assertEqual(
    patch.print_fulfillment_finished_at,
    '2026-03-30T05:10:00.000Z',
    'SHIPPED patch should set print fulfillment finished time',
  );
  assertEqual(patch.shipped_at, '2026-03-30T05:10:00.000Z', 'SHIPPED patch should set shipped_at');
  assert(
    !('delivered_at' in patch),
    'SHIPPED patch should not set delivered_at',
  );
  assertEqual(patch.workflow_step, 'done', 'SHIPPED patch should mark workflow step done');
  assertEqual(patch.execution_status, 'done', 'SHIPPED patch should mark execution status done');
  assertEqual(patch.error_type, null, 'SHIPPED patch should clear workflow timeout error_type');
  assertEqual(patch.error_message, null, 'SHIPPED patch should clear workflow timeout error_message');
}

function testRejectedMarksTerminalActionRequired(): void {
  const patch = buildLuluOrderUpdate({
    statusName: 'REJECTED',
    order: {
      shipped_at: null,
      delivered_at: null,
    },
    changedAt: '2026-03-30T05:20:00.000Z',
    errorMessage: 'Interior PDF page count invalid',
    now: '2026-03-30T05:21:00.000Z',
  });

  assertEqual(patch.lulu_status, 'REJECTED', 'REJECTED patch should persist Lulu status');
  assertEqual(patch.status, 'action_required', 'REJECTED patch should map to action_required');
  assertEqual(
    patch.print_fulfillment_finished_at,
    '2026-03-30T05:20:00.000Z',
    'REJECTED patch should set print fulfillment finished time',
  );
  assertEqual(patch.error_type, 'lulu_rejected', 'REJECTED patch should set lulu_rejected error_type');
  assertEqual(
    patch.error_message,
    'Interior PDF page count invalid',
    'REJECTED patch should preserve rejection details',
  );
}

function testCanceledMarksTerminalCancelledState(): void {
  const patch = buildLuluOrderUpdate({
    statusName: 'CANCELED',
    order: {
      shipped_at: null,
      delivered_at: null,
      error_type: 'workflow_timeout',
    },
    changedAt: '2026-03-30T05:30:00.000Z',
    now: '2026-03-30T05:31:00.000Z',
  });

  assertEqual(patch.lulu_status, 'CANCELED', 'CANCELED patch should persist Lulu status');
  assertEqual(patch.status, 'cancelled', 'CANCELED patch should map to cancelled');
  assertEqual(
    patch.print_fulfillment_finished_at,
    '2026-03-30T05:30:00.000Z',
    'CANCELED patch should set print fulfillment finished time',
  );
  assertEqual(patch.error_type, null, 'CANCELED patch should clear error_type');
  assertEqual(patch.error_message, null, 'CANCELED patch should clear error_message');
}

function testDeliveredBackfillsShippedAtWhenMissing(): void {
  const patch = buildLuluOrderUpdate({
    statusName: 'DELIVERED',
    order: {
      shipped_at: null,
      delivered_at: null,
    },
    changedAt: '2026-03-30T05:40:00.000Z',
    now: '2026-03-30T05:41:00.000Z',
  });

  assertEqual(patch.status, 'delivered', 'DELIVERED patch should map to delivered');
  assertEqual(patch.shipped_at, '2026-03-30T05:40:00.000Z', 'DELIVERED patch should backfill shipped_at when missing');
  assertEqual(patch.delivered_at, '2026-03-30T05:40:00.000Z', 'DELIVERED patch should set delivered_at');
  assertEqual(patch.lifecycle_status, 'recently_delivered', 'DELIVERED patch should set lifecycle_status');
  assertEqual(patch.assumed_delivered_at, '2026-03-30T05:40:00.000Z', 'DELIVERED patch should set assumed_delivered_at');
}

function main(): void {
  testShippedDoesNotMarkDelivered();
  testRejectedMarksTerminalActionRequired();
  testCanceledMarksTerminalCancelledState();
  testDeliveredBackfillsShippedAtWhenMissing();
  console.log('lulu status map tests passed');
}

main();
