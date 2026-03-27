#!/usr/bin/env tsx

import {
  claimAndStartW3AssemblyJob,
  claimAndStartW4PrintJob,
  claimAndStartW4SiblingJob,
  buildW2APoseWorkflowReplay,
  buildWorkflowJobEventInsertRow,
  buildWorkflowJobIdempotencyKey,
  buildWorkflowJobInsertRow,
  buildWorkflowJobLeaseExpiry,
  buildWorkflowJobLogicalKey,
  buildWorkflowJobReplayPayload,
  canClaimWorkflowJob,
  claimAndStartW2APoseJob,
  completeW3AssemblyJobForOrder,
  completeW4PrintJobForOrder,
  completeW4SiblingJobForGroup,
  computeWorkflowJobNextRetryAt,
  computeWorkflowJobRetryDelayMs,
  hasWorkflowJobLeaseExpired,
  isWorkflowJobRetryableError,
  shouldWorkflowJobDeadLetter,
  summarizeWorkflowJobError,
} from '@/lib/workflow-jobs';
import { recordWorkflowJobEventResponse } from '@/app/api/internal/workflow-jobs/log-event/route';
import type { WorkflowJobAttemptRecord, WorkflowJobRecord } from '@/lib/workflow-jobs';

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

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`${message}: expected ${right}, received ${left}`);
  }
}

function testIdempotencyKeyStability() {
  const keyA = buildWorkflowJobIdempotencyKey({
    jobType: 'w2a-pose',
    stage: '2a',
    orderId: ' 112-7311035-1437035 ',
    bookId: 'book-mvp-simple-adventure',
    logicalKey: 'pose-07',
  });
  const keyB = buildWorkflowJobIdempotencyKey({
    jobType: 'w2a-pose',
    stage: '2a',
    orderId: '112-7311035-1437035',
    bookId: 'book-mvp-simple-adventure',
    logicalKey: 'pose-07',
  });
  const keyC = buildWorkflowJobIdempotencyKey({
    jobType: 'w2a-pose',
    stage: '2a',
    orderId: '112-7311035-1437035',
    bookId: 'book-mvp-simple-adventure',
    logicalKey: 'pose-08',
  });

  assertEqual(keyA, keyB, 'workflow job idempotency key should ignore surrounding whitespace');
  assert(keyA !== keyC, 'workflow job idempotency key should change when logical key changes');
  assertEqual(
    buildWorkflowJobLogicalKey(' pose-07 ', null, 'child-1 '),
    'pose-07:child-1',
    'workflow job logical key should normalize and join parts',
  );
}

function testUpsertRowNormalization() {
  const row = buildWorkflowJobInsertRow({
    jobType: 'w2b-remove-bg',
    stage: '2b',
    orderId: ' 112-7311035-1437035 ',
    rootOrderId: ' 112-7311035-1437035 ',
    amazonOrderId: ' 112-7311035-1437035 ',
    bookId: ' book-mvp-simple-adventure ',
    logicalKey: ' pose-11 ',
    maxAttempts: 7,
    inputSnapshot: { pose: 11 },
    normalizedInputSnapshot: { poseKey: 'pose-11' },
  });

  assertEqual(row.job_type, 'w2b-remove-bg', 'upsert row should preserve job type');
  assertEqual(row.stage, '2b', 'upsert row should preserve stage');
  assertEqual(row.order_id, '112-7311035-1437035', 'upsert row should trim order id');
  assertEqual(row.logical_key, 'pose-11', 'upsert row should normalize logical key');
  assertEqual(row.status, 'queued', 'upsert row should default status to queued');
  assertEqual(row.max_attempts, 7, 'upsert row should keep explicit max attempts');
  assertEqual(row.attempt_count, 0, 'upsert row should start attempt count at zero');
  assertDeepEqual(
    row.normalized_input_snapshot,
    { poseKey: 'pose-11' },
    'upsert row should preserve normalized snapshot',
  );
  assert(typeof row.idempotency_key === 'string' && row.idempotency_key.length > 10, 'upsert row should derive an idempotency key');
}

function testClaimingAndLeaseRules() {
  const now = new Date('2026-03-24T20:00:00.000Z');
  const liveLease = buildWorkflowJobLeaseExpiry(now, 60_000);
  const expiredLease = '2026-03-24T19:58:00.000Z';

  assert(canClaimWorkflowJob({ status: 'queued', lease_expires_at: null }, now), 'queued job should be claimable');
  assert(!canClaimWorkflowJob({ status: 'claimed', lease_expires_at: liveLease }, now), 'claimed job with live lease should not be claimable');
  assert(canClaimWorkflowJob({ status: 'polling', lease_expires_at: expiredLease }, now), 'polling job with expired lease should be reclaimable');
  assert(!canClaimWorkflowJob({ status: 'succeeded', lease_expires_at: expiredLease }, now), 'terminal job should not be claimable');
  assert(!hasWorkflowJobLeaseExpired(liveLease, now), 'fresh lease should not be expired');
  assert(hasWorkflowJobLeaseExpired(expiredLease, now), 'stale lease should be expired');
}

function testRetryRules() {
  const now = new Date('2026-03-24T20:00:00.000Z');
  const firstDelay = computeWorkflowJobRetryDelayMs(1, { jitterRatio: 0 });
  const thirdDelay = computeWorkflowJobRetryDelayMs(3, { jitterRatio: 0 });
  const nextRetry = computeWorkflowJobNextRetryAt(2, now, { jitterRatio: 0 });

  assertEqual(firstDelay, 30_000, 'first retry delay should use base delay');
  assertEqual(thirdDelay, 120_000, 'third retry delay should exponentially back off');
  assertEqual(nextRetry, '2026-03-24T20:01:00.000Z', 'next retry timestamp should reflect computed delay');
  assert(shouldWorkflowJobDeadLetter(5, 5), 'attempt count at max should dead-letter');
  assert(!shouldWorkflowJobDeadLetter(4, 5), 'attempt count below max should not dead-letter');
  assert(isWorkflowJobRetryableError({ status: 503 }), '5xx error should be retryable');
  assert(!isWorkflowJobRetryableError({ status: 400 }), '4xx non-throttle error should not be retryable');
}

function testReplayAndEventShape() {
  const job: WorkflowJobRecord = {
    id: 42,
    job_type: 'w3-assembly',
    stage: '3',
    order_row_id: 99,
    order_id: '112-7311035-1437035',
    root_order_id: '112-7311035-1437035',
    amazon_order_id: '112-7311035-1437035',
    book_id: 'book-mvp-simple-adventure',
    logical_key: 'default',
    idempotency_key: 'wf:3:w3-assembly:112-7311035-1437035:default:abc123',
    status: 'failed',
    lease_owner: null,
    lease_expires_at: null,
    attempt_count: 2,
    max_attempts: 5,
    next_retry_at: '2026-03-24T21:00:00.000Z',
    external_provider: 'pdfmonkey',
    external_request_id: 'pdf-123',
    external_status_url: 'https://pdf.example/status/pdf-123',
    input_snapshot: { template: 'book-interior' },
    normalized_input_snapshot: { manifest3Key: 'book/orders/112/manifests/3-manifest.json' },
    result_snapshot: {},
    last_error: { message: 'provider timeout', retryable: true },
    queued_at: '2026-03-24T19:55:00.000Z',
    claimed_at: '2026-03-24T19:56:00.000Z',
    started_at: '2026-03-24T19:56:30.000Z',
    polling_at: '2026-03-24T19:57:00.000Z',
    completed_at: null,
    failed_at: '2026-03-24T19:58:00.000Z',
    dead_lettered_at: null,
    canceled_at: null,
    created_at: '2026-03-24T19:55:00.000Z',
    updated_at: '2026-03-24T19:58:00.000Z',
  };

  const replay = buildWorkflowJobReplayPayload(job);
  const eventRow = buildWorkflowJobEventInsertRow({
    jobId: job.id,
    attemptId: 7,
    eventType: 'provider-submitted',
    payload: { requestId: 'pdf-123' },
    createdAt: '2026-03-24T19:56:45.000Z',
  });
  const errorSummary = summarizeWorkflowJobError(new Error('boom'));

  assertEqual(replay.identity.orderId ?? null, '112-7311035-1437035', 'replay payload should preserve order id');
  assertEqual(replay.identity.idempotencyKey, job.idempotency_key, 'replay payload should preserve idempotency key');
  assertDeepEqual(eventRow.payload, { requestId: 'pdf-123' }, 'event row should preserve payload');
  assertEqual(eventRow.event_type, 'provider-submitted', 'event row should preserve event type');
  assertEqual(errorSummary.message, 'boom', 'error summary should preserve message');
}

