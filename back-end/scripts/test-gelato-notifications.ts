import assert from 'node:assert/strict';
import configFile from '../src/lib/books/configs/book-finding-our-inner-voice/v2.json';
import { GelatoPrintConfigSchema } from '../src/lib/books/types';
import { quoteGelatoSubmission, type GelatoSubmissionDependencies } from '../src/lib/books/gelato-submission';
import { refreshGelatoSubmission } from '../src/lib/books/gelato-lifecycle';
import { GelatoProviderOrderSchema } from '../src/lib/books/gelato-provider-snapshot';
import { deliverGelatoNotification } from '../src/lib/books/gelato-notification-delivery';
import { createClient } from '@supabase/supabase-js';
import { pollGelatoPrintProvider } from '../src/lib/books/gelato-polling';
import type { GelatoNotificationIntent } from '../src/lib/books/gelato-notifications';
import { createGelatoSubmissionStore } from '../src/lib/books/gelato-submission-store';
import type { GelatoSubmissionContext } from '../src/lib/books/gelato-submission-store';
import type { W4GelatoPrintInput } from '../src/lib/books/w4-gelato-print-input';

async function main() {
  process.env.SUPABASE_URL = 'https://db.example.test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-test-key';
  process.env.RESEND_API_KEY = 'synthetic-resend-key'; process.env.D2C_EMAIL_ENABLED = 'true';
  process.env.AMAZON_SANDBOX_MODE = 'false'; process.env.AMZ_LWA_CLIENT_ID_PROD = 'synthetic-client'; process.env.AMZ_LWA_CLIENT_SECRET_PROD = 'synthetic-secret';
  process.env.AMZ_APP_PROD_REFRESH_TOKEN = 'synthetic-refresh'; process.env.AMZ_SELLER_ID = 'synthetic-seller';
  process.env.AWS_ACCESS_KEY_ID = 'synthetic-access'; process.env.AWS_SECRET_ACCESS_KEY = 'synthetic-signing';
  const { gelatoNotificationRuntime } = await import('../src/lib/books/gelato-notification-runtime');
  const originalFetch = globalThis.fetch;
  try {
    for (const scenario of ['amazon', 'amazon-root', 'amazon-duplicate', 'd2c'] as const) {
      const platform = scenario.startsWith('amazon') ? 'amazon' : 'd2c';
      const config = GelatoPrintConfigSchema.parse(configFile.formats[platform === 'amazon' ? 'amazon' : 'standard'].print);
      const identity = { submissionId: '11111111-1111-4111-8111-111111111111', claimToken: '22222222-2222-4222-8222-222222222222', executionId: 'execution-1', mode: 'siblings' as const };
      const root = platform === 'amazon' ? '111-2222222-3333333' : 'group-1';
      const rows = [1, 2].map((id) => ({ id, orderId: `child-${id}`, print_provider: 'gelato', print_submission_id: identity.submissionId, print_claim_token: identity.claimToken,
        platform, root_order_id: root, amazon_order_id: platform === 'amazon' ? root : null, shipping_tier: 'standard', quantity: id,
        customer_email: 'test@example.com', character_specs: { childName: `Child ${id}` }, product_info: { _order_item_id: `amazon-item-${id}`, quantity: id },
        shipping_address: { name: 'Test Parent', address: '1 Main St', city: 'Seattle', state: 'WA', zip: '98101', country: 'US' } }));
      const context = { submission: { id: identity.submissionId, provider: 'gelato', root_order_id: root, order_reference_id: 'lhb-gelato-1', claim_token: identity.claimToken,
        lease_expires_at: '2026-10-11T12:15:00Z', request_state: 'claimed', quote_snapshot: null, request_snapshot: null }, providerOrders: [],
        members: rows.map((row) => ({ submission_id: identity.submissionId, child_order_id: row.id, child_order_key: row.orderId, item_reference_id: `item-${row.id}`,
          artifact_key: `book/orders/${row.orderId}/gelato/print/v2/${'a'.repeat(24)}.pdf`, artifact_fingerprint: 'a'.repeat(24), artifact_claim_token: identity.claimToken,
          pdf_page_count: 35, provider_order_id: 'provider-1', provider_item_id: `provider-item-${row.id}`, status: 'in_production' })) } as unknown as GelatoSubmissionContext;
      if (scenario === 'amazon-root') for (const row of rows) { delete (row as Record<string, unknown>).platform; delete (row as Record<string, unknown>).amazon_order_id; }
      if (scenario === 'amazon-duplicate') rows[1].product_info._order_item_id = rows[0].product_info._order_item_id;
      let intents: GelatoNotificationIntent[] = [];
      let holds: Array<{ childOrderId: number; reason: string }> = [];
      const store = { load: async () => context, transition: async (name: string, parameters: Record<string, unknown>) => {
        if (name === 'record_gelato_quote_snapshot') context.submission.quote_snapshot = parameters.p_snapshot;
        if (name === 'apply_gelato_provider_snapshots') { intents = parameters.p_notifications as GelatoNotificationIntent[]; holds = parameters.p_notification_holds as typeof holds; }
        return {};
      } };
      const dependencies: GelatoSubmissionDependencies = { store, backendUrl: 'https://files.example.test', draftsEnabled: false, artifactExists: async () => true,
        now: () => new Date('2026-10-11T12:00:00Z'), loadOrder: async (key) => rows.find((row) => row.orderId === key)!,
        loadPrintInput: async (key) => ({ orderDbId: Number(key.slice(-1)), orderId: key, rootOrderId: root, orderPrefix: `book/orders/${key}`, bookConfigVersion: 2, providerPrintConfig: config } as unknown as W4GelatoPrintInput),
        quote: async (request) => ({ orderReferenceId: request.orderReferenceId, quotes: [{ id: 'quote-1', itemReferenceIds: request.products.map((item) => item.itemReferenceId),
          products: request.products, shipmentMethods: [{ shipmentMethodUid: 'usps_ground_advantage', type: 'normal' }] }] }) };
      await quoteGelatoSubmission(identity, dependencies);
      context.submission.request_snapshot = context.submission.quote_snapshot;
      const saved = context.submission.request_snapshot as { request: { items: unknown[]; shippingAddress: unknown } };
      const before = GelatoProviderOrderSchema.parse({ id: 'provider-1', orderReferenceId: 'lhb-gelato-1', customerReferenceId: root, orderType: 'order', currency: 'USD',
        fulfillmentStatus: 'in_production', updatedAt: '2026-10-11T12:00:00Z', shippingAddress: saved.request.shippingAddress,
        items: saved.request.items.map((item, index) => ({ ...(item as object), id: `provider-item-${index + 1}`, fulfillmentStatus: 'in_production' })) });
      context.submission.request_state = 'submitted';
      context.providerOrders = [{ provider_order_id: before.id, status: before.fulfillmentStatus, order_type: 'order', snapshot: before, snapshot_digest: 'initial-digest', last_event_at: before.updatedAt, action_reason: null }];
      if (platform === 'amazon') {
        await refreshGelatoSubmission(identity.submissionId, { store, get: async () => before, loadOrder: dependencies.loadOrder });
        assert.equal(intents.length, 0, 'Amazon canonical targets never emit D2C printing email');
      }
      const shipped = GelatoProviderOrderSchema.parse({ ...before, fulfillmentStatus: 'shipped', updatedAt: '2026-10-11T13:00:00Z', items: before.items.map((item) => ({ ...item, fulfillmentStatus: 'shipped' })),
        shipment: { shipmentMethodUid: 'usps_ground_advantage', shipmentMethodName: 'USPS Ground Advantage', packages: [{ id: 'parcel-1', orderItemIds: before.items.map((item) => item.id), trackingCode: 'tracking-1', trackingUrl: 'https://tracking.example.test/1' }] } });
      const delivered = GelatoProviderOrderSchema.parse({ ...shipped, fulfillmentStatus: 'delivered', updatedAt: '2026-10-11T14:00:00Z', items: shipped.items.map((item) => ({ ...item, fulfillmentStatus: 'delivered' })) });
      await refreshGelatoSubmission(identity.submissionId, { store, get: async () => delivered, loadOrder: dependencies.loadOrder });
      assert.equal(intents.length, 0, 'delivered-first cannot invent a shipment date or send a stale D2C shipment email');
      if (platform === 'amazon') assert.ok([1, 2].every((id) => holds.some((hold) => hold.childOrderId === id)), 'delivered-first Amazon requires durable review for all children');
      await refreshGelatoSubmission(identity.submissionId, { store, get: async () => shipped, loadOrder: dependencies.loadOrder });
      if (scenario === 'amazon-duplicate') {
        assert.equal(intents.length, 0); assert.deepEqual(holds.map((hold) => hold.childOrderId).sort(), [1, 2], 'duplicate marketplace item IDs hold every child'); continue;
      }
      if (platform === 'amazon') {
        await refreshGelatoSubmission(identity.submissionId, { store, get: async () => shipped, loadOrder: async (key) => key === rows[1].orderId ? null : rows[0] });
        assert.equal(intents.length, 0); assert.ok([1, 2].every((id) => holds.some((hold) => hold.childOrderId === id)), 'incomplete shared parcel holds all affected children');
        const conflicting = GelatoProviderOrderSchema.parse({ ...shipped, shipment: { ...shipped.shipment, packages: shipped.items.map((item) => ({ ...shipped.shipment!.packages[0], orderItemIds: [item.id] })) } });
        await refreshGelatoSubmission(identity.submissionId, { store, get: async () => conflicting, loadOrder: dependencies.loadOrder });
        assert.equal(intents.length, 0); assert.ok([1, 2].every((id) => holds.some((hold) => hold.childOrderId === id)), 'conflicting package membership holds every observed child');
        await refreshGelatoSubmission(identity.submissionId, { store, get: async () => shipped, loadOrder: dependencies.loadOrder });
      }
      assert.equal(intents.length, platform === 'amazon' ? 1 : 2);
      const intent = intents[0];
      if (intent.payload.kind === 'amazon-shipped') { assert.deepEqual(intent.payload.orderItems.map((item) => item.quantity), [1, 2]); intent.payload.packageReferenceId = '1000000000'; }
      if (platform === 'amazon') {
        context.notifications = [{ payload: intent.payload }];
        await refreshGelatoSubmission(identity.submissionId, { store, get: async () => delivered, loadOrder: dependencies.loadOrder });
        assert.equal(holds.length, 0); assert.equal(intents.length, 1);
        assert.equal(intents[0].payload.kind === 'amazon-shipped' && intents[0].payload.shipDate, intent.payload.kind === 'amazon-shipped' && intent.payload.shipDate, 'late operational confirmation preserves saved shipment timestamp');
      }
      const wireBodies: string[] = [];
      const keys: string[] = [];
      globalThis.fetch = async (input, init) => {
        const url = new URL(String(input));
        if (url.hostname === 'api.amazon.com') return new Response(JSON.stringify({ access_token: 'synthetic-token', expires_in: 3600 }), { status: 200 });
        assert.ok(['api.resend.com', 'sellingpartnerapi-na.amazon.com'].includes(url.hostname), 'only synthetic delivery hosts allowed');
        wireBodies.push(String(init?.body)); keys.push(new Headers(init?.headers).get('Idempotency-Key') ?? 'amazon-package-reference');
        return new Response(JSON.stringify(wireBodies.length === 1 ? { errors: [{ message: 'synthetic ambiguity' }] } : { id: 'synthetic-message' }), { status: wireBodies.length === 1 ? 500 : 200 });
      };
      const runtime = gelatoNotificationRuntime();
      const deliveryStore = { transition: async (name: string) => name === 'claim_gelato_notification' ? { claimed: true, attemptToken: identity.claimToken, payload: intent.payload, idempotencyKey: 'gelato-stable-key' } : name === 'authorize_gelato_notification' ? { send: true } : {} };
      const delivery = { ...runtime, enabled: true, store: deliveryStore };
      assert.equal((await deliverGelatoNotification(identity.submissionId, delivery)).ambiguous, true);
      assert.equal((await deliverGelatoNotification(identity.submissionId, delivery)).delivered, true);
      assert.equal(wireBodies[0], wireBodies[1], 'retry wire payload must stay exact');
      if (platform === 'amazon') {
        const body = JSON.parse(wireBodies[0]); assert.equal(body.packageDetail.packageReferenceId, '1000000000');
        assert.deepEqual(body.packageDetail.orderItems.map((item: { quantity: number }) => item.quantity), [1, 2]);
      } else assert.deepEqual(keys, ['gelato-stable-key', 'gelato-stable-key']);
      const draft = { ...shipped, orderType: 'draft' as const, fulfillmentStatus: 'draft', updatedAt: '2026-10-11T14:00:00Z', items: shipped.items.map((item) => ({ ...item, fulfillmentStatus: 'draft' })) };
      context.providerOrders[0].order_type = 'draft'; context.providerOrders[0].status = 'draft'; context.members.forEach((member) => { member.status = 'draft'; });
      await refreshGelatoSubmission(identity.submissionId, { store, get: async () => draft, loadOrder: dependencies.loadOrder });
      assert.equal(intents.length, 0, 'held drafts never produce production messages');
      let storeQueries = 0;
      const submissionRecord = { ...context.submission, workflow_job_idempotency_key: 'synthetic-job', owning_execution_id: null, send_started_at: null, accepted_root_order_id: before.id,
        quote_id: null, shipment_method_uid: null, shipment_policy_version: null, quoted_at: null, quote_request_fingerprint: null };
      const storeDatabase = createClient('https://db.example.test', 'synthetic-key', { global: { fetch: async (input, init) => {
        storeQueries++;
        const table = new URL(String(input)).pathname.split('/').pop();
        const records = table === 'print_provider_submissions' ? [submissionRecord] : table === 'print_provider_submission_items' ? context.members : table === 'print_provider_submission_orders' ? context.providerOrders : context.notifications ?? [];
        return new Response(JSON.stringify(new Headers(init?.headers).get('Accept')?.includes('vnd.pgrst.object') ? records[0] : records), { headers: { 'Content-Type': 'application/json' } });
      } } });
      const loaded = await createGelatoSubmissionStore(storeDatabase, AbortSignal.timeout(1000)).load(identity.submissionId);
      assert.equal(loaded.members.length, 2); assert.equal(storeQueries, 4, 'real SDK loads ownership, members, graph and immutable notification evidence');

    }
    const database = createClient('https://db.example.test', 'synthetic-key', { global: { fetch: async (_input, init) => new Promise<Response>((resolve) => {
      const timer = setTimeout(() => resolve(new Response('[]')), 150);
      init?.signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(new Response(JSON.stringify({ message: 'Aborted' }), { status: 499 })); }, { once: true });
    }) } });
    const started = Date.now();
    const summary = await pollGelatoPrintProvider(database, { enabled: true, budgetMs: 10 });
    assert.equal(summary.errors, 1); assert.ok(Date.now() - started < 100, 'database polling must stop within abort budget');
  } finally { globalThis.fetch = originalFetch; }
  console.log('Gelato quote-to-status-to-outbox-to-Amazon/Resend checks passed');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
