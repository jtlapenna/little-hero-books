#!/usr/bin/env tsx

import { handlePrintSubmitted } from '@/app/api/webhooks/print-submitted/route';

type JsonRecord = Record<string, unknown>;

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

async function testSandboxCompletionStaysNonProduction(): Promise<void> {
  const calls: Array<{ fn: string; payload?: JsonRecord }> = [];

  const response = await handlePrintSubmitted(
    {
      orderId: 'W4-SANDBOX-PROOF-009',
      workflowJobId: 509,
      workflowAttemptId: 609,
      workflowJobIdempotencyKey: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-009:print:test',
      submitMode: 'sandbox',
      luluJobId: 'sandbox-job-009',
      luluStatus: {
        name: 'CREATED',
        message: 'Sandbox print job created',
        changed: '2026-03-27T16:02:00.000Z',
      },
    },
    {
      getOrder: async () => ({
        orderId: 'W4-SANDBOX-PROOF-009',
        platform: 'd2c',
        customer_email: 'parent@example.com',
      }),
      updateOrderStatus: async () => {
        calls.push({ fn: 'updateOrderStatus' });
        return null;
      },
      getActivePreviewToken: async () => {
        calls.push({ fn: 'getActivePreviewToken' });
        return null;
      },
      getPreviewTokenForOrderLink: async () => {
        calls.push({ fn: 'getPreviewTokenForOrderLink' });
        return null;
      },
      sendAmazonPrintSubmittedMessage: async () => {
        calls.push({ fn: 'sendAmazonPrintSubmittedMessage' });
        return { success: true };
      },
      sendD2CPrintSubmittedEmail: async () => {
        calls.push({ fn: 'sendD2CPrintSubmittedEmail' });
        return { success: true };
      },
      recordWorkflowJobEvent: async (body) => {
        calls.push({ fn: 'recordWorkflowJobEvent', payload: body });
        return {
          success: true,
          jobId: 509,
          attemptId: 609,
          currentStatus: 'succeeded',
          __workflowJobEvent: {
            eventType: 'completed',
            recordedAt: '2026-03-27T09:10:00.000Z',
            currentStatus: 'succeeded',
          },
        };
      },
      completeW4PrintJobForOrder: async () => {
        calls.push({ fn: 'completeW4PrintJobForOrder' });
        return { job: null, attempt: null };
      },
      completeW4SiblingJobForGroup: async () => {
        calls.push({ fn: 'completeW4SiblingJobForGroup' });
        return { job: null, attempt: null };
      },
    },
  );

  assert(response.ok === true && response.status === 200, 'Expected sandbox print-submitted handling to succeed');
  assert(
    (response.body as JsonRecord).success === true &&
      (response.body as JsonRecord).skipped === true &&
      (response.body as JsonRecord).nonProduction === true &&
      (response.body as JsonRecord).submitMode === 'sandbox',
    'Expected sandbox print-submitted handling to return a non-production success payload',
  );
  assert(
    calls.some((entry) => entry.fn === 'recordWorkflowJobEvent') &&
      !calls.some((entry) => entry.fn === 'updateOrderStatus') &&
      !calls.some((entry) => entry.fn === 'sendD2CPrintSubmittedEmail') &&
      !calls.some((entry) => entry.fn === 'sendAmazonPrintSubmittedMessage'),
    'Expected sandbox print-submitted handling to mark the workflow job complete without lifecycle updates or notifications',
  );

  const workflowJobEvent = calls.find((entry) => entry.fn === 'recordWorkflowJobEvent')?.payload ?? null;
  assert(
    workflowJobEvent?.resultSnapshot &&
      typeof workflowJobEvent.resultSnapshot === 'object' &&
      (workflowJobEvent.resultSnapshot as JsonRecord).luluStatus === 'CREATED' &&
      typeof (workflowJobEvent.resultSnapshot as JsonRecord).luluStatusDetail === 'object',
    'Expected sandbox print-submitted handling to normalize structured Lulu status and preserve the raw detail in workflow-job telemetry',
  );
}