async function testW2AReplayReusePath() {
  const succeededJob: WorkflowJobRecord = {
    id: 62,
    job_type: 'w2a-single-pose',
    stage: '2a',
    order_row_id: 4,
    order_id: 'W2A-TOP-PROD-20260325143935',
    root_order_id: 'W2A-TOP-PROD-20260325143935',
    amazon_order_id: 'W2A-TOP-PROD-20260325143935',
    book_id: 'book-mvp-simple-adventure',
    logical_key: 'pose-00',
    idempotency_key: 'wf:2a:w2a-single-pose:W2A-TOP-PROD-20260325143935:pose-00:stub',
    status: 'succeeded',
    lease_owner: null,
    lease_expires_at: null,
    attempt_count: 1,
    max_attempts: 5,
    next_retry_at: null,
    external_provider: 'gemini',
    external_request_id: 'corr-pose-00',
    external_status_url: null,
    input_snapshot: {},
    normalized_input_snapshot: {
      poseNumber: 0,
      correlationId: 'corr-pose-00',
      poseRefKey: 'book-mvp-simple-adventure/characters/poses/pose00.png',
      baseCharacterKey:
        'book-mvp-simple-adventure/order-generated-assets/characters/replaychar0001/base-character.png',
    },
    result_snapshot: {
      poseNumber: 0,
      uploadKey:
        'book-mvp-simple-adventure/order-generated-assets/characters/replaychar0001/poses/pose00.png',
      generatedFileName: 'pose00.png',
      fileSize: 2048,
      correlationId: 'corr-pose-00',
      poseRefKey: 'book-mvp-simple-adventure/characters/poses/pose00.png',
      baseCharacterKey:
        'book-mvp-simple-adventure/order-generated-assets/characters/replaychar0001/base-character.png',
    },
    last_error: null,
    queued_at: '2026-03-25T14:40:26.000Z',
    claimed_at: '2026-03-25T14:40:27.000Z',
    started_at: '2026-03-25T14:40:28.000Z',
    polling_at: null,
    completed_at: '2026-03-25T14:41:00.000Z',
    failed_at: null,
    dead_lettered_at: null,
    canceled_at: null,
    created_at: '2026-03-25T14:40:26.000Z',
    updated_at: '2026-03-25T14:41:00.000Z',
  };

  const directReplay = buildW2APoseWorkflowReplay(succeededJob);
  assert(directReplay, 'W2A replay helper should emit a reuse envelope for succeeded jobs');
  assertEqual(
    directReplay?.uploadKey ?? null,
    'book-mvp-simple-adventure/order-generated-assets/characters/replaychar0001/poses/pose00.png',
    'W2A replay helper should preserve the stored upload key',
  );

  const appendedEvents: Array<{ eventType: string; payload?: unknown }> = [];
  const result = await claimAndStartW2APoseJob(
    {
      orderId: 'W2A-TOP-PROD-20260325143935',
      rootOrderId: 'W2A-TOP-PROD-20260325143935',
      amazonOrderId: 'W2A-TOP-PROD-20260325143935',
      bookId: 'book-mvp-simple-adventure',
      poseNumber: 0,
      publicR2Url: 'https://pub.example.r2.dev',
      workflowJobId: 62,
    },
    {
      replayArtifactExists: async () => true,
    },
    {
      enqueueWorkflowJob: async () => null,
      getWorkflowJobById: async (id: number) => (id === 62 ? succeededJob : null),
      getWorkflowJobByIdempotencyKey: async () => succeededJob,
      claimWorkflowJob: async () => null,
      incrementWorkflowJobAttemptCount: async () => null,
      createWorkflowJobAttempt: async () => null,
      markWorkflowJobRunning: async () => null,
      appendWorkflowJobEvent: async (input) => {
        appendedEvents.push({
          eventType: input.eventType,
          payload: input.payload,
        });
        return null;
      },
    },
  );

  assertEqual(result.workflowClaimed, false, 'W2A replay path should not claim an already-succeeded job');
  assertEqual(result.workflowJobStatus, 'succeeded', 'W2A replay path should preserve the succeeded status');
  assert(
    result.workflowReplay?.mode === 'reuse-succeeded-pose' &&
      result.workflowReplay?.generatedFileName === 'pose00.png',
    'W2A replay path should expose the stored artifact metadata',
  );
  assert(
    appendedEvents.some((event) => event.eventType === 'replay-reused'),
    'W2A replay path should append a replay-reused event for operator visibility',
  );

  const missingArtifactEvents: Array<{ eventType: string; payload?: unknown }> = [];
  const missingArtifactResult = await claimAndStartW2APoseJob(
    {
      orderId: 'W2A-TOP-PROD-20260325143935',
      rootOrderId: 'W2A-TOP-PROD-20260325143935',
      amazonOrderId: 'W2A-TOP-PROD-20260325143935',
      bookId: 'book-mvp-simple-adventure',
      poseNumber: 0,
      publicR2Url: 'https://pub.example.r2.dev',
      workflowJobId: 62,
    },
    {
      replayArtifactExists: async () => false,
    },
    {
      enqueueWorkflowJob: async () => null,
      getWorkflowJobById: async (id: number) => (id === 62 ? succeededJob : null),
      getWorkflowJobByIdempotencyKey: async () => succeededJob,
      claimWorkflowJob: async () => null,
      incrementWorkflowJobAttemptCount: async () => null,
      createWorkflowJobAttempt: async () => null,
      markWorkflowJobRunning: async () => null,
      appendWorkflowJobEvent: async (input) => {
        missingArtifactEvents.push({
          eventType: input.eventType,
          payload: input.payload,
        });
        return null;
      },
    },
  );

  assertEqual(
    missingArtifactResult.workflowReplay,
    null,
    'W2A replay path should fall back to live generation when the stored artifact is missing',
  );
  assertEqual(
    missingArtifactResult.workflowClaimed,
    false,
    'W2A replay fallback should leave the item unclaimed so the existing live path can continue',
  );
  assert(
    missingArtifactEvents.some((event) => event.eventType === 'replay-missing-artifact'),
    'W2A replay fallback should append a replay-missing-artifact event for operator visibility',
  );
  assert(
    !missingArtifactEvents.some((event) => event.eventType === 'replay-reused'),
    'W2A replay fallback should not emit a replay-reused event when the stored artifact is missing',
  );
}

async function testWorkflowJobEventRoute() {
  const calls: Array<{ fn: string; payload: unknown }> = [];
  const baseJob: WorkflowJobRecord = {
    id: 7,
    job_type: 'w2b-single-pose',
    stage: '2b',
    order_row_id: 3,
    order_id: '112-7311035-1437035',
    root_order_id: '112-7311035-1437035',
    amazon_order_id: '112-7311035-1437035',
    book_id: 'book-mvp-simple-adventure',
    logical_key: 'pose-07',
    idempotency_key: 'wf:2b:w2b-single-pose:112-7311035-1437035:pose-07:abc123',
    status: 'running',
    lease_owner: 'api:internal/w2b/build-pose-input',
    lease_expires_at: '2026-03-24T20:10:00.000Z',
    attempt_count: 1,
    max_attempts: 5,
    next_retry_at: null,
    external_provider: 'bria',
    external_request_id: null,
    external_status_url: null,
    input_snapshot: {},
    normalized_input_snapshot: {},
    result_snapshot: {},
    last_error: null,
    queued_at: '2026-03-24T20:00:00.000Z',
    claimed_at: '2026-03-24T20:00:05.000Z',
    started_at: '2026-03-24T20:00:06.000Z',
    polling_at: null,
    completed_at: null,
    failed_at: null,
    dead_lettered_at: null,
    canceled_at: null,
    created_at: '2026-03-24T20:00:00.000Z',
    updated_at: '2026-03-24T20:00:06.000Z',
  };

  const response = await recordWorkflowJobEventResponse(
    {
      jobId: 7,
      attemptId: 70,
      eventType: 'completed',
      jobStatus: 'succeeded',
      attemptStatus: 'succeeded',
      externalProvider: 'bria',
      externalRequestId: 'bria-123',
      externalStatusUrl: 'https://bria.example/status/bria-123',
      resultSnapshot: { poseNumber: 7, bgRemovedKey: 'book/orders/112/bg.png' },
      payload: { briaStatus: 'completed' },
      context: { poseNumber: 7, passthrough: true },
    },
    {
      getWorkflowJobAttemptById: async () => null,
      getWorkflowJobById: async (id: number) => (id === 7 ? baseJob : null),
      getWorkflowJobByIdempotencyKey: async () => null,
      finishWorkflowJobAttempt: async (input) => {
        calls.push({ fn: 'finishWorkflowJobAttempt', payload: input });
        return null;
      },
      updateWorkflowJobAttempt: async (inputId, patch) => {
        calls.push({ fn: 'updateWorkflowJobAttempt', payload: { inputId, patch } });
        return null;
      },
      markWorkflowJobRunning: async () => null,
      markWorkflowJobPolling: async () => null,
      markWorkflowJobSucceeded: async (_jobId, input) => {
        calls.push({ fn: 'markWorkflowJobSucceeded', payload: input });
        return { ...baseJob, status: 'succeeded', completed_at: '2026-03-24T20:01:00.000Z' } as WorkflowJobRecord;
      },
      markWorkflowJobFailed: async () => null,
      scheduleWorkflowJobRetry: async () => null,
      deadLetterWorkflowJob: async () => null,
      appendWorkflowJobEvent: async (input) => {
        calls.push({ fn: 'appendWorkflowJobEvent', payload: input });
        return null;
      },
    },
  );

  assertEqual(response.success, true, 'workflow job event route should succeed with stubbed dependencies');
  assertEqual(response.jobId, 7, 'workflow job event route should preserve job id');
  assertEqual(response.currentStatus, 'succeeded', 'workflow job event route should surface updated job status');
  assertEqual(response.poseNumber, 7, 'workflow job event route should pass through context fields');
  assert(
    calls.some((entry) => entry.fn === 'finishWorkflowJobAttempt'),
    'workflow job event route should finish terminal attempts',
  );
  assert(
    calls.some((entry) => entry.fn === 'markWorkflowJobSucceeded'),
    'workflow job event route should mark the job succeeded on completed events',
  );
  assert(
    calls.some((entry) => entry.fn === 'appendWorkflowJobEvent'),
    'workflow job event route should append an event row',
  );
}

