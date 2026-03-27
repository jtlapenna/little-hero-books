import {
  appendWorkflowJobEvent,
  cancelWorkflowJob,
  claimWorkflowJob,
  createWorkflowJobAttempt,
  finishWorkflowJobAttempt,
  getLatestWorkflowJobAttemptForJob,
  getWorkflowJobById,
  getWorkflowJobByIdempotencyKey,
  incrementWorkflowJobAttemptCount,
  listWorkflowJobsForOrder,
  markWorkflowJobRunning,
  markWorkflowJobSucceeded,
  enqueueWorkflowJob,
} from './repository';
import { buildWorkflowJobIdempotencyKey, buildWorkflowJobLogicalKey } from './idempotency';
import type { WorkflowJobAttemptRecord, WorkflowJobRecord } from './types';

const W4_SIBLING_JOB_TYPE = 'w4-sibling-aggregation';
const W41_STAGE = '4.1';
const DEFAULT_W41_LEASE_OWNER = 'api:internal/w4/build-sibling-print-input';
const DEFAULT_W41_WORKER_KIND = 'n8n';

type JsonRecord = Record<string, unknown>;

export interface W4SiblingWorkflowFields {
  workflowJobId: number | null;
  workflowJobIdempotencyKey: string | null;
  workflowJobStatus: string;
  workflowAttemptId: number | null;
  workflowAttempt: number | null;
  workflowClaimed: boolean;
  workflowSkipped: boolean;
  workflowSkipReason: string | null;
}

export interface W4SiblingJobInput {
  rootGroupId: string;
  rootOrderId?: string | null;
  amazonOrderId?: string | null;
  bookId: string;
  orderIds: string[];
  siblingCount: number;
  claimedAt?: string | null;
  workflowJobId?: number | null;
  workflowJobIdempotencyKey?: string | null;
}

export interface ClaimW4SiblingJobOptions {
  leaseOwner?: string;
  workerKind?: string;
  leaseMs?: number;
}

export interface CompleteW4SiblingJobInput {
  rootGroupId: string;
  orderIds?: string[] | null;
  submitMode?: string | null;
  manifestUrl?: string | null;
  manifestKey?: string | null;
  luluJobId?: string | null;
  luluStatus?: string | null;
}

export interface CompleteW4SiblingJobResult {
  job: WorkflowJobRecord | null;
  attempt: WorkflowJobAttemptRecord | null;
}

export interface W4SiblingJobRepository {
  enqueueWorkflowJob: typeof enqueueWorkflowJob;
  getWorkflowJobById: typeof getWorkflowJobById;
  getWorkflowJobByIdempotencyKey: typeof getWorkflowJobByIdempotencyKey;
  listWorkflowJobsForOrder: typeof listWorkflowJobsForOrder;
  claimWorkflowJob: typeof claimWorkflowJob;
  incrementWorkflowJobAttemptCount: typeof incrementWorkflowJobAttemptCount;
  createWorkflowJobAttempt: typeof createWorkflowJobAttempt;
  getLatestWorkflowJobAttemptForJob: typeof getLatestWorkflowJobAttemptForJob;
  finishWorkflowJobAttempt: typeof finishWorkflowJobAttempt;
  markWorkflowJobRunning: typeof markWorkflowJobRunning;
  markWorkflowJobSucceeded: typeof markWorkflowJobSucceeded;
  appendWorkflowJobEvent: typeof appendWorkflowJobEvent;
  cancelWorkflowJob: typeof cancelWorkflowJob;
}

