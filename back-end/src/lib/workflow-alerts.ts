import { supabase } from '@/lib/supabase-client';

type SupabaseLike = typeof supabase;
const WORKFLOW_ALERT_BATCH_SIZE = 100;

function isMissingWorkflowAlertsTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = toTrimmedString((error as { code?: unknown }).code);
  const message = toTrimmedString((error as { message?: unknown }).message) ?? '';
  const details = toTrimmedString((error as { details?: unknown }).details) ?? '';
  return (
    code === '42P01' ||
    message.includes('workflow_alerts') ||
    details.includes('workflow_alerts')
  );
}

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

export const WORKFLOW_ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type WorkflowAlertSeverity = (typeof WORKFLOW_ALERT_SEVERITIES)[number];

export const WORKFLOW_ALERT_STATUSES = ['open', 'acknowledged', 'resolved'] as const;
export type WorkflowAlertStatus = (typeof WORKFLOW_ALERT_STATUSES)[number];

export type WorkflowAlertRecord = {
  id: number;
  dedupe_key: string;
  job_id: number | null;
  attempt_id: number | null;
  stage: string | null;
  alert_type: string;
  severity: WorkflowAlertSeverity;
  status: WorkflowAlertStatus;
  summary: string;
  details: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowAlertSummary = {
  openCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
};

export type WorkflowAlertStorageMode = 'durable' | 'fallback';

export type WorkflowAlertListFilters = {
  status?: WorkflowAlertStatus | null;
  stage?: string | null;
  limit?: number;
  hours?: number;
};

export type WorkflowAlertSummaryFilters = {
  stage?: string | null;
  hours?: number;
  jobIds?: number[] | null;
};

export async function getWorkflowAlertStorageMode(
  client: SupabaseLike = supabase,
): Promise<WorkflowAlertStorageMode> {
  const { error } = await client.from('workflow_alerts').select('id').limit(1);
  if (error) {
    if (isMissingWorkflowAlertsTableError(error)) {
      return 'fallback';
    }
    throw error;
  }
  return 'durable';
}

export type UpsertWorkflowAlertInput = {
  dedupeKey: string;
  jobId?: number | null;
  attemptId?: number | null;
  stage?: string | null;
  alertType: string;
  severity: WorkflowAlertSeverity;
  summary: string;
  details?: Record<string, unknown> | null;
  now?: string | Date | null;
};

export async function upsertWorkflowAlert(
  input: UpsertWorkflowAlertInput,
  client: SupabaseLike = supabase,
): Promise<WorkflowAlertRecord> {
  const nowIso = toIsoString(input.now);
  const dedupeKey = toTrimmedString(input.dedupeKey);
  const alertType = toTrimmedString(input.alertType);
  const summary = toTrimmedString(input.summary);

  if (!dedupeKey || !alertType || !summary) {
    throw new Error('Workflow alert dedupeKey, alertType, and summary are required');
  }

  const existingQuery = await client
    .from('workflow_alerts')
    .select('*')
    .eq('dedupe_key', dedupeKey)
    .maybeSingle();
  if (existingQuery.error) {
    if (isMissingWorkflowAlertsTableError(existingQuery.error)) {
      return {
        id: 0,
        dedupe_key: dedupeKey,
        job_id: input.jobId ?? null,
        attempt_id: input.attemptId ?? null,
        stage: toTrimmedString(input.stage),
        alert_type: alertType,
        severity: input.severity,
        status: 'open',
        summary,
        details: input.details ?? {},
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        acknowledged_at: null,
        acknowledged_by: null,
        resolved_at: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
    }
    throw existingQuery.error;
  }

  const existing = (existingQuery.data as WorkflowAlertRecord | null) ?? null;
  const patch = {
    dedupe_key: dedupeKey,
    job_id: input.jobId ?? null,
    attempt_id: input.attemptId ?? null,
    stage: toTrimmedString(input.stage),
    alert_type: alertType,
    severity: input.severity,
    status: existing?.status === 'resolved' ? 'open' : existing?.status ?? 'open',
    summary,
    details: input.details ?? {},
    first_seen_at: existing?.first_seen_at ?? nowIso,
    last_seen_at: nowIso,
    acknowledged_at: existing?.status === 'resolved' ? null : existing?.acknowledged_at ?? null,
    acknowledged_by: existing?.status === 'resolved' ? null : existing?.acknowledged_by ?? null,
    resolved_at: null,
  };

  const { data, error } = existing
    ? await client
        .from('workflow_alerts')
        .update(patch)
        .eq('id', existing.id)
        .select('*')
        .maybeSingle()
    : await client
        .from('workflow_alerts')
        .insert(patch)
        .select('*')
        .maybeSingle();

  if (error || !data) {
    if (error && isMissingWorkflowAlertsTableError(error)) {
      return {
        id: existing?.id ?? 0,
        dedupe_key: dedupeKey,
        job_id: input.jobId ?? null,
        attempt_id: input.attemptId ?? null,
        stage: toTrimmedString(input.stage),
        alert_type: alertType,
        severity: input.severity,
        status: patch.status as WorkflowAlertStatus,
        summary,
        details: input.details ?? {},
        first_seen_at: existing?.first_seen_at ?? nowIso,
        last_seen_at: nowIso,
        acknowledged_at: patch.acknowledged_at,
        acknowledged_by: patch.acknowledged_by,
        resolved_at: null,
        created_at: existing?.created_at ?? nowIso,
        updated_at: nowIso,
      };
    }
    throw error ?? new Error('Failed to persist workflow alert');
  }
  return data as WorkflowAlertRecord;
}

export async function acknowledgeWorkflowAlert(
  id: number,
  acknowledgedBy: string,
  client: SupabaseLike = supabase,
): Promise<WorkflowAlertRecord | null> {
  const actor = toTrimmedString(acknowledgedBy);
  if (!actor) {
    throw new Error('Workflow alert acknowledgement requires acknowledgedBy');
  }

  const { data, error } = await client
    .from('workflow_alerts')
    .update({
      status: 'acknowledged',
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: actor,
    })
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    if (isMissingWorkflowAlertsTableError(error)) {
      return null;
    }
    throw error;
  }
  return (data as WorkflowAlertRecord | null) ?? null;
}

export async function resolveWorkflowAlertsByDedupeKeys(
  dedupeKeys: string[],
  client: SupabaseLike = supabase,
): Promise<void> {
  const keys = [...new Set(dedupeKeys.map((key) => toTrimmedString(key)).filter((key): key is string => Boolean(key)))];
  if (keys.length === 0) {
    return;
  }

  for (let index = 0; index < keys.length; index += WORKFLOW_ALERT_BATCH_SIZE) {
    const chunk = keys.slice(index, index + WORKFLOW_ALERT_BATCH_SIZE);
    const { error } = await client
      .from('workflow_alerts')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      })
      .in('dedupe_key', chunk)
      .neq('status', 'resolved');

    if (error) {
      if (isMissingWorkflowAlertsTableError(error)) {
        return;
      }
      throw error;
    }
  }
}

