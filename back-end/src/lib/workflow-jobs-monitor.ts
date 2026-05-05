import { fetchOrderRowByAnyId } from '@/lib/order-lookup';
import { isNonProductionLuluSubmission } from '@/lib/lulu-webhook-signal';
import { supabase } from '@/lib/supabase-client';
import {
  listOpenWorkflowAlertsByJobIds,
  summarizeWorkflowAlerts,
  type WorkflowAlertRecord,
  type WorkflowAlertSummary,
} from '@/lib/workflow-alerts';
import type {
  WorkflowJobAttemptRecord,
  WorkflowJobEventRecord,
  WorkflowJobRecord,
  WorkflowJobStatus,
} from '@/lib/workflow-jobs';

const ACTIVE_STATUSES = new Set<WorkflowJobStatus>([
  'queued',
  'claimed',
  'running',
  'polling',
  'retry_waiting',
]);

const MONITOR_SUMMARY_LIMIT = 200;
const ORDER_INSPECTION_LIMIT = 100;
const RECENT_EVENT_LIMIT = 6;

type MonitorOrderRow = {
  id: number;
  orderId?: string | null;
  order_id?: string | null;
  root_order_id?: string | null;
  amazon_order_id?: string | null;
  workflow_step?: string | null;
  execution_status?: string | null;
  current_workflow?: string | null;
  updated_at?: string | null;
  status?: string | null;
  manifest_2a_url?: string | null;
  manifest_3_url?: string | null;
  next_workflow?: string | null;
  queued_at?: string | null;
  started_at?: string | null;
};

export type WorkflowJobsMonitorFilters = {
  hours?: number;
  limit?: number;
  stage?: string | null;
  status?: string | null;
  orderId?: string | null;
};

export type WorkflowJobsMonitorSummary = {
  windowHours: number;
  matchingJobCount: number;
  visibleJobCount: number;
  activeCount: number;
  activeOrderRowCount: number;
  retryWaitingCount: number;
  failedCount: number;
  deadLetteredCount: number;
  succeededCount: number;
  canceledCount: number;
  byStage: Record<string, number>;
  byStatus: Record<string, number>;
  openAlertCount: number;
  criticalAlertCount: number;
  warningAlertCount: number;
  infoAlertCount: number;
};

export type WorkflowJobsMonitorCorrelation = {
  sourceSystem: string | null;
  sourceExecutionId: string | null;
  orderId: string | null;
  rootGroupId: string | null;
  externalProvider: string | null;
  externalRequestId: string | null;
  luluJobId: string | null;
  manifestKeys: string[];
  artifactKeys: string[];
};

export type WorkflowJobsMonitorProviderSummary = {
  provider: string | null;
  luluJobId: string | null;
  latestStatus: string | null;
  latestStatusUpdatedAt: string | null;
  webhookDeliveryState: string | null;
  webhookDeliveryReason: string | null;
};

export type WorkflowJobsMonitorAlertSummary = WorkflowAlertSummary & {
  latestSummary: string | null;
  latestSeverity: string | null;
};

export type WorkflowJobsMonitorLatestAttempt = {
  id: number;
  attempt: number;
  status: string;
  startedAt: string;
  endedAt: string | null;
  errorMessage: string | null;
  providerRequestId: string | null;
  providerStatusUrl: string | null;
};