async function testWorkflowJobEventRouteIgnoresLatePollRegression() {
  const calls: Array<{ fn: string; payload: unknown }> = [];
  const terminalJob: WorkflowJobRecord = {
    id: 141,
    job_type: 'w3-book-assembly',
    stage: '3',
    order_row_id: 874,
    order_id: 'W3-WFJ-PROOF-20260326195258-safe-v3',
    root_order_id: 'W3-WFJ-PROOF-20260326195258-safe-v3',
    amazon_order_id: 'W3-WFJ-PROOF-20260326195258-safe-v3',
    book_id: 'book-mvp-simple-adventure',
    logical_key: 'assembly:2026-03-27T04:19:12Z',
    idempotency_key: 'wf:3:w3-book-assembly:W3-WFJ-PROOF-20260326195258-safe-v3:assembly:2026-03-27T04:19:12Z:stub',
    status: 'succeeded',
    lease_owner: null,
    lease_expires_at: null,
    attempt_count: 1,
    max_attempts: 5,
    next_retry_at: null,
    external_provider: 'pdfmonkey',
    external_request_id: 'pdf-141',
    external_status_url: 'https://api.pdfmonkey.io/api/v1/documents/pdf-141',
    input_snapshot: {},
    normalized_input_snapshot: {},
    result_snapshot: {},
    last_error: null,
    queued_at: '2026-03-27T04:19:13.000Z',
    claimed_at: '2026-03-27T04:19:14.000Z',
    started_at: '2026-03-27T04:19:14.000Z',
    polling_at: '2026-03-27T04:23:37.000Z',
    completed_at: '2026-03-27T04:23:45.000Z',
    failed_at: null,
    dead_lettered_at: null,
    canceled_at: null,
    created_at: '2026-03-27T04:19:13.000Z',
    updated_at: '2026-03-27T04:23:45.000Z',
  };

  const response = await recordWorkflowJobEventResponse(
    {
      jobId: 141,
      attemptId: 103,
      eventType: 'poll-tick',
      jobStatus: 'polling',
      attemptStatus: 'polling',
      externalProvider: 'pdfmonkey',
      externalRequestId: 'pdf-141',
      externalStatusUrl: 'https://api.pdfmonkey.io/api/v1/documents/pdf-141',
      payload: {
        orderId: 'W3-WFJ-PROOF-20260326195258-safe-v3',
        documentKind: 'cover-preview',
        pdfMonkeyStatus: 'success',
      },
    },
    {
      getWorkflowJobAttemptById: async (id: number) =>
        id === 103
          ? {
              id: 103,
              job_id: 141,
              attempt: 1,
              status: 'succeeded',
              worker_kind: 'n8n',
              lease_owner: 'api:internal/w3/build-assembly-input',
              started_at: '2026-03-27T04:19:14.304Z',
              ended_at: '2026-03-27T04:21:50.677Z',
              duration_ms: 156373,
              error_message: null,
              error_details: null,
              provider_request_id: 'pdf-141',
              provider_status_url: 'https://api.pdfmonkey.io/api/v1/documents/pdf-141',
              created_at: '2026-03-27T04:19:14.388Z',
              updated_at: '2026-03-27T04:21:50.677Z',
            }
          : null,
      getWorkflowJobById: async (id: number) => (id === 141 ? terminalJob : null),
      getWorkflowJobByIdempotencyKey: async () => null,
      finishWorkflowJobAttempt: async (input) => {
        calls.push({ fn: 'finishWorkflowJobAttempt', payload: input });
        return null;
      },
      updateWorkflowJobAttempt: async (inputId, patch) => {
        calls.push({ fn: 'updateWorkflowJobAttempt', payload: { inputId, patch } });
        return null;
      },
      markWorkflowJobRunning: async (_jobId, input) => {
        calls.push({ fn: 'markWorkflowJobRunning', payload: input });
        return terminalJob;
      },
      markWorkflowJobPolling: async (_jobId, input) => {
        calls.push({ fn: 'markWorkflowJobPolling', payload: input });
        return terminalJob;
      },
      markWorkflowJobSucceeded: async () => terminalJob,
      markWorkflowJobFailed: async () => null,
      scheduleWorkflowJobRetry: async () => null,
      deadLetterWorkflowJob: async () => null,
      appendWorkflowJobEvent: async (input) => {
        calls.push({ fn: 'appendWorkflowJobEvent', payload: input });
        return null;
      },
    },
  );

  assertEqual(
    response.currentStatus,
    'succeeded',
    'workflow job event route should preserve terminal job status when late poll ticks arrive',
  );
  assert(
    !calls.some((entry) => entry.fn === 'updateWorkflowJobAttempt'),
    'workflow job event route should not regress a terminal attempt back to polling',
  );
  assert(
    !calls.some((entry) => entry.fn === 'markWorkflowJobPolling'),
    'workflow job event route should not regress a terminal job back to polling',
  );
  assert(
    calls.some((entry) => entry.fn === 'appendWorkflowJobEvent'),
    'workflow job event route should still append the late event for traceability',
  );
}

async function testW3AssemblyJobLifecycle() {
  const queuedEvents: Array<{ eventType: string; payload?: unknown }> = [];
  let enqueuedLogicalKey: string | null = null;

  const started = await claimAndStartW3AssemblyJob(
    {
      orderId: 'W3-REPO-PROOF-20260323-231121-safe-v3',
      rootOrderId: 'W3-REPO-PROOF-20260323-231121-safe-v3',
      amazonOrderId: 'W3-REPO-PROOF-20260323-231121-safe-v3',
      bookId: 'book-mvp-simple-adventure',
      characterHash: 'fixture-book1-w3-hash',
      manifest2bKey: 'book/orders/W3-REPO-PROOF-20260323-231121-safe-v3/manifests/2b-manifest.json',
      manifest3Key: 'book/orders/W3-REPO-PROOF-20260323-231121-safe-v3/manifests/3-manifest.json',
      claimedAt: '2026-03-26T18:32:45.000Z',
    },
    {},
    {
      enqueueWorkflowJob: async (input) => {
        enqueuedLogicalKey = String(input.logicalKey);
        return {
          id: 301,
          job_type: 'w3-book-assembly',
          stage: '3',
          order_row_id: null,
          order_id: 'W3-REPO-PROOF-20260323-231121-safe-v3',
          root_order_id: 'W3-REPO-PROOF-20260323-231121-safe-v3',
          amazon_order_id: 'W3-REPO-PROOF-20260323-231121-safe-v3',
          book_id: 'book-mvp-simple-adventure',
          logical_key: String(input.logicalKey),
          idempotency_key: String(input.idempotencyKey),
          status: 'queued',
          lease_owner: null,
          lease_expires_at: null,
          attempt_count: 0,
          max_attempts: 5,
          next_retry_at: null,
          external_provider: 'pdfmonkey',
          external_request_id: null,
          external_status_url: null,
          input_snapshot: {},
          normalized_input_snapshot: {},
          result_snapshot: {},
          last_error: null,
          queued_at: '2026-03-26T18:32:45.000Z',
          claimed_at: null,
          started_at: null,
          polling_at: null,
          completed_at: null,
          failed_at: null,
          dead_lettered_at: null,
          canceled_at: null,
          created_at: '2026-03-26T18:32:45.000Z',
          updated_at: '2026-03-26T18:32:45.000Z',
        } as WorkflowJobRecord;
      },
      getWorkflowJobById: async () => null,
      getWorkflowJobByIdempotencyKey: async () => null,
      listWorkflowJobsForOrder: async () => [],
      claimWorkflowJob: async () =>
        ({
          id: 301,
          job_type: 'w3-book-assembly',
          stage: '3',
          order_row_id: null,
          order_id: 'W3-REPO-PROOF-20260323-231121-safe-v3',
          root_order_id: 'W3-REPO-PROOF-20260323-231121-safe-v3',
          amazon_order_id: 'W3-REPO-PROOF-20260323-231121-safe-v3',
          book_id: 'book-mvp-simple-adventure',
          logical_key: enqueuedLogicalKey || 'assembly',
          idempotency_key: 'wf:3:w3-book-assembly:W3-REPO-PROOF-20260323-231121-safe-v3:assembly:stub',
          status: 'claimed',
          lease_owner: 'api:internal/w3/build-assembly-input',
          lease_expires_at: '2026-03-26T18:33:45.000Z',
          attempt_count: 0,
          max_attempts: 5,
          next_retry_at: null,
          external_provider: 'pdfmonkey',
          external_request_id: null,
          external_status_url: null,
          input_snapshot: {},
          normalized_input_snapshot: {},
          result_snapshot: {},
          last_error: null,
          queued_at: '2026-03-26T18:32:45.000Z',
          claimed_at: '2026-03-26T18:32:46.000Z',
          started_at: null,
          polling_at: null,
          completed_at: null,
          failed_at: null,
          dead_lettered_at: null,
          canceled_at: null,
          created_at: '2026-03-26T18:32:45.000Z',
          updated_at: '2026-03-26T18:32:46.000Z',
        }) as WorkflowJobRecord,
      incrementWorkflowJobAttemptCount: async () =>
        ({
          attempt_count: 1,
        }) as WorkflowJobRecord,
      createWorkflowJobAttempt: async () =>
        ({
          id: 901,
          job_id: 301,
          attempt: 1,
          status: 'running',
          worker_kind: 'n8n',
          lease_owner: 'api:internal/w3/build-assembly-input',
          started_at: '2026-03-26T18:32:46.000Z',
          ended_at: null,
          duration_ms: null,
          error_message: null,
          error_details: null,
          provider_request_id: null,
          provider_status_url: null,
          created_at: '2026-03-26T18:32:46.000Z',
          updated_at: '2026-03-26T18:32:46.000Z',
        }),
      getLatestWorkflowJobAttemptForJob: async () => null,
      finishWorkflowJobAttempt: async () => null,
      markWorkflowJobRunning: async () =>
        ({
          id: 301,
          job_type: 'w3-book-assembly',
          stage: '3',
          order_row_id: null,
          order_id: 'W3-REPO-PROOF-20260323-231121-safe-v3',
          root_order_id: 'W3-REPO-PROOF-20260323-231121-safe-v3',
          amazon_order_id: 'W3-REPO-PROOF-20260323-231121-safe-v3',
          book_id: 'book-mvp-simple-adventure',
          logical_key: enqueuedLogicalKey || 'assembly',
          idempotency_key: 'wf:3:w3-book-assembly:W3-REPO-PROOF-20260323-231121-safe-v3:assembly:stub',
          status: 'running',
          lease_owner: 'api:internal/w3/build-assembly-input',
          lease_expires_at: '2026-03-26T18:33:45.000Z',
          attempt_count: 1,
          max_attempts: 5,
          next_retry_at: null,
          external_provider: 'pdfmonkey',
          external_request_id: null,
          external_status_url: null,
          input_snapshot: {},
          normalized_input_snapshot: {},
          result_snapshot: {},
          last_error: null,
          queued_at: '2026-03-26T18:32:45.000Z',
          claimed_at: '2026-03-26T18:32:46.000Z',
          started_at: '2026-03-26T18:32:47.000Z',
          polling_at: null,
          completed_at: null,
          failed_at: null,
          dead_lettered_at: null,
          canceled_at: null,
          created_at: '2026-03-26T18:32:45.000Z',
          updated_at: '2026-03-26T18:32:47.000Z',
        }) as WorkflowJobRecord,
      markWorkflowJobSucceeded: async () => null,
      cancelWorkflowJob: async () => null,
      appendWorkflowJobEvent: async (input) => {
        queuedEvents.push({ eventType: input.eventType, payload: input.payload });
        return null;
      },
    },
  );

  assertEqual(started.workflowClaimed, true, 'W3 job start should claim the per-order assembly job');
  assertEqual(started.workflowJobStatus, 'running', 'W3 job start should mark the job running');
  assertEqual(started.workflowAttemptId, 901, 'W3 job start should create an attempt record');
  assert(
    String(enqueuedLogicalKey).includes('2026-03-26T18:32:45'),
    'W3 logical key should include claimedAt so reruns do not collapse into one job identity',
  );
  assert(
    queuedEvents.some((event) => event.eventType === 'queued') &&
      queuedEvents.some((event) => event.eventType === 'claimed') &&
      queuedEvents.some((event) => event.eventType === 'started'),
    'W3 job start should emit queued, claimed, and started events',
  );
  assertEqual(started.workflowSkipped, false, 'W3 job start should not mark the fresh claim as skipped');
  assertEqual(started.workflowSkipReason, null, 'W3 job start should not report a skip reason');
}

