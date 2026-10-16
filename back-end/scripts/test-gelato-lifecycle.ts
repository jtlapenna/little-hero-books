import assert from 'node:assert/strict';
import configFile from '../src/lib/books/configs/book-finding-our-inner-voice/v2.json';
import { GelatoPrintConfigSchema } from '../src/lib/books/types';
import { GelatoProviderOrderSchema } from '../src/lib/books/gelato-provider-snapshot';
import { buildGelatoLifecycleResults, gelatoPackagesForItem, gelatoSnapshotDigest, recoverGelatoSubmission, refreshGelatoSubmission, cancelGelatoSubmission } from '../src/lib/books/gelato-lifecycle';
import { canCancelGelatoOrder, gelatoTransitionReason } from '../src/lib/books/gelato-status';
import type { GelatoSubmissionContext } from '../src/lib/books/gelato-submission-store';

const shippingAddress = { firstName: 'Test', lastName: 'Person', country: 'US', addressLine1: '1 Main St', city: 'Seattle', state: 'WA', postCode: '98101', email: 'test@example.com' };
const item = { id: 'provider-item-1', itemReferenceId: 'item-1', productUid: configFile.formats.standard.print.productUid, pageCount: 32, quantity: 1, files: [{ type: 'default', url: 'https://files.example.test/test.pdf' }], fulfillmentStatus: 'in_production' };
const before = GelatoProviderOrderSchema.parse({ id: 'provider-1', orderReferenceId: 'lhb-gelato-1', customerReferenceId: 'root-1', currency: 'USD', orderType: 'order',
  shippingAddress, fulfillmentStatus: 'in_production', updatedAt: '2026-10-11T12:00:00Z', connectedOrderIds: [], items: [item] });
const snapshot = { request: { orderType: 'draft', orderReferenceId: before.orderReferenceId, customerReferenceId: before.customerReferenceId, currency: 'USD', shippingAddress,
  shipmentMethodUid: 'usps_ground_advantage', items: [{ ...item }] }, config: GelatoPrintConfigSchema.parse(configFile.formats.standard.print), shippingTier: 'standard' };
const context = { submission: { id: '11111111-1111-4111-8111-111111111111', provider: 'gelato', request_state: 'submitted', request_snapshot: snapshot,
  order_reference_id: before.orderReferenceId, accepted_root_order_id: before.id },
  providerOrders: [{ provider_order_id: before.id, status: before.fulfillmentStatus, order_type: before.orderType, last_event_at: before.updatedAt,
    snapshot: before, snapshot_digest: gelatoSnapshotDigest(before), action_reason: null }],
  members: [{ submission_id: '11111111-1111-4111-8111-111111111111', item_reference_id: item.itemReferenceId, provider_order_id: before.id,
    provider_item_id: item.id, status: item.fulfillmentStatus, child_order_id: 1 }] } as unknown as GelatoSubmissionContext;
const shipped = GelatoProviderOrderSchema.parse({ ...before, fulfillmentStatus: 'shipped', updatedAt: '2026-10-11T13:00:00Z', items: [{ ...item, fulfillmentStatus: 'shipped' }],
  shipment: { shipmentMethodUid: 'usps_ground_advantage', name: 'USPS', packages: [{ id: 'parcel-1', orderItemIds: [item.id], trackingCode: 'tracking-1', trackingUrl: 'https://tracking.example.test/1' }] } });
