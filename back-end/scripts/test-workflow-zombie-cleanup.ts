#!/usr/bin/env tsx

import type { WorkflowJobAttemptRecord } from '@/lib/workflow-jobs';
import {
  applyHistoricalWorkflowZombieCleanup,
  isHistoricalWorkflowZombieJob,
  validateHistoricalWorkflowZombieCandidate,
} from '@/lib/workflow-zombie-cleanup';

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

function testHistoricalCandidateDetection(): void {
  assert(
    isHistoricalWorkflowZombieJob({
      id: 6,
      stage: '2a',
      job_type: 'w2a-single-pose',
      order_id: 'W2A-TOP-PROD-20260325061146',
      root_order_id: 'W2A-TOP-PROD-20260325061146',
      status: 'running',
      attempt_count: 1,
      created_at: '2026-03-25T06:12:25.446640Z',
      updated_at: '2026-03-25T06:12:28.659703Z',
    }),
    'historical W2A proof row should be recognized as a zombie candidate',
  );

  assert(
    !isHistoricalWorkflowZombieJob({
      id: 160,
      stage: '4',
      job_type: 'w4-print-fulfillment',
      order_id: '441-0329202-9000001',
      root_order_id: '441-0324-161613',
      status: 'succeeded',
      attempt_count: 1,
      created_at: '2026-03-29T18:52:43.803468Z',
      updated_at: '2026-03-29T19:07:52.069000Z',
    }),
    'non-W2 terminal jobs should not be treated as cleanup candidates',
  );
}

function testHistoricalCandidateValidation(): void {
  const w2aValidation = validateHistoricalWorkflowZombieCandidate(
    {
      id: 6,
      stage: '2a',
      job_type: 'w2a-single-pose',
      order_id: 'W2A-TOP-PROD-20260325061146',
      root_order_id: 'W2A-TOP-PROD-20260325061146',
      status: 'running',
      attempt_count: 1,
      created_at: '2026-03-25T06:12:25.446640Z',
      updated_at: '2026-03-25T06:12:28.659703Z',
    },
    {
      id: 859,
      orderId: 'W2A-TOP-PROD-20260325061146',
      status: 'queued_for_processing',
      workflow_step: 'order_intake',
      execution_status: 'error',
      current_workflow: null,
      next_workflow: '2A',
      updated_at: '2026-03-25T06:50:13.269889Z',
    },
  );

  assertEqual(
    w2aValidation.safeToCleanup,
    true,
    'W2A candidate with reverted error state should be safe to cleanup',
  );

  const w2bValidation = validateHistoricalWorkflowZombieCandidate(
    {
      id: 4,
      stage: '2b',
      job_type: 'w2b-single-pose',
      order_id: 'W2B-TOP-PROD-20260325052836',
      root_order_id: 'W2B-TOP-PROD-20260325052836',
      status: 'polling',
      attempt_count: 1,
      created_at: '2026-03-25T05:28:40.368482Z',
      updated_at: '2026-03-25T05:28:56.018557Z',
    },
    {
      id: 857,
      orderId: 'W2B-TOP-PROD-20260325052836',
      status: 'pending_assembly',
      workflow_step: 'bria_processing_complete',
      execution_status: 'done',
      current_workflow: null,
      next_workflow: '2B',
      updated_at: '2026-03-25T05:29:22.373525Z',
    },
  );

  assertEqual(
    w2bValidation.safeToCleanup,
    true,
    'W2B candidate already converged to pending assembly should be safe to cleanup',
  );

  const unsafeValidation = validateHistoricalWorkflowZombieCandidate(
    {
      id: 14,
      stage: '2a',
      job_type: 'w2a-single-pose',
      order_id: 'W2A-TOP-PROD-20260325073007',
      root_order_id: 'W2A-TOP-PROD-20260325073007',
      status: 'running',
      attempt_count: 1,
      created_at: '2026-03-25T07:30:44.756583Z',
      updated_at: '2026-03-25T07:30:51.138384Z',
    },
    {
      id: 864,
      orderId: 'W2A-TOP-PROD-20260325073007',
      status: 'queued_for_processing',
      workflow_step: 'order_intake',
      execution_status: 'processing',
      current_workflow: '2A',
      next_workflow: '2A',
      updated_at: '2026-03-25T07:30:51.138384Z',
    },
  );

  assertEqual(
    unsafeValidation.safeToCleanup,
    false,
    'W2A candidate still in active workflow state should be unsafe to cleanup',
  );
}

