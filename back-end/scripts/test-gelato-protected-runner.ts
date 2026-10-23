/** Local transport/receipt and failure tests. Global fetch is blocked. */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,readdirSync,readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {createProtectedRunnerAdapter,watchProtectedRunner,ProtectedRunnerBinding,ProtectedCredentialsSchema,protectedCaseDirectory} from './helpers/gelato-protected-runner-adapter';
import {protectedRunnerFixture,fixtureServices} from './helpers/gelato-protected-runner-fixture';
import {definitionSha256} from './helpers/prepare-w1-native-queue';
import {runPreparedIsolatedCase} from './helpers/gelato-isolated-case-runner';
const root=mkdtempSync(path.join(os.tmpdir(),'lhl-protected-runner-')),checks:string[]=[];
const originalFetch=globalThis.fetch;let external=0;
globalThis.fetch=async()=>{external++;throw Error('External network blocked');};
const mark=(s:string)=>{checks.push(s);console.log('PASS '+s);};
function setup(count=1,amazon=false){
 const f=protectedRunnerFixture(count,amazon),service=fixtureServices(f),journalRoot=path.join(root,String(checks.length)+'-'+Math.random());mkdirSync(journalRoot,{mode:0o700});
 const options={credentials:f.credentials,fetcher:service.fetcher,now:Date.now,sleep:async(_ms:number,s:AbortSignal)=>s.throwIfAborted(),journalRoot};
 const adapter=createProtectedRunnerAdapter(f.binding,definitionSha256(f.binding),options);
 const approval={packetSha256:definitionSha256(f.binding.packet),workflowSha256:definitionSha256(adapter.workflowHashes),sourceSha:f.binding.packet.sourceSha,maximumSpendCents:0,draftOnly:true,customerMessages:false};
 return {f,service,adapter,options,run:()=>runPreparedIsolatedCase(f.binding.packet,adapter.workflowHashes,approval,adapter.dependencies)};
}
async function main(){
 {
  const f=setup();const {diagnosticAccessClientId:unusedId,diagnosticAccessClientSecret:unusedSecret,...withoutAccess}=f.f.credentials;
  const adapter=createProtectedRunnerAdapter(f.f.binding,definitionSha256(f.f.binding),{...f.options,credentials:withoutAccess});
  await assert.rejects(runPreparedIsolatedCase(f.f.binding.packet,adapter.workflowHashes,{packetSha256:definitionSha256(f.f.binding.packet),workflowSha256:definitionSha256(adapter.workflowHashes),sourceSha:f.f.binding.packet.sourceSha,maximumSpendCents:0,draftOnly:true,customerMessages:false},adapter.dependencies),/Diagnostic Access credential pair required/);
  assert.equal(f.service.calls.length,0);assert.equal(existsSync(protectedCaseDirectory(f.options.journalRoot,f.f.binding.packet)),false);
  await assert.rejects(adapter.dependencies.preflight(new AbortController().signal));assert.equal(f.service.calls.length,0);
  mark('Missing diagnostic Access pair fails before durable claim or transport; direct preflight cannot bypass ownership');
 }
 {
  const f=setup();
  for(const key of ['diagnosticAccessClientId','diagnosticAccessClientSecret'] as const){
   const partial={...f.f.credentials};delete partial[key];assert.throws(()=>ProtectedCredentialsSchema.parse(partial));
   for(const value of ['', 'bad value with spaces', 'bad\r\nInjected: value', 'bad\tsecret-token-value', 'unicode-token-\u00e9-more-than16', 'a'.repeat(513)]){
    const candidate={...f.f.credentials,[key]:value};assert.throws(()=>createProtectedRunnerAdapter(f.f.binding,definitionSha256(f.f.binding),{...f.options,credentials:candidate}));
   }
  }
  assert.throws(()=>ProtectedCredentialsSchema.parse({...f.f.credentials,diagnosticAccessExtra:'unreviewed-authority'}));assert.equal(f.service.calls.length,0);
  mark('Partial, empty, whitespace, control, non-ASCII, oversized and unknown diagnostic credential fields reject before transport');
  for(const secret of ['cfast_'+'a'.repeat(48),'b'.repeat(64)]){
   const credentials={...f.f.credentials,diagnosticAccessClientId:'c'.repeat(32)+'.access',diagnosticAccessClientSecret:secret};
   assert.doesNotThrow(()=>createProtectedRunnerAdapter(f.f.binding,definitionSha256(f.f.binding),{...f.options,credentials}));
  }
  mark('Modern cfast_ and legacy hex service secrets remain syntactically supported without logging values');
 }
 {
  const f=setup();let diagnosticCalls=0;
  const adapter=createProtectedRunnerAdapter(f.f.binding,definitionSha256(f.f.binding),{...f.options,fetcher:async(input,init)=>{
   assert.equal(init?.credentials,'omit');const u=new URL(String(input)),headers=new Headers(init?.headers);
   if(headers.has('CF-Access-Client-Id')||headers.has('CF-Access-Client-Secret')){
    diagnosticCalls++;assert.equal(u.origin,f.f.binding.deploymentOrigin);assert.equal(u.pathname,'/api/internal/w4/submit-gelato-draft');assert.equal(init?.method,'GET');assert.match(u.searchParams.get('keyChallenge')??'',/^[a-f0-9]{64}$/);assert.equal(headers.get('Authorization'),'Bearer '+f.f.credentials.backend);
   }
   return f.options.fetcher(input,init);
  }});
  f.service.setFault((kind,result)=>{if(kind!=='runtime-off')return result;const headers=new Headers(result.headers);headers.set('Set-Cookie','CF_Authorization=SYNTHETIC-not-a-cookie-jar');return new Response(result.body,{status:result.status,headers});});
  await runPreparedIsolatedCase(f.f.binding.packet,adapter.workflowHashes,{packetSha256:definitionSha256(f.f.binding.packet),workflowSha256:definitionSha256(adapter.workflowHashes),sourceSha:f.f.binding.packet.sourceSha,maximumSpendCents:0,draftOnly:true,customerMessages:false},adapter.dependencies);
  assert.equal(diagnosticCalls,1);assert.equal(f.service.state.queueCalls,1);
  const journal=protectedCaseDirectory(f.options.journalRoot,f.f.binding.packet);const retained=readdirSync(journal).map(name=>readFileSync(path.join(journal,name),'utf8')).join('');
  for(const value of Object.values(f.f.credentials))if(typeof value==='string')assert.equal(retained.includes(value),false);
  const {diagnosticAccessClientId:unusedId,diagnosticAccessClientSecret:unusedSecret,...withoutAccess}=f.f.credentials;
  await createProtectedRunnerAdapter(f.f.binding,definitionSha256(f.f.binding),{...f.options,credentials:withoutAccess,now:()=>Date.parse(f.f.binding.packet.expiresAt)+1}).closeOnly();
  assert.equal(f.service.state.providerReads,1);assert(f.service.state.closed&&!f.service.state.timer);
  mark('Actual diagnostic GET alone receives both Access headers; cookies never replay, journal excludes secrets and expired independent close needs no edge pair');
 }
 for(const status of [302,401,403]){
  const f=setup();f.service.setFault((kind,result)=>kind==='runtime-off'?new Response('SYNTHETIC-untrusted-edge-body',{status,headers:status===302?{Location:'https://untrusted.example.invalid/'}:{}}):result);
  await assert.rejects(f.run());assert.equal(f.service.state.queueCalls,0);assert.equal(f.service.calls.filter(c=>c.path==='/api/internal/w4/submit-gelato-draft').length,1);assert(f.service.state.closed&&!f.service.state.timer);
  mark('Diagnostic edge '+status+' stops before queue without redirect, retry or credential forwarding; cleanup remains independent');
 }

 for(const [label,count,amazon]of [['website',1,false],['Amazon',1,true],['siblings',2,true]] as const){
  const f=setup(count,amazon);await f.run();assert.equal(f.service.state.draftCalls,1);assert.equal(f.service.state.providerReads,1);assert(f.service.state.closed&&!f.service.state.timer);assert(Object.values(f.f.flows).every(w=>!w.active),'Every owned workflow copy returns OFF');f.service.assertSentinels();await assert.rejects(f.run());assert.equal(f.service.state.queueCalls,1);mark(label+': concrete queue/assembly/draft/file/provider/mapping/timer/closure transport; replay denied');
 }
 {
  const f=setup();let delayed=false;
  f.service.setFault(async(kind,result)=>{if(kind==='assembly'){delayed=true;await delay(5200);}return result;});
  await f.run();assert(delayed);assert.equal(f.service.state.draftCalls,1);assert(f.service.state.closed);f.service.assertSentinels();
  mark('Terminal assembly response beyond five seconds completes once before scoped cleanup');
 }
 {
  const f=setup();f.service.setFault((kind,result)=>kind==='executions'?Response.json({data:[],nextCursor:null}):result);
  await assert.rejects(f.run());assert.equal(f.service.calls.filter(c=>c.path==='/api/v1/executions').length,12);
  assert.equal(f.adapter.counters().calls,192);assert(f.service.state.closed&&!f.service.state.timer);
  mark('Twelve complete observation iterations fit the 200-call cap and stop without a thirteenth');
 }

 for(const [label,mutate] of [
  ['missing proof',(r:Record<string,unknown>)=>({...r,keyAttestation:undefined})],
  ['malformed proof',(r:Record<string,unknown>)=>({...r,keyAttestation:{}})],
  ['replayed challenge',(r:Record<string,unknown>)=>({...r,keyAttestation:{...(r.keyAttestation as object),challenge:'0'.repeat(64)}})],
 ] as const){
  const f=setup();f.service.setFault(async(k,r)=>k==='runtime-off'?Response.json(mutate(await r.json())):r);
  await assert.rejects(f.run());assert.equal(f.service.state.queueCalls,0);assert(f.service.state.closed&&!f.service.state.timer);f.service.assertSentinels();mark(label+': no queue, independent close and shutdown still run');
 }
 for(const layer of ['cloudflare','globalProcess','nodeProcess'])for(const role of ['order','status']){
  const f=setup();f.service.setFault(async(k,r)=>{if(k!=='runtime-off')return r;const v=await r.json();v.keyAttestation.proofs[layer][role]='0'.repeat(64);return Response.json(v);});
  await assert.rejects(f.run());assert.equal(f.service.state.queueCalls,0);assert(f.service.state.closed&&!f.service.state.timer);mark('Wrong '+layer+'/'+role+' key proof rejects before queue and permits cleanup');
 }
 for(const field of ['id','url']){
  const f=setup();f.service.setFault(async(k,r)=>{if(k!=='controls')return r;const v=await r.json();v.result.canonical_deployment[field]=field==='id'?'00000000-0000-4000-8000-000000000000':'https://other.little-hero-labs-admin.pages.dev';return Response.json(v);});
  await assert.rejects(f.run());assert.equal(f.service.state.queueCalls,0);assert(f.service.state.closed&&!f.service.state.timer);mark('Wrong deployment '+field+' stops before runtime proof/queue; revocation still attempted');
 }
 {
  const f=setup();f.service.setFault(async(k,r)=>{if(k!=='controls'||f.service.state.metadataReads<2)return r;const v=await r.json();v.result.canonical_deployment.id='00000000-0000-4000-8000-000000000000';return Response.json(v);});
  await assert.rejects(f.run());assert.equal(f.service.state.queueCalls,0);assert(f.service.state.closed&&!f.service.state.timer);mark('Deployment moves across proof/readback: no queue and owned cleanup still attempted');
 }
 for(const bad of [undefined,'plain_text']){
  const f=setup();f.service.setFault(async(k,r)=>{if(k!=='controls')return r;const v=await r.json();v.result.deployment_configs.production.env_vars.GELATO_STATUS_API_KEY.type=bad;return Response.json(v);});
  await assert.rejects(f.run());assert.equal(f.service.state.queueCalls,0);assert(f.service.state.closed);mark('Missing/wrong secret metadata cannot be accepted as a valid mask');
 }
 {
  const f=setup();const old={...f.f.binding} as Record<string,unknown>;delete old.deploymentId;delete old.deploymentOrigin;assert.throws(()=>ProtectedRunnerBinding.parse(old));
  for(const url of ['https://admin.littleherolabs.com','https://other.pages.dev','http://synthetic-proof.little-hero-labs-admin.pages.dev','https://synthetic-proof.little-hero-labs-admin.pages.dev/path'])assert.throws(()=>ProtectedRunnerBinding.parse({...f.f.binding,deploymentOrigin:url}));
  mark('Old/unpinned contexts and foreign/mutable deployment origins fail before transport');
 }
 for(const stage of ['queue','assembly','draft','activate']){
  const f=setup();f.service.setFault((kind,result)=>{if(kind===stage)throw Error('Accepted but response lost');return result;});await assert.rejects(f.run());assert(f.service.state.closed&&!f.service.state.timer);assert.equal(f.service.state[stage==='activate'?'activateCalls':stage==='queue'?'queueCalls':stage==='assembly'?'assemblyCalls':'draftCalls'],1);await assert.rejects(f.run());f.service.assertSentinels();mark(stage+': accepted effect with lost acknowledgement is never retried and cleanup is independent');
 }
 for(const [label,kind,mutate]of [
  ['edited workflow version drift','workflow-queue',(r:Record<string,unknown>)=>({...r,versionId:'UNREVIEWED'})],
  ['published workflow differs','workflow-queue',(r:Record<string,unknown>)=>({...r,activeVersionId:'OLDER-PUBLISHED'})],
  ['wrong scope','gelato_isolation_scopes',(r:Record<string,unknown>[])=>[{...r[0],root_order_id:'TEST-GELATO-FOREIGN'}]],
  ['runtime OFF differs','runtime-off',(r:Record<string,unknown>)=>({...r,draftsEnabled:true})],
  ['wrong saved gate','print_provider_dispatch_gates',()=>[{enabled:true}]],
  ['wrong provider finances','provider',(r:Record<string,unknown>)=>({...r,financialStatus:'paid'})],
  ['zero-cost paid provider','provider',(r:Record<string,unknown>)=>({...r,financialStatus:'paid',receipts:[{total:0,totalInclVat:0,currency:'USD'}]})],
  ['draft marked in production','provider',(r:Record<string,unknown>)=>({...r,fulfillmentStatus:'in_production'})],
  ['draft child marked shipped','provider',(r:Record<string,unknown>)=>({...r,items:(r.items as Record<string,unknown>[]).map(i=>({...i,fulfillmentStatus:'shipped'}))})],
  ['draft with print job','provider',(r:Record<string,unknown>)=>({...r,items:(r.items as Record<string,unknown>[]).map(i=>({...i,printJobs:[{id:'SYNTHETIC-JOB'}]}))})],
  ['draft with tracking','provider',(r:Record<string,unknown>)=>({...r,shipment:{packages:[{trackingCode:'SYNTHETIC-TRACKING'}]}})],
  ['wrong provider item','provider',(r:Record<string,unknown>)=>({...r,items:[]})],
  ['wrong mapping','print_provider_submission_orders',()=>[{provider_order_id:'FOREIGN',order_type:'draft'}]],
  ['notification intent','print_provider_submission_notifications',()=>[{id:'unexpected'}]],
  ['empty timer','executions',()=>({data:[],nextCursor:null})],
  ['successful plus crashed timer','executions',(r:{data:Record<string,unknown>[]})=>({...r,data:[...r.data,{...r.data[0],id:'CRASHED-EXECUTION',status:'crashed'}]})],
  ['successful plus unknown timer state','executions',(r:{data:Record<string,unknown>[]})=>({...r,data:[...r.data,{...r.data[0],id:'UNKNOWN-EXECUTION',status:'unrecognized-terminal-state'}]})],
  ['wrong timer mode','executions',(r:{data:Record<string,unknown>[]})=>({...r,data:r.data.map(e=>({...e,mode:'manual'}))})],
  ['incomplete timer provenance','executions',()=>({data:[],nextCursor:'MORE'})],
  ['future timer execution','executions',(r:{data:Record<string,unknown>[]})=>({...r,data:r.data.map(e=>({...e,startedAt:new Date(Date.now()+86400000).toISOString(),stoppedAt:new Date(Date.now()+86400001).toISOString()}))})],
  ['zero scoped claims','gelato_isolation_scopes',(r:Record<string,unknown>[])=>r.map(j=>({...j,status_claims:0}))],
  ['future persisted refresh','gelato_scheduled_status',(r:Record<string,unknown>[])=>r.map(j=>j.last_success_at?{...j,last_success_at:new Date(Date.now()+86400000).toISOString()}:j)],
 ] as const){
  const f=setup();f.service.setFault(async(k,result)=>k===kind?new Response(JSON.stringify((mutate as (r:never)=>unknown)(await result.json() as never))):result);await assert.rejects(f.run());assert.equal(f.service.state.messages,0);f.service.assertSentinels();if(kind!=='gelato_isolation_scopes'&&kind!=='print_provider_dispatch_gates')assert(f.service.state.closed);mark(label+' rejects instead of reporting a pass');
 }
 for(const kind of ['artifact','provider-file']){
  const f=setup();f.service.setFault((k,r)=>k===kind?new Response('%PDF-SWAPPED') :r);await assert.rejects(f.run());assert(f.service.state.closed);if(kind==='artifact')assert.equal(f.service.state.draftCalls,0);mark(kind+': wrong actual PDF bytes reject with no later unauthorized work');
 }
 for(const mode of ['redirect','oversized','truncated','invalid-json','credential-error'] as const){
  const f=setup();f.service.setFault((k,r)=>{
   if(k!=='queue')return r;
   if(mode==='redirect')return new Response(null,{status:302,headers:{location:'https://forbidden.example.test/'}});
   if(mode==='oversized')return new Response('{}',{headers:{'content-length':'2000001'}});
   if(mode==='truncated')return new Response('{}',{headers:{'content-length':'999'}});
   if(mode==='invalid-json')return new Response('not-json');
   return new Response('not-authorized',{status:401});
  });await assert.rejects(f.run());assert.equal(f.service.state.queueCalls,1);assert(f.service.state.closed);assert.equal(f.service.state.assemblyCalls,0);mark(mode+': transport fails closed without retry or redirect');
 }
 const skipped=setup();await skipped.adapter.dependencies.journal.claim(definitionSha256(skipped.f.binding.packet));await assert.rejects(skipped.adapter.dependencies.workflow('queue','lhl-isolated-'+skipped.f.binding.packet.scopeId+'-queue',{},new AbortController().signal));assert.equal(skipped.service.calls.length,0);mark('Direct queue after journal claim cannot bypass successful private preflight');
 const concurrent=setup();await concurrent.adapter.dependencies.journal.claim(definitionSha256(concurrent.f.binding.packet));await concurrent.adapter.dependencies.preflight(new AbortController().signal);
 const queues=await Promise.allSettled([1,2].map(()=>concurrent.adapter.dependencies.workflow('queue','lhl-isolated-'+concurrent.f.binding.packet.scopeId+'-queue',{},new AbortController().signal)));assert.equal(queues.filter(r=>r.status==='fulfilled').length,1);assert.equal(concurrent.service.state.queueCalls,1);await concurrent.adapter.closeOnly();mark('Concurrent direct queue calls reserve one slot before awaits and send exactly one POST');
 for(const target of ['register-status','start'] as const){
  const race=setup();
  if(target==='register-status'){const original=race.adapter.dependencies.isolation;race.adapter.dependencies.isolation=async(action,body,signal)=>{if(action!=='register-status')return original(action,body,signal);const results=await Promise.allSettled([original(action,body,signal),original(action,body,signal)]);const good=results.filter(r=>r.status==='fulfilled');assert.equal(good.length,1);return (good[0] as PromiseFulfilledResult<unknown>).value;};}
  else{const original=race.adapter.dependencies.timer;race.adapter.dependencies.timer=async(action,signal)=>{if(action!=='start')return original(action,signal);const results=await Promise.allSettled([original(action,signal),original(action,signal)]);const good=results.filter(r=>r.status==='fulfilled');assert.equal(good.length,1);return (good[0] as PromiseFulfilledResult<unknown>).value;};}
  await race.run();if(target==='start')assert.equal(race.service.state.activateCalls,1);else assert.equal(race.service.calls.filter(c=>c.method==='POST'&&c.path==='/api/internal/w4/engineering-isolation').length,2);mark('Concurrent '+target+' calls reserve one slot and perform one effect');
 }
 const unowned=setup();await assert.rejects(unowned.adapter.dependencies.workflow('queue','lhl-isolated-'+unowned.f.binding.packet.scopeId+'-queue',{},new AbortController().signal));await assert.rejects(unowned.adapter.dependencies.timer('start',new AbortController().signal));assert.equal(unowned.service.calls.length,0);mark('Adapter dispatch and activation cannot bypass durable ownership or verified stage ordering');
 const wrong=setup();assert.throws(()=>createProtectedRunnerAdapter(wrong.f.binding,'0'.repeat(64),wrong.options));assert.throws(()=>createProtectedRunnerAdapter(wrong.f.binding,definitionSha256(wrong.f.binding),{...wrong.options,credentials:{...wrong.f.credentials,gelato:'wrong-account-key-0000000'}}));assert.equal(wrong.service.calls.length,0);mark('Unapproved binding and wrong private account fail before transport');
 const extra=setup();assert.throws(()=>ProtectedRunnerBinding.parse({...extra.f.binding,extra:true}));mark('Binding schema rejects extra authority fields');
 const expired=setup();const old=expired.adapter.dependencies.now;expired.adapter.dependencies.now=()=>Date.parse(expired.f.binding.packet.expiresAt)+1;await assert.rejects(expired.run());assert.equal(expired.service.calls.length,0);expired.adapter.dependencies.now=old;mark('Expired runner refuses work before claim/transport');
 const close=setup();close.service.state.claimed=true;close.service.state.assembled=true;close.service.state.created=true;close.service.state.registered=true;close.service.state.timer=true;
 const independent=createProtectedRunnerAdapter(close.f.binding,definitionSha256(close.f.binding),{...close.options,now:()=>Date.parse(close.f.binding.packet.expiresAt)+1});await assert.rejects(independent.closeOnly());assert(close.service.state.closed&&!close.service.state.timer);assert.equal(close.service.state.providerReads,0);mark('Independent cleanup revokes after expiry without primary journal; missing evidence is reported unconfirmed');
 {
  const f=setup();f.service.state.timer=true;
  f.service.setFault(async(kind,result)=>{if(kind==='deactivate'&&(await result.clone().json() as {id:string}).id===f.f.binding.workflowBindings.queue.id)return new Promise<Response>(()=>{});return result;});
  // AbortSignal.timeout is unref'ed; retain a referenced watchdog so Node cannot exit before this assertion.
  let watchdog:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([assert.rejects(f.adapter.closeOnly()),new Promise<never>((_,reject)=>{watchdog=setTimeout(()=>reject(Error('Hung cleanup regression did not finish')),7000);})]);}
  finally{if(watchdog)clearTimeout(watchdog);}
  for(const binding of Object.values(f.f.binding.workflowBindings))assert(f.service.calls.some(c=>c.path==='/api/v1/workflows/'+binding.id+'/deactivate'),'Each stop dispatched despite hung peer');
  assert.equal(f.service.state.timer,false);mark('Hung webhook shutdown cannot suppress independent timer/peer shutdown; closure remains unconfirmed');
 }
 const cleanupFailures=setup();cleanupFailures.service.setFault((k,r)=>{if(k==='close')throw Error('Close acknowledgement lost');return r;});await assert.rejects(cleanupFailures.adapter.closeOnly());assert.equal(cleanupFailures.service.state.stopCalls,1);assert(cleanupFailures.service.state.closed);mark('Unconfirmed close still stops timer and reads closure; caller gets failure');
 const uncooperative=setup();let attemptedClose=0;
 const stubborn=createProtectedRunnerAdapter(uncooperative.f.binding,definitionSha256(uncooperative.f.binding),{...uncooperative.options,fetcher:async(input,init)=>{if(String(input).endsWith('/engineering-isolation')&&String(init?.body).includes('close')){attemptedClose++;return new Promise(()=>{});}return uncooperative.options.fetcher(input,init);}});
 const signal=AbortSignal.timeout(20);
 const outcome=await Promise.race([stubborn.dependencies.isolation('close',{scopeId:uncooperative.f.binding.packet.scopeId,action:'close'},signal).then(()=> 'unexpected',()=> 'rejected'),delay(500).then(()=> 'hung')]);
 assert.equal(outcome,'rejected');assert.equal(attemptedClose,1);mark('Transport ignoring AbortSignal is actively deadline-raced instead of hanging cleanup');
 const delayed=setup();let release:(()=>Promise<void>)|undefined;
 const delayedAdapter=createProtectedRunnerAdapter(delayed.f.binding,definitionSha256(delayed.f.binding),{...delayed.options,fetcher:async(input,init)=>{
  if(String(input).endsWith('/activate'))return new Promise<Response>((resolve,reject)=>{release=async()=>{try{resolve(await delayed.options.fetcher(input,{...init,signal:new AbortController().signal}));}catch(e){reject(e);}};});return delayed.options.fetcher(input,init);
 }});
 const timer=delayedAdapter.dependencies.timer;delayedAdapter.dependencies.timer=(action,signal)=>timer(action,action==='start'?AbortSignal.any([signal,AbortSignal.timeout(50)]):signal);
 const delayedApproval={packetSha256:definitionSha256(delayed.f.binding.packet),workflowSha256:definitionSha256(delayedAdapter.workflowHashes),sourceSha:delayed.f.binding.packet.sourceSha,maximumSpendCents:0,draftOnly:true,customerMessages:false};
 await assert.rejects(runPreparedIsolatedCase(delayed.f.binding.packet,delayedAdapter.workflowHashes,delayedApproval,delayedAdapter.dependencies),/closure unconfirmed/);
 const journalDir=protectedCaseDirectory(delayed.options.journalRoot,delayed.f.binding.packet);let removeTail=false;
 for(const name of readdirSync(journalDir).sort())if(/^\d{3}\.json$/.test(name)){const event=JSON.parse(readFileSync(path.join(journalDir,name),'utf8'));if(event.step==='start-owned-timer')removeTail=true;if(removeTail)rmSync(path.join(journalDir,name));}
 await assert.rejects(createProtectedRunnerAdapter(delayed.f.binding,definitionSha256(delayed.f.binding),delayed.options).closeOnly());mark('Lost contiguous journal tail cannot erase durable registration evidence or turn unknown activation into verified cleanup');
 assert(release);assert(delayed.service.state.closed&&!delayed.service.state.timer);await release();await delay(10);assert.equal(delayed.service.state.timer,true,'Simulated n8n can accept activation after scope close');
 await assert.rejects(createProtectedRunnerAdapter(delayed.f.binding,definitionSha256(delayed.f.binding),delayed.options).closeOnly());assert(delayed.service.state.closed&&!delayed.service.state.timer);mark('Late timer activation cannot yield verified closure; scope revoked, timer stopped again and later cases remain blocked');
 const monitor=setup();await monitor.adapter.dependencies.journal.claim(definitionSha256(monitor.f.binding.packet));await watchProtectedRunner(monitor.adapter,{deadline:Date.now()+1000,now:Date.now,ownerExited:()=>true,sleep:monitor.options.sleep,signal:new AbortController().signal});assert(monitor.service.state.closed);mark('Independent monitor closes immediately on owner exit without dispatching');
 assert.equal(external,0);const receipt={checks:checks.length,cases:checks,externalRequests:0,productionOrderReads:0,providerCalls:0,deployments:0,customerMessages:0,limits:['Synthetic service protocols and short byte fixtures; not real provider/account/n8n proof','SIGKILL/separate-worker tests are in the companion crash suite']};console.log(JSON.stringify(receipt));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{globalThis.fetch=originalFetch;rmSync(root,{recursive:true,force:true});});
