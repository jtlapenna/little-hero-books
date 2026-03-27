import type { WorkflowJobRecord, WorkflowJobStatus } from './types';

export const DEFAULT_WORKFLOW_JOB_LEASE_MS = 5 * 60 * 1000;

const ACTIVE_STATUSES = new Set<WorkflowJobStatus>(['claimed', 'running', 'polling']);
const CLAIMABLE_STATUSES = new Set<WorkflowJobStatus>(['queued', 'retry_waiting']);
const TERMINAL_STATUSES = new Set<WorkflowJobStatus>([
  'succeeded',
  'failed',
  'dead_lettered',
  'canceled',
]);

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildWorkflowJobLeaseExpiry(
  now: Date = new Date(),
  leaseMs: number = DEFAULT_WORKFLOW_JOB_LEASE_MS,
): string {
  return new Date(now.getTime() + Math.max(1, leaseMs)).toISOString();
}

export function hasWorkflowJobLeaseExpired(
  leaseExpiresAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  const expiry = toDate(leaseExpiresAt);
  if (!expiry) return true;
  return expiry.getTime() <= now.getTime();
}

export function isWorkflowJobActiveStatus(status: WorkflowJobStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function isWorkflowJobTerminalStatus(status: WorkflowJobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function canClaimWorkflowJob(
  job:
    | Pick<WorkflowJobRecord, 'status' | 'lease_expires_at'>
    | { status: WorkflowJobStatus; lease_expires_at?: string | null },
  now: Date = new Date(),
): boolean {
  if (CLAIMABLE_STATUSES.has(job.status)) {
    return true;
  }

  if (!ACTIVE_STATUSES.has(job.status)) {
    return false;
  }

  return hasWorkflowJobLeaseExpired(job.lease_expires_at ?? null, now);
}
