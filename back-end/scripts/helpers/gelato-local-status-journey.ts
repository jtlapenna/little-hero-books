/** Connected local proof. Input PDFs come from the real assembly journey; every service is fake. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { pollRegisteredGelatoStatus } from '../../src/lib/books/gelato-scheduled-status';
import { gelatoLifecycleRuntime } from '../../src/lib/books/gelato-lifecycle-runtime';
import { gelatoStatusLabel } from '../../src/lib/books/gelato-status';
import type { GelatoSubmissionContext } from '../../src/lib/books/gelato-submission-store';
import type { GelatoPrintInspection } from '../../src/lib/books/gelato-admin-inspection';
import { GelatoSavedSnapshotSchema } from '../../src/lib/books/gelato-submission';
import { buildGelatoLifecycleResults } from '../../src/lib/books/gelato-lifecycle';

type Row = Record<string, unknown>;
type Result = ReturnType<typeof buildGelatoLifecycleResults>[number];
type Raw = Row & { id: string; items: Array<Row & { id: string }> };
export async function proveLocalStatusJourney(fixture: {
 context: GelatoSubmissionContext; raw: unknown; rows: Row[]; blobs: Map<string, Buffer>;
}) {
 const priorFetch = globalThis.fetch;
 const watchdog = setTimeout(() => { throw Error('Connected local status journey did not complete'); }, 60000);
 let context = structuredClone(fixture.context), raw = structuredClone(fixture.raw) as Raw;
 const rows = structuredClone(fixture.rows), quote = JSON.stringify(context.submission.request_snapshot);
 const statusKey = 'synthetic-connected-status-account';
 const origin = process.env.SUPABASE_URL!;
 const accountHash = createHash('sha256').update(statusKey).digest('hex');
 let due = true, lease: string | null = null, fault = '', providerReads = 0, artifactReads = 0, fileReads = 0, rpcCalls = 0;
 let clock = Date.parse(String(raw.updatedAt));
 const scenarios: Array<{ scenario: string; result: string; status: string; errorClass: unknown }> = [];
 const job: Row = { submission_id: context.submission.id, enabled: true, registered_at: new Date(clock).toISOString(), last_attempt_at: null, last_success_at: null,
 next_attempt_at: null, last_result: null, last_error_class: null, active_interval_seconds: 300, terminal_interval_seconds: 3600, terminal_until: null };
 const matches = (entries: Row[], url: URL) => entries.filter(row => [...url.searchParams].every(([key, value]) =>
  !value.startsWith('eq.') || String(row[key] ?? '') === value.slice(3)));
 const transportViolations: string[] = [], attemptedProviderIds: string[] = [];
 const intercept: typeof fetch = async (input, init) => {
  const request = new Request(input, init), url = new URL(request.url);
  if (url.origin === origin) {
   const name = url.pathname.split('/').pop()!;
   if (url.pathname.includes('/rpc/')) {
    assert.equal(request.method, 'POST'); rpcCalls++;
    const body = await request.json() as Row;
    if (name === 'claim_gelato_scheduled_status') {
     assert.equal(body.p_account_key_sha256, accountHash); assert.equal(body.p_lease_seconds, 30);
     if (!due || lease) return Response.json([]);
     lease = randomUUID(); due = false;
     return Response.json([{ submission_id: context.submission.id, lease_token: lease }]);
    }
    assert.equal(body.p_submission_id, context.submission.id); assert(lease); assert.equal(body.p_poll_token, lease);
    if (name === 'finish_gelato_scheduled_status') {
     assert(!request.signal.aborted); lease = null;
     Object.assign(job, { last_attempt_at: new Date().toISOString(), last_result: body.p_result, last_error_class: body.p_error_class });
     if (body.p_result === 'success' || body.p_result === 'requires_review') job.last_success_at = job.last_attempt_at;
     if (fault === 'rate') assert.equal(body.p_retry_after_seconds, 120);
     return Response.json(null);
    }
    assert.deepEqual(body.p_expected, context.providerOrders.map(order => ({ providerOrderId: order.provider_order_id,
     digest: order.snapshot_digest, eventAt: order.last_event_at, observationRevision: order.observation_revision ?? 0 })));
    if (name === 'hold_gelato_scheduled_refresh') {
     context.providerOrders.forEach(order => { order.action_reason = String(body.p_reason); order.observation_revision = (order.observation_revision ?? 0) + 1; });
     context.members.forEach(member => { member.action_reason = String(body.p_reason); });
     rows.forEach(row => { row.gelato_action_reason = body.p_reason; });
     return Response.json(null);
    }
    assert.equal(name, 'apply_gelato_scheduled_snapshots', 'No recovery/create/cancel/sender/global selector RPC');
    assert.deepEqual(body.p_notifications, []); assert.deepEqual(body.p_notification_holds, []);
    if (fault === 'database') return Response.json({ message: 'Synthetic persistence failure' }, { status: 503 });
    for (const result of body.p_results as Result[]) {
     const order = context.providerOrders.find(order => order.provider_order_id === result.providerOrderId)!; assert(order);
     if (result.accepted) Object.assign(order, { status: result.status, order_type: result.orderType, snapshot: result.snapshot,
      snapshot_digest: result.digest, last_event_at: result.snapshot.updatedAt, last_checked_at: new Date().toISOString() });
     order.action_reason = result.actionReason; order.observation_revision = (order.observation_revision ?? 0) + 1;
     if (result.accepted && result.status !== 'on_hold') order.progress_status = result.status;
     if (result.accepted && result.financialAccepted && result.financialObservation) Object.assign(order, {
      financial_observation: result.financialObservation, financial_observed_at: new Date().toISOString() });
     if (result.accepted && result.financialObservation) order.financial_action_reason = result.financialActionReason;
     for (const item of result.items) {
      const member = context.members.find(member => member.item_reference_id === item.itemReferenceId)!;
      assert.equal(member.provider_order_id, result.providerOrderId); assert.equal(member.provider_item_id, item.providerItemId);
      Object.assign(member, { status: item.status, action_reason: item.actionReason });
      if (item.status !== 'on_hold') member.progress_status = item.status;
      const row = rows.find(row => row.id === member.child_order_id)!;
      Object.assign(row, { gelato_status: item.orderType === 'draft' ? 'draft' : item.status, gelato_order_type: item.orderType, gelato_action_reason: item.actionReason, gelato_tracking: item.tracking ?? row.gelato_tracking });
     }
    }
    return Response.json(null);
   }
   assert.equal(request.method, 'GET', 'No direct database mutations or message transport');
   const entries: Row[] = name === 'orders' ? rows : name === 'print_provider_submissions' ? [context.submission] :
    name === 'print_provider_submission_orders' ? context.providerOrders.map(order => ({ ...order, submission_id: context.submission.id })) : name === 'print_provider_submission_items' ? context.members :
    name === 'print_provider_submission_notifications' ? [] : name === 'gelato_scheduled_status' ? [job] : (() => { throw Error('Unexpected table ' + name); })();
   const selected = matches(entries, url);
   return Response.json(request.headers.get('accept')?.includes('vnd.pgrst.object') ? selected[0] ?? null : selected);
  }
  assert.equal(request.method, 'GET', 'Status path cannot create, convert, fund, cancel or send');
  if (url.origin === 'https://order.gelatoapis.com') {
   attemptedProviderIds.push(url.pathname.slice('/v4/orders/'.length));
   assert.equal(url.pathname, '/v4/orders/' + raw.id, 'Only the saved provider graph can be read');
   assert.equal(request.headers.get('x-api-key'), statusKey); providerReads++;
   if (fault === 'rate') return new Response(null, { status: 429, headers: { 'Retry-After': '120' } });
   if (fault === 'provider') return new Response(null, { status: 503 });
   if (fault === 'timeout') return new Promise((_resolve, reject) => {
    if (request.signal.aborted) reject(Error('Synthetic timeout'));
    else request.signal.addEventListener('abort', () => reject(Error('Synthetic timeout')), { once: true });
   });
   return Response.json(raw);
  }
  if (url.hostname === 'little-hero-orders.synthetic-journey.r2.cloudflarestorage.com') {
   const key = decodeURIComponent(url.pathname.slice(1)); const bytes = fixture.blobs.get(key); assert(bytes); artifactReads++;
   return new Response(Uint8Array.from(bytes));
  }
  assert.equal(url.origin, 'https://gelato-api-live.s3.eu-west-1.amazonaws.com', 'No real network or messages');
  assert.equal(request.redirect, 'manual'); fileReads++;
  const index = Number(url.pathname.match(/local-(\d+)\.pdf/)?.[1]); assert(Number.isSafeInteger(index));
  if (fault === 'redirect') return new Response(null, { status: 302, headers: { location: 'https://unexpected.example.test/never-follow' } });
  const source = fault === 'swapped' ? (index + 1) % context.members.length : index;
  const bytes = fixture.blobs.get(context.members[source].artifact_key!)!;
  return new Response(Uint8Array.from(fault === 'corrupt' ? Buffer.from('damaged dummy PDF') : bytes));
 };
 const transport: typeof fetch = async (input, init) => {
  try { return await intercept(input, init); } catch(error) {
   if (!(fault === 'timeout' && error instanceof Error && error.message === 'Synthetic timeout')) transportViolations.push(String(error));
   throw error;
  }
 };
 globalThis.fetch = transport;
 const database = createClient(origin, 'synthetic-connected-status-service', { global: { fetch: transport } });
 const options = { enabled: true, apiKey: statusKey, budgetMs: 5000, candidateBudgetMs: 2500, cleanupBudgetMs: 250,
  lifecycle: (signal: AbortSignal) => ({ ...gelatoLifecycleRuntime(signal, database),
   loadOrder: async () => { throw Error('Scheduler must remove customer loading even when supplied'); } }) };
 const tick = async (scenario: string, expected: 'success' | 'requires_review' | 'failed', errorClass: string | null = null) => {
  due = true; const result = await pollRegisteredGelatoStatus(database, { ...options, candidateBudgetMs: fault === 'timeout' ? 40 : 2500 });
  assert.deepEqual(transportViolations, [], 'Caught transport violations must not count as expected provider failures');
  assert(attemptedProviderIds.every(id => id === raw.id), 'No foreign provider read may be attempted');
  assert.equal(result.checked, 1, scenario); assert.equal(result.errors, expected === 'failed' ? 1 : 0, JSON.stringify({scenario,result,job}));
  assert.equal(job.last_result, expected, scenario); assert.equal(job.last_error_class, errorClass, scenario); assert.equal(lease, null, scenario);
  assert.equal(JSON.stringify(context.submission.request_snapshot), quote, 'Polling cannot overwrite the submitted quote');
  scenarios.push({ scenario, result: String(job.last_result), status: context.providerOrders[0].status, errorClass: job.last_error_class });
  return result;
 };
 const advance = (status: string) => {
  clock += 60000; raw.updatedAt = new Date(clock).toISOString(); raw.fulfillmentStatus = status;
  raw.items.forEach(item => { item.fulfillmentStatus = status; });
 };
 try {
  const before = rpcCalls;
  assert.equal((await pollRegisteredGelatoStatus(database, { ...options, enabled: false })).disabled, true); assert.equal(rpcCalls, before);
  await tick('draft retained without release', 'success');
  assert.equal(context.providerOrders[0].order_type, 'draft'); assert(context.members.every(member => member.action_reason === 'awaiting_draft_review'));
  // Provider conversion and every production state below are synthetic HTTP responses only.
  raw.orderType = 'order'; raw.financialStatus = 'pending'; advance('created');
  await tick('synthetic unpaid regular order observed', 'success');
  assert.equal(context.providerOrders[0].financial_observation?.status, 'pending');
  assert.equal(context.providerOrders[0].financial_observation?.receipts, null);
  for (const status of ['uploading', 'passed']) {
   advance(status); if (status === 'passed') raw.items.forEach(item => { item.processedFileUrl = 'https://example.test/synthetic-prepress.pdf'; });
   await tick('synthetic ' + status, 'success');
  }
  assert(context.providerOrders[0].financial_observation?.processedFiles.every(file => file.present));
  const stable = structuredClone(context), stableRaw = structuredClone(raw);
  const { GET } = await import('../../src/app/api/admin/gelato-print/route');
  const inspect = async () => {
   const target='https://admin.littleherolabs.com/api/admin/gelato-print?orderId='+context.members[0].child_order_key;
   const response=await GET(new NextRequest(target,{headers:{authorization:'Bearer '+process.env.BACKEND_API_TOKEN}}));
   assert.equal(response.status,200,await response.clone().text()); return await response.json() as GelatoPrintInspection;
  };
  for (const kind of ['corrupt', 'redirect', ...(context.members.length > 1 ? ['swapped'] : []), 'rate', 'provider', 'timeout', 'database']) {
   fault = kind;
   await tick(kind + ' failure held', 'failed', kind === 'rate' ? 'rate_limited' : kind === 'provider' ? 'provider_unavailable' : kind === 'timeout' ? 'timeout' : kind === 'database' ? 'database_failure' : 'invalid_snapshot');
   assert.equal(context.providerOrders[0].status, stable.providerOrders[0].status);
   const failed=await inspect(); assert.equal(failed.polling?.lastResult,'failed'); assert.equal(failed.polling.lastErrorClass,job.last_error_class);
   assert.equal(failed.orders[0].status,stable.providerOrders[0].status);
   fault = ''; await tick(kind + ' recovery by read only', 'success');
  }
  raw.updatedAt = new Date(clock - 60000).toISOString();
  await tick('older snapshot retained for review', 'requires_review'); assert.equal(context.providerOrders[0].action_reason, 'older_provider_snapshot');
  raw = structuredClone(stableRaw); await tick('current snapshot clears stale hold', 'success');
  raw.financialStatus = 'paid'; await tick('same-time synthetic paid observation held', 'requires_review');
  assert.equal(context.providerOrders[0].financial_observation?.status, 'pending');
  assert.equal(context.providerOrders[0].financial_action_reason, 'same_timestamp_financial_change');
  raw.financialStatus = 'pending'; advance('passed'); await tick('later pending clears financial hold', 'success');
  const validGraph=structuredClone(raw);
  for (const mutation of ['foreign-connected-root','wrong-quantity','unknown-status','unsupported-photobook-status']) {
   const beforeFiles=fileReads;
   if(mutation==='foreign-connected-root')raw.connectedOrderIds=['foreign-synthetic-root'];
   if(mutation==='wrong-quantity')raw.items[0].quantity=2;
   if(mutation==='unknown-status')advance('future_provider_state');
   if(mutation==='unsupported-photobook-status')advance('digitizing');
   await tick(mutation,mutation.includes('status')?'requires_review':'failed',mutation.includes('status')?null:'invalid_snapshot');
   if(!mutation.includes('status')) assert.equal(fileReads,beforeFiles,'Identity preflight precedes file loading');
   raw=structuredClone(validGraph); await tick(mutation+' restored','success');
  }
  const prior = structuredClone(raw), beforeRecipientFiles=fileReads; raw.shippingAddress = { ...(raw.shippingAddress as Row), city: 'Wrong city' };
  await tick('changed destination held before files', 'failed', 'invalid_snapshot'); assert.equal(fileReads,beforeRecipientFiles); raw = prior;
  await tick('destination restored read-only', 'success');
  const checkpoint = structuredClone(context), checkpointRaw = structuredClone(raw);
  advance('failed'); await tick('synthetic provider failure visible', 'success');
  assert.equal(gelatoStatusLabel(context.providerOrders[0].status), 'Print failed');
  advance('created'); await tick('terminal failure cannot silently resume', 'requires_review');
  assert.equal(context.providerOrders[0].status, 'failed');
  context = checkpoint; raw = checkpointRaw;
  advance('on_hold'); await tick('synthetic hold visible', 'requires_review');
  assert.equal(gelatoStatusLabel(context.providerOrders[0].status), 'Gelato on hold');
  advance('passed'); await tick('hold resumes prior progress', 'success');
  for (const status of ['in_production', 'printed', 'shipped', 'in_transit', 'delivered']) {
   advance(status);
   if (status === 'shipped') raw.shipment = { shipmentMethodUid: GelatoSavedSnapshotSchema.parse(context.submission.request_snapshot).request.shipmentMethodUid,
    packages: raw.items.map((item, i) => ({ id: 'synthetic-parcel-' + i, orderItemIds: [item.id], trackingCode: 'SYNTHETIC-' + i, trackingUrl: 'https://example.test/synthetic/' + i })) };
   await tick('synthetic ' + status, 'success');
  }
  const deliveredTracking=JSON.stringify(rows.map(row=>row.gelato_tracking));
  const deliveredRaw=structuredClone(raw); advance('created');
  await tick('delivered cannot regress or erase tracking','requires_review');
  assert.equal(JSON.stringify(rows.map(row=>row.gelato_tracking)),deliveredTracking);
  assert.equal(context.providerOrders[0].status,'delivered');
  raw=deliveredRaw; await tick('delivered replay clears conflict','success');
  assert(rows.every(row => row.gelato_status === 'delivered'));
  for (const [i, row] of rows.entries()) {
   const tracking = row.gelato_tracking as Array<{ providerItemIds: string[] }>;
   assert.deepEqual(tracking[0].providerItemIds, [context.members[i].provider_item_id]);
  }
  const beforeAdmin = providerReads;
  const inspection = await inspect();
  assert.equal(inspection.polling?.registered, true);
  assert.equal(providerReads, beforeAdmin, 'Inspection must read saved data only');
  assert.equal(inspection.canCancel, false); assert.equal(inspection.polling?.enabled, false, 'Process controls remain OFF');
  assert.equal(inspection.orders[0].status, 'delivered'); assert.equal(inspection.orders[0].financial?.status, 'pending');
  assert.equal(inspection.monetaryQuote?.shippingOptions[0].price, '5'); assert.equal(inspection.items.length, context.members.length);
  assert(inspection.items.every(item => item.status === 'delivered' && item.active));
  assert(artifactReads > 0 && fileReads > 0);
  assert.equal(process.env.GELATO_SCHEDULED_STATUS_ENABLED, 'false'); assert.equal(process.env.GELATO_NOTIFICATIONS_ENABLED, 'false');
  return { passed: true, scenarios, providerReads, artifactReads, fileReads, customerMessages: 0, providerMutations: 0, liveRequests: 0,
   realPdfByteVerification: true, actualRuntimeAndAdminHandlers: true, databaseTransactions: 'simulated RPC and persistence, not SQL',
   providerProcessingPrintingDelivery: 'simulated; not proof of provider processing, production, billing or delivery' };
 } finally { clearTimeout(watchdog); globalThis.fetch = priorFetch; }
}