assert.equal(buildGelatoLifecycleResults(context, [shipped])[0].items[0].tracking?.[0].packageId, 'parcel-1');
assert.equal(buildGelatoLifecycleResults(context, [{ ...shipped, updatedAt: '2026-10-11T11:00:00Z' }])[0].actionReason, 'older_provider_snapshot');
assert.equal(buildGelatoLifecycleResults(context, [{ ...shipped, updatedAt: before.updatedAt }])[0].actionReason, 'conflicting_provider_snapshot');
assert.equal(buildGelatoLifecycleResults(context, [{ ...shipped, fulfillmentStatus: 'unexpected' }])[0].actionReason, 'unknown_provider_status');
assert.equal(buildGelatoLifecycleResults(context, [before])[0].actionReason, null);
const duplicatePackages = { ...shipped, shipment: { ...shipped.shipment!, packages: [...shipped.shipment!.packages, { ...shipped.shipment!.packages[0], id: 'parcel-2' }] } };
assert.equal(gelatoPackagesForItem(duplicatePackages, item.id, 2).reason, 'package_quantity_allocation_unknown');
assert.equal(gelatoTransitionReason('delivered', 'in_transit', 'order', 'order'), 'terminal_status_conflict');
assert.equal(gelatoTransitionReason('delivered', 'returned', 'order', 'order'), null);
assert.equal(gelatoTransitionReason('canceled', 'in_production', 'draft', 'order'), 'terminal_status_conflict');
assert.equal(gelatoTransitionReason('in_production', 'on_hold', 'order', 'order'), null);
assert.equal(gelatoTransitionReason('on_hold', 'created', 'order', 'order', 'in_production'), 'provider_status_regression');
assert.equal(gelatoTransitionReason('draft', 'draft', 'draft', 'draft'), null);
assert.equal(canCancelGelatoOrder('draft', ['created']), false);
assert.equal(canCancelGelatoOrder('order', ['in_production']), false);
assert.equal(canCancelGelatoOrder('order', ['pending_approval']), true);

const draft = GelatoProviderOrderSchema.parse({ ...before, orderType: 'draft', fulfillmentStatus: 'draft', items: [{ ...item, fulfillmentStatus: 'created' }] });
const converted = GelatoProviderOrderSchema.parse({ ...draft, orderType: 'order', fulfillmentStatus: 'created' });
const draftContext: GelatoSubmissionContext = { ...context,
  providerOrders: [{ ...context.providerOrders[0], status: 'draft', order_type: 'draft', last_event_at: draft.updatedAt, snapshot: draft, snapshot_digest: gelatoSnapshotDigest(draft) }],
  members: [{ ...context.members[0], status: 'created' }] };
const convertedResult = buildGelatoLifecycleResults(draftContext, [converted])[0];
assert.equal(convertedResult.accepted, true, 'Authoritative unchanged-time draft conversion must reconcile');
assert.equal(convertedResult.orderType, 'order');
assert.equal(convertedResult.status, 'created');
assert.equal(convertedResult.actionReason, null);
assert.equal(convertedResult.items[0].orderType, 'order');
const reconciledContext: GelatoSubmissionContext = { ...draftContext,
  providerOrders: [{ ...draftContext.providerOrders[0], status: 'created', order_type: 'order', snapshot: converted, snapshot_digest: gelatoSnapshotDigest(converted) }] };
assert.equal(buildGelatoLifecycleResults(reconciledContext, [converted])[0].accepted, true, 'Identical post-conversion refresh remains idempotent');
assert.equal(buildGelatoLifecycleResults(reconciledContext, [draft])[0].accepted, false, 'Old equal-time draft cannot undo conversion');
for (const conflict of [
  { ...converted, fulfillmentStatus: 'in_production' },
  { ...converted, updatedAt: '2026-10-11T11:00:00Z' },
  { ...converted, items: [{ ...converted.items[0], fulfillmentStatus: 'in_production' }] },
  { ...converted, items: [{ ...converted.items[0], quantity: 2 }] },
  { ...converted, items: [{ ...converted.items[0], processedFileUrl: 'https://files.example.test/changed.pdf' }] },
  { ...converted, shippingAddress: { ...converted.shippingAddress, city: 'Elsewhere' } },
]) assert.equal(buildGelatoLifecycleResults(draftContext, [conflict])[0].accepted, false, 'Unchanged-time conversion cannot accept other changes');

