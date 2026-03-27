import type {
  AppendWorkflowJobEventInput,
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

export function buildWorkflowJobEventInsertRow(input: AppendWorkflowJobEventInput) {
  const eventType = String(input.eventType ?? '').trim();
  if (!eventType) {
    throw new Error('Workflow job event_type is required');
  }

  return {
    job_id: input.jobId,
    attempt_id: input.attemptId ?? null,
    event_type: eventType,
    payload: input.payload ?? {},
    created_at: toIsoString(input.createdAt),
  };
}
