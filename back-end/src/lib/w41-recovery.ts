import { fetchOrderRowByAnyId } from '@/lib/order-lookup';
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

export type W41RecoveryAction = 'replay' | 'inspect' | 'monitor' | 'none';

export type W41RecoveryOrderRow = {
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
  product_info?: JsonRecord | null;
  character_specs?: JsonRecord | null;
  character_hash?: string | null;
  manifest3Key?: string | null;
  manifest_3_key?: string | null;
  manifest3Url?: string | null;
  manifest_3_url?: string | null;
  [key: string]: unknown;
};

export type W41RecoveryJobCounts = {
  total: number;
  statuses: Record<string, number>;
  activeCount: number;
  succeededCount: number;
  failedCount: number;
  retryWaitingCount: number;
  deadLetteredCount: number;
  canceledCount: number;
};

export type W41RecoveryCandidate = {
  rootGroupId: string;
  siblingCount: number;
  orderIds: string[];
  orderRowIds: number[];
  resolvedOrderId: string | null;
  amazonOrderId: string | null;
  executionStatus: string | null;
  currentWorkflow: string | null;
  workflowStep: string | null;
  orderStatus: string | null;
  nextWorkflow: string | null;
  luluJobIds: string[];
  luluStatuses: string[];
  printSubmittedCount: number;
  updatedAt: string | null;
  latestJobStatus: string | null;
  latestJobUpdateAt: string | null;
  minutesSinceLatestJobUpdate: number | null;
  hasRealSubmission: boolean;
  latestErrorMessage: string | null;
  jobCounts: W41RecoveryJobCounts;
  recommendedAction: W41RecoveryAction;
  recommendedReason: string;
};