async function main() {
  for (const children of [1, 2]) {
    const items = Array.from({ length: children }, (_, index) => ({ ...draft.items[0], id: `conversion-item-${index + 1}`, itemReferenceId: `conversion-ref-${index + 1}`,
      files: [{ type: 'default', url: `https://files.example.test/child-${index + 1}.pdf` }] }));
    const savedDraft = GelatoProviderOrderSchema.parse({ ...draft, items });
    const acceptedOrder = GelatoProviderOrderSchema.parse({ ...savedDraft, orderType: 'order', fulfillmentStatus: 'created' });
    const cohort: GelatoSubmissionContext = { ...draftContext,
      submission: { ...draftContext.submission, request_snapshot: { ...snapshot, request: { ...snapshot.request, items } } },
      providerOrders: [{ ...draftContext.providerOrders[0], snapshot: savedDraft, snapshot_digest: gelatoSnapshotDigest(savedDraft) }],
      members: items.map((entry, index) => ({ ...draftContext.members[0], child_order_id: index + 1, item_reference_id: entry.itemReferenceId, provider_item_id: entry.id })) };
    let persisted: ReturnType<typeof buildGelatoLifecycleResults> = [];
    const store = { load: async () => cohort, transition: async (name: string, parameters: Record<string, unknown>) => {
      assert.equal(name, 'apply_gelato_provider_snapshots'); persisted = parameters.p_results as typeof persisted; return {};
    } };
    assert.equal((await refreshGelatoSubmission(cohort.submission.id, { store, get: async () => acceptedOrder })).needsAttention, false);
    assert.equal(persisted[0].items.length, children);
    assert(persisted[0].items.every(entry => entry.orderType === 'order' && entry.status === 'created' && entry.actionReason === null));
    const storedOrder = { ...acceptedOrder, items: acceptedOrder.items.map(entry => ({ ...entry, files: [{ type: 'default', url: `https://gelato-api-live.s3.eu-west-1.amazonaws.com/${entry.id}.pdf` }] })) };
    let verifiedFiles = 0;
    assert.equal((await refreshGelatoSubmission(cohort.submission.id, { store, get: async () => storedOrder, verifyStoredFile: async () => { verifiedFiles++; return true; } })).needsAttention, false);
    assert.equal(verifiedFiles, children, 'Conversion still verifies every provider-stored file');
    await assert.rejects(refreshGelatoSubmission(cohort.submission.id, { store: { ...store, transition: async (name: string) => { assert.equal(name, 'hold_gelato_provider_refresh'); return {}; } }, get: async () => storedOrder, verifyStoredFile: async () => false }), /valid provider snapshot/);
  }
  let persist = 0;
  const store = { load: async () => context, transition: async (name: string) => {
    if (name === 'begin_gelato_reconciliation') return { recover: true, claimToken: '22222222-2222-4222-8222-222222222222' };
    if (name === 'persist_gelato_print_result') persist++;
    return {};
  } };
  const response = await refreshGelatoSubmission(context.submission.id, { store, get: async () => shipped });
  assert.equal(response.refreshed, true);
  const storedCopy = { ...shipped, items: shipped.items.map((item) => ({ ...item, files: [{ type: 'default', url: 'https://gelato-api-live.s3.eu-west-1.amazonaws.com/synthetic.pdf' }] })) };
  let byteChecks = 0;
  assert.equal((await refreshGelatoSubmission(context.submission.id, { store, get: async () => storedCopy, verifyStoredFile: async () => { byteChecks++; return true; } })).refreshed, true);
  assert.equal((await recoverGelatoSubmission(context.submission.id, { store, get: async () => storedCopy, search: async () => [storedCopy.id], verifyStoredFile: async () => true })).recovered, true);
  assert.equal(byteChecks, 1);
  await assert.rejects(refreshGelatoSubmission(context.submission.id, { store, get: async () => storedCopy, verifyStoredFile: async () => false }), /valid provider snapshot/);
  await assert.rejects(recoverGelatoSubmission(context.submission.id, { store, get: async () => storedCopy, search: async () => [storedCopy.id], verifyStoredFile: async () => false }), /held/);

  assert.equal((await recoverGelatoSubmission(context.submission.id, { store, get: async () => before, search: async () => [before.id] })).recovered, true);
  assert.equal(persist, 2, 'recovery persists accepted graph without a create call');
  const rootless = { ...context, submission: { ...context.submission, accepted_root_order_id: null } };
  await assert.rejects(recoverGelatoSubmission(context.submission.id, { store: { ...store, load: async () => rootless }, search: async () => [], get: async () => before }), /held/);
  assert.equal(persist, 2, 'empty search cannot establish a safe retry');
  let canceled = 0;
  await assert.rejects(cancelGelatoSubmission(context.submission.id, { store, cancelEnabled: true, get: async () => before, cancel: async () => { canceled++; } }), /unavailable/);
  assert.equal(canceled, 0);
  for (const timeoutAccepted of [false, true]) {
    const orders = [1, 2, 3].map((id) => GelatoProviderOrderSchema.parse({ ...before, id: `provider-${id}`, fulfillmentStatus: 'created',
      connectedOrderIds: ['provider-1', 'provider-2', 'provider-3'], items: [{ ...item, id: `provider-item-${id}`, itemReferenceId: `item-${id}`, fulfillmentStatus: 'created' }] }));
    const group = { ...context, submission: { ...context.submission, request_snapshot: { ...snapshot, request: { ...snapshot.request, items: orders.flatMap((order) => order.items) } } },
      providerOrders: orders.map((order) => ({ provider_order_id: order.id, status: order.fulfillmentStatus, order_type: 'order', progress_status: 'created',
        last_event_at: order.updatedAt, snapshot: order, snapshot_digest: gelatoSnapshotDigest(order), action_reason: null })),
      members: orders.map((order, index) => ({ ...context.members[0], child_order_id: index + 1, item_reference_id: order.items[0].itemReferenceId,
        provider_item_id: order.items[0].id, provider_order_id: order.id, status: 'created' })) };
    const attempts: string[] = [];
    const result = await cancelGelatoSubmission(group.submission.id, { cancelEnabled: true, get: async (id) => orders.find((order) => order.id === id)!,
      cancel: async (id) => {
        attempts.push(id);
        const order = orders.find((entry) => entry.id === id)!;
        if (id !== 'provider-1' || timeoutAccepted) { order.fulfillmentStatus = 'canceled'; order.items[0].fulfillmentStatus = 'canceled'; order.updatedAt = '2026-10-11T13:00:00Z'; }
        if (id === 'provider-1') throw new Error('Synthetic cancellation timeout');
      }, store: { load: async () => group, transition: async (name, parameters) => {
        if (name === 'apply_gelato_provider_snapshots') {
          for (const entry of parameters.p_results as ReturnType<typeof buildGelatoLifecycleResults>) {
            const stored = group.providerOrders.find((order) => order.provider_order_id === entry.providerOrderId)!;
            Object.assign(stored, { status: entry.status, snapshot: structuredClone(entry.snapshot), snapshot_digest: entry.digest, last_event_at: entry.snapshot.updatedAt, action_reason: entry.actionReason });
            const member = group.members.find((member) => member.provider_order_id === entry.providerOrderId)!;
            member.status = entry.items[0].status!;
          }
        }
        return {};
      } } });
    assert.equal(attempts.length, 3, 'cancel timeout cannot omit later connected orders');
    assert.equal(result.providerOrders.length, 3);
    assert.equal(result.canceled, timeoutAccepted, 'authoritative Get determines final outcome');
    assert.equal(result.needsAttention, !timeoutAccepted);
  }
  console.log('Gelato status, package mapping, recovery and cancel policy checks passed');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
