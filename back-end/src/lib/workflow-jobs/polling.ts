import type { WorkflowJobRecord } from './types';

export interface WorkflowJobPollingState {
  externalProvider: string | null;
  externalRequestId: string | null;
  externalStatusUrl: string | null;
  polledAt: string;
}

export function buildWorkflowJobPollingState(job: {
  external_provider?: string | null;
  external_request_id?: string | null;
  external_status_url?: string | null;
}): WorkflowJobPollingState {
  return {
    externalProvider: job.external_provider ?? null,
    externalRequestId: job.external_request_id ?? null,
    externalStatusUrl: job.external_status_url ?? null,
    polledAt: new Date().toISOString(),
  };
}

export function workflowJobHasPollingTarget(
  job: Pick<WorkflowJobRecord, 'external_provider' | 'external_request_id' | 'external_status_url'>,
): boolean {
  return Boolean(job.external_request_id || job.external_status_url);
}
