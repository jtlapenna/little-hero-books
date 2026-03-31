import { fetchOrderRowByAnyId } from '@/lib/order-lookup';
import { isNonProductionLuluSubmission } from '@/lib/lulu-webhook-signal';
import { supabase } from '@/lib/supabase-client';
import type { WorkflowJobRecord } from '@/lib/workflow-jobs';

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

export type W4RecoveryAction = 'replay' | 'inspect' | 'monitor' | 'none';

export type W4RecoveryOrderRow = {
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
  status?: string | null;
  next_workflow?: string | null;
  lulu_job_id?: string | null;
  lulu_status?: string | null;
  print_submitted_at?: string | null;
  error_message?: string | null;
};

export type W4RecoveryJobCounts = {
  total: number;
  statuses: Record<string, number>;
  activeCount: number;
  succeededCount: number;
  failedCount: number;
  retryWaitingCount: number;
  deadLetteredCount: number;
  canceledCount: number;
};

export type W4RecoveryCandidate = {
  orderRowId: number;
  orderId: string;
  rootOrderId: string | null;
  amazonOrderId: string | null;
  executionStatus: string | null;
  currentWorkflow: string | null;
  workflowStep: string | null;
  orderStatus: string | null;
  nextWorkflow: string | null;
  luluJobId: string | null;
  luluStatus: string | null;
  printSubmittedAt: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  latestJobStatus: string | null;
  latestJobUpdateAt: string | null;
  minutesSinceLatestJobUpdate: number | null;
  hasRealSubmission: boolean;
  latestErrorMessage: string | null;
  jobCounts: W4RecoveryJobCounts;
  recommendedAction: W4RecoveryAction;
  recommendedReason: string;
};

export type W4RecoveryInspection = W4RecoveryCandidate & {
  resolvedVia: 'id' | 'orderId' | 'order_id' | 'root_order_id' | 'amazon_order_id' | 'none';
  safeToReplay: boolean;
  workflow: {
    id: string;
    name: string;
    active: boolean;
    isArchived: boolean;
  } | null;
  executionLookupError: string | null;
  replayWebhookPath: string;
  replaySafetyMode: 'sandbox-only';
};

export type W4RecoveryReplayPayload = {
  orderId: string;
  claimedAt: string;
  force: true;
  backendUrl: string;
  recovery: {
    source: 'admin-w4-recovery';
    sandboxOnly: true;
  };
};

export type W4ReplayActionResult = {
  webhook: {
    status: number;
    bodyPreview: string;
  };
  replayRequest: W4RecoveryReplayPayload;
  newExecution: {
    id: string;
    status: string;
    startedAt: string;
    finished: boolean;
    stoppedAt: string | null;
  } | null;
};

const DEFAULT_N8N_BASE = 'https://thepeakbeyond.app.n8n.cloud';
const DEFAULT_ADMIN_BASE = 'https://admin.littleherolabs.com';
const W4_WORKFLOW_ID = 'm4qIN9PCgifUcYih';
const EXPECTED_WEBHOOK_PATH = 'w4-pdf-print-repo';
const ACTIVE_STATUSES = new Set(['queued', 'claimed', 'running', 'polling', 'retry_waiting']);

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

function cleanOrderId(orderRow: W4RecoveryOrderRow): string | null {
  return toTrimmedString(orderRow.orderId) ?? toTrimmedString(orderRow.order_id) ?? null;
}

function cleanRootOrderId(orderRow: W4RecoveryOrderRow): string | null {
  return toTrimmedString(orderRow.root_order_id) ?? null;
}

function cleanAmazonOrderId(orderRow: W4RecoveryOrderRow): string | null {
  return (
    toTrimmedString(orderRow.amazon_order_id) ??
    toTrimmedString(orderRow.root_order_id) ??
    null
  );
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function getN8NBaseUrl(): string {
  return process.env.N8N_API_URL?.trim() || process.env.N8N_BASE_URL?.trim() || DEFAULT_N8N_BASE;
}

function getAdminBaseUrl(preferred?: string | null): string {
  return (
    preferred?.trim() ||
    process.env.ADMIN_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    DEFAULT_ADMIN_BASE
  ).replace(/\/+$/, '');
}

function latestJobUpdateAt(jobs: WorkflowJobRecord[]): string | null {
  const isoValues = jobs
    .map(
      (job) =>
        toIsoString(job.updated_at) ??
        toIsoString(job.completed_at) ??
        toIsoString(job.failed_at) ??
        toIsoString(job.dead_lettered_at) ??
        toIsoString(job.canceled_at),
    )
    .filter((value): value is string => Boolean(value))
    .sort();

  return isoValues.at(-1) ?? null;
}

function extractLastErrorMessage(job: WorkflowJobRecord | null): string | null {
  if (!job?.last_error || typeof job.last_error !== 'object') {
    return null;
  }

  const directMessage = toTrimmedString(job.last_error.message);
  if (directMessage) {
    return directMessage;
  }

  const details = job.last_error.details;
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    return toTrimmedString((details as JsonRecord).message);
  }

  return null;
}

