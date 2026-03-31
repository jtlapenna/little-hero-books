import type {
  AppendWorkflowJobEventInput,
  WorkflowJobCorrelationEnvelope,
  WorkflowJobCorrelationSource,
  WorkflowJobErrorSummary,
} from './types';

function toIsoString(value: string | Date | null | undefined, fallback: Date = new Date()): string {
  if (!value) return fallback.toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
}

export function summarizeWorkflowJobError(error: unknown): WorkflowJobErrorSummary {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return {
      name: typeof record.name === 'string' ? record.name : undefined,
      message: typeof record.message === 'string' ? record.message : JSON.stringify(record),
      stack: typeof record.stack === 'string' ? record.stack : undefined,
      code: typeof record.code === 'string' ? record.code : undefined,
      status: typeof record.status === 'number' ? record.status : undefined,
      retryable: typeof record.retryable === 'boolean' ? record.retryable : undefined,
      details: record,
    };
  }

  return { message: String(error) };
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

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const normalized = value
    .map((entry) => toTrimmedString(entry))
    .filter((entry): entry is string => Boolean(entry));
  return normalized.length > 0 ? normalized : null;
}

function normalizeSourceSystem(value: unknown): WorkflowJobCorrelationSource | null {
  const normalized = toTrimmedString(value);
  if (
    normalized === 'n8n' ||
    normalized === 'repo-worker' ||
    normalized === 'cron' ||
    normalized === 'webhook' ||
    normalized === 'admin'
  ) {
    return normalized;
  }
  return null;
}

export function normalizeWorkflowJobCorrelation(
  value: WorkflowJobCorrelationEnvelope | Record<string, unknown> | null | undefined,
): WorkflowJobCorrelationEnvelope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const normalized: WorkflowJobCorrelationEnvelope = {
    sourceSystem: normalizeSourceSystem((value as Record<string, unknown>).sourceSystem),
    sourceExecutionId: toTrimmedString((value as Record<string, unknown>).sourceExecutionId),
    orderId: toTrimmedString((value as Record<string, unknown>).orderId),
    rootGroupId: toTrimmedString((value as Record<string, unknown>).rootGroupId),
    externalProvider: toTrimmedString((value as Record<string, unknown>).externalProvider),
    externalRequestId: toTrimmedString((value as Record<string, unknown>).externalRequestId),
    luluJobId: toTrimmedString((value as Record<string, unknown>).luluJobId),
    manifestKeys: normalizeStringArray((value as Record<string, unknown>).manifestKeys),
    artifactKeys: normalizeStringArray((value as Record<string, unknown>).artifactKeys),
  };

  const hasAnyValue = Object.values(normalized).some((entry) => {
    if (Array.isArray(entry)) {
      return entry.length > 0;
    }
    return entry !== null && entry !== undefined;
  });

  return hasAnyValue ? normalized : null;
}

export function buildWorkflowJobEventInsertRow(input: AppendWorkflowJobEventInput) {
  const eventType = String(input.eventType ?? '').trim();
  if (!eventType) {
    throw new Error('Workflow job event_type is required');
  }

  const payload =
    input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? { ...input.payload }
      : {};
  const correlation = normalizeWorkflowJobCorrelation(input.correlation);
  if (correlation) {
    payload.correlation = correlation;
  }

  return {
    job_id: input.jobId,
    attempt_id: input.attemptId ?? null,
    event_type: eventType,
    payload,
    created_at: toIsoString(input.createdAt),
  };
}
