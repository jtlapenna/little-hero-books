export const WORKFLOW_JOB_STATUSES = [
  'queued',
  'claimed',
  'running',
  'polling',
  'retry_waiting',
  'succeeded',
  'failed',
  'dead_lettered',
  'canceled',
] as const;

export type WorkflowJobStatus = (typeof WORKFLOW_JOB_STATUSES)[number];

export const WORKFLOW_JOB_ATTEMPT_STATUSES = [
  'claimed',
  'running',
  'polling',
  'succeeded',
  'failed',
  'canceled',
] as const;

export type WorkflowJobAttemptStatus = (typeof WORKFLOW_JOB_ATTEMPT_STATUSES)[number];

export interface WorkflowJobIdentity {
  jobType: string;
  stage: string;
  orderRowId?: number | null;
  orderId?: string | null;
  rootOrderId?: string | null;
  amazonOrderId?: string | null;
  bookId?: string | null;
  logicalKey?: string | null;
}

export interface WorkflowJobRecord {
  id: number;
  job_type: string;
  stage: string;
  order_row_id: number | null;
  order_id: string | null;
  root_order_id: string | null;
  amazon_order_id: string | null;
  book_id: string | null;
  logical_key: string;
  idempotency_key: string;
  status: WorkflowJobStatus;
  lease_owner: string | null;
  lease_expires_at: string | null;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  external_provider: string | null;
  external_request_id: string | null;
  external_status_url: string | null;
  input_snapshot: Record<string, unknown>;
  normalized_input_snapshot: Record<string, unknown>;
  result_snapshot: Record<string, unknown>;
  last_error: Record<string, unknown> | null;
  queued_at: string;
  claimed_at: string | null;
  started_at: string | null;
  polling_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  dead_lettered_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowJobAttemptRecord {
  id: number;
  job_id: number;
  attempt: number;
  status: WorkflowJobAttemptStatus;
  worker_kind: string | null;
  lease_owner: string | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  error_details: Record<string, unknown> | null;
  provider_request_id: string | null;
  provider_status_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowJobEventRecord {
  id: number;
  job_id: number;
  attempt_id: number | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export const WORKFLOW_JOB_CORRELATION_SOURCES = [
  'n8n',
  'repo-worker',
  'cron',
  'webhook',
  'admin',
] as const;

export type WorkflowJobCorrelationSource = (typeof WORKFLOW_JOB_CORRELATION_SOURCES)[number];

export interface WorkflowJobCorrelationEnvelope {
  sourceSystem?: WorkflowJobCorrelationSource | null;
  sourceExecutionId?: string | null;
  orderId?: string | null;
  rootGroupId?: string | null;
  externalProvider?: string | null;
  externalRequestId?: string | null;
  luluJobId?: string | null;
  manifestKeys?: string[] | null;
  artifactKeys?: string[] | null;
}

export interface WorkflowJobErrorSummary {
  name?: string;
  message: string;
  stack?: string;
  code?: string;
  status?: number;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

export interface EnqueueWorkflowJobInput extends WorkflowJobIdentity {
  idempotencyKey?: string | null;
  status?: Extract<WorkflowJobStatus, 'queued' | 'retry_waiting'>;
  maxAttempts?: number | null;
  nextRetryAt?: string | Date | null;
  externalProvider?: string | null;
  externalRequestId?: string | null;
  externalStatusUrl?: string | null;
  inputSnapshot?: Record<string, unknown> | null;
  normalizedInputSnapshot?: Record<string, unknown> | null;
  resultSnapshot?: Record<string, unknown> | null;
  lastError?: WorkflowJobErrorSummary | Record<string, unknown> | null;
  queuedAt?: string | Date | null;
}

export interface CreateWorkflowJobAttemptInput {
  jobId: number;
  attempt: number;
  status?: Extract<WorkflowJobAttemptStatus, 'claimed' | 'running' | 'polling'>;
  workerKind?: string | null;
  leaseOwner?: string | null;
  startedAt?: string | Date | null;
  providerRequestId?: string | null;
  providerStatusUrl?: string | null;
}

export interface FinishWorkflowJobAttemptInput {
  attemptId: number;
  status: Extract<WorkflowJobAttemptStatus, 'succeeded' | 'failed' | 'canceled'>;
  endedAt?: string | Date | null;
  errorMessage?: string | null;
  errorDetails?: Record<string, unknown> | null;
}

export interface AppendWorkflowJobEventInput {
  jobId: number;
  attemptId?: number | null;
  eventType: string;
  payload?: Record<string, unknown> | null;
  correlation?: WorkflowJobCorrelationEnvelope | null;
  createdAt?: string | Date | null;
}

export interface ClaimWorkflowJobOptions {
  leaseOwner: string;
  leaseMs?: number;
  now?: Date;
}

export interface UpdateWorkflowJobExternalStateInput {
  externalProvider?: string | null;
  externalRequestId?: string | null;
  externalStatusUrl?: string | null;
}

export interface ScheduleWorkflowJobRetryInput extends UpdateWorkflowJobExternalStateInput {
  nextRetryAt: string | Date;
  lastError?: WorkflowJobErrorSummary | Record<string, unknown> | null;
}

export interface CompleteWorkflowJobInput extends UpdateWorkflowJobExternalStateInput {
  resultSnapshot?: Record<string, unknown> | null;
}

export interface FailWorkflowJobInput extends UpdateWorkflowJobExternalStateInput {
  lastError?: WorkflowJobErrorSummary | Record<string, unknown> | null;
}

export interface WorkflowJobReplayPayload {
  identity: WorkflowJobIdentity & { idempotencyKey: string };
  status: WorkflowJobStatus;
  inputSnapshot: Record<string, unknown>;
  normalizedInputSnapshot: Record<string, unknown>;
  resultSnapshot: Record<string, unknown>;
  lastError: Record<string, unknown> | null;
  timestamps: {
    queuedAt: string;
    completedAt: string | null;
    failedAt: string | null;
    deadLetteredAt: string | null;
  };
}