export async function listWorkflowAlerts(
  filters: WorkflowAlertListFilters = {},
  client: SupabaseLike = supabase,
): Promise<WorkflowAlertRecord[]> {
  const limit = Math.max(1, Math.min(200, Math.floor(filters.limit ?? 50)));
  const hours = Math.max(1, Math.min(24 * 30, Math.floor(filters.hours ?? 24 * 7)));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  let query = client
    .from('workflow_alerts')
    .select('*')
    .gte('last_seen_at', since)
    .order('last_seen_at', { ascending: false })
    .limit(limit);

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.stage) {
    query = query.eq('stage', filters.stage);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingWorkflowAlertsTableError(error)) {
      return [];
    }
    throw error;
  }
  return (data as WorkflowAlertRecord[] | null) ?? [];
}

export async function listOpenWorkflowAlertsByJobIds(
  jobIds: number[],
  client: SupabaseLike = supabase,
): Promise<Map<number, WorkflowAlertRecord[]>> {
  const uniqueIds = [...new Set(jobIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await client
    .from('workflow_alerts')
    .select('*')
    .eq('status', 'open')
    .in('job_id', uniqueIds)
    .order('last_seen_at', { ascending: false });

  if (error) {
    if (isMissingWorkflowAlertsTableError(error)) {
      return new Map();
    }
    throw error;
  }

  const alertsByJobId = new Map<number, WorkflowAlertRecord[]>();
  for (const row of ((data as WorkflowAlertRecord[] | null) ?? [])) {
    if (!row.job_id) {
      continue;
    }
    const existing = alertsByJobId.get(row.job_id) ?? [];
    existing.push(row);
    alertsByJobId.set(row.job_id, existing);
  }
  return alertsByJobId;
}

async function countOpenWorkflowAlerts(
  input: {
    severity?: WorkflowAlertSeverity;
    stage?: string | null;
    hours?: number;
    jobIds?: number[] | null;
  },
  client: SupabaseLike = supabase,
): Promise<number> {
  const hours = Math.max(1, Math.min(24 * 30, Math.floor(input.hours ?? 24 * 30)));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const jobIds = [...new Set((input.jobIds ?? []).filter((id) => Number.isFinite(id) && id > 0))];

  let query = client
    .from('workflow_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open')
    .gte('last_seen_at', since);

  if (input.stage) {
    query = query.eq('stage', input.stage);
  }

  if (jobIds.length > 0) {
    query = query.in('job_id', jobIds);
  }

  if (input.severity) {
    query = query.eq('severity', input.severity);
  }

  const { count, error } = await query;
  if (error) {
    if (isMissingWorkflowAlertsTableError(error)) {
      return 0;
    }
    throw error;
  }

  return Number.isFinite(count) ? Math.max(0, Number(count)) : 0;
}

export async function getWorkflowOpenAlertSummary(
  filters: WorkflowAlertSummaryFilters = {},
  client: SupabaseLike = supabase,
): Promise<WorkflowAlertSummary> {
  const [criticalCount, warningCount, infoCount] = await Promise.all([
    countOpenWorkflowAlerts({ ...filters, severity: 'critical' }, client),
    countOpenWorkflowAlerts({ ...filters, severity: 'warning' }, client),
    countOpenWorkflowAlerts({ ...filters, severity: 'info' }, client),
  ]);

  return {
    openCount: criticalCount + warningCount + infoCount,
    criticalCount,
    warningCount,
    infoCount,
  };
}

export function summarizeWorkflowAlerts(alerts: WorkflowAlertRecord[]): WorkflowAlertSummary {
  let criticalCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  for (const alert of alerts) {
    if (alert.status !== 'open') {
      continue;
    }
    if (alert.severity === 'critical') {
      criticalCount += 1;
    } else if (alert.severity === 'warning') {
      warningCount += 1;
    } else {
      infoCount += 1;
    }
  }

  return {
    openCount: criticalCount + warningCount + infoCount,
    criticalCount,
    warningCount,
    infoCount,
  };
}
