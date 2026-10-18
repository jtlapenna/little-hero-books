process.env.BACKEND_API_TOKEN ??= 'synthetic-printer-file-signing-authority-only-12345';
import assert from 'node:assert/strict';
import configFile from '../src/lib/books/configs/book-finding-our-inner-voice/v2.json';
import { GelatoPrintConfigSchema } from '../src/lib/books/types';
import { quoteGelatoSubmission, submitGelatoDraft, type GelatoSubmissionDependencies, type GelatoSubmissionIdentity } from '../src/lib/books/gelato-submission';
import { GelatoProviderOrderSchema, loadGelatoConnectedOrders, validateGelatoConnectedOrders } from '../src/lib/books/gelato-provider-snapshot';
import { handleGelatoSubmission } from '../src/lib/books/gelato-submission-endpoint';
import type { GelatoSubmissionContext } from '../src/lib/books/gelato-submission-store';
import type { W4GelatoPrintInput } from '../src/lib/books/w4-gelato-print-input';
import type { GelatoDraftOrderRequest } from '../src/lib/books/gelato-api-contract';

const config = GelatoPrintConfigSchema.parse(configFile.formats.standard.print);
const identity = { submissionId: '11111111-1111-4111-8111-111111111111', claimToken: '22222222-2222-4222-8222-222222222222', executionId: 'execution-1', mode: 'siblings' as const };
async function runScenario(failGet = false, storedCopy = false, changedBytes = false, optionalFields = false,
  corruption?: 'recipient' | 'file' | 'items' | 'null' | 'expiry-during-send', engineering?: 'allowed' | 'denied' | 'unavailable' | 'missing', shippingFailure?: 'missing-tier' | 'missing-service' | 'unsupported-country') {
  const context: GelatoSubmissionContext = { providerOrders: [], submission: {
    id: identity.submissionId, provider: 'gelato', root_order_id: 'group-1', order_reference_id: 'lhb-gelato-1',
    workflow_job_idempotency_key: 'job-1', claim_token: identity.claimToken, lease_expires_at: '2026-10-11T12:15:00Z',
    request_state: 'claimed', owning_execution_id: null, send_started_at: null, accepted_root_order_id: null,
    quote_snapshot: null, request_snapshot: null, quote_id: null, shipment_method_uid: null, shipment_policy_version: null, quoted_at: null, quote_request_fingerprint: null,
  }, members: [1, 2].map((id) => ({ submission_id: identity.submissionId, child_order_id: id, child_order_key: `child-${id}`, item_reference_id: `lhb-item-${id}`,
    artifact_key: `book/orders/child-${id}/gelato/print/v2/${'a'.repeat(24)}.pdf`, artifact_fingerprint: 'a'.repeat(24), artifact_claim_token: identity.claimToken,
    pdf_page_count: 35, provider_order_id: null, provider_item_id: null, status: null })) };
  let now = new Date('2026-10-11T12:00:00Z');
  let quotedUrls: string[] = [];
  let sends = 0;
  let draft!: GelatoDraftOrderRequest;
  const calls: string[] = [];
  const dependencies: GelatoSubmissionDependencies = {
    verifyStoredFile: async () => !changedBytes,
    backendUrl: 'https://admin.littleherolabs.com', draftsEnabled: !engineering,
    ...(engineering && engineering !== 'missing' ? { engineeringDraftsAllowed: async (actual: GelatoSubmissionIdentity) => {
      assert.deepEqual(actual, identity); if (engineering === 'unavailable') throw new Error('Scoped authority unavailable'); return engineering === 'allowed';
    } } : {}), now: () => now, artifactExists: async () => true,
    loadOrder: async (key) => ({ id: Number(key.slice(-1)), print_provider: 'gelato', print_submission_id: identity.submissionId, print_claim_token: identity.claimToken, quantity: 1, shipping_tier: shippingFailure === 'missing-tier' ? 'overnight-unconfigured' : 'standard', customer_email: 'test@example.com', shipping_address: { name: 'Taylor Example', address: '1 Main St', city: 'Seattle', state: 'WA', zip: '98101', country: shippingFailure === 'unsupported-country' ? 'CA' : 'US', ...(optionalFields ? { address_line_2: 'Unit 2', phone: '+12065550123' } : {}) } }),
    loadPrintInput: async (key) => ({ orderId: key, orderDbId: Number(key.slice(-1)), orderPrefix: `book/orders/${key}`, bookConfigVersion: 2, rootOrderId: 'group-1',
      providerPrintConfig: config, shippingTier: 'standard', customer: { email: 'test@example.com' },
      shippingAddress: { name: 'Taylor Example', street1: '1 Main St', city: 'Seattle', state: 'WA', zip: '98101', country: 'US' } } as unknown as W4GelatoPrintInput),
    store: { load: async () => context, transition: async (name, p) => {
      calls.push(name);
      const s = context.submission;
      if (name === 'record_gelato_quote_snapshot') {
        Object.assign(s, { quote_snapshot: JSON.parse(JSON.stringify(p.p_snapshot)), quote_id: p.p_quote_id, shipment_method_uid: p.p_shipment_method_uid,
          shipment_policy_version: p.p_policy_version, quoted_at: p.p_quoted_at, quote_request_fingerprint: p.p_request_fingerprint });
      } else if (name === 'begin_gelato_print_submission') { s.request_state = 'submitting'; s.request_snapshot = s.quote_snapshot; }
      else if (name === 'authorize_gelato_print_send') { if (corruption === 'expiry-during-send') now = new Date('2026-10-12T11:01:00Z'); assert.equal(s.send_started_at, null); s.send_started_at = '2026-10-11T12:00:00Z'; }
      else if (name === 'record_gelato_accepted_root') s.accepted_root_order_id = String(p.p_root_id);
      else if (name === 'persist_gelato_draft_result') { assert.equal((p.p_orders as unknown[]).length, 2); s.request_state = 'submitted'; }
      else if (name === 'fence_gelato_print_submission') s.request_state = 'outcome_unknown';
      return {};
    } },
    quote: async (request) => { quotedUrls = request.products.map(item => item.files[0].url); return { orderReferenceId: request.orderReferenceId, quotes: [{ id: 'quote-1',
      itemReferenceIds: request.products.map((item) => item.itemReferenceId), products: request.products,
      shipmentMethods: [{ shipmentMethodUid: shippingFailure === 'missing-service' ? 'unintended-fallback' : 'usps_ground_advantage', type: 'normal' }] }] }; },
    create: async (request) => { sends++; assert.deepEqual(request.items.map(item => item.files[0].url), quotedUrls, 'Exact signed URLs survive persisted snapshot and advancing clock'); draft = request; return { id: 'provider-1', orderType: 'draft', orderReferenceId: request.orderReferenceId, connectedOrderIds: ['provider-2'], items: [request.items[0]] }; },
    get: async (id) => {
      if (failGet) throw new Error('synthetic GET timeout');
      const index = Number(id.slice(-1)) - 1;
      return GelatoProviderOrderSchema.parse({ ...draft, id, fulfillmentStatus: 'created', updatedAt: '2026-10-11T12:00:00Z', connectedOrderIds: ['provider-1', 'provider-2'],
        items: [{ ...draft.items[index], ...(storedCopy ? { files: [{ type: 'default', url: 'https://gelato-api-live.s3.eu-west-1.amazonaws.com/synthetic.pdf' }] } : {}), id: `provider-item-${index + 1}`, fulfillmentStatus: 'created' }] });
    },
  };
  assert.equal((await handleGelatoSubmission({ ...identity, fileUrl: 'https://attacker.example.test' }, 'quote', dependencies)).status, 400);
  if (shippingFailure) {
    const response = await handleGelatoSubmission(identity, 'quote', dependencies);
    assert.equal(response.status, 409, 'Unavailable shipping must be a visible endpoint error');
    assert.equal(sends, 0); assert.deepEqual(calls, []); assert.equal(context.submission.quote_snapshot, null);
    return;
  }
  await quoteGelatoSubmission(identity, dependencies);
  now = new Date('2026-10-11T12:03:00Z');
  if (corruption === 'expiry-during-send') {
    await assert.rejects(submitGelatoDraft(identity, dependencies), /inspect/);
    assert.equal(sends, 0); assert.equal(context.submission.request_state, 'outcome_unknown'); return;
  }
  if (corruption) {
    const snapshot = context.submission.quote_snapshot as { request: GelatoDraftOrderRequest };
    if (corruption === 'recipient') snapshot.request.shippingAddress.postCode = '99999';
    if (corruption === 'file') snapshot.request.items[0].files[0].url = 'https://admin.littleherolabs.com/different.pdf';
    if (corruption === 'items') snapshot.request.items.reverse();
    if (corruption === 'null') Object.assign(snapshot.request.shippingAddress, { phone: null });
    await assert.rejects(submitGelatoDraft(identity, dependencies), corruption === 'null' ? /expected string/ : /saved quote snapshot/);
    assert.deepEqual(calls, ['record_gelato_quote_snapshot']);
    assert.equal(sends, 0); assert.equal(context.submission.request_state, 'claimed');
    return;
  }
  if (engineering && engineering !== 'allowed') {
    await assert.rejects(submitGelatoDraft(identity, dependencies));
    assert.equal(sends, 0); assert.deepEqual(calls, ['record_gelato_quote_snapshot']); return;
  }
  if (failGet || changedBytes) {
    await assert.rejects(submitGelatoDraft(identity, dependencies), /inspect/);
    assert.equal(context.submission.request_state, 'outcome_unknown');
    assert.equal(context.submission.accepted_root_order_id, 'provider-1');
    await assert.rejects(submitGelatoDraft(identity, dependencies), /stale/);
  } else {
    assert.equal((await submitGelatoDraft(identity, dependencies)).outcome, 'draft');
    assert.equal((await submitGelatoDraft(identity, dependencies)).reused, true);
    const graph = await loadGelatoConnectedOrders(['provider-1'], dependencies.get!);
    if (!storedCopy) assert.equal(validateGelatoConnectedOrders(graph, draft, true).length, 2);
    assert.throws(() => validateGelatoConnectedOrders(graph.slice(0, 1), draft, true), /identity|incomplete/);
    assert.throws(() => validateGelatoConnectedOrders([{ ...graph[0], shippingAddress: { ...graph[0].shippingAddress, postCode: '99999' } }, graph[1]], draft, true), /recipient/);
    assert.throws(() => validateGelatoConnectedOrders([{ ...graph[0], orderType: 'order' }, graph[1]], draft, true), /identity/);
    assert.throws(() => validateGelatoConnectedOrders([{ ...graph[0], shipment: { shipmentMethodUid: 'wrong', packages: [] } }, graph[1]], draft, true), /identity/);
    assert.ok(calls.indexOf('authorize_gelato_print_send') < calls.indexOf('record_gelato_accepted_root'));
  }
  assert.equal(sends, 1);
  if (optionalFields) {
    assert.equal(draft.shippingAddress.addressLine2, 'Unit 2');
    assert.equal(draft.shippingAddress.phone, '+12065550123');
  }
}
void Promise.all([...(['missing-tier', 'missing-service', 'unsupported-country'] as const).map(mode => runScenario(false, false, false, false, undefined, undefined, mode)), ...(['allowed','denied','unavailable','missing'] as const).map(mode => runScenario(false,false,false,false,undefined,mode)), runScenario(), runScenario(true), runScenario(false, true), runScenario(false, true, true),
  runScenario(false, false, false, true), ...(['recipient', 'file', 'items', 'null', 'expiry-during-send'] as const).map(corruption => runScenario(false, false, false, false, corruption)),
]).then(() => console.log('Gelato persisted quote-to-draft service and connected graph checks passed')).catch((error) => { console.error(error); process.exitCode = 1; });
