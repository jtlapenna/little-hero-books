import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions, Response as WorkerResponse } from 'miniflare';
import { handleGelatoWebhook, GELATO_WEBHOOK_HEADER, type GelatoWebhookReceipt } from '../src/lib/books/gelato-webhook';
const secret = 'synthetic-webhook-'.padEnd(64, 'w'), cron = 'synthetic-cron-'.padEnd(64, 'c');
const event = { id: 'os_synthetic', event: 'order_status_updated', orderId: 'provider-automatic', orderReferenceId: 'lhb-automatic-test-0', fulfillmentStatus: 'shipped', trackingUrl: 'https://DO-NOT-FETCH.invalid/private', privateContact: 'PRIVATE-CUSTOMER' };
const request = (body: unknown = event, token: string | null = secret) => new Request('https://local/api/webhooks/gelato', { method: 'POST', headers: { 'content-type': 'application/json', ...(token === null ? {} : { [GELATO_WEBHOOK_HEADER]: token }) }, body: JSON.stringify(body) });
const cronRequest = (token: string | null = cron) => new Request('https://local/api/cron/gelato-status', { method: 'POST', headers: token === null ? {} : { authorization: 'Bearer ' + token } });
async function envelopes() {
 let reads = 0; const receipts: GelatoWebhookReceipt[] = [];
 const d = { secret, enabled: false, refresh: async () => { reads++; return { accepted: true }; }, receipt: (r: GelatoWebhookReceipt) => receipts.push(r), budgetMs: 40 };
 for (const token of [null, 'wrong', 'Bearer ' + secret]) assert.equal((await handleGelatoWebhook(request(event, token), d)).status, 401);
 for (const configured of [undefined, '', 'short', ' ' + secret]) assert.equal((await handleGelatoWebhook(request(), { ...d, secret: configured })).status, 401);
 assert.equal((await handleGelatoWebhook(request(), d)).status, 200); assert.equal(reads, 0);
 assert.deepEqual(Object.keys(receipts[0]).sort(), ['disposition', 'event', 'eventSha256', 'orderSha256']); assert(!JSON.stringify(receipts).includes(event.orderId));
 assert.equal((await handleGelatoWebhook(request({ event: 'future', private: secret }), d)).status, 200); assert.equal(receipts.length, 1);
 for (const body of [{}, { ...event, orderId: 'bad/id' }, { ...event, orderReferenceId: '' }, { ...event, id: '' }]) assert.equal((await handleGelatoWebhook(request(body), d)).status, 400);
 assert.equal((await handleGelatoWebhook(new Request('https://local', { method: 'POST', headers: { [GELATO_WEBHOOK_HEADER]: secret }, body: '{}' }), d)).status, 415);
 assert.equal((await handleGelatoWebhook(request({ ...event, extra: 'x'.repeat(70_000) }), d)).status, 413);
 const bytes = new TextEncoder().encode(JSON.stringify({ ...event, extra: 'é'.repeat(40_000) }));
 const streamed = new Request('https://local', { method: 'POST', headers: { [GELATO_WEBHOOK_HEADER]: secret, 'content-type': 'application/json' }, body: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }), duplex: 'half' } as RequestInit);
 assert.equal((await handleGelatoWebhook(streamed, d)).status, 413);
 let canceled = false;
 const stalled = new Request('https://local', { method: 'POST', headers: { [GELATO_WEBHOOK_HEADER]: secret, 'content-type': 'application/json' }, body: new ReadableStream({ pull: () => new Promise(() => {}), cancel() { canceled = true; } }), duplex: 'half' } as RequestInit);
 const at = Date.now(); assert.equal((await handleGelatoWebhook(stalled, d)).status, 408); assert(Date.now() - at < 500); assert(canceled);
 assert.equal((await handleGelatoWebhook(request(), { ...d, enabled: true, refresh: async signal => { assert.deepEqual(Object.keys(signal).sort(), ['event', 'id', 'orderId', 'orderReferenceId']); throw Error('PRIVATE'); } })).status, 503);
 assert.equal((await handleGelatoWebhook(request(), { ...d, enabled: true, refresh: () => new Promise(() => {}) })).status, 503);
}
const bindings = { BACKEND_API_TOKEN: 'synthetic-webhook-printer-signing-authority-only-12345', SUPABASE_URL: 'https://synthetic-webhook.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-only', GELATO_API_KEY: 'explicit-test-key', GELATO_STATUS_API_KEY: 'separate-status-test-key', GELATO_SCHEDULED_STATUS_ENABLED: 'false', CLOUDFLARE_ACCOUNT_ID: 'synthetic-webhook', CLOUDFLARE_R2_ACCESS_KEY_ID: 'synthetic-access', CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'synthetic-secret', GELATO_WEBHOOK_SECRET: secret, CRON_SECRET: cron, GELATO_STATUS_RELAY_ENABLED: 'false', GELATO_STATUS_POLLING_ENABLED: 'false', GELATO_NOTIFICATIONS_ENABLED: 'true' };
async function main() {
 const previous = globalThis.fetch, originalInfo = console.info; const logged: string[] = []; console.info = (...values) => { logged.push(values.join(' ')); }; globalThis.fetch = async () => { throw Error('No live network'); };
 try {
  await envelopes(); Object.assign(process.env, bindings);
  const { fixture } = await import('./test-gelato-engineering-automation');
  const { POST: webhook } = await import('../src/app/api/webhooks/gelato/route');
  const { POST: scheduled } = await import('../src/app/api/cron/gelato-status/route');
  const { refreshGelatoSubmission } = await import('../src/lib/books/gelato-lifecycle');
  const { gelatoLifecycleRuntime } = await import('../src/lib/books/gelato-lifecycle-runtime');
  const { getGelatoOrder } = await import('../src/lib/books/gelato-api-client');
  let f = await fixture('standard', 1, 0, true, 'ORDINARY-SYNTHETIC');
  let leaseAvailable = false, cronMode = false;
  const scheduledRequest = async () => { leaseAvailable = true; cronMode = true; try { return await scheduled(cronRequest()); } finally { cronMode = false; } };
  let calls = 0, providerReads = 0, artifactReads = 0, storedReads = 0, applies = 0, holds = 0;
  let streamDelay = 0, byteReads = 0;
  const byteResponse = (bytes: Uint8Array) => {
   let offset = 0, canceled = false;
   return new Response(new ReadableStream({ async pull(controller) {
    if (streamDelay) await new Promise(resolve => setTimeout(resolve, streamDelay));
    if (canceled) return;
    if (offset === bytes.length) { controller.close(); return; }
    const chunk = bytes.slice(offset, offset + 65536); offset += chunk.length; byteReads += chunk.length; controller.enqueue(chunk);
   }, cancel() { canceled = true; } }), { headers: { 'content-length': String(bytes.length) } });
  };
  let positive = false, failed = false, wrongFile = false, stale = false, cas = false, workerTransport = false, redirectProvider = false;
  function ordinary() {
   Object.assign(f.context.providerOrders[0], { order_type: 'order', status: 'created', snapshot: { ...f.raw(), orderType: 'order', fulfillmentStatus: 'created', financialStatus: 'pending' } });
   f.rows.clear(); f.context.members.forEach(m => f.rows.set(m.child_order_key, { id: m.child_order_id, orderId: m.child_order_key, root_order_id: 'ORDINARY-SYNTHETIC', print_provider: 'gelato', print_submission_id: f.context.submission.id, book_specs: { testMode: false }, customer_email: 'ordinary@example.test' }));
  }
  const provider = () => ({ ...f.raw(), orderType: 'order', financialStatus: 'pending', fulfillmentStatus: 'in_production', updatedAt: stale ? '2026-10-16T11:00:00Z' : '2026-10-16T12:02:00Z', items: f.raw().items.map(i => ({ ...i, fulfillmentStatus: 'in_production' })) });
  const transport = async (r: Request): Promise<Response> => {
   calls++; const u = new URL(r.url), c = f.context, table = u.pathname.split('/').pop();
   if (u.origin === bindings.SUPABASE_URL) {
    assert.equal(r.headers.get('apikey'), bindings.SUPABASE_SERVICE_ROLE_KEY);
    if (u.pathname.includes('/rpc/')) {
     const p = await r.json() as Record<string, unknown>;
     if (table === 'claim_gelato_scheduled_status') { assert.match(String(p.p_account_key_sha256), /^[a-f0-9]{64}$/); if (!leaseAvailable) return Response.json([]); leaseAvailable = false; return Response.json([{ submission_id: c.submission.id, lease_token: '99999999-9999-4999-8999-999999999999' }]); }
     if (table === 'finish_gelato_scheduled_status') { assert.equal(p.p_poll_token, '99999999-9999-4999-8999-999999999999'); return Response.json(null); }
     assert.equal(p.p_submission_id, c.submission.id);
     if (table === 'hold_gelato_provider_refresh' || table === 'hold_gelato_scheduled_refresh') { holds++; return Response.json(null); }
     assert(['apply_gelato_provider_snapshots', 'apply_gelato_scheduled_snapshots'].includes(String(table)), 'No conversion/create/cancel/delivery');
     if (table === 'apply_gelato_scheduled_snapshots') assert.equal(p.p_poll_token, '99999999-9999-4999-8999-999999999999');
     if (cas) return Response.json({ message: 'Synthetic CAS conflict' }, { status: 409 });
     assert.deepEqual(p.p_notifications, []);
     if (!positive) assert.deepEqual(p.p_notification_holds, []); else assert((p.p_notification_holds as unknown[]).length > 0);
     const results = p.p_results as Array<{ status: string; actionReason: string | null }>;
     if (!stale) { assert.equal(results[0].status, 'in_production'); assert.equal(results[0].actionReason, null); } else assert.equal(results[0].actionReason, 'older_provider_snapshot');
     applies++; return Response.json(null);
    }
    assert.equal(r.method, 'GET');
    if (table === 'orders') { assert(positive, 'Suppressed route must not load customer rows'); const key = u.searchParams.get('orderId')?.slice(3); const rows = key ? [f.rows.get(key)].filter(Boolean) : [...f.rows.values()]; return Response.json(r.headers.get('accept')?.includes('vnd.pgrst.object') ? rows[0] : rows); }
    if (table === 'print_provider_submission_orders' && u.searchParams.has('provider_order_id')) { assert.equal(u.searchParams.get('provider'), 'eq.gelato'); return Response.json(u.searchParams.get('provider_order_id') === 'eq.' + f.a.provider_root_id ? { submission_id: c.submission.id } : null); }
    let rows: unknown[];
    if (table === 'print_provider_submissions') rows = [c.submission];
    else if (table === 'print_provider_submission_items') rows = c.members;
    else if (table === 'print_provider_submission_orders') rows = c.providerOrders;
    else { assert.equal(table, 'print_provider_submission_notifications'); assert(!u.searchParams.has('delivery_state'), 'No pending customer delivery selection'); rows = []; }
    return Response.json(r.headers.get('accept')?.includes('vnd.pgrst.object') ? rows[0] : rows);
   }
   assert.equal(r.method, 'GET', 'No provider/storage mutation');
   if (u.hostname === 'order.gelatoapis.com') { providerReads++; assert.equal(r.headers.get('x-api-key'), cronMode ? bindings.GELATO_STATUS_API_KEY : bindings.GELATO_API_KEY); if (!workerTransport) assert.equal(r.redirect, 'manual'); assert.equal(u.pathname, '/v4/orders/' + f.a.provider_root_id); return redirectProvider ? new Response(null, { status: 302, headers: { Location: 'https://DO-NOT-FETCH.invalid/redirect' } }) : failed ? new Response(null, { status: 503 }) : Response.json(provider()); }
   if (u.hostname === 'little-hero-orders.synthetic-webhook.r2.cloudflarestorage.com') { artifactReads++; assert(r.headers.get('authorization')?.startsWith('AWS4-HMAC-SHA256')); return byteResponse(Uint8Array.from(f.blobs.get(decodeURIComponent(u.pathname.slice(1)))!)); }
   assert.equal(u.hostname, 'gelato-api-live.s3.eu-west-1.amazonaws.com', 'No event URL/customer service'); storedReads++;
   const i = Number(u.pathname.match(/automatic-fixture-(\d+)\.pdf/)?.[1]); assert(Number.isInteger(i));
   return byteResponse(wrongFile ? new TextEncoder().encode('wrong PDF') : Uint8Array.from(f.blobs.get(c.members[i].artifact_key!)!));
  };
  globalThis.fetch = (input, init) => transport(new Request(input, init));
  const measurements: unknown[] = [], fixtures: Array<{ role: string; bytes: number; sha256: string }> = [];
  const fixtureDirectory = process.env.GELATO_BENCH_PDF_DIR;
  const setBenchmarkCase = async (format: 'standard' | 'amazon', count: number) => {
   assert(fixtureDirectory && process.env.GELATO_BENCH_OUTPUT, 'Both benchmark paths are required');
   f = await fixture(format, count, 0, true, 'ORDINARY-SYNTHETIC'); ordinary();
   const receipt = JSON.parse(await fs.readFile(resolve(fixtureDirectory, 'pdf-receipts.json'), 'utf8'));
   const { createHash } = await import('node:crypto');
   for (let index = 0; index < count; index++) {
    const role = count === 2 ? ['SIB-A', 'SIB-B'][index] : format === 'standard' ? 'WEB-A' : 'AMZ-A';
    const bytes = await fs.readFile(resolve(fixtureDirectory, role + '.pdf'));
    const hash = createHash('sha256').update(bytes).digest('hex');
    const recorded = receipt.receipts.find((entry: { role: string }) => entry.role === role);
    assert(recorded && recorded.sha256 === hash && recorded.bytes === bytes.length && recorded.uploadedPages === 35 && recorded.apiPageCount === 32 && recorded.physicalInnerPages === 32);
    f.blobs.set(f.context.members[index].artifact_key!, bytes);
    if (!fixtures.some(entry => entry.role === role)) fixtures.push({ role, bytes: bytes.length, sha256: hash });
   }
  };
  const measure = async (runtime: string, format: string, count: number, run: () => Promise<{ status: number; json(): Promise<unknown> }>, expectedErrors = 0) => {
   const start = performance.now(), cpu = process.cpuUsage(), before = byteReads, beforeProvider = providerReads, beforeApplies = applies;
   const response = await run(); assert.equal(response.status, expectedErrors ? 503 : 200);
   const summary = await response.json() as { checked: number; refreshed: number; errors: number; delivered: number; customerMessages: boolean };
   assert.equal(summary.refreshed, expectedErrors ? 0 : 1);
   const used = process.cpuUsage(cpu), elapsedMs = performance.now() - start;
   assert.equal(summary.checked, 1); assert.equal(summary.delivered, 0); assert.equal(summary.customerMessages, false);
   assert.equal(summary.errors, expectedErrors, JSON.stringify(summary));
   assert.equal(providerReads - beforeProvider, 1);
   const expectedBytes = [...f.blobs.values()].reduce((sum, bytes) => sum + bytes.length, 0) * 2;
   if (!expectedErrors) assert.equal(byteReads - before, expectedBytes, 'Every original and provider copy is verified');
   else assert(byteReads - before < expectedBytes, 'Deadline must interrupt the body');
   assert.equal(applies - beforeApplies, expectedErrors ? 0 : 1);
   measurements.push({ runtime, format, children: count, chunkBytes: 65536, simulatedChunkDelayMs: streamDelay, elapsedMs: Math.round(elapsedMs * 100) / 100, processCpuMs: (used.user + used.system) / 1000, processRssBytes: process.memoryUsage().rss, downloadedBytes: byteReads - before, providerReads: providerReads - beforeProvider, summary });
  };
  if (fixtureDirectory) {
   process.env.GELATO_SCHEDULED_STATUS_ENABLED = 'true';
   for (const [format, count] of [['standard', 1], ['amazon', 1], ['amazon', 2]] as const) {
    for (const delay of [0, 10]) {
     streamDelay = delay;
     for (let repeat = 0; repeat < (delay ? 1 : 3); repeat++) {
      await setBenchmarkCase(format, count); await measure('node-actual-route-streamed', format, count, scheduledRequest);
     }
    }
   }
   streamDelay = 100; await setBenchmarkCase('amazon', 2);
   await measure('node-actual-route-streamed-deadline', 'amazon', 2, scheduledRequest, 1);
   assert((measurements.at(-1) as { elapsedMs: number }).elapsedMs < 4000, 'Candidate timeout must remain bounded');
   streamDelay = 0; process.env.GELATO_SCHEDULED_STATUS_ENABLED = 'false';
  }
  for (const [format, count] of [['standard', 1], ['amazon', 1], ['amazon', 2]] as const) {
   f = await fixture(format, count, 0, true, 'ORDINARY-SYNTHETIC'); ordinary(); const before = calls;
   assert.equal((await webhook(request())).status, 200); assert.equal((await scheduledRequest()).status, 200); assert.equal(calls, before, 'OFF zero I/O');
   assert.equal((await webhook(request(event, null))).status, 401); assert.equal((await scheduled(cronRequest(null))).status, 401);
   process.env.GELATO_STATUS_RELAY_ENABLED = 'true'; process.env.GELATO_SCHEDULED_STATUS_ENABLED = 'true'; process.env.GELATO_STATUS_POLLING_ENABLED = 'false';
   for (const [kind, status] of [['order_status_updated', 'shipped'], ['order_item_status_updated', 'failed'], ['order_item_tracking_code_updated', 'delivered'], ['order_delivery_estimate_updated', 'created'], ['order_status_updated', 'created']]) {
    const result = await webhook(request({ ...event, event: kind, fulfillmentStatus: status, created: '2000-01-01T00:00:00Z' })); const text = await result.text();
    assert.equal(result.status, 200, text); assert.equal(JSON.parse(text).disposition, 'refreshed'); assert(!text.includes('PRIVATE') && !text.includes(event.orderId));
   }
   const result = await scheduledRequest(); assert.equal(result.status, 200); const summary = await result.json(); assert.equal(summary.refreshed, 1); assert.equal(summary.delivered, 0); assert.equal(summary.customerMessages, false);
   const beforeUnknown = providerReads;
   assert.equal((await webhook(request({ ...event, orderId: 'unmapped' }))).status, 200); assert.equal((await webhook(request({ ...event, orderReferenceId: 'foreign' }))).status, 200); assert.equal(providerReads, beforeUnknown);
   stale = true; assert.equal((await (await webhook(request())).json()).disposition, 'requires_review'); const review = await (await scheduledRequest()).json(); assert.equal(review.needsAttention, 1); assert.equal(review.requiresReview, true); stale = false;
   cas = true; assert.equal((await webhook(request())).status, 503); assert.equal((await scheduledRequest()).status, 503); cas = false; assert.equal((await webhook(request())).status, 200);
   failed = true; assert.equal((await webhook(request())).status, 503); failed = false;
   wrongFile = true; assert.equal((await webhook(request())).status, 503); wrongFile = false;
   process.env.GELATO_STATUS_RELAY_ENABLED = 'false'; process.env.GELATO_SCHEDULED_STATUS_ENABLED = 'false'; process.env.GELATO_STATUS_POLLING_ENABLED = 'true';
  }
  positive = true; await refreshGelatoSubmission(f.context.submission.id, { ...gelatoLifecycleRuntime(), get: id => getGelatoOrder(id) }); positive = false;
  assert(providerReads && artifactReads && storedReads && applies && holds); assert.equal(f.stats().patches, 0);
  const entry = `import {POST as webhook} from ${JSON.stringify(resolve('src/app/api/webhooks/gelato/route.ts'))};import {POST as cron} from ${JSON.stringify(resolve('src/app/api/cron/gelato-status/route.ts'))};export default {fetch(r){return new URL(r.url).pathname.includes('/webhooks/')?webhook(r):cron(r)}};`;
  const config = await fs.readFile('wrangler.toml', 'utf8'), date = config.match(/compatibility_date\s*=\s*"([^"]+)"/)?.[1], flags = [...(config.match(/compatibility_flags\s*=\s*\[([^\]]+)\]/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(m => m[1]); assert(date && flags.length);
  const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'neutral', mainFields: ['browser','module','main'], external: ['node:*'], logLevel: 'silent' });
  // Focused generic route bundle requires path globals; not the full deployed OpenNext adapter.
  const script = 'var __dirname="/synthetic";var __filename="/synthetic/worker.js";\n' + bundle.outputFiles[0].text;
  const send = async (w: Miniflare, r: Request) => { cronMode = r.url.includes('/cron/'); leaseAvailable = cronMode; try { return await w.dispatchFetch(r.url, { method: r.method, headers: [...r.headers], body: await r.text() }); } finally { cronMode = false; } };
  for (let cold = 0; cold < 3; cold++) {
   let outbound = 0;
   const w: Miniflare = new Miniflare(convertV4MiniflareOptions({ modules: true, script, compatibilityDate: date, compatibilityFlags: flags, bindings: { GELATO_WEBHOOK_SECRET: secret, CRON_SECRET: cron, GELATO_STATUS_RELAY_ENABLED: 'false', GELATO_STATUS_POLLING_ENABLED: 'false' }, outboundService: async () => { outbound++; throw Error('OFF must not access network'); } }));
   try { assert.equal((await send(w, request())).status, 200); assert.equal((await send(w, cronRequest())).status, 200); assert.equal((await send(w, request(event, null))).status, 401); assert.equal(outbound, 0); } finally { await w.dispose(); }
  }
  workerTransport = true;
  const w: Miniflare = new Miniflare(convertV4MiniflareOptions({ modules: true, script, compatibilityDate: date, compatibilityFlags: flags, bindings: { ...bindings, GELATO_STATUS_RELAY_ENABLED: 'true', GELATO_STATUS_POLLING_ENABLED: 'false', GELATO_SCHEDULED_STATUS_ENABLED: 'true' }, outboundService: async r => { const response = await transport(new Request(r.url, { method: r.method, redirect: r.redirect, headers: [...r.headers], ...(r.method === 'GET' ? {} : { body: await r.text() }) })); return new WorkerResponse(await response.arrayBuffer(), { status: response.status, headers: [...response.headers] }); } }));
  try { assert.equal((await send(w, request())).status, 200); const polled = await send(w, cronRequest()); assert.equal(polled.status, 200); assert.equal((await polled.json() as { delivered: number }).delivered, 0); redirectProvider = true; assert.equal((await send(w, request())).status, 503); redirectProvider = false; } finally { await w.dispose(); }
  if (fixtureDirectory) {
   const benchmarkWorker = new Miniflare(convertV4MiniflareOptions({ modules: true, script, compatibilityDate: date, compatibilityFlags: flags, bindings: { ...bindings, GELATO_STATUS_RELAY_ENABLED: 'false', GELATO_SCHEDULED_STATUS_ENABLED: 'true' }, outboundService: async r => {
    const response = await transport(new Request(r.url, { method: r.method, headers: [...r.headers], ...(r.method === 'GET' ? {} : { body: await r.text() }) }));
    return new WorkerResponse(await response.arrayBuffer(), { status: response.status, headers: [...response.headers] });
   } }));
   try {
    for (const [format, count] of [['standard', 1], ['amazon', 1], ['amazon', 2]] as const) {
     await setBenchmarkCase(format, count); await measure('focused-worker-buffered-bridge', format, count, () => send(benchmarkWorker, cronRequest()));
    }
   } finally { await benchmarkWorker.dispose(); }
   assert.equal(f.stats().patches, 0);
   await fs.writeFile(process.env.GELATO_BENCH_OUTPUT!, JSON.stringify({ schemaVersion: 1, fixtures, measurements, liveRequests: 0, constraints: ['Synthetic transport only', 'Focused Worker is not complete OpenNext deployment', 'Worker bridge buffers bodies; no real network latency or streaming measurement', 'CPU/RSS are whole local Node process, not billed Worker CPU or peak memory', 'Sparse labelled raster PDFs do not represent all final artwork sizes', 'Local process flags only; live controls were not accessed'] }, null, 2) + '\n');
  }
  console.log('PASS: actual webhook + dedicated scheduler; ordinary website/Amazon/siblings; authoritative PDF bytes; stale/CAS/retry/failure paths; zero customer intents/delivery with notification flag true; cold OFF Workers zero I/O; enabled Worker synthetic only.');
  assert(logged.length > 0 && !logged.join('').includes('PRIVATE-CUSTOMER') && !logged.join('').includes(event.orderId));
 } finally { globalThis.fetch = previous; console.info = originalInfo; }
}
const watchdog = setTimeout(() => { throw Error('Webhook regression stalled'); }, process.env.GELATO_BENCH_PDF_DIR ? 120_000 : 40_000);
void main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
