import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

// Offline proof that an order carrying product_info._overnight_test === true never produces a
// customer/buyer message on any backend path, and that unmarked orders still reach the sender.
// Every transport is intercepted: Supabase is an in-memory PostgREST fake, Resend and Amazon hosts
// are counted (never contacted). Any other host fails the test.

Object.assign(process.env, {
  SUPABASE_URL: 'https://guard-db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-guard-service',
  RESEND_API_KEY: 'synthetic-guard-resend', D2C_EMAIL_ENABLED: 'true', AMAZON_PREVIEW_NOTIFICATIONS_ENABLED: 'true',
  AMAZON_PRINT_SUBMITTED_NOTIFICATIONS_ENABLED: 'true', CUSTOMER_SITE_URL: 'https://site.example.test',
  AMAZON_SP_API_CLIENT_ID: 'synthetic-client', AMAZON_SP_API_CLIENT_SECRET: 'synthetic-secret',
  AMAZON_SP_API_REFRESH_TOKEN: 'synthetic-refresh', AMAZON_SP_API_SELLER_ID: 'SYNTHETICSELLER',
  AWS_ACCESS_KEY_ID: 'synthetic-aws', AWS_SECRET_ACCESS_KEY: 'synthetic-aws-secret',
});
delete process.env.AMAZON_SANDBOX_MODE;

type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};
let resendCalls = 0, amazonCalls = 0;
const original = globalThis.fetch;
const logs: string[] = [];
const keep = { log: console.log, warn: console.warn, error: console.error, info: console.info };
const quiet = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };

function matches(row: Row, key: string, filter: string): boolean {
  if (['select', 'limit', 'order', 'offset'].includes(key)) return true;
  if (filter.startsWith('eq.')) return String(row[key]) === filter.slice(3);
  if (filter.startsWith('is.null')) return row[key] == null;
  if (filter.startsWith('not.is.null')) return row[key] != null;
  if (filter.startsWith('in.')) return filter.slice(4, -1).split(',').includes(String(row[key]));
  if (filter.startsWith('ilike.')) return String(row[key] ?? '').toLowerCase().startsWith(filter.slice(6).replace(/%$/, '').toLowerCase());
  return true;
}

globalThis.fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init), url = new URL(request.url);
  if (url.host === 'api.resend.com') { resendCalls++; return Response.json({ id: 'synthetic-message' }); }
  if (url.host.endsWith('amazon.com')) { amazonCalls++; return Response.json({ error: 'synthetic_blocked' }, { status: 401 }); }
  assert.equal(url.origin, 'https://guard-db.example.test', `Unexpected host ${url.host}`);
  const table = url.pathname.replace('/rest/v1/', '');
  const rows = (tables[table] ??= []);
  const selected = rows.filter(row => [...url.searchParams].every(([key, filter]) => matches(row, key, filter)));
  const single = request.headers.get('accept')?.includes('vnd.pgrst.object');
  const respond = (data: Row[], status = 200) => Response.json(single ? data[0] ?? null : data, { status });
  if (request.method === 'GET' || request.method === 'HEAD') return respond(selected);
  if (request.method === 'PATCH') { const patch = await request.json(); selected.forEach(row => Object.assign(row, patch)); return respond(selected); }
  if (request.method === 'POST') {
    const body = await request.json(), items = (Array.isArray(body) ? body : [body]).map((item: Row) => ({ id: rows.length + 1, ...item }));
    rows.push(...items); return respond(items, 201);
  }
  return respond([]);
};

const AMAZON_ID = '111-2222222-3333333';
const marked = { _overnight_test: true, bookId: 'book-finding-our-inner-voice' };
const unmarked = { bookId: 'book-finding-our-inner-voice' };
function order(over: Row): Row {
  return { id: 1, orderId: 'GUARD-1', platform: 'd2c', amazon_order_id: null, root_order_id: null, customer_email: 'parent@example.test',
    character_specs: { childName: 'Synthetic Child' }, product_info: unmarked, ...over };
}
const reset = () => { for (const key of Object.keys(tables)) delete tables[key]; resendCalls = 0; amazonCalls = 0; };

let checks = 0;
const ok = (label: string) => { checks++; keep.log(`  ok - ${label}`); };

