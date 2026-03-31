#!/usr/bin/env tsx

import { buildLuluWebhookSignal } from '@/lib/lulu-webhook-signal';
import {
  buildWorkflowWatchdogSummary,
  deriveEffectiveWatchdogProviderSignal,
} from '@/lib/workflow-watchdog';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function testMirroredStaleSignalBecomesReceived(): void {
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

  const effective = deriveEffectiveWatchdogProviderSignal({
    jobStatus: 'succeeded',
    currentProviderStatus: 'PRODUCTION_DELAYED',
    signal,
  });

  assertEqual(
    effective.deliveryState,
    'received',
    'mirrored stale provider status should resolve to received',
  );
  assertEqual(
    effective.deliveryReason,
    'latest_webhook_mirrored_into_job_snapshot',
    'mirrored stale provider status should explain why it was resolved',
  );
}

function testTerminalConvergedErrorBecomesReceived(): void {
  const signal = buildLuluWebhookSignal({
    luluJobId: '2806186',
    currentStatus: 'CREATED',
    webhookLog: {
      received_at: '2026-03-29T18:53:21.039Z',
      status_name: 'REJECTED',
      updated: false,
      error_message: 'Order not found',
    },
  });

  const effective = deriveEffectiveWatchdogProviderSignal({
    jobStatus: 'succeeded',
    currentProviderStatus: 'REJECTED',
    signal,
  });

  assertEqual(
    effective.deliveryState,
    'received',
    'terminal converged provider error should not stay open forever',
  );
  assertEqual(
    effective.deliveryReason,
    'terminal_provider_state_already_converged',
    'terminal converged provider error should explain why it was suppressed',
  );
}

function testNonTerminalProviderErrorStaysOpen(): void {
  const signal = buildLuluWebhookSignal({
    luluJobId: '2807001',
    currentStatus: 'UNPAID',
    webhookLog: {
      received_at: '2026-03-30T20:00:00.000Z',
      status_name: 'UNPAID',
      updated: false,
      error_message: 'Order not found',
    },
  });

  const effective = deriveEffectiveWatchdogProviderSignal({
    jobStatus: 'succeeded',
    currentProviderStatus: 'UNPAID',
    signal,
  });

  assertEqual(
    effective.deliveryState,
    'error',
    'non-terminal provider errors should remain visible',
  );
  assertEqual(
    effective.deliveryReason,
    'webhook_update_failed',
    'non-terminal provider errors should keep their original reason',
  );
}

function testActiveJobProviderErrorStaysOpen(): void {
  const signal = buildLuluWebhookSignal({
    luluJobId: '2807941',
    currentStatus: 'CREATED',
    webhookLog: {
      received_at: '2026-03-30T20:00:00.000Z',
      status_name: 'CANCELED',
      updated: false,
      error_message: 'Order not found',
    },
  });

  const effective = deriveEffectiveWatchdogProviderSignal({
    jobStatus: 'running',
    currentProviderStatus: 'CANCELED',
    signal,
  });

  assertEqual(
    effective.deliveryState,
    'error',
    'active jobs should keep provider errors visible even if the latest status is terminal',
  );
}

function testWatchdogSummarySeparatesConditionsFromOpenAlerts(): void {
  const summary = buildWorkflowWatchdogSummary({
    scannedJobCount: 25,
    conditionCount: 7,
    openAlertCountAfterRun: 0,
    resolvedAlertCount: 7,
    byAlertType: {
      'stale-running': 6,
      'stale-polling': 1,
    },
  });

  assertEqual(
    summary.conditionCount,
    7,
    'watchdog summary should expose detected condition count explicitly',
  );
  assertEqual(
    summary.openAlertCountAfterRun,
    0,
    'watchdog summary should expose true open alert count after the run',
  );
  assertEqual(
    summary.openAlertCount,
    7,
    'legacy openAlertCount alias should continue to reflect detected condition count',
  );
}

function main(): void {
  testMirroredStaleSignalBecomesReceived();
  testTerminalConvergedErrorBecomesReceived();
  testNonTerminalProviderErrorStaysOpen();
  testActiveJobProviderErrorStaysOpen();
  testWatchdogSummarySeparatesConditionsFromOpenAlerts();
  console.log('test-workflow-watchdog: ok');
}

main();
