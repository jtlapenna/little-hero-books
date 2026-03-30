#!/usr/bin/env tsx

import { handlePrintQaFailed } from '@/app/api/webhooks/print-qa-failed/route';

type JsonRecord = Record<string, unknown>;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function testPrintQaFailedUsesOnlyRealOrderColumns(): Promise<void> {
  let recordedUpdate: JsonRecord | null = null;

  const response = await handlePrintQaFailed(
    {
      orderId: 'W4-QA-FAIL-TEST-001',
      reasonCode: 'page_count_invalid',
      reason: 'Expected 4 to 48 pages',
      failedPages: [1, 2],
    },
    {
      getOrder: async () => ({
        orderId: 'W4-QA-FAIL-TEST-001',
      }),
      updateOrderStatus: async (_orderId, updates) => {
        recordedUpdate = updates as JsonRecord;
      },
    },
  );

  assert(response.ok === true && response.status === 200, 'Expected QA-failed handler to succeed');
  assert(recordedUpdate !== null, 'Expected QA-failed handler to update the order');
  assert(
    recordedUpdate?.execution_status === 'error' &&
      recordedUpdate?.error_type === 'print_qa_failed' &&
      recordedUpdate?.workflow_step === 'print_fulfillment' &&
      typeof recordedUpdate?.error_message === 'string',
    'Expected QA-failed handler to persist the normal order error fields',
  );
  assert(
    !('printFulfillmentStatus' in (recordedUpdate ?? {})) &&
      !('printFulfillmentErrorPhase' in (recordedUpdate ?? {})) &&
      !('printFulfillmentErrorMessage' in (recordedUpdate ?? {})),
    'Expected QA-failed handler to avoid nonexistent print fulfillment columns',
  );
}

async function testPrintQaFailedReturns404ForMissingOrder(): Promise<void> {
  const response = await handlePrintQaFailed(
    {
      orderId: 'W4-QA-FAIL-MISSING',
    },
    {
      getOrder: async () => null,
      updateOrderStatus: async () => {
        throw new Error('updateOrderStatus should not be called for missing orders');
      },
    },
  );

  assert(response.ok === false && response.status === 404, 'Expected missing order to return 404');
}

async function main(): Promise<void> {
  await testPrintQaFailedUsesOnlyRealOrderColumns();
  await testPrintQaFailedReturns404ForMissingOrder();
  console.log('test-w4-print-qa-failed: ok');
}

main().catch((error) => {
  console.error('test-w4-print-qa-failed: failed');
  console.error(error);
  process.exit(1);
});
