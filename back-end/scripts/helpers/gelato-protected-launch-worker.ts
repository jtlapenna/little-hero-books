/** Dedicated child. Credentials arrive over IPC, never argv, environment or output. */
import {setTimeout as sleep} from 'node:timers/promises';
import {LaunchContext} from './gelato-protected-launch-context';
import {createProtectedRunnerAdapter,watchProtectedRunner} from './gelato-protected-runner-adapter';
import {runPreparedIsolatedCase} from './gelato-isolated-case-runner';
let started=false,ownerExited=false,finished=false;
const shutdown=new AbortController();
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{ownerExited=true;shutdown.abort();if(process.argv[2]==='primary')process.exit(1);});
const send=(kind:string)=>new Promise<void>(resolve=>process.send?process.send({kind},()=>resolve()):resolve());
process.on('disconnect',()=>{ownerExited=true;if(!finished&&process.argv[2]==='primary')process.exit(1);});
process.on('message',async raw=>{
 if(raw==='owner-exited'){ownerExited=true;return;}
 if(started)return;started=true;
 try{
  const c=LaunchContext.parse(raw),mode=process.argv[2];if(!['primary','monitor'].includes(mode))throw Error('Worker mode invalid');
  const direct=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Only explicit protected transport is allowed');};
  const fetcher:typeof fetch=async(input,init)=>{
   const u=new URL(String(input));if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port)throw Error('HTTPS endpoint required');
   if(c.transport.kind==='https')return direct(input,init);
   const response=await direct(c.transport.origin+'/?target='+encodeURIComponent(String(input)),init);
   return new Response(response.body,{status:response.status,headers:response.headers});
  };
  const adapter=createProtectedRunnerAdapter(c.binding,c.bindingSha256,{fetcher,credentials:c.credentials,journalRoot:c.journalRoot,now:Date.now,sleep:async(ms,s)=>{await sleep(c.transport.kind==='synthetic-loopback'?Math.min(ms,20):ms,undefined,{signal:s});}});
  if(mode==='monitor'){
   await send('armed');await watchProtectedRunner(adapter,{deadline:Date.parse(c.binding.packet.expiresAt),now:Date.now,ownerExited:()=>ownerExited,signal:shutdown.signal,sleep:async(ms,s)=>{await sleep(Math.min(ms,100),undefined,{signal:s});}});await send('closed');
  }else{await runPreparedIsolatedCase(c.binding.packet,adapter.workflowHashes,c.approval,adapter.dependencies);await send('passed');}
 }catch{process.exitCode=1;await send('stopped');}
 finally{finished=true;process.disconnect?.();}
});
// A child which never receives a valid private snapshot must not linger indefinitely.
setTimeout(()=>{if(!started)process.exit(1);},5000).unref();