async function testW3AssemblyJobSkipsWhenAnotherActiveJobExists() {
  const calls: Array<{ fn: string; payload: unknown }> = [];
  const activeJob: WorkflowJobRecord = {
    id: 777,
    job_type: 'w3-book-assembly',
    stage: '3',
    order_row_id: 874,
    order_id: 'W3-WFJ-PROOF-20260326195258-safe-v3',
    root_order_id: 'W3-WFJ-PROOF-20260326195258-safe-v3',
    amazon_order_id: 'W3-WFJ-PROOF-20260326195258-safe-v3',
    book_id: 'book-mvp-simple-adventure',
    logical_key: 'assembly:2026-03-27T04:38:54Z',
    idempotency_key:
      'wf:3:w3-book-assembly:W3-WFJ-PROOF-20260326195258-safe-v3:assembly:2026-03-27T04:38:54Z:active',
    status: 'polling',
    lease_owner: 'api:internal/w3/build-assembly-input',
    lease_expires_at: '2026-03-27T04:45:00.000Z',
    attempt_count: 1,
    max_attempts: 5,
    next_retry_at: null,
    external_provider: 'pdfmonkey',
    external_request_id: 'pdf-777',
    external_status_url: 'https://api.pdfmonkey.io/api/v1/documents/pdf-777',
    input_snapshot: {},
    normalized_input_snapshot: {},
    result_snapshot: {},
    last_error: null,
    queued_at: '2026-03-27T04:38:55.000Z',
    claimed_at: '2026-03-27T04:38:56.000Z',
    started_at: '2026-03-27T04:38:56.000Z',
    polling_at: '2026-03-27T04:39:00.000Z',
    completed_at: null,
    failed_at: null,
    dead_lettered_at: null,
    canceled_at: null,
    created_at: '2026-03-27T04:38:55.000Z',
    updated_at: '2026-03-27T04:39:00.000Z',
  };

  const started = await claimAndStartW3AssemblyJob(
    {
      orderId: 'W3-WFJ-PROOF-20260326195258-safe-v3',
      rootOrderId: 'W3-WFJ-PROOF-20260326195258-safe-v3',
      amazonOrderId: 'W3-WFJ-PROOF-20260326195258-safe-v3',
      bookId: 'book-mvp-simple-adventure',
      characterHash: 'fixture-book1-w3-hash',
      manifest2bKey:
        'book/orders/W3-WFJ-PROOF-20260326195258-safe-v3/manifests/2b-manifest.json',
      manifest3Key:
        'book/orders/W3-WFJ-PROOF-20260326195258-safe-v3/manifests/3-manifest.json',
      claimedAt: '2026-03-27T04:39:12.000Z',
    },
    {},
    {
      enqueueWorkflowJob: async () => {
        throw new Error('should not enqueue a duplicate W3 job while another is active');
      },
      getWorkflowJobById: async () => null,
      getWorkflowJobByIdempotencyKey: async () => null,
      listWorkflowJobsForOrder: async () => [activeJob],
      claimWorkflowJob: async () => null,
      incrementWorkflowJobAttemptCount: async () => null,
      createWorkflowJobAttempt: async () => null,
      getLatestWorkflowJobAttemptForJob: async (jobId: number) =>
        jobId === 777
          ? ({
              id: 1004,
              job_id: 777,
              attempt: 1,
              status: 'polling',
              worker_kind: 'n8n',
              lease_owner: 'api:internal/w3/build-assembly-input',
              started_at: '2026-03-27T04:38:56.000Z',
              ended_at: null,
              duration_ms: null,
              error_message: null,
              error_details: null,
              provider_request_id: 'pdf-777',
              provider_status_url: 'https://api.pdfmonkey.io/api/v1/documents/pdf-777',
              created_at: '2026-03-27T04:38:56.000Z',
              updated_at: '2026-03-27T04:39:00.000Z',
            } as WorkflowJobAttemptRecord)
          : null,
      finishWorkflowJobAttempt: async () => null,
      markWorkflowJobRunning: async () => null,
      markWorkflowJobSucceeded: async () => null,
      cancelWorkflowJob: async () => null,
      appendWorkflowJobEvent: async (input) => {
        calls.push({ fn: 'appendWorkflowJobEvent', payload: input });
        return null;
      },
    },
  );

  assertEqual(
    started.workflowJobId,
    777,
    'W3 duplicate guard should point duplicate callers at the already-active assembly job',
  );
  assertEqual(
    started.workflowAttemptId,
    1004,
    'W3 duplicate guard should surface the latest active attempt for the already-running job',
  );
  assertEqual(started.workflowClaimed, false, 'W3 duplicate guard should not claim a second job');
  assertEqual(started.workflowSkipped, true, 'W3 duplicate guard should mark the duplicate trigger skipped');
  assertEqual(
    started.workflowSkipReason,
    'active-w3-assembly-job-exists',
    'W3 duplicate guard should explain why the duplicate trigger was skipped',
  );
  assert(
    calls.some(
      (entry) =>
        entry.fn === 'appendWorkflowJobEvent' &&
        (entry.payload as { eventType?: string }).eventType === 'duplicate-trigger-skipped',
    ),
    'W3 duplicate guard should append a duplicate-trigger-skipped event to the active job',
  );
}

async function testW3AssemblyJobCancelsLaterOverlapAfterEnqueue() {
  const calls: Array<{ fn: string; payload: unknown }> = [];
  let listCallCount = 0;

  const earlierJob: WorkflowJobRecord = {
    id: 880,
    job_type: 'w3-book-assembly',
    stage: '3',
    order_row_id: 874,
    order_id: 'W3-WFJ-PROOF-20260326195258-safe-v3',
    root_order_id: 'W3-WFJ-PROOF-20260326195258-safe-v3',
    amazon_order_id: 'W3-WFJ-PROOF-20260326195258-safe-v3',
    book_id: 'book-mvp-simple-adventure',
    logical_key: 'assembly:2026-03-27T05:01:30Z',
    idempotency_key:
      'wf:3:w3-book-assembly:W3-WFJ-PROOF-20260326195258-safe-v3:assembly:2026-03-27T05:01:30Z:older',
    status: 'running',
    lease_owner: 'api:internal/w3/build-assembly-input',
    lease_expires_at: '2026-03-27T05:06:00.000Z',
    attempt_count: 1,
    max_attempts: 5,
    next_retry_at: null,
    external_provider: 'pdfmonkey',
    external_request_id: 'pdf-880',
    external_status_url: 'https://api.pdfmonkey.io/api/v1/documents/pdf-880',
    input_snapshot: {},
    normalized_input_snapshot: {},
    result_snapshot: {},
    last_error: null,
    queued_at: '2026-03-27T05:01:11.000Z',
    claimed_at: '2026-03-27T05:01:12.000Z',
    started_at: '2026-03-27T05:01:13.000Z',
    polling_at: null,
    completed_at: null,
    failed_at: null,
    dead_lettered_at: null,
    canceled_at: null,
    created_at: '2026-03-27T05:01:11.000Z',
    updated_at: '2026-03-27T05:01:13.000Z',
  };

  const duplicateJob: WorkflowJobRecord = {
    id: 881,
    job_type: 'w3-book-assembly',
    stage: '3',
    order_row_id: 874,
    order_id: 'W3-WFJ-PROOF-20260326195258-safe-v3',
    root_order_id: 'W3-WFJ-PROOF-20260326195258-safe-v3',
    amazon_order_id: 'W3-WFJ-PROOF-20260326195258-safe-v3',
    book_id: 'book-mvp-simple-adventure',
    logical_key: 'assembly:2026-03-27T05:01:31Z',
    idempotency_key:
      'wf:3:w3-book-assembly:W3-WFJ-PROOF-20260326195258-safe-v3:assembly:2026-03-27T05:01:31Z:newer',
    status: 'queued',
    lease_owner: null,
    lease_expires_at: null,
    attempt_count: 0,
    max_attempts: 5,
    next_retry_at: null,
    external_provider: 'pdfmonkey',
    external_request_id: null,
    external_status_url: null,
    input_snapshot: {},
    normalized_input_snapshot: {},
    result_snapshot: {},
    last_error: null,
    queued_at: '2026-03-27T05:01:12.000Z',
    claimed_at: null,
    started_at: null,
    polling_at: null,
    completed_at: null,
    failed_at: null,
    dead_lettered_at: null,
    canceled_at: null,
    created_at: '2026-03-27T05:01:12.000Z',
    updated_at: '2026-03-27T05:01:12.000Z',
  };

  const started = await claimAndStartW3AssemblyJob(
    {
      orderId: 'W3-WFJ-PROOF-20260326195258-safe-v3',
      rootOrderId: 'W3-WFJ-PROOF-20260326195258-safe-v3',
      amazonOrderId: 'W3-WFJ-PROOF-20260326195258-safe-v3',
      bookId: 'book-mvp-simple-adventure',
      characterHash: 'fixture-book1-w3-hash',
      manifest2bKey:
        'book/orders/W3-WFJ-PROOF-20260326195258-safe-v3/manifests/2b-manifest.json',
      manifest3Key:
        'book/orders/W3-WFJ-PROOF-20260326195258-safe-v3/manifests/3-manifest.json',
      claimedAt: '2026-03-27T05:01:31.000Z',
    },
    {},
    {
      enqueueWorkflowJob: async () => duplicateJob,
      getWorkflowJobById: async (jobId: number) => (jobId === 880 ? earlierJob : duplicateJob),
      getWorkflowJobByIdempotencyKey: async () => null,
      listWorkflowJobsForOrder: async () => {
        listCallCount += 1;
        return listCallCount === 1 ? [] : [duplicateJob, earlierJob];
      },
      claimWorkflowJob: async () => {
        throw new Error('should not claim the later duplicate once an earlier active job is visible');
      },
      incrementWorkflowJobAttemptCount: async () => null,
      createWorkflowJobAttempt: async () => null,
      getLatestWorkflowJobAttemptForJob: async (jobId: number) =>
        jobId === 880
          ? ({
              id: 1005,
              job_id: 880,
              attempt: 1,
              status: 'running',
              worker_kind: 'n8n',
              lease_owner: 'api:internal/w3/build-assembly-input',
              started_at: '2026-03-27T05:01:13.000Z',
              ended_at: null,
              duration_ms: null,
              error_message: null,
              error_details: null,
              provider_request_id: 'pdf-880',
              provider_status_url: 'https://api.pdfmonkey.io/api/v1/documents/pdf-880',
              created_at: '2026-03-27T05:01:13.000Z',
              updated_at: '2026-03-27T05:01:13.000Z',
            } as WorkflowJobAttemptRecord)
          : null,
      finishWorkflowJobAttempt: async () => null,
      markWorkflowJobRunning: async () => null,
      markWorkflowJobSucceeded: async () => null,
      cancelWorkflowJob: async (jobId: number, reason: string) => {
        calls.push({ fn: 'cancelWorkflowJob', payload: { jobId, reason } });
        return {
          ...duplicateJob,
          status: 'canceled',
          canceled_at: '2026-03-27T05:01:12.500Z',
          updated_at: '2026-03-27T05:01:12.500Z',
        } as WorkflowJobRecord;
      },
      appendWorkflowJobEvent: async (input) => {
        calls.push({ fn: 'appendWorkflowJobEvent', payload: input });
        return null;
      },
    },
  );

  assertEqual(
    started.workflowJobId,
    880,
    'W3 overlap guard should redirect the later duplicate to the earlier active job',
  );
  assertEqual(started.workflowAttemptId, 1005, 'W3 overlap guard should surface the winning active attempt');
  assertEqual(started.workflowClaimed, false, 'W3 overlap guard should not claim the later duplicate');
  assertEqual(started.workflowSkipped, true, 'W3 overlap guard should mark the later duplicate skipped');
  assertEqual(
    started.workflowSkipReason,
    'active-w3-assembly-job-exists',
    'W3 overlap guard should explain the duplicate skip reason',
  );
  assert(
    calls.some(
      (entry) =>
        entry.fn === 'cancelWorkflowJob' &&
        (entry.payload as { jobId?: number }).jobId === 881,
    ),
    'W3 overlap guard should cancel the later duplicate job row before provider work starts',
  );
  assert(
    calls.some(
      (entry) =>
        entry.fn === 'appendWorkflowJobEvent' &&
        (entry.payload as { eventType?: string; jobId?: number }).eventType ===
          'duplicate-trigger-superseded' &&
        (entry.payload as { eventType?: string; jobId?: number }).jobId === 881,
    ),
    'W3 overlap guard should mark the later duplicate row as superseded',
  );
  assert(
    calls.some(
      (entry) =>
        entry.fn === 'appendWorkflowJobEvent' &&
        (entry.payload as { eventType?: string; jobId?: number }).eventType ===
          'duplicate-trigger-skipped' &&
        (entry.payload as { eventType?: string; jobId?: number }).jobId === 880,
    ),
    'W3 overlap guard should log the skip on the winning active job for traceability',
  );
}

