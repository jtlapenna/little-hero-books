/** Actual service composition/SDK/store/application/core; every transport is intercepted.
 * No environment file, credential, hosted database, provider, purchase or print. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

async function main(){
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>{throw Error('Real network forbidden by release service test');};
 const checks:string[]=[];
 try{
  const environment=process.env;
  process.env=new Proxy(environment,{get(target,key){
   if(typeof key==='string'&&/^(AWS_|R2_|SUPABASE_|GELATO_API_KEY$|BACKEND_API_TOKEN$)/.test(key))throw Error('Ambient credential read during service import');
   return Reflect.get(target,key);
  }});
  let service:typeof import('../src/lib/books/gelato-ordinary-release-service');
  try{service=await import('../src/lib/books/gelato-ordinary-release-service');}
  finally{process.env=environment;}
  checks.push('actual service module imports without reading ambient credential bindings');
  const {composeOrdinaryReleaseServiceRuntime}=service;
  const {createOrdinaryReleaseFixture}=await import('./helpers/gelato-ordinary-release-fixture');
  const {createOrdinaryReleaseHttpHandler}=await import('../src/lib/books/gelato-ordinary-release-application');
  const {ordinaryReleaseApplicationRuntime}=await import('../src/lib/books/gelato-ordinary-release-runtime');
  const {ordinaryReleaseDigest}=await import('../src/lib/books/gelato-ordinary-release-core');
  const {ESTIMATE_TEST_PRINT_POLICY}=await import('../src/lib/books/gelato-release-estimate');
  const {ordinaryEstimateServerRuntime}=await import('../src/lib/books/gelato-ordinary-release-server');
  const identity={ok:true as const,mode:'access' as const,actor:'local-owner@example.test'};
  const post=(body:unknown)=>new Request('https://admin.example.test/api/admin/gelato-release',{method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'}});
  async function setup(mode:'verified'|'estimate'='verified',quantity=1,children=1){
   const f=await createOrdinaryReleaseFixture(children===1?'standard':'amazon',children,undefined,0,quantity);f.setRefreshQuoteMetadata(true);
   let enabled=true,activation=true,gateReads=0;
   const saved=new Map<string,{permit:unknown;packet:unknown;approval_actor:string}>(),reads:string[]=[],artifactKeys:string[]=[];
   const dbFetch:typeof fetch=async(input,init)=>{
    const request=new Request(input,init),u=new URL(request.url);assert.equal(u.origin,'https://local-release.invalid');
    if(u.pathname.startsWith('/rest/v1/rpc/')){
     assert.equal(request.method,'POST');const p=await request.json(),name=u.pathname.split('/').at(-1);
     if(name==='register_gelato_ordinary_release'){
      assert.equal(saved.size,0);assert.equal(ordinaryReleaseDigest(p.p_packet),p.p_permit.packetSha256);
      assert.equal(p.p_actor,identity.actor);assert.match(p.p_evidence_sha256,/^[a-f0-9]{64}$/);
      for(const key of Object.keys(f.permit))delete (f.permit as unknown as Record<string,unknown>)[key];
      Object.assign(f.permit,p.p_permit);saved.set(p.p_permit.id,{permit:p.p_permit,packet:p.p_packet,approval_actor:p.p_actor});return Response.json(p.p_permit.id);
     }
     if(name==='acquire_gelato_ordinary_release')return Response.json(await f.d.store.acquire(p.p_id,p.p_account_sha256,''));
     if(name==='authorize_gelato_ordinary_release')return Response.json(await f.d.store.authorizeSend(p.p_id,p.p_token,p.p_packet_sha256,''));
     if(name==='finish_gelato_ordinary_release')return Response.json(await f.d.store.finish(p.p_id,p.p_token,p.p_outcome,p.p_orders));
     throw Error('Unexpected RPC');
    }
    assert.equal(request.method,'GET');reads.push(u.pathname+'?'+u.searchParams.toString());
    const table=u.pathname.split('/').at(-1);let rows:unknown[];
    switch(table){
     case 'gelato_ordinary_release_gate':assert.equal(u.searchParams.get('id'),'eq.true');assert.equal(u.searchParams.get('select'),'enabled');gateReads++;rows=[{enabled}];break;
     case 'gelato_ordinary_release_permits':assert.equal(u.searchParams.get('id'),'eq.'+f.permit.id);rows=saved.has(f.permit.id)?[saved.get(f.permit.id)]:[];break;
     case 'orders':{
      const key=u.searchParams.get('orderId');assert(key!==null&&key.startsWith('eq.'));assert.equal([...u.searchParams.keys()].some(k=>['or','ilike','root_order_id','id'].includes(k)),false);
      rows=f.f.rows.has(key.slice(3))?[f.f.rows.get(key.slice(3))]:[];break;
     }
     case 'print_provider_submissions':assert.equal(u.searchParams.get('id'),'eq.'+f.permit.submissionId);rows=[f.f.context.submission];break;
     case 'print_provider_submission_items':assert.equal(u.searchParams.get('submission_id'),'eq.'+f.permit.submissionId);rows=f.f.context.members;break;
     case 'print_provider_submission_orders':assert.equal(u.searchParams.get('submission_id'),'eq.'+f.permit.submissionId);rows=f.f.context.providerOrders;break;
     case 'print_provider_submission_notifications':assert.equal(u.searchParams.get('submission_id'),'eq.'+f.permit.submissionId);rows=[];break;
     default:throw Error('Unexpected table');
    }
    return Response.json((request.headers.get('accept')??'').includes('object')?rows[0]??null:rows);
   };
   const database=createClient('https://local-release.invalid','synthetic-test-service',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:dbFetch}});
   const sources={database,apiKey:f.d.apiKey,expectedAccountSha256:createHash('sha256').update(f.d.apiKey).digest('hex'),
    approvers:new Set([identity.actor]),...(mode==='estimate'?{pricingPolicy:ESTIMATE_TEST_PRINT_POLICY}:{payableEvidence:f.d.payableEvidence}),activationApproved:async()=>activation,
    loadArtifact:async(key:string,signal:AbortSignal)=>{signal.throwIfAborted();artifactKeys.push(key);assert(f.f.blobs.has(key));return new Response(Uint8Array.from(f.f.blobs.get(key)!));},fetcher:f.d.fetcher,now:f.d.now};
   const runtime=mode==='estimate'?await ordinaryEstimateServerRuntime({readEnvironment:async()=>({GELATO_ORDINARY_RELEASE_ENABLED:activation?'true':'false',
    GELATO_ORDINARY_RELEASE_ACCOUNT_SHA256:sources.expectedAccountSha256,GELATO_ORDINARY_RELEASE_APPROVERS:identity.actor,GELATO_API_KEY:sources.apiKey}),
    loadServices:async()=>sources,now:f.d.now}):composeOrdinaryReleaseServiceRuntime(sources);
   assert.equal(runtime.kind,'ready');if(runtime.kind!=='ready')throw Error('Missing composition');
   const handler=createOrdinaryReleaseHttpHandler({authenticate:async()=>identity,runtime:async()=>runtime});
   const review=async()=>{const response=await handler(post({action:'review',submissionId:f.permit.submissionId,
    ...(mode==='estimate'?{pricingPolicy:ESTIMATE_TEST_PRINT_POLICY,maximumQuotedSubtotalCents:'2000'}:{maximumTotalCents:f.permit.maximumTotalCents})}));assert.equal(response.status,200,await response.clone().text());return response.json();};
   const approve=async(packet:Awaited<ReturnType<typeof review>>)=>handler(post({action:'approve',permit:packet.permit,reviewedPacket:packet.packet,approvedPacketSha256:packet.packetSha256,approveExactOrder:true,
    ...(mode==='estimate'?{acknowledgeFinalChargeMayDiffer:true}:{})}));
   const execute=async(packet:Awaited<ReturnType<typeof review>>)=>(await handler(post({action:'execute',permitId:packet.permit.id,approvedPacketSha256:packet.packetSha256}))).json();
   return {f,sources,runtime,handler,saved,reads,artifactKeys,review,approve,execute,setEnabled:(v:boolean)=>{enabled=v;},setActivation:(v:boolean)=>{activation=v;},gateReads:()=>gateReads};
  }
  const check=async(name:string,run:()=>Promise<void>)=>{await run();checks.push(name);};
  await check('fresh observation IDs/time/hashes preserve exact economic approval through actual composed service',async()=>{
   const s=await setup(),r=await s.review();assert.equal(r.packet.payable.quoteId,'fresh-observation-1');assert.equal(s.f.stats().patches,0);
   assert.equal((await s.approve(r)).status,200);assert.equal(s.f.stats().quotes,2);
   assert.equal((await s.execute(r)).state,'converted');assert.equal(s.f.stats().quotes,3);assert.equal(s.f.stats().patches,1);
   assert.equal((s.saved.get(r.permit.id)!.packet as typeof r.packet).payable.quoteId,'fresh-observation-1');
   assert.equal((await s.execute(r)).state,'already_attempted');assert.equal(s.f.stats().patches,1);
   assert(s.reads.some(v=>v.includes('select=packet')));assert(s.artifactKeys.length>0);s.f.assertClean();
  });
  for(const change of ['tax','shipping','currency','recipient','file','revision','account','expiry'] as const){
   await check(change+' change after approved packet refuses provider mutation',async()=>{
    const s=await setup(),r=await s.review();assert.equal((await s.approve(r)).status,200);
    if(change==='tax')s.f.setPayable({...s.f.fullPayable,taxesCents:'200',totalCents:'1918'});
    if(change==='shipping')s.f.setPayable({...s.f.fullPayable,shippingCents:'600',totalCents:'1918'});
    if(change==='currency')s.f.setPayable({...s.f.fullPayable,currency:'EUR'});
    if(change==='recipient')s.f.f.rows.values().next().value!.shipping_address={country:'US',city:'Changed'};
    if(change==='file')s.f.f.blobs.set(s.f.permit.artifacts[0].key,Buffer.from('Changed file'));
    if(change==='revision')s.f.f.rows.values().next().value!.customer_approval_status='revision_requested';
    if(change==='account')s.runtime.application.release.apiKey='wrong-account';
    if(change==='expiry')s.f.setTime(new Date('2026-10-17T12:00:00Z'));
    assert.equal((await s.execute(r)).state,'preflight_failed');assert.equal(s.f.stats().patches,0);s.f.assertClean();
   });
  }
  await check('partial quote cannot manufacture missing tax fees or guaranteed total',async()=>{
   const s=await setup();s.f.setPayable({productsCents:'1218',shippingCents:'500'});
   assert.equal((await s.handler(post({action:'review',submissionId:s.f.permit.submissionId,maximumTotalCents:'2000'}))).status,409);
   assert.equal(s.saved.size,0);assert.equal(s.f.stats().patches,0);
  });
  for(const gate of ['activation','database'] as const){
   await check(gate+' OFF stops before acquisition and provider send',async()=>{
    const s=await setup(),r=await s.review();assert.equal((await s.approve(r)).status,200);const requests=s.f.stats().attempts.length;
    if(gate==='activation')s.setActivation(false);else s.setEnabled(false);
    assert.equal((await s.execute(r)).state,'disabled');assert.equal(s.f.stats().claims,0);assert.equal(s.f.stats().attempts.length,requests);
    if(gate==='activation')assert.equal(s.gateReads(),0);
   });
  }
  await check('missing persisted packet stops instead of rebinding to a fresh quote',async()=>{
   const s=await setup(),r=await s.review();assert.equal((await s.approve(r)).status,200);s.saved.get(r.permit.id)!.packet=undefined;
   assert.equal((await s.execute(r)).state,'preflight_failed');assert.equal(s.f.stats().patches,0);
  });
  await check('reviewed packet required and forged observation packet refused',async()=>{
   const s=await setup(),r=await s.review();const body={action:'approve',permit:r.permit,approvedPacketSha256:r.packetSha256,approveExactOrder:true};
   assert.equal((await s.handler(post(body))).status,400);
   assert.equal((await s.handler(post({...body,reviewedPacket:{...r.packet,payable:{...r.packet.payable,quoteId:'forged'}}}))).status,409);
   assert.equal(s.saved.size,0);assert.equal(s.f.stats().patches,0);
  });
  await check('lost PATCH reply observes once and cannot send again through composed persistence',async()=>{
   const s=await setup(),r=await s.review();assert.equal((await s.approve(r)).status,200);s.f.setFault('lost');
   assert.equal((await s.execute(r)).state,'converted');assert.equal((await s.execute(r)).state,'already_attempted');assert.equal(s.f.stats().patches,1);s.f.assertClean();
  });
  await check('transport denies foreign endpoint and provider credentials on stored-file GET',async()=>{
   const s=await setup();const send=s.runtime.application.release.fetcher;
   for(const url of ['https://attacker.example.test/v4/orders/a','https://order.gelatoapis.com/v4/orders','https://order.gelatoapis.com/v4/orders/a?redirect=1']){
    await assert.rejects(()=>send(url,{headers:{'x-api-key':s.f.d.apiKey}}),/transport_denied/);
   }
   await assert.rejects(()=>send('https://gelato-api-live.s3.eu-west-1.amazonaws.com/label.pdf',{headers:{'x-api-key':s.f.d.apiKey}}),/credentials_denied/);
   assert.equal(s.f.stats().attempts.length,0);
  });
  await check('wrong account composition is rejected before any store/network read',async()=>{
   const s=await setup();assert.throws(()=>composeOrdinaryReleaseServiceRuntime({...s.sources,expectedAccountSha256:'0'.repeat(64)}),/account_mismatch/);assert.equal(s.reads.length,0);
  });
  await check('installed route stays blocked without loading any supplied service or reading ambient credentials',async()=>{
   const runtime=await ordinaryReleaseApplicationRuntime();assert.equal(runtime.kind,'blocked');
   const handler=createOrdinaryReleaseHttpHandler({authenticate:async()=>identity,runtime:ordinaryReleaseApplicationRuntime});
   const response=await handler(post({action:'review',submissionId:'11111111-1111-4111-8111-111111111111',maximumTotalCents:'2000'}));
   assert.equal(response.status,409);assert.equal((await response.json()).providerMutationAttempted,false);
  });
  await check('real partial-quote adapter permits explicitly acknowledged estimate, unknown final cost stays null',async()=>{
   const s=await setup('estimate'),r=await s.review();assert.equal(r.packet.version,3);
   assert.equal(r.packet.estimate.source,'gelato_product_shipping_estimate');assert.equal(r.packet.estimate.quotedSubtotalCents,'1718');
   for(const name of ['taxesCents','feesCents','discountCents','totalCents'])assert.equal(r.packet.estimate[name],null);
   assert.equal(r.packet.estimate.finalChargeMayDiffer,true);assert.equal(r.packet.estimate.providerChargeCapEnforced,false);
   assert(!('maximumTotalCents' in r.permit));assert(!('payable' in r.packet));assert.equal(r.requiredAcknowledgement,'final_charge_may_differ');
   assert.equal((await s.approve(r)).status,200);assert.equal((await s.execute(r)).state,'converted');assert.equal(s.f.stats().patches,1);
   assert.equal((await s.execute(r)).state,'already_attempted');assert.equal(s.f.stats().patches,1);s.f.assertClean();
  });
  await check('specific estimate acknowledgement cannot be omitted or false',async()=>{
   const s=await setup('estimate'),r=await s.review();
   for(const ack of [undefined,false]){const response=await s.handler(post({action:'approve',permit:r.permit,reviewedPacket:r.packet,approvedPacketSha256:r.packetSha256,approveExactOrder:true,...(ack===undefined?{}:{acknowledgeFinalChargeMayDiffer:ack})}));assert.equal(response.status,400);}
   assert.equal(s.saved.size,0);assert.equal(s.f.stats().patches,0);
  });
  for(const change of ['product','shipping','file','revision','lost'] as const){
   await check('estimate policy '+change+' retains exact-order and once-only authority',async()=>{
    const s=await setup('estimate'),r=await s.review();assert.equal((await s.approve(r)).status,200);
    if(change==='product')s.f.setQuotePrices(1219,500);if(change==='shipping')s.f.setQuotePrices(1218,501);
    if(change==='file')s.f.f.blobs.set(s.f.permit.artifacts[0].key,Buffer.from('Changed sample bytes'));
    if(change==='revision')s.f.f.rows.values().next().value!.customer_approval_status='revision_requested';
    if(change==='lost')s.f.setFault('lost');
    assert.equal((await s.execute(r)).state,change==='lost'?'converted':'preflight_failed');assert.equal(s.f.stats().patches,change==='lost'?1:0);s.f.assertClean();
   });
  }
  await check('quote policy cannot be selected by a caller against an unconfigured verified runtime',async()=>{
   const s=await setup();const response=await s.handler(post({action:'review',submissionId:s.f.permit.submissionId,pricingPolicy:ESTIMATE_TEST_PRINT_POLICY,maximumQuotedSubtotalCents:'2000'}));
   assert.equal(response.status,409);assert.equal(s.f.stats().attempts.length,0);
  });
  await check('estimate cannot be relabelled guaranteed or have unknown taxes silently zeroed',async()=>{
   const s=await setup('estimate'),r=await s.review();
   for(const change of [{totalCents:'1718'},{taxesCents:'0'},{providerChargeCapEnforced:true},{finalChargeMayDiffer:false}]){
    const response=await s.approve({...r,packet:{...r.packet,estimate:{...r.packet.estimate,...change}}});assert.equal(response.status,400);
   }assert.equal(s.saved.size,0);assert.equal(s.f.stats().patches,0);
  });
  await check('server runtime OFF reads no credential binding and loads no services',async()=>{
   let loads=0;
   const env=new Proxy({GELATO_ORDINARY_RELEASE_ENABLED:'false'},{get(target,key){if(key!=='GELATO_ORDINARY_RELEASE_ENABLED'&&key!=='then')throw Error('Credential read while OFF');return Reflect.get(target,key);}});
   assert.equal((await ordinaryEstimateServerRuntime({readEnvironment:async()=>env,loadServices:async()=>{loads++;throw Error('No service loading');}})).kind,'blocked');assert.equal(loads,0);
  });
  await check('estimate threshold is only a quote threshold and cannot be exceeded',async()=>{
   const s=await setup('estimate');const response=await s.handler(post({action:'review',submissionId:s.f.permit.submissionId,pricingPolicy:ESTIMATE_TEST_PRINT_POLICY,maximumQuotedSubtotalCents:'1717'}));
   assert.equal(response.status,409);assert.equal(s.saved.size,0);assert.equal(s.f.stats().patches,0);
  });
  await check('server wrong account stops before loading database or storage sources',async()=>{
   let loads=0;await assert.rejects(()=>ordinaryEstimateServerRuntime({readEnvironment:async()=>({GELATO_ORDINARY_RELEASE_ENABLED:'true',
    GELATO_ORDINARY_RELEASE_ACCOUNT_SHA256:'0'.repeat(64),GELATO_ORDINARY_RELEASE_APPROVERS:identity.actor,GELATO_API_KEY:'synthetic-wrong-account'}),
    loadServices:async()=>{loads++;throw Error('Must not load');}}),/account_mismatch/);assert.equal(loads,0);
  });
  for(const [quantity,children] of [[2,1],[1,2]]){
   await check('estimate policy refuses quantity'+quantity+' children'+children+' outside one test copy',async()=>{
    const s=await setup('estimate',quantity,children);const response=await s.handler(post({action:'review',submissionId:s.f.permit.submissionId,pricingPolicy:ESTIMATE_TEST_PRINT_POLICY,maximumQuotedSubtotalCents:'10000'}));
    assert.equal(response.status,409);assert.equal(s.saved.size,0);assert.equal(s.f.stats().patches,0);
   });
  }
  console.log(JSON.stringify({passed:true,checks:checks.length,cases:checks,liveRequests:0,
   productionActivation:false,financialEvidence:'legacy complete totals synthetic; selected estimate adapter reads intercepted documented quote shape, unknown final charges remain null',persistence:'actual SDK and RPC adapter against intercepted in-memory contract; separate disposable SQL suite proves database semantics'}));
 }finally{globalThis.fetch=originalFetch;}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
