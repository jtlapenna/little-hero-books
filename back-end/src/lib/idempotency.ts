/**
 * Idempotency helper for D2C checkout and Stripe webhook.
 * First request with a key runs the handler and stores the response; duplicate keys within TTL return the stored response.
 * See: docs/D2C-planning/implementation-plan/D2C-phase-0-orders-only.md Section 3
 */

import { supabase } from './supabase-client';

const DEFAULT_TTL_HOURS = 24;

export interface IdempotentResponse {
  status: number;
  body: unknown;
}

export type IdempotentHandler = () => Promise<IdempotentResponse>;

export interface WithIdempotencyOptions {
  ttlHours?: number;
}

/**
 * Run an operation with idempotency: if the key was already used within TTL, return the stored response; otherwise run the handler, store the response, and return it.
 * Handles race: if two requests with the same key run concurrently, the first to insert wins; the second returns the stored response after conflict.
 */
export async function withIdempotency(
  key: string,
  handler: IdempotentHandler,
  options: WithIdempotencyOptions = {}
): Promise<IdempotentResponse> {
  const ttlHours = options.ttlHours ?? DEFAULT_TTL_HOURS;
  const ttlMs = ttlHours * 60 * 60 * 1000;

  const { data: existing } = await supabase
    .from('idempotency_keys')
    .select('response_status, response_body, created_at')
    .eq('key', key)
    .maybeSingle();

  if (existing?.created_at) {
    const createdAt = new Date(existing.created_at).getTime();
    if (Date.now() - createdAt < ttlMs) {
      return {
        status: existing.response_status as number,
        body: existing.response_body as unknown,
      };
    }
  }

  const response = await handler();

  const { error } = await supabase.from('idempotency_keys').insert({
    key,
    response_status: response.status,
    response_body: response.body,
    created_at: new Date().toISOString(),
    ttl_hours: ttlHours,
  });

  if (error) {
    if (error.code === '23505') {
      const { data: stored } = await supabase
        .from('idempotency_keys')
        .select('response_status, response_body')
        .eq('key', key)
        .single();
      if (stored) {
        return {
          status: stored.response_status as number,
          body: stored.response_body as unknown,
        };
      }
    }
    console.error('[Idempotency] Failed to store key:', key, error);
    return response;
  }

  return response;
}
