#!/usr/bin/env tsx

import type { WorkflowJobRecord } from '@/lib/workflow-jobs';
import {
  buildW41RecoveryCandidate,
  buildW41RecoveryReplayPayload,
  type W41RecoveryOrderRow,
} from '@/lib/w41-recovery';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createGroupRows(
  overrides: Partial<W41RecoveryOrderRow> = {},
): W41RecoveryOrderRow[] {
  return [
    {
      id: 501,
      orderId: 'W41-SIBLING-PROOF-501-item-1',
      order_id: 'W41-SIBLING-PROOF-501-item-1',
      root_order_id: 'W41-SIBLING-PROOF-501',
      amazon_order_id: 'W41-SIBLING-PROOF-501',
      workflow_step: 'print_fulfillment',
      execution_status: 'error',
      current_workflow: '4.1',
      started_at: '2026-03-27T13:00:00.000Z',
      updated_at: '2026-03-27T13:10:00.000Z',
      status: 'pending_print',
      next_workflow: '4.1',
      lulu_job_id: null,
      lulu_status: null,
      print_submitted_at: null,
      error_message: null,
      product_info: {},
      character_specs: { childName: 'Avery' },
      character_hash: 'char-501-a',
      manifest3Key: 'book/orders/W41-SIBLING-PROOF-501-item-1/manifests/3-manifest.json',
      ...overrides,
    },
    {
      id: 502,
      orderId: 'W41-SIBLING-PROOF-501-item-2',
      order_id: 'W41-SIBLING-PROOF-501-item-2',
      root_order_id: 'W41-SIBLING-PROOF-501',
      amazon_order_id: 'W41-SIBLING-PROOF-501',
      workflow_step: 'print_fulfillment',
      execution_status: 'error',
      current_workflow: '4.1',
      started_at: '2026-03-27T13:00:00.000Z',
      updated_at: '2026-03-27T13:10:00.000Z',
      status: 'pending_print',
      next_workflow: '4.1',
      lulu_job_id: null,
      lulu_status: null,
      print_submitted_at: null,
      error_message: null,
      product_info: {},
      character_specs: { childName: 'Blake' },
      character_hash: 'char-501-b',
      manifest3Key: 'book/orders/W41-SIBLING-PROOF-501-item-2/manifests/3-manifest.json',
      ...overrides,
    },
  ];
}

function createJob(
  status: WorkflowJobRecord['status'],
  overrides: Partial<WorkflowJobRecord> = {},
): WorkflowJobRecord {
  return {
    id: 950,
    job_type: 'w4-sibling-aggregation',
    stage: '4.1',
    order_row_id: 501,
    order_id: 'W41-SIBLING-PROOF-501',
    root_order_id: 'W41-SIBLING-PROOF-501',
    amazon_order_id: 'W41-SIBLING-PROOF-501',
    book_id: 'book-mvp-simple-adventure',
    logical_key: 'sibling-aggregation:current',
    idempotency_key: 'wf:4.1:w4-sibling-aggregation:W41-SIBLING-PROOF-501:sibling-aggregation:current',
    status,
    lease_owner: 'api:internal/w4/build-sibling-print-input',
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
            message: 'Sibling cover QA failed',
          }
        : null,
    queued_at: '2026-03-27T13:00:00.000Z',
    claimed_at: '2026-03-27T13:00:05.000Z',
    started_at: '2026-03-27T13:00:10.000Z',
    polling_at: null,
    completed_at: status === 'succeeded' ? '2026-03-27T13:05:00.000Z' : null,
    failed_at: status === 'failed' ? '2026-03-27T13:05:00.000Z' : null,
    dead_lettered_at: status === 'dead_lettered' ? '2026-03-27T13:05:00.000Z' : null,
    canceled_at: status === 'canceled' ? '2026-03-27T13:05:00.000Z' : null,
    created_at: '2026-03-27T13:00:00.000Z',
    updated_at:
      overrides.updated_at ??
      (status === 'running'
        ? '2026-03-27T13:40:00.000Z'
        : '2026-03-27T13:05:00.000Z'),
    ...overrides,
  };
}

async function testFailedSandboxGroupIsReplayReady(): Promise<void> {
  const candidate = buildW41RecoveryCandidate(
    'W41-SIBLING-PROOF-501',
    createGroupRows(),
    [createJob('failed')],
    {
      staleMinutes: 30,
    },
  );

  assert(
    candidate.recommendedAction === 'replay' &&
      candidate.hasRealSubmission === false &&
      candidate.siblingCount === 2 &&
      candidate.latestErrorMessage === 'Sibling cover QA failed',
    'Expected failed sandbox-safe W4.1 jobs to recommend replay and carry the latest error message',
  );
}

async function testRealLuluSignalBlocksReplayRecommendation(): Promise<void> {
  const candidate = buildW41RecoveryCandidate(
    'W41-SIBLING-PROOF-501',
    createGroupRows({
      lulu_job_id: 'prod-job-501',
      lulu_status: 'SUBMITTED',
      print_submitted_at: '2026-03-27T13:06:00.000Z',
    }),
    [createJob('failed')],
    {
      staleMinutes: 30,
    },
  );

  assert(
    candidate.recommendedAction === 'inspect' && candidate.hasRealSubmission === true,
    'Expected W4.1 recovery to block replay when any sibling already has real Lulu submission state',
  );
}

async function testIncompleteGroupRequiresInspection(): Promise<void> {
  const candidate = buildW41RecoveryCandidate(
    'W41-SIBLING-PROOF-501',
    [createGroupRows()[0]],
    [createJob('failed')],
    {
      staleMinutes: 30,
    },
  );

  assert(
    candidate.recommendedAction === 'inspect' &&
      candidate.recommendedReason === 'w41_group_incomplete',
    'Expected incomplete sibling groups to require inspection rather than replay',
  );
}

async function testReplayPayloadStaysSandboxSafe(): Promise<void> {
  const payload = buildW41RecoveryReplayPayload(
    'W41-SIBLING-PROOF-501',
    createGroupRows() as Array<Record<string, unknown>>,
    {
      claimedAt: '2026-03-27T18:45:00.000Z',
      adminBaseUrl: 'https://admin.littleherolabs.com',
    },
  );

  assert(
    payload.force === true &&
      payload.claimedAt === '2026-03-27T18:45:00.000Z' &&
      payload.backendUrl === 'https://admin.littleherolabs.com' &&
      payload.recovery.sandboxOnly === true &&
      payload.siblingGroup.length === 2,
    'Expected W4.1 recovery replay payloads to stay pinned to the sandbox-only admin path and include siblingGroup data',
  );
}

async function main(): Promise<void> {
  await testFailedSandboxGroupIsReplayReady();
  await testRealLuluSignalBlocksReplayRecommendation();
  await testIncompleteGroupRequiresInspection();
  await testReplayPayloadStaysSandboxSafe();
  console.log('W4.1 recovery tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
