import {
  appendWorkflowJobEvent,
  claimWorkflowJob,
  createWorkflowJobAttempt,
  enqueueWorkflowJob,
  getWorkflowJobById,
  getWorkflowJobByIdempotencyKey,
  incrementWorkflowJobAttemptCount,
  markWorkflowJobRunning,
} from './repository';
import { buildWorkflowJobIdempotencyKey, buildWorkflowJobLogicalKey } from './idempotency';
import type { WorkflowJobAttemptRecord, WorkflowJobRecord } from './types';

const W2B_POSE_JOB_TYPE = 'w2b-single-pose';
const W2B_STAGE = '2b';
const DEFAULT_W2B_LEASE_OWNER = 'api:internal/w2b/build-pose-input';
const DEFAULT_W2B_WORKER_KIND = 'n8n';

type JsonRecord = Record<string, unknown>;

export interface W2BPoseWorkflowFields {
  workflowJobId: number;
  workflowJobIdempotencyKey: string;
  workflowJobStatus: string;
  workflowAttemptId: number | null;
  workflowAttempt: number | null;
  workflowClaimed: boolean;
}

export interface W2BPoseWorkItemLike {
  orderId: string;
  rootOrderId?: string | null;
  amazonOrderId?: string | null;
  bookId: string;
  characterHash: string;
  poseNumber: number;
  approvedKey?: string | null;
  replacedAt?: string | null;
  replacementCount?: number;
  manifest2aUrl?: string | null;
  manifest2bKey?: string | null;
  backendUrl?: string | null;
  callbackUrl?: string | null;
  force?: boolean;
  workflowJobId?: number | null;
  workflowJobIdempotencyKey?: string | null;
}

export interface AttachW2BPoseJobsInput {
  orderId: string;
  rootOrderId?: string | null;
  amazonOrderId?: string | null;
  bookId: string;
  workItems: W2BPoseWorkItemLike[];
}

export interface ClaimW2BPoseJobOptions {
  leaseOwner?: string;
  workerKind?: string;
  leaseMs?: number;
}

export interface W2BPoseJobRepository {
  enqueueWorkflowJob: typeof enqueueWorkflowJob;
  getWorkflowJobById: typeof getWorkflowJobById;
  getWorkflowJobByIdempotencyKey: typeof getWorkflowJobByIdempotencyKey;
  claimWorkflowJob: typeof claimWorkflowJob;
  incrementWorkflowJobAttemptCount: typeof incrementWorkflowJobAttemptCount;
  createWorkflowJobAttempt: typeof createWorkflowJobAttempt;
  markWorkflowJobRunning: typeof markWorkflowJobRunning;
  appendWorkflowJobEvent: typeof appendWorkflowJobEvent;
}