async function testProductionD2CCompletionStillNotifies(): Promise<void> {
  const calls: Array<{ fn: string; payload?: JsonRecord }> = [];
  const originalNotificationsFlag = process.env.AMAZON_PRINT_SUBMITTED_NOTIFICATIONS_ENABLED;

  try {
    process.env.AMAZON_PRINT_SUBMITTED_NOTIFICATIONS_ENABLED = 'false';

    const response = await handlePrintSubmitted(
      {
        orderId: 'W4-PROD-PROOF-010',
        workflowJobId: 510,
        workflowAttemptId: 610,
        workflowJobIdempotencyKey: 'wf:4:w4-print-fulfillment:W4-PROD-PROOF-010:print:test',
        submitMode: 'production',
        luluJobId: 'prod-job-010',
        luluStatus: 'SUBMITTED',
      },
      {
        getOrder: async () => ({
          orderId: 'W4-PROD-PROOF-010',
          platform: 'd2c',
          customer_email: 'parent@example.com',
          character_specs: {
            childName: 'Ada',
          },
        }),
        updateOrderStatus: async (_orderId, updates) => {
          calls.push({ fn: 'updateOrderStatus', payload: updates as JsonRecord });
          return null;
        },
        getActivePreviewToken: async () => ({
          token: 'preview-token-010',
        }),
        getPreviewTokenForOrderLink: async () => null,
        sendAmazonPrintSubmittedMessage: async () => {
          calls.push({ fn: 'sendAmazonPrintSubmittedMessage' });
          return { success: true };
        },
        sendD2CPrintSubmittedEmail: async (payload) => {
          calls.push({ fn: 'sendD2CPrintSubmittedEmail', payload: payload as unknown as JsonRecord });
          return {
            success: true,
            messageId: 'email-010',
          };
        },
        recordWorkflowJobEvent: async (body) => {
          calls.push({ fn: 'recordWorkflowJobEvent', payload: body });
          return {
            success: true,
            jobId: 510,
            attemptId: 610,
            currentStatus: 'succeeded',
            __workflowJobEvent: {
              eventType: 'completed',
              recordedAt: '2026-03-27T09:11:00.000Z',
              currentStatus: 'succeeded',
            },
          };
        },
        completeW4PrintJobForOrder: async () => {
          calls.push({ fn: 'completeW4PrintJobForOrder' });
          return { job: null, attempt: null };
        },
        completeW4SiblingJobForGroup: async () => {
          calls.push({ fn: 'completeW4SiblingJobForGroup' });
          return { job: null, attempt: null };
        },
      },
    );

    assert(response.ok === true && response.status === 200, 'Expected production D2C print-submitted handling to succeed');
    assert(
      (response.body as JsonRecord).success === true &&
        (response.body as JsonRecord).channel === 'email' &&
        (response.body as JsonRecord).messageId === 'email-010',
      'Expected production D2C print-submitted handling to preserve the email notification behavior',
    );
    assert(
      calls.some((entry) => entry.fn === 'updateOrderStatus') &&
        calls.some((entry) => entry.fn === 'sendD2CPrintSubmittedEmail') &&
        calls.some((entry) => entry.fn === 'recordWorkflowJobEvent') &&
        !calls.some((entry) => entry.fn === 'sendAmazonPrintSubmittedMessage'),
      'Expected production D2C print-submitted handling to update lifecycle state, notify by email, and complete the workflow job',
    );
    const lifecycleUpdate = calls.find((entry) => entry.fn === 'updateOrderStatus')?.payload ?? null;
    assert(
      lifecycleUpdate?.lulu_job_id === 'prod-job-010' &&
        lifecycleUpdate?.lulu_status === 'SUBMITTED',
      'Expected production print-submitted handling to persist Lulu job identity and status alongside the lifecycle update',
    );
  } finally {
    if (originalNotificationsFlag === undefined) {
      delete process.env.AMAZON_PRINT_SUBMITTED_NOTIFICATIONS_ENABLED;
    } else {
      process.env.AMAZON_PRINT_SUBMITTED_NOTIFICATIONS_ENABLED = originalNotificationsFlag;
    }
  }
}

async function testSandboxSiblingCompletionMarksSharedWorkflowOnce(): Promise<void> {
  const calls: Array<{ fn: string; payload?: JsonRecord }> = [];

  const response = await handlePrintSubmitted(
    {
      orderIds: ['W4-SIBLING-PROOF-011-item-1', 'W4-SIBLING-PROOF-011-item-2'],
      workflowJobId: 511,
      workflowAttemptId: 611,
      workflowJobIdempotencyKey: 'wf:4.1:w4-sibling-aggregation:W4-SIBLING-PROOF-011:sibling-aggregation:test',
      submitMode: 'sandbox',
      luluJobId: 'sandbox-sibling-job-011',
      luluStatus: {
        name: 'CREATED',
        message: 'Sandbox sibling print job created',
      },
    },
    {
      getOrder: async (orderId) => ({
        orderId,
        platform: 'd2c',
        customer_email: 'parent@example.com',
      }),
      updateOrderStatus: async () => {
        calls.push({ fn: 'updateOrderStatus' });
        return null;
      },
      getActivePreviewToken: async () => {
        calls.push({ fn: 'getActivePreviewToken' });
        return null;
      },
      getPreviewTokenForOrderLink: async () => {
        calls.push({ fn: 'getPreviewTokenForOrderLink' });
        return null;
      },
      sendAmazonPrintSubmittedMessage: async () => {
        calls.push({ fn: 'sendAmazonPrintSubmittedMessage' });
        return { success: true };
      },
      sendD2CPrintSubmittedEmail: async () => {
        calls.push({ fn: 'sendD2CPrintSubmittedEmail' });
        return { success: true };
      },
      recordWorkflowJobEvent: async (body) => {
        calls.push({ fn: 'recordWorkflowJobEvent', payload: body });
        return {
          success: true,
          jobId: 511,
          attemptId: 611,
          currentStatus: 'succeeded',
          __workflowJobEvent: {
            eventType: 'completed',
            recordedAt: '2026-03-27T09:12:00.000Z',
            currentStatus: 'succeeded',
          },
        };
      },
      completeW4PrintJobForOrder: async () => {
        calls.push({ fn: 'completeW4PrintJobForOrder' });
        return { job: null, attempt: null };
      },
      completeW4SiblingJobForGroup: async () => {
        calls.push({ fn: 'completeW4SiblingJobForGroup' });
        return { job: null, attempt: null };
      },
    },
  );

  assert(response.ok === true && response.status === 200, 'Expected sandbox sibling print-submitted handling to succeed');
  assert(
    (response.body as JsonRecord).success === true &&
      Array.isArray((response.body as JsonRecord).results),
    'Expected sandbox sibling print-submitted handling to return grouped success results',
  );
  assertEqual(
    calls.filter((entry) => entry.fn === 'recordWorkflowJobEvent').length,
    1,
    'Expected sandbox sibling print-submitted handling to record the shared workflow job completion only once',
  );
  assert(
    !calls.some((entry) => entry.fn === 'updateOrderStatus') &&
      !calls.some((entry) => entry.fn === 'sendD2CPrintSubmittedEmail') &&
      !calls.some((entry) => entry.fn === 'sendAmazonPrintSubmittedMessage'),
    'Expected sandbox sibling print-submitted handling to avoid lifecycle updates and notifications',
  );
}

