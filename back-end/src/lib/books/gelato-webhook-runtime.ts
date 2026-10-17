import { supabase } from '@/lib/supabase-client';
import { getGelatoOrder } from './gelato-api-client';
import { gelatoLifecycleRuntime } from './gelato-lifecycle-runtime';
import { refreshGelatoStatusSignal } from './gelato-status-signal';
import type { GelatoWebhookSignal } from './gelato-webhook';

export async function refreshGelatoWebhook(signal: GelatoWebhookSignal, abort: AbortSignal) {
  // Both IDs must match persisted provider ownership; event item/status/tracking fields are never trusted.
  const { data, error } = await supabase.from('print_provider_submission_orders')
    .select('submission_id').eq('provider', 'gelato').eq('provider_order_id', signal.orderId).abortSignal(abort).maybeSingle();
  if (error) throw new Error('Gelato event mapping lookup failed');
  if (!data) return { accepted: false };
  const lifecycle = gelatoLifecycleRuntime(abort, supabase);
  const load = async (id: string) => {
    const context = await lifecycle.store.load(id);
    if (context.submission.order_reference_id !== signal.orderReferenceId || !context.providerOrders.some(order => order.provider_order_id === signal.orderId)) {
      throw new Error('Gelato event ownership changed');
    }
    return context;
  };
  const context = await lifecycle.store.load(data.submission_id);
  if (context.submission.order_reference_id !== signal.orderReferenceId) return { accepted: false };
  return refreshGelatoStatusSignal(signal.orderId, {
    resolve: async () => data.submission_id,
    lifecycle: { ...lifecycle, store: { ...lifecycle.store, load }, loadOrder: undefined, cancelEnabled: false,
      get: id => getGelatoOrder(id, { signal: abort }),
    },
  });
}
