import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { archive, amazonV3 } from './test-customization-zip';

// Offline proof for the rest of the message-safety guard: (1) the admin CSV upload sets the marker only
// from the explicit `overnight_test=true` form field and never drops it on re-upload, (2) W0/intake
// rewrites of product_info keep it, (3) the Lulu webhook, the router's Lulu poll helper and the Gelato
// intent builder produce no message for a marked order and still do for unmarked ones.
// Supabase is an in-memory PostgREST fake; Resend/Amazon hosts are counted, never contacted.

Object.assign(process.env, {
  SUPABASE_URL: 'https://guard2-db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-guard2-service', BACKEND_API_TOKEN: 'synthetic-guard2-machine',
  N8N_W0_WEBHOOK_URL: 'https://guard2-w0.example.test/hook', RESEND_API_KEY: 'synthetic-guard2-resend', D2C_EMAIL_ENABLED: 'true',
  LULU_CLIENT_SECRET: 'synthetic-guard2-lulu', AMAZON_SP_API_CLIENT_ID: 'synthetic-client', AMAZON_SP_API_CLIENT_SECRET: 'synthetic-secret',
  AMAZON_SP_API_REFRESH_TOKEN: 'synthetic-refresh', AMAZON_SP_API_SELLER_ID: 'SYNTHETICSELLER', AWS_ACCESS_KEY_ID: 'synthetic-aws', AWS_SECRET_ACCESS_KEY: 'synthetic-aws-secret',
});
delete process.env.AMAZON_SANDBOX_MODE;

type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};
const writes: Array<{ table: string; method: string; body: any }> = [];
let resendCalls = 0, amazonCalls = 0, w0Calls = 0;
const original = globalThis.fetch;
const logs: string[] = [];
const keep = { log: console.log, warn: console.warn, error: console.error, info: console.info };
const quiet = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
const AMAZON_ID = '111-2222222-3333333';

function matches(row: Row, key: string, filter: string): boolean {
  if (['select', 'limit', 'order', 'offset'].includes(key)) return true;
  if (filter.startsWith('eq.')) return String(row[key]) === filter.slice(3);
  if (filter.startsWith('is.null')) return row[key] == null;
  if (filter.startsWith('in.')) return filter.slice(4, -1).split(',').includes(String(row[key]));
  if (filter.startsWith('ilike.')) return String(row[key] ?? '').toLowerCase().startsWith(filter.slice(6).replace(/%$/, '').toLowerCase());
  return true;
}
globalThis.fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init), url = new URL(request.url);
  if (url.host === 'api.resend.com') { resendCalls++; return Response.json({ id: 'synthetic-message' }); }
  if (url.host.endsWith('amazon.com')) { amazonCalls++; return Response.json({ error: 'synthetic_blocked' }, { status: 401 }); }
  if (url.origin === 'https://download.example.test') return new Response(new Uint8Array(archive([['customization.json', Buffer.from(JSON.stringify(amazonV3))]])));
  if (url.origin === 'https://guard2-w0.example.test') { w0Calls++; return Response.json({ ok: true }); }
  assert.equal(url.origin, 'https://guard2-db.example.test', `Unexpected host ${url.host}`);
  const table = url.pathname.replace('/rest/v1/', '');
  const rows = (tables[table] ??= []);
  const selected = rows.filter(row => [...url.searchParams].every(([key, filter]) => matches(row, key, filter)));
  const single = request.headers.get('accept')?.includes('vnd.pgrst.object');
  const respond = (data: Row[], status = 200) => Response.json(single ? data[0] ?? null : data, { status });
  if (request.method === 'GET' || request.method === 'HEAD') return respond(selected);
  if (request.method === 'PATCH') { const patch = await request.json(); writes.push({ table, method: 'PATCH', body: patch }); selected.forEach(row => Object.assign(row, patch)); return respond(selected); }
  if (request.method === 'POST') {
    const body = await request.json(); writes.push({ table, method: 'POST', body });
    const items = (Array.isArray(body) ? body : [body]).map((item: Row) => ({ id: rows.length + 1, ...item })); rows.push(...items); return respond(items, 201);
  }
  return respond([]);
};
const reset = () => { for (const key of Object.keys(tables)) delete tables[key]; writes.length = 0; resendCalls = 0; amazonCalls = 0; w0Calls = 0; };
let checks = 0;
const ok = (label: string) => { checks++; keep.log(`  ok - ${label}`); };

