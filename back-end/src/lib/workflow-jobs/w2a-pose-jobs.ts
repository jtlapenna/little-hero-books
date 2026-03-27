import {
  appendWorkflowJobEvent,
  claimWorkflowJob,
  createWorkflowJobAttempt,
  enqueueWorkflowJob,
  getWorkflowJobById,
  getWorkflowJobByIdempotencyKey,
  incrementWorkflowJobAttemptCount,
  markWorkflowJobRunning,
} from "./repository";
import {
  buildWorkflowJobIdempotencyKey,
  buildWorkflowJobLogicalKey,
} from "./idempotency";
import { headObject, R2_PUBLIC_BUCKET } from "../r2-client";
import type { WorkflowJobAttemptRecord, WorkflowJobRecord } from "./types";

const W2A_POSE_JOB_TYPE = "w2a-single-pose";
const W2A_STAGE = "2a";
const DEFAULT_W2A_LEASE_OWNER = "api:internal/w2a/build-pose-input";
const DEFAULT_W2A_WORKER_KIND = "n8n";

type JsonRecord = Record<string, unknown>;

export interface W2APoseWorkflowFields {
  workflowJobId: number;
  workflowJobIdempotencyKey: string;
  workflowJobStatus: string;
  workflowAttemptId: number | null;
  workflowAttempt: number | null;
  workflowClaimed: boolean;
  workflowReplay: W2APoseWorkflowReplay | null;
}

export interface W2APoseWorkflowReplay {
  mode: "reuse-succeeded-pose";
  sourceStatus: "succeeded";
  uploadKey: string;
  generatedFileName: string | null;
  fileSize: number | null;
  correlationId: string | null;
  poseRefKey: string | null;
  baseCharacterKey: string | null;
}

export interface W2APoseWorkItemLike {
  orderId: string;
  rootOrderId?: string | null;
  amazonOrderId?: string | null;
  bookId: string;
  formatId?: string | null;
  poseNumber: number;
  currentPoseNumber?: number | null;
  index?: number | null;
  pageIndex?: number | null;
  pageLabel?: string | null;
  pageType?: string | null;
  storyPageNumber?: number | null;
  backgroundSlot?: string | null;
  oneManifestKey?: string | null;
  oneManifestUrl?: string | null;
  backendUrl?: string | null;
  publicR2Url?: string | null;
  baseCharacterKey?: string | null;
  poseRefKey?: string | null;
  uploadKey?: string | null;
  correlationId?: string | null;
  retryAttempt?: number | null;
  generatedFileName?: string | null;
  workflowJobId?: number | null;
  workflowJobIdempotencyKey?: string | null;
  workflowJobStatus?: string | null;
  workflowAttemptId?: number | null;
  workflowAttempt?: number | null;
  workflowClaimed?: boolean | null;
}

export interface AttachW2APoseJobsInput {
  orderId: string;
  rootOrderId?: string | null;
  amazonOrderId?: string | null;
  bookId: string;
  formatId?: string | null;
  oneManifestKey?: string | null;
  backendUrl?: string | null;
  publicR2Url?: string | null;
  workItems: W2APoseWorkItemLike[];
}

export interface ClaimW2APoseJobOptions {
  leaseOwner?: string;
  workerKind?: string;
  leaseMs?: number;
  replayArtifactExists?: (
    replay: W2APoseWorkflowReplay,
    job: WorkflowJobRecord,
  ) => Promise<boolean>;
}

export interface W2APoseJobRepository {
  enqueueWorkflowJob: typeof enqueueWorkflowJob;
  getWorkflowJobById: typeof getWorkflowJobById;
  getWorkflowJobByIdempotencyKey: typeof getWorkflowJobByIdempotencyKey;
  claimWorkflowJob: typeof claimWorkflowJob;
  incrementWorkflowJobAttemptCount: typeof incrementWorkflowJobAttemptCount;
  createWorkflowJobAttempt: typeof createWorkflowJobAttempt;
  markWorkflowJobRunning: typeof markWorkflowJobRunning;
  appendWorkflowJobEvent: typeof appendWorkflowJobEvent;
}

