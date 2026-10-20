/** Server-owned exact-cohort orchestration. No environment, provider send or authority issuer. */
import {z} from 'zod';
import {runNativePrintQueue,type NativeQueueDependencies} from './gelato-native-queue';
import type {PrintRoutingOrder} from './print-routing';
export const GelatoIsolationInput=z.object({scopeId:z.string().uuid(),action:z.enum(['queue','register-status','status','close'])}).strict();
const ids=z.array(z.number().int().positive().safe()).min(1).max(2).refine(v=>new Set(v).size===v.length);
export const GelatoIsolationScope=z.object({scopeId:z.string().uuid(),rootOrderId:z.string().regex(/^TEST-GELATO-[A-Za-z0-9-]{1,38}$/),
 orderDbIds:ids,expiresAt:z.string().datetime({offset:true}),submissionId:z.string().uuid().nullable(),fixtureManifestSha256:z.string().regex(/^[a-f0-9]{64}$/),
 statusClaimsRemaining:z.number().int().min(0).max(3),providerOrderIds:z.array(z.string().min(1).max(200)).max(1)}).strict();
export type IsolationScope=z.infer<typeof GelatoIsolationScope>;
export function assertIsolationRows(scope:IsolationScope,rows:PrintRoutingOrder[]){
 if(rows.length!==scope.orderDbIds.length||new Set(rows.map(r=>r.id)).size!==rows.length||rows.some(r=>!scope.orderDbIds.includes(r.id)||
  (r.root_order_id??r.amazon_order_id??r.orderId)!==scope.rootOrderId||!/^TEST-GELATO-[A-Za-z0-9-]+$/.test(r.orderId)||
  r.print_provider!=='gelato'||!r.book_specs||typeof r.book_specs!=='object'||Array.isArray(r.book_specs)||(r.book_specs as Record<string,unknown>).testMode!==true))throw Error('Isolation rows differ');
}
export interface IsolationDependencies {
 controlsOff():boolean;
 loadScope():Promise<unknown>;
 queue(scope:IsolationScope):Omit<NativeQueueDependencies,'draftsEnabled'|'engineeringAdmission'>;
 registerStatus(scope:IsolationScope):Promise<void>;
 poll(scope:IsolationScope):Promise<unknown>;
 close():Promise<void>;
}
export async function runGelatoIsolation(raw:unknown,d:IsolationDependencies){
 const input=GelatoIsolationInput.parse(raw);
 // Revocation must work even after expiry, key rotation or a control drifting ON.
 if(input.action==='close'){await d.close();return {closed:true,customerMessages:false};}
 if(!d.controlsOff())throw Error('All normal Gelato controls must remain explicitly OFF');
 const scope=GelatoIsolationScope.parse(await d.loadScope());if(scope.scopeId!==input.scopeId)throw Error('Isolation identity differs');
 if(input.action==='queue'){
  if(scope.submissionId)return {success:true,groups:[],alreadyClaimed:true,customerMessages:false};
  const queue=d.queue(scope),load=queue.loadOrders;
  return runNativePrintQueue({orderDbIds:scope.orderDbIds},{...queue,draftsEnabled:false,
   loadOrders:async requested=>{if(requested.length!==scope.orderDbIds.length||requested.some(id=>!scope.orderDbIds.includes(id)))throw Error('Isolation selector differs');const rows=await load(requested);assertIsolationRows(scope,rows);return rows;},
   engineeringAdmission:members=>{assertIsolationRows(scope,members);return true;}});
 }
 if(!scope.submissionId||scope.providerOrderIds.length!==1)throw Error('Isolation draft has not been recorded');
 if(input.action==='register-status'){await d.registerStatus(scope);return {registered:true,customerMessages:false};}
 if(scope.statusClaimsRemaining===0)return {checked:0,budgetExhausted:true,customerMessages:false};
 return d.poll(scope);
}
