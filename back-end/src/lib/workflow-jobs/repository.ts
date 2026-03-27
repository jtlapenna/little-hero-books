import { supabase } from '@/lib/supabase-client';
import { buildWorkflowJobLeaseExpiry, canClaimWorkflowJob } from './claiming';
import { buildWorkflowJobIdempotencyKey, buildWorkflowJobLogicalKey } from './idempotency';
import { buildWorkflowJobEventInsertRow, summarizeWorkflowJobError } from './logging';
import type {
  AppendWorkflowJobEventInput,
  ClaimWorkflowJobOptions,
  CompleteWorkflowJobInput,
  CreateWorkflowJobAttemptInput,
  EnqueueWorkflowJobInput,
  FailWorkflowJobInput,
  FinishWorkflowJobAttemptInput,
  ScheduleWorkflowJobRetryInput,
  UpdateWorkflowJobExternalStateInput,
  WorkflowJobAttemptRecord,
  WorkflowJobAttemptStatus,
  WorkflowJobEventRecord,
  WorkflowJobRecord,
  WorkflowJobStatus,
} from './types';

type SupabaseErrorLike = {
  code?: string;
};

type SupabaseResultLike<T> = Promise<{
  data: T | null;
  error: SupabaseErrorLike | null;
}>;

type SupabaseQueryLike = {
  select: (...args: unknown[]) => SupabaseQueryLike;
  insert: (...args: unknown[]) => SupabaseQueryLike;
  update: (...args: unknown[]) => SupabaseQueryLike;
  eq: (...args: unknown[]) => SupabaseQueryLike;
  order: (...args: unknown[]) => SupabaseQueryLike;
  limit: (...args: unknown[]) => SupabaseQueryLike;
  or: (...args: unknown[]) => SupabaseQueryLike;
  maybeSingle: <T = unknown>() => SupabaseResultLike<T>;
};

type SupabaseLike = {
  from: (table: string) => SupabaseQueryLike;
};

function cleanString(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

function requireString(value: unknown, fieldName: string): string {
  const normalized = cleanString(value);
  if (!normalized) {
    throw new Error(`Workflow job ${fieldName} is required`);
  }
  return normalized;
}

function toIsoString(value?: string | Date | null, fallback: Date = new Date()): string {
  if (!value) return fallback.toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
}

function toJsonRecord(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' ? value : {};
}

function toStoredWorkflowJobError(
  error: Record<string, unknown> | string | null | undefined,
): Record<string, unknown> | null {
  if (!error) return null;
  return summarizeWorkflowJobError(error);
}

function buildWorkflowJobPatch(
  status: WorkflowJobStatus,
  input: UpdateWorkflowJobExternalStateInput = {},
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    status,
    ...overrides,
  };

  if ('externalProvider' in input) {
    patch.external_provider = cleanString(input.externalProvider);
  }

  if ('externalRequestId' in input) {
    patch.external_request_id = cleanString(input.externalRequestId);
  }

  if ('externalStatusUrl' in input) {
    patch.external_status_url = cleanString(input.externalStatusUrl);
  }

  return patch;
}

export function buildWorkflowJobInsertRow(input: EnqueueWorkflowJobInput): Record<string, unknown> {
  const now = new Date();
  const logicalKey = buildWorkflowJobLogicalKey(input.logicalKey);
  const identity = {
    jobType: requireString(input.jobType, 'jobType'),
    stage: requireString(input.stage, 'stage'),
    orderRowId: input.orderRowId,
    orderId: cleanString(input.orderId),
    rootOrderId: cleanString(input.rootOrderId),
    amazonOrderId: cleanString(input.amazonOrderId),
    bookId: cleanString(input.bookId),
    logicalKey,
  };

  return {
    job_type: identity.jobType,
    stage: identity.stage,
    order_row_id: input.orderRowId ?? null,
    order_id: identity.orderId,
    root_order_id: identity.rootOrderId,
    amazon_order_id: identity.amazonOrderId,
    book_id: identity.bookId,
    logical_key: logicalKey,
    idempotency_key: cleanString(input.idempotencyKey) ?? buildWorkflowJobIdempotencyKey(identity),
    status: input.status ?? 'queued',
    attempt_count: 0,
    max_attempts: Math.max(1, input.maxAttempts ?? 5),
    next_retry_at: input.nextRetryAt ? toIsoString(input.nextRetryAt, now) : null,
    external_provider: cleanString(input.externalProvider),
    external_request_id: cleanString(input.externalRequestId),
    external_status_url: cleanString(input.externalStatusUrl),
    input_snapshot: toJsonRecord(input.inputSnapshot),
    normalized_input_snapshot: toJsonRecord(input.normalizedInputSnapshot),
    result_snapshot: toJsonRecord(input.resultSnapshot),
    last_error: toStoredWorkflowJobError(input.lastError as Record<string, unknown> | string | null | undefined),
    queued_at: toIsoString(input.queuedAt, now),
  };
}

