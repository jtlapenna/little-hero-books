import { verifyCompletedW2ARecovery } from './w2a-completed-recovery';
import { fetchOrderRowByAnyId } from '@/lib/order-lookup';
import { resolveCanonicalBackendBaseUrl } from '@/lib/backend-url';
import {
  buildManifestKeyCandidates,
  buildManifestKeyHintOptionsFromOrderLike,
} from '@/lib/order-paths';
import { supabase } from '@/lib/supabase-client';
import { listN8NExecutions as listExecutions, readN8NExecution as getExecution, readN8NWorkflow as fetchWorkflow, n8nRecoveryBaseUrl as getN8NBaseUrl } from './n8n-recovery-client';
import { inspectW2AFailure, W2A_FAILURE_ORDER_FIELDS, type W2AFailureInspection } from './w2a-failure-recovery';
import { heldW2AFailure, claimTime, W2A_ORCHESTRATOR_ID } from './w2a-execution-failure';
import {
  resolveW2APoseWorkflowReplay,
  type WorkflowJobRecord,
} from '@/lib/workflow-jobs';

type JsonRecord = Record<string, unknown>;

type ExecutionListEntry = {
  id: string;
  finished: boolean;
  status: string;
  startedAt: string;
  stoppedAt?: string | null;
  workflowId: string;
};

type WorkflowResponse = {
  id: string;
  name: string;
  active: boolean;
  isArchived?: boolean;
};

export type W2ARecoveryAction = 'finalize' | 'replay' | 'inspect' | 'monitor' | 'none' | 'record_failure' | 'retry';

export type W2ARecoveryOrderRow = {
  id: number;
  orderId?: string | null;
  order_id?: string | null;
  root_order_id?: string | null;
  amazon_order_id?: string | null;
  workflow_step?: string | null;
  execution_status?: string | null;
  current_workflow?: string | null;
  started_at?: string | null;
  updated_at?: string | null;
  manifest_2a_url?: string | null;
  one_manifest_url?: string | null;
  product_info?: unknown;
  error_type?: string | null;
  error_message?: string | null;
  last_error_at?: string | null;
};

export type W2ARecoveryJobCounts = {
  total: number;
  statuses: Record<string, number>;
  activeCount: number;
  succeededCount: number;
  failedCount: number;
  retryWaitingCount: number;
  deadLetteredCount: number;
  canceledCount: number;
};

export type W2ARecoveryCandidate = {
  orderRowId: number;
  orderId: string;
  rootOrderId: string | null;
  executionStatus: string | null;
  currentWorkflow: string | null;
  workflowStep: string | null;
  manifest2aUrl: string | null;
  oneManifestUrl: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  latestJobUpdateAt: string | null;
  minutesSinceLatestJobUpdate: number | null;
  alreadyCompleted: boolean;
  allSucceeded: boolean;
  hasIncompleteJobs: boolean;
  jobCounts: W2ARecoveryJobCounts;
  recommendedAction: W2ARecoveryAction;
  recommendedReason: string;
};

export type W2ARecoveryInspection = W2ARecoveryCandidate & W2AFailureInspection & {
  resolvedVia: 'id' | 'orderId' | 'order_id' | 'root_order_id' | 'amazon_order_id' | 'none';
  manifestReachableUrl: string | null;
  safeToFinalize: boolean;
  safeToReplay: boolean;
  payloadRecoverable: boolean;
  workflow: {
    id: string;
    name: string;
    active: boolean;
    isArchived: boolean;
  } | null;
  matchedExecution: {
    id: string;
    workflowId: string;
    status: string;
    startedAt: string;
    finished: boolean;
    stoppedAt: string | null;
  } | null;
  executionLookupError: string | null;
  replayableLogicalKeys: string[];
  pendingLogicalKeys: string[];
};

export type W2AReplayActionResult = {
  matchedExecutionId: string;
  webhook: {
    status: number;
    bodyPreview: string;
  };
  newExecution: {
    id: string;
    workflowId: string;
    status: string;
    startedAt: string;
    finished: boolean;
    stoppedAt: string | null;
  } | null;
};

