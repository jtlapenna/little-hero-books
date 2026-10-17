import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getGelatoOrder, GelatoProviderReadError } from './gelato-api-client';
import { refreshGelatoSubmission, type GelatoLifecycleDependencies } from './gelato-lifecycle';
import { gelatoLifecycleRuntime } from './gelato-lifecycle-runtime';
import { GelatoStoreError } from './gelato-submission-store';

const Job = z.object({ submission_id: z.string().uuid(), lease_token: z.string().uuid() });
export async function withinGelatoDeadline<T>(signal: AbortSignal, work: () => PromiseLike<T>): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error('Gelato work deadline exceeded'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(work).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

// Separate opt-in scheduler. It never calls the legacy global selector/recovery/sender.
export async function pollRegisteredGelatoStatus(database: SupabaseClient, options: {
  enabled?: boolean; apiKey?: string; budgetMs?: number; candidateBudgetMs?: number; cleanupBudgetMs?: number;
  lifecycle?: (signal: AbortSignal) => GelatoLifecycleDependencies;
} = {}) {
  const summary = { checked: 0, refreshed: 0, errors: 0, needsAttention: 0, disabled: false, delivered: 0, customerMessages: false };
  if (!(options.enabled ?? process.env.GELATO_SCHEDULED_STATUS_ENABLED === 'true')) return { ...summary, disabled: true };
  const apiKey = options.apiKey ?? process.env.GELATO_STATUS_API_KEY;
  if (!apiKey?.trim()) throw Error('Dedicated Gelato status account is not configured');
  const keyHash = createHash('sha256').update(apiKey).digest('hex');
  const budget = Math.min(10_000, Math.max(20, options.budgetMs ?? 10_000)), deadline = Date.now() + budget;
  const cleanupBudget = Math.min(1000, Math.max(5, options.cleanupBudgetMs ?? 750));
  for (let count = 0; count < 3 && deadline - Date.now() > cleanupBudget + 10; count++) {
    const claimSignal = AbortSignal.timeout(Math.min(1000, Math.max(1, deadline - Date.now() - cleanupBudget)));
    let job: z.infer<typeof Job>;
    try {
      const { data, error } = await withinGelatoDeadline(claimSignal, () => database.rpc('claim_gelato_scheduled_status', {
        p_account_key_sha256: keyHash, p_lease_seconds: 30,
      }).abortSignal(claimSignal).then(result => result));
      if (error) throw Error('Scheduled claim failed');
      const claimed = z.array(Job).max(1).parse(data);
      if (!claimed.length) break;
      job = claimed[0];
    } catch { summary.errors++; break; }
    summary.checked++;
    const signal = AbortSignal.timeout(Math.min(options.candidateBudgetMs ?? 2500, Math.max(1, deadline - Date.now() - cleanupBudget)));
    let disposition: 'success' | 'requires_review' | 'failed' = 'failed';
    let classification: string | null = null, httpStatus: number | null = null, retryAfter: number | null = null;
    try {
      const original = options.lifecycle?.(signal) ?? gelatoLifecycleRuntime(signal, database);
      let allowedRoots: Set<string> | undefined;
      const lifecycle: GelatoLifecycleDependencies = { ...original, loadOrder: undefined, cancelEnabled: false,
        get: async id => { if (!allowedRoots?.has(id)) throw Error('Scheduled provider root is outside its saved graph');
          return original.get ? original.get(id) : getGelatoOrder(id, { apiKey, signal }); },
        search: async () => { throw Error('Scheduled status cannot search/create/recover'); }, cancel: async () => { throw Error('Scheduled status cannot cancel'); },
        store: {
          load: async id => { if (id !== job.submission_id) throw Error('Scheduled submission differs');
            const context = await original.store.load(id); allowedRoots = new Set(context.providerOrders.map(order => order.provider_order_id)); return context; },
          transition: async (name, parameters) => {
            if (parameters.p_submission_id !== job.submission_id) throw Error('Scheduled submission differs');
            const rpc = name === 'apply_gelato_provider_snapshots' ? 'apply_gelato_scheduled_snapshots' : name === 'hold_gelato_provider_refresh' ? 'hold_gelato_scheduled_refresh' : null;
            if (!rpc) throw Error('Scheduled status transition is forbidden');
            const { data, error } = await database.rpc(rpc, { ...parameters, p_poll_token: job.lease_token }).abortSignal(signal);
            if (error) throw new GelatoStoreError('Scheduled status persistence was not confirmed'); return data;
          },
        },
      };
      const result = await withinGelatoDeadline(signal, () => refreshGelatoSubmission(job.submission_id, lifecycle));
      summary.refreshed++; if (result.needsAttention) summary.needsAttention++;
      disposition = result.needsAttention ? 'requires_review' : 'success';
    } catch (error) {
      summary.errors++;
      classification = signal.aborted ? 'timeout' : error instanceof GelatoProviderReadError ? error.classification : error instanceof GelatoStoreError ? 'database_failure' : 'invalid_snapshot';
      if (error instanceof GelatoProviderReadError) { httpStatus = error.httpStatus ?? null; retryAfter = error.retryAfterSeconds ?? null; }
    }
    // The work signal may already be aborted. Cleanup has its own bounded signal;
    // SQL token/expiry fencing prevents any abandoned work from applying later.
    const cleanup = AbortSignal.timeout(Math.min(cleanupBudget, Math.max(1, deadline - Date.now())));
    try {
      const { error } = await withinGelatoDeadline(cleanup, () => database.rpc('finish_gelato_scheduled_status', {
        p_submission_id: job.submission_id, p_poll_token: job.lease_token, p_result: disposition,
        p_error_class: classification, p_http_status: httpStatus, p_retry_after_seconds: retryAfter,
      }).abortSignal(cleanup).then(result => result));
      if (error) throw Error('Scheduled attempt completion failed');
    } catch { summary.errors++; }
  }
  return summary;
}