export type WorkflowJobsMonitorEvent = {
  id: number;
  eventType: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

export type WorkflowJobsMonitorListItem = {
  id: number;
  stage: string;
  jobType: string;
  orderId: string | null;
  rootOrderId: string | null;
  amazonOrderId: string | null;
  bookId: string | null;
  logicalKey: string;
  idempotencyKey: string;
  status: string;
  isActive: boolean;
  attemptCount: number;
  maxAttempts: number;
  externalProvider: string | null;
  externalRequestId: string | null;
  externalStatusUrl: string | null;
  queuedAt: string;
  activityAt: string;
  updatedAt: string;
  nextRetryAt: string | null;
  terminalAt: string | null;
  lastErrorMessage: string | null;
  latestAttempt: WorkflowJobsMonitorLatestAttempt | null;
  latestEvent: WorkflowJobsMonitorEvent | null;
  recentEventTypes: string[];
  providerSummary: WorkflowJobsMonitorProviderSummary | null;
  correlation: WorkflowJobsMonitorCorrelation | null;
  openAlertSummary: WorkflowJobsMonitorAlertSummary;
};

export type WorkflowJobsMonitorInspectionJob = WorkflowJobsMonitorListItem & {
  attempts: WorkflowJobsMonitorLatestAttempt[];
  recentEvents: WorkflowJobsMonitorEvent[];
};

export type WorkflowJobsMonitorInspection = {
  requestedOrderId: string;
  resolvedVia: 'id' | 'orderId' | 'order_id' | 'root_order_id' | 'amazon_order_id' | 'none';
  orderRow: {
    id: number;
    orderId: string | null;
    rootOrderId: string | null;
    amazonOrderId: string | null;
    workflowStep: string | null;
    executionStatus: string | null;
    currentWorkflow: string | null;
    updatedAt: string | null;
    status: string | null;
    manifest2aUrl: string | null;
    manifest3Url: string | null;
    nextWorkflow: string | null;
  } | null;
  latestJobUpdateAt: string | null;
  activeCount: number;
  retryWaitingCount: number;
  failedCount: number;
  deadLetteredCount: number;
  succeededCount: number;
  stageCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  jobs: WorkflowJobsMonitorInspectionJob[];
};

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toJsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => toTrimmedString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(value!)));
}

