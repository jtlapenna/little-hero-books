/** Real worker/IPC + actual SQL admission/revocation; all HTTP targets are synthetic localhost interceptions. */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,chmod,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';import os from 'node:os';import http from 'node:http';import {fork,type ChildProcess} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {LocalPreviewDatabase,quote} from '../../scripts/testing/local-preview-database';
import {protectedRunnerFixture,fixtureServices} from './helpers/gelato-protected-runner-fixture';
import {definitionSha256} from './helpers/prepare-w1-native-queue';
import {sha256} from './helpers/gelato-protected-runner-adapter';
import type {Launch} from './helpers/gelato-protected-launch-context';
import {launchProtectedCase} from './helpers/gelato-protected-launcher';
import {closureFromSuccessfulLaunch} from './helpers/gelato-case-evidence';
import {seed,setup,apply,admission,revocation,closed,type Fixture} from './test-gelato-admission-settlement';
import {withFencedAdmission,type ClosureProof} from './helpers/gelato-fenced-admission';import {createSetupCleanup,setupMonitor} from './helpers/gelato-setup-cleanup';
const wait=async(test:()=>boolean,ms=10000)=>{const end=Date.now()+ms;while(!test()){assert(Date.now()<end,'Test confirmation timeout');await sleep(10);}};
async function owner(){process.once('message',async(v:{c:Launch;mode:string;proof:ClosureProof})=>{
 try{await withFencedAdmission(v.c,v.proof,async()=>{if(v.mode==='before')return new Promise(()=>{});assert(v.c.transport.kind==='synthetic-loopback');const r=await fetch(v.c.transport.origin+'/local-admission');assert(r.ok);process.send?.({kind:'admitted'});},()=>new Promise(()=>{}),pid=>process.send?.({kind:'ready',pid}));}catch{process.exitCode=1;}
 });}
