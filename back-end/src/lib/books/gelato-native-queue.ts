/** Native W1 bridge: no provider creation/conversion, scheduling, or customer messages. */
import { z } from 'zod';
import { ordinaryPrintRoutingBlocker } from './gelato-print-admission';
import type { FrozenPrintRouting, PrintRoutingOrder } from './print-routing';
import type { GelatoPrintClaim } from './claim-gelato-print-routing';

export const NativePrintQueueInput = z.object({
  orderDbIds: z.array(z.number().int().positive().safe()).min(1).max(5),
}).strict().refine(v => new Set(v.orderDbIds).size === v.orderDbIds.length, 'Duplicate queue member');
const identity = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const Claim = z.object({ dispatch: z.boolean(), submissionId: z.string().uuid().optional(), claimToken: z.string().uuid().optional(), orderReferenceId: identity.optional(), reason: z.string().max(200).optional() });
const rootOf = (row: PrintRoutingOrder) => identity.parse(row.root_order_id ?? row.amazon_order_id ?? row.orderId);
export type NativeQueueGroup = {
  provider: 'gelato' | 'lulu' | 'unresolved'; dispatchRoute: 'dispatch' | 'legacy' | 'hold';
  orderDbIds: number[]; holdReason?: string; [key: string]: unknown;
};
export interface NativeQueueDependencies {
  draftsEnabled: boolean;
  loadOrders(ids: number[]): Promise<PrintRoutingOrder[]>;
  loadMembers(root: string): Promise<Array<{ id: number; orderId: string }>>;
  claim(ids: number[], idempotencyKey: string): Promise<{ provider: 'lulu' | 'gelato'; routes: FrozenPrintRouting[]; claim: GelatoPrintClaim | null }>;
  fence(submissionId: string, claimToken: string): Promise<boolean>;
}
function exactIds(ids: number[], rows: Array<{ id: number }>) {
  const actual = rows.map(row => row.id);
  return actual.every(id => Number.isSafeInteger(id) && id > 0) && new Set(actual).size === actual.length && actual.length === ids.length && ids.every(id => actual.includes(id));
}
function ready(row: PrintRoutingOrder) {
  return row.execution_status === 'ready_for_processing' && ['4','4-aggregate'].includes(String(row.next_workflow)) &&
    !row.current_workflow && !row.started_at && !row.lulu_job_id && !row.lulu_status;
}
export async function runNativePrintQueue(raw: unknown, d: NativeQueueDependencies) {
  const { orderDbIds } = NativePrintQueueInput.parse(raw);
  const rows = await d.loadOrders(orderDbIds);
  if (!exactIds(orderDbIds, rows) || new Set(rows.map(r => r.orderId)).size !== rows.length) throw Error('Queue identity mismatch');
  const groups = new Map<string, PrintRoutingOrder[]>();
  for (const row of rows) { identity.parse(row.orderId); const root = rootOf(row); groups.set(root, [...(groups.get(root) ?? []), row]); }
  const results: NativeQueueGroup[] = [];
  for (const [root, members] of groups) {
    const ids = members.map(r => r.id).sort((a,b) => a-b);
    const hold = (reason: string): NativeQueueGroup => ({ provider:'unresolved', dispatchRoute:'hold', orderDbIds:ids, holdReason:reason });
    let acquired: z.infer<typeof Claim> | undefined;
    try {
      if (members.some(r => !['lulu','gelato'].includes(String(r.print_provider))) || new Set(members.map(r => r.print_provider)).size !== 1) { results.push(hold('provider_unassigned_or_mixed')); continue; }
      const blocker = members[0].print_provider==='gelato' ? members.map(r=>ordinaryPrintRoutingBlocker(r,d.draftsEnabled)).find(Boolean) : null;
      if(blocker){results.push(hold(blocker));continue;}
      // Do not hydrate extra candidates after cron has budgeted complete groups.
      const stored = await d.loadMembers(root);
      if (!exactIds(ids, stored) || stored.some(m => members.find(r => r.id===m.id)?.orderId !== m.orderId)) { results.push(hold('incomplete_or_changed_group')); continue; }
      if (members[0].print_provider === 'lulu') {
        // The original legacy classifier/claim/shipping path remains byte-for-byte unchanged.
        results.push({provider:'lulu',dispatchRoute:'legacy',orderDbIds:ids}); continue;
      }
      if (members.some(r => !ready(r))) { results.push(hold('current_group_not_ready')); continue; }
      const idempotencyKey = `w1.1:${root}:${ids.join('-')}`;
      if (idempotencyKey.length > 255) { results.push(hold('invalid_group_identity')); continue; }
      const claimed = await d.claim(ids,idempotencyKey);
      const maybe = claimed.claim as Record<string,unknown> | null;
      if (maybe && maybe.dispatch !== false && z.string().uuid().safeParse(maybe.submissionId).success && z.string().uuid().safeParse(maybe.claimToken).success) {
        acquired = {dispatch:false,submissionId:String(maybe.submissionId),claimToken:String(maybe.claimToken)};
      }
      if (claimed.provider !== 'gelato' || !Array.isArray(claimed.routes) || !exactIds(ids,claimed.routes.map(r => ({id:r.orderDbId})))) throw Error('Queue claim membership mismatch');
      const claim = Claim.parse(claimed.claim);
      if (!claim.dispatch) { results.push(hold('claim_not_granted')); continue; }
      if (!claim.submissionId || !claim.claimToken || !claim.orderReferenceId) throw Error('Queue claim identity missing');
      const routes = claimed.routes;
      const first = routes[0];
      if (routes.some(r => r.provider !== 'gelato' || r.rootOrderId !== root || members.find(m=>m.id===r.orderDbId)?.orderId !== r.orderId ||
        r.bookId !== first.bookId || r.configVersion !== first.configVersion || !identity.safeParse(r.bookId).success ||
        !Number.isSafeInteger(r.configVersion) || Number(r.configVersion)<2 || !identity.safeParse(r.formatId).success ||
        !r.productUid || !Number.isSafeInteger(r.apiPageCount) || !Number.isSafeInteger(r.expectedPdfPageCount))) throw Error('Queue frozen routing differs');
      results.push({provider:'gelato',dispatchRoute:'dispatch',orderDbIds:ids,rootOrderId:root,idempotencyKey,
        routeKind:routes.length>1?'sibling':'single',orderId:routes.length===1?first.orderId:null,
        submissionId:claim.submissionId,claimToken:claim.claimToken,orderReferenceId:claim.orderReferenceId,
        bookId:first.bookId,formatId:first.formatId,configVersion:first.configVersion,orders:routes});
    } catch {
      if (acquired?.submissionId && acquired.claimToken) {
        let fenced=false;try{fenced=await d.fence(acquired.submissionId,acquired.claimToken);}catch{ /* Unknown fence is a hold, never a retry/create. */ }
        results.push(hold(fenced?'claim_validation_failed_fenced':'claim_validation_failed_fence_unconfirmed'));
      } else results.push(hold('queue_preparation_or_claim_unconfirmed'));
    }
  }
  return {success:true as const,groups:results,customerMessages:false as const};
}
