/** Network-free behavioral rehearsal of generated graph code and protected runner orchestration. */
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {definitionSha256,workflowDefinition} from './helpers/prepare-w1-native-queue';
import {IsolatedCasePacket,prepareIsolatedWorkflows,type IsolatedCase,type PreparedWorkflow} from './helpers/prepare-gelato-isolated-workflows';
import {runPreparedIsolatedCase,FileCaseJournal,NORMAL_FLAGS,type IsolatedRunnerDependencies} from './helpers/gelato-isolated-case-runner';
const root=path.resolve(__dirname,'../..'),cases:string[]=[],originalFetch=globalThis.fetch;let network=0;
globalThis.fetch=async()=>{network++;throw Error('No external network allowed');};
const mark=(label:string)=>{cases.push(label);console.log('PASS '+label);};
const source=(siblings:boolean)=>JSON.parse(readFileSync(path.join(root,'docs/n8n-workflow-files/repo-centric/workflows',siblings?'w4.1-GELATO-Sibling-Aggregation.repo-centric.json':'w4-GELATO-Print_Fulfillment.repo-centric.json'),'utf8'));
const packet=(count=1,amazon=false):IsolatedCase=>{const order='TEST-GELATO-LOCAL-'+randomUUID().slice(0,8),now=Date.now();return IsolatedCasePacket.parse({schema:'lhl.gelato-isolated-case@1',runId:'LOCAL-'+randomUUID(),scopeId:randomUUID(),rootOrderId:order,sourceSha:'c'.repeat(40),nativeDefinitionSha256:definitionSha256(workflowDefinition(source(count===2))),fixtureManifestSha256:'a'.repeat(64),accountKeySha256:'b'.repeat(64),startsAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+20*60_000).toISOString(),members:Array.from({length:count},(_,i)=>({orderDbId:101+i,orderId:count===1?order:order+'-'+i,edition:amazon||count===2?'amazon':'standard',pdfSha256:String(i+1).repeat(64)}))});};
const claim=(p:IsolatedCase)=>({provider:'gelato',dispatchRoute:'dispatch',rootOrderId:p.rootOrderId,routeKind:p.members.length===2?'sibling':'single',submissionId:randomUUID(),claimToken:randomUUID(),idempotencyKey:'w1.1:'+p.rootOrderId+':'+p.members.map(m=>m.orderDbId).join('-'),orderDbIds:p.members.map(m=>m.orderDbId),orders:p.members.map(m=>({orderDbId:m.orderDbId,orderId:m.orderId,provider:'gelato',rootOrderId:p.rootOrderId,bookId:'book-finding-our-inner-voice',formatId:m.edition,configVersion:2,innerPageCount:32,apiPageCount:32,expectedPdfPageCount:35}))});
const plain=(v:unknown)=>JSON.parse(JSON.stringify(v));
export function executeCode(w:PreparedWorkflow,name:string,data:unknown,outputs=new Map<string,unknown>(),now=Date.now()){
 const n=w.nodes.find(n=>n.name===name);assert(n&&n.type==='n8n-nodes-base.code');
 return plain(vm.runInNewContext('(function(){'+n.parameters.jsCode+'})()',{$input:{first:()=>({json:data})},$execution:{id:'LOCAL-EXECUTION'},$:(key:string)=>({first:()=>({json:outputs.get(key)})}),Date:{now:()=>now,parse:Date.parse}}, {timeout:1000}));
}
async function executeGraph(w:PreparedWorkflow,input:unknown,http:(url:string,body:unknown)=>unknown,now=Date.now()){
 const outputs=new Map<string,unknown>();let data:unknown={body:input},current=w.nodes[0].name;
 for(let i=0;i<w.nodes.length;i++){
  const n=w.nodes.find(n=>n.name===current);assert(n);let stop=false;
  if(n.type.endsWith('.code')){const result=executeCode(w,current,data,outputs,now) as Array<{json:unknown}>;if(!result.length){stop=true;}else{assert.equal(result.length,1);data=result[0].json;}}
  else if(n.type.endsWith('.httpRequest')){
   const context={$json:data,$:(key:string)=>({first:()=>({json:outputs.get(key)})})};
   const expression=(value:unknown)=>typeof value==='string'&&value.startsWith('={{')?vm.runInNewContext(value.slice(3,-2).trim(),context,{timeout:1000}):value;
   data=await http(String(expression(n.parameters.url)),JSON.parse(String(expression(n.parameters.jsonBody))));
  }else if(n.type.endsWith('.respondToWebhook'))return data;
  else assert(n.type.endsWith('.webhook')||n.type.endsWith('.scheduleTrigger'));
  outputs.set(current,data);if(stop)return null;const next=w.connections[current].main[0];assert(next.length<=1);if(!next.length)return data;current=next[0].node;
 }
 throw Error('Graph never terminated');
}
function fixture(p=packet()){
 const prepared=prepareIsolatedWorkflows(p,source(p.members.length===2)),c=claim(p),steps:string[]=[],events:unknown[]=[],httpCalls:Array<{url:string;body:unknown}>=[];
 let now=Date.now(),fail:string|undefined,badFile=false,badReadback=false,closeFail=false,stopFail=false,closed=false,claimed=false;const deadTimer:boolean[]=[];
 const f=p.members.map(m=>({orderDbId:m.orderDbId,sha256:m.pdfSha256}));
 const d:IsolatedRunnerDependencies={now:()=>now,journal:{claim:async()=>{if(claimed)throw Error('Already attempted');claimed=true;},record:async e=>{events.push(e);}},
  preflight:async()=>{steps.push('preflight');return {at:new Date(now).toISOString(),sourceSha:p.sourceSha,packetSha256:prepared.packetSha256,accountKeySha256:badReadback?'0'.repeat(64):p.accountKeySha256,statusAccountKeySha256:p.accountKeySha256,workflowSha256:prepared.workflowSha256,flags:Object.fromEntries(NORMAL_FLAGS.map(k=>[k,false])),gates:{dispatch:false,ordinaryRelease:false},noFundingRoutes:true,applicationMessagesSuppressed:true,providerMessagesSuppressed:true,ownedFreshCohortVerified:true,recipientVerified:true,fixtureManifestSha256:p.fixtureManifestSha256};},
  workflow:async(stage,_path,body)=>{steps.push(stage);if(stage===fail)throw Error('Unknown dispatch acknowledgement');return executeGraph(prepared.workflows[stage],body,async(url,data)=>{httpCalls.push({url,body:data});if(stage==='queue')return {success:true,groups:[c],customerMessages:false};return {success:true,submissionId:'untrusted',claimToken:'untrusted',mode:'untrusted'};},now);},
  verifyAssembly:async()=>{steps.push('verifyAssembly');return badFile?[{...f[0],sha256:'0'.repeat(64)}]:f;},
  verifyProviderDraft:async()=>{steps.push('verifyProvider');return {submissionId:c.submissionId,rootOrderId:p.rootOrderId,accountKeySha256:p.accountKeySha256,orderType:'draft',financialStatus:'draft',providerRootIds:['LOCAL-PROVIDER'],files:f,customerMessages:false};},
  isolation:async(action)=>{steps.push(action);if(action==='close'){if(closeFail)throw Error('Close not confirmed');closed=true;return {closed:true,customerMessages:false};}return {registered:true,customerMessages:false};},
  timer:async(action)=>{steps.push('timer-'+action);if(action==='stop'){if(stopFail)throw Error('Stop not confirmed');deadTimer.push(true);return {stopped:true};}if(action==='start')return {started:true,workflowSha256:prepared.workflowSha256.timer};return {ticks:3,actualClaims:3,successfulRefreshes:3,errors:0,providerRoots:['LOCAL-PROVIDER'],customerMessages:false,source:'hosted-timer'};},
  verifyClosed:async()=>{steps.push('verifyClosed');return {scopeClosed:closed,parentWindowClosed:closed,registrationDisabled:closed,leaseCleared:closed,flags:Object.fromEntries(NORMAL_FLAGS.map(k=>[k,false])),gates:{dispatch:false,ordinaryRelease:false}};}};
 const approval={packetSha256:prepared.packetSha256,workflowSha256:definitionSha256(prepared.workflowSha256),sourceSha:p.sourceSha,maximumSpendCents:0,draftOnly:true,customerMessages:false};
 return {p,c,d,prepared,steps,events,httpCalls,approval,setFail:(s:string)=>{fail=s;},badFile:()=>{badFile=true;},badReadback:()=>{badReadback=true;},expire:()=>{now=Date.parse(p.expiresAt)+1;},breakClose:()=>{closeFail=true;},breakStop:()=>{stopFail=true;},run:()=>runPreparedIsolatedCase(p,prepared.workflowSha256,approval,d)};
}
async function main(){
 for(const [label,count,amazon]of [['website',1,false],['amazon',1,true],['siblings',2,true]] as const){
  const f=fixture(packet(count,amazon));const result=await f.run();assert(result.passed);assert.equal(result.maximumSpendCents,0);
  assert.deepEqual(f.httpCalls.map(c=>new URL(c.url).pathname),['/api/internal/w4/engineering-isolation','/api/internal/w4/'+(count===2?'build-gelato-sibling-print-pdf':'build-gelato-print-pdf'),'/api/internal/w4/quote-gelato-submission','/api/internal/w4/submit-gelato-draft']);
  assert.deepEqual(f.httpCalls[0].body,{scopeId:f.p.scopeId,action:'queue'});assert(f.steps.indexOf('verifyAssembly')<f.steps.indexOf('draft'));assert(f.steps.indexOf('close')<f.steps.indexOf('timer-stop'));
  assert(!JSON.stringify(f.events).includes(f.c.claimToken),'Journal must not persist claim authority');
  await assert.rejects(f.run());mark(label+': actual generated queue → assembly → independent hashes → quote/draft → owned timer → independent closure; replay denied');
 }
 const f=fixture(),w=f.prepared.workflows;
 for(const [name,workflow]of Object.entries(w)){
  assert(!('active' in workflow)&&!('id' in workflow)&&!('pinData' in workflow)&&!('staticData' in workflow));assert.equal(workflow.settings.saveDataSuccessExecution,'none');assert.equal(workflow.settings.saveDataErrorExecution,'none');
  for(const n of workflow.nodes){if(n.type.endsWith('httpRequest')){assert.equal(n.retryOnFail,false);assert.equal(n.onError,'stopWorkflow');assert.equal((n.parameters.options as {redirect:{redirect:{followRedirects:boolean}}}).redirect.redirect.followRedirects,false);assert(n.credentials);}}
  assert(!/lulu|sp-api|sendgrid|resend|smtp|\/v4\/orders/.test(JSON.stringify(workflow)),name);
 }
 mark('No ordinary graph overwrite, dynamic state, raw secret, direct provider, message sender or HTTP retry in candidates');
 assert.throws(()=>prepareIsolatedWorkflows({...f.p,nativeDefinitionSha256:'0'.repeat(64)},source(false)));
 const drift=source(false);drift.nodes[0].parameters.path='drift';assert.throws(()=>prepareIsolatedWorkflows(f.p,drift));mark('Source hash and native definition drift rejected');
 for(const patch of [{members:[f.p.members[0],f.p.members[0]]},{expiresAt:new Date(Date.parse(f.p.startsAt)+31*60_000).toISOString()},{rootOrderId:'ordinary-order'},{extra:'forbidden'}])assert.throws(()=>IsolatedCasePacket.parse({...f.p,...patch}));mark('Duplicate members, overlong window, non-test root and extra packet fields rejected');
 await assert.rejects(executeGraph(w.queue,{orderDbIds:[9001]},()=>{throw Error('Must not call transport');}));mark('Queue trigger cannot inject selectors');
 for(const groups of [[],[f.c,f.c],[{...f.c,dispatchRoute:'hold'}],[{...f.c,rootOrderId:'TEST-GELATO-OTHER'}]])assert.throws(()=>executeCode(w.queue,'Verify Exact Native Claim',{success:true,groups,customerMessages:false}));mark('Replay, duplicate group, hold and foreign queue output stop before native dispatch');
 for(const bad of [{...f.c,claimToken:'bad'},{...f.c,orderDbIds:[9001]},{...f.c,orders:[{...f.c.orders[0],formatId:'amazon'}]}])await assert.rejects(executeGraph(w.assembly,bad,()=>{throw Error('Must not call transport');}));mark('Claim token, cohort and edition drift rejected at native intake');
 await assert.rejects(executeGraph(w.assembly,f.c,()=>({success:true}),Date.parse(f.p.expiresAt)));assert.equal(await executeGraph(w.timer,{},()=>{throw Error('Expired timer must not call transport');},Date.parse(f.p.expiresAt)),null);mark('Expired native intake rejects; expired recurring trigger stops before HTTP');
 await assert.rejects(executeGraph(w.draft,f.c,()=>{throw Error('Must not submit');}));mark('Draft stage cannot run without independent frozen-file proof');
 for(const stage of ['queue','assembly','draft']){const a=fixture();a.setFail(stage);await assert.rejects(a.run());assert.equal(a.steps.filter(s=>s===stage).length,1);assert(a.steps.includes('close'));assert(a.steps.includes('verifyClosed'));if(stage==='assembly')assert(!a.steps.includes('draft'));}mark('Lost/failed queue, assembly and draft acknowledgements close authority without retry');
 const swapped=fixture(packet(2,true));swapped.badFile();await assert.rejects(swapped.run());assert(!swapped.steps.includes('draft'));assert(swapped.steps.includes('close'));mark('Wrong sibling byte hash stops before quote/create');
 const wrong=fixture();wrong.badReadback();await assert.rejects(wrong.run());assert(!wrong.steps.includes('queue'));mark('Wrong account readback stops before queue');
 const unapproved=fixture();await assert.rejects(runPreparedIsolatedCase(unapproved.p,unapproved.prepared.workflowSha256,{...unapproved.approval,maximumSpendCents:1},unapproved.d));assert.equal(unapproved.steps.length,0);mark('Wrong approval/spend binding cannot call even preflight');
 const expiry=fixture();const verify=expiry.d.verifyAssembly;expiry.d.verifyAssembly=async(...args)=>{const v=await verify(...args);expiry.expire();return v;};await assert.rejects(expiry.run());assert(!expiry.steps.includes('draft'));assert(expiry.steps.includes('close'));mark('Expiry across blocking verification stops submission but permits revocation');
 const stop=fixture();stop.breakStop();await assert.rejects(stop.run(),/closure unconfirmed/);assert(stop.steps.includes('close'));assert(stop.steps.includes('verifyClosed'));mark('Timer stop failure cannot suppress independent scope close/verification');
 const noClose=fixture();noClose.breakClose();await assert.rejects(noClose.run(),/closure unconfirmed/);assert(noClose.steps.includes('timer-stop'));assert(noClose.steps.includes('verifyClosed'));mark('Scope close failure still stops timer and fails entire case');
 for(const target of ['queue','draft','start-owned-timer']){
  const broken=fixture();const record=broken.d.journal.record;let full=false;
  broken.d.journal.record=async e=>{if(e.step===target&&e.state==='starting')full=true;if(full)throw Error('ENOSPC');await record(e);};
  await assert.rejects(broken.run());assert(broken.steps.includes('close'));assert(broken.steps.includes('verifyClosed'));
  if(target==='start-owned-timer')assert(broken.steps.includes('timer-stop'));
 }
 mark('Persistent journal failure cannot prevent close, timer stop or independent verification');
 const journalExpiry=fixture();const oldRecord=journalExpiry.d.journal.record;journalExpiry.d.journal.record=async e=>{await oldRecord(e);if(e.step==='queue'&&e.state==='starting')journalExpiry.expire();};
 await assert.rejects(journalExpiry.run());assert(!journalExpiry.steps.includes('queue'));assert(journalExpiry.steps.includes('close'));mark('Expiry during awaited journal write denies dispatch before adapter invocation');
 for(const siblings of [false,true]){
  const alias=fixture(packet(siblings?2:1,siblings));let sent:unknown;
  await executeGraph(alias.prepared.workflows.assembly,{...alias.c,payload:{orderId:'FOREIGN',submissionId:randomUUID(),claimToken:randomUUID()},orderIds:['FOREIGN'],orderPrefix:'foreign/path',oneManifestUrl:'https://foreign.example.test/1.json'},(_url,b)=>{sent=b;return {success:true};});
  const body=sent as {orderId?:string;orders?:Array<{orderId:string}>;submissionId:string};
  assert.equal(body.submissionId,alias.c.submissionId);assert.equal(body.orderId??body.orders?.[0].orderId,alias.p.members[0].orderId);assert(!JSON.stringify(body).includes('FOREIGN'));assert(!JSON.stringify(body).includes('foreign/path'));
 }
 mark('Nested payload and path aliases cannot override canonical single/sibling assembly selectors');
 const emptyTimer=fixture();const originalTimer=emptyTimer.d.timer;emptyTimer.d.timer=async(...args)=>args[0]==='observe'?{ticks:3,actualClaims:0,successfulRefreshes:0,errors:0,providerRoots:['LOCAL-PROVIDER'],customerMessages:false,source:'hosted-timer'}:originalTimer(...args);await assert.rejects(emptyTimer.run());assert(emptyTimer.steps.includes('close'));mark('Timer ticks without an actual successful scoped refresh cannot pass');
 const foreignProvider=fixture();const originalProvider=foreignProvider.d.verifyProviderDraft;foreignProvider.d.verifyProviderDraft=async(...args)=>({...await originalProvider(...args) as object,submissionId:randomUUID()});await assert.rejects(foreignProvider.run());assert(!foreignProvider.steps.includes('register-status'));mark('Provider receipt must bind exact submission, root and account before polling registration');
 const dir=mkdtempSync(path.join(os.tmpdir(),'lhl-runner-journal-'));
 try{const shared=path.join(dir,'case');const first=new FileCaseJournal(shared),second=new FileCaseJournal(shared);const wins=await Promise.allSettled([first.claim(f.prepared.packetSha256),second.claim(f.prepared.packetSha256)]);assert.equal(wins.filter(r=>r.status==='fulfilled').length,1);await assert.rejects(new FileCaseJournal(shared).claim(f.prepared.packetSha256));mark('Two journal instances race on atomic mkdir; a new instance cannot reuse the claimed directory');}finally{rmSync(dir,{recursive:true,force:true});}
 assert.equal(network,0);const receipt={checks:cases.length,cases,liveRequests:0,credentialFilesRead:0,hostedWorkflowMutations:0,providerCreates:0,customerMessages:0,limitations:['Generated Code/HTTP contracts executed by a local VM harness; not a hosted n8n engine test','Timer start/recurrence, provider response and artifact fetch adapter are synthetic; no protected live adapter is shipped']};
 if(process.env.GELATO_PREPARATION_OUTPUT){const {writeFileSync}=await import('node:fs');writeFileSync(process.env.GELATO_PREPARATION_OUTPUT,JSON.stringify(receipt,null,2)+'\n');}console.log(JSON.stringify(receipt));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{globalThis.fetch=originalFetch;});
