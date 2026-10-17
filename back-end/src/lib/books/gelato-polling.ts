import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getGelatoOrder, searchGelatoOrders } from './gelato-api-client';
import { gelatoLifecycleRuntime } from './gelato-lifecycle-runtime';
import { recoverGelatoSubmission, refreshGelatoSubmission, type GelatoLifecycleDependencies } from './gelato-lifecycle';
import { deliverGelatoNotification, type GelatoNotificationDeliveryDependencies } from './gelato-notification-delivery';
import { gelatoNotificationRuntime } from './gelato-notification-runtime';

const Candidates = z.array(z.object({ id: z.string().uuid(), request_state: z.string() })).max(3);
// Shared scheduled candidate executor. Selection and notification delivery stay with callers.
export async function pollGelatoCandidates(candidates: unknown, lifecycle: GelatoLifecycleDependencies,
  {signal,deadline}: {signal: AbortSignal; deadline: number}) {
  const summary={checked:0,recovered:0,refreshed:0,errors:0,needsAttention:0};
  for (const candidate of Candidates.parse(candidates)) {
    if (Date.now() >= deadline || signal.aborted) break;
    summary.checked++;
    try {
      if (candidate.request_state === 'submitted') { const result=await refreshGelatoSubmission(candidate.id, lifecycle); summary.refreshed++; if(result.needsAttention)summary.needsAttention++; }
      else { const recovered = await recoverGelatoSubmission(candidate.id, lifecycle); if (recovered.recovered || recovered.released) summary.recovered++; }
    } catch { summary.errors++; }
  }
  return summary;
}
export async function pollGelatoPrintProvider(database: SupabaseClient, options: {
  enabled?: boolean; budgetMs?: number; lifecycle?: GelatoLifecycleDependencies; delivery?: GelatoNotificationDeliveryDependencies; suppressNotifications?: boolean;
} = {}) {
  const summary = { checked: 0, recovered: 0, refreshed: 0, delivered: 0, errors: 0, needsAttention: 0, disabled: false };
  if (!(options.enabled ?? process.env.GELATO_STATUS_POLLING_ENABLED === 'true')) return { ...summary, disabled: true };
  const budget = Math.min(10_000, Math.max(1, options.budgetMs ?? 10_000));
  const deadline = Date.now() + budget;
  const signal = AbortSignal.timeout(budget);
  const lifecycle = options.lifecycle ?? { ...gelatoLifecycleRuntime(signal, database), get: (id: string) => getGelatoOrder(id, { signal }), search: (reference: string) => searchGelatoOrders(reference, { signal }) };
  // Dedicated status scheduling must neither construct notification intents nor deliver existing ones.
  const statusLifecycle = options.suppressNotifications ? { ...lifecycle, loadOrder: undefined } : lifecycle;
  const { data, error } = await database.rpc('list_gelato_poll_candidates', { p_limit: 3 }).abortSignal(signal);
  if (error) return { ...summary, errors: 1 };
  const {checked,recovered,refreshed,errors,needsAttention}=await pollGelatoCandidates(data,statusLifecycle,{signal,deadline});
  Object.assign(summary,{checked,recovered,refreshed,errors,needsAttention});
  if (options.suppressNotifications) return summary;
  const delivery = options.delivery ?? gelatoNotificationRuntime(signal, database);
  if (Date.now() < deadline && delivery.enabled) {
    const { data: pending, error: pendingError } = await database.from('print_provider_submission_notifications').select('id')
      .in('delivery_state', ['pending', 'failed', 'ambiguous', 'delivering']).order('updated_at').limit(3).abortSignal(signal);
    if (pendingError) summary.errors++;
    else for (const notification of pending ?? []) {
      if (Date.now() >= deadline || signal.aborted) break;
      try { if ((await deliverGelatoNotification(notification.id, delivery, signal)).delivered) summary.delivered++; }
      catch { summary.errors++; }
    }
  }
  return summary;
}
