import { heldW2AFailure } from './w2a-execution-failure';
/** Shared raw-row / mapped-order ownership check for operator controls and server transitions. */
export interface BookReviewOwnershipLike {
  id?: unknown; orderId?: unknown; product_info?: unknown; error_type?: unknown; errorType?: unknown;
  current_workflow?: unknown; currentWorkflow?: unknown; started_at?: unknown; startedAt?: unknown;
  execution_status?: unknown; executionStatus?: unknown; workflow_step?: unknown; workflowStep?: unknown;
  print_submission_id?: unknown; printSubmissionId?: unknown; print_claim_token?: unknown; printClaimToken?: unknown;
  gelato_order_id?: unknown; gelatoOrderId?: unknown; gelato_status?: unknown; gelatoStatus?: unknown;
  lulu_job_id?: unknown; luluJobId?: unknown; lulu_status?: unknown; luluStatus?: unknown;
}
export function bookReviewOwnershipIssue(row: BookReviewOwnershipLike, ownsStage = false): string | null {
  const current = row.current_workflow ?? row.currentWorkflow, started = row.started_at ?? row.startedAt;
  const step = row.workflow_step ?? row.workflowStep, execution = row.execution_status ?? row.executionStatus;
  if (heldW2AFailure({ ...row, execution_status: execution, error_type: row.error_type ?? row.errorType })) return 'Resolve the W2A failure in W2A Recovery before editing this book';
  const complete = !current && !started && ['2A-complete', 'ai_generation_completed', '2B-complete', 'bria_processing_complete', 'book_assembly_completed'].includes(String(step));
  const print = [row.print_submission_id ?? row.printSubmissionId, row.print_claim_token ?? row.printClaimToken,
    row.gelato_order_id ?? row.gelatoOrderId, row.gelato_status ?? row.gelatoStatus, row.lulu_job_id ?? row.luluJobId, row.lulu_status ?? row.luluStatus];
  return print.some(value => value != null && String(value).trim()) || !ownsStage && (current || started || execution === 'processing' && !complete)
    ? 'Book is owned by an active workflow or print submission; inspect it before editing' : null;
}
