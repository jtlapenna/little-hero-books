/** Real OS workers/SIGKILL against loopback services only. No project env or credentials. */
import assert from 'node:assert/strict';
import {fork,type ChildProcess} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync,statSync,readdirSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {setTimeout as sleep} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
import {FileCaseJournal} from './helpers/gelato-isolated-case-runner';
import {protectedCaseDirectory} from './helpers/gelato-protected-runner-adapter';
import {protectedRunnerFixture,fixtureServices} from './helpers/gelato-protected-runner-fixture';
const root=mkdtempSync(path.join(os.tmpdir(),'lhl-runner-crashes-')),children=new Set<ChildProcess>(),checks:string[]=[];
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('External network blocked in coordinator');};
const mark=(s:string)=>{checks.push(s);console.log('PASS '+s);};
const child=(mode:string,context:string)=>{
 const worker=fork(path.resolve(__dirname,'helpers/gelato-protected-runner-process-fixture.ts'),[mode,context],{execPath:process.execPath,execArgv:['--import','tsx'],env:{PATH:process.env.PATH,NODE_ENV:'test'},stdio:['ignore','ignore','pipe','ipc']});children.add(worker);
 const messages:string[]=[];let errors='',ended=false;worker.stderr?.on('data',b=>{errors+=b;});worker.on('message',(v:{kind:string})=>messages.push(v.kind));worker.once('exit',()=>{ended=true;children.delete(worker);});
 const wait=async(kind:string)=>{for(let n=0;n<300;n++){if(messages.includes(kind))return;if(ended)throw Error('Worker ended before '+kind+': '+errors);await sleep(20);}throw Error('Worker message timeout: '+kind);};
 const exit=async()=>{for(let n=0;n<500;n++){if(ended)return worker.exitCode;await sleep(20);}throw Error('Worker exit timeout: '+errors);};
 return {worker,wait,exit,messages};
};
async function scenario(killAt:string|null){
 const f=protectedRunnerFixture(2,true),service=fixtureServices(f),dir=path.join(root,randomUUID());mkdirSync(dir,{mode:0o700});const journalRoot=path.join(dir,'journals');mkdirSync(journalRoot,{mode:0o700});
 let primary:ReturnType<typeof child>|undefined,accepted=false;
 service.setFault(async(kind,result)=>{
  if(kind===killAt){accepted=true;assert(primary);primary.worker.kill('SIGKILL');await sleep(30);throw Error('Accepted but connection lost');}return result;
 });
 const server=http.createServer(async(req,res)=>{
  try{
   assert.equal(req.socket.remoteAddress,'127.0.0.1');const url=new URL(req.url!,'http://127.0.0.1');assert.equal(url.pathname,'/');const target=url.searchParams.get('target');if(!target?.startsWith('https://'))throw Error('Synthetic target required');
   const chunks:Buffer[]=[];for await(const chunk of req){chunks.push(chunk);assert(Buffer.concat(chunks).length<100_000);}const body=Buffer.concat(chunks);
   const result=await service.fetcher(target,{method:req.method,headers:req.headers as Record<string,string>,...(body.length?{body:body.toString()}:{}),redirect:'manual',signal:new AbortController().signal});
   res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
  }catch{if(!res.destroyed){res.writeHead(500);res.end('Synthetic failure');}}
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const address=server.address();assert(address&&typeof address!=='string');const loopback='http://127.0.0.1:'+address.port;
 const file=path.join(dir,'synthetic-context.json');writeFileSync(file,JSON.stringify({fixture:f,journalRoot,loopback}),{mode:0o600});
 try{
  // Arm separate cleanup process before the runner can acquire a journal or dispatch.
  const watch=child('watch',file);await watch.wait('armed');
  primary=child(killAt==='claim'?'claim-hold':'run',file);
  if(killAt==='claim'){await primary.wait('claimed');primary.worker.kill('SIGKILL');}
  if(killAt===null)await primary.wait('passed');
  const exit=await primary.exit();if(killAt)assert.notEqual(exit,0);else assert.equal(exit,0);
  watch.worker.send('owner-exited');await watch.wait(killAt==='activate'?'stopped':'closed');assert.equal(await watch.exit(),killAt==='activate'?1:0);
  assert(service.state.closed&&!service.state.timer);assert.equal(service.state.messages,0);service.assertSentinels();
  if(killAt&&killAt!=='claim')assert(accepted);
  if(killAt==='claim'){assert.equal(service.state.queueCalls,0);assert.equal(service.state.providerReads,0);}
  else if(killAt==='queue'){assert.equal(service.state.queueCalls,1);assert.equal(service.state.assemblyCalls,0);}
  else if(killAt==='assembly'){assert.equal(service.state.assemblyCalls,1);assert.equal(service.state.draftCalls,0);}
  else if(killAt==='draft'){assert.equal(service.state.draftCalls,1);assert.equal(service.state.providerReads,0);}
  else if(killAt==='activate'){assert.equal(service.state.activateCalls,1);assert.equal(service.state.draftCalls,1);}
  // Restart is a hard stop, regardless of whether any response had been acknowledged.
  const before=service.calls.length,restart=child('run',file);assert.equal(await restart.exit(),1);assert.equal(service.calls.length,before);
  const caseDir=protectedCaseDirectory(journalRoot,f.binding.packet);assert.equal(statSync(caseDir).mode&0o777,0o700);for(const name of readdirSync(caseDir)){assert.equal(statSync(path.join(caseDir,name)).mode&0o777,0o600);const value=readFileSync(path.join(caseDir,name),'utf8');assert(!value.includes(f.credentials.scope)&&!value.includes(service.claim.claimToken)&&!value.includes('Fixture Way'));}
  mark((killAt?'SIGKILL at '+killAt:'Healthy OS runner')+': independent process revokes scope/stops timer'+(killAt==='activate'?'; unresolved activation remains unconfirmed':' and verifies closure')+'; restart has zero requests; six synthetic sentinels unchanged');
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
async function main(){
 for(const point of [null,'claim','queue','assembly','draft','activate'])await scenario(point);
 // Separate OS workers execute the actual fsync journal implementation, not a copy.
 const f=protectedRunnerFixture(),dir=path.join(root,'race');mkdirSync(dir,{mode:0o700});
 const journalRoot=path.join(dir,'journals');mkdirSync(journalRoot,{mode:0o700});
 const file=path.join(dir,'context.json');writeFileSync(file,JSON.stringify({fixture:f,journalRoot,loopback:'http://127.0.0.1:1'}),{mode:0o600});
 const first=child('journal-only',file),second=child('journal-only',file),wins=await Promise.all([first.exit(),second.exit()]);assert.deepEqual(wins.sort(),[0,1]);
 const target=protectedCaseDirectory(journalRoot,f.binding.packet);await assert.rejects(new FileCaseJournal(target).claim('a'.repeat(64)));
 const changed={...f.binding.packet,scopeId:randomUUID(),sourceSha:'d'.repeat(40)};assert.equal(protectedCaseDirectory(journalRoot,changed),target);mark('Two real OS workers use actual fsync journal: one owner; changed packet/scope cannot select a fresh attempt directory');
 assert.equal(children.size,0);console.log(JSON.stringify({checks:checks.length,cases:checks,separateProcesses:true,sigkill:true,loopbackOnly:true,externalRequests:0,productionOrderReads:0,providerCalls:0,deployments:0,customerMessages:0,limitations:['OS SIGKILL and fsync calls do not prove power-loss survival or every filesystem','Simulated accepted service effects; hosted n8n/provider semantics still require a separately approved window']}));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const child of children)child.kill('SIGKILL');globalThis.fetch=originalFetch;rmSync(root,{recursive:true,force:true});});
