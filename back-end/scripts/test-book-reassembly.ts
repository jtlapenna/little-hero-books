/** Canonical completion -> ordinary review -> W3 entry, with every service transport intercepted. */
import assert from 'node:assert/strict';

async function main() {
  Object.assign(process.env, { SUPABASE_URL: 'https://book-reassembly.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-reassembly-service',
    BACKEND_API_TOKEN: 'synthetic-reassembly-token-at-least-thirty-two-bytes', CLOUDFLARE_ACCOUNT_ID: 'synthetic-reassembly',
    CLOUDFLARE_R2_ACCESS_KEY_ID: 'synthetic-reassembly-access', CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'synthetic-reassembly-secret',
    BACKEND_URL: 'https://admin.littleherolabs.com', BACKEND_API_URL: 'https://admin.littleherolabs.com' });
  const previous = globalThis.fetch;
  let row: Record<string, unknown>, manifest: unknown;
  let checks = 0;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url);
    if (url.origin === 'https://book-reassembly.example.test') {
      if (url.pathname.endsWith('/preview_tokens')) { assert.equal(request.method, 'PATCH'); return Response.json([]); }
      assert(url.pathname.endsWith('/orders'));
      if (request.method === 'PATCH') Object.assign(row, await request.json()); else assert.equal(request.method, 'GET');
      return Response.json(request.headers.get('accept')?.includes('object') ? row : [row]);
    }
    assert.equal(url.origin, 'https://little-hero-orders.synthetic-reassembly.r2.cloudflarestorage.com');
    assert.equal(request.method, 'GET'); return Response.json(manifest);
  };
  try {
    const { NextRequest } = await import('next/server');
    const { POST: complete2A } = await import('../src/app/api/webhooks/workflow-2a-complete/route');
    const { buildW0RunManifest } = await import('../src/lib/books');
    const { bookReviewInvalidation, invalidateBookReview } = await import('../src/lib/book-review-invalidation');
    const { approveStage } = await import('../src/lib/approval-store');
    const { buildW3AssemblyInputResponse } = await import('../src/app/api/internal/w3/build-assembly-input/route');
    const orderId = 'LOCAL-BOOK-REASSEMBLY', bookId = 'book-mvp-simple-adventure', prefix = bookId + '/orders/' + orderId;
    const characterHash = 'synthetic-character';
    row = { id: 1, orderId, root_order_id: orderId, amazon_order_id: orderId, one_manifest_url: prefix + '/manifests/1-manifest.json',
      workflow_step: 'order_intake', current_workflow: '2A', started_at: '2026-10-29T00:00:00Z', execution_status: 'processing',
      customer_approval_required: true, customer_approval_status: 'not_requested',
      review_stages: { preBria: { status: 'in-review' }, postBria: { status: 'pending' }, postPdf: { status: 'pending' } } };
    manifest = { orderId, order: { orderId, rootOrderId: orderId, amazonOrderId: orderId }, characterHash };
    const completion = await complete2A(new NextRequest('https://admin.littleherolabs.com/api/webhooks/workflow-2a-complete', {
      method: 'POST', headers: { authorization: 'Bearer ' + process.env.BACKEND_API_TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ orderId, manifestUrl: prefix + '/manifests/2a-manifest.json', characterHash, needsReview: true }),
    }));
    assert.equal(completion.status, 200, await completion.clone().text()); assert.equal(row.execution_status, 'processing');
    assert.equal(row.current_workflow, null); assert.equal(row.started_at, null); checks++;
    await invalidateBookReview(orderId, 'preBria'); assert.equal(row.execution_status, 'done'); checks++;
    for (const workflow_step of ['2A-complete', 'bria_processing_complete']) {
      assert.doesNotThrow(() => bookReviewInvalidation({ ...row, execution_status: 'processing', workflow_step }, 'preBria')); checks++;
    }
    assert.throws(() => bookReviewInvalidation({ ...row, execution_status: 'processing', workflow_step: 'unknown' }, 'preBria')); checks++;
    const one = buildW0RunManifest({ orderId, rootOrderId: orderId, bookId, formatId: 'standard', platform: 'd2c', characterHash,
      input: { characterSpecs: { childName: 'Sample', animalGuide: 'owl' }, bookSpecs: { title: 'Sample Book' }, orderDetails: { quantity: 1 } } });
    const two = { schema: 'lhb.run-manifest@v2.0', stage: '2b', characterHash,
      order: { orderId, rootOrderId: orderId, characterHash, characterSpecs: { childName: 'Sample', animalGuide: 'owl' }, bookSpecs: { title: 'Sample Book' }, orderDetails: { quantity: 1 } },
      entries: [1, 2].map(poseNumber => ({ poseNumber, bgRemovedKey: bookId + '/generated/pose' + poseNumber + '_nobg.png',
        sourceApprovedKey: bookId + '/generated/pose' + poseNumber + '.png', briaStatus: 'completed' })) };
    for (const stage of ['preBria', 'postBria'] as const) {
      Object.assign(row, { workflow_step: 'book_assembly_completed', manifest_3_url: prefix + '/manifests/3-manifest.json',
        status: 'customer_approved', execution_status: 'done', customer_approval_status: 'approved',
        review_stages: { preBria: { status: 'approved' }, postBria: { status: 'approved' }, postPdf: { status: 'approved' } } });
      await invalidateBookReview(orderId, stage); assert.equal(row.manifest_3_url, null); assert.notEqual(row.workflow_step, 'book_assembly_completed'); checks++;
      if (stage === 'preBria') await approveStage(orderId, 'preBria');
      await approveStage(orderId, 'postBria'); assert.equal(row.next_workflow, '3');
      let attempts = 0;
      const result = await buildW3AssemblyInputResponse({ body: { orderId, rootOrderId: orderId, orderPrefix: prefix, backendUrl: 'https://admin.littleherolabs.com' } }, {
        loadManifest: async key => key.endsWith('/1-manifest.json') ? one : key.endsWith('/2b-manifest.json') ? two : null,
        normalizePoseScale: async ({ imageKey, poseNumber }) => ({ success: true, normalized: false, imageKey, poseNumber, bookId, refKey: imageKey, message: 'Synthetic scale boundary', scaleFactor: null, verticalOffset: null, horizontalOffset: null, groundContactOffset: null, sourceAnchorMetrics: null, referenceAnchorMetrics: null, sourceBBoxFound: true, referenceBBoxFound: true }),
        lookupOrderRow: async () => row,
        instrumentAssemblyJob: async () => { attempts++; return { workflowJobId: 1, workflowJobIdempotencyKey: 'synthetic-reassembly', workflowJobStatus: 'running', workflowAttemptId: 1, workflowAttempt: 1, workflowClaimed: true, workflowSkipped: false, workflowSkipReason: null }; },
      });
      assert.notEqual(result.workflowSkipped, true); assert.equal(attempts, 1); checks++;
    }
    console.log(JSON.stringify({ passed: true, checks, actualW2Completion: true, actualW3Entry: true, externalRequests: 0 }));
  } finally { globalThis.fetch = previous; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
