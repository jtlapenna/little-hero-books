import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase-client';

export const GelatoSubmissionSchema = z.object({
  id: z.string().uuid(), provider: z.literal('gelato'), order_reference_id: z.string().min(1),
  root_order_id: z.string().min(1), workflow_job_idempotency_key: z.string(), claim_token: z.string().uuid(),
  lease_expires_at: z.string(), request_state: z.enum(['claimed','submitting','outcome_unknown','submitted','failed']),
  owning_execution_id: z.string().nullable(), send_started_at: z.string().nullable(), accepted_root_order_id: z.string().nullable(),
  quote_snapshot: z.unknown().nullable(), request_snapshot: z.unknown().nullable(),
  quote_id: z.string().nullable(), shipment_method_uid: z.string().nullable(), shipment_policy_version: z.number().nullable(),
  quoted_at: z.string().nullable(), quote_request_fingerprint: z.string().nullable(),
});
export const GelatoMemberSchema = z.object({
  submission_id: z.string().uuid(), item_reference_id: z.string().min(1), child_order_id: z.number().int().positive(), child_order_key: z.string().min(1),
  artifact_key: z.string().nullable(), artifact_fingerprint: z.string().nullable(), artifact_claim_token: z.string().uuid().nullable(), pdf_page_count: z.number().nullable(),
  provider_order_id: z.string().nullable(), provider_item_id: z.string().nullable(), status: z.string().nullable(), action_reason: z.string().nullable().optional(), progress_status: z.string().nullable().optional(),
});
export type GelatoSubmission = z.infer<typeof GelatoSubmissionSchema>;
export type GelatoMember = z.infer<typeof GelatoMemberSchema>;
export const GelatoStoredProviderOrderSchema = z.object({ provider_order_id: z.string(), status: z.string(), progress_status: z.string().nullable().optional(), order_type: z.string().nullable(), last_event_at: z.string().nullable(), snapshot_digest: z.string().nullable(), snapshot: z.unknown(), action_reason: z.string().nullable() });
export type GelatoStoredProviderOrder = z.infer<typeof GelatoStoredProviderOrderSchema>;
export type GelatoSubmissionContext = { submission: GelatoSubmission; members: GelatoMember[]; providerOrders: GelatoStoredProviderOrder[]; notifications?: Array<{ payload: unknown }> };
export interface GelatoSubmissionStore {
  load(id: string): Promise<GelatoSubmissionContext>;
  transition(name: string, parameters: Record<string, unknown>): Promise<unknown>;
}
export function createGelatoSubmissionStore(database: SupabaseClient = supabase, signal?: AbortSignal): GelatoSubmissionStore {
  return {
  async load(id) {
    const [{ data: submission, error }, { data: members, error: memberError }, { data: orders, error: ordersError }, { data: notifications, error: notificationError }] = await Promise.all([
      database.from('print_provider_submissions').select('*').eq('id', id).abortSignal(signal ?? new AbortController().signal).single(),
      database.from('print_provider_submission_items').select('*').eq('submission_id', id).order('child_order_id').abortSignal(signal ?? new AbortController().signal),
      database.from('print_provider_submission_orders').select('*').eq('submission_id', id).order('provider_order_id').abortSignal(signal ?? new AbortController().signal),
      database.from('print_provider_submission_notifications').select('payload').eq('submission_id', id).limit(1000).abortSignal(signal ?? new AbortController().signal),
    ]);
    if (error || memberError || ordersError || notificationError) throw new Error('Gelato submission ownership lookup failed');
    const parsed = GelatoSubmissionSchema.parse(submission);
    const parsedMembers = z.array(GelatoMemberSchema).min(1).max(100).parse(members);
    if (parsedMembers.some((member) => member.submission_id !== parsed.id) || new Set(parsedMembers.map((member) => member.child_order_id)).size !== parsedMembers.length) {
      throw new Error('Gelato submission membership is invalid');
    }
    return { submission: parsed, members: parsedMembers, notifications: z.array(z.object({ payload: z.unknown() })).max(1000).parse(notifications), providerOrders: z.array(GelatoStoredProviderOrderSchema).max(100).parse(orders) };
  },
  async transition(name, parameters) {
    const { data, error } = await database.rpc(name, parameters).abortSignal(signal ?? new AbortController().signal);
    if (error) throw new Error(`Gelato ${name} transition was not confirmed`);
    return data;
  },
  };
}
export const gelatoSubmissionStore = createGelatoSubmissionStore();