async function testW3AssemblyCompletion() {
  const calls: Array<{ fn: string; payload: unknown }> = [];
  const olderJob: WorkflowJobRecord = {
    id: 401,
    job_type: 'w3-book-assembly',
    stage: '3',
    order_row_id: null,
    order_id: 'W3-REPO-PROOF-20260323-231121-safe-v3',
    root_order_id: 'W3-REPO-PROOF-20260323-231121-safe-v3',
    amazon_order_id: 'W3-REPO-PROOF-20260323-231121-safe-v3',
    book_id: 'book-mvp-simple-adventure',
    logical_key: 'assembly:2026-03-25T10:00:00.000Z',
    idempotency_key: 'wf:3:w3-book-assembly:W3-REPO-PROOF-20260323-231121-safe-v3:old:stub',
    status: 'succeeded',
    lease_owner: null,
    lease_expires_at: null,
    attempt_count: 1,
    max_attempts: 5,
    next_retry_at: null,
    external_provider: 'pdfmonkey',
    external_request_id: null,
    external_status_url: null,
    input_snapshot: {},
    normalized_input_snapshot: {},
    result_snapshot: {},
    last_error: null,
    queued_at: '2026-03-25T10:00:00.000Z',
    claimed_at: '2026-03-25T10:00:01.000Z',
    started_at: '2026-03-25T10:00:02.000Z',
    polling_at: null,
    completed_at: '2026-03-25T10:10:00.000Z',
    failed_at: null,
    dead_lettered_at: null,
    canceled_at: null,
    created_at: '2026-03-25T10:00:00.000Z',
    updated_at: '2026-03-25T10:10:00.000Z',
  };
  const activeJob: WorkflowJobRecord = {
    ...olderJob,
    id: 402,
    logical_key: 'assembly:2026-03-26T18:32:45.000Z',
    idempotency_key: 'wf:3:w3-book-assembly:W3-REPO-PROOF-20260323-231121-safe-v3:new:stub',
    status: 'running',
    lease_owner: 'api:internal/w3/build-assembly-input',
    lease_expires_at: '2026-03-26T18:40:00.000Z',
    completed_at: null,
    created_at: '2026-03-26T18:32:45.000Z',
    updated_at: '2026-03-26T18:33:10.000Z',
  };

  const completion = await completeW3AssemblyJobForOrder(
    {
      orderId: 'W3-REPO-PROOF-20260323-231121-safe-v3',
      manifestUrl: 'https://admin.littleherolabs.com/api/manifests/book/orders/W3-REPO-PROOF-20260323-231121-safe-v3/manifests/3-manifest.json',
      manifestKey: 'book/orders/W3-REPO-PROOF-20260323-231121-safe-v3/manifests/3-manifest.json',
      finalBookUrl: 'https://cdn.example/final-book.pdf',
      finalCoverUrl: 'https://cdn.example/final-cover.png',
      pagesGenerated: 15,
      totalPagesRequired: 15,
      assemblyProgress: 1,
    },
    {
      enqueueWorkflowJob: async () => null,
      getWorkflowJobById: async () => null,
      getWorkflowJobByIdempotencyKey: async () => null,
      listWorkflowJobsForOrder: async () => [olderJob, activeJob],
      claimWorkflowJob: async () => null,
      incrementWorkflowJobAttemptCount: async () => null,
      createWorkflowJobAttempt: async () => null,
      getLatestWorkflowJobAttemptForJob: async (jobId: number) =>
        jobId === 402
          ? ({
              id: 9901,
              job_id: 402,
              attempt: 1,
              status: 'running',
              worker_kind: 'n8n',
              lease_owner: 'api:internal/w3/build-assembly-input',
              started_at: '2026-03-26T18:32:46.000Z',
              ended_at: null,
              duration_ms: null,
              error_message: null,
              error_details: null,
              provider_request_id: null,
              provider_status_url: null,
              created_at: '2026-03-26T18:32:46.000Z',
              updated_at: '2026-03-26T18:32:46.000Z',
            })
          : null,
      finishWorkflowJobAttempt: async (input) => {
        calls.push({ fn: 'finishWorkflowJobAttempt', payload: input });
        return null;
      },
      markWorkflowJobRunning: async () => null,
      markWorkflowJobSucceeded: async (jobId, input) => {
        calls.push({ fn: 'markWorkflowJobSucceeded', payload: { jobId, input } });
        return {
          ...activeJob,
          status: 'succeeded',
          completed_at: '2026-03-26T18:34:00.000Z',
          result_snapshot: input.resultSnapshot ?? {},
        } as WorkflowJobRecord;
      },
      cancelWorkflowJob: async () => null,
      appendWorkflowJobEvent: async (input) => {
        calls.push({ fn: 'appendWorkflowJobEvent', payload: input });
        return null;
      },
    },
  );

  assertEqual(completion.job?.id ?? null, 402, 'W3 completion should resolve the latest active assembly job');
  assertEqual(completion.attempt?.id ?? null, 9901, 'W3 completion should reuse the latest open attempt');
  assert(
    calls.some((entry) => entry.fn === 'finishWorkflowJobAttempt'),
    'W3 completion should finish the open attempt before marking the job succeeded',
  );
  assert(
    calls.some(
      (entry) =>
        entry.fn === 'markWorkflowJobSucceeded' &&
        (entry.payload as { jobId: number }).jobId === 402,
    ),
    'W3 completion should mark the latest active job succeeded',
  );
  assert(
    calls.some((entry) => entry.fn === 'appendWorkflowJobEvent'),
    'W3 completion should append a completed event',
  );
}

