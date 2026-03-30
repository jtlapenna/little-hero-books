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

const W4_PRINT_JOB_TYPE = 'w4-print-fulfillment';
const W4_STAGE = '4';
const DEFAULT_W4_LEASE_OWNER = 'api:internal/w4/build-print-input';
const DEFAULT_W4_WORKER_KIND = 'n8n';

type JsonRecord = Record<string, unknown>;

export interface W4PrintWorkflowFields {
  workflowJobId: number | null;
  workflowJobIdempotencyKey: string | null;
  workflowJobStatus: string;
  workflowAttemptId: number | null;
  workflowAttempt: number | null;
  workflowClaimed: boolean;
  workflowSkipped: boolean;
  workflowSkipReason: string | null;
}

export interface W4PrintJobInput {
  orderId: string;
  rootOrderId?: string | null;
  amazonOrderId?: string | null;
  bookId: string;
  characterHash: string;
  formatId?: string | null;
  manifest3Key?: string | null;
  manifest3Url?: string | null;
  manifest4Key?: string | null;
  manifest4Url?: string | null;
  backendUrl?: string | null;
  expectedPageCount?: number | null;
  pageLabels?: string[] | null;
  pageImageUrls?: string[] | null;
  coverPreviewUrl?: string | null;
  pdfR2Key?: string | null;
  coverPdfR2Key?: string | null;
  shipping_tier?: string | null;
  shippingTier?: string | null;
  claimedAt?: string | null;
  workflowJobId?: number | null;
  workflowJobIdempotencyKey?: string | null;
}

export interface ClaimW4PrintJobOptions {
  leaseOwner?: string;
  workerKind?: string;
  leaseMs?: number;
}

export interface CompleteW4PrintJobInput {
  orderId: string;
  submitMode?: string | null;
  manifestUrl?: string | null;
  manifestKey?: string | null;
  luluJobId?: string | null;
  luluStatus?: unknown;
  luluStatusDetail?: JsonRecord | null;
}

export interface CompleteW4PrintJobResult {
  job: WorkflowJobRecord | null;
  attempt: WorkflowJobAttemptRecord | null;
}

