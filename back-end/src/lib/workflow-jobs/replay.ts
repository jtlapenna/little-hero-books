import type { WorkflowJobRecord, WorkflowJobReplayPayload } from './types';

export function buildWorkflowJobReplayPayload(
  job: WorkflowJobRecord,
): WorkflowJobReplayPayload {
  return {
    identity: {
      jobType: job.job_type,
      stage: job.stage,
      orderRowId: job.order_row_id,
      orderId: job.order_id,
      rootOrderId: job.root_order_id,
      amazonOrderId: job.amazon_order_id,
      bookId: job.book_id,
      logicalKey: job.logical_key,
      idempotencyKey: job.idempotency_key,
    },
    status: job.status,
    inputSnapshot: job.input_snapshot ?? {},
    normalizedInputSnapshot: job.normalized_input_snapshot ?? {},
    resultSnapshot: job.result_snapshot ?? {},
    lastError: job.last_error ?? null,
    timestamps: {
      queuedAt: job.queued_at,
      completedAt: job.completed_at,
      failedAt: job.failed_at,
      deadLetteredAt: job.dead_lettered_at,
    },
  };
}
