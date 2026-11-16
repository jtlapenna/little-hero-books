import { assertBookReviewOwnership, BookReviewConflict, compareAndSetBookReview } from './book-review-invalidation';
import { hasCompletedW3Assembly } from './books/w3-assembly-state';
import { heldW2AFailure } from './w2a-execution-failure';
type Row = Record<string, unknown>;
export function inspectBookAssemblyQueue(row: Row): 'complete' | 'queued' | 'queue' {
  assertBookReviewOwnership(row, 'postPdf');
  if (heldW2AFailure(row)) throw new BookReviewConflict('Resolve the W2A failure before queueing assembly');
  if (hasCompletedW3Assembly(row)) return 'complete';
  const review = row.review_stages as { postBria?: { status?: string }; post_bria?: { status?: string } } | null;
  if ((review?.postBria?.status ?? review?.post_bria?.status) !== 'approved' || !row.manifest_2b_url) throw new BookReviewConflict('Approve the completed Background Removal stage before queueing assembly');
  return row.next_workflow === '3' && row.execution_status === 'ready_for_processing' ? 'queued' : 'queue';
}
export async function queueReviewedBookAssembly(row: Row) {
  const state = inspectBookAssemblyQueue(row);
  if (state !== 'queue') return { alreadyComplete: state === 'complete', alreadyQueued: state === 'queued' };
  const now = new Date().toISOString();
  if (!await compareAndSetBookReview(row, { execution_status: 'ready_for_processing', next_workflow: '3', queued_at: now,
    started_at: null, current_workflow: null, updated_at: now })) throw new BookReviewConflict('Book changed; refresh before queueing assembly');
  return { alreadyComplete: false, alreadyQueued: false, queuedAt: now };
}
