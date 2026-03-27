import {
  appendWorkflowJobEvent,
  cancelWorkflowJob,
  claimWorkflowJob,
  createWorkflowJobAttempt,
  enqueueWorkflowJob,
  finishWorkflowJobAttempt,
  getLatestWorkflowJobAttemptForJob,
  getWorkflowJobById,
  getWorkflowJobByIdempotencyKey,
  incrementWorkflowJobAttemptCount,
  listWorkflowJobsForOrder,
  markWorkflowJobRunning,
  markWorkflowJobSucceeded,
} from './repository';
import { buildWorkflowJobIdempotencyKey, buildWorkflowJobLogicalKey } from './idempotency';
import type { WorkflowJobAttemptRecord, WorkflowJobRecord } from './types';

const W3_ASSEMBLY_JOB_TYPE = 'w3-book-assembly';
const W3_STAGE = '3';
const DEFAULT_W3_LEASE_OWNER = 'api:internal/w3/build-assembly-input';
const DEFAULT_W3_WORKER_KIND = 'n8n';

type JsonRecord = Record<string, unknown>;

export interface W3AssemblyWorkflowFields {
  workflowJobId: number;
  workflowJobIdempotencyKey: string;
  workflowJobStatus: string;
  workflowAttemptId: number | null;
  workflowAttempt: number | null;
  workflowClaimed: boolean;
  workflowSkipped: boolean;
  workflowSkipReason: string | null;
}

export interface W3AssemblyJobInput {
  orderId: string;
  rootOrderId?: string | null;
  amazonOrderId?: string | null;
  bookId: string;
  characterHash: string;
  formatId?: string | null;
  manifest2bKey?: string | null;
  manifest2bUrl?: string | null;
  manifest3Key?: string | null;
  manifest3Url?: string | null;
  backendUrl?: string | null;
  expectedPageCount?: number | null;
  pagePlanSource?: string | null;
  requiredPoseSource?: string | null;
  testMode?: boolean | null;
  testModePages?: number | null;
  claimedAt?: string | null;
  workflowJobId?: number | null;
  workflowJobIdempotencyKey?: string | null;
}

export interface ClaimW3AssemblyJobOptions {
  leaseOwner?: string;
  workerKind?: string;
  leaseMs?: number;
}

export interface CompleteW3AssemblyJobInput {
  orderId: string;
  manifestUrl?: string | null;
  manifestKey?: string | null;
  finalBookUrl?: string | null;
  finalCoverUrl?: string | null;
  pagesGenerated?: number | null;
  totalPagesRequired?: number | null;
  assemblyProgress?: number | null;
}

export interface CompleteW3AssemblyJobResult {
  job: WorkflowJobRecord | null;
  attempt: WorkflowJobAttemptRecord | null;
}