export function buildWorkflowJobAttemptInsertRow(
  input: CreateWorkflowJobAttemptInput,
): Record<string, unknown> {
  return {
    job_id: input.jobId,
    attempt: Math.max(1, input.attempt),
    status: input.status ?? 'claimed',
    worker_kind: cleanString(input.workerKind),
    lease_owner: cleanString(input.leaseOwner),
    started_at: toIsoString(input.startedAt),
    provider_request_id: cleanString(input.providerRequestId),
    provider_status_url: cleanString(input.providerStatusUrl),
  };
}

export async function getWorkflowJobAttemptById(
  id: number,
  client: SupabaseLike = supabase,
): Promise<WorkflowJobAttemptRecord | null> {
  const { data, error } = await client
    .from('workflow_job_attempts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as WorkflowJobAttemptRecord | null) ?? null;
}

export async function getLatestWorkflowJobAttemptForJob(
  jobId: number,
  client: SupabaseLike = supabase,
): Promise<WorkflowJobAttemptRecord | null> {
  const { data, error } = await client
    .from('workflow_job_attempts')
    .select('*')
    .eq('job_id', jobId)
    .order('attempt', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as WorkflowJobAttemptRecord | null) ?? null;
}

export async function getWorkflowJobById(
  id: number,
  client: SupabaseLike = supabase,
): Promise<WorkflowJobRecord | null> {
  const { data, error } = await client.from('workflow_jobs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as WorkflowJobRecord | null) ?? null;
}

export async function getWorkflowJobByIdempotencyKey(
  idempotencyKey: string,
  client: SupabaseLike = supabase,
): Promise<WorkflowJobRecord | null> {
  const { data, error } = await client
    .from('workflow_jobs')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return (data as WorkflowJobRecord | null) ?? null;
}

export async function enqueueWorkflowJob(
  input: EnqueueWorkflowJobInput,
  client: SupabaseLike = supabase,
): Promise<WorkflowJobRecord | null> {
  const row = buildWorkflowJobInsertRow(input);
  const existing = await getWorkflowJobByIdempotencyKey(String(row.idempotency_key), client);
  if (existing) {
    return existing;
  }

  const { data, error } = await client
    .from('workflow_jobs')
    .insert(row)
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return getWorkflowJobByIdempotencyKey(String(row.idempotency_key), client);
    }
    throw error;
  }
  return (data as WorkflowJobRecord | null) ?? null;
}

export async function appendWorkflowJobEvent(
  input: AppendWorkflowJobEventInput,
  client: SupabaseLike = supabase,
): Promise<WorkflowJobEventRecord | null> {
  const row = buildWorkflowJobEventInsertRow(input);
  const { data, error } = await client
    .from('workflow_job_events')
    .insert(row)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as WorkflowJobEventRecord | null) ?? null;
}

export async function createWorkflowJobAttempt(
  input: CreateWorkflowJobAttemptInput,
  client: SupabaseLike = supabase,
): Promise<WorkflowJobAttemptRecord | null> {
  const row = buildWorkflowJobAttemptInsertRow(input);
  const { data, error } = await client
    .from('workflow_job_attempts')
    .insert(row)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as WorkflowJobAttemptRecord | null) ?? null;
}