function normalizeStage(value: string | null | undefined): string | null {
  const normalized = toTrimmedString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeStatus(value: string | null | undefined): string | null {
  const normalized = toTrimmedString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function sanitizeOrValue(value: string): string {
  return value.replace(/[(),]/g, '').trim();
}

function buildOrderFilter(orderId: string): string {
  const sanitized = sanitizeOrValue(orderId);
  return [
    `order_id.eq.${sanitized}`,
    `root_order_id.eq.${sanitized}`,
    `amazon_order_id.eq.${sanitized}`,
  ].join(',');
}

function getLatestTimestamp(job: WorkflowJobRecord): string {
  return (
    job.updated_at ||
    job.completed_at ||
    job.failed_at ||
    job.dead_lettered_at ||
    job.canceled_at ||
    job.polling_at ||
    job.started_at ||
    job.claimed_at ||
    job.queued_at
  );
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickLatestTimestamp(...values: Array<string | null | undefined>): string | null {
  let winner: string | null = null;
  let winnerValue = -Infinity;

  for (const value of values) {
    const parsed = parseTimestamp(value);
    if (parsed === null) {
      continue;
    }
    if (parsed > winnerValue) {
      winner = value ?? null;
      winnerValue = parsed;
    }
  }

  return winner;
}

function getTerminalTimestamp(job: WorkflowJobRecord): string | null {
  return (
    job.completed_at ||
    job.failed_at ||
    job.dead_lettered_at ||
    job.canceled_at ||
    null
  );
}

function extractLastErrorMessage(job: WorkflowJobRecord): string | null {
  const error = job.last_error;
  if (!error || typeof error !== 'object') {
    return null;
  }

  const directMessage = toTrimmedString(error.message);
  if (directMessage) {
    return directMessage;
  }

  const details = error.details;
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    return toTrimmedString((details as Record<string, unknown>).message);
  }

  return null;
}

function stageLabel(stage: string | null): string {
  const normalized = normalizeStage(stage);
  if (!normalized) {
    return 'unknown';
  }
  if (normalized === '2a') {
    return '2A';
  }
  if (normalized === '2b') {
    return '2B';
  }
  if (normalized === '3') {
    return 'W3';
  }
  if (normalized === '4') {
    return 'W4';
  }
  if (normalized === '4.1') {
    return 'W4.1';
  }
  return normalized.toUpperCase();
}

function buildAlertSummary(alerts: WorkflowAlertRecord[]): WorkflowJobsMonitorAlertSummary {
  const summary = summarizeWorkflowAlerts(alerts);
  return {
    ...summary,
    latestSummary: alerts[0]?.summary ?? null,
    latestSeverity: alerts[0]?.severity ?? null,
  };
}

function extractLatestProviderStatus(
  eventType: string | null,
  payload: Record<string, unknown>,
  resultSnapshot: Record<string, unknown>,
): string | null {
  return (
    toTrimmedString(resultSnapshot.luluStatus) ??
    toTrimmedString(resultSnapshot.providerStatus) ??
    toTrimmedString(payload.providerStatus) ??
    toTrimmedString(payload.pdfMonkeyStatus) ??
    toTrimmedString(payload.luluStatus) ??
    toTrimmedString(payload.status) ??
    toTrimmedString(payload.state) ??
    (eventType === 'provider-complete'
      ? 'success'
      : eventType === 'provider-submitted'
        ? 'submitted'
        : eventType === 'provider-rejected'
          ? 'rejected'
          : eventType === 'provider-canceled'
            ? 'canceled'
            : null)
  );
}

function extractCorrelation(
  job: WorkflowJobRecord,
  recentEvents: WorkflowJobEventRecord[],
): WorkflowJobsMonitorCorrelation | null {
  const eventCorrelation = recentEvents
    .map((event) => toJsonRecord(event.payload)?.correlation)
    .map((value) => toJsonRecord(value))
    .find((value) => Boolean(value));

  const correlation: WorkflowJobsMonitorCorrelation = {
    sourceSystem: toTrimmedString(eventCorrelation?.sourceSystem),
    sourceExecutionId: toTrimmedString(eventCorrelation?.sourceExecutionId),
    orderId: toTrimmedString(eventCorrelation?.orderId) ?? job.order_id,
    rootGroupId: toTrimmedString(eventCorrelation?.rootGroupId) ?? job.root_order_id,
    externalProvider:
      toTrimmedString(eventCorrelation?.externalProvider) ?? job.external_provider,
    externalRequestId:
      toTrimmedString(eventCorrelation?.externalRequestId) ?? job.external_request_id,
    luluJobId:
      toTrimmedString(eventCorrelation?.luluJobId) ??
      toTrimmedString(job.result_snapshot?.luluJobId),
    manifestKeys: toStringArray(eventCorrelation?.manifestKeys),
    artifactKeys: toStringArray(eventCorrelation?.artifactKeys),
  };

  return Object.values(correlation).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  )
    ? correlation
    : null;
}

function extractProviderSummary(
  job: WorkflowJobRecord,
  recentEvents: WorkflowJobEventRecord[],
): WorkflowJobsMonitorProviderSummary | null {
  const latestEventType = toTrimmedString(recentEvents[0]?.event_type);
  const latestPayload = toJsonRecord(recentEvents[0]?.payload) ?? {};
  const resultSnapshot = toJsonRecord(job.result_snapshot) ?? {};
  const luluJobId =
    toTrimmedString(resultSnapshot.luluJobId) ??
    toTrimmedString(latestPayload.luluJobId) ??
    toTrimmedString(latestPayload.externalRequestId);
  const latestStatus =
    toTrimmedString(resultSnapshot.luluStatus) ??
    toTrimmedString(latestPayload.providerStatus) ??
    toTrimmedString(latestPayload.luluStatus);
  const nonProduction = isNonProductionLuluSubmission({
    luluJobId,
    currentStatus: latestStatus,
  });
  const provider =
    toTrimmedString(resultSnapshot.externalProvider) ??
    toTrimmedString(latestPayload.externalProvider) ??
    toTrimmedString(resultSnapshot.provider) ??
    job.external_provider;
  const luluLikeProvider = provider?.toLowerCase().startsWith('lulu') ?? false;

  const summary: WorkflowJobsMonitorProviderSummary = {
    provider,
    luluJobId: luluLikeProvider ? luluJobId : null,
    latestStatus: extractLatestProviderStatus(latestEventType, latestPayload, resultSnapshot),
    latestStatusUpdatedAt:
      toTrimmedString(resultSnapshot.luluStatusUpdatedAt) ??
      toTrimmedString(latestPayload.changedAt) ??
      toTrimmedString(recentEvents[0]?.created_at),
    webhookDeliveryState: !luluLikeProvider
      ? null
      : nonProduction
        ? 'not_applicable'
        : toTrimmedString(resultSnapshot.webhookDeliveryState) ??
          toTrimmedString(latestPayload.deliveryState),
    webhookDeliveryReason: !luluLikeProvider
      ? null
      : nonProduction
        ? 'non_production_submission'
        : toTrimmedString(resultSnapshot.webhookDeliveryReason) ??
          toTrimmedString(latestPayload.deliveryReason),
  };

  return Object.values(summary).some((value) => Boolean(value)) ? summary : null;
}

function buildSummary(
  jobs: WorkflowJobRecord[],
  visibleJobCount: number,
  windowHours: number,
  alertsByJobId: Map<number, WorkflowAlertRecord[]>,
  activeOrderRows: MonitorOrderRow[],
): WorkflowJobsMonitorSummary {
  const byStage = new Map<string, number>();
  const byStatus = new Map<string, number>();
  let activeCount = 0;
  let retryWaitingCount = 0;
  let failedCount = 0;
  let deadLetteredCount = 0;
  let succeededCount = 0;
  let canceledCount = 0;
  let openAlertCount = 0;
  let criticalAlertCount = 0;
  let warningAlertCount = 0;
  let infoAlertCount = 0;

  for (const job of jobs) {
    const stage = stageLabel(job.stage);
    byStage.set(stage, (byStage.get(stage) ?? 0) + 1);
    byStatus.set(job.status, (byStatus.get(job.status) ?? 0) + 1);

    if (ACTIVE_STATUSES.has(job.status)) {
      activeCount += 1;
    }
    if (job.status === 'retry_waiting') {
      retryWaitingCount += 1;
    }
    if (job.status === 'failed') {
      failedCount += 1;
    }
    if (job.status === 'dead_lettered') {
      deadLetteredCount += 1;
    }
    if (job.status === 'succeeded') {
      succeededCount += 1;
    }
    if (job.status === 'canceled') {
      canceledCount += 1;
    }

    const alertSummary = buildAlertSummary(alertsByJobId.get(job.id) ?? []);
    openAlertCount += alertSummary.openCount;
    criticalAlertCount += alertSummary.criticalCount;
    warningAlertCount += alertSummary.warningCount;
    infoAlertCount += alertSummary.infoCount;
  }

  for (const order of activeOrderRows) {
    const stage = stageLabel(order.current_workflow ?? order.next_workflow ?? 'order');
    const status = toTrimmedString(order.execution_status) ?? 'order_row_active';
    byStage.set(stage, (byStage.get(stage) ?? 0) + 1);
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
  }

  return {
    windowHours,
    matchingJobCount: jobs.length,
    visibleJobCount,
    activeCount: activeCount + activeOrderRows.length,
    activeOrderRowCount: activeOrderRows.length,
    retryWaitingCount,
    failedCount,
    deadLetteredCount,
    succeededCount,
    canceledCount,
    byStage: Object.fromEntries(byStage),
    byStatus: Object.fromEntries(byStatus),
    openAlertCount,
    criticalAlertCount,
    warningAlertCount,
    infoAlertCount,
  };
}

function buildAttemptView(attempt: WorkflowJobAttemptRecord): WorkflowJobsMonitorLatestAttempt {
  return {
    id: attempt.id,
    attempt: attempt.attempt,
    status: attempt.status,
    startedAt: attempt.started_at,
    endedAt: attempt.ended_at,
    errorMessage: attempt.error_message,
    providerRequestId: attempt.provider_request_id,
    providerStatusUrl: attempt.provider_status_url,
  };
}

function buildEventView(event: WorkflowJobEventRecord): WorkflowJobsMonitorEvent {
  return {
    id: event.id,
    eventType: event.event_type,
    createdAt: event.created_at,
    payload: event.payload,
  };
}

function sortJobsDescending(jobs: WorkflowJobRecord[]): WorkflowJobRecord[] {
  return [...jobs].sort((left, right) => {
    return Date.parse(getLatestTimestamp(right)) - Date.parse(getLatestTimestamp(left));
  });
}

async function loadAttemptsAndEvents(jobIds: number[]) {
  if (jobIds.length === 0) {
    return {
      attemptsByJobId: new Map<number, WorkflowJobAttemptRecord[]>(),
      eventsByJobId: new Map<number, WorkflowJobEventRecord[]>(),
      alertsByJobId: new Map<number, WorkflowAlertRecord[]>(),
    };
  }

  const [attemptsResult, eventsResult] = await Promise.all([
    supabase
      .from('workflow_job_attempts')
      .select('*')
      .in('job_id', jobIds)
      .order('attempt', { ascending: false }),
    supabase
      .from('workflow_job_events')
      .select('*')
      .in('job_id', jobIds)
      .order('created_at', { ascending: false }),
  ]);

  if (attemptsResult.error) {
    throw attemptsResult.error;
  }
  if (eventsResult.error) {
    throw eventsResult.error;
  }

  const attemptsByJobId = new Map<number, WorkflowJobAttemptRecord[]>();
  for (const attempt of (attemptsResult.data ?? []) as WorkflowJobAttemptRecord[]) {
    const current = attemptsByJobId.get(attempt.job_id) ?? [];
    current.push(attempt);
    attemptsByJobId.set(attempt.job_id, current);
  }

  const eventsByJobId = new Map<number, WorkflowJobEventRecord[]>();
  for (const event of (eventsResult.data ?? []) as WorkflowJobEventRecord[]) {
    const current = eventsByJobId.get(event.job_id) ?? [];
    if (current.length < RECENT_EVENT_LIMIT) {
      current.push(event);
    }
    eventsByJobId.set(event.job_id, current);
  }

  const alertsByJobId = await listOpenWorkflowAlertsByJobIds(jobIds);

  return { attemptsByJobId, eventsByJobId, alertsByJobId };
}

function buildListItem(
  job: WorkflowJobRecord,
  attempts: WorkflowJobAttemptRecord[],
  recentEvents: WorkflowJobEventRecord[],
  alerts: WorkflowAlertRecord[],
): WorkflowJobsMonitorListItem {
  const latestAttempt = attempts[0] ? buildAttemptView(attempts[0]) : null;
  const latestEvent = recentEvents[0] ? buildEventView(recentEvents[0]) : null;
  const activityAt =
    pickLatestTimestamp(
      latestEvent?.createdAt,
      latestAttempt?.endedAt,
      latestAttempt?.startedAt,
      getLatestTimestamp(job),
    ) ?? getLatestTimestamp(job);

  return {
    id: job.id,
    stage: stageLabel(job.stage),
    jobType: job.job_type,
    orderId: job.order_id,
    rootOrderId: job.root_order_id,
    amazonOrderId: job.amazon_order_id,
    bookId: job.book_id,
    logicalKey: job.logical_key,
    idempotencyKey: job.idempotency_key,
    status: job.status,
    isActive: ACTIVE_STATUSES.has(job.status),
    attemptCount: job.attempt_count,
    maxAttempts: job.max_attempts,
    externalProvider: job.external_provider,
    externalRequestId: job.external_request_id,
    externalStatusUrl: job.external_status_url,
    queuedAt: job.queued_at,
    activityAt,
    updatedAt: job.updated_at,
    nextRetryAt: job.next_retry_at,
    terminalAt: getTerminalTimestamp(job),
    lastErrorMessage: extractLastErrorMessage(job),
    latestAttempt,
    latestEvent,
    recentEventTypes: recentEvents.map((event) => event.event_type),
    providerSummary: extractProviderSummary(job, recentEvents),
    correlation: extractCorrelation(job, recentEvents),
    openAlertSummary: buildAlertSummary(alerts),
  };
}

async function queryMonitorJobs(filters: WorkflowJobsMonitorFilters): Promise<WorkflowJobRecord[]> {
  const hours = clampInteger(filters.hours, 1, 24 * 30, 72);
  const stage = normalizeStage(filters.stage);
  const status = normalizeStatus(filters.status);
  const orderId = toTrimmedString(filters.orderId);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from('workflow_jobs')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(Math.max(MONITOR_SUMMARY_LIMIT, clampInteger(filters.limit, 1, 100, 40)));

  if (!orderId) {
    query = query.gte('updated_at', since);
  }
  if (stage) {
    query = query.eq('stage', stage);
  }
  if (status) {
    query = query.eq('status', status);
  }
  if (orderId) {
    query = query.or(buildOrderFilter(orderId));
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data ?? []) as WorkflowJobRecord[];
}

function isActiveOrderRow(row: MonitorOrderRow): boolean {
  const executionStatus = toTrimmedString(row.execution_status);
  if (executionStatus === 'processing') return true;
  return executionStatus === 'ready_for_processing' && Boolean(toTrimmedString(row.next_workflow));
}

async function queryActiveOrderRows(filters: WorkflowJobsMonitorFilters): Promise<MonitorOrderRow[]> {
  const hours = clampInteger(filters.hours, 1, 24 * 30, 72);
  const stage = normalizeStage(filters.stage);
  const status = normalizeStatus(filters.status);
  const orderId = toTrimmedString(filters.orderId);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const select =
    'id, orderId, order_id, root_order_id, amazon_order_id, workflow_step, execution_status, current_workflow, updated_at, status, manifest_2a_url, manifest_3_url, next_workflow, queued_at, started_at';

  let rows: MonitorOrderRow[] = [];
  if (orderId) {
    const lookup = await fetchOrderRowByAnyId<MonitorOrderRow>(supabase, orderId, select);
    rows = lookup.row ? [lookup.row] : [];
  } else {
    const { data, error } = await supabase
      .from('orders')
      .select(select)
      .or('execution_status.eq.processing,execution_status.eq.ready_for_processing')
      .gte('updated_at', since)
      .order('updated_at', { ascending: false })
      .limit(100);

    if (error) {
      throw error;
    }
    rows = (data ?? []) as MonitorOrderRow[];
  }

  return rows.filter((row) => {
    if (!isActiveOrderRow(row)) return false;
    if (stage && normalizeStage(row.current_workflow ?? row.next_workflow) !== stage) return false;
    if (status && normalizeStatus(row.execution_status) !== status) return false;
    return true;
  });
}

export async function listWorkflowJobsMonitorData(filters: WorkflowJobsMonitorFilters) {
  const limit = clampInteger(filters.limit, 1, 100, 40);
  const windowHours = clampInteger(filters.hours, 1, 24 * 30, 72);
  const jobs = sortJobsDescending(await queryMonitorJobs(filters));
  const activeOrderRows = await queryActiveOrderRows(filters);
  const alertsByJobId = await listOpenWorkflowAlertsByJobIds(jobs.map((job) => job.id));
  const { attemptsByJobId, eventsByJobId } = await loadAttemptsAndEvents(
    jobs.map((job) => job.id),
  );
  const listItems = jobs
    .map((job) =>
      buildListItem(
        job,
        attemptsByJobId.get(job.id) ?? [],
        eventsByJobId.get(job.id) ?? [],
        alertsByJobId.get(job.id) ?? [],
      ),
    )
    .sort((left, right) => {
      return (
        (parseTimestamp(right.activityAt) ?? 0) -
        (parseTimestamp(left.activityAt) ?? 0)
      );
    });
  const visibleJobs = listItems.slice(0, limit);

  return {
    summary: buildSummary(jobs, visibleJobs.length, windowHours, alertsByJobId, activeOrderRows),
    jobs: visibleJobs,
  };
}

export async function inspectWorkflowJobsOrder(rawOrderId: string): Promise<WorkflowJobsMonitorInspection | null> {
  const requestedOrderId = toTrimmedString(rawOrderId);
  if (!requestedOrderId) {
    return null;
  }

  const lookup = await fetchOrderRowByAnyId<MonitorOrderRow>(
    supabase,
    requestedOrderId,
    'id, orderId, order_id, root_order_id, amazon_order_id, workflow_step, execution_status, current_workflow, updated_at, status, manifest_2a_url, manifest_3_url, next_workflow',
  );

  const { data, error } = await supabase
    .from('workflow_jobs')
    .select('*')
    .or(buildOrderFilter(requestedOrderId))
    .order('updated_at', { ascending: false })
    .limit(ORDER_INSPECTION_LIMIT);

  if (error) {
    throw error;
  }

  const jobs = sortJobsDescending((data ?? []) as WorkflowJobRecord[]);
  if (jobs.length === 0 && !lookup.row) {
    return null;
  }

  const alertsByJobId = await listOpenWorkflowAlertsByJobIds(jobs.map((job) => job.id));
  const { attemptsByJobId, eventsByJobId } = await loadAttemptsAndEvents(
    jobs.map((job) => job.id),
  );

  const statusCounts = new Map<string, number>();
  const stageCounts = new Map<string, number>();
  let activeCount = 0;
  let retryWaitingCount = 0;
  let failedCount = 0;
  let deadLetteredCount = 0;
  let succeededCount = 0;
  let latestJobUpdateAt: string | null = null;

  const inspectionJobs = jobs.map((job) => {
    const attempts = attemptsByJobId.get(job.id) ?? [];
    const recentEvents = eventsByJobId.get(job.id) ?? [];
    const alerts = alertsByJobId.get(job.id) ?? [];
    const listItem = buildListItem(job, attempts, recentEvents, alerts);

    statusCounts.set(job.status, (statusCounts.get(job.status) ?? 0) + 1);
    const stage = stageLabel(job.stage);
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);

    if (ACTIVE_STATUSES.has(job.status)) {
      activeCount += 1;
    }
    if (job.status === 'retry_waiting') {
      retryWaitingCount += 1;
    }
    if (job.status === 'failed') {
      failedCount += 1;
    }
    if (job.status === 'dead_lettered') {
      deadLetteredCount += 1;
    }
    if (job.status === 'succeeded') {
      succeededCount += 1;
    }

    const updatedAt =
      listItem.activityAt ?? getLatestTimestamp(job);
    if (!latestJobUpdateAt || Date.parse(updatedAt) > Date.parse(latestJobUpdateAt)) {
      latestJobUpdateAt = updatedAt;
    }

    return {
      ...listItem,
      attempts: attempts.map(buildAttemptView),
      recentEvents: recentEvents.map(buildEventView),
    };
  }).sort((left, right) => {
    return (
      (parseTimestamp(right.activityAt) ?? 0) -
      (parseTimestamp(left.activityAt) ?? 0)
    );
  });

  return {
    requestedOrderId,
    resolvedVia: lookup.used,
    orderRow: lookup.row
      ? {
          id: lookup.row.id,
          orderId: toTrimmedString(lookup.row.orderId) ?? toTrimmedString(lookup.row.order_id),
          rootOrderId: toTrimmedString(lookup.row.root_order_id),
          amazonOrderId: toTrimmedString(lookup.row.amazon_order_id),
          workflowStep: toTrimmedString(lookup.row.workflow_step),
          executionStatus: toTrimmedString(lookup.row.execution_status),
          currentWorkflow: toTrimmedString(lookup.row.current_workflow),
          updatedAt: toTrimmedString(lookup.row.updated_at),
          status: toTrimmedString(lookup.row.status),
          manifest2aUrl: toTrimmedString(lookup.row.manifest_2a_url),
          manifest3Url: toTrimmedString(lookup.row.manifest_3_url),
          nextWorkflow: toTrimmedString(lookup.row.next_workflow),
        }
      : null,
    latestJobUpdateAt,
    activeCount,
    retryWaitingCount,
    failedCount,
    deadLetteredCount,
    succeededCount,
    stageCounts: Object.fromEntries(stageCounts),
    statusCounts: Object.fromEntries(statusCounts),
    jobs: inspectionJobs,
  };
}
