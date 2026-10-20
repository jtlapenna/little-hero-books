/** Dedicated manual test path; ordinary routes never construct this runtime. */
import {createHash} from 'node:crypto';
import {getObject,R2_ORDERS_BUCKET} from '@/lib/r2-client';
import {getGelatoOrder} from './gelato-api-client';
import {createGelatoStoredFileVerifier} from './gelato-stored-file';
import {supabase} from '@/lib/supabase-client';
import {claimPrintRoutingRequest} from './print-routing-claim-runtime';
import {loadPrintRoutingGroupMembers} from './print-routing-endpoint';
import {gelatoLifecycleRuntime} from './gelato-lifecycle-runtime';
import {pollRegisteredGelatoStatus} from './gelato-scheduled-status';
import type {GelatoPrintClaim} from './claim-gelato-print-routing';
import type {PrintRoutingOrder} from './print-routing';
import {assertIsolationRows,type IsolationDependencies,type IsolationScope} from './gelato-isolation';
const flags=['GELATO_DRAFT_SUBMISSION_ENABLED','GELATO_CANCEL_ENABLED','GELATO_STATUS_RELAY_ENABLED','GELATO_STATUS_POLLING_ENABLED','GELATO_SCHEDULED_STATUS_ENABLED','GELATO_NOTIFICATIONS_ENABLED'];
export function gelatoIsolationRuntime(scopeId:string,token:string):IsolationDependencies{
 const tokenHash=createHash('sha256').update(token).digest('hex');
 const auth=(status=false)=>{
  const key=process.env[status?'GELATO_STATUS_API_KEY':'GELATO_API_KEY'];if(!key?.trim())throw Error('Dedicated account is unavailable');
  return {p_scope_id:scopeId,p_token_sha256:tokenHash,p_account_key_sha256:createHash('sha256').update(key).digest('hex')};
 };
 const rpc=async(name:string,args:Record<string,unknown>,signal=AbortSignal.timeout(5000))=>{const {data,error}=await supabase.rpc(name,args).abortSignal(signal);if(error)throw Error('Isolation operation was not confirmed');return data;};
 const group=async(root:string,scope:IsolationScope)=>{
  if(root!==scope.rootOrderId)throw Error('Isolation root differs');
  return loadPrintRoutingGroupMembers(root,{
   byRootOrderId:async id=>{const {data,error}=await supabase.from('orders').select('id,orderId').eq('root_order_id',id);if(error)throw Error('Group lookup failed');return data??[];},
   byAmazonOrderId:async id=>{const {data,error}=await supabase.from('orders').select('id,orderId').is('root_order_id',null).eq('amazon_order_id',id);if(error)throw Error('Group lookup failed');return data??[];},
   selfRoot:async id=>{const {data,error}=await supabase.from('orders').select('id,orderId').is('root_order_id',null).is('amazon_order_id',null).eq('orderId',id);if(error)throw Error('Group lookup failed');return data??[];},
  });
 };
 return {
  controlsOff:()=>flags.every(name=>process.env[name]==='false'),
  loadScope:()=>rpc('load_gelato_isolation_scope',auth()),
  close:async()=>{await rpc('close_gelato_isolation_scope',{p_scope_id:scopeId,p_token_sha256:tokenHash});},
  queue:scope=>({
   loadOrders:async ids=>{const {data,error}=await supabase.from('orders').select('*').in('id',ids);if(error)throw Error('Exact isolation lookup failed');return (data??[]) as PrintRoutingOrder[];},
   loadMembers:root=>group(root,scope),
   claim:(ids,key)=>claimPrintRoutingRequest(ids,key,async(routes,idempotency)=>await rpc('claim_gelato_isolation_queue',{...auth(),p_routes:routes,p_idempotency_key:idempotency}) as GelatoPrintClaim,{assertOrders:rows=>assertIsolationRows(scope,rows),assertRoot:root=>{if(root!==scope.rootOrderId)throw Error('Isolation canonical root differs');}}),
   fence:async(id,token)=>{await rpc('fence_gelato_isolation_claim',{...auth(),p_submission_id:id,p_claim_token:token});return true;},
  }),
  registerStatus:async()=>{await rpc('register_gelato_isolation_status',auth(true));},
  poll:async scope=>{
   const key=process.env.GELATO_STATUS_API_KEY;if(!key?.trim())throw Error('Dedicated status account unavailable');
   // Require the independently configured status key to resolve the same account-bound scope.
   await rpc('load_gelato_isolation_scope',auth(true));
   const remaining=Date.parse(scope.expiresAt)-Date.now();if(remaining<=50)throw Error('Isolation expires before polling can start');
   return pollRegisteredGelatoStatus(supabase,{enabled:true,apiKey:key,budgetMs:Math.min(10000,remaining),
    engineering:{scopeId,tokenSha256:tokenHash,submissionId:scope.submissionId!},
    lifecycle:signal=>{
     const original=gelatoLifecycleRuntime(signal,supabase);
     const guard=async()=>{
      signal.throwIfAborted();if(!flags.every(name=>process.env[name]==='false')||Date.now()>=Date.parse(scope.expiresAt))throw Error('Isolation read authority ended');
      await rpc('load_gelato_isolation_scope',auth(true),signal);
      signal.throwIfAborted();if(Date.now()>=Date.parse(scope.expiresAt))throw Error('Isolation read authority ended');
     };
     return {...original,
      get:async id=>{if(!scope.providerOrderIds.includes(id))throw Error('Isolation provider differs');await guard();return getGelatoOrder(id,{apiKey:key,signal});},
      verifyStoredFile:createGelatoStoredFileVerifier({signal,
       loadArtifact:async(artifact,fileSignal)=>{await guard();return getObject(R2_ORDERS_BUCKET,artifact,{signal:fileSignal,redirect:'manual',allowErrorResponse:true});},
       fetcher:async(input,init)=>{await guard();return fetch(input,{...init,redirect:'manual'});}}),
      store:{...original.store,load:async id=>{
      if(id!==scope.submissionId)throw Error('Isolation submission differs');const ctx=await original.store.load(id);
      const actual=ctx.members.map(m=>m.child_order_id);const roots=ctx.providerOrders.map(o=>o.provider_order_id);
      if(ctx.submission.id!==id||ctx.submission.root_order_id!==scope.rootOrderId||actual.length!==scope.orderDbIds.length||new Set(actual).size!==actual.length||actual.some(n=>!scope.orderDbIds.includes(n))||
       ctx.members.some(m=>m.submission_id!==id||!/^TEST-GELATO-[A-Za-z0-9-]+$/.test(m.child_order_key))||roots.length!==1||roots[0]!==scope.providerOrderIds[0])throw Error('Isolation saved graph differs');
      return ctx;
     }}};
    }});
  },
 };
}