export type W41RecoveryInspection = W41RecoveryCandidate & {
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

export type W41RecoveryReplayPayload = {
  rootGroupId: string;
  siblingGroup: JsonRecord[];
  claimedAt: string;
  force: true;
  backendUrl: string;
  recovery: {
    source: 'admin-w41-recovery';
    sandboxOnly: true;
  };
};

export type W41ReplayActionResult = {
  webhook: {
    status: number;
    bodyPreview: string;
  };
  replayRequest: W41RecoveryReplayPayload;
  newExecution: {
    id: string;
    status: string;
    startedAt: string;
    finished: boolean;
    stoppedAt: string | null;
  } | null;
};

export const W41_RECOVERY_ORDER_SELECT_FIELDS = [
  'id',
  'orderId',
  'root_order_id',
  'amazon_order_id',
  'workflow_step',
  'execution_status',
  'current_workflow',
  'started_at',
  'updated_at',
  'status',
  'next_workflow',
  'lulu_job_id',
  'lulu_status',
  'print_submitted_at',
  'error_message',
] as const;

export const W41_RECOVERY_ORDER_SELECT = W41_RECOVERY_ORDER_SELECT_FIELDS.join(', ');

const DEFAULT_N8N_BASE = 'https://thepeakbeyond.app.n8n.cloud';
const DEFAULT_ADMIN_BASE = 'https://admin.littleherolabs.com';
const W41_WORKFLOW_ID = 'boWA0mB20qYK2g4x';
const EXPECTED_WEBHOOK_PATH = 'w4-1-sibling-aggregation-repo';
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

function cleanOrderId(orderRow: W41RecoveryOrderRow): string | null {
  return toTrimmedString(orderRow.orderId) ?? toTrimmedString(orderRow.order_id) ?? null;
}

function cleanRootGroupId(orderRow: W41RecoveryOrderRow): string | null {
  return (
    toTrimmedString(orderRow.root_order_id) ??
    toTrimmedString(orderRow.amazon_order_id) ??
    cleanOrderId(orderRow)
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

function summarizeWorkflow(workflow: WorkflowResponse) {
  return {
    id: workflow.id,
    name: workflow.name,
    active: workflow.active,
    isArchived: workflow.isArchived ?? false,
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

function summarizeJobCounts(jobs: WorkflowJobRecord[]): W41RecoveryJobCounts {
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

function choosePrimaryGroupRow(rootGroupId: string, rows: W41RecoveryOrderRow[]): W41RecoveryOrderRow | null {
  if (!rows.length) {
    return null;
  }

  const exact =
    rows.find((row) => cleanOrderId(row) === rootGroupId) ??
    rows.find((row) => toTrimmedString(row.order_id) === rootGroupId);
  if (exact) {
    return exact;
  }

  return [...rows].sort((left, right) => {
    const leftId = cleanOrderId(left) ?? '';
    const rightId = cleanOrderId(right) ?? '';
    return leftId.localeCompare(rightId);
  })[0] ?? null;
}

function isSyntheticSandboxSubmission(row: W41RecoveryOrderRow): boolean {
  const luluJobId = toTrimmedString(row.lulu_job_id)?.toUpperCase() ?? null;
  const luluStatus = toTrimmedString(row.lulu_status)?.toUpperCase() ?? null;

  return Boolean(
    (luluJobId && luluJobId.startsWith('TEST-')) ||
      luluStatus === 'TEST_MODE' ||
      luluStatus === 'SANDBOX',
  );
}

function hasRealSubmissionSignal(rows: W41RecoveryOrderRow[]): boolean {
  return rows.some((row) => {
    if (isSyntheticSandboxSubmission(row)) {
      return false;
    }

    return Boolean(
      toTrimmedString(row.lulu_job_id) ||
        toTrimmedString(row.lulu_status) ||
        toTrimmedString(row.print_submitted_at),
    );
  });
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

async function fetchStage41Jobs(rootGroupId: string): Promise<WorkflowJobRecord[]> {
  const response = await supabase
    .from('workflow_jobs')
    .select('*')
    .eq('order_id', rootGroupId)
    .eq('stage', '4.1')
    .eq('job_type', 'w4-sibling-aggregation')
    .order('updated_at', { ascending: false });

  if (response.error) {
    throw response.error;
  }

  return (response.data ?? []) as WorkflowJobRecord[];
}

async function fetchRecentStage41Jobs(options: {
  hours?: number;
  limit?: number;
} = {}): Promise<WorkflowJobRecord[]> {
  const hours = Math.max(1, options.hours ?? 72);
  const limit = Math.max(10, options.limit ?? 25);
  const threshold = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const response = await supabase
    .from('workflow_jobs')
    .select('*')
    .eq('stage', '4.1')
    .eq('job_type', 'w4-sibling-aggregation')
    .gte('updated_at', threshold)
    .order('updated_at', { ascending: false })
    .limit(limit * 20);

  if (response.error) {
    throw response.error;
  }

  return (response.data ?? []) as WorkflowJobRecord[];
}

async function fetchOrderRowsByRootGroupIds(
  rootGroupIds: string[],
  select: string,
): Promise<Map<string, W41RecoveryOrderRow[]>> {
  const uniqueRootIds = [...new Set(rootGroupIds.map((value) => value.trim()).filter(Boolean))];
  const rowsByGroup = new Map<string, W41RecoveryOrderRow[]>();
  if (!uniqueRootIds.length) {
    return rowsByGroup;
  }

  const pushRows = (rows: W41RecoveryOrderRow[]) => {
    for (const row of rows) {
      const groupId = cleanRootGroupId(row);
      if (!groupId || !uniqueRootIds.includes(groupId)) {
        continue;
      }
      const existing = rowsByGroup.get(groupId) ?? [];
      existing.push(row);
      rowsByGroup.set(groupId, existing);
    }
  };

  const byRoot = await supabase.from('orders').select(select).in('root_order_id', uniqueRootIds);
  if (!byRoot.error) {
    pushRows((byRoot.data ?? []) as W41RecoveryOrderRow[]);
  }

  const missing = uniqueRootIds.filter((groupId) => !rowsByGroup.has(groupId));
  if (missing.length > 0) {
    const byCamel = await supabase.from('orders').select(select).in('orderId', missing);
    if (!byCamel.error) {
      pushRows((byCamel.data ?? []) as W41RecoveryOrderRow[]);
    }
  }

  const stillMissing = uniqueRootIds.filter((groupId) => !rowsByGroup.has(groupId));
  if (stillMissing.length > 0) {
    const byAmazon = await supabase
      .from('orders')
      .select(select)
      .in('amazon_order_id', stillMissing);
    if (!byAmazon.error) {
      pushRows((byAmazon.data ?? []) as W41RecoveryOrderRow[]);
    }
  }

  for (const [groupId, rows] of rowsByGroup.entries()) {
    rows.sort((left, right) => (cleanOrderId(left) ?? '').localeCompare(cleanOrderId(right) ?? ''));
    rowsByGroup.set(groupId, rows);
  }

  return rowsByGroup;
}

function buildCandidateSummary(
  rootGroupId: string,
  groupRows: W41RecoveryOrderRow[],
  jobs: WorkflowJobRecord[],
  options: { staleMinutes?: number } = {},
): W41RecoveryCandidate {
  const staleMinutesThreshold = Math.max(1, options.staleMinutes ?? 30);
  const primaryRow = choosePrimaryGroupRow(rootGroupId, groupRows);
  if (!primaryRow) {
    throw new Error(`W4.1 recovery: no order rows found for ${rootGroupId}`);
  }

  const orderedJobs = sortJobsLatestFirst(jobs);
  const latestJob = orderedJobs[0] ?? null;
  const latestJobAt = latestJobUpdateAt(jobs);
  const latestMinutes = minutesSince(latestJobAt);
  const latestStatus = latestJob?.status ?? null;
  const jobCounts = summarizeJobCounts(jobs);
  const hasRealSubmission = hasRealSubmissionSignal(groupRows);
  const latestIsActive = latestStatus ? ACTIVE_STATUSES.has(latestStatus) : false;
  const staleActive = latestIsActive && (latestMinutes === null || latestMinutes >= staleMinutesThreshold);
  const siblingCount = groupRows.length;

  let recommendedAction: W41RecoveryAction = 'none';
  let recommendedReason = 'healthy';

  if (jobCounts.total === 0) {
    recommendedReason = 'no_w41_jobs_recorded';
  } else if (latestStatus === 'succeeded') {
    recommendedReason = hasRealSubmission
      ? 'real_lulu_submission_already_exists'
      : 'latest_w41_job_succeeded';
  } else if (hasRealSubmission) {
    recommendedAction = 'inspect';
    recommendedReason = 'real_lulu_submission_already_exists';
  } else if (siblingCount < 2) {
    recommendedAction = 'inspect';
    recommendedReason = 'w41_group_incomplete';
  } else if (latestIsActive) {
    recommendedAction = staleActive ? 'inspect' : 'monitor';
    recommendedReason = staleActive
      ? 'w41_job_still_active_but_stale'
      : 'w41_job_still_in_progress';
  } else if (
    latestStatus === 'failed' ||
    latestStatus === 'dead_lettered' ||
    latestStatus === 'canceled'
  ) {
    recommendedAction = 'replay';
    recommendedReason = 'latest_w41_job_failed_before_lulu_submission';
  } else {
    recommendedAction = 'inspect';
    recommendedReason = 'w41_state_requires_manual_review';
  }

  const luluJobIds = [...new Set(groupRows.map((row) => toTrimmedString(row.lulu_job_id)).filter((value): value is string => Boolean(value)))];
  const luluStatuses = [...new Set(groupRows.map((row) => toTrimmedString(row.lulu_status)).filter((value): value is string => Boolean(value)))];
  const printSubmittedCount = groupRows.filter((row) => Boolean(toTrimmedString(row.print_submitted_at))).length;
  const updatedAt = groupRows
    .map((row) => toIsoString(row.updated_at))
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    rootGroupId,
    siblingCount,
    orderIds: groupRows
      .map((row) => cleanOrderId(row))
      .filter((value): value is string => Boolean(value)),
    orderRowIds: groupRows.map((row) => row.id),
    resolvedOrderId: cleanOrderId(primaryRow),
    amazonOrderId: toTrimmedString(primaryRow.amazon_order_id) ?? rootGroupId,
    executionStatus: toTrimmedString(primaryRow.execution_status),
    currentWorkflow: toTrimmedString(primaryRow.current_workflow),
    workflowStep: toTrimmedString(primaryRow.workflow_step),
    orderStatus: toTrimmedString(primaryRow.status),
    nextWorkflow: toTrimmedString(primaryRow.next_workflow),
    luluJobIds,
    luluStatuses,
    printSubmittedCount,
    updatedAt,
    latestJobStatus: latestStatus,
    latestJobUpdateAt: latestJobAt,
    minutesSinceLatestJobUpdate: latestMinutes,
    hasRealSubmission,
    latestErrorMessage: extractLastErrorMessage(latestJob) ?? toTrimmedString(primaryRow.error_message),
    jobCounts,
    recommendedAction,
    recommendedReason,
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildW41RecoveryCandidate(
  rootGroupId: string,
  groupRows: W41RecoveryOrderRow[],
  jobs: WorkflowJobRecord[],
  options: { staleMinutes?: number } = {},
): W41RecoveryCandidate {
  return buildCandidateSummary(rootGroupId, groupRows, jobs, options);
}

export function buildW41RecoveryReplayPayload(
  rootGroupId: string,
  siblingGroup: JsonRecord[],
  options: {
    claimedAt?: string | null;
    adminBaseUrl?: string | null;
  } = {},
): W41RecoveryReplayPayload {
  return {
    rootGroupId,
    siblingGroup,
    claimedAt: toTrimmedString(options.claimedAt) ?? new Date().toISOString(),
    force: true,
    backendUrl: getAdminBaseUrl(options.adminBaseUrl),
    recovery: {
      source: 'admin-w41-recovery',
      sandboxOnly: true,
    },
  };
}

export async function listRecentW41RecoveryCandidates(options: {
  hours?: number;
  limit?: number;
  staleMinutes?: number;
} = {}): Promise<W41RecoveryCandidate[]> {
  const jobs = await fetchRecentStage41Jobs(options);
  const jobsByGroupId = new Map<string, WorkflowJobRecord[]>();

  for (const job of jobs) {
    const rootGroupId = toTrimmedString(job.order_id);
    if (!rootGroupId) {
      continue;
    }

    const existing = jobsByGroupId.get(rootGroupId) ?? [];
    existing.push(job);
    jobsByGroupId.set(rootGroupId, existing);
  }

  const rowsByGroup = await fetchOrderRowsByRootGroupIds(
    [...jobsByGroupId.keys()],
    W41_RECOVERY_ORDER_SELECT,
  );

  const summaries = [...rowsByGroup.entries()]
    .map(([rootGroupId, groupRows]) =>
      buildCandidateSummary(rootGroupId, groupRows, jobsByGroupId.get(rootGroupId) ?? [], {
        staleMinutes: options.staleMinutes,
      }),
    )
    .filter((entry) => entry.recommendedAction !== 'none');

  const severityOrder: Record<W41RecoveryAction, number> = {
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

export async function inspectW41RecoveryGroup(
  rawOrderId: string,
  options: {
    staleMinutes?: number;
    includeWorkflowStatus?: boolean;
  } = {},
): Promise<W41RecoveryInspection> {
  const lookup = await fetchOrderRowByAnyId<W41RecoveryOrderRow>(
    supabase,
    rawOrderId,
    W41_RECOVERY_ORDER_SELECT,
  );
  if (!lookup.row) {
    throw new Error(`W4.1 recovery: sibling group not found for ${rawOrderId}`);
  }

  const rootGroupId = cleanRootGroupId(lookup.row);
  if (!rootGroupId) {
    throw new Error(`W4.1 recovery: resolved row has no rootGroupId for ${rawOrderId}`);
  }

  const rowsByGroup = await fetchOrderRowsByRootGroupIds(
    [rootGroupId],
    W41_RECOVERY_ORDER_SELECT,
  );
  const groupRows = rowsByGroup.get(rootGroupId) ?? [lookup.row];
  const jobs = await fetchStage41Jobs(rootGroupId);
  const candidate = buildCandidateSummary(rootGroupId, groupRows, jobs, {
    staleMinutes: options.staleMinutes,
  });

  let workflow: ReturnType<typeof summarizeWorkflow> | null = null;
  let executionLookupError: string | null = null;

  if (options.includeWorkflowStatus !== false) {
    try {
      workflow = summarizeWorkflow(await fetchWorkflow(W41_WORKFLOW_ID));
    } catch (error) {
      executionLookupError =
        error instanceof Error ? error.message : 'Unknown n8n lookup failure';
    }
  }

  const safeToReplay =
    candidate.recommendedAction === 'replay' &&
    !candidate.hasRealSubmission &&
    candidate.siblingCount >= 2 &&
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

async function fetchReplaySiblingGroup(rootGroupId: string): Promise<JsonRecord[]> {
  const rowsByGroup = await fetchOrderRowsByRootGroupIds([rootGroupId], '*');
  const rows = rowsByGroup.get(rootGroupId) ?? [];
  return rows
    .filter((row) => Boolean(cleanOrderId(row)))
    .map((row) => JSON.parse(JSON.stringify(row)) as JsonRecord);
}

export async function replayW41RecoveryGroup(
  rawOrderId: string,
  options: {
    adminBaseUrl?: string | null;
    executionLimit?: number;
    waitSeconds?: number;
    claimedAt?: string | null;
  } = {},
): Promise<W41ReplayActionResult> {
  const inspection = await inspectW41RecoveryGroup(rawOrderId, {
    includeWorkflowStatus: true,
  });

  if (!inspection.safeToReplay) {
    throw new Error(
      `W4.1 recovery replay refused for ${inspection.rootGroupId}: sibling group is not safe to replay`,
    );
  }

  if (inspection.workflow && !inspection.workflow.active) {
    throw new Error(
      `W4.1 recovery replay refused: top-level workflow ${W41_WORKFLOW_ID} is inactive`,
    );
  }

  const siblingGroup = await fetchReplaySiblingGroup(inspection.rootGroupId);
  if (siblingGroup.length < 2) {
    throw new Error(
      `W4.1 recovery replay refused for ${inspection.rootGroupId}: sibling group payload is incomplete`,
    );
  }

  const beforeExecutionIds = new Set(
    (await listExecutions(W41_WORKFLOW_ID, Math.max(5, options.executionLimit ?? 30))).map(
      (execution) => execution.id,
    ),
  );

  const replayRequest = buildW41RecoveryReplayPayload(inspection.rootGroupId, siblingGroup, {
    claimedAt: options.claimedAt,
    adminBaseUrl: options.adminBaseUrl,
  });
  const idempotencyKey = `${inspection.rootGroupId}-w41-recovery-${Date.now()}`;
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
      `W4.1 recovery replay failed for ${inspection.rootGroupId}: ${response.status} ${bodyText.slice(0, 300)}`,
    );
  }

  let newExecution: W41ReplayActionResult['newExecution'] = null;
  const waitSeconds = Math.max(0, options.waitSeconds ?? 8);
  if (waitSeconds > 0) {
    const deadline = Date.now() + waitSeconds * 1000;
    while (Date.now() < deadline) {
      const executions = await listExecutions(
        W41_WORKFLOW_ID,
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