async function main() {
  console.log = quiet; console.warn = quiet; console.error = quiet; console.info = quiet;
  const guard = await import('../src/lib/messaging/test-order-guard');

  // 1. Marker semantics: explicit boolean true only, object or JSON string, never another signal.
  assert.equal(guard.isOvernightTestOrder({ product_info: { _overnight_test: true } }), true);
  assert.equal(guard.isOvernightTestOrder({ product_info: JSON.stringify({ _overnight_test: true }) }), true);
  for (const bad of [{ _overnight_test: 'true' }, { _overnight_test: 1 }, { _overnight_test: false }, {}, [], null, 'garbage'])
    assert.equal(guard.isOvernightTestOrder({ product_info: bad }), false);
  assert.equal(guard.isOvernightTestOrder({ orderId: 'TEST-OVERNIGHT', customer_email: 'x@example.com', product_info: {} }), false);
  assert.equal(guard.isOvernightTestOrder(null), false);
  assert.deepEqual(guard.preserveOvernightTestMarker({ product_info: marked }, { a: 1 }), { a: 1, _overnight_test: true });
  const next = { a: 1 }; assert.equal(guard.preserveOvernightTestMarker({ product_info: unmarked }, next), next);
  ok('marker is explicit; preserve helper only re-adds an existing marker');

  // 2. Preview reminders (24h/48h/72h) -> real processPreviewReminders with an injected fake sender.
  const { processPreviewReminders } = await import('../src/lib/notifications/process-preview-reminders');
  for (const platform of ['d2c', 'amazon']) for (const hours of [25, 49, 73]) for (const isMarked of [true, false]) {
    const row = order({ platform, orderId: `GUARD-${platform}-${hours}`, amazon_order_id: platform === 'amazon' ? AMAZON_ID : null,
      customer_approval_status: 'pending', customer_approval_requested_at: new Date(Date.now() - hours * 3600_000).toISOString(),
      preview_reminder_sent: null, revision_count: 0, product_info: isMarked ? marked : unmarked });
    const sends: string[] = [], updates: Row[] = [];
    const fakeDb: any = { from: () => { const chain: any = { select: () => chain, eq: () => chain, not: () => chain,
      single: async () => ({ data: { customer_approval_status: 'pending', customer_approval_approved_at: null }, error: null }),
      then: (resolve: (value: unknown) => void) => resolve({ data: [row], error: null }) }; return chain; } };
    const result = await processPreviewReminders(fakeDb, undefined, {
      getActivePreviewToken: async (orderId: string) => ({ token: 'synthetic-token', orderId, expiresAt: '2999-01-01T00:00:00Z' }) as any,
      sendD2CPreviewEmail: async (params: any) => { sends.push(`d2c:${params.reminderType}`); return { success: true, messageId: 'm' }; },
      sendAmazonPreviewMessage: async (params: any) => { sends.push(`amazon:${params.reminderType}`); return { success: true, messageId: 'm' }; },
      updateOrderInSupabase: (async (_id: string, patch: Row) => { updates.push(patch); }) as any,
    });
    const expected = hours >= 72 ? 'auto-approval' : hours >= 48 ? 'reminder-day-2' : 'reminder-day-1';
    if (isMarked) {
      assert.deepEqual(sends, [], `${platform} ${hours}h marked must not send`); assert.deepEqual(updates, [], 'marked order must not record notified state');
      assert.equal(result.sent, 0); assert.equal(result.skipped, 1); assert.equal(result.debug.skippedReasons.overnight_test_order, 1);
    } else {
      assert.deepEqual(sends, [`${platform}:${expected}`]); assert.equal(updates.length, 1); assert.equal(updates[0].preview_reminder_sent, expected); assert.equal(result.sent, 1);
    }
  }
  ok('reminders: 3 buckets x d2c/amazon x marked/unmarked (marked: 0 sends, 0 state writes; unmarked: exactly one send + state)');

  // 3. print-submitted -> real handler with injected fake senders.
  const { handlePrintSubmitted } = await import('../src/app/api/webhooks/print-submitted/route');
  for (const platform of ['d2c', 'amazon']) for (const isMarked of [true, false]) {
    const stored = order({ orderId: 'GUARD-PS', platform, amazon_order_id: platform === 'amazon' ? AMAZON_ID : null, print_provider: 'lulu', lulu_job_id: 'job-1',
      lulu_status: 'CREATED', product_info: isMarked ? marked : unmarked });
    const sends: string[] = [], completions: string[] = [];
    const deps: any = { getOrder: async () => stored, persistCompletion: async () => { completions.push('persist'); },
      getActivePreviewToken: async (orderId: string) => ({ token: 'synthetic-token', orderId, expiresAt: '2999-01-01T00:00:00Z' }), getPreviewTokenForOrderLink: async () => null,
      sendD2CPrintSubmittedEmail: async () => { sends.push('d2c'); return { success: true, messageId: 'm' }; },
      sendAmazonPrintSubmittedMessage: async () => { sends.push('amazon'); return { success: true, messageId: 'm' }; },
      recordWorkflowJobEvent: async () => ({ success: true, jobId: 1, attemptId: null, currentStatus: 'succeeded' }),
      completeW4PrintJobForOrder: async () => ({ job: null, attempt: null }), completeW4SiblingJobForGroup: async () => ({ job: null, attempt: null }) };
    const response = await handlePrintSubmitted({ orderId: 'GUARD-PS' }, deps);
    assert.equal(response.status, 200); assert.deepEqual(completions, ['persist'], 'completion state is still recorded');
    if (isMarked) { assert.deepEqual(sends, []); assert.equal((response.body as Row).skipped, true); assert.equal((response.body as Row).skipReason, 'overnight_test_order'); }
    else assert.deepEqual(sends, [platform]);
  }
  ok('print-submitted: marked -> completion recorded, 0 sends, skipped reason; unmarked -> one send');

  // 4. Lowest-level senders (Resend and Amazon transports counted at fetch).
  const d2c = await import('../src/lib/notifications/d2c-email');
  const amazon = await import('../src/lib/notifications/amazon-message-center');
  const shipment = await import('../src/lib/notifications/amazon-shipment');
  const d2cCalls: Array<[string, (id: string) => Promise<{ success: boolean; skipped?: boolean }>]> = [
    ['preview', id => d2c.sendD2CPreviewEmail({ to: 'p@example.test', previewUrl: 'https://x.example.test/a', reminderType: 'initial', orderId: id })],
    ['confirmation', id => d2c.sendD2COrderConfirmationEmail({ to: 'p@example.test', displayOrderId: 'D-1', orderId: id })],
    ['sibling-confirmation', id => d2c.sendD2CSiblingOrderConfirmationEmail({ to: 'p@example.test', items: [{ childName: 'C' }], displayOrderId: 'D-1', orderId: id })],
    ['print-submitted', id => d2c.sendD2CPrintSubmittedEmail({ to: 'p@example.test', previewUrl: 'https://x.example.test/a', orderId: id })],
    ['shipped', id => d2c.sendD2CShippedEmail({ to: 'p@example.test', orderId: id })],
  ];
  for (const [name, call] of d2cCalls) {
    reset(); tables.orders = [order({ orderId: 'GUARD-LOW', product_info: marked })];
    const skipped = await call('GUARD-LOW');
    assert.equal(resendCalls, 0, `${name} marked must not reach Resend`); assert.equal(skipped.skipped, true); assert.equal(skipped.success, false);
    assert.equal((tables.notification_logs ?? []).length, 0, `${name} marked must not log`);
    reset(); tables.orders = [order({ orderId: 'GUARD-LOW', product_info: unmarked })];
    assert.equal((await call('GUARD-LOW')).success, true); assert.equal(resendCalls, 1, `${name} unmarked must reach Resend`);
  }
  const amazonCalls$: Array<[string, () => Promise<{ success: boolean; skipped?: boolean }>]> = [
    ['preview', () => amazon.sendAmazonPreviewMessage({ amazonOrderId: AMAZON_ID, reminderType: 'initial', previewUrl: 'https://x.example.test/a', revisionsRemaining: 2 })],
    ['print-submitted', () => amazon.sendAmazonPrintSubmittedMessage({ amazonOrderId: AMAZON_ID, previewUrl: 'https://x.example.test/a' })],
    ['shipped', () => amazon.sendAmazonShippedMessage({ amazonOrderId: AMAZON_ID })],
    ['confirm-shipment', () => shipment.confirmAmazonShipment({ amazonOrderId: AMAZON_ID, order: { amazon_order_id: AMAZON_ID }, trackingNumber: '1Z' })],
  ];
  for (const [name, call] of amazonCalls$) {
    // marker on a sibling row that shares the Amazon root also protects the shared buyer
    reset(); tables.orders = [order({ orderId: 'GUARD-A1', platform: 'amazon', amazon_order_id: AMAZON_ID, root_order_id: AMAZON_ID, product_info: marked }),
      order({ id: 2, orderId: 'GUARD-A2', platform: 'amazon', amazon_order_id: AMAZON_ID, root_order_id: AMAZON_ID, product_info: unmarked })];
    const skipped = await call();
    assert.equal(amazonCalls, 0, `${name} marked must not reach any Amazon host`); assert.equal(skipped.skipped, true); assert.equal(skipped.success, false);
    reset(); tables.orders = [order({ orderId: 'GUARD-A1', platform: 'amazon', amazon_order_id: AMAZON_ID, root_order_id: AMAZON_ID, product_info: unmarked })];
    await call().catch(() => undefined); // unmarked sends reach the (blocked) token endpoint and may throw
    assert.ok(amazonCalls >= 1, `${name} unmarked must still reach Amazon`);
  }
  ok('lowest-level D2C (5) and Amazon (4) senders: marked -> no transport call, skipped; unmarked -> transport reached');

  // 5. Route producers (real handlers, fake PostgREST + counted transports).
  const previewRoute = await import('../src/app/api/notifications/preview/amazon/route');
  for (const platform of ['d2c', 'amazon']) for (const isMarked of [true, false]) {
    reset(); tables.orders = [order({ orderId: 'GUARD-PR', platform, amazon_order_id: platform === 'amazon' ? AMAZON_ID : null, product_info: isMarked ? marked : unmarked })];
    const response = await previewRoute.POST(new NextRequest('https://api.example.test/api/notifications/preview/amazon', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: 'GUARD-PR', token: 'synthetic-token', reminderType: 'reminder-day-1' }) }));
    const body = await response.json();
    if (isMarked) { assert.equal(response.status, 200); assert.equal(body.skipped, true); assert.equal(resendCalls + amazonCalls, 0); }
    else assert.ok(resendCalls + amazonCalls >= 1, `${platform} unmarked preview must reach a transport`);
  }
  ok('preview notification route: marked -> 200 skipped, no transport; unmarked -> transport reached');

  const finalRoute = await import('../src/app/api/orders/[orderId]/final-approval/route');
  for (const platform of ['d2c', 'amazon']) for (const isMarked of [true, false]) {
    reset(); tables.orders = [order({ orderId: 'GUARD-FA', platform, amazon_order_id: platform === 'amazon' ? AMAZON_ID : null, updated_at: '2026-01-01T00:00:00Z', product_info: isMarked ? marked : unmarked })];
    const response = await finalRoute.POST(new NextRequest('https://api.example.test/api/orders/GUARD-FA/final-approval', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reviewer: 'synthetic' }) }), { params: Promise.resolve({ orderId: 'GUARD-FA' }) } as any);
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body).slice(0, 300));
    if (isMarked) { assert.equal(body.notification.attempted, false); assert.equal(body.notification.skipped, true); assert.equal(resendCalls + amazonCalls, 0); }
    else { assert.equal(body.notification.attempted, true); assert.ok(resendCalls + amazonCalls >= 1); }
  }
  ok('final-approval route: marked -> not attempted, skipped, no transport; unmarked -> attempted and transport reached');
}

main().then(() => keep.log(`PASS test-message-safety-guard: ${checks} groups; zero live requests`), error => {
  console.log = keep.log; console.warn = keep.warn; console.error = keep.error;
  console.error(error); keep.error(logs.slice(-15).join('\n')); process.exitCode = 1;
}).finally(() => { globalThis.fetch = original; Object.assign(console, keep); });
