import { fetchOrderRowByAnyId } from '@/lib/order-lookup';
import { supabase } from '@/lib/supabase-client';
import {
  appendWorkflowJobEvent,
  cancelWorkflowJob,
  getLatestWorkflowJobAttemptForJob,
  updateWorkflowJobAttempt,
  updateWorkflowJobResultSnapshot,
  type WorkflowJobAttemptRecord,
  type WorkflowJobRecord,
} from '@/lib/workflow-jobs';

const HISTORY_CUTOFF_ISO = '2026-03-26T00:00:00.000Z';
const HISTORICAL_WORKFLOW_ZOMBIE_REASON = 'historical cleanup: stale proof/test workflow row';
const HISTORICAL_WORKFLOW_ZOMBIE_CLEANUP_KEY = 'historical-workflow-zombie-cleanup';
const HISTORICAL_WORKFLOW_ZOMBIE_CLEANUP_VERSION = '2026-03-31';
const HISTORICAL_WORKFLOW_ZOMBIE_SOURCE_EXECUTION_ID = 'ops-cleanup-historical-workflow-zombies';
const ACTIVE_JOB_STATUSES = new Set(['queued', 'claimed', 'running', 'polling', 'retry_waiting']);
const ACTIVE_ATTEMPT_STATUSES = new Set(['claimed', 'running', 'polling']);

const HISTORICAL_PROOF_PREFIXES = {
  '2a': 'W2A-TOP-PROD-',
  '2b': 'W2B-TOP-PROD-',
} as const;

export const KNOWN_HISTORICAL_WORKFLOW_ZOMBIE_JOB_IDS = [4, 6, 12, 13, 14, 26, 59] as const;

type SupabaseLike = typeof supabase;

type HistoricalZombieCleanupOrderRow = {
  id?: number | null;
  orderId?: string | null;
  order_id?: string | null;
  status?: string | null;
  workflow_step?: string | null;
  execution_status?: string | null;
  current_workflow?: string | null;
  next_workflow?: string | null;
  updated_at?: string | null;
};

type HistoricalZombieWorkflowJob = Pick<
  WorkflowJobRecord,
  | 'id'
  | 'stage'
  | 'job_type'
  | 'order_id'
  | 'root_order_id'
  | 'status'
  | 'attempt_count'
  | 'created_at'
  | 'updated_at'
>;

export type HistoricalZombieOrderState = {
  orderId: string | null;
  status: string | null;
  workflowStep: string | null;
  executionStatus: string | null;
  currentWorkflow: string | null;
  nextWorkflow: string | null;
  updatedAt: string | null;
};

export type HistoricalWorkflowZombieCandidateReport = {
  jobId: number;
  stage: '2A' | '2B';
  jobType: string;
  orderId: string | null;
  rootOrderId: string | null;
  status: string;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  knownInitialTarget: boolean;
  safeToCleanup: boolean;
  validationReason: string;
  orderState: HistoricalZombieOrderState | null;
};

export type HistoricalZombieCleanupResult = {
  inspected: HistoricalWorkflowZombieCandidateReport[];
  cleaned: Array<{
    jobId: number;
    orderId: string | null;
    stage: '2A' | '2B';
    previousStatus: string;
    canceledAttemptId: number | null;
  }>;
  skipped: Array<{
    jobId: number;
    orderId: string | null;
    reason: string;
  }>;
};

type HistoricalZombieCleanupRepository = {
  getLatestWorkflowJobAttemptForJob: typeof getLatestWorkflowJobAttemptForJob;
  updateWorkflowJobAttempt: typeof updateWorkflowJobAttempt;
  cancelWorkflowJob: typeof cancelWorkflowJob;
  appendWorkflowJobEvent: typeof appendWorkflowJobEvent;
  updateWorkflowJobResultSnapshot: typeof updateWorkflowJobResultSnapshot;
};

