import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import configFile from '../src/lib/books/configs/book-finding-our-inner-voice/v2.json';
import {GelatoPrintConfigSchema} from '../src/lib/books/types';
import {quoteGelatoSubmission,type GelatoSubmissionDependencies,type GelatoSavedSnapshot} from '../src/lib/books/gelato-submission';
import {NextRequest} from 'next/server';
import {POST as engineeringPost} from '../src/app/api/internal/w4/engineering-conversion/route';
import {gelatoSubmissionStore} from '../src/lib/books/gelato-submission-store';
import type {GelatoQuoteRequest} from '../src/lib/books/gelato-api-contract';
import type {GelatoSubmissionContext} from '../src/lib/books/gelato-submission-store';
import type {W4GelatoPrintInput} from '../src/lib/books/w4-gelato-print-input';
import {runEngineeringConversion,type EngineeringConversionDependencies} from '../src/lib/books/gelato-engineering-conversion';
import {gelatoEngineeringConversionRuntime,readEngineeringArtifact} from '../src/lib/books/gelato-engineering-conversion-runtime';

const hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const id='11111111-1111-4111-8111-111111111111',token='22222222-2222-4222-8222-222222222222';
const authorizationId='33333333-3333-4333-8333-333333333333',owner='44444444-4444-4444-8444-444444444444';
const config=GelatoPrintConfigSchema.parse(configFile.formats.standard.print);
type Mode='ok'|'payment-rejected'|'patch-lost'|'patch-accepted-lost'|'after-get-fails'|'finish-lost'|'close-fails'|'begin-lost'|'authorize-lost'|'unsafe'|'bad-artifact'|'bad-saved-url'|'changed-file'|'foreign-recipient'|'connected-root'|'wrong-account'|'artifact-fetch-stall'|'artifact-body-stall'|'normal-on'|'no-key'|'patch-body-fails'|'patch-body-stalls';
async function scenario(mode:Mode='ok',count=1){
 const root='TEST-GELATO-CONVERSION-UNIT';
 const blobs=new Map<string,Buffer>();
 const context:GelatoSubmissionContext={submission:{id,provider:'gelato',root_order_id:root,order_reference_id:'lhb-gelato-engineering-unit',workflow_job_idempotency_key:'synthetic-job',claim_token:token,
  lease_expires_at:'2026-10-15T12:15:00Z',request_state:'claimed',owning_execution_id:null,send_started_at:null,accepted_root_order_id:null,quote_snapshot:null,request_snapshot:null,
  quote_id:null,shipment_method_uid:null,shipment_policy_version:null,quoted_at:null,quote_request_fingerprint:null},members:Array.from({length:count},(_,index)=>{const child=count===1?root:root+'-item-'+(index+1),key=`book-finding-our-inner-voice/orders/${child}/gelato/print/v2/${'a'.repeat(24)}.pdf`;blobs.set(key,Buffer.from('synthetic-byte-fixture-'+index));return {submission_id:id,child_order_id:index+1,child_order_key:child,item_reference_id:'lhb-item-'+(index+1),artifact_key:key,artifact_fingerprint:'a'.repeat(24),artifact_claim_token:token,pdf_page_count:35,provider_order_id:null,provider_item_id:null,status:null};}),providerOrders:[]};
 const producer:GelatoSubmissionDependencies={backendUrl:'https://admin.littleherolabs.com',draftsEnabled:false,store:{load:async()=>context,transition:async(name,p)=>{assert.equal(name,'record_gelato_quote_snapshot');Object.assign(context.submission,{quote_snapshot:structuredClone(p.p_snapshot),quote_id:p.p_quote_id,shipment_method_uid:p.p_shipment_method_uid,shipment_policy_version:p.p_policy_version,quoted_at:p.p_quoted_at,quote_request_fingerprint:p.p_request_fingerprint});return {}; }},
  now:()=>new Date('2026-10-15T12:00:00Z'),artifactExists:async key=>blobs.has(key),
  loadOrder:async key=>({id:context.members.find(m=>m.child_order_key===key)!.child_order_id,print_provider:'gelato',print_submission_id:id,print_claim_token:token,quantity:1,shipping_tier:'standard',customer_email:'engineering@example.com',shipping_address:{name:'Taylor Example',street1:'1 Test St',city:'Seattle',state:'WA',zip:'98101',country:'US'}}),
  loadPrintInput:async key=>({orderId:key,orderDbId:context.members.find(m=>m.child_order_key===key)!.child_order_id,orderPrefix:'book-finding-our-inner-voice/orders/'+key,rootOrderId:root,bookConfigVersion:2,providerPrintConfig:config} as W4GelatoPrintInput),
  quote:async request=>({orderReferenceId:request.orderReferenceId,quotes:[{id:'native-quote',itemReferenceIds:request.products.map(p=>p.itemReferenceId),products:request.products,shipmentMethods:[{shipmentMethodUid:'usps_ground_advantage',type:'normal'}]}]})};
 await quoteGelatoSubmission({submissionId:id,claimToken:token,executionId:'native-unit',mode:count===1?'single':'siblings'},producer);
 context.submission.request_snapshot=structuredClone(context.submission.quote_snapshot);context.submission.request_state='submitted';context.submission.accepted_root_order_id='provider-unit';
 context.members.forEach((m,i)=>{m.provider_order_id='provider-unit';m.provider_item_id='provider-item-'+i;m.status='created';});
 context.providerOrders=[{provider_order_id:'provider-unit',status:'draft',order_type:'draft',last_event_at:null,snapshot_digest:null,snapshot:{},action_reason:null}];
 const saved=context.submission.request_snapshot as GelatoSavedSnapshot;
 let state='ready',closed=false,patches=0,gets=0,actualConverted=false,beginCalls=0;const calls:string[]=[];let finishFailed=false;
 const a=()=>({id:authorizationId,submission_id:id,provider_root_id:'provider-unit',account_key_sha256:hash(mode==='wrong-account'?'another-key':'explicit-engineering-key'),owner_token:state==='ready'?null:owner,state,closed_at:closed?'2026-10-15T12:01:00Z':null,expires_at:'2026-10-15T12:15:00Z',artifacts:context.members.map(m=>({child_order_id:m.child_order_id,artifact_key:m.artifact_key,provider_item_id:m.provider_item_id,sha256:hash(blobs.get(m.artifact_key!)!)}))});
 const provider=()=>({...saved.request,id:'provider-unit',orderType:actualConverted?'order':'draft',financialStatus:actualConverted?'pending':'draft',fulfillmentStatus:actualConverted?'on_hold':'draft',updatedAt:'2026-10-15T12:01:00Z',connectedOrderIds:mode==='connected-root'?['foreign-root']:[],
  shippingAddress:{...saved.request.shippingAddress,...(mode==='foreign-recipient'?{postCode:'00000'}:{})},paymentMethodId:null,prepaymentTransactionId:null,
  billingEntity:{secretMarker:'PRIVATE-BILLING-MARKER'},processingStatus:null,receipts:[{currency:'USD',isCalculated:true,total:0,billingTag:'PRIVATE-BILLING-MARKER'}],
  items:saved.request.items.map((item,i)=>({...item,id:'provider-item-'+i,fulfillmentStatus:mode==='unsafe'?'in_production':'created',...(mode==='changed-file'?{files:[{type:'default',url:'https://gelato-api-live.s3.eu-west-1.amazonaws.com/synthetic.pdf'}]}:{}),processedFileUrl:null})),shipment:{shipmentMethodUid:saved.request.shipmentMethodUid,packages:[]}});
 const d:EngineeringConversionDependencies={closeOwned:async(a,t)=>{assert.equal(a,authorizationId);assert.equal(t,owner);calls.push('close-owned');if(mode==='close-fails')throw Error('closure unavailable');closed=true;return true;},apiKey:'explicit-engineering-key',normalControlsOff:true,providerBudgetMs:mode==='patch-body-stalls'?15:30000,now:()=>new Date('2026-10-15T12:00:00Z'),authorization:async()=>a(),context:async()=>context,
  artifact:async key=>mode==='artifact-fetch-stall'?readEngineeringArtifact(async()=>new Promise<Response>(()=>{}),15):mode==='artifact-body-stall'?readEngineeringArtifact(async()=>new Response(new ReadableStream({pull:()=>new Promise<void>(()=>{})})),15):mode==='bad-artifact'?Buffer.from('changed'):blobs.get(key)!,verifyFile:async()=>mode!=='changed-file',
  transition:async(name,p)=>{calls.push(name);if(name==='begin_gelato_engineering_conversion'){beginCalls++;assert.equal(p.p_key_sha256,hash(d.apiKey));assert.equal(state,'ready','Consumed authorization');state='preparing';if(mode==='begin-lost')throw Error('committed begin; lost response');return a();}
   if(name==='authorize_gelato_engineering_conversion_send'){assert.equal(state,'preparing');assert(!closed);assert.equal(p.p_token,owner);state='sending';if(mode==='authorize-lost')throw Error('committed send authorization; lost response');return null;}
   if(name==='finish_gelato_engineering_conversion'){assert.equal(p.p_token,owner);const next=String(p.p_state);assert(state==='preparing'&&next==='preflight_failed'||state==='sending'&&['converted','rejected','outcome_unknown'].includes(next)||state==='outcome_unknown'&&['converted','rejected'].includes(next));state=next;if(mode==='finish-lost'&&!finishFailed){finishFailed=true;throw Error('committed finish; lost response');}return null;}
   assert.equal(name,'close_gelato_engineering_conversion');if(mode==='close-fails')throw Error('closure unavailable');closed=true;return null;},
  fetcher:async(input,init)=>{const u=new URL(String(input));assert.equal(u.origin,'https://order.gelatoapis.com');assert.equal((init!.headers as Record<string,string>)['X-API-KEY'],'explicit-engineering-key');assert.equal(init!.redirect,'manual');const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status});
   if(init!.method==='POST'){assert.equal(u.pathname,'/v4/orders:quote');const request=JSON.parse(String(init!.body)) as GelatoQuoteRequest;return json({orderReferenceId:request.orderReferenceId,quotes:[{id:'fresh-quote',itemReferenceIds:request.products.map((p)=>p.itemReferenceId),products:request.products.map((p)=>({...p,price:12.18,currency:'USD'})),shipmentMethods:[{shipmentMethodUid:'usps_ground_advantage',type:'normal',price:3.81,currency:'USD'}]}]});}
   assert.equal(u.pathname,'/v4/orders/provider-unit');if(init!.method==='PATCH'){patches++;assert.equal(patches,1);assert.equal(state,'sending');assert.deepEqual(JSON.parse(String(init!.body)),{orderType:'order'});if(mode==='payment-rejected')return json({code:'payment_required'},400);if(mode==='patch-lost')throw Error('ambiguous PATCH');actualConverted=true;if(mode==='patch-body-fails')return new Response(new ReadableStream({start:c=>c.error(new Error('incomplete body'))}));if(mode==='patch-body-stalls')return new Response(new ReadableStream({pull:()=>new Promise<void>(()=>{})}));if(mode==='patch-accepted-lost')throw Error('accepted; lost response');return json(provider());}
   assert.equal(init!.method,'GET');gets++;if(mode==='after-get-fails'&&gets===2)throw Error('GET unavailable');return json(provider());},
 };
 if(mode==='normal-on')d.normalControlsOff=false;if(mode==='no-key')d.apiKey='';
 if(mode==='bad-saved-url')saved.request.items[0].files[0].url='https://attacker.invalid/file.pdf';
 if(['begin-lost','wrong-account','normal-on','no-key'].includes(mode)){await assert.rejects(runEngineeringConversion(authorizationId,'convert',d));assert.equal(closed,false,'Unowned/ambiguous begin requires independent close');assert.equal(patches,0);return;}
 const result=await runEngineeringConversion(authorizationId,'convert',d);
 assert.equal(result.closureConfirmed,mode!=='close-fails');assert(!JSON.stringify(result.observation).includes('PRIVATE-BILLING-MARKER'));
 if(['artifact-fetch-stall','artifact-body-stall','bad-artifact','bad-saved-url','unsafe','changed-file','foreign-recipient','connected-root'].includes(mode)){assert.equal(result.state,'preflight_failed');assert.equal(patches,0);return;}
 if(mode==='authorize-lost'){assert.equal(result.state,'outcome_unknown');assert.equal(result.persistenceConfirmed,true);assert.equal(patches,0);}
 else if(mode==='patch-lost'){assert.equal(result.state,'outcome_unknown');assert.equal(patches,1);}
 else if(mode==='after-get-fails'){assert.equal(result.state,'outcome_unknown');const observed=await runEngineeringConversion(authorizationId,'observe',d);assert.equal(observed.state,'converted');assert.equal(patches,1);}
 else if(mode==='payment-rejected'){assert.equal(result.state,'rejected');assert.equal(patches,1);assert(result.privateEvidence.some(e=>e.httpStatus===400));}
 else if(mode==='finish-lost'){assert.equal(result.state,'outcome_unknown');assert.equal(result.persistenceConfirmed,false);assert.equal(state,'converted');assert(result.privateEvidence.some(e=>e.method==='PATCH'));}
 else {assert.equal(result.state,'converted');assert.equal(patches,1);assert.equal(result.observation.unsafeFundingOrProductionObserved,false);}
 const before=patches;await assert.rejects(runEngineeringConversion(authorizationId,'convert',d));assert.equal(patches,before);assert.equal(beginCalls,2);
 assert(calls.includes('close-owned'));assert(result.privateEvidence.length>0);
}
async function main(){
 globalThis.fetch=async()=>{throw Error('Unit test forbids real network');};
 for(const mode of ['ok','payment-rejected','patch-lost','patch-accepted-lost','after-get-fails','finish-lost','close-fails','begin-lost','authorize-lost','unsafe','bad-artifact','bad-saved-url','changed-file','foreign-recipient','connected-root','wrong-account','artifact-fetch-stall','artifact-body-stall','normal-on','no-key','patch-body-fails','patch-body-stalls'] as Mode[])await scenario(mode);
 await scenario('ok',2);
 const previous=process.env.GELATO_API_KEY;process.env.GELATO_API_KEY='normal-key-that-must-not-fallback';
 try {assert.throws(()=>gelatoEngineeringConversionRuntime({environment:{}}),/Explicit/);const runtime=gelatoEngineeringConversionRuntime({environment:{GELATO_API_KEY:'explicit-key'}});assert.equal(runtime.apiKey,'explicit-key');assert.equal(runtime.normalControlsOff,false);}finally{if(previous===undefined)delete process.env.GELATO_API_KEY;else process.env.GELATO_API_KEY=previous;}
 const oldToken=process.env.BACKEND_API_TOKEN,oldKey=process.env.GELATO_API_KEY,oldTransition=gelatoSubmissionStore.transition;const closes:unknown[]=[];
 try{process.env.BACKEND_API_TOKEN='synthetic-engineering-bearer';delete process.env.GELATO_API_KEY;gelatoSubmissionStore.transition=async(name,p)=>{assert.equal(name,'close_gelato_engineering_conversion');closes.push(p);return null;};
  const invoke=(authorized:boolean,body:unknown)=>engineeringPost(new NextRequest('https://admin.littleherolabs.com/api/internal/w4/engineering-conversion',{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{authorization:'Bearer synthetic-engineering-bearer'}:{})},body:JSON.stringify(body)}));
  const unauthorized=await invoke(false,{authorizationId,action:'convert'});assert.equal(unauthorized.status,401);assert.equal(unauthorized.headers.get('cache-control'),'private, no-store');assert.equal(closes.length,0);
  assert.equal((await invoke(true,{authorizationId,action:'convert',providerId:'foreign'})).status,400);assert.equal(closes.length,0);
  const missing=await invoke(true,{authorizationId,action:'convert'});assert.equal(missing.status,409);assert.equal(missing.headers.get('cache-control'),'private, no-store');assert.deepEqual(closes,[],'Runtime setup failure must not close an unowned authorization');assert(!('privateEvidence' in await missing.json()));
 }finally{gelatoSubmissionStore.transition=oldTransition;if(oldToken===undefined)delete process.env.BACKEND_API_TOKEN;else process.env.BACKEND_API_TOKEN=oldToken;if(oldKey===undefined)delete process.env.GELATO_API_KEY;else process.env.GELATO_API_KEY=oldKey;}
 console.log('test-gelato-engineering-conversion: canonical quote producer, exact artifacts/account, one PATCH, ambiguity/recovery/independent closure/privacy: ok');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