const defaultRepository: W4SiblingJobRepository = {
  enqueueWorkflowJob,
  getWorkflowJobById,
  getWorkflowJobByIdempotencyKey,
  listWorkflowJobsForOrder,
  claimWorkflowJob,
  incrementWorkflowJobAttemptCount,
  createWorkflowJobAttempt,
  getLatestWorkflowJobAttemptForJob,
  finishWorkflowJobAttempt,
  markWorkflowJobRunning,
  markWorkflowJobSucceeded,
  appendWorkflowJobEvent,
  cancelWorkflowJob,
};

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildWorkflowFields(
  job: WorkflowJobRecord,
  attempt: WorkflowJobAttemptRecord | null,
  workflowClaimed: boolean,
  workflowSkipped = false,
  workflowSkipReason: string | null = null,
): W4SiblingWorkflowFields {
  return {
    workflowJobId: job.id,
    workflowJobIdempotencyKey: job.idempotency_key,
    workflowJobStatus: job.status,
    workflowAttemptId: attempt?.id ?? null,
    workflowAttempt: attempt?.attempt ?? null,
    workflowClaimed,
    workflowSkipped,
    workflowSkipReason,
  };
}

export function buildSkippedW4SiblingWorkflowFields(
  skipReason: string,
  status = 'skipped',
): W4SiblingWorkflowFields {
  return {
    workflowJobId: null,
    workflowJobIdempotencyKey: null,
    workflowJobStatus: status,
    workflowAttemptId: null,
    workflowAttempt: null,
    workflowClaimed: false,
    workflowSkipped: true,
    workflowSkipReason: skipReason,
  };
}

export function buildW4SiblingLogicalKey(input: { claimedAt?: string | null }) {
  return buildWorkflowJobLogicalKey(
    'sibling-aggregation',
    toTrimmedString(input.claimedAt) ?? 'current',
  );
}

export function buildW4SiblingJobIdentity(input: W4SiblingJobInput) {
  const rootGroupId = toTrimmedString(input.rootGroupId) ?? '';
  return {
    jobType: W4_SIBLING_JOB_TYPE,
    stage: W41_STAGE,
    orderId: rootGroupId,
    rootOrderId:
      toTrimmedString(input.rootOrderId) ??
      rootGroupId,
    amazonOrderId:
      toTrimmedString(input.amazonOrderId) ??
      toTrimmedString(input.rootOrderId) ??
      rootGroupId,
    bookId: input.bookId,
    logicalKey: buildW4SiblingLogicalKey(input),
  };
}

function buildQueuedSnapshot(input: W4SiblingJobInput): JsonRecord {
  return {
    rootGroupId: input.rootGroupId,
    rootOrderId: toTrimmedString(input.rootOrderId) ?? null,
    amazonOrderId: toTrimmedString(input.amazonOrderId) ?? null,
    bookId: input.bookId,
    orderIds: input.orderIds,
    siblingCount: input.siblingCount,
    claimedAt: toTrimmedString(input.claimedAt) ?? null,
  };
}

async function resolveJobForW4Sibling(
  input: W4SiblingJobInput,
  repository: W4SiblingJobRepository,
): Promise<WorkflowJobRecord> {
  const explicitId = typeof input.workflowJobId === 'number' ? input.workflowJobId : null;
  if (explicitId) {
    const byId = await repository.getWorkflowJobById(explicitId);
    if (byId) {
      return byId;
    }
  }

  const identity = buildW4SiblingJobIdentity(input);
  const idempotencyKey =
    toTrimmedString(input.workflowJobIdempotencyKey) ??
    buildWorkflowJobIdempotencyKey(identity);
  const existing = await repository.getWorkflowJobByIdempotencyKey(idempotencyKey);
  if (existing) {
    return existing;
  }

  const created = await repository.enqueueWorkflowJob({
    ...identity,
    idempotencyKey,
    externalProvider: 'pdfmonkey',
    inputSnapshot: buildQueuedSnapshot(input),
    normalizedInputSnapshot: buildQueuedSnapshot(input),
  });

  if (!created) {
    throw new Error(`Unable to create W4 sibling workflow job for ${input.rootGroupId}`);
  }

  await repository.appendWorkflowJobEvent({
    jobId: created.id,
    eventType: 'queued',
    payload: {
      stage: W41_STAGE,
      rootGroupId: input.rootGroupId,
      orderIds: input.orderIds,
      logicalKey: identity.logicalKey,
      source: 'build-sibling-print-input',
    },
  });

  return created;
}

