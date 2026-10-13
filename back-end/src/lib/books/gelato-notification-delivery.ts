import { z } from 'zod';
import { GelatoNotificationPayloadSchema, type GelatoNotificationPayload } from './gelato-notifications';
import type { GelatoSubmissionStore } from './gelato-submission-store';

const Claim = z.object({ claimed: z.boolean(), attemptToken: z.string().uuid().optional(), payload: z.unknown().optional(), idempotencyKey: z.string().optional() });
export interface GelatoNotificationDeliveryDependencies {
  store: Pick<GelatoSubmissionStore, 'transition'>;
  enabled: boolean;
  ready?: (payload: GelatoNotificationPayload) => boolean;
  send: (payload: GelatoNotificationPayload, idempotencyKey: string, signal: AbortSignal) => Promise<{ success: boolean; messageId?: string }>;
}
export async function deliverGelatoNotification(id: string, dependencies: GelatoNotificationDeliveryDependencies, signal: AbortSignal = AbortSignal.timeout(30_000)) {
  if (!dependencies.enabled) return { delivered: false, disabled: true };
  const claim = Claim.parse(await dependencies.store.transition('claim_gelato_notification', { p_notification_id: id }));
  if (!claim.claimed) return { delivered: false, claimed: false };
  if (!claim.attemptToken || !claim.idempotencyKey) throw new Error('Gelato notification claim lacks send identity');
  const owner = { p_notification_id: id, p_token: claim.attemptToken };
  const parsed = GelatoNotificationPayloadSchema.safeParse(claim.payload);
  if (!parsed.success) {
    await dependencies.store.transition('release_gelato_notification', { ...owner, p_hold: true });
    return { delivered: false, held: true };
  }
  if (signal.aborted || (dependencies.ready && !dependencies.ready(parsed.data))) {
    await dependencies.store.transition('release_gelato_notification', { ...owner, p_hold: false });
    return { delivered: false, unavailable: true };
  }
  const decision = z.object({ send: z.boolean() }).parse(await dependencies.store.transition('authorize_gelato_notification', owner));
  if (!decision.send) return { delivered: false, held: true };
  let result: { success: boolean; messageId?: string };
  try { result = await dependencies.send(parsed.data, claim.idempotencyKey, signal); }
  catch { result = { success: false }; }
  await dependencies.store.transition('finish_gelato_notification', { ...owner, p_confirmed: result.success, p_external_id: result.messageId ?? null });
  return { delivered: result.success, ambiguous: !result.success };
}