function summarizeJobCounts(jobs: WorkflowJobRecord[]): W4RecoveryJobCounts {
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

function sortJobsLatestFirst(jobs: WorkflowJobRecord[]): WorkflowJobRecord[] {
  return [...jobs].sort((left, right) => {
    const leftTime = Date.parse(
      left.updated_at ||
        left.completed_at ||
        left.failed_at ||
        left.dead_lettered_at ||
        left.canceled_at ||
        left.started_at ||
        left.queued_at,
    );
    const rightTime = Date.parse(
      right.updated_at ||
        right.completed_at ||
        right.failed_at ||
        right.dead_lettered_at ||
        right.canceled_at ||
        right.started_at ||
        right.queued_at,
    );
    const leftValue = Number.isFinite(leftTime) ? leftTime : 0;
    const rightValue = Number.isFinite(rightTime) ? rightTime : 0;
    if (leftValue !== rightValue) {
      return rightValue - leftValue;
    }
    return right.id - left.id;
  });
}

function hasRealSubmissionSignal(orderRow: W4RecoveryOrderRow): boolean {
  if (
    isNonProductionLuluSubmission({
      luluJobId: toTrimmedString(orderRow.lulu_job_id),
      currentStatus: toTrimmedString(orderRow.lulu_status),
    })
  ) {
    return false;
  }

  return Boolean(
    toTrimmedString(orderRow.lulu_job_id) ||
      toTrimmedString(orderRow.lulu_status) ||
      toTrimmedString(orderRow.print_submitted_at),
  );
}

function summarizeWorkflow(workflow: WorkflowResponse) {
  return {
    id: workflow.id,
    name: workflow.name,
    active: workflow.active,
    isArchived: workflow.isArchived ?? false,
  };
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

async function fetchStage4Jobs(orderId: string): Promise<WorkflowJobRecord[]> {
  const response = await supabase
    .from('workflow_jobs')
    .select('*')
    .eq('order_id', orderId)
    .eq('stage', '4')
    .eq('job_type', 'w4-print-fulfillment')
    .order('updated_at', { ascending: false });

  if (response.error) {
    throw response.error;
  }

  return (response.data ?? []) as WorkflowJobRecord[];
}

async function fetchRecentStage4Jobs(options: {
  hours?: number;
  limit?: number;
} = {}): Promise<WorkflowJobRecord[]> {
  const hours = Math.max(1, options.hours ?? 72);
  const limit = Math.max(10, options.limit ?? 25);
  const threshold = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const response = await supabase
    .from('workflow_jobs')
    .select('*')
    .eq('stage', '4')
    .eq('job_type', 'w4-print-fulfillment')
    .gte('updated_at', threshold)
    .order('updated_at', { ascending: false })
    .limit(limit * 20);

  if (response.error) {
    throw response.error;
  }

  return (response.data ?? []) as WorkflowJobRecord[];
}

async function fetchOrderRowsByPerBookIds(orderIds: string[]): Promise<W4RecoveryOrderRow[]> {
  const uniqueOrderIds = [...new Set(orderIds.map((value) => value.trim()).filter(Boolean))];
  if (!uniqueOrderIds.length) {
    return [];
  }

  const select =
    'id, orderId, order_id, root_order_id, amazon_order_id, workflow_step, execution_status, current_workflow, started_at, updated_at, status, next_workflow, lulu_job_id, lulu_status, print_submitted_at, error_message';
  const rowsById = new Map<string, W4RecoveryOrderRow>();

  const byCamel = await supabase.from('orders').select(select).in('orderId', uniqueOrderIds);
  if (!byCamel.error) {
    for (const row of (byCamel.data ?? []) as W4RecoveryOrderRow[]) {
      const key = cleanOrderId(row);
      if (key) {
        rowsById.set(key, row);
      }
    }
  }

  const missing = uniqueOrderIds.filter((orderId) => !rowsById.has(orderId));
  if (missing.length > 0) {
    const bySnake = await supabase.from('orders').select(select).in('order_id', missing);
    if (!bySnake.error) {
      for (const row of (bySnake.data ?? []) as W4RecoveryOrderRow[]) {
        const key = cleanOrderId(row);
        if (key) {
          rowsById.set(key, row);
        }
      }
    }
  }

  return uniqueOrderIds
    .map((orderId) => rowsById.get(orderId) ?? null)
    .filter((row): row is W4RecoveryOrderRow => Boolean(row));
}

function buildCandidateSummary(
  orderRow: W4RecoveryOrderRow,
  jobs: WorkflowJobRecord[],
  options: { staleMinutes?: number } = {},
): W4RecoveryCandidate {
  const staleMinutesThreshold = Math.max(1, options.staleMinutes ?? 30);
  const orderId = cleanOrderId(orderRow);
  if (!orderId) {
    throw new Error('W4 recovery: order row is missing per-item orderId');
  }

  const orderedJobs = sortJobsLatestFirst(jobs);
  const latestJob = orderedJobs[0] ?? null;
  const latestJobAt = latestJobUpdateAt(jobs);
  const latestMinutes = minutesSince(latestJobAt);
  const latestStatus = latestJob?.status ?? null;
  const jobCounts = summarizeJobCounts(jobs);
  const hasRealSubmission = hasRealSubmissionSignal(orderRow);
  const latestIsActive = latestStatus ? ACTIVE_STATUSES.has(latestStatus) : false;
  const staleActive = latestIsActive && (latestMinutes === null || latestMinutes >= staleMinutesThreshold);

  let recommendedAction: W4RecoveryAction = 'none';
  let recommendedReason = 'healthy';

  if (jobCounts.total === 0) {
    recommendedReason = 'no_w4_jobs_recorded';
  } else if (latestStatus === 'succeeded') {
    recommendedReason = hasRealSubmission
      ? 'real_lulu_submission_already_exists'
      : 'latest_w4_job_succeeded';
  } else if (hasRealSubmission) {
    recommendedAction = 'inspect';
    recommendedReason = 'real_lulu_submission_already_exists';
  } else if (latestIsActive) {
    recommendedAction = staleActive ? 'inspect' : 'monitor';
    recommendedReason = staleActive
      ? 'w4_job_still_active_but_stale'
      : 'w4_job_still_in_progress';
  } else if (latestStatus === 'failed' || latestStatus === 'dead_lettered' || latestStatus === 'canceled') {
    recommendedAction = 'replay';
    recommendedReason = 'latest_w4_job_failed_before_lulu_submission';
  } else {
    recommendedAction = 'inspect';
    recommendedReason = 'w4_state_requires_manual_review';
  }

  return {
    orderRowId: orderRow.id,
    orderId,
    rootOrderId: cleanRootOrderId(orderRow),
    amazonOrderId: cleanAmazonOrderId(orderRow),
    executionStatus: toTrimmedString(orderRow.execution_status),
    currentWorkflow: toTrimmedString(orderRow.current_workflow),
    workflowStep: toTrimmedString(orderRow.workflow_step),
    orderStatus: toTrimmedString(orderRow.status),
    nextWorkflow: toTrimmedString(orderRow.next_workflow),
    luluJobId: toTrimmedString(orderRow.lulu_job_id),
    luluStatus: toTrimmedString(orderRow.lulu_status),
    printSubmittedAt: toIsoString(orderRow.print_submitted_at),
    startedAt: toIsoString(orderRow.started_at),
    updatedAt: toIsoString(orderRow.updated_at),
    latestJobStatus: latestStatus,
    latestJobUpdateAt: latestJobAt,
    minutesSinceLatestJobUpdate: latestMinutes,
    hasRealSubmission,
    latestErrorMessage: extractLastErrorMessage(latestJob) ?? toTrimmedString(orderRow.error_message),
    jobCounts,
    recommendedAction,
    recommendedReason,
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildW4RecoveryCandidate(
  orderRow: W4RecoveryOrderRow,
  jobs: WorkflowJobRecord[],
  options: { staleMinutes?: number } = {},
): W4RecoveryCandidate {
  return buildCandidateSummary(orderRow, jobs, options);
}

export function buildW4RecoveryReplayPayload(
  orderId: string,
  options: {
    claimedAt?: string | null;
    adminBaseUrl?: string | null;
  } = {},
): W4RecoveryReplayPayload {
  return {
    orderId,
    claimedAt: toTrimmedString(options.claimedAt) ?? new Date().toISOString(),
    force: true,
    backendUrl: getAdminBaseUrl(options.adminBaseUrl),
    recovery: {
      source: 'admin-w4-recovery',
      sandboxOnly: true,
    },
  };
}

export async function listRecentW4RecoveryCandidates(options: {
  hours?: number;
  limit?: number;
  staleMinutes?: number;
} = {}): Promise<W4RecoveryCandidate[]> {
  const jobs = await fetchRecentStage4Jobs(options);
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
    .filter((entry): entry is W4RecoveryCandidate => Boolean(entry))
    .filter((entry) => entry.recommendedAction !== 'none');

  const severityOrder: Record<W4RecoveryAction, number> = {
    replay: 0,
    inspect: 1,
    monitor: 2,
    none: 3,
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

export async function inspectW4RecoveryOrder(
  rawOrderId: string,
  options: {
    staleMinutes?: number;
    includeWorkflowStatus?: boolean;
  } = {},
): Promise<W4RecoveryInspection> {
  const select =
    'id, orderId, order_id, root_order_id, amazon_order_id, workflow_step, execution_status, current_workflow, started_at, updated_at, status, next_workflow, lulu_job_id, lulu_status, print_submitted_at, error_message';
  const lookup = await fetchOrderRowByAnyId<W4RecoveryOrderRow>(supabase, rawOrderId, select);
  if (!lookup.row) {
    throw new Error(`W4 recovery: order not found for ${rawOrderId}`);
  }

  const orderId = cleanOrderId(lookup.row);
  if (!orderId) {
    throw new Error(`W4 recovery: resolved row has no per-item orderId for ${rawOrderId}`);
  }

  const jobs = await fetchStage4Jobs(orderId);
  const candidate = buildCandidateSummary(lookup.row, jobs, {
    staleMinutes: options.staleMinutes,
  });

  let workflow: ReturnType<typeof summarizeWorkflow> | null = null;
  let executionLookupError: string | null = null;

  if (options.includeWorkflowStatus !== false) {
    try {
      workflow = summarizeWorkflow(await fetchWorkflow(W4_WORKFLOW_ID));
    } catch (error) {
      executionLookupError =
        error instanceof Error ? error.message : 'Unknown n8n lookup failure';
    }
  }

  const safeToReplay =
    candidate.recommendedAction === 'replay' &&
    !candidate.hasRealSubmission &&
    Boolean(workflow?.active ?? true);

  return {
    ...candidate,
    resolvedVia: lookup.used,
    safeToReplay,
    workflow,
    executionLookupError,
    replayWebhookPath: EXPECTED_WEBHOOK_PATH,
    replaySafetyMode: 'sandbox-only',
  };
}

export async function replayW4RecoveryOrder(
  rawOrderId: string,
  options: {
    adminBaseUrl?: string | null;
    executionLimit?: number;
    waitSeconds?: number;
    claimedAt?: string | null;
  } = {},
): Promise<W4ReplayActionResult> {
  const inspection = await inspectW4RecoveryOrder(rawOrderId, {
    includeWorkflowStatus: true,
  });

  if (!inspection.safeToReplay) {
    throw new Error(
      `W4 recovery replay refused for ${inspection.orderId}: order is not safe to replay`,
    );
  }

  if (inspection.workflow && !inspection.workflow.active) {
    throw new Error(
      `W4 recovery replay refused: top-level workflow ${W4_WORKFLOW_ID} is inactive`,
    );
  }

  const beforeExecutionIds = new Set(
    (await listExecutions(W4_WORKFLOW_ID, Math.max(5, options.executionLimit ?? 30))).map(
      (execution) => execution.id,
    ),
  );

  const replayRequest = buildW4RecoveryReplayPayload(inspection.orderId, {
    claimedAt: options.claimedAt,
    adminBaseUrl: options.adminBaseUrl,
  });
  const idempotencyKey = `${inspection.orderId}-w4-recovery-${Date.now()}`;
  const response = await fetch(`${getN8NBaseUrl()}/webhook/${EXPECTED_WEBHOOK_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(replayRequest),
  });
  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(
      `W4 recovery replay failed for ${inspection.orderId}: ${response.status} ${bodyText.slice(0, 300)}`,
    );
  }

  let newExecution: W4ReplayActionResult['newExecution'] = null;
  const waitSeconds = Math.max(0, options.waitSeconds ?? 8);
  if (waitSeconds > 0) {
    const deadline = Date.now() + waitSeconds * 1000;
    while (Date.now() < deadline) {
      const executions = await listExecutions(
        W4_WORKFLOW_ID,
        Math.max(5, options.executionLimit ?? 30),
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
    webhook: {
      status: response.status,
      bodyPreview: bodyText.slice(0, 300),
    },
    replayRequest,
    newExecution,
  };
}
