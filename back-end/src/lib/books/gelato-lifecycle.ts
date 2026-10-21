import { buildGelatoNotificationIntents } from './gelato-notifications';
import { createHash, randomUUID } from 'node:crypto';
import { cancelGelatoOrder, getGelatoOrder, searchGelatoOrders, GelatoProviderReadError } from './gelato-api-client';
import { GelatoSavedSnapshotSchema } from './gelato-submission';
import { GelatoProviderOrderSchema, loadGelatoConnectedOrders, validateGelatoConnectedOrdersWithFiles, type GelatoProviderOrder } from './gelato-provider-snapshot';
import type { GelatoStoredFileVerifier } from './gelato-stored-file';
import type { GelatoSubmissionStore, GelatoSubmissionContext } from './gelato-submission-store';
import { canCancelGelatoOrder, gelatoTransitionReason } from './gelato-status';
import { bindGelatoFinancialGraph } from './gelato-financial-observation';
import { isGelatoEngineeringOrderKey } from './gelato-notification-target';
import { gelatoTestSafetyReason } from './gelato-test-safety';

export interface GelatoLifecycleDependencies {
  store: GelatoSubmissionStore;
  verifyStoredFile?: GelatoStoredFileVerifier;
  get?: (id: string) => Promise<GelatoProviderOrder>;
  search?: (reference: string) => Promise<string[]>;
  cancel?: (id: string) => Promise<void>;
  cancelEnabled?: boolean;
  loadOrder?: (orderId: string) => Promise<Record<string, unknown> | null>;
  notificationFrom?: string;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function gelatoSnapshotDigest(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
function fulfillmentSnapshot(order: GelatoProviderOrder) {
  // Derived observations must not create a fulfillment conflict on legacy snapshots at the same timestamp.
  const { financialObservation: _financial, testSafetyEvidence: _testSafety, ...snapshot } = order;
  return snapshot;
}
export function gelatoPackagesForItem(order: GelatoProviderOrder, itemId: string, quantity: number) {
  const packages = (order.shipment?.packages ?? []).filter((parcel) => parcel.orderItemIds.includes(itemId));
  if (packages.length > 1 && quantity > 1) return { tracking: [], reason: 'package_quantity_allocation_unknown' };
  if (packages.length > 1) return { tracking: [], reason: 'duplicate_package_item_mapping' };
  return { tracking: packages.map((parcel) => ({ providerOrderId: order.id, packageId: parcel.id, providerItemIds: parcel.orderItemIds,
    trackingNumber: parcel.trackingCode, trackingUrl: parcel.trackingUrl, carrier: order.shipment?.shipmentMethodUid?.startsWith('usps_') ? 'USPS' : order.shipment?.shipmentMethodUid?.startsWith('ups_') ? 'UPS' : '', quantity })), reason: null };
}
// Gelato may retain updatedAt when converting a draft. Accept only the exact
// draft -> created type change; every other normalized field must stay equal.
function unchangedTimeDraftConversion(previous: GelatoSubmissionContext['providerOrders'][number], order: GelatoProviderOrder): boolean {
  if (previous.order_type !== 'draft' || previous.status !== 'draft' || order.orderType !== 'order' ||
      order.fulfillmentStatus !== 'created' || !order.items.length || order.items.some(item => item.fulfillmentStatus !== 'created')) return false;
  const prior = GelatoProviderOrderSchema.safeParse(previous.snapshot);
  return prior.success && prior.data.orderType === 'draft' && prior.data.fulfillmentStatus === 'draft' &&
    canonical(fulfillmentSnapshot(prior.data)) === canonical(fulfillmentSnapshot({ ...order, orderType: 'draft', fulfillmentStatus: 'draft' }));
}
export function buildGelatoLifecycleResults(context: GelatoSubmissionContext, graph: GelatoProviderOrder[]) {
  const engineering = isGelatoEngineeringOrderKey(context.submission.root_order_id) ||
    context.members.some(member => isGelatoEngineeringOrderKey(member.child_order_key));
  return bindGelatoFinancialGraph(graph).map((order) => {
    const previous = context.providerOrders.find((entry) => entry.provider_order_id === order.id);
    if (!previous) throw new Error('Gelato refresh cannot introduce an unmapped external order');
    const digest = gelatoSnapshotDigest(fulfillmentSnapshot(order));
    const time = Date.parse(order.updatedAt);
    const before = previous.last_event_at ? Date.parse(previous.last_event_at) : NaN;
    let reason = !Number.isFinite(time) || !Number.isFinite(before) ? 'provider_timestamp_missing' : time < before ? 'older_provider_snapshot' :
      time === before && digest !== gelatoSnapshotDigest(fulfillmentSnapshot(GelatoProviderOrderSchema.parse(previous.snapshot))) && !unchangedTimeDraftConversion(previous, order) ? 'conflicting_provider_snapshot' :
      gelatoTransitionReason(previous.status, order.fulfillmentStatus, previous.order_type, order.orderType, previous.progress_status);
    const accepted = !reason;
    const safetyReason = engineering ? gelatoTestSafetyReason(order) : null;
    const items = order.items.map((item) => {
      const member = context.members.find((entry) => entry.item_reference_id === item.itemReferenceId);
      if (!member || member.provider_order_id !== order.id || member.provider_item_id !== item.id) throw new Error('Gelato refresh item identity changed');
      const mapping = gelatoPackagesForItem(order, item.id, item.quantity);
      const itemReason = reason ?? gelatoTransitionReason(member.status, item.fulfillmentStatus, previous.order_type, order.orderType, member.progress_status) ?? mapping.reason;
      return { itemReferenceId: item.itemReferenceId, providerItemId: item.id, status: itemReason ? member.status : item.fulfillmentStatus,
        orderType: itemReason ? previous.order_type : order.orderType, actionReason: itemReason ?? safetyReason ?? (order.orderType === 'draft' ? 'awaiting_draft_review' : item.fulfillmentStatus === 'on_hold' ? 'provider_on_hold' : null),
        tracking: itemReason ? null : mapping.tracking };
    });
    // Keep accepted provider facts, including actual payment/tracking. Attention is not a rollback or cancellation.
    reason ??= safetyReason;
    if (items.some((item) => item.actionReason && item.actionReason !== 'awaiting_draft_review')) reason ??= 'item_requires_review';
    const financial = order.financialObservation;
    const priorFinancial = previous.financial_observation ?? GelatoProviderOrderSchema.parse(previous.snapshot).financialObservation;
    const financialConflict = Boolean(financial && priorFinancial && time === before && canonical(financial) !== canonical(priorFinancial) && !unchangedTimeDraftConversion(previous, order));
    return { providerOrderId: order.id, snapshot: fulfillmentSnapshot(order), digest, status: accepted ? order.fulfillmentStatus : previous.status,
      orderType: accepted ? order.orderType : previous.order_type, actionReason: reason, accepted, items,
      financialObservation: financial ?? null, financialAccepted: accepted && !financialConflict && !financial?.reviewReason,
      financialActionReason: financial?.reviewReason ?? (financialConflict ? 'same_timestamp_financial_change' : null) };
  });
}
export async function refreshGelatoSubmission(submissionId: string, dependencies: GelatoLifecycleDependencies) {
  const context = await dependencies.store.load(submissionId);
  if (context.submission.request_state !== 'submitted') throw new Error('Gelato submission requires recovery before refresh');
  const saved = GelatoSavedSnapshotSchema.parse(context.submission.request_snapshot);
  const expected = context.providerOrders.map((entry) => ({ providerOrderId: entry.provider_order_id, digest: entry.snapshot_digest, eventAt: entry.last_event_at, observationRevision: entry.observation_revision ?? 0 }));
  let results: ReturnType<typeof buildGelatoLifecycleResults>;
  try { const graph = await validateGelatoConnectedOrdersWithFiles(await loadGelatoConnectedOrders(context.providerOrders.map((entry) => entry.provider_order_id), dependencies.get ?? getGelatoOrder), saved.request, (reference, url, expected) => { const members = context.members.filter((member) => member.item_reference_id === reference); if (members.length !== 1 || !dependencies.verifyStoredFile) return Promise.resolve(false); return dependencies.verifyStoredFile(members[0], url, expected); }); results = buildGelatoLifecycleResults(context, graph); }
  catch (error) {
    await dependencies.store.transition('hold_gelato_provider_refresh', { p_submission_id: submissionId, p_expected: expected, p_reason: 'provider_refresh_requires_review' });
    if (error instanceof GelatoProviderReadError) throw error;
    throw new Error('Gelato refresh did not establish a valid provider snapshot');
  }
  const rows = dependencies.loadOrder ? (await Promise.all(context.members.map((member) => dependencies.loadOrder!(member.child_order_key)))).filter((row): row is Record<string, unknown> => row !== null) : [];
  const notifications = dependencies.loadOrder ? buildGelatoNotificationIntents(context, results, rows, dependencies.notificationFrom ?? 'Little Hero Labs <notifications@littleherolabs.com>') : { intents: [], holds: [] };
  await dependencies.store.transition('apply_gelato_provider_snapshots', { p_submission_id: submissionId,
    p_expected: expected, p_results: results, p_notifications: notifications.intents, p_notification_holds: notifications.holds });
  return { submissionId, refreshed: true, needsAttention: results.some((result) => result.actionReason || result.financialActionReason) };
}
export async function recoverGelatoSubmission(submissionId: string, dependencies: GelatoLifecycleDependencies) {
  const execution = `gelato-recovery-${randomUUID()}`;
  const decision = await dependencies.store.transition('begin_gelato_reconciliation', { p_submission_id: submissionId, p_execution_id: execution }) as { recover: boolean; released?: boolean; claimToken?: string };
  if (!decision.recover) return { submissionId, recovered: false, released: decision.released === true };
  const context = await dependencies.store.load(submissionId);
  const owner = { p_submission_id: submissionId, p_token: decision.claimToken, p_execution_id: execution };
  let holdReason = 'provider_outcome_requires_review';
  try {
    const saved = GelatoSavedSnapshotSchema.parse(context.submission.request_snapshot);
    const root = context.submission.accepted_root_order_id;
    const searched = await (dependencies.search ?? searchGelatoOrders)(context.submission.order_reference_id);
    const ids = [...new Set([...searched, ...(root ? [root] : [])])];
    if (!ids.length) throw new Error('Gelato search did not establish an outcome');
    const graph = await validateGelatoConnectedOrdersWithFiles(await loadGelatoConnectedOrders(ids, dependencies.get ?? getGelatoOrder), saved.request, (reference, url, expected) => { const members = context.members.filter((member) => member.item_reference_id === reference); if (members.length !== 1 || !dependencies.verifyStoredFile) return Promise.resolve(false); return dependencies.verifyStoredFile(members[0], url, expected); });
    if (isGelatoEngineeringOrderKey(context.submission.root_order_id) || context.members.some(member => isGelatoEngineeringOrderKey(member.child_order_key))) {
      const unsafe = graph.map(gelatoTestSafetyReason).find(reason => reason !== null);
      if (unsafe) { holdReason = unsafe; throw new Error('Engineering recovery requires an unconverted draft'); }
    }
    const candidate = root ?? graph.find((entry) => {
      const seen = new Set([entry.id]);
      for (let changed = true; changed;) { changed = false; for (const next of graph) if (seen.has(next.id)) for (const id of next.connectedOrderIds) if (!seen.has(id)) { seen.add(id); changed = true; } }
      return seen.size === graph.length;
    })?.id;
    if (!candidate) throw new Error('Gelato search returned disconnected results');
    await dependencies.store.transition('record_gelato_accepted_root', { ...owner, p_root_id: candidate });
    await dependencies.store.transition('persist_gelato_print_result', { ...owner, p_orders: graph });
    return { submissionId, recovered: true, providerOrderIds: graph.map((entry) => entry.id) };
  } catch {
    await dependencies.store.transition('finish_gelato_reconciliation_hold', { ...owner, p_reason: holdReason }).catch(() => undefined);
    throw new Error('Gelato recovery is held; do not create another provider order');
  }
}
export async function cancelGelatoSubmission(submissionId: string, dependencies: GelatoLifecycleDependencies) {
  if (!dependencies.cancelEnabled) throw new Error('Gelato cancellation is disabled');
  await refreshGelatoSubmission(submissionId, dependencies);
  const context = await dependencies.store.load(submissionId);
  if (context.providerOrders.some((entry) => entry.action_reason || !canCancelGelatoOrder(entry.order_type ?? '', [entry.status, ...(entry.progress_status ? [entry.progress_status] : [])])) ||
      context.members.some((entry) => !canCancelGelatoOrder('order', [entry.status ?? '', ...(entry.progress_status ? [entry.progress_status] : [])]))) throw new Error('Gelato cancellation is unavailable for this group');
  const attempts: Array<{ providerOrderId: string; cancelOutcome: 'accepted' | 'unconfirmed'; verifiedStatus: string | null }> = [];
  for (const order of context.providerOrders) {
    let cancelOutcome: 'accepted' | 'unconfirmed' = 'accepted';
    try { await (dependencies.cancel ?? cancelGelatoOrder)(order.provider_order_id); } catch { cancelOutcome = 'unconfirmed'; }
    attempts.push({ providerOrderId: order.provider_order_id, cancelOutcome, verifiedStatus: null });
  }
  let verified = true;
  try { await refreshGelatoSubmission(submissionId, dependencies); } catch { verified = false; }
  const updated = await dependencies.store.load(submissionId);
  for (const attempt of attempts) attempt.verifiedStatus = verified ? updated.providerOrders.find((entry) => entry.provider_order_id === attempt.providerOrderId)?.status ?? null : null;
  const canceled = verified && updated.providerOrders.length === attempts.length && attempts.every((attempt) => attempt.verifiedStatus === 'canceled') && updated.providerOrders.every((entry) => !entry.action_reason) &&
    updated.members.every((member) => member.status === 'canceled' && !member.action_reason);
  if (!canceled) {
    await dependencies.store.transition('hold_gelato_provider_refresh', { p_submission_id: submissionId,
      p_expected: updated.providerOrders.map((entry) => ({ providerOrderId: entry.provider_order_id, digest: entry.snapshot_digest, eventAt: entry.last_event_at, observationRevision: entry.observation_revision ?? 0 })),
      p_reason: 'partial_cancellation_requires_review' });
  }
  return { submissionId, canceled, needsAttention: !canceled, providerOrders: attempts };
}
