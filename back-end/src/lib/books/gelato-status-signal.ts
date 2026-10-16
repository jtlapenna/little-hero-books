import { refreshGelatoSubmission, type GelatoLifecycleDependencies } from './gelato-lifecycle';
import { GelatoIdSchema } from './gelato-provider-snapshot';

// Events identify an order only; persisted status always comes from an authoritative refresh.
export async function refreshGelatoStatusSignal(orderId: string, dependencies: {
  resolve: (providerOrderId: string) => Promise<string | null>;
  lifecycle: GelatoLifecycleDependencies;
}) {
  const id=GelatoIdSchema.parse(orderId);
  const submissionId=await dependencies.resolve(id);
  if(!submissionId)return {accepted:false};
  const result=await refreshGelatoSubmission(submissionId,dependencies.lifecycle);
  return {accepted:true,needsAttention:result.needsAttention};
}
