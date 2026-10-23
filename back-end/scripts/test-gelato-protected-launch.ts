/** Actual launcher/OS-process proof, local synthetic service only. */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,chmod,rm,symlink,realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {fork,type ChildProcess} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {definitionSha256} from './helpers/prepare-w1-native-queue';
import {sha256} from './helpers/gelato-protected-runner-adapter';
import {readLaunchContext} from './helpers/gelato-protected-launch-context';
import {launchProtectedCase} from './helpers/gelato-protected-launcher';
import {protectedRunnerFixture,fixtureServices} from './helpers/gelato-protected-runner-fixture';
async function main(){
const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'lhl-launch-')));await chmod(root,0o700);
const checks:string[]=[];const mark=(s:string)=>{checks.push(s);console.log('PASS '+s);};
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Coordinator external network prohibited');};
async function scenario(action:'healthy'|'primary-death'|'coordinator-death'|'coordinator-group-int'|'coordinator-group-term',count=1,amazon=false){
 const f=protectedRunnerFixture(count,amazon),service=fixtureServices(f),dir=path.join(root,checks.length+'-'+action);await mkdir(dir,{mode:0o700});const journalRoot=path.join(dir,'journals');await mkdir(journalRoot,{mode:0o700});
 let primary:ChildProcess|undefined,coordinator:ChildProcess|undefined,killed=false;
 if(action!=='healthy')service.setFault(async(kind,result)=>{if(kind==='assembly'&&!killed){killed=true;if(action==='coordinator-group-int'||action==='coordinator-group-term'){assert(coordinator?.pid);process.kill(-coordinator.pid,action==='coordinator-group-int'?'SIGINT':'SIGTERM');}else (action==='primary-death'?primary:coordinator)?.kill('SIGKILL');await sleep(40);throw Error('Synthetic accepted connection lost');}return result;});
 const server=http.createServer(async(req,res)=>{
  try{
   assert.equal(req.socket.remoteAddress,'127.0.0.1');const u=new URL(req.url!,'http://127.0.0.1');assert.equal(u.pathname,'/');const target=u.searchParams.get('target');assert(typeof target==='string'&&target.startsWith('https://'));
   const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>100_000)throw Error('Body too large');chunks.push(chunk);}const body=Buffer.concat(chunks);
   const result=await service.fetcher(target,{method:req.method,headers:req.headers as Record<string,string>,...(body.length?{body:body.toString()}:{}),redirect:'manual',signal:new AbortController().signal});
   res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
  }catch{if(!res.destroyed){res.writeHead(500);res.end('Synthetic failure');}}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert(address&&typeof address!=='string');
 const hashes=Object.fromEntries(Object.entries(f.binding.workflowBindings).map(([k,w])=>[k,w.definitionSha256]));
 const c={schema:'lhl.protected-launch@1',binding:f.binding,bindingSha256:definitionSha256(f.binding),credentials:f.credentials,journalRoot,transport:{kind:'synthetic-loopback',origin:'http://127.0.0.1:'+address.port},approval:{packetSha256:definitionSha256(f.binding.packet),workflowSha256:definitionSha256(hashes),sourceSha:f.binding.packet.sourceSha,maximumSpendCents:0,draftOnly:true,customerMessages:false}};
 const file=path.join(dir,'context.json');await writeFile(file,JSON.stringify(c),{mode:0o600});const digest=sha256(await readFile(file));
 try{
  if(action==='healthy'){
   const events:string[]=[];const result=await launchProtectedCase(file,digest,'rehearse',e=>events.push(e));assert(result.passed);assert.deepEqual(events,['armed','primary-started']);
  }else if(action==='primary-death'){
   await assert.rejects(launchProtectedCase(file,digest,'rehearse',(e,p)=>{if(e==='primary-started')primary=p;}));assert(killed);
  }else{
   coordinator=fork(path.resolve(__dirname,'helpers/gelato-launch-test-coordinator.ts'),[file,digest],{detached:true,execArgv:['--import','tsx'],env:{PATH:process.env.PATH,NODE_ENV:'test'},stdio:['ignore','ignore','ignore','ipc']});
   const exit=new Promise<void>(resolve=>coordinator!.once('exit',()=>resolve()));await Promise.race([exit,sleep(15000).then(()=>{throw Error('Coordinator failed to exit');})]);assert(killed);
   for(let i=0;i<300&&!service.state.closed;i++)await sleep(20);
   assert(service.state.closed);for(let i=0;i<300&&!service.state.stopCalls;i++)await sleep(20);assert(service.state.stopCalls);
  }
  assert(service.state.closed&&!service.state.timer);assert.equal(service.state.messages,0);service.assertSentinels();assert.equal(service.state.queueCalls,1);assert.equal(service.state.assemblyCalls,1);
  if(action!=='healthy')assert.equal(service.state.draftCalls,0);
  const before=service.state.queueCalls;await assert.rejects(launchProtectedCase(file,digest,'rehearse'));assert.equal(service.state.queueCalls,before);
  mark(action+' '+(count===2?'siblings':amazon?'Amazon single':'website single')+': armed monitor, closed authority, no business replay and six synthetic sentinels unchanged');
  if(action==='healthy'&&!amazon){
   let startedAfterStop=false;await assert.rejects(launchProtectedCase(file,digest,'rehearse',e=>{if(e==='armed')process.emit('SIGTERM');if(e==='primary-started')startedAfterStop=true;}));assert.equal(startedAfterStop,false);mark('Shutdown after monitor arm prevents primary spawn');
   const beforeCalls=service.calls.length;
   const invalidFile=path.join(dir,'invalid-access.json');
   for(const credentials of [
    {...c.credentials,diagnosticAccessClientSecret:undefined},
    {...c.credentials,diagnosticAccessClientSecret:'invalid\r\nsecret-header-value'},
   ]){
    await writeFile(invalidFile,JSON.stringify({...c,credentials}),{mode:0o600});
    await assert.rejects(readLaunchContext(invalidFile,sha256(await readFile(invalidFile))));
   }
   const {diagnosticAccessClientId:unusedId,diagnosticAccessClientSecret:unusedSecret,...withoutAccess}=c.credentials;
   await writeFile(invalidFile,JSON.stringify({...c,credentials:withoutAccess}),{mode:0o600});
   assert((await readLaunchContext(invalidFile,sha256(await readFile(invalidFile)))).credentials);
   await assert.rejects(launchProtectedCase(invalidFile,sha256(await readFile(invalidFile)),'rehearse'),/Diagnostic Access credential pair required/);
   assert.equal(service.calls.length,beforeCalls);
   mark('Private context preserves the complete diagnostic Access pair over real child IPC; invalid/partial fields reject and absent pair stops launch before monitor or transport');

   await assert.rejects(readLaunchContext(file,'a'.repeat(64)));mark('Wrong reviewed raw-file digest rejects');
   await chmod(file,0o644);await assert.rejects(readLaunchContext(file,digest));await chmod(file,0o600);mark('Public context permissions reject');
   await chmod(dir,0o755);await assert.rejects(readLaunchContext(file,digest));await chmod(dir,0o700);mark('Public context directory rejects');
   const link=path.join(dir,'link.json');await symlink(file,link);await assert.rejects(readLaunchContext(link,digest));mark('Symlink private context rejects');
   await assert.rejects(launchProtectedCase(file,digest,'execute-approved-draft-only'),/Transport requires matching explicit command/);
   await assert.rejects(launchProtectedCase(file,digest,'unknown-mode' as never),/Explicit reviewed/);
   mark('Explicit draft-only mode rejects loopback context and unknown modes before any process/transport');
   await assert.rejects(launchProtectedCase(file,digest,'execute-approved-unpaid'),/paused pending/);mark('Live command is paused pending incident review; rehearsal does not authorize execution');
   for(const mutate of [(v:typeof c)=>{v.approval.maximumSpendCents=1;},(v:typeof c)=>{v.approval.sourceSha='d'.repeat(40);},(v:typeof c)=>{v.binding.workflowBindings.queue.versionId='changed';}]){
    const changed=structuredClone(c);mutate(changed);await writeFile(file,JSON.stringify(changed),{mode:0o600});await assert.rejects(readLaunchContext(file,sha256(await readFile(file))));
   }
   mark('Nonzero spend, source and binding changes reject even with a new file checksum');assert.equal(service.calls.length,beforeCalls);
  }
 }finally{coordinator?.kill('SIGKILL');server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
try{
 await scenario('healthy');await scenario('healthy',1,true);await scenario('healthy',2,true);await scenario('primary-death');await scenario('coordinator-death');await scenario('coordinator-group-int');await scenario('coordinator-group-term');
 console.log(JSON.stringify({kind:'local-loopback-process-proof',checks:checks.length,passed:checks,externalRequests:0,liveOrderReads:0,liveOrderWrites:0,deployments:0,customerMessages:0}));
}finally{globalThis.fetch=originalFetch;await rm(root,{recursive:true,force:true});}

}
void main().catch(e=>{console.error('Local launcher checks failed',e);process.exitCode=1;});