const defaultRepository: W2BPoseJobRepository = {
  enqueueWorkflowJob,
  getWorkflowJobById,
  getWorkflowJobByIdempotencyKey,
  claimWorkflowJob,
  incrementWorkflowJobAttemptCount,
  createWorkflowJobAttempt,
  markWorkflowJobRunning,
  appendWorkflowJobEvent,
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

function toJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

export function buildW2BPoseLogicalKey(poseNumber: number): string {
  return buildWorkflowJobLogicalKey(`pose-${String(Math.max(0, Math.floor(poseNumber))).padStart(2, '0')}`);
}

export function buildW2BPoseJobIdentity(input: W2BPoseWorkItemLike) {
  return {
    jobType: W2B_POSE_JOB_TYPE,
    stage: W2B_STAGE,
    orderId: input.orderId,
    rootOrderId: toTrimmedString(input.rootOrderId) ?? toTrimmedString(input.amazonOrderId),
    amazonOrderId: toTrimmedString(input.amazonOrderId) ?? toTrimmedString(input.rootOrderId),
    bookId: input.bookId,
    logicalKey: buildW2BPoseLogicalKey(input.poseNumber),
  };
}

function buildQueuedSnapshot(input: W2BPoseWorkItemLike): JsonRecord {
  return {
    orderId: input.orderId,
    rootOrderId: toTrimmedString(input.rootOrderId) ?? null,
    amazonOrderId: toTrimmedString(input.amazonOrderId) ?? null,
    bookId: input.bookId,
    characterHash: input.characterHash,
    poseNumber: input.poseNumber,
    approvedKey: toTrimmedString(input.approvedKey) ?? null,
    replacedAt: toTrimmedString(input.replacedAt) ?? null,
    replacementCount: toInteger(input.replacementCount) ?? 0,
    manifest2aUrl: toTrimmedString(input.manifest2aUrl) ?? null,
    manifest2bKey: toTrimmedString(input.manifest2bKey) ?? null,
    backendUrl: toTrimmedString(input.backendUrl) ?? null,
    callbackUrl: toTrimmedString(input.callbackUrl) ?? null,
    force: input.force === true,
  };
}

function buildWorkflowFields(
  job: WorkflowJobRecord,
  attempt: WorkflowJobAttemptRecord | null,
  workflowClaimed: boolean,
): W2BPoseWorkflowFields {
  return {
    workflowJobId: job.id,
    workflowJobIdempotencyKey: job.idempotency_key,
    workflowJobStatus: job.status,
    workflowAttemptId: attempt?.id ?? null,
    workflowAttempt: attempt?.attempt ?? null,
    workflowClaimed,
  };
}

export async function attachWorkflowJobsToW2BWorkItems(
  input: AttachW2BPoseJobsInput,
  repository: W2BPoseJobRepository = defaultRepository,
): Promise<W2BPoseWorkItemLike[]> {
  const attached: W2BPoseWorkItemLike[] = [];

  for (const workItem of input.workItems) {
    const identity = buildW2BPoseJobIdentity({
      ...workItem,
      rootOrderId: workItem.rootOrderId ?? input.rootOrderId ?? null,
      amazonOrderId: workItem.amazonOrderId ?? input.amazonOrderId ?? null,
    });
    const idempotencyKey =
      toTrimmedString(workItem.workflowJobIdempotencyKey) ?? buildWorkflowJobIdempotencyKey(identity);

    const job =
      (await repository.enqueueWorkflowJob({
        ...identity,
        idempotencyKey,
        externalProvider: 'bria',
        inputSnapshot: buildQueuedSnapshot({
          ...workItem,
          rootOrderId: workItem.rootOrderId ?? input.rootOrderId ?? null,
          amazonOrderId: workItem.amazonOrderId ?? input.amazonOrderId ?? null,
        }),
        normalizedInputSnapshot: buildQueuedSnapshot({
          ...workItem,
          rootOrderId: workItem.rootOrderId ?? input.rootOrderId ?? null,
          amazonOrderId: workItem.amazonOrderId ?? input.amazonOrderId ?? null,
        }),
      })) ??
      (await repository.getWorkflowJobByIdempotencyKey(idempotencyKey));

    if (!job) {
      throw new Error(`Unable to enqueue W2B pose workflow job for ${identity.orderId}:${identity.logicalKey}`);
    }

    await repository.appendWorkflowJobEvent({
      jobId: job.id,
      eventType: 'queued',
      payload: {
        stage: W2B_STAGE,
        orderId: identity.orderId,
        poseNumber: workItem.poseNumber,
      },
    });

    attached.push({
      ...workItem,
      rootOrderId: workItem.rootOrderId ?? input.rootOrderId ?? null,
      amazonOrderId: workItem.amazonOrderId ?? input.amazonOrderId ?? null,
      workflowJobId: job.id,
      workflowJobIdempotencyKey: job.idempotency_key,
      workflowJobStatus: job.status,
      workflowAttemptId: null,
      workflowAttempt: null,
      workflowClaimed: false,
    });
  }

  return attached;
}

async function resolveJobForW2BPose(
  input: W2BPoseWorkItemLike,
  repository: W2BPoseJobRepository,
): Promise<WorkflowJobRecord> {
  const explicitId = typeof input.workflowJobId === 'number' ? input.workflowJobId : null;
  if (explicitId) {
    const byId = await repository.getWorkflowJobById(explicitId);
    if (byId) {
      return byId;
    }
  }

  const identity = buildW2BPoseJobIdentity(input);
  const idempotencyKey =
    toTrimmedString(input.workflowJobIdempotencyKey) ?? buildWorkflowJobIdempotencyKey(identity);
  const existing = await repository.getWorkflowJobByIdempotencyKey(idempotencyKey);
  if (existing) {
    return existing;
  }

  const created = await repository.enqueueWorkflowJob({
    ...identity,
    idempotencyKey,
    externalProvider: 'bria',
    inputSnapshot: buildQueuedSnapshot(input),
    normalizedInputSnapshot: buildQueuedSnapshot(input),
  });

  if (!created) {
    throw new Error(`Unable to create W2B pose workflow job for ${input.orderId}:${input.poseNumber}`);
  }

  await repository.appendWorkflowJobEvent({
    jobId: created.id,
    eventType: 'queued',
    payload: {
      stage: W2B_STAGE,
      orderId: input.orderId,
      poseNumber: input.poseNumber,
      source: 'build-pose-input-fallback',
    },
  });

  return created;
}

export async function claimAndStartW2BPoseJob(
  input: W2BPoseWorkItemLike,
  options: ClaimW2BPoseJobOptions = {},
  repository: W2BPoseJobRepository = defaultRepository,
): Promise<W2BPoseWorkflowFields> {
  const job = await resolveJobForW2BPose(input, repository);
  const leaseOwner = options.leaseOwner ?? DEFAULT_W2B_LEASE_OWNER;
  const workerKind = options.workerKind ?? DEFAULT_W2B_WORKER_KIND;

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
        poseNumber: input.poseNumber,
      },
    });

    const current = (await repository.getWorkflowJobById(job.id)) ?? job;
    return buildWorkflowFields(current, null, false);
  }

  await repository.appendWorkflowJobEvent({
    jobId: claimedJob.id,
    eventType: 'claimed',
    payload: {
      leaseOwner,
      workerKind,
      poseNumber: input.poseNumber,
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
    externalProvider: 'bria',
  });

  await repository.appendWorkflowJobEvent({
    jobId: claimedJob.id,
    attemptId: attempt?.id ?? null,
    eventType: 'started',
    payload: {
      leaseOwner,
      workerKind,
      poseNumber: input.poseNumber,
    },
  });

  return buildWorkflowFields(running ?? claimedJob, attempt, true);
}