export interface W3AssemblyJobRepository {
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

const defaultRepository: W3AssemblyJobRepository = {
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

function toInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function buildWorkflowFields(
  job: WorkflowJobRecord,
  attempt: WorkflowJobAttemptRecord | null,
  workflowClaimed: boolean,
  workflowSkipped = false,
  workflowSkipReason: string | null = null,
): W3AssemblyWorkflowFields {
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

export function buildW3AssemblyLogicalKey(input: {
  claimedAt?: string | null;
  manifest3Key?: string | null;
}) {
  return buildWorkflowJobLogicalKey(
    'assembly',
    toTrimmedString(input.claimedAt) ?? toTrimmedString(input.manifest3Key) ?? 'current',
  );
}

export function buildW3AssemblyJobIdentity(input: W3AssemblyJobInput) {
  return {
    jobType: W3_ASSEMBLY_JOB_TYPE,
    stage: W3_STAGE,
    orderId: input.orderId,
    rootOrderId:
      toTrimmedString(input.rootOrderId) ??
      toTrimmedString(input.amazonOrderId),
    amazonOrderId:
      toTrimmedString(input.amazonOrderId) ??
      toTrimmedString(input.rootOrderId),
    bookId: input.bookId,
    logicalKey: buildW3AssemblyLogicalKey(input),
  };
}

function buildQueuedSnapshot(input: W3AssemblyJobInput): JsonRecord {
  return {
    orderId: input.orderId,
    rootOrderId: toTrimmedString(input.rootOrderId) ?? null,
    amazonOrderId: toTrimmedString(input.amazonOrderId) ?? null,
    bookId: input.bookId,
    characterHash: input.characterHash,
    formatId: toTrimmedString(input.formatId) ?? null,
    manifest2bKey: toTrimmedString(input.manifest2bKey) ?? null,
    manifest2bUrl: toTrimmedString(input.manifest2bUrl) ?? null,
    manifest3Key: toTrimmedString(input.manifest3Key) ?? null,
    manifest3Url: toTrimmedString(input.manifest3Url) ?? null,
    backendUrl: toTrimmedString(input.backendUrl) ?? null,
    expectedPageCount: toInteger(input.expectedPageCount) ?? null,
    pagePlanSource: toTrimmedString(input.pagePlanSource) ?? null,
    requiredPoseSource: toTrimmedString(input.requiredPoseSource) ?? null,
    testMode: toBoolean(input.testMode),
    testModePages: toInteger(input.testModePages) ?? 0,
    claimedAt: toTrimmedString(input.claimedAt) ?? null,
  };
}

async function resolveJobForW3Assembly(
  input: W3AssemblyJobInput,
  repository: W3AssemblyJobRepository,
): Promise<WorkflowJobRecord> {
  const explicitId = typeof input.workflowJobId === 'number' ? input.workflowJobId : null;
  if (explicitId) {
    const byId = await repository.getWorkflowJobById(explicitId);
    if (byId) {
      return byId;
    }
  }

  const identity = buildW3AssemblyJobIdentity(input);
  const idempotencyKey =
    toTrimmedString(input.workflowJobIdempotencyKey) ?? buildWorkflowJobIdempotencyKey(identity);
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
    throw new Error(`Unable to create W3 assembly workflow job for ${input.orderId}`);
  }

  await repository.appendWorkflowJobEvent({
    jobId: created.id,
    eventType: 'queued',
    payload: {
      stage: W3_STAGE,
      orderId: input.orderId,
      logicalKey: identity.logicalKey,
      source: 'build-assembly-input',
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

function pickLatestActiveW3AssemblyJob(jobs: WorkflowJobRecord[]): WorkflowJobRecord | null {
  const relevant = jobs.filter(
    (job) =>
      job.job_type === W3_ASSEMBLY_JOB_TYPE &&
      job.stage === W3_STAGE &&
      ['queued', 'claimed', 'running', 'polling', 'retry_waiting'].includes(job.status),
  );

  if (!relevant.length) {
    return null;
  }

  return [...relevant].sort(compareLatest)[0] ?? null;
}

function isActiveW3AssemblyStatus(status: string | null | undefined): boolean {
  return ['queued', 'claimed', 'running', 'polling', 'retry_waiting'].includes(status ?? '');
}

function isTerminalW3AssemblyStatus(status: string | null | undefined): boolean {
  return ['succeeded', 'failed', 'dead_lettered', 'canceled'].includes(status ?? '');
}

function pickCanonicalActiveW3AssemblyJob(jobs: WorkflowJobRecord[]): WorkflowJobRecord | null {
  const relevant = jobs.filter(
    (job) =>
      job.job_type === W3_ASSEMBLY_JOB_TYPE &&
      job.stage === W3_STAGE &&
      isActiveW3AssemblyStatus(job.status),
  );

  if (!relevant.length) {
    return null;
  }

  return [...relevant].sort(compareEarliest)[0] ?? null;
}

async function skipDuplicateW3AssemblyJob(
  currentJob: WorkflowJobRecord,
  winnerJob: WorkflowJobRecord,
  input: W3AssemblyJobInput,
  requestedIdentity: ReturnType<typeof buildW3AssemblyJobIdentity>,
  requestedIdempotencyKey: string,
  repository: W3AssemblyJobRepository,
): Promise<W3AssemblyWorkflowFields> {
  if (currentJob.id !== winnerJob.id && !isTerminalW3AssemblyStatus(currentJob.status)) {
    await repository.appendWorkflowJobEvent({
      jobId: currentJob.id,
      eventType: 'duplicate-trigger-superseded',
      payload: {
        orderId: input.orderId,
        requestedLogicalKey: requestedIdentity.logicalKey,
        requestedIdempotencyKey,
        winnerJobId: winnerJob.id,
        skipReason: 'active-w3-assembly-job-exists',
      },
    });
    await repository.cancelWorkflowJob(
      currentJob.id,
      `Superseded by active W3 assembly job ${winnerJob.id}`,
    );
  }

  const winnerAttempt = await repository.getLatestWorkflowJobAttemptForJob(winnerJob.id);
  await repository.appendWorkflowJobEvent({
    jobId: winnerJob.id,
    attemptId: winnerAttempt?.id ?? null,
    eventType: 'duplicate-trigger-skipped',
    payload: {
      orderId: input.orderId,
      requestedLogicalKey: requestedIdentity.logicalKey,
      requestedIdempotencyKey,
      skippedJobId: currentJob.id,
      skipReason: 'active-w3-assembly-job-exists',
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
    'active-w3-assembly-job-exists',
  );
}

export async function claimAndStartW3AssemblyJob(
  input: W3AssemblyJobInput,
  options: ClaimW3AssemblyJobOptions = {},
  repository: W3AssemblyJobRepository = defaultRepository,
): Promise<W3AssemblyWorkflowFields> {
  const explicitJobId = typeof input.workflowJobId === 'number' ? input.workflowJobId : null;
  const requestedIdentity = buildW3AssemblyJobIdentity(input);
  const requestedIdempotencyKey =
    toTrimmedString(input.workflowJobIdempotencyKey) ??
    buildWorkflowJobIdempotencyKey(requestedIdentity);

  if (!explicitJobId) {
    const existingJobs = await repository.listWorkflowJobsForOrder(input.orderId);
    const activeSiblingJob =
      [...existingJobs]
        .filter(
          (job) =>
            job.job_type === W3_ASSEMBLY_JOB_TYPE &&
            job.stage === W3_STAGE &&
            isActiveW3AssemblyStatus(job.status) &&
            job.idempotency_key !== requestedIdempotencyKey,
        )
        .sort(compareLatest)[0] ?? null;

    if (activeSiblingJob) {
      const activeAttempt = await repository.getLatestWorkflowJobAttemptForJob(activeSiblingJob.id);
      await repository.appendWorkflowJobEvent({
        jobId: activeSiblingJob.id,
        attemptId: activeAttempt?.id ?? null,
        eventType: 'duplicate-trigger-skipped',
        payload: {
          orderId: input.orderId,
          requestedLogicalKey: requestedIdentity.logicalKey,
          requestedIdempotencyKey,
          skipReason: 'active-w3-assembly-job-exists',
        },
      });

      return buildWorkflowFields(
        activeSiblingJob,
        activeAttempt,
        false,
        true,
        'active-w3-assembly-job-exists',
      );
    }
  }

  const job = await resolveJobForW3Assembly(input, repository);

  if (!explicitJobId) {
    const existingJobs = await repository.listWorkflowJobsForOrder(input.orderId);
    const canonicalActiveJob = pickCanonicalActiveW3AssemblyJob(existingJobs);
    if (canonicalActiveJob && canonicalActiveJob.id !== job.id) {
      return skipDuplicateW3AssemblyJob(
        job,
        canonicalActiveJob,
        input,
        requestedIdentity,
        requestedIdempotencyKey,
        repository,
      );
    }
  }

  const leaseOwner = options.leaseOwner ?? DEFAULT_W3_LEASE_OWNER;
  const workerKind = options.workerKind ?? DEFAULT_W3_WORKER_KIND;

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
        orderId: input.orderId,
        logicalKey: requestedIdentity.logicalKey,
      },
    });

    const current = (await repository.getWorkflowJobById(job.id)) ?? job;
    const currentAttempt = await repository.getLatestWorkflowJobAttemptForJob(current.id);
    const skipReason = isActiveW3AssemblyStatus(current.status)
      ? 'w3-assembly-job-already-active'
      : isTerminalW3AssemblyStatus(current.status)
        ? 'w3-assembly-job-already-finished'
        : 'w3-assembly-job-claim-conflict';
    return buildWorkflowFields(current, currentAttempt, false, true, skipReason);
  }

  if (!explicitJobId) {
    const existingJobs = await repository.listWorkflowJobsForOrder(input.orderId);
    const canonicalActiveJob = pickCanonicalActiveW3AssemblyJob(existingJobs);
    if (canonicalActiveJob && canonicalActiveJob.id !== claimedJob.id) {
      return skipDuplicateW3AssemblyJob(
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
      orderId: input.orderId,
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
      orderId: input.orderId,
    },
  });

  return buildWorkflowFields(running ?? claimedJob, attempt, true, false, null);
}

export async function completeW3AssemblyJobForOrder(
  input: CompleteW3AssemblyJobInput,
  repository: W3AssemblyJobRepository = defaultRepository,
): Promise<CompleteW3AssemblyJobResult> {
  const orderId = toTrimmedString(input.orderId);
  if (!orderId) {
    throw new Error('W3 assembly completion requires orderId');
  }

  const jobs = await repository.listWorkflowJobsForOrder(orderId, undefined, 50);
  const job = pickLatestActiveW3AssemblyJob(jobs);
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

  const resultSnapshot: JsonRecord = {
    orderId,
    manifestUrl: toTrimmedString(input.manifestUrl) ?? null,
    manifestKey: toTrimmedString(input.manifestKey) ?? null,
    finalBookUrl: toTrimmedString(input.finalBookUrl) ?? null,
    finalCoverUrl: toTrimmedString(input.finalCoverUrl) ?? null,
    pagesGenerated: toInteger(input.pagesGenerated) ?? null,
    totalPagesRequired: toInteger(input.totalPagesRequired) ?? null,
    assemblyProgress:
      typeof input.assemblyProgress === 'number' && Number.isFinite(input.assemblyProgress)
        ? input.assemblyProgress
        : null,
  };

  const succeeded =
    (await repository.markWorkflowJobSucceeded(job.id, {
      externalProvider: 'pdfmonkey',
      resultSnapshot,
    })) ?? job;

  await repository.appendWorkflowJobEvent({
    jobId: job.id,
    attemptId: attempt?.id ?? null,
    eventType: 'completed',
    payload: {
      orderId,
      manifestUrl: resultSnapshot.manifestUrl,
      pagesGenerated: resultSnapshot.pagesGenerated,
      totalPagesRequired: resultSnapshot.totalPagesRequired,
    },
  });

  return {
    job: succeeded,
    attempt,
  };
}
