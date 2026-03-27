#!/usr/bin/env tsx

import type { WorkflowJobRecord } from '@/lib/workflow-jobs';
import {
  buildW4RecoveryCandidate,
  buildW4RecoveryReplayPayload,
  type W4RecoveryOrderRow,
} from '@/lib/w4-recovery';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createOrderRow(overrides: Partial<W4RecoveryOrderRow> = {}): W4RecoveryOrderRow {
  return {
    id: 401,
    orderId: 'W4-SANDBOX-PROOF-401',
    order_id: 'W4-SANDBOX-PROOF-401',
    root_order_id: '111-2222222-3333333',
    amazon_order_id: '111-2222222-3333333',
    workflow_step: 'print_fulfillment',
    execution_status: 'error',
    current_workflow: '4',
    started_at: '2026-03-27T11:00:00.000Z',
    updated_at: '2026-03-27T11:10:00.000Z',
    status: 'pending_print',
    next_workflow: '4',
    lulu_job_id: null,
    lulu_status: null,
    print_submitted_at: null,
    error_message: null,
    ...overrides,
  };
}

function createJob(
  status: WorkflowJobRecord['status'],
  overrides: Partial<WorkflowJobRecord> = {},
): WorkflowJobRecord {
  return {
    id: 900,
    job_type: 'w4-print-fulfillment',
    stage: '4',
    order_row_id: 401,
    order_id: 'W4-SANDBOX-PROOF-401',
    root_order_id: '111-2222222-3333333',
    amazon_order_id: '111-2222222-3333333',
    book_id: 'book-mvp-simple-adventure',
    logical_key: 'print:current',
    idempotency_key: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-401:print:current',
    status,
    lease_owner: 'api:internal/w4/build-print-input',
    lease_expires_at: null,
    attempt_count: 1,
    max_attempts: 3,
    next_retry_at: null,
    external_provider: 'pdfmonkey',
    external_request_id: null,
    external_status_url: null,
    input_snapshot: {},
    normalized_input_snapshot: {},
    result_snapshot: {},
    last_error:
      status === 'failed'
        ? {
            message: 'Renderer rejected cover PDF',
          }
        : null,
    queued_at: '2026-03-27T11:00:00.000Z',
    claimed_at: '2026-03-27T11:00:05.000Z',
    started_at: '2026-03-27T11:00:10.000Z',
    polling_at: null,
    completed_at: status === 'succeeded' ? '2026-03-27T11:05:00.000Z' : null,
    failed_at: status === 'failed' ? '2026-03-27T11:05:00.000Z' : null,
    dead_lettered_at: status === 'dead_lettered' ? '2026-03-27T11:05:00.000Z' : null,
    canceled_at: status === 'canceled' ? '2026-03-27T11:05:00.000Z' : null,
    created_at: '2026-03-27T11:00:00.000Z',
    updated_at:
      overrides.updated_at ??
      (status === 'running'
        ? '2026-03-27T11:40:00.000Z'
        : '2026-03-27T11:05:00.000Z'),
    ...overrides,
  };
}

async function testFailedSandboxOrderIsReplayReady(): Promise<void> {
  const candidate = buildW4RecoveryCandidate(createOrderRow(), [createJob('failed')], {
    staleMinutes: 30,
  });

  assert(
    candidate.recommendedAction === 'replay' &&
      candidate.hasRealSubmission === false &&
      candidate.latestErrorMessage === 'Renderer rejected cover PDF',
    'Expected failed sandbox-safe W4 jobs to recommend replay and carry the latest error message',
  );
}

async function testRealLuluSignalBlocksReplayRecommendation(): Promise<void> {
  const candidate = buildW4RecoveryCandidate(
    createOrderRow({
      lulu_job_id: 'prod-job-401',
      lulu_status: 'SUBMITTED',
      print_submitted_at: '2026-03-27T11:06:00.000Z',
    }),
    [createJob('failed')],
    {
      staleMinutes: 30,
    },
  );

  assert(
    candidate.recommendedAction === 'inspect' && candidate.hasRealSubmission === true,
    'Expected W4 recovery to block replay when real Lulu submission state is already present',
  );
}

async function testRunningJobBecomesInspectOnlyWhenStale(): Promise<void> {
  const candidate = buildW4RecoveryCandidate(
    createOrderRow({
      updated_at: '2026-03-27T11:40:00.000Z',
    }),
    [
      createJob('running', {
        updated_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      }),
    ],
    {
      staleMinutes: 30,
    },
  );

  assert(
    candidate.recommendedAction === 'inspect' &&
      candidate.recommendedReason === 'w4_job_still_active_but_stale',
    'Expected stale active W4 jobs to require inspection rather than automatic replay',
  );
}

async function testSucceededSandboxJobIsNotARecoveryCandidate(): Promise<void> {
  const candidate = buildW4RecoveryCandidate(createOrderRow(), [createJob('succeeded')], {
    staleMinutes: 30,
  });

  assert(
    candidate.recommendedAction === 'none' &&
      candidate.recommendedReason === 'latest_w4_job_succeeded',
    'Expected successful sandbox W4 completions to stay out of the recovery queue',
  );
}

async function testReplayPayloadStaysSandboxSafe(): Promise<void> {
  const payload = buildW4RecoveryReplayPayload('W4-SANDBOX-PROOF-401', {
    claimedAt: '2026-03-27T18:15:00.000Z',
    adminBaseUrl: 'https://admin.littleherolabs.com',
  });

  assert(
    payload.force === true &&
      payload.claimedAt === '2026-03-27T18:15:00.000Z' &&
      payload.backendUrl === 'https://admin.littleherolabs.com' &&
      payload.recovery.sandboxOnly === true,
    'Expected W4 recovery replay payloads to force a fresh run while staying pinned to the sandbox-only admin path',
  );
}

async function main(): Promise<void> {
  await testFailedSandboxOrderIsReplayReady();
  await testRealLuluSignalBlocksReplayRecommendation();
  await testRunningJobBecomesInspectOnlyWhenStale();
  await testSucceededSandboxJobIsNotARecoveryCandidate();
  await testReplayPayloadStaysSandboxSafe();
  console.log('W4 recovery tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