function compareLatest(left: WorkflowJobRecord, right: WorkflowJobRecord): number {
  const leftTime = Date.parse(left.created_at || left.updated_at || left.queued_at || '');
  const rightTime = Date.parse(right.created_at || right.updated_at || right.queued_at || '');
  return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
}

function compareEarliest(left: WorkflowJobRecord, right: WorkflowJobRecord): number {
  const leftTime = Date.parse(left.created_at || left.queued_at || left.updated_at || '');
  const rightTime = Date.parse(right.created_at || right.queued_at || right.updated_at || '');
  const leftValue = Number.isFinite(leftTime) ? leftTime : 0;
  const rightValue = Number.isFinite(rightTime) ? rightTime : 0;
  if (leftValue !== rightValue) {
    return leftValue - rightValue;
  }
  return left.id - right.id;
}

function isActiveW4SiblingStatus(status: string | null | undefined): boolean {
  return ['queued', 'claimed', 'running', 'polling', 'retry_waiting'].includes(status ?? '');
}

function isTerminalW4SiblingStatus(status: string | null | undefined): boolean {
  return ['succeeded', 'failed', 'dead_lettered', 'canceled'].includes(status ?? '');
}

function pickCanonicalActiveW4SiblingJob(jobs: WorkflowJobRecord[]): WorkflowJobRecord | null {
  const relevant = jobs.filter(
    (job) =>
      job.job_type === W4_SIBLING_JOB_TYPE &&
      job.stage === W41_STAGE &&
      isActiveW4SiblingStatus(job.status),
  );

  if (!relevant.length) {
    return null;
  }

  return [...relevant].sort(compareEarliest)[0] ?? null;
}

function pickLatestActiveW4SiblingJob(jobs: WorkflowJobRecord[]): WorkflowJobRecord | null {
  const relevant = jobs.filter(
    (job) =>
      job.job_type === W4_SIBLING_JOB_TYPE &&
      job.stage === W41_STAGE &&
      isActiveW4SiblingStatus(job.status),
  );

  if (!relevant.length) {
    return null;
  }

  return [...relevant].sort(compareLatest)[0] ?? null;
}

async function skipDuplicateW4SiblingJob(
  currentJob: WorkflowJobRecord,
  winnerJob: WorkflowJobRecord,
  input: W4SiblingJobInput,
  requestedIdentity: ReturnType<typeof buildW4SiblingJobIdentity>,
  requestedIdempotencyKey: string,
  repository: W4SiblingJobRepository,
): Promise<W4SiblingWorkflowFields> {
  if (currentJob.id !== winnerJob.id && !isTerminalW4SiblingStatus(currentJob.status)) {
    await repository.appendWorkflowJobEvent({
      jobId: currentJob.id,
      eventType: 'duplicate-trigger-superseded',
      payload: {
        rootGroupId: input.rootGroupId,
        requestedLogicalKey: requestedIdentity.logicalKey,
        requestedIdempotencyKey,
        winnerJobId: winnerJob.id,
        skipReason: 'active-w4-sibling-job-exists',
      },
    });
    await repository.cancelWorkflowJob(
      currentJob.id,
      `Superseded by active W4 sibling job ${winnerJob.id}`,
    );
  }

  const winnerAttempt = await repository.getLatestWorkflowJobAttemptForJob(winnerJob.id);
  await repository.appendWorkflowJobEvent({
    jobId: winnerJob.id,
    attemptId: winnerAttempt?.id ?? null,
    eventType: 'duplicate-trigger-skipped',
    payload: {
      rootGroupId: input.rootGroupId,
      requestedLogicalKey: requestedIdentity.logicalKey,
      requestedIdempotencyKey,
      skippedJobId: currentJob.id,
      skipReason: 'active-w4-sibling-job-exists',
    },
  });

  const currentWinner = (await repository.getWorkflowJobById(winnerJob.id)) ?? winnerJob;
  const currentWinnerAttempt =
    winnerAttempt ??
    (await repository.getLatestWorkflowJobAttemptForJob(currentWinner.id));
  return buildWorkflowFields(
    currentWinner,
    currentWinnerAttempt,
    false,
    true,
    'active-w4-sibling-job-exists',
  );
}

