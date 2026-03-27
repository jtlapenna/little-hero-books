import type { WorkflowJobErrorSummary } from './types';

export interface WorkflowJobRetryOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitterRatio?: number;
}

const DEFAULT_BASE_DELAY_MS = 30_000;
const DEFAULT_MAX_DELAY_MS = 30 * 60 * 1000;
const DEFAULT_BACKOFF_MULTIPLIER = 2;
const DEFAULT_JITTER_RATIO = 0.1;

export function computeWorkflowJobRetryDelayMs(
  attempt: number,
  options: WorkflowJobRetryOptions = {},
): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const backoffMultiplier = options.backoffMultiplier ?? DEFAULT_BACKOFF_MULTIPLIER;
  const jitterRatio = Math.max(0, options.jitterRatio ?? DEFAULT_JITTER_RATIO);

  const rawDelay = Math.min(
    maxDelayMs,
    Math.round(baseDelayMs * Math.pow(backoffMultiplier, safeAttempt - 1)),
  );
  const jitterWindow = Math.round(rawDelay * jitterRatio);

  if (jitterWindow <= 0) {
    return rawDelay;
  }

  const direction = safeAttempt % 2 === 0 ? 1 : -1;
  return Math.max(1, rawDelay + direction * Math.min(jitterWindow, rawDelay - 1));
}

export function computeWorkflowJobNextRetryAt(
  attempt: number,
  now: Date = new Date(),
  options: WorkflowJobRetryOptions = {},
): string {
  const delayMs = computeWorkflowJobRetryDelayMs(attempt, options);
  return new Date(now.getTime() + delayMs).toISOString();
}

export function shouldWorkflowJobDeadLetter(
  attemptCount: number,
  maxAttempts: number,
): boolean {
  return Math.max(0, attemptCount) >= Math.max(1, maxAttempts);
}

export function isWorkflowJobRetryableError(error: unknown): boolean {
  const candidate = error as
    | (WorkflowJobErrorSummary & {
        retryable?: boolean;
        status?: number;
        code?: string;
      })
    | null;

  if (!candidate) {
    return false;
  }

  if (typeof candidate.retryable === 'boolean') {
    return candidate.retryable;
  }

  if (typeof candidate.status === 'number') {
    return (
      candidate.status === 408 ||
      candidate.status === 409 ||
      candidate.status === 425 ||
      candidate.status === 429 ||
      candidate.status >= 500
    );
  }

  const code = String(candidate.code ?? '').toUpperCase();
  if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code)) {
    return true;
  }

  return false;
}
