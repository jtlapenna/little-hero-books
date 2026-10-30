/** Deployment composition. Source installation gate stays OFF pending release/activation review. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AnyOrdinaryReleasePermitSchema, AnyOrdinaryReleasePacketSchema, type OrdinaryReleaseDependencies } from './gelato-ordinary-release-core';
import { createOrdinaryReleaseStore, registerReviewedOrdinaryRelease } from './gelato-ordinary-release-store';
import type { OrdinaryReleaseRuntime } from './gelato-ordinary-release-application';

export function composeOrdinaryReleaseRuntime(database: SupabaseClient, release: Omit<OrdinaryReleaseDependencies, 'store'>,
  approvers: ReadonlySet<string>): OrdinaryReleaseRuntime {
  if (!approvers.size) return { kind: 'blocked', blockers: ['print_release_approver_not_configured'] };
  return { kind: 'ready', application: {
    release: { ...release, store: createOrdinaryReleaseStore(database), approvedPacket: async id => {
      const {data,error}=await database.from('gelato_ordinary_release_permits').select('packet').eq('id',id)
        .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
      if(error || !data)throw Error('Recorded print packet unavailable');
      return AnyOrdinaryReleasePacketSchema.parse(data.packet);
    } }, approvers,
    register: input => registerReviewedOrdinaryRelease(database, input),
    async approved(id) {
      const { data, error } = await database.from('gelato_ordinary_release_permits').select('permit,approval_actor').eq('id', id)
        .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
      if (error) throw Error('Recorded print approval unavailable');
      return data ? { permit: AnyOrdinaryReleasePermitSchema.parse(data.permit), actor: data.approval_actor } : null;
    },
  } };
}

export const ORDINARY_ESTIMATE_INSTALLATION_ENABLED=false;
/** Estimate policy implemented, but this source gate deliberately prevents any
 * credential/service loading or payment even when environment flags are true. */
export async function ordinaryReleaseApplicationRuntime(): Promise<OrdinaryReleaseRuntime> {
  if(!ORDINARY_ESTIMATE_INSTALLATION_ENABLED)return { kind: 'blocked', blockers: ['estimate_policy_requires_reviewed_publication_and_activation',
    'specific_paid_order_and_activation_approval_required'] };
  const {productionOrdinaryEstimateRuntime}=await import('./gelato-ordinary-release-server');
  return productionOrdinaryEstimateRuntime();
}