export async function claimAndStartW4SiblingJob(
  input: W4SiblingJobInput,
  options: ClaimW4SiblingJobOptions = {},
  repository: W4SiblingJobRepository = defaultRepository,
): Promise<W4SiblingWorkflowFields> {
  const explicitJobId = typeof input.workflowJobId === 'number' ? input.workflowJobId : null;
  const requestedIdentity = buildW4SiblingJobIdentity(input);
  const requestedIdempotencyKey =
    toTrimmedString(input.workflowJobIdempotencyKey) ??
    buildWorkflowJobIdempotencyKey(requestedIdentity);

  if (!explicitJobId) {
    const existingJobs = await repository.listWorkflowJobsForOrder(input.rootGroupId);
    const activeGroupJob =
      [...existingJobs]
        .filter(
          (job) =>
            job.job_type === W4_SIBLING_JOB_TYPE &&
            job.stage === W41_STAGE &&
            isActiveW4SiblingStatus(job.status) &&
            job.idempotency_key !== requestedIdempotencyKey,
        )
        .sort(compareLatest)[0] ?? null;

    if (activeGroupJob) {
      const activeAttempt = await repository.getLatestWorkflowJobAttemptForJob(activeGroupJob.id);
      await repository.appendWorkflowJobEvent({
        jobId: activeGroupJob.id,
        attemptId: activeAttempt?.id ?? null,
        eventType: 'duplicate-trigger-skipped',
        payload: {
          rootGroupId: input.rootGroupId,
          requestedLogicalKey: requestedIdentity.logicalKey,
          requestedIdempotencyKey,
          skipReason: 'active-w4-sibling-job-exists',
        },
      });

      return buildWorkflowFields(
        activeGroupJob,
        activeAttempt,
        false,
        true,
        'active-w4-sibling-job-exists',
      );
    }
  }

  const job = await resolveJobForW4Sibling(input, repository);

  if (!explicitJobId) {
    const existingJobs = await repository.listWorkflowJobsForOrder(input.rootGroupId);
    const canonicalActiveJob = pickCanonicalActiveW4SiblingJob(existingJobs);
    if (canonicalActiveJob && canonicalActiveJob.id !== job.id) {
      return skipDuplicateW4SiblingJob(
        job,
        canonicalActiveJob,
        input,
        requestedIdentity,
        requestedIdempotencyKey,
        repository,
      );
    }
  }

  const leaseOwner = options.leaseOwner ?? DEFAULT_W41_LEASE_OWNER;
  const workerKind = options.workerKind ?? DEFAULT_W41_WORKER_KIND;

  const claimedJob = await repository.claimWorkflowJob(job.id, {
    leaseOwner,
    leaseMs: options.leaseMs,
  });

  if (!claimedJob) {
    await repository.appendWorkflowJobEvent({
      jobId: job.id,
      eventType: 'claim-conflict',
      payload: {
        leaseOwner,
        rootGroupId: input.rootGroupId,
        logicalKey: requestedIdentity.logicalKey,
      },
    });

    const current = (await repository.getWorkflowJobById(job.id)) ?? job;
    const currentAttempt = await repository.getLatestWorkflowJobAttemptForJob(current.id);
    const skipReason = isActiveW4SiblingStatus(current.status)
      ? 'w4-sibling-job-already-active'
      : isTerminalW4SiblingStatus(current.status)
        ? 'w4-sibling-job-already-finished'
        : 'w4-sibling-job-claim-conflict';
    return buildWorkflowFields(current, currentAttempt, false, true, skipReason);
  }

  if (!explicitJobId) {
    const existingJobs = await repository.listWorkflowJobsForOrder(input.rootGroupId);
    const canonicalActiveJob = pickCanonicalActiveW4SiblingJob(existingJobs);
    if (canonicalActiveJob && canonicalActiveJob.id !== claimedJob.id) {
      return skipDuplicateW4SiblingJob(
        claimedJob,
        canonicalActiveJob,
        input,
        requestedIdentity,
        requestedIdempotencyKey,
        repository,
      );
    }
  }

  await repository.appendWorkflowJobEvent({
    jobId: claimedJob.id,
    eventType: 'claimed',
    payload: {
      leaseOwner,
      workerKind,
      rootGroupId: input.rootGroupId,
      orderIds: input.orderIds,
    },
  });

  const incremented = await repository.incrementWorkflowJobAttemptCount(claimedJob.id);
  const attemptNumber = incremented?.attempt_count ?? (claimedJob.attempt_count + 1);
  const attempt = await repository.createWorkflowJobAttempt({
    jobId: claimedJob.id,
    attempt: attemptNumber,
    status: 'running',
    workerKind,
    leaseOwner,
    startedAt: new Date().toISOString(),
  });

  const running = await repository.markWorkflowJobRunning(claimedJob.id, {
    externalProvider: 'pdfmonkey',
  });

  await repository.appendWorkflowJobEvent({
    jobId: claimedJob.id,
    attemptId: attempt?.id ?? null,
    eventType: 'started',
    payload: {
      leaseOwner,
      workerKind,
      rootGroupId: input.rootGroupId,
      orderIds: input.orderIds,
    },
  });

  return buildWorkflowFields(running ?? claimedJob, attempt, true, false, null);
}

