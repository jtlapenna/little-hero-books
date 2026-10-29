import assert from 'node:assert/strict';
import { bookReviewInvalidation, invalidateBookReview } from '../src/lib/book-review-invalidation';
import { buildOrderListItem } from '../src/lib/status-display';
import { shouldShowInReviewPoses, shouldShowInReviewBackgrounds, shouldShowInReviewPages } from '../src/lib/review-page-filters';
import type { Order } from '../src/types/order';
import { customerRevisionsRemaining } from '../src/lib/customer-corrections';

async function main() {
  let checks = 0;
  const check = (name: string, value: unknown) => { assert(value, name); checks++; };
  const row = { id: 1, orderId: 'PLACEHOLDER-BOOK', customer_approval_required: true, customer_approval_status: 'approved', human_approved: true,
    next_workflow: '4', review_stages: { preBria: { status: 'approved' }, postBria: { status: 'approved' }, postPdf: { status: 'approved' } } };
  const patch = bookReviewInvalidation(row, 'postBria');
  check('old customer approval withdrawn', patch.customer_approval_status === 'not_requested' && patch.human_approved === false);
  check('approval still required', patch.customer_approval_required === true);
  check('old print queue withdrawn', patch.next_workflow === null);
  assert.deepEqual(patch.review_stages, { preBria: { status: 'approved' }, postBria: { status: 'in-review' }, postPdf: { status: 'pending' } }); checks++;
  for (const field of ['print_submission_id', 'print_claim_token', 'gelato_order_id', 'gelato_status', 'lulu_job_id', 'lulu_status', 'current_workflow', 'started_at']) {
    assert.throws(() => bookReviewInvalidation({ ...row, [field]: 'owned' }, 'preBria')); checks++;
  }
  for (const [stage, workflow, source] of [['postPdf','3','assembly-publish'],['preBria','2A','pose-generation']] as const) {
    const active = { ...row, current_workflow: workflow, started_at: '2026-10-29T00:00:00Z', execution_status: 'processing' };
    assert.equal(bookReviewInvalidation(active, stage, new Date(), source).next_workflow, null); checks++;
    assert.throws(() => bookReviewInvalidation(active, stage)); checks++;
    assert.throws(() => bookReviewInvalidation({ ...active, current_workflow: '4' }, stage, new Date(), source)); checks++;
  }
  // Real dashboard consumers must show internal review, including when the old raw state was customer-approved.
  for (const [stage, show, display] of [['preBria', shouldShowInReviewPoses, 'review_poses'],
    ['postBria', shouldShowInReviewBackgrounds, 'review_backgrounds'], ['postPdf', shouldShowInReviewPages, 'review_pages']] as const) {
    const held = bookReviewInvalidation({ ...row, status: 'customer_approved' }, stage);
    const mapped = buildOrderListItem({ orderId: row.orderId, platform: 'd2c', project: 'placeholder',
      customer: { firstName: 'Sample', lastName: 'Reader', email: 'sample@example.test' }, orderDate: '2026-10-29T00:00:00Z',
      status: held.status, characterSpecs: {}, bookSpecs: {}, orderDetails: {}, reviewStages: held.review_stages,
      customerApprovalStatus: held.customer_approval_status, customerApprovalRequestedAt: held.customer_approval_requested_at,
      customerApprovalApprovedAt: held.customer_approval_approved_at, executionStatus: 'done', workflowStep: 'book_assembly_completed',
    } as unknown as Order);
    check(stage + ' internal review remains visible', show(mapped) && mapped.workflowStatus === display);
  }
  const calls: string[] = [];
  await invalidateBookReview(row.orderId, 'preBria', { load: async () => row,
    compareAndSet: async (_row, update) => { calls.push('hold'); assert.equal(update.next_workflow, null); return true; },
    revokeLinks: async () => { calls.push('retire links'); } });
  assert.deepEqual(calls, ['hold', 'retire links']); checks++;
  await assert.rejects(() => invalidateBookReview(row.orderId, 'preBria', { load: async () => row,
    compareAndSet: async () => false, revokeLinks: async () => { throw Error('Must not continue after lost CAS'); } }), /Book changed/); checks++;
  await assert.rejects(() => invalidateBookReview(row.orderId, 'preBria', { load: async () => row,
    compareAndSet: async () => true, revokeLinks: async () => { throw Error('Retirement failed'); } }), /Retirement failed/); checks++;
  check('one existing correction policy represented consistently', customerRevisionsRemaining(0) === 1 && customerRevisionsRemaining(1) === 0 && customerRevisionsRemaining(2) === 0);
  check('malformed revision count fails closed', customerRevisionsRemaining(-1) === 0 && customerRevisionsRemaining('1') === 0);
  // Exercise the real reset caller as well as the primitive: it previously overwrote the in-review hold.
  Object.assign(process.env, { SUPABASE_URL: 'https://book-review.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-review-service' });
  const previous = globalThis.fetch;
  try {
    let current: Record<string, unknown> = {};
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init), url = new URL(request.url);
      assert.equal(url.origin, 'https://book-review.example.test');
      if (url.pathname.endsWith('/preview_tokens')) { assert.equal(request.method, 'PATCH'); return Response.json([]); }
      assert(url.pathname.endsWith('/orders'));
      if (request.method === 'PATCH') Object.assign(current, await request.json()); else assert.equal(request.method, 'GET');
      return Response.json(request.headers.get('accept')?.includes('object') ? current : [current]);
    };
    const { approveStage } = await import('../src/lib/approval-store');
    for (const [stage, show] of [['preBria', shouldShowInReviewPoses], ['postBria', shouldShowInReviewBackgrounds], ['postPdf', shouldShowInReviewPages]] as const) {
      current = { ...structuredClone(row), status: 'customer_approved', workflow_step: 'book_assembly_completed', execution_status: 'done', current_workflow: null, started_at: null };
      await approveStage(row.orderId, stage, 'pending');
      const mapped = buildOrderListItem({ orderId: row.orderId, status: current.status, reviewStages: current.review_stages,
        customerApprovalStatus: current.customer_approval_status, customerApprovalRequestedAt: current.customer_approval_requested_at,
        customerApprovalApprovedAt: current.customer_approval_approved_at, executionStatus: current.execution_status,
        workflowStep: current.workflow_step } as unknown as Order);
      check(stage + ' actual reset caller stays in review', show(mapped));
      check(stage + ' actual reset retains buyer approval requirement', current.customer_approval_required === true);
    }
  } finally { globalThis.fetch = previous; }
  console.log(JSON.stringify({ passed: true, checks, liveRequests: 0 }));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
