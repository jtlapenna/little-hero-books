import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {NextRequest} from 'next/server';
import configFile from '../src/lib/books/configs/book-finding-our-inner-voice/v2.json';
import {GelatoPrintConfigSchema} from '../src/lib/books/types';
import {quoteGelatoSubmission,submitGelatoDraft,type GelatoSubmissionDependencies,type GelatoSavedSnapshot} from '../src/lib/books/gelato-submission';
import type {GelatoSubmissionContext} from '../src/lib/books/gelato-submission-store';
import type {W4GelatoPrintInput} from '../src/lib/books/w4-gelato-print-input';
import {GelatoProviderOrderSchema} from '../src/lib/books/gelato-provider-snapshot';
import {gelatoSnapshotDigest} from '../src/lib/books/gelato-lifecycle';
import {runEngineeringAutomation,type EngineeringAutomationDependencies} from '../src/lib/books/gelato-engineering-automation';
import {gelatoEngineeringConversionRuntime} from '../src/lib/books/gelato-engineering-conversion-runtime';
import {POST} from '../src/app/api/internal/w4/engineering-automation/route';
import {pollGelatoPrintProvider} from '../src/lib/books/gelato-polling';

const hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const token='22222222-2222-4222-8222-222222222222',aid='33333333-3333-4333-8333-333333333333',owner='44444444-4444-4444-8444-444444444444';
export async function fixture(format:'standard'|'amazon'='standard',count=1,index=0,storedFiles=false){
 const id=index?'11111111-1111-4111-8111-'+String(index).padStart(12,'0'):'11111111-1111-4111-8111-111111111111',aid=index?'33333333-3333-4333-8333-'+String(index).padStart(12,'0'):'33333333-3333-4333-8333-333333333333';
 const providerId=index?'provider-automatic-'+index:'provider-automatic';
 const root='TEST-GELATO-AUTOMATION-'+format+(index?'-'+index:''),config=GelatoPrintConfigSchema.parse(configFile.formats[format].print);
 const blobs=new Map<string,Buffer>(),rows=new Map<string,Record<string,unknown>>();
 const context:GelatoSubmissionContext={submission:{id,provider:'gelato',root_order_id:root,order_reference_id:'lhb-automatic-test-'+index,workflow_job_idempotency_key:'synthetic-job',claim_token:token,lease_expires_at:'2026-10-16T12:15:00Z',request_state:'claimed',owning_execution_id:null,send_started_at:null,accepted_root_order_id:null,quote_snapshot:null,request_snapshot:null,quote_id:null,shipment_method_uid:null,shipment_policy_version:null,quoted_at:null,quote_request_fingerprint:null},members:[],providerOrders:[]};
 for(let index=0;index<count;index++){
  const child=count===1?root:root+'-item-'+(index+1),key=`book-finding-our-inner-voice/orders/${child}/gelato/print/v2/${'a'.repeat(24)}.pdf`;
  blobs.set(key,Buffer.from('Synthetic child '+index+' '+format));
  context.members.push({submission_id:id,child_order_id:index+1,child_order_key:child,item_reference_id:'lhb-item-'+index,artifact_key:key,artifact_fingerprint:'a'.repeat(24),artifact_claim_token:token,pdf_page_count:35,provider_order_id:null,provider_item_id:null,status:null});
  rows.set(child,{id:index+1,orderId:child,root_order_id:root,book_specs:{testMode:true},print_provider:'gelato',print_submission_id:id,print_claim_token:token,print_book_id:'book-finding-our-inner-voice',print_format_id:format,print_config_version:2,print_product_uid:config.productUid,print_inner_page_count:32,print_api_page_count:32,print_expected_pdf_page_count:35,quantity:1,shipping_tier:'standard',customer_email:'synthetic@example.com',shipping_address:{name:'Taylor Example',street1:'1 Test St',city:'Seattle',state:'WA',zip:'98101',country:'US'}});
 }
 const producer:GelatoSubmissionDependencies={backendUrl:'https://admin.littleherolabs.com',draftsEnabled:false,now:()=>new Date('2026-10-16T12:00:00Z'),artifactExists:async key=>blobs.has(key),loadOrder:async key=>rows.get(key)??null,
  loadPrintInput:async key=>({orderId:key,orderDbId:rows.get(key)!.id,orderPrefix:'book-finding-our-inner-voice/orders/'+key,rootOrderId:root,bookConfigVersion:2,providerPrintConfig:config} as W4GelatoPrintInput),
  store:{load:async()=>context,transition:async(name,p)=>{assert.equal(name,'record_gelato_quote_snapshot');Object.assign(context.submission,{quote_snapshot:p.p_snapshot,quote_id:p.p_quote_id,shipment_method_uid:p.p_shipment_method_uid,shipment_policy_version:p.p_policy_version,quoted_at:p.p_quoted_at,quote_request_fingerprint:p.p_request_fingerprint});return null;}},
  quote:async r=>({orderReferenceId:r.orderReferenceId,quotes:[{id:'native',itemReferenceIds:r.products.map(p=>p.itemReferenceId),products:r.products,shipmentMethods:[{shipmentMethodUid:'usps_ground_advantage',type:'normal'}]}]})};
 await quoteGelatoSubmission({submissionId:id,claimToken:token,executionId:'synthetic-native',mode:count===1?'single':'siblings'},producer);
 const saved=context.submission.quote_snapshot as GelatoSavedSnapshot;
 let converted=false,patches=0,applies=0,holds=0;let connected:string[]=[],off=true,providerTime='2026-10-16T12:00:00Z';const gets:string[]=[];
 const raw=()=>({...saved.request,id:providerId,orderType:converted?'order':'draft',fulfillmentStatus:converted?'created':'draft',financialStatus:converted?'pending':'draft',updatedAt:providerTime,connectedOrderIds:connected,items:saved.request.items.map((item,i)=>({...item,...(storedFiles?{files:[{type:'default',url:'https://gelato-api-live.s3.eu-west-1.amazonaws.com/automatic-fixture-'+i+'.pdf'}]}:{}),id:'provider-item-'+i,fulfillmentStatus:'created',processedFileUrl:null})),shipment:{shipmentMethodUid:saved.request.shipmentMethodUid,packages:[]},privateBilling:'PRIVATE-RAW-MARKER'});
 producer.engineeringDraftsAllowed=async()=>true;
 producer.verifyStoredFile=async()=>true;
 producer.create=async()=>({...saved.request,id:providerId,connectedOrderIds:[]});
 producer.get=async requested=>{assert.equal(requested,providerId);return GelatoProviderOrderSchema.parse(raw());};
 producer.store.transition=async(name,p)=>{
  if(name==='begin_gelato_print_submission'){context.submission.request_state='submitting';context.submission.request_snapshot=structuredClone(saved);return null;}
  if(name==='authorize_gelato_print_send')return null;
  if(name==='record_gelato_accepted_root'){context.submission.accepted_root_order_id=String(p.p_root_id);return null;}
  assert.equal(name,'persist_gelato_draft_result');
  const graph=(p.p_orders as unknown[]).map(order=>GelatoProviderOrderSchema.parse(order));assert.equal(graph.length,1);
  context.submission.request_state='submitted';context.providerOrders=graph.map(order=>({provider_order_id:order.id,status:order.fulfillmentStatus,order_type:order.orderType,last_event_at:order.updatedAt,snapshot_digest:gelatoSnapshotDigest(order),snapshot:order,action_reason:null}));
  for(const m of context.members){const item=graph[0].items.find(item=>item.itemReferenceId===m.item_reference_id)!;m.provider_order_id=graph[0].id;m.provider_item_id=item.id;m.status=item.fulfillmentStatus;}
  return {persisted:true};
 };
 await submitGelatoDraft({submissionId:id,claimToken:token,executionId:'synthetic-native',mode:count===1?'single':'siblings'},producer);
 const a={id:aid,submission_id:id,provider_root_id:providerId,account_key_sha256:hash('explicit-test-key'),owner_token:null as string|null,state:'ready',closed_at:null as string|null,expires_at:'2026-10-16T12:15:00Z',artifacts:context.members.map(m=>({child_order_id:m.child_order_id,artifact_key:m.artifact_key!,provider_item_id:m.provider_item_id!,sha256:hash(blobs.get(m.artifact_key!)!)}))};
 const conversion={apiKey:'explicit-test-key',normalControlsOff:true,now:()=>new Date('2026-10-16T12:00:00Z'),authorization:async()=>a,context:async()=>context,artifact:async(key:string)=>blobs.get(key)!,verifyFile:async()=>true,
  closeOwned:async(authorizationId:string,t:string)=>{assert.equal(authorizationId,aid);assert.equal(t,owner);a.closed_at='2026-10-16T12:01:00Z';return true;},
  transition:async(name:string,p:Record<string,unknown>)=>{assert.equal(p.p_id,aid);if(name==='begin_gelato_engineering_conversion'){assert.equal(a.state,'ready');assert.equal(a.closed_at,null);a.state='preparing';a.owner_token=owner;return a;}assert.equal(p.p_token,owner);if(name==='authorize_gelato_engineering_conversion_send'){assert.equal(a.state,'preparing');a.state='sending';return null;}assert.equal(name,'finish_gelato_engineering_conversion');a.state=String(p.p_state);return null;},
  fetcher:async(input:RequestInfo|URL,init?:RequestInit)=>{const u=new URL(String(input));assert.equal(u.origin,'https://order.gelatoapis.com');assert.equal(new Headers(init?.headers).get('X-API-KEY'),'explicit-test-key');assert.equal(init?.redirect,'manual');
   if(init?.method==='PATCH'){patches++;assert.equal(a.state,'sending');assert.equal(patches,1);assert.deepEqual(JSON.parse(String(init.body)),{orderType:'order'});converted=true;return Response.json(raw());}
   if(init?.method==='POST'){assert.equal(u.pathname,'/v4/orders:quote');const r=JSON.parse(String(init.body));return Response.json({orderReferenceId:r.orderReferenceId,quotes:[{id:'automatic-fresh-quote',itemReferenceIds:r.products.map((p:{itemReferenceId:string})=>p.itemReferenceId),products:r.products,shipmentMethods:[{shipmentMethodUid:'usps_ground_advantage',type:'normal'}]}]});}
   assert.equal(init?.method,'GET');return Response.json(raw());}};
 const d:EngineeringAutomationDependencies={conversion,controlsOff:async()=>off,authorizations:async ids=>{assert.deepEqual(ids,[aid]);return[a];},loadOrder:async key=>rows.get(key)??null,now:conversion.now,
  lifecycle:(_signal,key,ids)=>{assert.equal(key,'explicit-test-key');assert.deepEqual([...ids],[providerId]);return{store:{load:async s=>{assert.equal(s,id);return context;},transition:async(name,p)=>{assert.equal(p.p_submission_id,id);if(name==='hold_gelato_provider_refresh'){holds++;return null;}assert.equal(name,'apply_gelato_provider_snapshots');assert.deepEqual(p.p_notifications,[]);applies++;const results=p.p_results as Array<{providerOrderId:string;accepted:boolean;status:string;orderType:string;snapshot:unknown;digest:string;actionReason:string|null;items:Array<{status:string}>}>;
   for(const r of results){Object.assign(context.providerOrders[0],{...(r.accepted?{status:r.status,order_type:r.orderType,snapshot:r.snapshot,snapshot_digest:r.digest,last_event_at:GelatoProviderOrderSchema.parse(r.snapshot).updatedAt}:{}),action_reason:r.actionReason});r.items.forEach((item,i)=>{context.members[i].status=item.status;});}return null;}},get:async orderId=>{gets.push(orderId);assert.equal(orderId,providerId);return GelatoProviderOrderSchema.parse(raw());},verifyStoredFile:async()=>true};}};
 return {d,a,rows,context,blobs,raw,gets,stats:()=>({patches,applies,holds}),connect:(ids:string[])=>{connected=ids;},setOff:(v:boolean)=>{off=v;},setTime:(v:string)=>{providerTime=v;}};
}
async function batch(){
 const first=await fixture('standard',1,1),second=await fixture('amazon',2,2);const fixtures=[first,second];
 const byId=(id:string)=>fixtures.find(f=>f.a.id===id)!;
 const d:EngineeringAutomationDependencies={...first.d,
  authorizations:async ids=>ids.map(id=>byId(id).a),loadOrder:async key=>fixtures.flatMap(f=>[...f.rows]).find(([k])=>k===key)?.[1]??null,
  conversion:{...first.d.conversion,
   context:async id=>fixtures.find(f=>f.a.submission_id===id)!.context,
   artifact:async key=>fixtures.find(f=>f.blobs.has(key))!.blobs.get(key)!,
   transition:(name,p)=>byId(String(p.p_id)).d.conversion.transition(name,p),
   closeOwned:(id,token)=>byId(id).d.conversion.closeOwned(id,token),
   fetcher:(input,init)=>{
    const body=init?.body?JSON.parse(String(init.body)):null;
    const f=body?.orderReferenceId?fixtures.find(f=>f.context.submission.order_reference_id===body.orderReferenceId):fixtures.find(f=>String(input).endsWith('/'+f.a.provider_root_id));
    assert(f,'Exact batch provider route');return f.d.conversion.fetcher!(input,init);
   }},
  lifecycle:()=>{throw Error('Queue cannot invoke status delivery');}};
 // Quote references must also identify each independent producer.
 return {first,second,d,ids:fixtures.map(f=>f.a.id)};
}
async function closeRuntime(){
 let closed:string|null=null;let readFails=false;const seen:string[]=[];
 const database=createClient('https://synthetic-db.test','synthetic-service-only',{global:{fetch:async(input,init)=>{
  const u=new URL(String(input));seen.push(init?.method??'GET');assert.equal(u.pathname,'/rest/v1/gelato_engineering_conversions');assert.equal(u.searchParams.get('id'),'eq.'+aid);const matches=u.searchParams.get('owner_token')==='eq.'+owner;
  if(init?.method==='PATCH'){assert.equal(u.searchParams.get('closed_at'),'is.null');const body=JSON.parse(String(init.body));assert.deepEqual(Object.keys(body),['closed_at']);if(matches&&closed===null)closed=body.closed_at;return new Response(null,{status:204});}
  if(readFails)return Response.json({message:'unavailable'},{status:503});return Response.json(matches?{closed_at:closed}:null);}}});
 const runtime=gelatoEngineeringConversionRuntime({environment:{GELATO_API_KEY:'synthetic'},database});
 assert.equal(await runtime.closeOwned(aid,token),false);assert.equal(closed,null);
 assert.equal(await runtime.closeOwned(aid,owner),true);assert.equal(await runtime.closeOwned(aid,owner),true);
 readFails=true;await assert.rejects(runtime.closeOwned(aid,owner),/readback/);assert(seen.includes('PATCH'));
}
async function main(){
 globalThis.fetch=async()=>{throw Error('No real network or delivery permitted');};
 for(const [format,count]of [['standard',1],['amazon',1],['amazon',2]] as const){const f=await fixture(format,count);const q=await runEngineeringAutomation({action:'queue',authorizationIds:[aid]},f.d);assert.equal(q.results?.[0].state,'converted');assert(!JSON.stringify(q).includes('PRIVATE-RAW-MARKER'));assert.equal(f.stats().patches,1);assert(f.a.closed_at);
  const again=await runEngineeringAutomation({action:'queue',authorizationIds:[aid]},f.d);assert.equal(again.results?.[0].state,'skipped_closed');assert.equal(f.stats().patches,1);
  const poll=await runEngineeringAutomation({action:'poll',authorizationIds:[aid]},f.d);assert.equal('refreshed'in poll&&poll.refreshed,1);assert.equal(f.context.providerOrders[0].order_type,'order');assert.equal(f.context.providerOrders[0].status,'created');assert.equal(f.stats().applies,1);
  const signal=await runEngineeringAutomation({action:'signal',authorizationIds:[aid],providerOrderId:'provider-automatic'},f.d);assert.equal('accepted'in signal&&signal.accepted,true);assert.equal(f.stats().applies,2);assert.equal(f.stats().patches,1);
  f.connect(['foreign-root']);const foreign=await runEngineeringAutomation({action:'poll',authorizationIds:[aid]},f.d);assert.equal('errors'in foreign&&foreign.errors,1);assert(!f.gets.includes('foreign-root'));assert.equal(f.stats().holds,1);
 }
 for(const change of [{book_specs:{testMode:false}},{print_provider:'lulu'},{root_order_id:'ordinary'},{print_claim_token:token.replace('2','3')},{print_expected_pdf_page_count:34},{print_product_uid:'wrong'}]){const f=await fixture();Object.assign([...f.rows.values()][0],change);await assert.rejects(runEngineeringAutomation({action:'queue',authorizationIds:[aid]},f.d));assert.equal(f.stats().patches,0);}
 {const f=await fixture();f.setOff(false);await assert.rejects(runEngineeringAutomation({action:'queue',authorizationIds:[aid]},f.d));assert.equal(f.stats().patches,0);}
 {const f=await fixture();f.a.account_key_sha256='f'.repeat(64);await assert.rejects(runEngineeringAutomation({action:'queue',authorizationIds:[aid]},f.d));assert.equal(f.stats().patches,0);}
 {const f=await fixture();await assert.rejects(runEngineeringAutomation({action:'queue',authorizationIds:[aid,aid]},f.d));assert.equal(f.stats().patches,0);await assert.rejects(runEngineeringAutomation({action:'poll',authorizationIds:[aid]},f.d),/closed converted/);}
 {const f=await fixture();f.a.expires_at='2026-10-16T11:00:00Z';const r=await runEngineeringAutomation({action:'queue',authorizationIds:[aid]},f.d);assert.equal(r.results?.[0].state,'skipped_expired');assert.equal(f.stats().patches,0);}
 {const b=await batch();Object.assign([...b.second.rows.values()][0],{print_provider:'lulu'});await assert.rejects(runEngineeringAutomation({action:'queue',authorizationIds:b.ids},b.d));assert.equal(b.first.a.state,'ready');assert.equal(b.first.stats().patches,0);}
 {const b=await batch();let sends=0;const before=b.first.d.conversion.fetcher!;b.first.d.conversion.fetcher=async(input,init)=>{if(init?.method==='PATCH'){sends++;throw Error('Synthetic uncertain send');}return before(input,init);};const r=await runEngineeringAutomation({action:'queue',authorizationIds:b.ids},b.d);assert.equal(r.completed,false);assert.equal(r.results?.[0].state,'outcome_unknown');assert.equal(r.results?.[1].state,'not_attempted_after_halt');assert.equal(sends,1);assert.equal(b.second.a.state,'ready');assert.equal(b.second.stats().patches,0);}
 {const b=await batch();b.first.d.conversion.closeOwned=async()=>false;const r=await runEngineeringAutomation({action:'queue',authorizationIds:b.ids},b.d);assert.equal(r.completed,false);assert.equal(r.results?.[1].state,'not_attempted_after_halt');assert.equal(b.second.a.state,'ready');}
 for(const action of ['poll','signal'] as const){const f=await fixture();await runEngineeringAutomation({action:'queue',authorizationIds:[aid]},f.d);const before=f.d.loadOrder;let count=0;f.d.statusBudgetMs=15;f.d.loadOrder=async(key,signal)=>{count++;if(count===1)return before(key,signal);assert(signal);return new Promise(()=>{});};const started=Date.now();const work=runEngineeringAutomation({action,authorizationIds:[aid],...(action==='signal'?{providerOrderId:'provider-automatic'}:{})},f.d);if(action==='poll'){const r=await work;assert.equal(r.completed,false);assert.equal('errors'in r&&r.errors,1);}else await assert.rejects(work,/deadline/);assert(Date.now()-started<500);assert.equal(f.stats().applies,0);}
 {const f=await fixture();f.d.bindingBudgetMs=15;f.d.loadOrder=async()=>new Promise(()=>{});const started=Date.now();await assert.rejects(runEngineeringAutomation({action:'queue',authorizationIds:[aid]},f.d),/deadline/);assert(Date.now()-started<500);assert.equal(f.a.state,'ready');}
 {const f=await fixture();await runEngineeringAutomation({action:'queue',authorizationIds:[aid]},f.d);await runEngineeringAutomation({action:'poll',authorizationIds:[aid]},f.d);f.setTime('2026-10-16T11:59:00Z');for(const action of ['poll','signal'] as const){const r=await runEngineeringAutomation({action,authorizationIds:[aid],...(action==='signal'?{providerOrderId:'provider-automatic'}:{})},f.d);assert.equal('requiresReview'in r&&r.requiresReview,true);assert.equal(f.context.providerOrders[0].status,'created');assert.equal(f.context.providerOrders[0].action_reason,'older_provider_snapshot');}assert.equal(f.stats().patches,1);}
 {const f=await fixture();await runEngineeringAutomation({action:'queue',authorizationIds:[aid]},f.d);const results=await Promise.all([runEngineeringAutomation({action:'poll',authorizationIds:[aid]},f.d),runEngineeringAutomation({action:'signal',authorizationIds:[aid],providerOrderId:'provider-automatic'},f.d)]);assert(results.every(r=>r.completed));assert.equal(f.stats().patches,1);assert.equal(f.context.providerOrders[0].order_type,'order');}
 {const f=await fixture();await runEngineeringAutomation({action:'queue',authorizationIds:[aid]},f.d);const factory=f.d.lifecycle;f.d.lifecycle=(...args)=>{const result=factory(...args);f.context.members[0].provider_item_id='foreign-after-bind';return result;};const r=await runEngineeringAutomation({action:'poll',authorizationIds:[aid]},f.d);assert.equal(r.completed,false);assert.equal(f.gets.length,0);assert.equal(f.stats().applies,0);}
 {for(const state of ['preparing','sending','outcome_unknown','rejected']){const f=await fixture();f.a.state=state;const r=await runEngineeringAutomation({action:'queue',authorizationIds:[aid]},f.d);assert.equal(r.completed,false);assert.equal('requiresReview'in r&&r.requiresReview,true);assert.equal(f.stats().patches,0);}}
 await closeRuntime();
 const previous=process.env.BACKEND_API_TOKEN;process.env.BACKEND_API_TOKEN='synthetic-bearer';
 try{const invoke=(body:unknown,authorized:boolean)=>POST(new NextRequest('https://synthetic.test/api/internal/w4/engineering-automation',{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer synthetic-bearer'}:{})},body:JSON.stringify(body)}));assert.equal((await invoke({action:'queue',authorizationIds:[aid]},false)).status,401);const malformed=await invoke({action:'queue',authorizationIds:[aid],providerOrderId:'foreign'},true);assert.equal(malformed.status,400);assert.equal(malformed.headers.get('cache-control'),'private, no-store');}finally{if(previous===undefined)delete process.env.BACKEND_API_TOKEN;else process.env.BACKEND_API_TOKEN=previous;}
 const database=createClient('https://unused.test','synthetic',{global:{fetch:async()=>{throw Error('Disabled ordinary poll must not query');}}});assert.equal((await pollGelatoPrintProvider(database,{enabled:false})).disabled,true);
 console.log('Engineering automation: canonical website/Amazon/sibling producer -> one queued conversion -> shared scoped poll/signal; exact descriptors/account/files, no duplicate, foreign-root denial before fetch, owner-CAS/readback, no customer delivery or real service calls.');
}
if(require.main===module){const watchdog=setTimeout(()=>{throw Error('Automation regression exceeded offline deadline');},10_000);
void main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>clearTimeout(watchdog));}