async function testW4PrintJobLifecycle() {
  const queuedEvents: Array<{ eventType: string; payload?: unknown }> = [];
  let enqueuedLogicalKey: string | null = null;

  const started = await claimAndStartW4PrintJob(
    {
      orderId: 'W4-SANDBOX-PROOF-001',
      rootOrderId: 'W4-SANDBOX-PROOF-001',
      amazonOrderId: null,
      bookId: 'book-mvp-simple-adventure',
      characterHash: 'fixture-book1-w4-hash',
      manifest3Key: 'book/orders/W4-SANDBOX-PROOF-001/manifests/3-manifest.json',
      manifest4Key: 'book/orders/W4-SANDBOX-PROOF-001/manifests/4-manifest.json',
      claimedAt: '2026-03-27T09:20:00.000Z',
    },
    {},
    {
      enqueueWorkflowJob: async (input) => {
        enqueuedLogicalKey = String(input.logicalKey);
        return {
          id: 501,
          job_type: 'w4-print-fulfillment',
          stage: '4',
          order_row_id: null,
          order_id: 'W4-SANDBOX-PROOF-001',
          root_order_id: 'W4-SANDBOX-PROOF-001',
          amazon_order_id: null,
          book_id: 'book-mvp-simple-adventure',
          logical_key: String(input.logicalKey),
          idempotency_key: String(input.idempotencyKey),
          status: 'queued',
          lease_owner: null,
          lease_expires_at: null,
          attempt_count: 0,
          max_attempts: 5,
          next_retry_at: null,
          external_provider: 'pdfmonkey',
          external_request_id: null,
          external_status_url: null,
          input_snapshot: {},
          normalized_input_snapshot: {},
          result_snapshot: {},
          last_error: null,
          queued_at: '2026-03-27T09:20:00.000Z',
          claimed_at: null,
          started_at: null,
          polling_at: null,
          completed_at: null,
          failed_at: null,
          dead_lettered_at: null,
          canceled_at: null,
          created_at: '2026-03-27T09:20:00.000Z',
          updated_at: '2026-03-27T09:20:00.000Z',
        } as WorkflowJobRecord;
      },
      getWorkflowJobById: async () => null,
      getWorkflowJobByIdempotencyKey: async () => null,
      listWorkflowJobsForOrder: async () => [],
      claimWorkflowJob: async () =>
        ({
          id: 501,
          job_type: 'w4-print-fulfillment',
          stage: '4',
          order_row_id: null,
          order_id: 'W4-SANDBOX-PROOF-001',
          root_order_id: 'W4-SANDBOX-PROOF-001',
          amazon_order_id: null,
          book_id: 'book-mvp-simple-adventure',
          logical_key: enqueuedLogicalKey || 'print',
          idempotency_key: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-001:print:stub',
          status: 'claimed',
          lease_owner: 'api:internal/w4/build-print-input',
          lease_expires_at: '2026-03-27T09:21:00.000Z',
          attempt_count: 0,
          max_attempts: 5,
          next_retry_at: null,
          external_provider: 'pdfmonkey',
          external_request_id: null,
          external_status_url: null,
          input_snapshot: {},
          normalized_input_snapshot: {},
          result_snapshot: {},
          last_error: null,
          queued_at: '2026-03-27T09:20:00.000Z',
          claimed_at: '2026-03-27T09:20:01.000Z',
          started_at: null,
          polling_at: null,
          completed_at: null,
          failed_at: null,
          dead_lettered_at: null,
          canceled_at: null,
          created_at: '2026-03-27T09:20:00.000Z',
          updated_at: '2026-03-27T09:20:01.000Z',
        }) as WorkflowJobRecord,
      incrementWorkflowJobAttemptCount: async () =>
        ({
          attempt_count: 1,
        }) as WorkflowJobRecord,
      createWorkflowJobAttempt: async () =>
        ({
          id: 1501,
          job_id: 501,
          attempt: 1,
          status: 'running',
          worker_kind: 'n8n',
          lease_owner: 'api:internal/w4/build-print-input',
          started_at: '2026-03-27T09:20:01.000Z',
          ended_at: null,
          duration_ms: null,
          error_message: null,
          error_details: null,
          provider_request_id: null,
          provider_status_url: null,
          created_at: '2026-03-27T09:20:01.000Z',
          updated_at: '2026-03-27T09:20:01.000Z',
        }) as WorkflowJobAttemptRecord,
      getLatestWorkflowJobAttemptForJob: async () => null,
      finishWorkflowJobAttempt: async () => null,
      markWorkflowJobRunning: async () =>
        ({
          id: 501,
          job_type: 'w4-print-fulfillment',
          stage: '4',
          order_row_id: null,
          order_id: 'W4-SANDBOX-PROOF-001',
          root_order_id: 'W4-SANDBOX-PROOF-001',
          amazon_order_id: null,
          book_id: 'book-mvp-simple-adventure',
          logical_key: enqueuedLogicalKey || 'print',
          idempotency_key: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-001:print:stub',
          status: 'running',
          lease_owner: 'api:internal/w4/build-print-input',
          lease_expires_at: '2026-03-27T09:21:00.000Z',
          attempt_count: 1,
          max_attempts: 5,
          next_retry_at: null,
          external_provider: 'pdfmonkey',
          external_request_id: null,
          external_status_url: null,
          input_snapshot: {},
          normalized_input_snapshot: {},
          result_snapshot: {},
          last_error: null,
          queued_at: '2026-03-27T09:20:00.000Z',
          claimed_at: '2026-03-27T09:20:01.000Z',
          started_at: '2026-03-27T09:20:02.000Z',
          polling_at: null,
          completed_at: null,
          failed_at: null,
          dead_lettered_at: null,
          canceled_at: null,
          created_at: '2026-03-27T09:20:00.000Z',
          updated_at: '2026-03-27T09:20:02.000Z',
        }) as WorkflowJobRecord,
      markWorkflowJobSucceeded: async () => null,
      cancelWorkflowJob: async () => null,
      appendWorkflowJobEvent: async (input) => {
        queuedEvents.push({ eventType: input.eventType, payload: input.payload });
        return null;
      },
    },
  );

  assertEqual(started.workflowClaimed, true, 'W4 job start should claim the per-order print job');
  assertEqual(started.workflowJobStatus, 'running', 'W4 job start should mark the job running');
  assertEqual(started.workflowAttemptId, 1501, 'W4 job start should create an attempt record');
  assert(
    String(enqueuedLogicalKey).includes('2026-03-27T09:20:00'),
    'W4 logical key should include claimedAt so forced reruns do not collapse into one job identity',
  );
  assert(
    queuedEvents.some((event) => event.eventType === 'queued') &&
      queuedEvents.some((event) => event.eventType === 'claimed') &&
      queuedEvents.some((event) => event.eventType === 'started'),
    'W4 job start should emit queued, claimed, and started events',
  );
}

async function testW4SiblingJobLifecycle() {
  const queuedEvents: Array<{ eventType: string; payload?: unknown }> = [];
  let enqueuedLogicalKey: string | null = null;

  const started = await claimAndStartW4SiblingJob(
    {
      rootGroupId: 'W4-SIBLING-PROOF-001',
      rootOrderId: 'W4-SIBLING-PROOF-001',
      amazonOrderId: 'W4-SIBLING-PROOF-001',
      bookId: 'book-mvp-simple-adventure',
      orderIds: ['W4-SIBLING-PROOF-001-item-1', 'W4-SIBLING-PROOF-001-item-2'],
      siblingCount: 2,
      claimedAt: '2026-03-27T10:20:00.000Z',
    },
    {},
    {
      enqueueWorkflowJob: async (input) => {
        enqueuedLogicalKey = String(input.logicalKey);
        return {
          id: 601,
          job_type: 'w4-sibling-aggregation',
          stage: '4.1',
          order_row_id: null,
          order_id: 'W4-SIBLING-PROOF-001',
          root_order_id: 'W4-SIBLING-PROOF-001',
          amazon_order_id: 'W4-SIBLING-PROOF-001',
          book_id: 'book-mvp-simple-adventure',
          logical_key: String(input.logicalKey),
          idempotency_key: String(input.idempotencyKey),
          status: 'queued',
          lease_owner: null,
          lease_expires_at: null,
          attempt_count: 0,
          max_attempts: 5,
          next_retry_at: null,
          external_provider: 'pdfmonkey',
          external_request_id: null,
          external_status_url: null,
          input_snapshot: {},
          normalized_input_snapshot: {},
          result_snapshot: {},
          last_error: null,
          queued_at: '2026-03-27T10:20:00.000Z',
          claimed_at: null,
          started_at: null,
          polling_at: null,
          completed_at: null,
          failed_at: null,
          dead_lettered_at: null,
          canceled_at: null,
          created_at: '2026-03-27T10:20:00.000Z',
          updated_at: '2026-03-27T10:20:00.000Z',
        } as WorkflowJobRecord;
      },
      getWorkflowJobById: async () => null,
      getWorkflowJobByIdempotencyKey: async () => null,
      listWorkflowJobsForOrder: async () => [],
      claimWorkflowJob: async () =>
        ({
          id: 601,
          job_type: 'w4-sibling-aggregation',
          stage: '4.1',
          order_row_id: null,
          order_id: 'W4-SIBLING-PROOF-001',
          root_order_id: 'W4-SIBLING-PROOF-001',
          amazon_order_id: 'W4-SIBLING-PROOF-001',
          book_id: 'book-mvp-simple-adventure',
          logical_key: enqueuedLogicalKey || 'sibling-aggregation',
          idempotency_key: 'wf:4.1:w4-sibling-aggregation:W4-SIBLING-PROOF-001:sibling-aggregation:stub',
          status: 'claimed',
          lease_owner: 'api:internal/w4/build-sibling-print-input',
          lease_expires_at: '2026-03-27T10:21:00.000Z',
          attempt_count: 0,
          max_attempts: 5,
          next_retry_at: null,
          external_provider: 'pdfmonkey',
          external_request_id: null,
          external_status_url: null,
          input_snapshot: {},
          normalized_input_snapshot: {},
          result_snapshot: {},
          last_error: null,
          queued_at: '2026-03-27T10:20:00.000Z',
          claimed_at: '2026-03-27T10:20:01.000Z',
          started_at: null,
          polling_at: null,
          completed_at: null,
          failed_at: null,
          dead_lettered_at: null,
          canceled_at: null,
          created_at: '2026-03-27T10:20:00.000Z',
          updated_at: '2026-03-27T10:20:01.000Z',
        }) as WorkflowJobRecord,
      incrementWorkflowJobAttemptCount: async () =>
        ({
          attempt_count: 1,
        }) as WorkflowJobRecord,
      createWorkflowJobAttempt: async () =>
        ({
          id: 1601,
          job_id: 601,
          attempt: 1,
          status: 'running',
          worker_kind: 'n8n',
          lease_owner: 'api:internal/w4/build-sibling-print-input',
          started_at: '2026-03-27T10:20:01.000Z',
          ended_at: null,
          duration_ms: null,
          error_message: null,
          error_details: null,
          provider_request_id: null,
          provider_status_url: null,
          created_at: '2026-03-27T10:20:01.000Z',
          updated_at: '2026-03-27T10:20:01.000Z',
        }) as WorkflowJobAttemptRecord,
      getLatestWorkflowJobAttemptForJob: async () => null,
      finishWorkflowJobAttempt: async () => null,
      markWorkflowJobRunning: async () =>
        ({
          id: 601,
          job_type: 'w4-sibling-aggregation',
          stage: '4.1',
          order_row_id: null,
          order_id: 'W4-SIBLING-PROOF-001',
          root_order_id: 'W4-SIBLING-PROOF-001',
          amazon_order_id: 'W4-SIBLING-PROOF-001',
          book_id: 'book-mvp-simple-adventure',
          logical_key: enqueuedLogicalKey || 'sibling-aggregation',
          idempotency_key: 'wf:4.1:w4-sibling-aggregation:W4-SIBLING-PROOF-001:sibling-aggregation:stub',
          status: 'running',
          lease_owner: 'api:internal/w4/build-sibling-print-input',
          lease_expires_at: '2026-03-27T10:21:00.000Z',
          attempt_count: 1,
          max_attempts: 5,
          next_retry_at: null,
          external_provider: 'pdfmonkey',
          external_request_id: null,
          external_status_url: null,
          input_snapshot: {},
          normalized_input_snapshot: {},
          result_snapshot: {},
          last_error: null,
          queued_at: '2026-03-27T10:20:00.000Z',
          claimed_at: '2026-03-27T10:20:01.000Z',
          started_at: '2026-03-27T10:20:02.000Z',
          polling_at: null,
          completed_at: null,
          failed_at: null,
          dead_lettered_at: null,
          canceled_at: null,
          created_at: '2026-03-27T10:20:00.000Z',
          updated_at: '2026-03-27T10:20:02.000Z',
        }) as WorkflowJobRecord,
      markWorkflowJobSucceeded: async () => null,
      cancelWorkflowJob: async () => null,
      appendWorkflowJobEvent: async (input) => {
        queuedEvents.push({ eventType: input.eventType, payload: input.payload });
        return null;
      },
    },
  );

  assertEqual(started.workflowClaimed, true, 'W4.1 job start should claim the sibling aggregation job');
  assertEqual(started.workflowJobStatus, 'running', 'W4.1 job start should mark the group job running');
  assertEqual(started.workflowAttemptId, 1601, 'W4.1 job start should create a group attempt record');
  assert(
    String(enqueuedLogicalKey).includes('2026-03-27T10:20:00'),
    'W4.1 logical key should include claimedAt so forced sibling reruns do not collapse into one job identity',
  );
  assert(
    queuedEvents.some((event) => event.eventType === 'queued') &&
      queuedEvents.some((event) => event.eventType === 'claimed') &&
      queuedEvents.some((event) => event.eventType === 'started'),
    'W4.1 job start should emit queued, claimed, and started events',
  );
}