async function main() {
  console.log = quiet; console.warn = quiet; console.error = quiet; console.info = quiet;

  // 1. CSV upload: explicit opt-in only; marker survives an update and a re-upload without the field.
  const { POST } = await import('../src/app/api/admin/amazon-orders/upload-csv/route');
  const csv = 'amazon-order-id,ship-address-1,ship-city,ship-state,ship-postal-code,customized-url,recipient-name,buyer-email\nGUARD-CSV-1,1 Test Lane,Test City,CA,00000,https://download.example.test/synthetic.zip,Synthetic Parent,parent@example.test\n';
  const upload = async (field?: string) => {
    const form = new FormData(); form.set('file', new Blob([csv], { type: 'text/csv' }), 'synthetic.csv');
    if (field !== undefined) form.set('overnight_test', field);
    const response = await POST(new NextRequest('https://admin.example.test/api/admin/amazon-orders/upload-csv', { method: 'POST',
      headers: { authorization: 'Bearer synthetic-guard2-machine' }, body: form }));
    assert.equal(response.status, 200); return response.json();
  };
  const stored = () => (tables.orders ?? []).find(row => row.orderId === 'GUARD-CSV-1')?.product_info as Row | undefined;
  for (const [field, expectMarked] of [['true', true], [undefined, false], ['false', false], ['1', false], ['TRUE', false], ['', false]] as const) {
    reset(); const body = await upload(field); assert.equal(body.summary.created, 1);
    const inserted = writes.find(write => write.table === 'orders' && write.method === 'POST')!.body;
    assert.equal(inserted.product_info._overnight_test === true, expectMarked, `field=${String(field)} on create`);
    assert.equal(Object.hasOwn(inserted.product_info, '_overnight_test'), expectMarked, `field=${String(field)} must not write a false marker`);
    assert.equal(stored()?._overnight_test === true, expectMarked);
  }
  reset(); await upload('true'); assert.equal(stored()?._overnight_test, true);
  const row = tables.orders.find(r => r.orderId === 'GUARD-CSV-1')!; row.updated_at = '2026-01-01T00:00:00.000Z'; row.id = 7;
  await upload(undefined); // re-upload without the field never un-marks
  assert.equal(stored()?._overnight_test, true, 're-upload without the field must keep the marker');
  reset(); tables.orders = [{ id: 7, orderId: 'GUARD-CSV-1', platform: 'amazon', updated_at: '2026-01-01T00:00:00.000Z', product_info: {}, customer_email: 'parent@example.test',
    character_specs: { childName: 'Synthetic Child', age: '5', skinTone: 'light', hairColor: 'brown', hairStyle: 'short-straight', favoriteColor: 'blue', animalGuide: 'dog', pronouns: 'they/them' } }];
  await upload('true'); assert.equal(stored()?._overnight_test, true, 'update path sets the marker when opted in');
  ok('CSV upload: marker only from overnight_test=true on create and update; re-upload keeps it; other values write nothing');

  // 2. W0/intake rewrite of product_info keeps the marker (real upsert helper).
  const { upsertOrderByPerBookId } = await import('../src/lib/supabase-client');
  for (const isMarked of [true, false]) {
    reset(); tables.orders = [{ id: 11, orderId: 'GUARD-W0', execution_status: 'pending_w0', character_hash: 'h', product_info: isMarked ? { _overnight_test: true, bookId: 'b' } : { bookId: 'b' } }];
    const result = await upsertOrderByPerBookId({ orderId: 'GUARD-W0', character_hash: 'h', execution_status: 'ready_for_processing', product_info: { quantity: 1 } }, { preserveFrozenIntake: true });
    assert.equal(result.error, null);
    const patch = writes.find(write => write.table === 'orders' && write.method === 'PATCH')!.body;
    assert.deepEqual(patch.product_info, isMarked ? { quantity: 1, _overnight_test: true } : { quantity: 1 });
  }
  ok('W0 upsert rewrite: marker carried onto the replacement product_info; unmarked payload unchanged');

  // 3. Lulu webhook (real handler, signed body).
  const { POST: luluPost } = await import('../src/app/api/webhooks/lulu/status/route');
  const signed = async (payload: unknown) => { const raw = JSON.stringify(payload);
    return luluPost(new NextRequest('https://api.example.test/api/webhooks/lulu/status', { method: 'POST', body: raw,
      headers: { 'lulu-hmac-sha256': createHmac('sha256', process.env.LULU_CLIENT_SECRET!).update(raw).digest('hex') } })); };
  const sentLogs = () => (tables.notification_logs ?? []).filter(row => row.status === 'sent' || row.notification_type === 'amazon_confirm_shipment');
  for (const platform of ['d2c', 'amazon']) for (const isMarked of [true, false]) {
    reset(); tables.orders = [{ id: 21, orderId: 'GUARD-LULU', platform, amazon_order_id: platform === 'amazon' ? AMAZON_ID : null, customer_email: 'parent@example.test',
      lulu_job_id: 'job-9', lulu_status: 'IN_PRODUCTION', character_specs: { childName: 'Synthetic Child' }, product_info: isMarked ? { _overnight_test: true } : {} }];
    const response = await signed({ print_job_id: 'job-9', name: 'SHIPPED', line_items: [{ messages: { tracking_id: '1Z', tracking_urls: ['https://t.example.test/1Z'], carrier_name: 'UPS' } }] });
    assert.equal(response.status, 200);
    if (isMarked) { assert.equal(resendCalls + amazonCalls, 0, `${platform} marked`); assert.equal(sentLogs().length, 0, 'producer must not even record a confirm-shipment attempt'); }
    else assert.ok(resendCalls + amazonCalls >= 1, `${platform} unmarked must reach a transport`);
    assert.ok(writes.some(write => write.table === 'orders' && write.method === 'PATCH'), 'status update is still recorded');
  }
  ok('Lulu webhook: marked -> status still recorded, no transport, no confirm-shipment attempt; unmarked -> transport reached');

  // 4. Router Lulu-poll notices (real helper extracted from the cron router).
  const { sendLuluPollShipmentNotices } = await import('../src/lib/notifications/lulu-poll-notifications');
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const platform of ['d2c', 'amazon']) for (const isMarked of [true, false]) {
    reset(); const o = { id: 31, orderId: 'GUARD-POLL', platform, amazon_order_id: platform === 'amazon' ? AMAZON_ID : null, customer_email: 'parent@example.test',
      character_specs: { childName: 'Synthetic Child' }, product_info: isMarked ? { _overnight_test: true } : {} };
    tables.orders = [o];
    const result = await sendLuluPollShipmentNotices({ supabase: db, order: o, statusName: 'SHIPPED', trackingNumber: '1Z', trackingUrl: null, carrier: 'UPS', nowIso: new Date().toISOString() });
    if (isMarked) { assert.equal(result.skipped, 'overnight_test_order'); assert.equal(resendCalls + amazonCalls, 0); assert.equal((tables.notification_logs ?? []).length, 0); }
    else assert.ok(resendCalls + amazonCalls >= 1, `${platform} unmarked must reach a transport`);
  }
  ok('router Lulu poll notices: marked -> skipped, no transport, no log; unmarked -> transport reached');

  // 5. Gelato notification intents: marked cohort produces no intents.
  const { buildGelatoNotificationIntents } = await import('../src/lib/books/gelato-notifications');
  const stubContext: any = { submission: { root_order_id: 'GUARD-GELATO', request_snapshot: {} }, members: [] };
  const intents = buildGelatoNotificationIntents(stubContext, [] as any, [{ orderId: 'GUARD-GELATO', product_info: { _overnight_test: true } }], 'Synthetic <a@example.test>');
  assert.deepEqual(intents, { intents: [], holds: [] });
  assert.throws(() => buildGelatoNotificationIntents(stubContext, [] as any, [{ orderId: 'GUARD-GELATO', product_info: {} }], 'Synthetic <a@example.test>'), 'unmarked cohort proceeds past the guard');
  ok('Gelato intents: marked cohort -> no intents; unmarked proceeds past the guard (full unmarked behavior covered by test-gelato-notifications)');
  const { stripOvernightTestMarker } = await import('../src/lib/messaging/test-order-guard');
  assert.deepEqual(stripOvernightTestMarker({ bookId: 'b', _overnight_test: true }), { bookId: 'b' });
  const clean = { bookId: 'b' };
  assert.equal(stripOvernightTestMarker(clean), clean);
  const route = (await import('node:fs')).readFileSync(new URL('../src/app/api/checkout/create/route.ts', import.meta.url), 'utf8');
  assert.match(route, /requestedProductInfo = stripOvernightTestMarker\(selection\.productInfo\)/, 'public checkout strips the marker');
  ok('public checkout cannot set the marker (stripped from caller-supplied product_info)');
}

main().then(() => keep.log(`PASS test-message-safety-guard-persistence: ${checks} groups; zero live requests`), error => {
  console.log = keep.log; console.warn = keep.warn; console.error = keep.error;
  console.error(error); keep.error(logs.slice(-15).join('\n')); process.exitCode = 1;
}).finally(() => { globalThis.fetch = original; Object.assign(console, keep); });