type HistoricalZombieCleanupInspector = (
  input: { jobIds?: number[] | null },
  client?: SupabaseLike,
) => Promise<HistoricalWorkflowZombieCandidateReport[]>;

const defaultRepository: HistoricalZombieCleanupRepository = {
  getLatestWorkflowJobAttemptForJob,
  updateWorkflowJobAttempt,
  cancelWorkflowJob,
  appendWorkflowJobEvent,
  updateWorkflowJobResultSnapshot,
};

function toTrimmedString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toIsoString(value?: string | Date | null): string {
  if (!value) {
    return new Date().toISOString();
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function normalizeStage(value: string | null | undefined): '2a' | '2b' | null {
  const normalized = toTrimmedString(value)?.toLowerCase() ?? null;
  if (normalized === '2a' || normalized === '2b') {
    return normalized;
  }
  return null;
}

function stageLabel(value: '2a' | '2b'): '2A' | '2B' {
  return value === '2a' ? '2A' : '2B';
}

function buildOrderStateSnapshot(order: HistoricalZombieCleanupOrderRow | null): HistoricalZombieOrderState | null {
  if (!order) {
    return null;
  }

  return {
    orderId: toTrimmedString(order.orderId) ?? toTrimmedString(order.order_id),
    status: toTrimmedString(order.status),
    workflowStep: toTrimmedString(order.workflow_step),
    executionStatus: toTrimmedString(order.execution_status),
    currentWorkflow: toTrimmedString(order.current_workflow),
    nextWorkflow: toTrimmedString(order.next_workflow),
    updatedAt: toTrimmedString(order.updated_at),
  };
}

export function isHistoricalWorkflowZombieJob(job: HistoricalZombieWorkflowJob): boolean {
  const stage = normalizeStage(job.stage);
  if (!stage) {
    return false;
  }

  const orderId = toTrimmedString(job.order_id);
  if (!orderId || !orderId.startsWith(HISTORICAL_PROOF_PREFIXES[stage])) {
    return false;
  }

  const status = toTrimmedString(job.status)?.toLowerCase() ?? null;
  if (!status || !ACTIVE_JOB_STATUSES.has(status)) {
    return false;
  }

  const createdAtMs = Date.parse(job.created_at);
  if (!Number.isFinite(createdAtMs)) {
    return false;
  }

  return createdAtMs < Date.parse(HISTORY_CUTOFF_ISO);
}

export function validateHistoricalWorkflowZombieCandidate(
  job: HistoricalZombieWorkflowJob,
  order: HistoricalZombieCleanupOrderRow | null,
): Pick<HistoricalWorkflowZombieCandidateReport, 'safeToCleanup' | 'validationReason' | 'orderState'> {
  const stage = normalizeStage(job.stage);
  const orderState = buildOrderStateSnapshot(order);

  if (!isHistoricalWorkflowZombieJob(job) || !stage) {
    return {
      safeToCleanup: false,
      validationReason: 'job_is_not_a_historical_active_w2_proof_row',
      orderState,
    };
  }

  if (!orderState) {
    return {
      safeToCleanup: false,
      validationReason: 'matching_order_row_not_found',
      orderState,
    };
  }

  if (stage === '2a') {
    const executionStatus = orderState.executionStatus;
    const nextWorkflow = orderState.nextWorkflow;
    const currentWorkflow = orderState.currentWorkflow;

    if (
      (executionStatus === 'error' || executionStatus === 'error_requires_manual_review') &&
      nextWorkflow === '2A' &&
      currentWorkflow === null
    ) {
      return {
        safeToCleanup: true,
        validationReason: 'w2a_order_already_reverted_to_error_state',
        orderState,
      };
    }

    return {
      safeToCleanup: false,
      validationReason: 'w2a_order_state_does_not_match_expected_historical_error_invariants',
      orderState,
    };
  }

  if (
    orderState.executionStatus === 'done' &&
    orderState.workflowStep === 'bria_processing_complete' &&
    orderState.status === 'pending_assembly' &&
    orderState.nextWorkflow === '2B'
  ) {
    return {
      safeToCleanup: true,
      validationReason: 'w2b_order_already_converged_to_pending_assembly',
      orderState,
    };
  }

  return {
    safeToCleanup: false,
    validationReason: 'w2b_order_state_does_not_match_expected_historical_done_invariants',
    orderState,
  };
}

async function loadHistoricalZombieJobs(
  input: {
    jobIds?: number[] | null;
  },
  client: SupabaseLike = supabase,
): Promise<HistoricalZombieWorkflowJob[]> {
  const requestedJobIds = [...new Set((input.jobIds ?? []).filter((id) => Number.isFinite(id) && id > 0))];
  let query = client
    .from('workflow_jobs')
    .select('id, stage, job_type, order_id, root_order_id, status, attempt_count, created_at, updated_at');

  if (requestedJobIds.length > 0) {
    query = query.in('id', requestedJobIds).order('id', { ascending: true });
  } else {
    query = query
      .in('stage', ['2a', '2b'])
      .in('status', ['queued', 'claimed', 'running', 'polling', 'retry_waiting'])
      .lt('created_at', HISTORY_CUTOFF_ISO)
      .order('created_at', { ascending: true });
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return ((data as HistoricalZombieWorkflowJob[] | null) ?? []).filter((job) =>
    requestedJobIds.length > 0 ? true : isHistoricalWorkflowZombieJob(job),
  );
}

async function loadHistoricalZombieOrder(
  orderId: string | null,
  client: SupabaseLike = supabase,
): Promise<HistoricalZombieCleanupOrderRow | null> {
  const trimmed = toTrimmedString(orderId);
  if (!trimmed) {
    return null;
  }

  const result = await fetchOrderRowByAnyId<HistoricalZombieCleanupOrderRow>(
    client,
    trimmed,
    'id, orderId, status, workflow_step, execution_status, current_workflow, next_workflow, updated_at',
  );

  return result.row ?? null;
}

export async function inspectHistoricalWorkflowZombieCandidates(
  input: {
    jobIds?: number[] | null;
  } = {},
  client: SupabaseLike = supabase,
): Promise<HistoricalWorkflowZombieCandidateReport[]> {
  const jobs = await loadHistoricalZombieJobs(input, client);
  const reports: HistoricalWorkflowZombieCandidateReport[] = [];

  for (const job of jobs) {
    const order = await loadHistoricalZombieOrder(job.order_id, client);
    const validation = validateHistoricalWorkflowZombieCandidate(job, order);
    const normalizedStage = normalizeStage(job.stage);

    reports.push({
      jobId: job.id,
      stage: stageLabel(normalizedStage ?? '2a'),
      jobType: job.job_type,
      orderId: toTrimmedString(job.order_id),
      rootOrderId: toTrimmedString(job.root_order_id),
      status: job.status,
      attemptCount: job.attempt_count,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      knownInitialTarget: KNOWN_HISTORICAL_WORKFLOW_ZOMBIE_JOB_IDS.includes(
        job.id as (typeof KNOWN_HISTORICAL_WORKFLOW_ZOMBIE_JOB_IDS)[number],
      ),
      safeToCleanup: validation.safeToCleanup,
      validationReason: validation.validationReason,
      orderState: validation.orderState,
    });
  }

  return reports;
}

function isActiveAttempt(attempt: WorkflowJobAttemptRecord | null): attempt is WorkflowJobAttemptRecord {
  if (!attempt) {
    return false;
  }
  return ACTIVE_ATTEMPT_STATUSES.has(attempt.status);
}

export async function applyHistoricalWorkflowZombieCleanup(
  input: {
    jobIds: number[];
    actor: string;
    now?: string | Date | null;
    repository?: HistoricalZombieCleanupRepository;
    inspector?: HistoricalZombieCleanupInspector;
  },
  client: SupabaseLike = supabase,
): Promise<HistoricalZombieCleanupResult> {
  const requestedJobIds = [...new Set(input.jobIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (requestedJobIds.length === 0) {
    throw new Error('Historical workflow zombie cleanup requires explicit job ids');
  }

  const actor = toTrimmedString(input.actor);
  if (!actor) {
    throw new Error('Historical workflow zombie cleanup requires an actor');
  }

  const repository = input.repository ?? defaultRepository;
  const inspector = input.inspector ?? inspectHistoricalWorkflowZombieCandidates;
  const inspected = await inspector({ jobIds: requestedJobIds }, client);
  const inspectedByJobId = new Map(inspected.map((entry) => [entry.jobId, entry]));
  const nowIso = toIsoString(input.now);
  const cleaned: HistoricalZombieCleanupResult['cleaned'] = [];
  const skipped: HistoricalZombieCleanupResult['skipped'] = [];

  for (const jobId of requestedJobIds) {
    const report = inspectedByJobId.get(jobId);
    if (!report) {
      skipped.push({
        jobId,
        orderId: null,
        reason: 'job_not_found',
      });
      continue;
    }

    if (!report.safeToCleanup) {
      skipped.push({
        jobId,
        orderId: report.orderId,
        reason: report.validationReason,
      });
      continue;
    }

    const latestAttempt = await repository.getLatestWorkflowJobAttemptForJob(jobId, client);
    let canceledAttemptId: number | null = null;

    if (isActiveAttempt(latestAttempt)) {
      await repository.updateWorkflowJobAttempt(
        latestAttempt.id,
        {
          status: 'canceled',
          ended_at: nowIso,
          error_message: HISTORICAL_WORKFLOW_ZOMBIE_REASON,
          error_details: {
            cleanupKey: HISTORICAL_WORKFLOW_ZOMBIE_CLEANUP_KEY,
            cleanupVersion: HISTORICAL_WORKFLOW_ZOMBIE_CLEANUP_VERSION,
            cleanedBy: actor,
            cleanedAt: nowIso,
            originalJobStatus: report.status,
          },
        },
        client,
      );
      canceledAttemptId = latestAttempt.id;
    }

    await repository.cancelWorkflowJob(jobId, HISTORICAL_WORKFLOW_ZOMBIE_REASON, client);
    await repository.appendWorkflowJobEvent(
      {
        jobId,
        attemptId: canceledAttemptId,
        eventType: 'historical-cleanup-canceled',
        payload: {
          cleanupKey: HISTORICAL_WORKFLOW_ZOMBIE_CLEANUP_KEY,
          cleanupVersion: HISTORICAL_WORKFLOW_ZOMBIE_CLEANUP_VERSION,
          cleanedAt: nowIso,
          cleanedBy: actor,
          reason: HISTORICAL_WORKFLOW_ZOMBIE_REASON,
          originalJobStatus: report.status,
          orderState: report.orderState,
          validationReason: report.validationReason,
        },
        correlation: {
          sourceSystem: 'admin',
          sourceExecutionId: HISTORICAL_WORKFLOW_ZOMBIE_SOURCE_EXECUTION_ID,
          orderId: report.orderId,
          rootGroupId: report.rootOrderId,
        },
      },
      client,
    );
    await repository.updateWorkflowJobResultSnapshot(
      jobId,
      {
        historicalCleanup: {
          key: HISTORICAL_WORKFLOW_ZOMBIE_CLEANUP_KEY,
          version: HISTORICAL_WORKFLOW_ZOMBIE_CLEANUP_VERSION,
          cleanedAt: nowIso,
          cleanedBy: actor,
          reason: HISTORICAL_WORKFLOW_ZOMBIE_REASON,
          originalJobStatus: report.status,
          orderState: report.orderState,
        },
      },
      client,
    );

    cleaned.push({
      jobId,
      orderId: report.orderId,
      stage: report.stage,
      previousStatus: report.status,
      canceledAttemptId,
    });
  }

  return {
    inspected,
    cleaned,
    skipped,
  };
}