async function testSiblingFallbackCompletesSharedGroupOnceWithoutWorkflowMetadata(): Promise<void> {
  const calls: Array<{ fn: string; payload?: JsonRecord }> = [];

  const response = await handlePrintSubmitted(
    {
      rootGroupId: 'W4-SIBLING-PROOF-012',
      orderIds: ['W4-SIBLING-PROOF-012-item-1', 'W4-SIBLING-PROOF-012-item-2'],
      submitMode: 'sandbox',
      luluJobId: 'sandbox-sibling-job-012',
      luluStatus: {
        name: 'CREATED',
        message: 'Sandbox grouped job created',
      },
    },
    {
      getOrder: async (orderId) => ({
        orderId,
        platform: 'd2c',
        customer_email: 'parent@example.com',
      }),
      updateOrderStatus: async () => {
        calls.push({ fn: 'updateOrderStatus' });
        return null;
      },
      getActivePreviewToken: async () => null,
      getPreviewTokenForOrderLink: async () => null,
      sendAmazonPrintSubmittedMessage: async () => {
        calls.push({ fn: 'sendAmazonPrintSubmittedMessage' });
        return { success: true };
      },
      sendD2CPrintSubmittedEmail: async () => {
        calls.push({ fn: 'sendD2CPrintSubmittedEmail' });
        return { success: true };
      },
      recordWorkflowJobEvent: async () => {
        calls.push({ fn: 'recordWorkflowJobEvent' });
        return {
          success: true,
          jobId: 0,
          attemptId: null,
          currentStatus: 'succeeded',
        };
      },
      completeW4PrintJobForOrder: async () => {
        calls.push({ fn: 'completeW4PrintJobForOrder' });
        return { job: null, attempt: null };
      },
      completeW4SiblingJobForGroup: async (payload) => {
        calls.push({ fn: 'completeW4SiblingJobForGroup', payload: payload as unknown as JsonRecord });
        return { job: null, attempt: null };
      },
    },
  );

  assert(response.ok === true && response.status === 200, 'Expected sibling fallback handling to succeed');
  assertEqual(
    calls.filter((entry) => entry.fn === 'completeW4SiblingJobForGroup').length,
    1,
    'Expected sibling fallback handling to mark the shared W4.1 job complete only once',
  );
  assert(
    !calls.some((entry) => entry.fn === 'completeW4PrintJobForOrder') &&
      !calls.some((entry) => entry.fn === 'recordWorkflowJobEvent'),
    'Expected sibling fallback handling to avoid the single-order completion path when rootGroupId is available',
  );
  const siblingCompletionPayload =
    calls.find((entry) => entry.fn === 'completeW4SiblingJobForGroup')?.payload ?? null;
  assert(
    siblingCompletionPayload?.rootGroupId === 'W4-SIBLING-PROOF-012' &&
      Array.isArray(siblingCompletionPayload.orderIds) &&
      siblingCompletionPayload.orderIds.length === 2,
    'Expected sibling fallback handling to carry rootGroupId and grouped orderIds into the shared completion helper',
  );
  assert(
    siblingCompletionPayload?.luluStatus === 'CREATED' &&
      siblingCompletionPayload?.luluStatusDetail &&
      typeof siblingCompletionPayload.luluStatusDetail === 'object',
    'Expected sibling fallback handling to normalize structured Lulu status and preserve its detail for shared completion telemetry',
  );
}

async function main(): Promise<void> {
  await testSandboxCompletionStaysNonProduction();
  await testProductionD2CCompletionStillNotifies();
  await testSandboxSiblingCompletionMarksSharedWorkflowOnce();
  await testSiblingFallbackCompletesSharedGroupOnceWithoutWorkflowMetadata();
  console.log('W4 print-submitted tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