export interface W4PrintJobRepository {
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

const defaultRepository: W4PrintJobRepository = {
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

function normalizeLuluStatusValue(
  value: unknown,
  explicitDetail?: JsonRecord | null,
): { status: string | null; detail: JsonRecord | null } {
  const direct = toTrimmedString(value);
  if (direct) {
    return { status: direct, detail: explicitDetail ?? null };
  }

  const detail =
    explicitDetail ??
    (value && typeof value === 'object' && !Array.isArray(value)
      ? (value as JsonRecord)
      : null);
  if (!detail) {
    return { status: null, detail: null };
  }

  const status =
    toTrimmedString(detail.name) ??
    toTrimmedString(detail.status) ??
    toTrimmedString(detail.state) ??
    null;

  return { status, detail };
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

function buildWorkflowFields(
  job: WorkflowJobRecord,
  attempt: WorkflowJobAttemptRecord | null,
  workflowClaimed: boolean,
  workflowSkipped = false,
  workflowSkipReason: string | null = null,
): W4PrintWorkflowFields {
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

export function buildSkippedW4PrintWorkflowFields(
  skipReason: string,
  status = 'skipped',
): W4PrintWorkflowFields {
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

export function buildW4PrintLogicalKey(input: {
  claimedAt?: string | null;
  manifest3Key?: string | null;
}) {
  return buildWorkflowJobLogicalKey(
    'print',
    toTrimmedString(input.claimedAt) ?? toTrimmedString(input.manifest3Key) ?? 'current',
  );
}

export function buildW4PrintJobIdentity(input: W4PrintJobInput) {
  return {
    jobType: W4_PRINT_JOB_TYPE,
    stage: W4_STAGE,
    orderId: input.orderId,
    rootOrderId:
      toTrimmedString(input.rootOrderId) ??
      toTrimmedString(input.amazonOrderId),
    amazonOrderId:
      toTrimmedString(input.amazonOrderId) ??
      toTrimmedString(input.rootOrderId),
    bookId: input.bookId,
    logicalKey: buildW4PrintLogicalKey(input),
  };
}

function buildQueuedSnapshot(input: W4PrintJobInput): JsonRecord {
  return {
    orderId: input.orderId,
    rootOrderId: toTrimmedString(input.rootOrderId) ?? null,
    amazonOrderId: toTrimmedString(input.amazonOrderId) ?? null,
    bookId: input.bookId,
    characterHash: input.characterHash,
    formatId: toTrimmedString(input.formatId) ?? null,
    manifest3Key: toTrimmedString(input.manifest3Key) ?? null,
    manifest3Url: toTrimmedString(input.manifest3Url) ?? null,
    manifest4Key: toTrimmedString(input.manifest4Key) ?? null,
    manifest4Url: toTrimmedString(input.manifest4Url) ?? null,
    backendUrl: toTrimmedString(input.backendUrl) ?? null,
    expectedPageCount: toInteger(input.expectedPageCount) ?? null,
    pageLabels: Array.isArray(input.pageLabels) ? input.pageLabels : [],
    pageImageCount: Array.isArray(input.pageImageUrls) ? input.pageImageUrls.length : 0,
    coverPreviewUrl: toTrimmedString(input.coverPreviewUrl) ?? null,
    pdfR2Key: toTrimmedString(input.pdfR2Key) ?? null,
    coverPdfR2Key: toTrimmedString(input.coverPdfR2Key) ?? null,
    shippingTier:
      toTrimmedString(input.shipping_tier) ??
      toTrimmedString(input.shippingTier) ??
      null,
    claimedAt: toTrimmedString(input.claimedAt) ?? null,
  };
}

async function resolveJobForW4Print(
  input: W4PrintJobInput,
  repository: W4PrintJobRepository,
): Promise<WorkflowJobRecord> {
  const explicitId = typeof input.workflowJobId === 'number' ? input.workflowJobId : null;
  if (explicitId) {
    const byId = await repository.getWorkflowJobById(explicitId);
    if (byId) {
      return byId;
    }
  }

  const identity = buildW4PrintJobIdentity(input);
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
    throw new Error(`Unable to create W4 print workflow job for ${input.orderId}`);
  }

  await repository.appendWorkflowJobEvent({
    jobId: created.id,
    eventType: 'queued',
    payload: {
      stage: W4_STAGE,
      orderId: input.orderId,
      logicalKey: identity.logicalKey,
      source: 'build-print-input',
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

function isActiveW4PrintStatus(status: string | null | undefined): boolean {
  return ['queued', 'claimed', 'running', 'polling', 'retry_waiting'].includes(status ?? '');
}

function isTerminalW4PrintStatus(status: string | null | undefined): boolean {
  return ['succeeded', 'failed', 'dead_lettered', 'canceled'].includes(status ?? '');
}

function pickLatestActiveW4PrintJob(jobs: WorkflowJobRecord[]): WorkflowJobRecord | null {
  const relevant = jobs.filter(
    (job) =>
      job.job_type === W4_PRINT_JOB_TYPE &&
      job.stage === W4_STAGE &&
      isActiveW4PrintStatus(job.status),
  );

  if (!relevant.length) {
    return null;
  }

  return [...relevant].sort(compareLatest)[0] ?? null;
}

function pickCanonicalActiveW4PrintJob(jobs: WorkflowJobRecord[]): WorkflowJobRecord | null {
  const relevant = jobs.filter(
    (job) =>
      job.job_type === W4_PRINT_JOB_TYPE &&
      job.stage === W4_STAGE &&
      isActiveW4PrintStatus(job.status),
  );

  if (!relevant.length) {
    return null;
  }

  return [...relevant].sort(compareEarliest)[0] ?? null;
}

async function skipDuplicateW4PrintJob(
  currentJob: WorkflowJobRecord,
  winnerJob: WorkflowJobRecord,
  input: W4PrintJobInput,
  requestedIdentity: ReturnType<typeof buildW4PrintJobIdentity>,
  requestedIdempotencyKey: string,
  repository: W4PrintJobRepository,
): Promise<W4PrintWorkflowFields> {
  if (currentJob.id !== winnerJob.id && !isTerminalW4PrintStatus(currentJob.status)) {
    await repository.appendWorkflowJobEvent({
      jobId: currentJob.id,
      eventType: 'duplicate-trigger-superseded',
      payload: {
        orderId: input.orderId,
        requestedLogicalKey: requestedIdentity.logicalKey,
        requestedIdempotencyKey,
        winnerJobId: winnerJob.id,
        skipReason: 'active-w4-print-job-exists',
      },
    });
    await repository.cancelWorkflowJob(
      currentJob.id,
      `Superseded by active W4 print job ${winnerJob.id}`,
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
      skipReason: 'active-w4-print-job-exists',
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
    'active-w4-print-job-exists',
  );
}

export async function claimAndStartW4PrintJob(
  input: W4PrintJobInput,
  options: ClaimW4PrintJobOptions = {},
  repository: W4PrintJobRepository = defaultRepository,
): Promise<W4PrintWorkflowFields> {
  const explicitJobId = typeof input.workflowJobId === 'number' ? input.workflowJobId : null;
  const requestedIdentity = buildW4PrintJobIdentity(input);
  const requestedIdempotencyKey =
    toTrimmedString(input.workflowJobIdempotencyKey) ??
    buildWorkflowJobIdempotencyKey(requestedIdentity);

  if (!explicitJobId) {
    const existingJobs = await repository.listWorkflowJobsForOrder(input.orderId);
    const activeSiblingJob =
      [...existingJobs]
        .filter(
          (job) =>
            job.job_type === W4_PRINT_JOB_TYPE &&
            job.stage === W4_STAGE &&
            isActiveW4PrintStatus(job.status) &&
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
          skipReason: 'active-w4-print-job-exists',
        },
      });

      return buildWorkflowFields(
        activeSiblingJob,
        activeAttempt,
        false,
        true,
        'active-w4-print-job-exists',
      );
    }
  }

  const job = await resolveJobForW4Print(input, repository);

  if (!explicitJobId) {
    const existingJobs = await repository.listWorkflowJobsForOrder(input.orderId);
    const canonicalActiveJob = pickCanonicalActiveW4PrintJob(existingJobs);
    if (canonicalActiveJob && canonicalActiveJob.id !== job.id) {
      return skipDuplicateW4PrintJob(
        job,
        canonicalActiveJob,
        input,
        requestedIdentity,
        requestedIdempotencyKey,
        repository,
      );
    }
  }

  const leaseOwner = options.leaseOwner ?? DEFAULT_W4_LEASE_OWNER;
  const workerKind = options.workerKind ?? DEFAULT_W4_WORKER_KIND;

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
    const skipReason = isActiveW4PrintStatus(current.status)
      ? 'w4-print-job-already-active'
      : isTerminalW4PrintStatus(current.status)
        ? 'w4-print-job-already-finished'
        : 'w4-print-job-claim-conflict';
    return buildWorkflowFields(current, currentAttempt, false, true, skipReason);
  }

  if (!explicitJobId) {
    const existingJobs = await repository.listWorkflowJobsForOrder(input.orderId);
    const canonicalActiveJob = pickCanonicalActiveW4PrintJob(existingJobs);
    if (canonicalActiveJob && canonicalActiveJob.id !== claimedJob.id) {
      return skipDuplicateW4PrintJob(
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

export async function completeW4PrintJobForOrder(
  input: CompleteW4PrintJobInput,
  repository: W4PrintJobRepository = defaultRepository,
): Promise<CompleteW4PrintJobResult> {
  const orderId = toTrimmedString(input.orderId);
  if (!orderId) {
    throw new Error('W4 print completion requires orderId');
  }

  const jobs = await repository.listWorkflowJobsForOrder(orderId, undefined, 50);
  const job = pickLatestActiveW4PrintJob(jobs);
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
  const { status: luluStatus, detail: luluStatusDetail } = normalizeLuluStatusValue(
    input.luluStatus,
    input.luluStatusDetail,
  );
  const resultSnapshot: JsonRecord = {
    orderId,
    submitMode,
    manifestUrl: toTrimmedString(input.manifestUrl) ?? null,
    manifestKey: toTrimmedString(input.manifestKey) ?? null,
    luluJobId: toTrimmedString(input.luluJobId) ?? null,
    luluStatus,
    luluStatusDetail,
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
      orderId,
      submitMode,
      manifestUrl: resultSnapshot.manifestUrl,
      luluJobId: resultSnapshot.luluJobId,
      luluStatus,
      luluStatusDetail,
    },
  });

  return {
    job: succeeded,
    attempt,
  };
}
