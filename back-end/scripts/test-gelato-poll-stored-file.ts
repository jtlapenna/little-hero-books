import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import configFile from '../src/lib/books/configs/book-finding-our-inner-voice/v2.json';

async function main() {
  Object.assign(process.env, { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-poll-proof', CLOUDFLARE_ACCOUNT_ID: 'synthetic-poll', CLOUDFLARE_R2_ACCESS_KEY_ID: 'synthetic-access', CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'synthetic-secret', GELATO_API_KEY: 'synthetic-provider', GELATO_NOTIFICATIONS_ENABLED: 'false' });
  const submissionId = '11111111-1111-4111-8111-111111111111';
  const token = '22222222-2222-4222-8222-222222222222';
  const key = `book/orders/child-1/gelato/print/v2/${'a'.repeat(24)}.pdf`;
  const request = { orderType: 'draft', orderReferenceId: 'proof-1', customerReferenceId: 'group-1', currency: 'USD', shipmentMethodUid: 'usps_ground_advantage', shippingAddress: { country: 'US', firstName: 'Synthetic', lastName: 'Proof', addressLine1: '1 Main St', city: 'Brooklyn', postCode: '11203', state: 'NY', email: 'test@example.com' }, items: [{ itemReferenceId: 'item-1', productUid: configFile.formats.standard.print.productUid, quantity: 1, pageCount: 32, files: [{ type: 'default', url: `https://admin.littleherolabs.com/api/pdf/${key}` }] }] };
  const provider = { ...request, id: 'provider-1', updatedAt: '2026-10-11T00:00:00Z', fulfillmentStatus: 'draft', items: [{ ...request.items[0], id: 'provider-item-1', fulfillmentStatus: 'created', files: [{ type: 'default', url: 'https://gelato-api-live.s3.eu-west-1.amazonaws.com/synthetic.pdf' }] }] };
  const submission = { id: submissionId, provider: 'gelato', order_reference_id: 'proof-1', root_order_id: 'group-1', workflow_job_idempotency_key: 'proof-job', claim_token: token, lease_expires_at: '2999-01-01T00:00:00Z', request_state: 'submitted', owning_execution_id: 'proof-execution', send_started_at: '2026-10-11T00:00:00Z', accepted_root_order_id: 'provider-1', quote_snapshot: null, request_snapshot: { request, config: configFile.formats.standard.print, shippingTier: 'standard' }, quote_id: null, shipment_method_uid: null, shipment_policy_version: null, quoted_at: null, quote_request_fingerprint: null };
  const member = { submission_id: submissionId, child_order_id: 1, child_order_key: 'child-1', item_reference_id: 'item-1', artifact_key: key, artifact_fingerprint: 'a'.repeat(24), artifact_claim_token: token, pdf_page_count: 35, provider_order_id: 'provider-1', provider_item_id: 'provider-item-1', status: 'created', action_reason: null };
  const storedProvider = { provider_order_id: 'provider-1', status: 'draft', order_type: 'draft', last_event_at: provider.updatedAt, snapshot_digest: null, snapshot: provider, action_reason: null };
  let canonicalWrites = 0;
  let artifactReads = 0;
  let streamCanceled = false;
  let registered = false, claimAvailable = true, cleanupFailure = true, finishes = 0;
  const database = createClient('https://db.example.test', 'synthetic-key', { global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'db.example.test');
    if (init?.signal?.aborted) return new Response(JSON.stringify({ message: 'Aborted' }), { status: 499 });
    const table = url.pathname.split('/').pop();
    if (registered && table === 'claim_gelato_scheduled_status') {
      const rows = claimAvailable ? [{ submission_id: submissionId, lease_token: token }] : [];
      claimAvailable = false; return Response.json(rows);
    }
    if (registered && table === 'finish_gelato_scheduled_status') {
      assert(!init?.signal?.aborted, 'Cleanup uses an independent signal');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.p_error_class, 'timeout'); assert.equal(body.p_poll_token, token); finishes++;
      return cleanupFailure ? Response.json({ message: 'Synthetic unavailable cleanup' }, { status: 503 }) : Response.json(null);
    }
    if (table === 'list_gelato_poll_candidates') return Response.json([{ id: submissionId, request_state: 'submitted' }]);
    if (url.pathname.includes('/rpc/')) { canonicalWrites++; throw new Error('Unexpected live-signal write'); }
    const records = table === 'print_provider_submissions' ? [submission] : table === 'print_provider_submission_items' ? [member] : table === 'print_provider_submission_orders' ? [storedProvider] : [];
    return Response.json(new Headers(init?.headers).get('Accept')?.includes('vnd.pgrst.object') ? records[0] : records);
  } } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    assert.equal(request.method, 'GET', 'poll must never create another provider order');
    if (url.hostname === 'order.gelatoapis.com') return Response.json(provider);
    assert.equal(url.hostname, 'little-hero-orders.synthetic-poll.r2.cloudflarestorage.com');
    assert.equal(init?.redirect, 'manual'); assert.ok(init?.signal);
    artifactReads++;
    return new Response(new ReadableStream({ pull: () => new Promise(() => undefined), cancel() { streamCanceled = true; } }));
  };
  const watchdog = setTimeout(() => { throw new Error('Poll file deadline was not honored'); }, 1000);
  try {
    const { pollGelatoPrintProvider } = await import('../src/lib/books/gelato-polling');
    const started = Date.now();
    const result = await pollGelatoPrintProvider(database, { enabled: true, budgetMs: 100 });
    assert.equal(artifactReads, 1, 'actual runtime must reach the stored-file R2 read');
    assert.equal(streamCanceled, true);
    assert.equal(result.checked, 1); assert.equal(result.errors, 1); assert.equal(result.refreshed, 0); assert.equal(result.delivered, 0);
    assert.equal(canonicalWrites, 0, 'aborted store cannot persist a hold, status or notification');
    assert.ok(Date.now() - started < 500, 'poll file read must honor the shared deadline');
    registered = true; streamCanceled = false;
    const { pollRegisteredGelatoStatus } = await import('../src/lib/books/gelato-scheduled-status');
    const options = { enabled: true, apiKey: 'synthetic-dedicated-status', budgetMs: 450, candidateBudgetMs: 60, cleanupBudgetMs: 75 };
    const dedicated = await pollRegisteredGelatoStatus(database, options);
    assert.equal(dedicated.checked, 1); assert.equal(dedicated.errors, 2, 'Work timeout and unavailable cleanup are both visible');
    assert.equal(streamCanceled, true); assert.equal(finishes, 1); assert.equal(canonicalWrites, 0);
    const leased = await pollRegisteredGelatoStatus(database, options);
    assert.equal(leased.checked, 0, 'A failed cleanup cannot make an owned lease immediately claimable');
    // SQL suite proves actual lease expiry/token revocation. Here model the next
    // lease granted after that boundary and exercise the actual runtime again.
    claimAvailable = true; cleanupFailure = false;
    const retry = await pollRegisteredGelatoStatus(database, options);
    assert.equal(retry.checked, 1); assert.equal(retry.errors, 1); assert.equal(finishes, 2);
    assert.equal(canonicalWrites, 0); assert.equal(retry.delivered, 0);
  } finally { clearTimeout(watchdog); globalThis.fetch = originalFetch; }
  console.log('Gelato legacy + registered actual runtimes: stalled R2 body cancels; bounded independent cleanup, failed-cleanup lease hold and retry; no canonical writes/messages');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