async function testW4PrintJobSkipsWhenAnotherActiveJobExists() {
  const calls: Array<{ fn: string; payload: unknown }> = [];
  const activeJob: WorkflowJobRecord = {
    id: 7777,
    job_type: 'w4-print-fulfillment',
    stage: '4',
    order_row_id: 874,
    order_id: 'W4-SANDBOX-PROOF-001',
    root_order_id: 'W4-SANDBOX-PROOF-001',
    amazon_order_id: null,
    book_id: 'book-mvp-simple-adventure',
    logical_key: 'print:2026-03-27T09:25:00Z',
    idempotency_key: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-001:print:active',
    status: 'polling',
    lease_owner: 'api:internal/w4/build-print-input',
    lease_expires_at: '2026-03-27T09:30:00.000Z',
    attempt_count: 1,
    max_attempts: 5,
    next_retry_at: null,
    external_provider: 'pdfmonkey',
    external_request_id: 'pdf-7777',
    external_status_url: 'https://api.pdfmonkey.io/api/v1/documents/pdf-7777',
    input_snapshot: {},
    normalized_input_snapshot: {},
    result_snapshot: {},
    last_error: null,
    queued_at: '2026-03-27T09:25:00.000Z',
    claimed_at: '2026-03-27T09:25:01.000Z',
    started_at: '2026-03-27T09:25:02.000Z',
    polling_at: '2026-03-27T09:25:03.000Z',
    completed_at: null,
    failed_at: null,
    dead_lettered_at: null,
    canceled_at: null,
    created_at: '2026-03-27T09:25:00.000Z',
    updated_at: '2026-03-27T09:25:03.000Z',
  };

  const started = await claimAndStartW4PrintJob(
    {
      orderId: 'W4-SANDBOX-PROOF-001',
      rootOrderId: 'W4-SANDBOX-PROOF-001',
      amazonOrderId: null,
      bookId: 'book-mvp-simple-adventure',
      characterHash: 'fixture-book1-w4-hash',
      manifest3Key: 'book/orders/W4-SANDBOX-PROOF-001/manifests/3-manifest.json',
      claimedAt: '2026-03-27T09:25:20.000Z',
    },
    {},
    {
      enqueueWorkflowJob: async () => {
        throw new Error('should not enqueue a duplicate W4 job while another is active');
      },
      getWorkflowJobById: async () => null,
      getWorkflowJobByIdempotencyKey: async () => null,
      listWorkflowJobsForOrder: async () => [activeJob],
      claimWorkflowJob: async () => null,
      incrementWorkflowJobAttemptCount: async () => null,
      createWorkflowJobAttempt: async () => null,
      getLatestWorkflowJobAttemptForJob: async (jobId: number) =>
        jobId === 7777
          ? ({
              id: 2004,
              job_id: 7777,
              attempt: 1,
              status: 'polling',
              worker_kind: 'n8n',
              lease_owner: 'api:internal/w4/build-print-input',
              started_at: '2026-03-27T09:25:02.000Z',
              ended_at: null,
              duration_ms: null,
              error_message: null,
              error_details: null,
              provider_request_id: 'pdf-7777',
              provider_status_url: 'https://api.pdfmonkey.io/api/v1/documents/pdf-7777',
              created_at: '2026-03-27T09:25:02.000Z',
              updated_at: '2026-03-27T09:25:03.000Z',
            } as WorkflowJobAttemptRecord)
          : null,
      finishWorkflowJobAttempt: async () => null,
      markWorkflowJobRunning: async () => null,
      markWorkflowJobSucceeded: async () => null,
      cancelWorkflowJob: async () => null,
      appendWorkflowJobEvent: async (input) => {
        calls.push({ fn: 'appendWorkflowJobEvent', payload: input });
        return null;
      },
    },
  );

  assertEqual(started.workflowJobId, 7777, 'W4 duplicate guard should point duplicate callers at the active print job');
  assertEqual(started.workflowAttemptId, 2004, 'W4 duplicate guard should surface the active attempt');
  assertEqual(started.workflowClaimed, false, 'W4 duplicate guard should not claim a second print job');
  assertEqual(started.workflowSkipped, true, 'W4 duplicate guard should mark the duplicate trigger skipped');
  assertEqual(
    started.workflowSkipReason,
    'active-w4-print-job-exists',
    'W4 duplicate guard should explain the duplicate skip reason',
  );
  assert(
    calls.some(
      (entry) =>
        entry.fn === 'appendWorkflowJobEvent' &&
        (entry.payload as { eventType?: string }).eventType === 'duplicate-trigger-skipped',
    ),
    'W4 duplicate guard should append a duplicate-trigger-skipped event to the winning active job',
  );
}

async function testW4PrintJobCancelsLaterOverlapAfterEnqueue() {
  const calls: Array<{ fn: string; payload: unknown }> = [];
  let listCallCount = 0;

  const earlierJob: WorkflowJobRecord = {
    id: 8800,
    job_type: 'w4-print-fulfillment',
    stage: '4',
    order_row_id: 874,
    order_id: 'W4-SANDBOX-PROOF-001',
    root_order_id: 'W4-SANDBOX-PROOF-001',
    amazon_order_id: null,
    book_id: 'book-mvp-simple-adventure',
    logical_key: 'print:2026-03-27T09:30:00Z',
    idempotency_key: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-001:print:older',
    status: 'running',
    lease_owner: 'api:internal/w4/build-print-input',
    lease_expires_at: '2026-03-27T09:31:00.000Z',
    attempt_count: 1,
    max_attempts: 5,
    next_retry_at: null,
    external_provider: 'pdfmonkey',
    external_request_id: 'pdf-8800',
    external_status_url: 'https://api.pdfmonkey.io/api/v1/documents/pdf-8800',
    input_snapshot: {},
    normalized_input_snapshot: {},
    result_snapshot: {},
    last_error: null,
    queued_at: '2026-03-27T09:30:00.000Z',
    claimed_at: '2026-03-27T09:30:01.000Z',
    started_at: '2026-03-27T09:30:02.000Z',
    polling_at: null,
    completed_at: null,
    failed_at: null,
    dead_lettered_at: null,
    canceled_at: null,
    created_at: '2026-03-27T09:30:00.000Z',
    updated_at: '2026-03-27T09:30:02.000Z',
  };

  const duplicateJob: WorkflowJobRecord = {
    ...earlierJob,
    id: 8801,
    logical_key: 'print:2026-03-27T09:30:01Z',
    idempotency_key: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-001:print:newer',
    status: 'queued',
    lease_owner: null,
    lease_expires_at: null,
    attempt_count: 0,
    external_request_id: null,
    external_status_url: null,
    claimed_at: null,
    started_at: null,
    created_at: '2026-03-27T09:30:01.000Z',
    updated_at: '2026-03-27T09:30:01.000Z',
  };

  const started = await claimAndStartW4PrintJob(
    {
      orderId: 'W4-SANDBOX-PROOF-001',
      rootOrderId: 'W4-SANDBOX-PROOF-001',
      amazonOrderId: null,
      bookId: 'book-mvp-simple-adventure',
      characterHash: 'fixture-book1-w4-hash',
      manifest3Key: 'book/orders/W4-SANDBOX-PROOF-001/manifests/3-manifest.json',
      claimedAt: '2026-03-27T09:30:01.000Z',
    },
    {},
    {
      enqueueWorkflowJob: async () => duplicateJob,
      getWorkflowJobById: async (jobId: number) => (jobId === 8800 ? earlierJob : duplicateJob),
      getWorkflowJobByIdempotencyKey: async () => null,
      listWorkflowJobsForOrder: async () => {
        listCallCount += 1;
        return listCallCount === 1 ? [] : [duplicateJob, earlierJob];
      },
      claimWorkflowJob: async () => {
        throw new Error('should not claim the later duplicate once an earlier active W4 job is visible');
      },
      incrementWorkflowJobAttemptCount: async () => null,
      createWorkflowJobAttempt: async () => null,
      getLatestWorkflowJobAttemptForJob: async (jobId: number) =>
        jobId === 8800
          ? ({
              id: 2005,
              job_id: 8800,
              attempt: 1,
              status: 'running',
              worker_kind: 'n8n',
              lease_owner: 'api:internal/w4/build-print-input',
              started_at: '2026-03-27T09:30:02.000Z',
              ended_at: null,
              duration_ms: null,
              error_message: null,
              error_details: null,
              provider_request_id: 'pdf-8800',
              provider_status_url: 'https://api.pdfmonkey.io/api/v1/documents/pdf-8800',
              created_at: '2026-03-27T09:30:02.000Z',
              updated_at: '2026-03-27T09:30:02.000Z',
            } as WorkflowJobAttemptRecord)
          : null,
      finishWorkflowJobAttempt: async () => null,
      markWorkflowJobRunning: async () => null,
      markWorkflowJobSucceeded: async () => null,
      cancelWorkflowJob: async (jobId: number, reason: string) => {
        calls.push({ fn: 'cancelWorkflowJob', payload: { jobId, reason } });
        return {
          ...duplicateJob,
          status: 'canceled',
          canceled_at: '2026-03-27T09:30:01.500Z',
          updated_at: '2026-03-27T09:30:01.500Z',
        } as WorkflowJobRecord;
      },
      appendWorkflowJobEvent: async (input) => {
        calls.push({ fn: 'appendWorkflowJobEvent', payload: input });
        return null;
      },
    },
  );

  assertEqual(started.workflowJobId, 8800, 'W4 overlap guard should redirect the later duplicate to the earlier active job');
  assertEqual(started.workflowAttemptId, 2005, 'W4 overlap guard should surface the winning active attempt');
  assertEqual(started.workflowSkipped, true, 'W4 overlap guard should mark the later duplicate skipped');
  assertEqual(
    started.workflowSkipReason,
    'active-w4-print-job-exists',
    'W4 overlap guard should explain the duplicate skip reason',
  );
  assert(
    calls.some(
      (entry) =>
        entry.fn === 'cancelWorkflowJob' &&
        (entry.payload as { jobId?: number }).jobId === 8801,
    ),
    'W4 overlap guard should cancel the later duplicate job row before provider work starts',
  );
}