async function main(){
 const db=new LocalPreviewDatabase(),directory=await realpath(await mkdtemp(path.join(os.tmpdir(),'lhl-fenced-processes-')));await chmod(directory,0o700);const checks:string[]=[],trace:Array<{mode:string;calls:number;bytes:number}>=[];let business=0,previousClosure:any;
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Parent external fetch forbidden');};
 const mark=(s:string)=>{checks.push(s);console.log('PASS '+s);};
 try{setup(db);apply(db);
 for(const mode of ['healthy','foreign-closure','spoofed-closure','stale-closure','empty-rejection','empty-body-rejection','lost-ack','bad-closure','delayed-dispatch','owner-startup','owner-before','owner-during','owner-after','failed-revoke'] as const){
  const f=protectedRunnerFixture(),p=f.binding.packet;
  f.credentials.diagnosticAccessClientId='SYNTHETIC-ACCESS-ID-32-CHARACTERS';f.credentials.diagnosticAccessClientSecret='SYNTHETIC-ACCESS-SECRET-32-CHARACTERS';
  p.sourceSha='c9b939f6a25bda6fa1ee4090973cea2c924c5450';p.members.forEach((m,i)=>m.orderDbId=40000+checks.length*10+i);
  f.rows.forEach((row,i)=>row.id=p.members[i].orderDbId);f.binding.artifacts.forEach((a,i)=>a.orderDbId=p.members[i].orderDbId);f.binding.cohortRowsSha256=definitionSha256(f.rows);
  const address={name:'Synthetic Recipient',address_line_1:'1 Local Fixture Way',address_line_2:'',city:'Fixture',state_code:'CA',postal_code:'00000',country_code:'US',email:'fixture@example.test'};
  const item={label:'WEB',packet:p,productUid:f.binding.expectedRequest.productUid,shippingTier:'standard',frozenAddress:address,contactEmail:address.email};
  const fixture:Fixture={scope:p.scopeId,root:p.rootOrderId,ids:p.members.map(m=>m.orderDbId),packet:p,c:item,catalog:{cases:[item]},token:sha256(f.credentials.scope),account:p.accountKeySha256,manifest:p.fixtureManifestSha256} as Fixture;
  seed(db,fixture);const service=fixtureServices(f),folder=path.join(directory,mode);await mkdir(folder,{mode:0o700});const journalRoot=path.join(folder,'journals');await mkdir(journalRoot,{mode:0o700});
  let setupCalls=0,setupBytes=0,sqlStarted=false,commitRelease:(()=>void)|undefined;const requests:string[]=[];
  const json=(raw:unknown,status=200)=>new Response(JSON.stringify(raw),{status,headers:{'content-type':'application/json'}});
  const server=http.createServer(async(req,res)=>{try{
   assert.equal(req.socket.remoteAddress,'127.0.0.1');
   if(req.url==='/local-admission'){
    if(mode==='owner-during'){const session=await db.openSession();try{await session.query(admission(fixture).replace(/COMMIT;\s*$/,''));sqlStarted=true;await new Promise<void>(r=>{commitRelease=r;});await session.query('COMMIT');}finally{await session.close();}}
    else{await db.sqlAsync(admission(fixture));sqlStarted=true;}
    res.writeHead(200);res.end('{}');return;
   }
   const target=new URL(req.url!,'http://127.0.0.1').searchParams.get('target');assert(target);const u=new URL(target),parts:Buffer[]=[];for await(const part of req)parts.push(part);const body=Buffer.concat(parts).toString(),isSetup=req.headers['x-lhl-setup-settlement']==='1';let result:Response;
   if(isSetup){setupCalls++;requests.push(req.method+' '+u.pathname);assert(setupCalls<=24);}
   if(isSetup&&u.pathname==='/rest/v1/rpc/revoke_gelato_admission'){
    assert.equal(req.method,'POST');const input=JSON.parse(body);assert.deepEqual(input,{p_scope_id:p.scopeId,p_root_order_id:p.rootOrderId,p_token_sha256:fixture.token,p_account_key_sha256:fixture.account,p_fixture_manifest_sha256:fixture.manifest,p_child_order_ids:fixture.ids});
    result=mode==='failed-revoke'?json({error:'synthetic unavailable'},500):json(JSON.parse(await db.sqlAsync(revocation(fixture))));
   }else if(isSetup&&['gelato_admission_revocations','gelato_isolation_scopes','gelato_engineering_submission_windows','gelato_scheduled_status'].some(t=>u.pathname==='/rest/v1/'+t)){
    assert.equal(req.method,'GET');const table=u.pathname.split('/').pop()!;let predicate:string;
    if(table==='gelato_admission_revocations'){assert.equal(u.searchParams.get('scope_id'),'eq.'+p.scopeId);assert.equal(u.searchParams.get('root_order_id'),'eq.'+p.rootOrderId);predicate='scope_id='+quote(p.scopeId)+' AND root_order_id='+quote(p.rootOrderId);}
    else if(table==='gelato_isolation_scopes'){assert.equal(u.searchParams.get('id'),'eq.'+p.scopeId);predicate='id='+quote(p.scopeId);}
    else if(table==='gelato_engineering_submission_windows'){assert.equal(u.searchParams.get('root_order_id'),'eq.'+p.rootOrderId);predicate='root_order_id='+quote(p.rootOrderId);}
    else throw Error('No registration is created in these setup-only database fixtures');
    result=json(JSON.parse(await db.sqlAsync("SET ROLE service_role;SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM public."+table+' x WHERE '+predicate)));
   }else{
    if(!isSetup&&u.pathname==='/api/internal/w4/engineering-isolation'&&body&&JSON.parse(body).action==='close')await db.sqlAsync('SET ROLE service_role;SELECT public.close_gelato_isolation_scope('+quote(p.scopeId)+','+quote(fixture.token)+')');
    result=await service.fetcher(target,{method:req.method,headers:req.headers as Record<string,string>,...(body?{body}:{}),redirect:'manual',signal:new AbortController().signal});
   }
   const bytes=Buffer.from(await result.arrayBuffer());if(isSetup){setupBytes+=bytes.length;assert(setupBytes<=16000000);}res.writeHead(result.status,Object.fromEntries(result.headers));res.end(bytes);
  }catch(e){res.writeHead(500);res.end(JSON.stringify({error:'Synthetic intercepted request failed',kind:e instanceof Error?e.name:'Unknown'}));}});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const a=server.address();assert(a&&typeof a!=='string');
  const c:Launch={schema:'lhl.protected-launch@1',binding:f.binding,bindingSha256:definitionSha256(f.binding),credentials:f.credentials,journalRoot,transport:{kind:'synthetic-loopback',origin:'http://127.0.0.1:'+a.port},approval:{packetSha256:definitionSha256(p),workflowSha256:definitionSha256(Object.fromEntries(Object.entries(f.binding.workflowBindings).map(([k,w])=>[k,w.definitionSha256]))),sourceSha:p.sourceSha,maximumSpendCents:0,draftOnly:true,customerMessages:false}};
  const file=path.join(folder,'context.json');await writeFile(file,JSON.stringify(c),{mode:0o600});const digest=sha256(await readFile(file));
  const plan={label:'WEB',packet:p,packetSha256:definitionSha256(p),items:Object.values(f.binding.workflowBindings).map(w=>({id:w.id}))},proof:ClosureProof={file,sha256:digest,plan};
  let terminalReceipt:any;
  try{
   if(mode==='owner-startup'){
    const worker=path.join(__dirname,'helpers/gelato-setup-monitor-worker.ts');
    // Reproduce a disconnect before the actual TSX worker entrypoint loads: no accepted context means no receipt/authority, and exit must fail closed.
    const delayed=path.join(folder,'delayed-worker.mjs');await writeFile(delayed,"if(process.connected)await new Promise(r=>process.once('disconnect',r));await import("+JSON.stringify(pathToFileURL(worker).href)+');',{mode:0o600});
    const early=fork(delayed,[],{execArgv:['--import','tsx'],env:{PATH:process.env.PATH,NODE_ENV:'test'},stdio:['ignore','ignore','ignore','ipc']});
    const earlyExit=new Promise<number|null>(resolve=>early.once('exit',resolve));early.send(c,()=>early.disconnect());assert.equal(await Promise.race([earlyExit,sleep(10000,undefined,{ref:false}).then(()=>{throw Error('Pre-entrypoint disconnect did not terminate');})]),1);
    await assert.rejects(readFile(path.join(journalRoot,'setup-settlement-terminal.json')),{code:'ENOENT'});assert.equal(setupCalls,0);
    for(const cancellation of ['message','signal']){
     const idle=fork(worker,[],{execArgv:['--import','tsx'],env:{PATH:process.env.PATH,NODE_ENV:'test'},stdio:['ignore','ignore','ignore','ipc']});let idleReady=false;idle.on('message',(v:any)=>{if(v?.kind==='ready-for-context')idleReady=true;});const idleExit=new Promise<number|null>(resolve=>idle.once('exit',resolve));await wait(()=>idleReady);
     if(cancellation==='message')idle.send('owner-exited');else idle.kill('SIGTERM');assert.equal(await Promise.race([idleExit,sleep(10000,undefined,{ref:false}).then(()=>{throw Error('Pre-context cancellation did not terminate');})]),1);
     await assert.rejects(readFile(path.join(journalRoot,'setup-settlement-terminal.json')),{code:'ENOENT'});assert.equal(setupCalls,0);
    }
    // Hold only this synthetic privateDirectory lstat until disconnect, making pre-arm owner loss deterministic without production test hooks.
    const preload=path.join(folder,'hold-directory.mjs');await writeFile(preload,`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const original=fs.promises.lstat;fs.promises.lstat=async function(value,...args){if(String(value)===${JSON.stringify(journalRoot)}){process.send?.({kind:'initialization-blocked'});await new Promise(resolve=>{if(!process.connected)resolve();else process.once('disconnect',resolve);});}return original.call(this,value,...args);};syncBuiltinESMExports();`,{mode:0o600});
    const child=fork(worker,[],{execArgv:['--import',preload,'--import','tsx'],env:{PATH:process.env.PATH,NODE_ENV:'test'},stdio:['ignore','ignore','ignore','ipc']});let ready=false,blocked=false,armed=false;
    child.on('message',(v:any)=>{if(v?.kind==='ready-for-context')ready=true;if(v?.kind==='initialization-blocked')blocked=true;if(v?.kind==='armed')armed=true;});
    const exit=new Promise<number|null>(resolve=>child.once('exit',resolve));await wait(()=>ready);child.send(c);await wait(()=>blocked);assert.equal(armed,false);assert.equal(setupCalls,0);child.disconnect();
    const code=await Promise.race([exit,sleep(10000,undefined,{ref:false}).then(()=>{throw Error('Startup owner-loss cleanup did not settle');})]);assert.equal(code,0);
    terminalReceipt=JSON.parse(await readFile(path.join(journalRoot,'setup-settlement-terminal.json'),'utf8'));assert.equal(terminalReceipt.terminal.kind,'closed');assert.equal(terminalReceipt.terminal.result.confirmed,true);assert.equal(terminalReceipt.terminal.result.calls,setupCalls);assert.equal(terminalReceipt.terminal.result.bytes,setupBytes);closed(db,fixture);assert.equal(service.state.queueCalls,0);mark('IPC disconnect during worker startup is latched and immediately settles cleanup');
   }else if(mode.startsWith('owner-')){
    const child=fork(__filename,['--owner'],{execArgv:['--import','tsx'],env:{PATH:process.env.PATH,NODE_ENV:'test'},stdio:['ignore','ignore','ignore','ipc']});let ready=false,admitted=false,monitorPid:number|undefined;
    child.on('message',(v:any)=>{if(v?.kind==='ready'){ready=true;monitorPid=v.pid;}if(v?.kind==='admitted')admitted=true;});child.send({c,mode:mode.slice(6),proof});
    await wait(()=>ready);if(mode==='owner-during')await wait(()=>sqlStarted);if(mode==='owner-after')await wait(()=>admitted);
    child.kill('SIGKILL');await new Promise<void>(r=>child.once('exit',()=>r()));
    if(mode==='owner-during'){await wait(()=>requests.includes('POST /rest/v1/rpc/revoke_gelato_admission'));commitRelease!();}
    await wait(()=>requests.includes('GET /rest/v1/gelato_ordinary_release_gate'));
    if(monitorPid)await wait(()=>{try{process.kill(monitorPid!,0);return false;}catch{return true;}});
    terminalReceipt=JSON.parse(await readFile(path.join(journalRoot,'setup-settlement-terminal.json'),'utf8'));assert.equal(terminalReceipt.terminal.kind,'closed');assert.equal(terminalReceipt.terminal.result.confirmed,true);assert.equal(terminalReceipt.terminal.result.calls,setupCalls);assert.equal(terminalReceipt.terminal.result.bytes,setupBytes);assert(setupBytes>0);
    closed(db,fixture);if(mode==='owner-before')assert.throws(()=>db.sql(admission(fixture)));
    assert.equal(service.state.queueCalls,0);mark('Owner SIGKILL '+mode.slice(6)+' admission leaves settled durable closure');
   }else{
    const baseline=business;let late:Promise<unknown>|undefined;
    const task=withFencedAdmission(c,proof,async guard=>{
     if(mode==='empty-rejection')return Promise.reject(undefined);
     if(mode==='delayed-dispatch'){late=(async()=>{await sleep(200);assert.throws(()=>db.sql(admission(fixture)));})();return new Promise(()=>{});}
     await db.sqlAsync(admission(fixture));guard();if(mode==='lost-ack'||mode==='failed-revoke')throw Error('Synthetic lost acknowledgment');
    },async()=>{
     business++;if(mode==='empty-body-rejection')throw undefined;if(mode==='foreign-closure')return previousClosure;if(mode==='spoofed-closure')return {...previousClosure,rootOrderId:p.rootOrderId,packetSha256:definitionSha256(p),bindingSha256:c.bindingSha256,workflowIds:plan.items.map(w=>w.id).sort(),contextFile:file,launchContextSha256:digest,planSha256:definitionSha256(plan),closedAt:new Date().toISOString()};if(mode==='bad-closure')return {};
     const result=await launchProtectedCase(file,digest,'rehearse');
     closedWithoutFence();const closure=closureFromSuccessfulLaunch(c,plan,file,digest,result);if(mode==='stale-closure')closure.closedAt=p.startsAt;return closure;
    },undefined,mode==='delayed-dispatch'?100:45000);
    function closedWithoutFence(){assert.equal(db.sql('SELECT count(*) FROM public.gelato_isolation_scopes WHERE id='+quote(p.scopeId)+' AND closed_at IS NULL'),'0');}
    if(mode==='healthy'){const r=await task;previousClosure=r.result;assert.equal(r.setup.kind,'retired');assert.equal(r.setup.counters.calls,0);assert.equal(setupCalls,0);closedWithoutFence();mark('Healthy canonical runner closes actual admission before acknowledged zero-call retirement');let replay=0;await assert.rejects(withFencedAdmission(c,proof,async()=>{replay++;},async()=>r.result),/EEXIST/);assert.equal(replay,0);mark('Exclusive durable setup intent rejects replay before another worker or admission');}
    else{await assert.rejects(task,(e:any)=>{assert.equal(e.setup?.kind,mode==='failed-revoke'?'failed':'closed');if(mode!=='failed-revoke'){assert.equal(e.setup.result.confirmed,true);assert(e.setup.result.bytes>0);assert.equal(e.setup.result.calls,setupCalls);assert.equal(e.setup.result.bytes,setupBytes);}return true;});if(late)await late;
     if(mode==='failed-revoke'){assert.equal(db.sql('SELECT count(*) FROM public.gelato_admission_revocations WHERE scope_id='+quote(p.scopeId)),'0');await db.sqlAsync(revocation(fixture));mark('Unconfirmed revocation fails closed and never reports successful cleanup');}
     else{closed(db,fixture);mark(mode+' blocks business or demands cleanup instead of retiring');}
     assert.equal(business,baseline+(['bad-closure','foreign-closure','spoofed-closure','stale-closure','empty-body-rejection'].includes(mode)?1:0));
    }
   }
   assert(setupCalls<=24&&setupBytes<=16000000);assert.equal(service.state.messages,0);service.assertSentinels();
   assert(!requests.some(v=>/gelatoapis|orders\/list|\/activate/.test(v)));terminalReceipt??=JSON.parse(await readFile(path.join(journalRoot,'setup-settlement-terminal.json'),'utf8'));assert.equal(terminalReceipt.bindingSha256,c.bindingSha256);assert.equal(terminalReceipt.packetSha256,c.approval.packetSha256);trace.push({mode,calls:setupCalls,bytes:setupBytes,...{workerKind:terminalReceipt.terminal.kind,workerBytes:terminalReceipt.terminal.result?.bytes??terminalReceipt.terminal.counters?.bytes}});
  }finally{commitRelease?.();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
 }
 // Deterministic state-machine races use the actual monitor with an in-flight cleanup promise.
 {
 let now=100,calls=0,release:((value:any)=>void)|undefined;const adapter={cleanup:()=>{calls++;return new Promise<any>(r=>release=r);},counters:()=>({calls,bytes:20,providerCalls:0,maximumCalls:24,maximumBytes:16000000})};
 const m=setupMonitor(adapter,101,()=>now);now=101;const timer=m.tick(),retire=m.retire();assert.equal(m.state(),'cleaning');assert.equal(calls,1);release!({confirmed:true});const [a,b]=await Promise.all([timer,retire]);assert.equal((a as any).kind,'closed');assert.equal((b as any).kind,'closed');mark('Retirement racing expiry joins existing cleanup and cannot claim zero calls');
 const n=setupMonitor(adapter,200,()=>now);assert.equal((await n.retire() as any).kind,'retired');assert.equal((await n.ownerExited() as any).kind,'retired');assert.equal(calls,1);mark('Acknowledged idle retirement ignores later owner disconnect without starting cleanup');
 }
 console.log(JSON.stringify({passed:true,groups:checks.length,realWorkerIpc:true,actualCanonicalSql:true,actualLocalDatabase:true,provider:'synthetic interception only',hostedRequests:0,liveOrders:0,checks,cleanupAccounting:trace}));
 }finally{globalThis.fetch=original;db.close();await rm(directory,{recursive:true,force:true});}
}
void(process.argv[2]==='--owner'?owner():main()).catch(e=>{console.error(e);process.exitCode=1;});
