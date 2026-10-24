/** Local-only revised admission controller. No real context/key-file CLI or hosted execution path. */
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';import {readFileSync,lstatSync} from 'node:fs';
import path from 'node:path';import {setTimeout as sleep} from 'node:timers/promises';
import {LaunchContext,readLaunchContext,type Launch} from './gelato-protected-launch-context';
import {definitionSha256} from './prepare-w1-native-queue';
import {privateJournal} from './gelato-case-evidence';
import {closureFromSuccessfulLaunch} from './gelato-case-evidence';
export type ClosureProof={file:string;sha256:string;plan:any};
export async function withFencedAdmission<T>(raw:Launch,proof:ClosureProof,admit:(guard:()=>void)=>Promise<void>,body:()=>Promise<T>,onArmed?:(monitorPid:number)=>void,admissionWaitMs=45000){
 const c=LaunchContext.parse(raw),p=c.binding.packet;assert.equal(c.transport.kind,'synthetic-loopback','Local repair is not a hosted execution approval');
 assert(Date.now()>=Date.parse(p.startsAt)&&Date.now()<Date.parse(p.expiresAt));
 assert.deepEqual(await readLaunchContext(proof.file,proof.sha256),c);
 assert.equal(definitionSha256(proof.plan.packet),c.approval.packetSha256);assert.equal(proof.plan.packetSha256,c.approval.packetSha256);
 assert.equal(proof.plan.label,p.members.length===2?'SIB':p.members[0].edition==='amazon'?'AMZ':'WEB');
 const ids=Object.values(c.binding.workflowBindings).map(w=>w.id).sort();assert.deepEqual(proof.plan.items.map((v:any)=>v.id).sort(),ids);
 const receiptFile=path.join(c.journalRoot,'setup-settlement-terminal.json');
 const record=privateJournal(c.journalRoot);record('setup-settlement-intent',{at:new Date().toISOString(),bindingSha256:c.bindingSha256,packetSha256:c.approval.packetSha256,contextSha256:proof.sha256});
 const worker=fork(path.join(__dirname,'gelato-setup-monitor-worker.ts'),[],{detached:true,execPath:process.execPath,execArgv:['--import','tsx'],env:{PATH:process.env.PATH,NODE_ENV:'test'},stdio:['ignore','ignore','ignore','ipc']});
 let ended=false,exit:number|null=null,armed=false,terminal:any,stopping=false,success=false,result:T,primaryError:unknown,hasPrimaryError=false;
 worker.once('exit',v=>{ended=true;exit=v;});worker.once('error',()=>{ended=true;exit=1;});worker.on('message',(v:any)=>{if(v?.kind==='armed')armed=true;else if(['retired','closed','failed'].includes(v?.kind))terminal=v;});
 const send=(v:Launch|'owner-exited'|'retire')=>{if(worker.connected)worker.send(v,()=>{});};const stop=()=>{stopping=true;send('owner-exited');};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);send(c);
 const wait=async(test:()=>boolean,ms:number)=>{const until=Date.now()+ms;while(!test()){assert(Date.now()<until,'Setup worker outcome unconfirmed');await sleep(10);}};
 const guard=()=>assert(armed&&!ended&&!terminal&&!stopping&&Date.now()<Date.parse(p.expiresAt),'Setup monitor/window unavailable');
 try{
  await wait(()=>armed||ended,10000);guard();onArmed?.(worker.pid!);assert(admissionWaitMs>0&&admissionWaitMs<=45000);
  let settled=false,admissionFailed=false,error:unknown;void admit(guard).then(()=>{settled=true;},e=>{admissionFailed=true;error=e;settled=true;});
  const until=Math.min(Date.now()+admissionWaitMs,Date.parse(p.expiresAt));
  while(!settled){guard();assert(Date.now()<until,'Admission acknowledgment unconfirmed');await sleep(10);}
  if(admissionFailed)throw error;guard();const bodyStarted=Date.now();result=await body();guard();
  const closure=result as Record<string,unknown>;
  assert(closure?.schema==='lhl.independent-case-closure@1'&&closure.outcome==='passed'&&['scopeClosed','parentWindowClosed','registrationDisabled','leaseCleared','workflowsInactive','allSixControlsOff','bothGatesOff','activationSettled','independentMonitorConfirmed'].every(k=>closure[k]===true),'Canonical independent closure required');
  assert.equal(closure.rootOrderId,p.rootOrderId);assert.equal(closure.packetSha256,c.approval.packetSha256);assert.equal(closure.bindingSha256,c.bindingSha256);assert.deepEqual(closure.workflowIds,ids);
  const closedAt=Date.parse(String(closure.closedAt));assert(Number.isFinite(closedAt)&&closedAt>=bodyStarted&&closedAt<=Math.min(Date.now()+1000,Date.parse(p.expiresAt)),'Closure is stale or outside current case');
  // Reuse the sealed canonical journal verifier, including every confirmed current-binding stage, rather than trusting booleans or a foreign receipt.
  const expected=closureFromSuccessfulLaunch(c,proof.plan,proof.file,proof.sha256,{passed:true,independentMonitorClosed:true,maximumSpendCents:0,customerMessages:false});
  for(const [k,v] of Object.entries(expected))if(k!=='closedAt')assert.deepEqual(closure[k],v,'Current canonical closure differs: '+k);
  success=true;
 }catch(e){hasPrimaryError=true;primaryError=e;}
 finally{
  send(success?'retire':'owner-exited');
  try{
   await wait(()=>ended,35000);
   const s=lstatSync(receiptFile);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&(s.mode&0o777)===0o600&&s.uid===process.getuid?.()&&s.size<20000);
   const receipt=JSON.parse(readFileSync(receiptFile,'utf8'));assert.equal(receipt.bindingSha256,c.bindingSha256);assert.equal(receipt.packetSha256,c.approval.packetSha256);assert.deepEqual(receipt.terminal,terminal);
   assert(exit===0&&terminal&&['retired','closed'].includes(terminal.kind),'Setup settlement not confirmed; no replay');
   if(success)assert(terminal.kind==='retired','Deadline cleanup overlapped success; stop cohort');
  }catch{throw Object.assign(Error('Setup settlement not confirmed; no replay'),{setup:terminal});}
  finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
  // A timed-out child is never killed as successful retirement. Its independent bounded cleanup continues.
 }
 if(hasPrimaryError)throw Object.assign(Error('Admission/business failed; owned setup cleanup confirmed'),{cause:primaryError,setup:terminal});
 return {result:result!,setup:terminal};
}
