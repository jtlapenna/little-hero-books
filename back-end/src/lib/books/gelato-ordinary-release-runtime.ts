/** Deployment composition. The unresolved financial adapter is explicit and cannot be enabled by a request or environment flag. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { OrdinaryReleasePermitSchema, type OrdinaryReleaseDependencies } from './gelato-ordinary-release-core';
import { createOrdinaryReleaseStore, registerReviewedOrdinaryRelease } from './gelato-ordinary-release-store';
import type { OrdinaryReleaseRuntime } from './gelato-ordinary-release-application';

export function composeOrdinaryReleaseRuntime(database: SupabaseClient, release: Omit<OrdinaryReleaseDependencies, 'store'>,
  approvers: ReadonlySet<string>): OrdinaryReleaseRuntime {
  if (!approvers.size) return { kind: 'blocked', blockers: ['print_release_approver_not_configured'] };
  return { kind: 'ready', application: {
    release: { ...release, store: createOrdinaryReleaseStore(database) }, approvers,
    register: input => registerReviewedOrdinaryRelease(database, input),
    async approved(id) {
      const { data, error } = await database.from('gelato_ordinary_release_permits').select('permit,approval_actor').eq('id', id).maybeSingle();
      if (error) throw Error('Recorded print approval unavailable');
      return data ? { permit: OrdinaryReleasePermitSchema.parse(data.permit), actor: data.approval_actor } : null;
    },
  } };
}

/** No synthetic payable evidence in production. Product/shipping quote is not a verified final payable commitment. */
export async function ordinaryReleaseApplicationRuntime(): Promise<OrdinaryReleaseRuntime> {
  return { kind: 'blocked', blockers: ['payable_price_policy_decision_required', 'verified_payable_adapter_not_installed',
    'specific_paid_order_and_activation_approval_required'] };
}
