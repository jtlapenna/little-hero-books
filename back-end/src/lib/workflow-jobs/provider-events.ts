import {
  appendWorkflowJobEvent,
  listWorkflowJobsForOrder,
  updateWorkflowJobResultSnapshot,
  type WorkflowJobRecord,
} from './repository';
import type { WorkflowJobCorrelationSource } from './types';

type JsonRecord = Record<string, unknown>;

type LuluLifecycleOrderLike = {
  id?: number | null;
  orderId?: string | null;
  order_id?: string | null;
  root_order_id?: string | null;
  amazon_order_id?: string | null;
  lulu_job_id?: string | null;
};

type RecordLuluLifecycleInput = {
  printJobId: string;
  statusName: string;
  changedAt?: string | null;
  errorMessage?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  carrier?: string | null;
  orders: LuluLifecycleOrderLike[];
  sourceSystem: Extract<WorkflowJobCorrelationSource, 'webhook' | 'admin'>;
  sourceExecutionId?: string | null;
  statusDetail?: JsonRecord | null;
};

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

function cleanOrderId(order: LuluLifecycleOrderLike): string | null {
  return toTrimmedString(order.orderId) ?? toTrimmedString(order.order_id) ?? null;
}

function cleanRootGroupId(order: LuluLifecycleOrderLike): string | null {
  return (
    toTrimmedString(order.root_order_id) ??
    toTrimmedString(order.amazon_order_id) ??
    cleanOrderId(order)
  );
}

function buildLuluLifecycleEventType(statusName: string): string {
  const normalized = statusName.trim().toUpperCase();
  if (normalized === 'CANCELED') {
    return 'provider-canceled';
  }
  if (normalized === 'REJECTED') {
    return 'provider-rejected';
  }
  return 'provider-status-updated';
}

function pickRelevantJob(
  jobs: WorkflowJobRecord[],
  stage: '4' | '4.1',
  printJobId: string,
): WorkflowJobRecord | null {
  const relevant = jobs.filter((job) => job.stage === stage);
  if (relevant.length === 0) {
    return null;
  }

  const byMatchingLuluJob = relevant.find((job) => {
    const resultJobId = toTrimmedString(job.result_snapshot?.luluJobId);
    return resultJobId === printJobId;
  });
  if (byMatchingLuluJob) {
    return byMatchingLuluJob;
  }

  return relevant[0] ?? null;
}

async function appendProviderLifecycleToJob(
  job: WorkflowJobRecord,
  input: RecordLuluLifecycleInput,
  orderId: string | null,
  rootGroupId: string | null,
) {
  const normalizedStatus = input.statusName.trim().toUpperCase();
  const luluJobId = toTrimmedString(input.printJobId);
  const resultPatch: JsonRecord = {
    luluJobId,
    luluStatus: normalizedStatus,
    luluStatusUpdatedAt: toTrimmedString(input.changedAt) ?? new Date().toISOString(),
    trackingNumber: toTrimmedString(input.trackingNumber),
    trackingUrl: toTrimmedString(input.trackingUrl),
    carrier: toTrimmedString(input.carrier),
  };
  if (input.errorMessage) {
    resultPatch.luluStatusMessage = input.errorMessage;
  }
  if (input.statusDetail) {
    resultPatch.luluStatusDetail = input.statusDetail;
  }

  await updateWorkflowJobResultSnapshot(job.id, resultPatch);
  await appendWorkflowJobEvent({
    jobId: job.id,
    eventType: buildLuluLifecycleEventType(normalizedStatus),
    payload: {
      providerStatus: normalizedStatus,
      luluJobId,
      trackingNumber: resultPatch.trackingNumber,
      trackingUrl: resultPatch.trackingUrl,
      carrier: resultPatch.carrier,
      errorMessage: input.errorMessage ?? null,
      changedAt: resultPatch.luluStatusUpdatedAt,
      statusDetail: input.statusDetail ?? null,
    },
    correlation: {
      sourceSystem: input.sourceSystem,
      sourceExecutionId: toTrimmedString(input.sourceExecutionId),
      orderId,
      rootGroupId,
      externalProvider: 'lulu',
      externalRequestId: luluJobId,
      luluJobId,
    },
  });
}

export async function recordLuluLifecycleWorkflowEvents(
  input: RecordLuluLifecycleInput,
): Promise<{ matchedJobIds: number[] }> {
  const orders = input.orders ?? [];
  if (orders.length === 0) {
    return { matchedJobIds: [] };
  }

  const matchedJobIds = new Set<number>();
  if (orders.length > 1) {
    const rootGroupId = cleanRootGroupId(orders[0]);
    if (!rootGroupId) {
      return { matchedJobIds: [] };
    }
    const jobs = await listWorkflowJobsForOrder(rootGroupId, undefined, 50);
    const job = pickRelevantJob(jobs, '4.1', input.printJobId);
    if (!job) {
      return { matchedJobIds: [] };
    }
    await appendProviderLifecycleToJob(job, input, null, rootGroupId);
    matchedJobIds.add(job.id);
    return { matchedJobIds: [...matchedJobIds] };
  }

  const order = orders[0];
  const orderId = cleanOrderId(order);
  if (!orderId) {
    return { matchedJobIds: [] };
  }
  const jobs = await listWorkflowJobsForOrder(orderId, undefined, 50);
  const job = pickRelevantJob(jobs, '4', input.printJobId);
  if (!job) {
    return { matchedJobIds: [] };
  }
  await appendProviderLifecycleToJob(job, input, orderId, cleanRootGroupId(order));
  matchedJobIds.add(job.id);
  return { matchedJobIds: [...matchedJobIds] };
}
