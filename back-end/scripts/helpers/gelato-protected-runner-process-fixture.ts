/** Child process used only by the disposable loopback crash suite; cannot select live transport. */
import {readFileSync} from 'node:fs';
import {setTimeout as sleep} from 'node:timers/promises';
import {createProtectedRunnerAdapter,watchProtectedRunner} from './gelato-protected-runner-adapter';
import {definitionSha256} from './prepare-w1-native-queue';
import {runPreparedIsolatedCase} from './gelato-isolated-case-runner';
import type {ProtectedFixture} from './gelato-protected-runner-fixture';
const [mode,file]=process.argv.slice(2),raw=JSON.parse(readFileSync(file,'utf8')) as {fixture:ProtectedFixture;journalRoot:string;loopback:string};
const {fixture:f}=raw;
if(!['run','claim-hold','watch','journal-only'].includes(mode)||f.binding.n8nOrigin!=='https://diagnostic.example.test'||!Object.values(f.credentials).every(v=>v.startsWith('SYNTHETIC-'))||!/^http:\/\/127\.0\.0\.1:\d+$/.test(raw.loopback))throw Error('Only synthetic loopback fixtures accepted');
const realFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Direct external transport forbidden');};
const fetcher:typeof fetch=async(input,init)=>{
 const response=await realFetch(raw.loopback+'/?target='+encodeURIComponent(String(input)),init);
 // The underlying target is loopback; preserve formal endpoint identity for the adapter's validation.
 return new Response(response.body,{status:response.status,headers:response.headers});
};
const adapter=createProtectedRunnerAdapter(f.binding,definitionSha256(f.binding),{credentials:f.credentials,journalRoot:raw.journalRoot,fetcher,now:Date.now,sleep:async(ms,s)=>{await sleep(Math.min(ms,20),undefined,{signal:s});}});
let ownerExited=false;process.on('message',v=>{if(v==='owner-exited')ownerExited=true;});
const send=(v:unknown)=>new Promise<void>(resolve=>process.send?process.send(v,()=>resolve()):resolve());
async function main(){
 if(mode==='journal-only'){await adapter.dependencies.journal.claim(definitionSha256(f.binding.packet));await send({kind:'claimed'});return;}
 if(mode==='watch'){
  await send({kind:'armed'});await watchProtectedRunner(adapter,{deadline:Date.parse(f.binding.packet.expiresAt),now:Date.now,ownerExited:()=>ownerExited,signal:new AbortController().signal,sleep:async(ms,s)=>{await sleep(Math.min(ms,20),undefined,{signal:s});}});await send({kind:'closed'});return;
 }
 if(mode==='claim-hold'){
  const original=adapter.dependencies.journal.claim.bind(adapter.dependencies.journal);
  adapter.dependencies.journal.claim=async hash=>{await original(hash);await send({kind:'claimed'});await new Promise(()=>{});};
 }
 const approval={packetSha256:definitionSha256(f.binding.packet),workflowSha256:definitionSha256(adapter.workflowHashes),sourceSha:f.binding.packet.sourceSha,maximumSpendCents:0,draftOnly:true,customerMessages:false};
 await runPreparedIsolatedCase(f.binding.packet,adapter.workflowHashes,approval,adapter.dependencies);await send({kind:'passed'});
}
main().catch(async()=>{process.exitCode=1;await send({kind:'stopped'});}).finally(()=>{process.disconnect?.();});
