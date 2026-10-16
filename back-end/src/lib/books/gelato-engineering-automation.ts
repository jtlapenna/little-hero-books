import {createHash} from 'node:crypto';
import {z} from 'zod';
import {EngineeringConversionSchema,runEngineeringConversion,validateEngineeringConversionContext,type EngineeringConversion,type EngineeringConversionDependencies} from './gelato-engineering-conversion';
import {gelatoSnapshotDigest} from './gelato-lifecycle';
import {pollGelatoCandidates} from './gelato-polling';
import {refreshGelatoStatusSignal} from './gelato-status-signal';
import type {GelatoLifecycleDependencies} from './gelato-lifecycle';

const Ids=z.array(z.string().uuid()).min(1).max(3).refine(ids=>new Set(ids).size===ids.length,'Duplicate authorization');
export const EngineeringAutomationInput=z.discriminatedUnion('action',[
 z.object({action:z.literal('queue'),authorizationIds:Ids}).strict(),
 z.object({action:z.literal('poll'),authorizationIds:Ids}).strict(),
 z.object({action:z.literal('signal'),authorizationIds:Ids,providerOrderId:z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)}).strict(),
]);
export interface EngineeringAutomationDependencies {
 conversion: EngineeringConversionDependencies;
 authorizations(ids:string[],signal?:AbortSignal):Promise<unknown[]>;
 controlsOff(signal?:AbortSignal):Promise<boolean>;
 loadOrder(key:string,signal?:AbortSignal):Promise<Record<string,unknown>|null>;
 lifecycle(signal:AbortSignal,apiKey:string,providerIds:ReadonlySet<string>):GelatoLifecycleDependencies;
 now?:()=>Date;
 bindingBudgetMs?:number;
 statusBudgetMs?:number;
}
const keyHash=(key:string)=>createHash('sha256').update(key).digest('hex');
async function bounded<T>(signal:AbortSignal,work:()=>Promise<T>):Promise<T> {
 signal.throwIfAborted();
 return new Promise<T>((resolve,reject)=>{
  const abort=()=>reject(new Error('Engineering execution deadline exceeded'));
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve().then(work).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
 });
}
const identity=(c:Awaited<ReturnType<typeof validateEngineeringConversionContext>>['context'])=>gelatoSnapshotDigest({
 submission:c.submission,members:c.members.map(m=>({submission:m.submission_id,child:m.child_order_id,key:m.child_order_key,reference:m.item_reference_id,artifact:m.artifact_key,fingerprint:m.artifact_fingerprint,claim:m.artifact_claim_token,pages:m.pdf_page_count,provider:m.provider_order_id,item:m.provider_item_id})),roots:c.providerOrders.map(p=>p.provider_order_id),
});
async function controlsClosed(d:EngineeringAutomationDependencies){const signal=AbortSignal.timeout(10_000);return bounded(signal,()=>d.controlsOff(signal));}
async function bindCohort(ids:string[],d:EngineeringAutomationDependencies,signal:AbortSignal) {
 if(!d.conversion.normalControlsOff||!d.conversion.apiKey.trim()||!await d.controlsOff(signal))throw Error('Engineering automation requires all normal controls OFF');
 const rows=z.array(EngineeringConversionSchema).max(3).parse(await d.authorizations(ids,signal));
 rows.sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id));
 if(rows.length!==ids.length||new Set(rows.map(a=>a.id)).size!==ids.length||rows.some(a=>!ids.includes(a.id)))throw Error('Exact engineering cohort was not found');
 const hash=keyHash(d.conversion.apiKey);
 const contexts=new Map<string,Awaited<ReturnType<typeof validateEngineeringConversionContext>>>();
 const roots=new Set<string>();const children=new Set<string>();
 for(const a of rows){
  if(a.account_key_sha256!==hash)throw Error('Engineering account differs');
  const bound=await validateEngineeringConversionContext(a,d.conversion);
  if(roots.has(a.provider_root_id))throw Error('Duplicate provider root');roots.add(a.provider_root_id);
  for(const m of bound.members){
   if(children.has(m.child_order_key))throw Error('Duplicate engineering child');children.add(m.child_order_key);
   const row=await d.loadOrder(m.child_order_key,signal);
   const specs=row?.book_specs as {testMode?:unknown}|null;
   if(!row||row.id!==m.child_order_id||row.orderId!==m.child_order_key||specs?.testMode!==true||row.print_provider!=='gelato'||
    row.print_submission_id!==a.submission_id||row.print_claim_token!==bound.context.submission.claim_token||
    (row.root_order_id??row.amazon_order_id??row.orderId)!==bound.context.submission.root_order_id||
    row.print_book_id!=='book-finding-our-inner-voice'||row.print_config_version!==2||row.print_expected_pdf_page_count!==35||
    row.print_inner_page_count!==32||row.print_api_page_count!==32||row.print_product_uid!==bound.saved.config.productUid||
    !['standard','amazon'].includes(String(row.print_format_id))||m.artifact_claim_token!==bound.context.submission.claim_token||
    m.artifact_key!==`${row.print_book_id}/orders/${row.orderId}/gelato/print/v${row.print_config_version}/${m.artifact_fingerprint}.pdf`)
     throw Error('Current engineering order ownership or frozen descriptor differs');
  }
  contexts.set(a.id,bound);
 }
 return {rows,contexts,roots,children,identities:new Map([...contexts].map(([id,c])=>[id,identity(c.context)]))};
}
function scopedLifecycle(d:EngineeringAutomationDependencies,cohort:Awaited<ReturnType<typeof bindCohort>>,signal:AbortSignal) {
 const original=d.lifecycle(signal,d.conversion.apiKey,cohort.roots);
 const submissionIds=new Set(cohort.rows.map(a=>a.submission_id));
 return {...original,cancelEnabled:false,search:async()=>{throw Error('Engineering status cannot search');},cancel:async()=>{throw Error('Engineering status cannot cancel');},
  get:async(id:string)=>{if(!cohort.roots.has(id))throw Error('Provider root outside engineering cohort');if(!original.get)throw Error('Explicit engineering provider reader required');return bounded(signal,()=>original.get!(id));},
  loadOrder:async(key:string)=>{if(!cohort.children.has(key))throw Error('Child outside engineering cohort');return bounded(signal,()=>d.loadOrder(key,signal));},
  store:{load:async(id:string)=>{if(!submissionIds.has(id))throw Error('Submission outside engineering cohort');const loaded=await bounded(signal,()=>original.store.load(id));const a=cohort.rows.find(a=>a.submission_id===id)!;if(identity(loaded)!==cohort.identities.get(a.id))throw Error('Engineering membership changed after binding');return loaded;},
   transition:async(name:string,parameters:Record<string,unknown>)=>{
    if(!['apply_gelato_provider_snapshots','hold_gelato_provider_refresh'].includes(name)||!submissionIds.has(String(parameters.p_submission_id)))throw Error('Unapproved engineering status transition');
    if(name==='apply_gelato_provider_snapshots'&&(!Array.isArray(parameters.p_notifications)||parameters.p_notifications.length!==0))throw Error('Engineering notification intents are forbidden');
    return original.store.transition(name,parameters);
   }}} satisfies GelatoLifecycleDependencies;
}
function queueDisposition(a:EngineeringConversion,now:number) {
 if(a.closed_at)return 'closed';
 if(a.state!=='ready')return a.state==='preparing'||a.state==='sending'?'busy':a.state;
 const expiry=Date.parse(a.expires_at);return !Number.isFinite(expiry)||expiry<=now?'expired':null;
}
export async function runEngineeringAutomation(raw:unknown,d:EngineeringAutomationDependencies) {
 const input=EngineeringAutomationInput.parse(raw);
 const bindingSignal=AbortSignal.timeout(Math.min(60_000,Math.max(1,d.bindingBudgetMs??60_000)));
 const cohort=await bounded(bindingSignal,()=>bindCohort(input.authorizationIds,d,bindingSignal));
 if(input.action==='queue'){
  const results:Array<{authorizationId:string;state:string;persistenceConfirmed?:boolean;closureConfirmed?:boolean;unsafeFundingOrProductionObserved?:boolean}>=[];
  for(const a of cohort.rows){
   const skipped=queueDisposition(a,(d.now??(()=>new Date()))().getTime());
   if(skipped){results.push({authorizationId:a.id,state:'skipped_'+skipped});continue;}
   if(!await controlsClosed(d))throw Error('Normal controls changed before queue execution');
   try{
    const r=await runEngineeringConversion(a.id,'convert',d.conversion);
    const unsafe=r.observation.unsafeFundingOrProductionObserved===true;
    results.push({authorizationId:a.id,state:r.state,persistenceConfirmed:r.persistenceConfirmed,closureConfirmed:r.closureConfirmed,unsafeFundingOrProductionObserved:unsafe});
    if(!r.persistenceConfirmed||!r.closureConfirmed||unsafe||r.state!=='converted')break;
   }catch{results.push({authorizationId:a.id,state:'acquisition_unconfirmed',persistenceConfirmed:false,closureConfirmed:false});break;}
  }
  const halted=results.some(r=>r.persistenceConfirmed===false||r.closureConfirmed===false||r.unsafeFundingOrProductionObserved||!r.state.startsWith('skipped_')&&r.state!=='converted');
  for(const a of cohort.rows)if(!results.some(r=>r.authorizationId===a.id))results.push({authorizationId:a.id,state:'not_attempted_after_halt'});
  const allConverted=results.every(r=>r.state==='converted'&&r.persistenceConfirmed&&r.closureConfirmed||r.state==='skipped_closed'&&cohort.rows.find(a=>a.id===r.authorizationId)?.state==='converted');
  return {action:input.action,results,completed:!halted&&allConverted,requiresReview:halted||!allConverted,customerMessages:false,normalControlsEnabled:false};
 }
 // Closed evidence grants refresh only; it never reopens or authorizes conversion.
 if(cohort.rows.some(a=>a.closed_at===null||a.state!=='converted'))throw Error('Status-only cohort requires closed converted authorities');
 if(!await controlsClosed(d))throw Error('Normal controls changed before status execution');
 const budget=Math.min(10_000,Math.max(1,d.statusBudgetMs??10_000)),signal=AbortSignal.timeout(budget),deadline=Date.now()+budget;
 const lifecycle=scopedLifecycle(d,cohort,signal);
 if(input.action==='signal'){
  if(!cohort.roots.has(input.providerOrderId))throw Error('Signal root outside engineering cohort');
  const result=await refreshGelatoStatusSignal(input.providerOrderId,{resolve:async root=>cohort.rows.find(a=>a.provider_root_id===root)?.submission_id??null,lifecycle});
  return {action:input.action,...result,completed:result.accepted,requiresReview:result.needsAttention===true,customerMessages:false,normalControlsEnabled:false};
 }
 const result=await pollGelatoCandidates(cohort.rows.map(a=>({id:a.submission_id,request_state:'submitted'})),lifecycle,{signal,deadline});
 return {action:input.action,...result,completed:result.errors===0&&result.refreshed===cohort.rows.length,requiresReview:result.needsAttention>0,delivered:0,customerMessages:false,normalControlsEnabled:false};
}