async function testW4PrintCompletion() {
  const calls: Array<{ fn: string; payload: unknown }> = [];
  const olderJob: WorkflowJobRecord = {
    id: 9010,
    job_type: 'w4-print-fulfillment',
    stage: '4',
    order_row_id: null,
    order_id: 'W4-SANDBOX-PROOF-001',
    root_order_id: 'W4-SANDBOX-PROOF-001',
    amazon_order_id: null,
    book_id: 'book-mvp-simple-adventure',
    logical_key: 'print:2026-03-26T09:00:00.000Z',
    idempotency_key: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-001:print:old',
    status: 'succeeded',
    lease_owner: null,
    lease_expires_at: null,
    attempt_count: 1,
    max_attempts: 5,
    next_retry_at: null,
    external_provider: 'pdfmonkey',
    external_request_id: null,
    external_status_url: null,
    input_snapshot: {},
    normalized_input_snapshot: {},
    result_snapshot: {},
    last_error: null,
    queued_at: '2026-03-26T09:00:00.000Z',
    claimed_at: '2026-03-26T09:00:01.000Z',
    started_at: '2026-03-26T09:00:02.000Z',
    polling_at: null,
    completed_at: '2026-03-26T09:10:00.000Z',
    failed_at: null,
    dead_lettered_at: null,
    canceled_at: null,
    created_at: '2026-03-26T09:00:00.000Z',
    updated_at: '2026-03-26T09:10:00.000Z',
  };
  const activeJob: WorkflowJobRecord = {
    ...olderJob,
    id: 9011,
    logical_key: 'print:2026-03-27T09:34:00.000Z',
    idempotency_key: 'wf:4:w4-print-fulfillment:W4-SANDBOX-PROOF-001:print:new',
    status: 'running',
    lease_owner: 'api:internal/w4/build-print-input',
    lease_expires_at: '2026-03-27T09:40:00.000Z',
    completed_at: null,
    created_at: '2026-03-27T09:34:00.000Z',
    updated_at: '2026-03-27T09:34:10.000Z',
  };

  const completion = await completeW4PrintJobForOrder(
    {
      orderId: 'W4-SANDBOX-PROOF-001',
      submitMode: 'sandbox',
      manifestUrl: 'https://admin.littleherolabs.com/api/manifests/book/orders/W4-SANDBOX-PROOF-001/manifests/4-manifest.json',
      manifestKey: 'book/orders/W4-SANDBOX-PROOF-001/manifests/4-manifest.json',
      luluJobId: 'sandbox-job-001',
      luluStatus: 'CREATED',
    },
    {
      enqueueWorkflowJob: async () => null,
      getWorkflowJobById: async () => null,
      getWorkflowJobByIdempotencyKey: async () => null,
      listWorkflowJobsForOrder: async () => [olderJob, activeJob],
      claimWorkflowJob: async () => null,
      incrementWorkflowJobAttemptCount: async () => null,
      createWorkflowJobAttempt: async () => null,
      getLatestWorkflowJobAttemptForJob: async (jobId: number) =>
        jobId === 9011
          ? ({
              id: 2901,
              job_id: 9011,
              attempt: 1,
              status: 'running',
              worker_kind: 'n8n',
              lease_owner: 'api:internal/w4/build-print-input',
              started_at: '2026-03-27T09:34:01.000Z',
              ended_at: null,
              duration_ms: null,
              error_message: null,
              error_details: null,
              provider_request_id: null,
              provider_status_url: null,
              created_at: '2026-03-27T09:34:01.000Z',
              updated_at: '2026-03-27T09:34:01.000Z',
            } as WorkflowJobAttemptRecord)
          : null,
      finishWorkflowJobAttempt: async (input) => {
        calls.push({ fn: 'finishWorkflowJobAttempt', payload: input });
        return null;
      },
      markWorkflowJobRunning: async () => null,
      markWorkflowJobSucceeded: async (jobId, input) => {
        calls.push({ fn: 'markWorkflowJobSucceeded', payload: { jobId, input } });
        return {
          ...activeJob,
          status: 'succeeded',
          completed_at: '2026-03-27T09:35:00.000Z',
          result_snapshot: input.resultSnapshot ?? {},
        } as WorkflowJobRecord;
      },
      cancelWorkflowJob: async () => null,
      appendWorkflowJobEvent: async (input) => {
        calls.push({ fn: 'appendWorkflowJobEvent', payload: input });
        return null;
      },
    },
  );

  assertEqual(completion.job?.id ?? null, 9011, 'W4 completion should resolve the latest active print job');
  assertEqual(completion.attempt?.id ?? null, 2901, 'W4 completion should reuse the latest open attempt');
  assert(
    calls.some((entry) => entry.fn === 'finishWorkflowJobAttempt'),
    'W4 completion should finish the open attempt before marking the job succeeded',
  );
  assert(
    calls.some(
      (entry) =>
        entry.fn === 'markWorkflowJobSucceeded' &&
        (entry.payload as { jobId: number }).jobId === 9011,
    ),
    'W4 completion should mark the latest active print job succeeded',
  );
  assert(
    calls.some((entry) => entry.fn === 'appendWorkflowJobEvent'),
    'W4 completion should append a completed event',
  );
}

async function testW4SiblingCompletion() {
  const calls: Array<{ fn: string; payload: unknown }> = [];
  const activeJob: WorkflowJobRecord = {
    id: 9101,
    job_type: 'w4-sibling-aggregation',
    stage: '4.1',
    order_row_id: null,
    order_id: 'W4-SIBLING-PROOF-001',
    root_order_id: 'W4-SIBLING-PROOF-001',
    amazon_order_id: 'W4-SIBLING-PROOF-001',
    book_id: 'book-mvp-simple-adventure',
    logical_key: 'sibling-aggregation:2026-03-27T10:34:00.000Z',
    idempotency_key: 'wf:4.1:w4-sibling-aggregation:W4-SIBLING-PROOF-001:sibling-aggregation:new',
    status: 'running',
    lease_owner: 'api:internal/w4/build-sibling-print-input',
    lease_expires_at: '2026-03-27T10:40:00.000Z',
    attempt_count: 1,
    max_attempts: 5,
    next_retry_at: null,
    external_provider: 'pdfmonkey',
    external_request_id: null,
    external_status_url: null,
    input_snapshot: {},
    normalized_input_snapshot: {},
    result_snapshot: {},
    last_error: null,
    queued_at: '2026-03-27T10:34:00.000Z',
    claimed_at: '2026-03-27T10:34:01.000Z',
    started_at: '2026-03-27T10:34:02.000Z',
    polling_at: null,
    completed_at: null,
    failed_at: null,
    dead_lettered_at: null,
    canceled_at: null,
    created_at: '2026-03-27T10:34:00.000Z',
    updated_at: '2026-03-27T10:34:10.000Z',
  };

  const completion = await completeW4SiblingJobForGroup(
    {
      rootGroupId: 'W4-SIBLING-PROOF-001',
      orderIds: ['W4-SIBLING-PROOF-001-item-1', 'W4-SIBLING-PROOF-001-item-2'],
      submitMode: 'sandbox',
      manifestUrl: 'https://admin.littleherolabs.com/api/manifests/book/orders/W4-SIBLING-PROOF-001/manifests/4-manifest.json',
      manifestKey: 'book/orders/W4-SIBLING-PROOF-001/manifests/4-manifest.json',
      luluJobId: 'sandbox-sibling-job-001',
      luluStatus: 'CREATED',
    },
    {
      enqueueWorkflowJob: async () => null,
      getWorkflowJobById: async () => null,
      getWorkflowJobByIdempotencyKey: async () => null,
      listWorkflowJobsForOrder: async () => [activeJob],
      claimWorkflowJob: async () => null,
      incrementWorkflowJobAttemptCount: async () => null,
      createWorkflowJobAttempt: async () => null,
      getLatestWorkflowJobAttemptForJob: async () =>
        ({
          id: 3901,
          job_id: 9101,
          attempt: 1,
          status: 'running',
          worker_kind: 'n8n',
          lease_owner: 'api:internal/w4/build-sibling-print-input',
          started_at: '2026-03-27T10:34:01.000Z',
          ended_at: null,
          duration_ms: null,
          error_message: null,
          error_details: null,
          provider_request_id: null,
          provider_status_url: null,
          created_at: '2026-03-27T10:34:01.000Z',
          updated_at: '2026-03-27T10:34:01.000Z',
        }) as WorkflowJobAttemptRecord,
      finishWorkflowJobAttempt: async (input) => {
        calls.push({ fn: 'finishWorkflowJobAttempt', payload: input });
        return null;
      },
      markWorkflowJobRunning: async () => null,
      markWorkflowJobSucceeded: async (jobId, input) => {
        calls.push({ fn: 'markWorkflowJobSucceeded', payload: { jobId, input } });
        return {
          ...activeJob,
          status: 'succeeded',
          completed_at: '2026-03-27T10:35:00.000Z',
          result_snapshot: input.resultSnapshot ?? {},
        } as WorkflowJobRecord;
      },
      cancelWorkflowJob: async () => null,
      appendWorkflowJobEvent: async (input) => {
        calls.push({ fn: 'appendWorkflowJobEvent', payload: input });
        return null;
      },
    },
  );

  assertEqual(completion.job?.id ?? null, 9101, 'W4.1 completion should resolve the active sibling job');
  assertEqual(completion.attempt?.id ?? null, 3901, 'W4.1 completion should reuse the open sibling attempt');
  assert(
    calls.some((entry) => entry.fn === 'finishWorkflowJobAttempt'),
    'W4.1 completion should finish the open sibling attempt before marking the job succeeded',
  );
  assert(
    calls.some(
      (entry) =>
        entry.fn === 'markWorkflowJobSucceeded' &&
        (entry.payload as { jobId: number }).jobId === 9101,
    ),
    'W4.1 completion should mark the active sibling job succeeded',
  );
  assert(
    calls.some(
      (entry) =>
        entry.fn === 'appendWorkflowJobEvent' &&
        (entry.payload as { eventType?: string }).eventType === 'completed',
    ),
    'W4.1 completion should append a completed event',
  );
}

async function main() {
  testIdempotencyKeyStability();
  testUpsertRowNormalization();
  testClaimingAndLeaseRules();
  testRetryRules();
  testReplayAndEventShape();
  await testW2AReplayReusePath();
  await testWorkflowJobEventRoute();
  await testWorkflowJobEventRouteIgnoresLatePollRegression();
  await testW3AssemblyJobLifecycle();
  await testW3AssemblyJobSkipsWhenAnotherActiveJobExists();
  await testW3AssemblyJobCancelsLaterOverlapAfterEnqueue();
  await testW3AssemblyCompletion();
  await testW4PrintJobLifecycle();
  await testW4SiblingJobLifecycle();
  await testW4PrintJobSkipsWhenAnotherActiveJobExists();
  await testW4PrintJobCancelsLaterOverlapAfterEnqueue();
  await testW4PrintCompletion();
  await testW4SiblingCompletion();
  console.log('test-workflow-jobs: ok');
}

main().catch((error) => {
  console.error('[test-workflow-jobs] failure:', error);
  process.exit(1);
});
