import { createHash } from 'node:crypto';
import type { WorkflowJobIdentity } from './types';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`;
}

export function normalizeWorkflowJobKeyPart(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/[\s/\\]+/g, '-')
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-:]+|[-:]+$/g, '');
}

export function buildWorkflowJobLogicalKey(...parts: Array<unknown>): string {
  const normalized = parts
    .map((part) => normalizeWorkflowJobKeyPart(part))
    .filter(Boolean);

  return normalized.join(':') || 'default';
}

export function buildWorkflowJobIdempotencyKey(identity: WorkflowJobIdentity): string {
  const payload = {
    jobType: normalizeWorkflowJobKeyPart(identity.jobType).toLowerCase(),
    stage: normalizeWorkflowJobKeyPart(identity.stage).toLowerCase(),
    orderId: normalizeWorkflowJobKeyPart(identity.orderId),
    rootOrderId: normalizeWorkflowJobKeyPart(identity.rootOrderId),
    amazonOrderId: normalizeWorkflowJobKeyPart(identity.amazonOrderId),
    bookId: normalizeWorkflowJobKeyPart(identity.bookId).toLowerCase(),
    logicalKey: buildWorkflowJobLogicalKey(identity.logicalKey),
  };

  const scope =
    payload.orderId ||
    payload.rootOrderId ||
    payload.amazonOrderId ||
    payload.bookId ||
    'unscoped';
  const digest = createHash('sha256').update(stableStringify(payload)).digest('hex').slice(0, 20);

  return `wf:${payload.stage || 'stage'}:${payload.jobType || 'job'}:${scope}:${payload.logicalKey}:${digest}`;
}