export async function finishWorkflowJobAttempt(
  input: FinishWorkflowJobAttemptInput,
  client: SupabaseLike = supabase,
): Promise<WorkflowJobAttemptRecord | null> {
  const endedAt = toIsoString(input.endedAt);
  const started = await client
    .from('workflow_job_attempts')
    .select('started_at')
    .eq('id', input.attemptId)
    .maybeSingle();
  if (started.error) throw started.error;

  const startedAt = started.data?.started_at ? new Date(started.data.started_at) : null;
  const endedDate = new Date(endedAt);
  const durationMs =
    startedAt && !Number.isNaN(startedAt.getTime())
      ? Math.max(0, endedDate.getTime() - startedAt.getTime())
      : null;

  const patch = {
    status: input.status,
    ended_at: endedAt,
    duration_ms: durationMs,
    error_message: cleanString(input.errorMessage),
    error_details: input.errorDetails ?? null,
  };

  const { data, error } = await client
    .from('workflow_job_attempts')
    .update(patch)
    .eq('id', input.attemptId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return (data as WorkflowJobAttemptRecord | null) ?? null;
}

export async function updateWorkflowJobAttempt(
  attemptId: number,
  patch: Partial<{
    status: WorkflowJobAttemptStatus;
    worker_kind: string | null;
    lease_owner: string | null;
    provider_request_id: string | null;
    provider_status_url: string | null;
    error_message: string | null;
    error_details: Record<string, unknown> | null;
    ended_at: string | null;
    duration_ms: number | null;
  }>,
  client: SupabaseLike = supabase,
): Promise<WorkflowJobAttemptRecord | null> {
  const { data, error } = await client
    .from('workflow_job_attempts')
    .update(patch)
    .eq('id', attemptId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return (data as WorkflowJobAttemptRecord | null) ?? null;
}

export async function claimWorkflowJob(
  jobId: number,
  options: ClaimWorkflowJobOptions,
  client: SupabaseLike = supabase,
): Promise<WorkflowJobRecord | null> {
  const job = await getWorkflowJobById(jobId, client);
  if (!job || !canClaimWorkflowJob(job, options.now)) {
    return null;
  }

  const now = options.now ?? new Date();
  const patch = {
    status: 'claimed',
    lease_owner: options.leaseOwner,
    lease_expires_at: buildWorkflowJobLeaseExpiry(now, options.leaseMs),
    claimed_at: now.toISOString(),
  };

  const query = client
    .from('workflow_jobs')
    .update(patch)
    .eq('id', jobId)
    .eq('updated_at', job.updated_at)
    .select('*')
    .maybeSingle();
  const { data, error } = await query;

  if (error) throw error;
  return (data as WorkflowJobRecord | null) ?? null;
}

export async function heartbeatWorkflowJobLease(
  jobId: number,
  options: ClaimWorkflowJobOptions,
  client: SupabaseLike = supabase,
): Promise<WorkflowJobRecord | null> {
  const now = options.now ?? new Date();
  const patch = {
    lease_owner: options.leaseOwner,
    lease_expires_at: buildWorkflowJobLeaseExpiry(now, options.leaseMs),
  };

  const { data, error } = await client
    .from('workflow_jobs')
    .update(patch)
    .eq('id', jobId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return (data as WorkflowJobRecord | null) ?? null;
}

async function patchWorkflowJob(
  jobId: number,
  patch: Record<string, unknown>,
  client: SupabaseLike = supabase,
): Promise<WorkflowJobRecord | null> {
  const { data, error } = await client
    .from('workflow_jobs')
    .update(patch)
    .eq('id', jobId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return (data as WorkflowJobRecord | null) ?? null;
}

export async function markWorkflowJobRunning(
  jobId: number,
  input: UpdateWorkflowJobExternalStateInput = {},
  client: SupabaseLike = supabase,
): Promise<WorkflowJobRecord | null> {
  return patchWorkflowJob(
    jobId,
    buildWorkflowJobPatch('running', input, {
      started_at: new Date().toISOString(),
    }),
    client,
  );
}

export async function markWorkflowJobPolling(
  jobId: number,
  input: UpdateWorkflowJobExternalStateInput = {},
  client: SupabaseLike = supabase,
): Promise<WorkflowJobRecord | null> {
  return patchWorkflowJob(
    jobId,
    buildWorkflowJobPatch('polling', input, {
      polling_at: new Date().toISOString(),
    }),
    client,
  );
}

export async function markWorkflowJobSucceeded(
  jobId: number,
  input: CompleteWorkflowJobInput = {},
  client: SupabaseLike = supabase,
): Promise<WorkflowJobRecord | null> {
  return patchWorkflowJob(
    jobId,
    buildWorkflowJobPatch('succeeded', input, {
      result_snapshot: toJsonRecord(input.resultSnapshot),
      completed_at: new Date().toISOString(),
      lease_owner: null,
      lease_expires_at: null,
      next_retry_at: null,
      last_error: null,
    }),
    client,
  );
}

export async function markWorkflowJobFailed(
  jobId: number,
  input: FailWorkflowJobInput = {},
  client: SupabaseLike = supabase,
): Promise<WorkflowJobRecord | null> {
  return patchWorkflowJob(
    jobId,
    buildWorkflowJobPatch('failed', input, {
      failed_at: new Date().toISOString(),
      lease_owner: null,
      lease_expires_at: null,
      last_error: toStoredWorkflowJobError(input.lastError as Record<string, unknown> | string | null | undefined),
    }),
    client,
  );
}

export async function scheduleWorkflowJobRetry(
  jobId: number,
  input: ScheduleWorkflowJobRetryInput,
  client: SupabaseLike = supabase,
): Promise<WorkflowJobRecord | null> {
  return patchWorkflowJob(
    jobId,
    buildWorkflowJobPatch('retry_waiting', input, {
      next_retry_at: toIsoString(input.nextRetryAt),
      lease_owner: null,
      lease_expires_at: null,
      last_error: toStoredWorkflowJobError(input.lastError as Record<string, unknown> | string | null | undefined),
    }),
    client,
  );
}

export async function deadLetterWorkflowJob(
  jobId: number,
  input: FailWorkflowJobInput = {},
  client: SupabaseLike = supabase,
): Promise<WorkflowJobRecord | null> {
  return patchWorkflowJob(
    jobId,
    buildWorkflowJobPatch('dead_lettered', input, {
      dead_lettered_at: new Date().toISOString(),
      lease_owner: null,
      lease_expires_at: null,
      last_error: toStoredWorkflowJobError(input.lastError as Record<string, unknown> | string | null | undefined),
    }),
    client,
  );
}

export async function cancelWorkflowJob(
  jobId: number,
  reason: string,
  client: SupabaseLike = supabase,
): Promise<WorkflowJobRecord | null> {
  return patchWorkflowJob(
    jobId,
    {
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      lease_owner: null,
      lease_expires_at: null,
      last_error: summarizeWorkflowJobError(reason),
    },
    client,
  );
}

export async function incrementWorkflowJobAttemptCount(
  jobId: number,
  client: SupabaseLike = supabase,
): Promise<WorkflowJobRecord | null> {
  const job = await getWorkflowJobById(jobId, client);
  if (!job) return null;

  return patchWorkflowJob(
    jobId,
    {
      attempt_count: Math.max(0, job.attempt_count) + 1,
    },
    client,
  );
}

export async function listWorkflowJobsForOrder(
  orderId: string,
  client: SupabaseLike = supabase,
  limit = 100,
): Promise<WorkflowJobRecord[]> {
  const trimmed = cleanString(orderId);
  if (!trimmed) return [];

  const { data, error } = await client
    .from('workflow_jobs')
    .select('*')
    .or(`order_id.eq.${trimmed},root_order_id.eq.${trimmed},amazon_order_id.eq.${trimmed}`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as WorkflowJobRecord[] | null) ?? [];
}

export type { WorkflowJobAttemptStatus };
