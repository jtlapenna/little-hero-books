import { GelatoProviderOrderSchema } from './gelato-provider-snapshot';
import { GelatoSavedSnapshotSchema } from './gelato-submission';
import { gelatoNotificationTarget } from './gelato-notification-target';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { buildEmailHtml, buildParagraph } from '@/lib/notifications/email-templates';
import type { GelatoSubmissionContext } from './gelato-submission-store';
import type { buildGelatoLifecycleResults } from './gelato-lifecycle';

const Email = z.object({ from: z.string().min(1), to: z.string().email(), subject: z.string(), text: z.string(), html: z.string() }).strict();
const Common = { childOrderIds: z.array(z.number().int().positive()).min(1), childOrderKeys: z.array(z.string()).min(1) };
const Tracking = { providerOrderId: z.string(), packageId: z.string(), trackingNumber: z.string().min(1), trackingUrl: z.string(), carrier: z.enum(['USPS', 'UPS', 'FedEx', 'DHL']), shipDate: z.string().datetime({ offset: true }) };
export const GelatoNotificationPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('d2c-printing'), ...Common, email: Email }).strict(),
  z.object({ kind: z.literal('d2c-shipped'), ...Common, ...Tracking, email: Email }).strict(),
  z.object({ kind: z.literal('amazon-shipped'), ...Common, ...Tracking, amazonOrderId: z.string().regex(/^\d{3}-\d{7}-\d{7}$/),
    orderItems: z.array(z.object({ orderItemId: z.string().min(1), quantity: z.number().int().positive() })).min(1), packageReferenceId: z.string().regex(/^[1-9]\d*$/).optional() }).strict(),
]);
export type GelatoNotificationPayload = z.infer<typeof GelatoNotificationPayloadSchema>;
export interface GelatoNotificationIntent { childOrderId: number; type: string; payload: GelatoNotificationPayload }
function object(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') { try { return object(JSON.parse(value)); } catch { return {}; } }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function escape(value: string) { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!); }
function emailBody(row: Record<string, unknown>, kind: 'printing' | 'shipped', from: string, tracking?: { carrier: string; trackingNumber: string; trackingUrl: string }) {
  const child = text(object(row.character_specs).childName) || 'Your child';
  const subject = `${child}'s book is ${kind === 'printing' ? 'printing' : 'on its way'} | Little Hero Labs`;
  const message = kind === 'printing' ? `${child}'s personalized book is being printed.` : `${child}'s personalized book is with the carrier.`;
  const trackingText = tracking ? `\n\nCarrier: ${tracking.carrier}\nTracking number: ${tracking.trackingNumber}` : '';
  return Email.parse({ from, to: text(row.customer_email), subject, text: message + trackingText,
    html: buildEmailHtml({ heading: escape(subject.split(' | ')[0]), body: buildParagraph(escape(message)) + (tracking ? buildParagraph(escape(trackingText).replace(/\n/g, '<br>')) : '') }) });
}
export function buildGelatoNotificationIntents(context: GelatoSubmissionContext, results: ReturnType<typeof buildGelatoLifecycleResults>, rows: Record<string, unknown>[], from: string) {
  const holds: Array<{ childOrderId: number; reason: string }> = [];
  const targets = GelatoSavedSnapshotSchema.parse(context.submission.request_snapshot).notificationTargets ?? [];
  const intents: GelatoNotificationIntent[] = [];
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  const parcels = new Map<string, { intent: GelatoNotificationIntent; itemIds: Set<string>; expectedIds: Set<string>; childIds: Set<number>; conflict: boolean }>();
  for (const result of results) for (const item of result.items) {
    if (item.orderType !== 'order' || item.actionReason) continue;
    const member = context.members.find((member) => member.item_reference_id === item.itemReferenceId)!;
    const row = byId.get(member.child_order_id);
    if (!row || row.print_provider !== 'gelato' || row.print_submission_id !== context.submission.id) continue;
    const target = targets.find((entry) => entry.childOrderId === member.child_order_id);
    if (!target || !isDeepStrictEqual(target, gelatoNotificationTarget(row, member.child_order_key))) { holds.push({ childOrderId: member.child_order_id, reason: 'notification_target_requires_review' }); continue; }
    const amazon = target.platform === 'amazon';
    const common = { childOrderIds: [member.child_order_id], childOrderKeys: [member.child_order_key] };
    if (!amazon && ['in_production', 'printed'].includes(item.status ?? '')) {
      try { intents.push({ childOrderId: member.child_order_id, type: 'd2c-printing', payload: { kind: 'd2c-printing', ...common, email: emailBody(row, 'printing', from) } }); } catch { holds.push({ childOrderId: member.child_order_id, reason: 'customer_contact_requires_review' }); }
    }
    if (!['shipped', 'in_transit'].includes(item.status ?? '') && !(amazon && item.status === 'delivered')) continue;
    if (amazon && !(item.tracking?.length)) { holds.push({ childOrderId: member.child_order_id, reason: 'package_notification_requires_review' }); continue; }
    for (const parcel of item.tracking ?? []) {
      const key = `${parcel.providerOrderId}:${parcel.packageId}`;
      let shipDate = result.snapshot.updatedAt;
      if (amazon && item.status === 'delivered') {
        const existing = context.notifications?.map((notification) => GelatoNotificationPayloadSchema.safeParse(notification.payload)).find((notification) => notification.success &&
          notification.data.kind === 'amazon-shipped' && notification.data.providerOrderId === parcel.providerOrderId && notification.data.packageId === parcel.packageId &&
          notification.data.trackingNumber === parcel.trackingNumber && notification.data.carrier === parcel.carrier && notification.data.childOrderIds.includes(member.child_order_id));
        const previous = context.providerOrders.find((entry) => entry.provider_order_id === result.providerOrderId);
        const prior = GelatoProviderOrderSchema.safeParse(previous?.snapshot);
        const priorParcel = prior.success && ['shipped', 'in_transit'].includes(prior.data.fulfillmentStatus) ? prior.data.shipment?.packages.find((entry) =>
          entry.id === parcel.packageId && entry.trackingCode === parcel.trackingNumber && entry.orderItemIds.length === parcel.providerItemIds.length && entry.orderItemIds.every((id) => parcel.providerItemIds.includes(id))) : undefined;
        if (existing?.success && existing.data.kind === 'amazon-shipped') shipDate = existing.data.shipDate;
        else if (prior.success && priorParcel && Number.isFinite(Date.parse(prior.data.updatedAt))) shipDate = prior.data.updatedAt;
        else { holds.push({ childOrderId: member.child_order_id, reason: 'amazon_shipment_date_requires_review' }); continue; }
      }
      const tracking = { providerOrderId: parcel.providerOrderId, packageId: parcel.packageId, carrier: parcel.carrier, trackingNumber: parcel.trackingNumber, trackingUrl: parcel.trackingUrl, shipDate };
      try {
        if (!amazon) {
          const payload = GelatoNotificationPayloadSchema.parse({ kind: 'd2c-shipped', ...common, ...tracking, email: emailBody(row, 'shipped', from, parcel) });
          intents.push({ childOrderId: member.child_order_id, type: `d2c-shipped:${key}`, payload });
          continue;
        }
        if (!target.amazonOrderItemId) { holds.push({ childOrderId: member.child_order_id, reason: 'amazon_item_mapping_requires_review' }); continue; }
        const payload = GelatoNotificationPayloadSchema.parse({ kind: 'amazon-shipped', ...common, ...tracking,
          amazonOrderId: target.amazonOrderId, orderItems: [{ orderItemId: target.amazonOrderItemId, quantity: parcel.quantity }] });
        if (payload.kind !== 'amazon-shipped') continue;
        const existing = parcels.get(key);
        if (existing) {
          existing.childIds.add(member.child_order_id);
          for (const affected of context.members) if (parcel.providerItemIds.includes(affected.provider_item_id ?? '')) existing.childIds.add(affected.child_order_id);
        }
        if (!existing) parcels.set(key, { intent: { childOrderId: member.child_order_id, type: `amazon-shipped:${key}`, payload }, itemIds: new Set([item.providerItemId]), expectedIds: new Set(parcel.providerItemIds), childIds: new Set(context.members.filter((entry) => parcel.providerItemIds.includes(entry.provider_item_id ?? '')).map((entry) => entry.child_order_id)), conflict: false });
        else if (existing.intent.payload.kind === 'amazon-shipped' && existing.intent.payload.amazonOrderId === payload.amazonOrderId &&
          existing.intent.payload.trackingNumber === payload.trackingNumber && existing.intent.payload.carrier === payload.carrier) {
          existing.intent.payload.childOrderIds.push(member.child_order_id); existing.intent.payload.childOrderKeys.push(member.child_order_key);
          existing.intent.payload.orderItems.push(...payload.orderItems); existing.itemIds.add(item.providerItemId);
          existing.intent.childOrderId = Math.min(existing.intent.childOrderId, member.child_order_id);
          if (parcel.providerItemIds.length !== existing.expectedIds.size || parcel.providerItemIds.some((id) => !existing.expectedIds.has(id))) existing.conflict = true;
        } else if (existing) {
          existing.conflict = true; existing.childIds.add(member.child_order_id);
        }
      } catch { holds.push({ childOrderId: member.child_order_id, reason: 'package_notification_requires_review' }); }
    }
  }
  for (const parcel of parcels.values()) {
    const payload = parcel.intent.payload;
    if (parcel.conflict || parcel.itemIds.size !== parcel.expectedIds.size || [...parcel.expectedIds].some((id) => !parcel.itemIds.has(id)) ||
      payload.kind !== 'amazon-shipped' || new Set(payload.orderItems.map((item) => item.orderItemId)).size !== payload.orderItems.length) {
      for (const childOrderId of parcel.childIds) holds.push({ childOrderId, reason: 'package_notification_requires_review' });
      continue;
    }
    intents.push(parcel.intent);
  }
  return { intents, holds };
}
