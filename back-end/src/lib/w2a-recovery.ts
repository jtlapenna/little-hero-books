import { fetchOrderRowByAnyId } from '@/lib/order-lookup';
import {
  buildManifestKeyCandidates,
  buildManifestKeyHintOptionsFromOrderLike,
} from '@/lib/order-paths';
import { supabase } from '@/lib/supabase-client';
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

export type W2ARecoveryAction = 'finalize' | 'replay' | 'inspect' | 'monitor' | 'none';

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

export type W2ARecoveryInspection = W2ARecoveryCandidate & {
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
    status: string;
    startedAt: string;
    finished: boolean;
    stoppedAt: string | null;
  } | null;
};

export type W2AFinalizeActionResult = {
  completionResponse: unknown;
};

const DEFAULT_N8N_BASE = 'https://thepeakbeyond.app.n8n.cloud';
const DEFAULT_ADMIN_BASE = 'https://admin.littleherolabs.com';
const TOP_WORKFLOW_ID = 'HduzTWm0ekmrvwrn';
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
    startedAt: toIsoString(orderRow.started_at),
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

function getN8NBaseUrl(): string {
  return (
    process.env.N8N_API_URL?.trim() ||
    process.env.N8N_BASE_URL?.trim() ||
    DEFAULT_N8N_BASE
  );
}

async function listExecutions(
  workflowId: string,
  executionLimit: number,
): Promise<ExecutionListEntry[]> {
  const response = await fetch(
    `${getN8NBaseUrl()}/api/v1/executions?workflowId=${encodeURIComponent(workflowId)}&limit=${executionLimit}`,
    {
      headers: {
        'X-N8N-API-KEY': requireEnv('N8N_API_KEY'),
      },
    },
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `listExecutions(${workflowId}) failed: ${response.status} ${text.slice(0, 300)}`,
    );
  }

  const parsed = JSON.parse(text) as { data?: ExecutionListEntry[] };
  return parsed.data ?? [];
}

async function getExecution(executionId: string): Promise<unknown> {
  const response = await fetch(
    `${getN8NBaseUrl()}/api/v1/executions/${executionId}?includeData=true`,
    {
      headers: {
        'X-N8N-API-KEY': requireEnv('N8N_API_KEY'),
      },
    },
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `getExecution(${executionId}) failed: ${response.status} ${text.slice(0, 300)}`,
    );
  }

  return JSON.parse(text);
}

async function fetchWorkflow(workflowId: string): Promise<WorkflowResponse> {
  const response = await fetch(`${getN8NBaseUrl()}/api/v1/workflows/${workflowId}`, {
    headers: {
      'X-N8N-API-KEY': requireEnv('N8N_API_KEY'),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `fetchWorkflow(${workflowId}) failed: ${response.status} ${text.slice(0, 300)}`,
    );
  }

  return JSON.parse(text) as WorkflowResponse;
}

async function findExecutionWithPayload(orderId: string, executionLimit: number) {
  const executions = await listExecutions(TOP_WORKFLOW_ID, executionLimit);

  for (const execution of executions) {
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
  const summaries = orderRows
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
  const select =
    'id, orderId, order_id, root_order_id, amazon_order_id, workflow_step, execution_status, current_workflow, started_at, updated_at, manifest_2a_url, one_manifest_url';
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
  const adminBaseUrl =
    options.adminBaseUrl?.trim() ||
    process.env.ADMIN_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    DEFAULT_ADMIN_BASE;

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

  if (options.includeExecutionLookup !== false) {
    try {
      const [topWorkflow, matched] = await Promise.all([
        fetchWorkflow(TOP_WORKFLOW_ID),
        findExecutionWithPayload(orderId, Math.max(5, options.executionLimit ?? 40)),
      ]);

      workflow = summarizeWorkflow(topWorkflow);
      matchedExecution = matched
        ? {
            id: matched.listEntry.id,
            status: matched.listEntry.status,
            startedAt: matched.listEntry.startedAt,
            finished: matched.listEntry.finished,
            stoppedAt: matched.listEntry.stoppedAt ?? null,
          }
        : null;
      payloadRecoverable = Boolean(matched);
    } catch (error) {
      executionLookupError =
        error instanceof Error ? error.message : 'Unknown n8n lookup failure';
    }
  }

  const safeToFinalize =
    !candidate.alreadyCompleted && candidate.allSucceeded && Boolean(manifestReachableUrl);
  const safeToReplay =
    candidate.hasIncompleteJobs &&
    Boolean(workflow?.active ?? true) &&
    payloadRecoverable;

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

  return {
    ...candidate,
    recommendedAction,
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

async function postWorkflow2AComplete(options: {
  orderId: string;
  rootOrderId: string | null;
  manifestUrl: string;
  posesGenerated: number;
  adminBaseUrl: string;
}): Promise<unknown> {
  const response = await fetch(
    `${options.adminBaseUrl.replace(/\/+$/, '')}/api/webhooks/workflow-2a-complete`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireEnv('BACKEND_API_TOKEN')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderId: options.orderId,
        manifestUrl: options.manifestUrl,
        amazonOrderId: options.rootOrderId ?? undefined,
        posesGenerated: options.posesGenerated,
        needsReview: false,
      }),
    },
  );

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      `workflow-2a-complete failed for ${options.orderId}: ${response.status} ${text.slice(0, 500)}`,
    );
  }
  return parsed;
}

export async function finalizeW2ARecoveryOrder(
  rawOrderId: string,
  options: {
    adminBaseUrl?: string;
    executionLimit?: number;
    staleMinutes?: number;
  } = {},
): Promise<W2AFinalizeActionResult> {
  const inspection = await inspectW2ARecoveryOrder(rawOrderId, {
    adminBaseUrl: options.adminBaseUrl,
    executionLimit: options.executionLimit,
    staleMinutes: options.staleMinutes,
    includeExecutionLookup: false,
  });

  if (!inspection.safeToFinalize || !inspection.manifestReachableUrl) {
    throw new Error(
      `W2A recovery finalize refused for ${inspection.orderId}: order is not safe to finalize`,
    );
  }

  const completionResponse = await postWorkflow2AComplete({
    orderId: inspection.orderId,
    rootOrderId: inspection.rootOrderId,
    manifestUrl: inspection.manifestReachableUrl,
    posesGenerated: inspection.jobCounts.total,
    adminBaseUrl:
      options.adminBaseUrl?.trim() ||
      process.env.ADMIN_BASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      DEFAULT_ADMIN_BASE,
  });

  return {
    completionResponse,
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

  const workflow = await fetchWorkflow(TOP_WORKFLOW_ID);
  if (!workflow.active) {
    throw new Error(
      `W2A recovery replay refused: top-level workflow ${TOP_WORKFLOW_ID} is inactive`,
    );
  }

  const beforeExecutionIds = new Set(
    (await listExecutions(TOP_WORKFLOW_ID, Math.max(5, options.executionLimit ?? 40))).map(
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
      const executions = await listExecutions(
        TOP_WORKFLOW_ID,
        Math.max(5, options.executionLimit ?? 40),
      );
      const observed = executions.find((execution) => !beforeExecutionIds.has(execution.id));
      if (observed) {
        newExecution = {
          id: observed.id,
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