export type W2AFinalizeActionResult = {
  completionResponse: unknown;
};

const TOP_WORKFLOW_ID = W2A_ORCHESTRATOR_ID;
const EXPECTED_WEBHOOK_PATH = '2a-start-repo';

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toIsoString(value: unknown): string | null {
  const normalized = toTrimmedString(value);
  if (!normalized) {
    return null;
  }
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function minutesSince(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000 / 60));
}

function cleanOrderId(orderRow: W2ARecoveryOrderRow): string | null {
  return (
    toTrimmedString(orderRow.orderId) ??
    toTrimmedString(orderRow.order_id) ??
    null
  );
}

function cleanRootOrderId(orderRow: W2ARecoveryOrderRow): string | null {
  return (
    toTrimmedString(orderRow.root_order_id) ??
    toTrimmedString(orderRow.amazon_order_id) ??
    null
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function looksLikeReplayPayload(value: unknown): value is JsonRecord {
  if (!isRecord(value)) {
    return false;
  }

  const orderId = toTrimmedString(value.orderId);
  const rootOrderId =
    toTrimmedString(value.rootOrderId) ??
    toTrimmedString(value.root_order_id) ??
    toTrimmedString(value.amazonOrderId) ??
    toTrimmedString(value.amazon_order_id);

  return Boolean(
    orderId &&
      (rootOrderId ||
        isRecord(value.characterSpecs) ||
        isRecord(value.bookSpecs) ||
        isRecord(value.shippingAddress) ||
        isRecord(value.orderDetails)),
  );
}

function collectPayloadCandidates(
  value: unknown,
  out: JsonRecord[],
  seen: WeakSet<object>,
  depth = 0,
): void {
  if (depth > 12) {
    return;
  }

  if (looksLikeReplayPayload(value)) {
    out.push(value);
  }

  if (!isRecord(value)) {
    if (Array.isArray(value)) {
      for (const entry of value.slice(0, 50)) {
        collectPayloadCandidates(entry, out, seen, depth + 1);
      }
    }
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  for (const entry of Object.values(value)) {
    if (Array.isArray(entry)) {
      for (const child of entry.slice(0, 50)) {
        collectPayloadCandidates(child, out, seen, depth + 1);
      }
      continue;
    }

    collectPayloadCandidates(entry, out, seen, depth + 1);
  }
}

function extractExecutionPayload(execution: unknown, targetOrderId: string): JsonRecord | null {
  const matches: JsonRecord[] = [];
  collectPayloadCandidates(execution, matches, new WeakSet<object>());

  return (
    matches.find(
      (candidate) => toTrimmedString(candidate.orderId) === targetOrderId,
    ) ?? null
  );
}

function summarizeJobCounts(jobs: WorkflowJobRecord[]): W2ARecoveryJobCounts {
  const statuses = new Map<string, number>();
  let activeCount = 0;
  let succeededCount = 0;
  let failedCount = 0;
  let retryWaitingCount = 0;
  let deadLetteredCount = 0;
  let canceledCount = 0;

  for (const job of jobs) {
    statuses.set(job.status, (statuses.get(job.status) ?? 0) + 1);

    if (job.status === 'succeeded') {
      succeededCount += 1;
      continue;
    }

    if (job.status === 'failed') {
      failedCount += 1;
      continue;
    }

    if (job.status === 'retry_waiting') {
      retryWaitingCount += 1;
      continue;
    }

    if (job.status === 'dead_lettered') {
      deadLetteredCount += 1;
      continue;
    }

    if (job.status === 'canceled') {
      canceledCount += 1;
      continue;
    }

    activeCount += 1;
  }

  return {
    total: jobs.length,
    statuses: Object.fromEntries(
      [...statuses.entries()].sort(([left], [right]) => left.localeCompare(right)),
    ),
    activeCount,
    succeededCount,
    failedCount,
    retryWaitingCount,
    deadLetteredCount,
    canceledCount,
  };
}

function latestJobUpdateAt(jobs: WorkflowJobRecord[]): string | null {
  const isoValues = jobs
    .map((job) => toIsoString(job.updated_at) ?? toIsoString(job.completed_at))
    .filter((value): value is string => Boolean(value))
    .sort();

  return isoValues.at(-1) ?? null;
}

function buildCandidateSummary(
  orderRow: W2ARecoveryOrderRow,
  jobs: WorkflowJobRecord[],
  options: { staleMinutes?: number } = {},
): W2ARecoveryCandidate {
  const staleMinutesThreshold = Math.max(1, options.staleMinutes ?? 30);
  const orderId = cleanOrderId(orderRow);
  if (!orderId) {
    throw new Error('W2A recovery: order row is missing per-item orderId');
  }

  const jobCounts = summarizeJobCounts(jobs);
  const latestJobAt = latestJobUpdateAt(jobs);
  const latestMinutes = minutesSince(latestJobAt);
  const alreadyCompleted =
    toTrimmedString(orderRow.workflow_step) === '2A-complete' &&
    Boolean(toTrimmedString(orderRow.manifest_2a_url));
  const allSucceeded = jobCounts.total > 0 && jobCounts.succeededCount === jobCounts.total;
  const hasIncompleteJobs = jobCounts.total > 0 && !allSucceeded;
  const isErrorState =
    toTrimmedString(orderRow.execution_status) === 'error' ||
    toTrimmedString(orderRow.execution_status) === 'error_requires_manual_review';
  const outsideW2A =
    toTrimmedString(orderRow.current_workflow) !== null &&
    toTrimmedString(orderRow.current_workflow) !== '2A';
  const staleInProgress =
    hasIncompleteJobs &&
    (latestMinutes === null || latestMinutes >= staleMinutesThreshold);
  const hasRecoverySignal =
    jobCounts.failedCount > 0 ||
    jobCounts.retryWaitingCount > 0 ||
    jobCounts.deadLetteredCount > 0 ||
    jobCounts.canceledCount > 0;

  let recommendedAction: W2ARecoveryAction = 'none';
  let recommendedReason = 'healthy';

  if (jobCounts.total === 0) {
    recommendedReason = 'no_2a_jobs_recorded';
    if (heldW2AFailure(orderRow)) {
      recommendedAction = 'inspect'; recommendedReason = 'w2a_failed_before_pose_jobs';
    } else if (orderRow.current_workflow === '2A' && orderRow.execution_status === 'processing' &&
        (minutesSince(claimTime(orderRow.started_at)) ?? 0) >= staleMinutesThreshold) {
      recommendedAction = 'inspect'; recommendedReason = 'w2a_has_no_pose_jobs_after_expected_start';
    }
  } else if (allSucceeded && !alreadyCompleted) {
    recommendedAction = toTrimmedString(orderRow.manifest_2a_url) ? 'finalize' : 'inspect';
    recommendedReason = toTrimmedString(orderRow.manifest_2a_url)
      ? 'all_jobs_succeeded_parent_not_finalized'
      : 'all_jobs_succeeded_manifest_not_written_to_order';
  } else if (
    hasIncompleteJobs &&
    (hasRecoverySignal || isErrorState || outsideW2A || staleInProgress)
  ) {
    recommendedAction = 'replay';
    recommendedReason = hasRecoverySignal
      ? 'pose_jobs_need_recovery'
      : isErrorState
      ? 'parent_stage_in_error'
      : outsideW2A
      ? 'parent_stage_left_2a_before_child_jobs_finished'
      : 'child_jobs_stale_without_parent_completion';
  } else if (hasIncompleteJobs) {
    recommendedAction = 'monitor';
    recommendedReason = '2a_jobs_still_in_progress';
  } else if (alreadyCompleted) {
    recommendedReason = 'already_completed';
  }

  return {
    orderRowId: orderRow.id,
    orderId,
    rootOrderId: cleanRootOrderId(orderRow),
    executionStatus: toTrimmedString(orderRow.execution_status),
    currentWorkflow: toTrimmedString(orderRow.current_workflow),
    workflowStep: toTrimmedString(orderRow.workflow_step),
    manifest2aUrl: toTrimmedString(orderRow.manifest_2a_url),
    oneManifestUrl: toTrimmedString(orderRow.one_manifest_url),
    startedAt: claimTime(orderRow.started_at),
    updatedAt: toIsoString(orderRow.updated_at),
    latestJobUpdateAt: latestJobAt,
    minutesSinceLatestJobUpdate: latestMinutes,
    alreadyCompleted,
    allSucceeded,
    hasIncompleteJobs,
    jobCounts,
    recommendedAction,
    recommendedReason,
  };
}

function summarizeWorkflow(workflow: WorkflowResponse) {
  return {
    id: workflow.id,
    name: workflow.name,
    active: workflow.active,
    isArchived: workflow.isArchived ?? false,
  };
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function findExecutionWithPayload(
  orderId: string,
  executionLimit: number,
  preferredWorkflowId: string | null = TOP_WORKFLOW_ID,
) {
  const seenExecutionIds = new Set<string>();
  const searchScopes = preferredWorkflowId ? [preferredWorkflowId, null] : [null];

  for (const workflowId of searchScopes) {
    const executions = await listExecutions(executionLimit, workflowId);

    for (const execution of executions) {
      if (seenExecutionIds.has(execution.id)) {
        continue;
      }
      seenExecutionIds.add(execution.id);

      const fullExecution = await getExecution(execution.id);
      const payload = extractExecutionPayload(fullExecution, orderId);
      if (!payload) {
        continue;
      }

      return {
        listEntry: execution,
        payload,
      };
    }
  }

  return null;
}

async function findNewExecutionWithPayload(options: {
  orderId: string;
  executionLimit: number;
  beforeExecutionIds: Set<string>;
}): Promise<ExecutionListEntry | null> {
  const executions = await listExecutions(options.executionLimit);

  for (const execution of executions) {
    if (options.beforeExecutionIds.has(execution.id)) {
      continue;
    }

    const fullExecution = await getExecution(execution.id);
    const payload = extractExecutionPayload(fullExecution, options.orderId);
    if (payload) {
      return execution;
    }
  }

  return null;
}

async function fetchStage2AJobs(orderId: string): Promise<WorkflowJobRecord[]> {
  const response = await supabase
    .from('workflow_jobs')
    .select('*')
    .eq('order_id', orderId)
    .eq('stage', '2a')
    .order('logical_key', { ascending: true });

  if (response.error) {
    throw response.error;
  }

  return (response.data ?? []) as WorkflowJobRecord[];
}

async function fetchRecentStage2AJobs(options: {
  hours?: number;
  limit?: number;
} = {}): Promise<WorkflowJobRecord[]> {
  const hours = Math.max(1, options.hours ?? 72);
  const limit = Math.max(10, options.limit ?? 25);
  const threshold = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const response = await supabase
    .from('workflow_jobs')
    .select('*')
    .eq('stage', '2a')
    .gte('updated_at', threshold)
    .order('updated_at', { ascending: false })
    .limit(limit * 20);

  if (response.error) {
    throw response.error;
  }

  return (response.data ?? []) as WorkflowJobRecord[];
}

async function fetchOrderRowsByPerBookIds(orderIds: string[]): Promise<W2ARecoveryOrderRow[]> {
  const uniqueOrderIds = [...new Set(orderIds.map((value) => value.trim()).filter(Boolean))];
  if (uniqueOrderIds.length === 0) {
    return [];
  }

  const select =
    'id, orderId, order_id, root_order_id, amazon_order_id, workflow_step, execution_status, current_workflow, started_at, updated_at, manifest_2a_url, one_manifest_url';

  const rowsById = new Map<string, W2ARecoveryOrderRow>();

  const byCamel = await supabase
    .from('orders')
    .select(select)
    .in('orderId', uniqueOrderIds);
  if (!byCamel.error) {
    for (const row of (byCamel.data ?? []) as W2ARecoveryOrderRow[]) {
      const key = cleanOrderId(row);
      if (key) {
        rowsById.set(key, row);
      }
    }
  }

  const missing = uniqueOrderIds.filter((orderId) => !rowsById.has(orderId));
  if (missing.length > 0) {
    const bySnake = await supabase
      .from('orders')
      .select(select)
      .in('order_id', missing);

    if (!bySnake.error) {
      for (const row of (bySnake.data ?? []) as W2ARecoveryOrderRow[]) {
        const key = cleanOrderId(row);
        if (key) {
          rowsById.set(key, row);
        }
      }
    }
  }

  return uniqueOrderIds
    .map((orderId) => rowsById.get(orderId) ?? null)
    .filter((row): row is W2ARecoveryOrderRow => Boolean(row));
}

async function resolveManifestUrl(
  orderId: string,
  orderRow: W2ARecoveryOrderRow,
  adminBaseUrl: string,
): Promise<string | null> {
  const pathLikes = [
    toTrimmedString(orderRow.manifest_2a_url),
    toTrimmedString(orderRow.one_manifest_url),
    ...buildManifestKeyHintOptionsFromOrderLike(orderRow).pathLikes,
  ].filter((value): value is string => Boolean(value));

  const candidateKeys = buildManifestKeyCandidates(orderId, '2a', {
    ...buildManifestKeyHintOptionsFromOrderLike(orderRow),
    pathLikes,
  });

  for (const key of candidateKeys) {
    const url = `${adminBaseUrl.replace(/\/+$/, '')}/api/manifests/${key}`;
    const response = await fetch(url, { redirect: 'follow' });
    if (response.ok) {
      return url;
    }
  }

  return null;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildW2ARecoveryCandidate(
  orderRow: W2ARecoveryOrderRow,
  jobs: WorkflowJobRecord[],
  options: { staleMinutes?: number } = {},
): W2ARecoveryCandidate {
  return buildCandidateSummary(orderRow, jobs, options);
}

export async function listRecentW2ARecoveryCandidates(options: {
  hours?: number;
  limit?: number;
  staleMinutes?: number;
} = {}): Promise<W2ARecoveryCandidate[]> {
  const jobs = await fetchRecentStage2AJobs(options);
  const jobsByOrderId = new Map<string, WorkflowJobRecord[]>();

  for (const job of jobs) {
    const orderId = toTrimmedString(job.order_id);
    if (!orderId) {
      continue;
    }
    const existing = jobsByOrderId.get(orderId) ?? [];
    existing.push(job);
    jobsByOrderId.set(orderId, existing);
  }

  const orderRows = await fetchOrderRowsByPerBookIds([...jobsByOrderId.keys()]);
  const threshold = new Date(Date.now() - Math.max(1, options.hours ?? 72) * 3600000).toISOString();
  const [processing, failed] = await Promise.all([
    supabase.from('orders').select(W2A_FAILURE_ORDER_FIELDS).eq('current_workflow', '2A').eq('execution_status', 'processing')
      .gte('updated_at', threshold).order('updated_at', { ascending: false }).limit(100),
    supabase.from('orders').select(W2A_FAILURE_ORDER_FIELDS).like('error_type', 'w2a_%').in('execution_status', ['error', 'error_requires_manual_review'])
      .gte('updated_at', threshold).order('updated_at', { ascending: false }).limit(100),
  ]);
  if (processing.error || failed.error) throw Error('Early W2A recovery candidates could not be loaded');
  const byPhysicalId = new Map(orderRows.map(row => [row.id, row]));
  for (const row of [...(processing.data ?? []), ...(failed.data ?? [])]) byPhysicalId.set(row.id, row as W2ARecoveryOrderRow);
  const summaries = [...byPhysicalId.values()]
    .map((orderRow) => {
      const orderId = cleanOrderId(orderRow);
      if (!orderId) {
        return null;
      }
      return buildCandidateSummary(orderRow, jobsByOrderId.get(orderId) ?? [], {
        staleMinutes: options.staleMinutes,
      });
    })
    .filter((entry): entry is W2ARecoveryCandidate => Boolean(entry))
    .filter((entry) => entry.recommendedAction !== 'none' && entry.recommendedAction !== 'monitor');

  const severityOrder: Record<W2ARecoveryAction, number> = {
    record_failure: 0,
    retry: 1,
    finalize: 0,
    replay: 1,
    inspect: 2,
    monitor: 3,
    none: 4,
  };

  summaries.sort((left, right) => {
    const severityDelta =
      severityOrder[left.recommendedAction] - severityOrder[right.recommendedAction];
    if (severityDelta !== 0) {
      return severityDelta;
    }

    return (right.latestJobUpdateAt ?? '').localeCompare(left.latestJobUpdateAt ?? '');
  });

  return summaries.slice(0, Math.max(1, options.limit ?? 25));
}

export async function inspectW2ARecoveryOrder(
  rawOrderId: string,
  options: {
    adminBaseUrl?: string;
    executionLimit?: number;
    staleMinutes?: number;
    includeExecutionLookup?: boolean;
  } = {},
): Promise<W2ARecoveryInspection> {
  const select = W2A_FAILURE_ORDER_FIELDS + ',order_id';
  const lookup = await fetchOrderRowByAnyId<W2ARecoveryOrderRow>(supabase, rawOrderId, select);
  if (!lookup.row) {
    throw new Error(`W2A recovery: order not found for ${rawOrderId}`);
  }

  const orderId = cleanOrderId(lookup.row);
  if (!orderId) {
    throw new Error(`W2A recovery: resolved row has no per-item orderId for ${rawOrderId}`);
  }

  const jobs = await fetchStage2AJobs(orderId);
  const candidate = buildCandidateSummary(lookup.row, jobs, {
    staleMinutes: options.staleMinutes,
  });
  const adminBaseUrl = resolveCanonicalBackendBaseUrl(options.adminBaseUrl);

  const manifestReachableUrl = await resolveManifestUrl(orderId, lookup.row, adminBaseUrl);

  const replayRows = await Promise.all(
    jobs.map(async (job) => ({
      job,
      replay: await resolveW2APoseWorkflowReplay(job),
    })),
  );
  const replayableLogicalKeys = replayRows
    .filter((entry) => entry.replay)
    .map((entry) => entry.job.logical_key);
  const pendingLogicalKeys = replayRows
    .filter((entry) => !entry.replay)
    .map((entry) => `${entry.job.logical_key}:${entry.job.status}`);

  let workflow: ReturnType<typeof summarizeWorkflow> | null = null;
  let matchedExecution: W2ARecoveryInspection['matchedExecution'] = null;
  let payloadRecoverable = false;
  let executionLookupError: string | null = null;
  let failureInspection: W2AFailureInspection = { failure: null, failureRecorded: false, canRecordFailure: false,
    safeToRetry: false, failureLookupError: null, failureRevision: lookup.row.updated_at ?? null };

  if (options.includeExecutionLookup !== false) {
    try {
      if (jobs.length === 0 || heldW2AFailure(lookup.row)) {
        failureInspection = await inspectW2AFailure({ ...lookup.row });
        workflow = summarizeWorkflow(await fetchWorkflow(TOP_WORKFLOW_ID));
        const failure = failureInspection.failure;
        if (failure) {
          matchedExecution = { id: failure.executionId, workflowId: TOP_WORKFLOW_ID, status: 'error',
            startedAt: failure.claimStartedAt, stoppedAt: failure.failedAt, finished: false };
          payloadRecoverable = true;
        }
        executionLookupError = failureInspection.failureLookupError;
      } else {
      const matched = await findExecutionWithPayload(
        orderId,
        Math.max(5, options.executionLimit ?? 40),
      );
      let resolvedWorkflow: WorkflowResponse | null = null;
      if (matched) {
        resolvedWorkflow = await fetchWorkflow(matched.listEntry.workflowId).catch(() => null);
      }
      if (!resolvedWorkflow) {
        resolvedWorkflow = await fetchWorkflow(TOP_WORKFLOW_ID).catch(() => null);
      }

      workflow = resolvedWorkflow ? summarizeWorkflow(resolvedWorkflow) : null;
      matchedExecution = matched
        ? {
            id: matched.listEntry.id,
            workflowId: matched.listEntry.workflowId,
            status: matched.listEntry.status,
            startedAt: matched.listEntry.startedAt,
            finished: matched.listEntry.finished,
            stoppedAt: matched.listEntry.stoppedAt ?? null,
          }
        : null;
      payloadRecoverable = Boolean(matched);
      }
    } catch (error) {
      executionLookupError =
        error instanceof Error ? error.message : 'Unknown n8n lookup failure';
    }
  }

  let safeToFinalize = false;
  let completionHoldReason: string | null = null;
  if (candidate.allSucceeded && heldW2AFailure(lookup.row)) {
    try { await verifyCompletedW2ARecovery({ ...lookup.row }, jobs); safeToFinalize = true; }
    catch (error) { completionHoldReason = error instanceof Error ? error.message : 'Completion proof unavailable'; }
  }
  // Full webhook replay also reruns SW0 and cannot safely resume partial published work.
  const safeToReplay = false;

  let recommendedAction = candidate.recommendedAction;
  if (safeToFinalize) {
    recommendedAction = 'finalize';
  } else if (
    candidate.recommendedAction === 'replay' &&
    !safeToReplay &&
    !payloadRecoverable
  ) {
    recommendedAction = 'inspect';
  }
  if (failureInspection.canRecordFailure) recommendedAction = 'record_failure';
  else if (failureInspection.safeToRetry) recommendedAction = 'retry';

  return {
    ...candidate,
    ...failureInspection,
    recommendedAction: safeToFinalize ? 'finalize' : recommendedAction === 'replay' || recommendedAction === 'finalize' ? 'inspect' : recommendedAction,
    recommendedReason: safeToFinalize ? 'All frozen poses are approved and available. Finalize into manual review without generation.' : completionHoldReason ?? (candidate.hasIncompleteJobs ? 'Partial W2A resume is held. Configured poses require verified generation provenance; full replay would rerun the base character. Inspect the failure before recovery.' : candidate.recommendedReason),
    resolvedVia: lookup.used,
    manifestReachableUrl,
    safeToFinalize,
    safeToReplay,
    payloadRecoverable,
    workflow,
    matchedExecution,
    executionLookupError,
    replayableLogicalKeys,
    pendingLogicalKeys,
  };
}

export async function replayW2ARecoveryOrder(
  rawOrderId: string,
  options: {
    executionLimit?: number;
    waitSeconds?: number;
  } = {},
): Promise<W2AReplayActionResult> {
  const inspection = await inspectW2ARecoveryOrder(rawOrderId, {
    executionLimit: options.executionLimit,
    includeExecutionLookup: true,
  });

  if (!inspection.safeToReplay) {
    throw new Error(
      `W2A recovery replay refused for ${inspection.orderId}: order is not safe to replay`,
    );
  }

  const matched = await findExecutionWithPayload(
    inspection.orderId,
    Math.max(5, options.executionLimit ?? 40),
  );
  if (!matched) {
    throw new Error(
      `W2A recovery replay could not recover the original webhook payload for ${inspection.orderId}`,
    );
  }

  const beforeExecutionIds = new Set(
    (await listExecutions(Math.max(20, options.executionLimit ?? 40))).map(
      (execution) => execution.id,
    ),
  );

  const idempotencyKey = `${inspection.orderId}-recovery-${Date.now()}`;
  const response = await fetch(`${getN8NBaseUrl()}/webhook/${EXPECTED_WEBHOOK_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(matched.payload),
  });
  const bodyText = await response.text();

  let newExecution: W2AReplayActionResult['newExecution'] = null;
  const waitSeconds = Math.max(0, options.waitSeconds ?? 8);
  if (waitSeconds > 0) {
    const deadline = Date.now() + waitSeconds * 1000;
    while (Date.now() < deadline) {
      const observed = await findNewExecutionWithPayload({
        orderId: inspection.orderId,
        executionLimit: Math.max(20, options.executionLimit ?? 40),
        beforeExecutionIds,
      });
      if (observed) {
        newExecution = {
          id: observed.id,
          workflowId: observed.workflowId,
          status: observed.status,
          startedAt: observed.startedAt,
          finished: observed.finished,
          stoppedAt: observed.stoppedAt ?? null,
        };
        break;
      }
      await sleep(2000);
    }
  }

  return {
    matchedExecutionId: matched.listEntry.id,
    webhook: {
      status: response.status,
      bodyPreview: bodyText.slice(0, 300),
    },
    newExecution,
  };
}