async function testCleanupApplyFlow(): Promise<void> {
  const calls: Array<{ fn: string; payload: Record<string, unknown> }> = [];
  const activeAttempt: WorkflowJobAttemptRecord = {
    id: 9001,
    job_id: 6,
    attempt: 1,
    status: 'running',
    worker_kind: 'n8n',
    lease_owner: 'worker-1',
    started_at: '2026-03-25T06:12:28.554Z',
    ended_at: null,
    duration_ms: null,
    error_message: null,
    error_details: null,
    provider_request_id: null,
    provider_status_url: null,
    created_at: '2026-03-25T06:12:28.554Z',
    updated_at: '2026-03-25T06:12:28.554Z',
  };

  const result = await applyHistoricalWorkflowZombieCleanup(
    {
      jobIds: [6, 12],
      actor: 'test-operator',
      now: '2026-03-31T05:00:00.000Z',
      inspector: async () => [
        {
          jobId: 6,
          stage: '2A',
          jobType: 'w2a-single-pose',
          orderId: 'W2A-TOP-PROD-20260325061146',
          rootOrderId: 'W2A-TOP-PROD-20260325061146',
          status: 'running',
          attemptCount: 1,
          createdAt: '2026-03-25T06:12:25.446640Z',
          updatedAt: '2026-03-25T06:12:28.659703Z',
          knownInitialTarget: true,
          safeToCleanup: true,
          validationReason: 'w2a_order_already_reverted_to_error_state',
          orderState: {
            orderId: 'W2A-TOP-PROD-20260325061146',
            status: 'queued_for_processing',
            workflowStep: 'order_intake',
            executionStatus: 'error',
            currentWorkflow: null,
            nextWorkflow: '2A',
            updatedAt: '2026-03-25T06:50:13.269889Z',
          },
        },
        {
          jobId: 12,
          stage: '2A',
          jobType: 'w2a-single-pose',
          orderId: 'W2A-TOP-PROD-20260325063259',
          rootOrderId: 'W2A-TOP-PROD-20260325063259',
          status: 'running',
          attemptCount: 1,
          createdAt: '2026-03-25T06:33:38.071169Z',
          updatedAt: '2026-03-25T06:33:39.516785Z',
          knownInitialTarget: true,
          safeToCleanup: false,
          validationReason: 'w2a_order_state_does_not_match_expected_historical_error_invariants',
          orderState: null,
        },
      ],
      repository: {
        getLatestWorkflowJobAttemptForJob: async (jobId: number) => {
          calls.push({ fn: 'getLatestWorkflowJobAttemptForJob', payload: { jobId } });
          return jobId === 6 ? activeAttempt : null;
        },
        updateWorkflowJobAttempt: async (attemptId, patch) => {
          calls.push({ fn: 'updateWorkflowJobAttempt', payload: { attemptId, patch } });
          return activeAttempt;
        },
        cancelWorkflowJob: async (jobId: number, reason: string) => {
          calls.push({ fn: 'cancelWorkflowJob', payload: { jobId, reason } });
          return null;
        },
        appendWorkflowJobEvent: async (input) => {
          calls.push({ fn: 'appendWorkflowJobEvent', payload: input as Record<string, unknown> });
          return null;
        },
        updateWorkflowJobResultSnapshot: async (jobId: number, patch: Record<string, unknown>) => {
          calls.push({ fn: 'updateWorkflowJobResultSnapshot', payload: { jobId, patch } });
          return null;
        },
      },
    },
    {} as never,
  );

  assertEqual(result.cleaned.length, 1, 'cleanup should only mutate safe candidates');
  assertEqual(result.skipped.length, 1, 'cleanup should skip unsafe candidates');
  assert(
    calls.some((entry) => entry.fn === 'updateWorkflowJobAttempt'),
    'cleanup should cancel an active attempt before canceling the job',
  );
  assert(
    calls.some((entry) => entry.fn === 'cancelWorkflowJob'),
    'cleanup should cancel the workflow job via repository primitive',
  );
  const eventCall = calls.find((entry) => entry.fn === 'appendWorkflowJobEvent');
  assert(eventCall, 'cleanup should append an audit event');
  assertEqual(
    eventCall?.payload.eventType as string,
    'historical-cleanup-canceled',
    'cleanup should append the historical cleanup event',
  );
}

async function testCleanupRequiresExplicitJobIds(): Promise<void> {
  let threw = false;

  try {
    await applyHistoricalWorkflowZombieCleanup(
      {
        jobIds: [],
        actor: 'test-operator',
      },
      {} as never,
    );
  } catch (error) {
    threw = error instanceof Error && error.message.includes('explicit job ids');
  }

  assert(threw, 'cleanup should require explicit job ids in apply mode');
}

async function main(): Promise<void> {
  testHistoricalCandidateDetection();
  testHistoricalCandidateValidation();
  await testCleanupApplyFlow();
  await testCleanupRequiresExplicitJobIds();
  console.log('test-workflow-zombie-cleanup: ok');
}

main().catch((error) => {
  console.error('[test-workflow-zombie-cleanup] failure:', error);
  process.exit(1);
});
