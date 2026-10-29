/** A changed book cannot keep an old review, customer decision, or print queue entry. */
import { z } from 'zod';

export const BookReviewStage = z.enum(['preBria', 'postBria', 'postPdf']);
export type BookReviewStage = z.infer<typeof BookReviewStage>;
type Row = Record<string, unknown>;
const stages = BookReviewStage.options;
type InvalidationSource = 'manual' | 'assembly-publish' | 'pose-generation';

export function bookReviewInvalidation(row: Row, stage: BookReviewStage, now = new Date(), source: InvalidationSource = 'manual'): Row {
  BookReviewStage.parse(stage);
  // Only trusted internal stage callers may retire proofs as part of their already-running stage.
  const ownsStage = source === 'assembly-publish' && stage === 'postPdf' && row.current_workflow === '3' ||
    source === 'pose-generation' && stage === 'preBria' && row.current_workflow === '2A';
  // W2 completion producers intentionally retain processing for manual review after releasing ownership.
  const completedForReview = !row.current_workflow && !row.started_at &&
    ['2A-complete', 'ai_generation_completed', '2B-complete', 'bria_processing_complete', 'book_assembly_completed'].includes(String(row.workflow_step));
  if (['print_submission_id', 'print_claim_token', 'gelato_order_id', 'gelato_status', 'lulu_job_id', 'lulu_status']
    .some(key => row[key] != null && String(row[key]).trim()) || (!ownsStage && (row.current_workflow || row.started_at || row.execution_status === 'processing' && !completedForReview))) {
    throw Error('Book is owned by an active workflow or print submission; inspect it before editing');
  }
  const review = row.review_stages && typeof row.review_stages === 'object' && !Array.isArray(row.review_stages)
    ? structuredClone(row.review_stages) as Row : {};
  for (const name of stages.slice(stages.indexOf(stage))) review[name] = { status: name === stage ? 'in-review' : 'pending' };
  return { status: { preBria: 'pending_base_review', postBria: 'pending_bg_removal_review', postPdf: 'pending_assembly_review' }[stage],
    // Upstream changes need a new W3 run; its replay guard checks both pointer and completion checkpoint.
    ...(stage === 'postPdf' ? {} : { manifest_3_url: null, workflow_step: 'customer_revision' }),
    ...(!row.current_workflow && !row.started_at ? { execution_status: 'done' } : {}),
    review_stages: review, human_approved: false, human_reviewed_at: null, human_reviewer: null,
    customer_approval_required: row.customer_approval_required === true || ['pending', 'approved', 'revision_requested'].includes(String(row.customer_approval_status)),
    customer_approval_status: 'not_requested', customer_approval_approved_at: null, customer_approval_requested_at: null,
    next_workflow: null, updated_at: now.toISOString() };
}

export interface BookReviewInvalidationPorts {
  load(orderId: string): Promise<Row | null>;
  compareAndSet(row: Row, patch: Row): Promise<boolean>;
  revokeLinks(row: Row): Promise<void>;
}
/** Persist the hold before invalidating links or allowing an asset write. An uncertain CAS stops the caller. */
export async function invalidateBookReview(orderId: string, stage: BookReviewStage, injected?: BookReviewInvalidationPorts, source: InvalidationSource = 'manual'): Promise<void> {
  const ports = injected ?? await runtimePorts();
  const row = await ports.load(orderId);
  if (!row || row.id == null) throw Error('Book review identity unavailable');
  const patch = bookReviewInvalidation(row, stage, new Date(), source);
  if (!await ports.compareAndSet(row, patch)) throw Error('Book changed while placing its review hold; reload before editing');
  await ports.revokeLinks(row);
}
async function runtimePorts(): Promise<BookReviewInvalidationPorts> {
  const { supabase } = await import('./supabase-client');
  const { findExactPreviewOrder } = await import('./customer-preview-access');
  return {
    load: orderId => findExactPreviewOrder(orderId),
    async compareAndSet(row, patch) {
      let query = supabase.from('orders').update(patch).eq('id', row.id);
      for (const field of ['updated_at', 'print_submission_id', 'print_claim_token', 'current_workflow', 'started_at']) {
        query = row[field] == null ? query.is(field, null) : query.eq(field, row[field]);
      }
      const { data, error } = await query.select('id').maybeSingle();
      if (error) throw Error('Book review hold could not be confirmed');
      return data != null && String(data.id) === String(row.id);
    },
    async revokeLinks(row) {
      const aliases = [...new Set([row.orderId, row.order_id, String(row.id)].filter((value): value is string => typeof value === 'string' && value.length > 0))];
      const { error } = await supabase.from('preview_tokens').update({ used_at: new Date().toISOString() })
        .in('order_id', aliases).is('used_at', null);
      if (error) throw Error('Previous book approval links could not be retired');
    },
  };
}