export async function completeW4SiblingJobForGroup(
  input: CompleteW4SiblingJobInput,
  repository: W4SiblingJobRepository = defaultRepository,
): Promise<CompleteW4SiblingJobResult> {
  const rootGroupId = toTrimmedString(input.rootGroupId);
  if (!rootGroupId) {
    throw new Error('W4 sibling completion requires rootGroupId');
  }

  const jobs = await repository.listWorkflowJobsForOrder(rootGroupId, undefined, 50);
  const job = pickLatestActiveW4SiblingJob(jobs);
  if (!job) {
    return {
      job: null,
      attempt: null,
    };
  }

  const attempt = await repository.getLatestWorkflowJobAttemptForJob(job.id);
  if (attempt && !attempt.ended_at) {
    await repository.finishWorkflowJobAttempt({
      attemptId: attempt.id,
      status: 'succeeded',
    });
  }

  const submitMode = toTrimmedString(input.submitMode) ?? null;
  const resultSnapshot: JsonRecord = {
    rootGroupId,
    orderIds: input.orderIds ?? null,
    submitMode,
    manifestUrl: toTrimmedString(input.manifestUrl) ?? null,
    manifestKey: toTrimmedString(input.manifestKey) ?? null,
    luluJobId: toTrimmedString(input.luluJobId) ?? null,
    luluStatus: toTrimmedString(input.luluStatus) ?? null,
  };

  const succeeded =
    (await repository.markWorkflowJobSucceeded(job.id, {
      externalProvider: submitMode === 'sandbox' ? 'lulu-sandbox' : 'lulu',
      resultSnapshot,
    })) ?? job;

  await repository.appendWorkflowJobEvent({
    jobId: job.id,
    attemptId: attempt?.id ?? null,
    eventType: 'completed',
    payload: {
      rootGroupId,
      orderIds: input.orderIds ?? null,
      submitMode,
      manifestUrl: resultSnapshot.manifestUrl,
      luluJobId: resultSnapshot.luluJobId,
      luluStatus: resultSnapshot.luluStatus,
    },
  });

  return {
    job: succeeded,
    attempt,
  };
}