const defaultRepository: W2APoseJobRepository = {
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
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildWorkflowFields(
  job: WorkflowJobRecord,
  attempt: WorkflowJobAttemptRecord | null,
  workflowClaimed: boolean,
  workflowReplay: W2APoseWorkflowReplay | null = null,
): W2APoseWorkflowFields {
  return {
    workflowJobId: job.id,
    workflowJobIdempotencyKey: job.idempotency_key,
    workflowJobStatus: job.status,
    workflowAttemptId: attempt?.id ?? null,
    workflowAttempt: attempt?.attempt ?? null,
    workflowClaimed,
    workflowReplay,
  };
}

export function buildW2APoseLogicalKey(poseNumber: number): string {
  return buildWorkflowJobLogicalKey(
    `pose-${String(Math.max(0, Math.floor(poseNumber))).padStart(2, "0")}`,
  );
}

export function buildW2APoseJobIdentity(input: W2APoseWorkItemLike) {
  return {
    jobType: W2A_POSE_JOB_TYPE,
    stage: W2A_STAGE,
    orderId: input.orderId,
    rootOrderId:
      toTrimmedString(input.rootOrderId) ??
      toTrimmedString(input.amazonOrderId),
    amazonOrderId:
      toTrimmedString(input.amazonOrderId) ??
      toTrimmedString(input.rootOrderId),
    bookId: input.bookId,
    logicalKey: buildW2APoseLogicalKey(input.poseNumber),
  };
}

function buildQueuedSnapshot(input: W2APoseWorkItemLike): JsonRecord {
  return {
    orderId: input.orderId,
    rootOrderId: toTrimmedString(input.rootOrderId) ?? null,
    amazonOrderId: toTrimmedString(input.amazonOrderId) ?? null,
    bookId: input.bookId,
    formatId: toTrimmedString(input.formatId) ?? null,
    poseNumber: input.poseNumber,
    currentPoseNumber: toInteger(input.currentPoseNumber) ?? input.poseNumber,
    index: toInteger(input.index) ?? null,
    pageIndex: toInteger(input.pageIndex) ?? null,
    pageLabel: toTrimmedString(input.pageLabel) ?? null,
    pageType: toTrimmedString(input.pageType) ?? null,
    storyPageNumber: toInteger(input.storyPageNumber) ?? null,
    backgroundSlot: toTrimmedString(input.backgroundSlot) ?? null,
    oneManifestKey: toTrimmedString(input.oneManifestKey) ?? null,
    oneManifestUrl: toTrimmedString(input.oneManifestUrl) ?? null,
    backendUrl: toTrimmedString(input.backendUrl) ?? null,
    publicR2Url: toTrimmedString(input.publicR2Url) ?? null,
    baseCharacterKey: toTrimmedString(input.baseCharacterKey) ?? null,
    poseRefKey: toTrimmedString(input.poseRefKey) ?? null,
    uploadKey: toTrimmedString(input.uploadKey) ?? null,
    correlationId: toTrimmedString(input.correlationId) ?? null,
    retryAttempt: toInteger(input.retryAttempt) ?? 0,
    generatedFileName: toTrimmedString(input.generatedFileName) ?? null,
  };
}

function getSnapshotString(
  snapshot: Record<string, unknown>,
  key: string,
): string | null {
  return toTrimmedString(snapshot[key]);
}

function getSnapshotInteger(
  snapshot: Record<string, unknown>,
  key: string,
): number | null {
  return toInteger(snapshot[key]);
}

export function buildW2APoseWorkflowReplay(
  job: WorkflowJobRecord,
): W2APoseWorkflowReplay | null {
  if (job.status !== "succeeded") {
    return null;
  }

  const resultSnapshot =
    job.result_snapshot && typeof job.result_snapshot === "object"
      ? job.result_snapshot
      : {};
  const normalizedSnapshot =
    job.normalized_input_snapshot && typeof job.normalized_input_snapshot === "object"
      ? job.normalized_input_snapshot
      : {};

  const uploadKey =
    getSnapshotString(resultSnapshot, "uploadKey") ??
    getSnapshotString(resultSnapshot, "storageKey");
  if (!uploadKey) {
    return null;
  }

  return {
    mode: "reuse-succeeded-pose",
    sourceStatus: "succeeded",
    uploadKey,
    generatedFileName:
      getSnapshotString(resultSnapshot, "generatedFileName") ??
      getSnapshotString(normalizedSnapshot, "generatedFileName"),
    fileSize: getSnapshotInteger(resultSnapshot, "fileSize"),
    correlationId:
      getSnapshotString(resultSnapshot, "correlationId") ??
      getSnapshotString(normalizedSnapshot, "correlationId"),
    poseRefKey:
      getSnapshotString(resultSnapshot, "poseRefKey") ??
      getSnapshotString(normalizedSnapshot, "poseRefKey"),
    baseCharacterKey:
      getSnapshotString(resultSnapshot, "baseCharacterKey") ??
      getSnapshotString(normalizedSnapshot, "baseCharacterKey"),
  };
}

async function defaultReplayArtifactExists(
  replay: W2APoseWorkflowReplay,
): Promise<boolean> {
  try {
    const response = await headObject(R2_PUBLIC_BUCKET, replay.uploadKey);
    return response.ok;
  } catch {
    return false;
  }
}

export async function resolveW2APoseWorkflowReplay(
  job: WorkflowJobRecord,
  options: {
    replayArtifactExists?: (
      replay: W2APoseWorkflowReplay,
      job: WorkflowJobRecord,
    ) => Promise<boolean>;
  } = {},
): Promise<W2APoseWorkflowReplay | null> {
  const replay = buildW2APoseWorkflowReplay(job);
  if (!replay) {
    return null;
  }

  const replayArtifactExists =
    options.replayArtifactExists ?? defaultReplayArtifactExists;
  return (await replayArtifactExists(replay, job)) ? replay : null;
}

export async function attachWorkflowJobsToW2AWorkItems(
  input: AttachW2APoseJobsInput,
  repository: W2APoseJobRepository = defaultRepository,
): Promise<W2APoseWorkItemLike[]> {
  const attached: W2APoseWorkItemLike[] = [];

  for (const workItem of input.workItems) {
    const enriched: W2APoseWorkItemLike = {
      ...workItem,
      orderId: workItem.orderId ?? input.orderId,
      rootOrderId: workItem.rootOrderId ?? input.rootOrderId ?? null,
      amazonOrderId: workItem.amazonOrderId ?? input.amazonOrderId ?? null,
      bookId: workItem.bookId ?? input.bookId,
      formatId: workItem.formatId ?? input.formatId ?? null,
      oneManifestKey: workItem.oneManifestKey ?? input.oneManifestKey ?? null,
      backendUrl: workItem.backendUrl ?? input.backendUrl ?? null,
      publicR2Url: workItem.publicR2Url ?? input.publicR2Url ?? null,
    };
    const identity = buildW2APoseJobIdentity(enriched);
    const idempotencyKey =
      toTrimmedString(workItem.workflowJobIdempotencyKey) ??
      buildWorkflowJobIdempotencyKey(identity);

    const job =
      (await repository.enqueueWorkflowJob({
        ...identity,
        idempotencyKey,
        externalProvider: "gemini",
        inputSnapshot: buildQueuedSnapshot(enriched),
        normalizedInputSnapshot: buildQueuedSnapshot(enriched),
      })) ?? (await repository.getWorkflowJobByIdempotencyKey(idempotencyKey));

    if (!job) {
      throw new Error(
        `Unable to enqueue W2A pose workflow job for ${identity.orderId}:${identity.logicalKey}`,
      );
    }

    await repository.appendWorkflowJobEvent({
      jobId: job.id,
      eventType: "queued",
      payload: {
        stage: W2A_STAGE,
        orderId: identity.orderId,
        poseNumber: enriched.poseNumber,
      },
    });

    attached.push({
      ...enriched,
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

async function resolveJobForW2APose(
  input: W2APoseWorkItemLike,
  repository: W2APoseJobRepository,
): Promise<WorkflowJobRecord> {
  const explicitId =
    typeof input.workflowJobId === "number" ? input.workflowJobId : null;
  if (explicitId) {
    const byId = await repository.getWorkflowJobById(explicitId);
    if (byId) {
      return byId;
    }
  }

  const identity = buildW2APoseJobIdentity(input);
  const idempotencyKey =
    toTrimmedString(input.workflowJobIdempotencyKey) ??
    buildWorkflowJobIdempotencyKey(identity);
  const existing =
    await repository.getWorkflowJobByIdempotencyKey(idempotencyKey);
  if (existing) {
    return existing;
  }

  const created = await repository.enqueueWorkflowJob({
    ...identity,
    idempotencyKey,
    externalProvider: "gemini",
    inputSnapshot: buildQueuedSnapshot(input),
    normalizedInputSnapshot: buildQueuedSnapshot(input),
  });

  if (!created) {
    throw new Error(
      `Unable to create W2A pose workflow job for ${input.orderId}:${input.poseNumber}`,
    );
  }

  await repository.appendWorkflowJobEvent({
    jobId: created.id,
    eventType: "queued",
    payload: {
      stage: W2A_STAGE,
      orderId: input.orderId,
      poseNumber: input.poseNumber,
      source: "build-pose-input-fallback",
    },
  });

  return created;
}

export async function claimAndStartW2APoseJob(
  input: W2APoseWorkItemLike,
  options: ClaimW2APoseJobOptions = {},
  repository: W2APoseJobRepository = defaultRepository,
): Promise<W2APoseWorkflowFields> {
  const job = await resolveJobForW2APose(input, repository);
  const replayCandidate = buildW2APoseWorkflowReplay(job);
  const replay = replayCandidate
    ? await resolveW2APoseWorkflowReplay(job, {
        replayArtifactExists: options.replayArtifactExists,
      })
    : null;
  if (replay) {
    await repository.appendWorkflowJobEvent({
      jobId: job.id,
      eventType: "replay-reused",
      payload: {
        orderId: input.orderId,
        poseNumber: input.poseNumber,
        sourceStatus: replay.sourceStatus,
        uploadKey: replay.uploadKey,
      },
    });

    return buildWorkflowFields(job, null, false, replay);
  }

  if (replayCandidate) {
    await repository.appendWorkflowJobEvent({
      jobId: job.id,
      eventType: "replay-missing-artifact",
      payload: {
        orderId: input.orderId,
        poseNumber: input.poseNumber,
        sourceStatus: replayCandidate.sourceStatus,
        uploadKey: replayCandidate.uploadKey,
      },
    });

    return buildWorkflowFields(job, null, false, null);
  }

  const leaseOwner = options.leaseOwner ?? DEFAULT_W2A_LEASE_OWNER;
  const workerKind = options.workerKind ?? DEFAULT_W2A_WORKER_KIND;

  const claimedJob = await repository.claimWorkflowJob(job.id, {
    leaseOwner,
    leaseMs: options.leaseMs,
  });

  if (!claimedJob) {
    await repository.appendWorkflowJobEvent({
      jobId: job.id,
      eventType: "claim-conflict",
      payload: {
        leaseOwner,
        orderId: input.orderId,
        poseNumber: input.poseNumber,
      },
    });

    const current = (await repository.getWorkflowJobById(job.id)) ?? job;
    return buildWorkflowFields(current, null, false, null);
  }

  await repository.appendWorkflowJobEvent({
    jobId: claimedJob.id,
    eventType: "claimed",
    payload: {
      leaseOwner,
      workerKind,
      poseNumber: input.poseNumber,
    },
  });

  const incremented = await repository.incrementWorkflowJobAttemptCount(
    claimedJob.id,
  );
  const attemptNumber =
    incremented?.attempt_count ?? claimedJob.attempt_count + 1;
  const attempt = await repository.createWorkflowJobAttempt({
    jobId: claimedJob.id,
    attempt: attemptNumber,
    status: "running",
    workerKind,
    leaseOwner,
    startedAt: new Date().toISOString(),
  });

  const running = await repository.markWorkflowJobRunning(claimedJob.id, {
    externalProvider: "gemini",
  });

  await repository.appendWorkflowJobEvent({
    jobId: claimedJob.id,
    attemptId: attempt?.id ?? null,
    eventType: "started",
    payload: {
      leaseOwner,
      workerKind,
      poseNumber: input.poseNumber,
    },
  });

  return buildWorkflowFields(running ?? claimedJob, attempt, true, null);
}
