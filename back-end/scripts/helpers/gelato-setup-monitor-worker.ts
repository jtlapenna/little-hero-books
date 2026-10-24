/** LOCAL-ONLY IPC harness for the repair candidate. Hosted transport deliberately rejected. */
import {LaunchContext,privateDirectory} from './gelato-protected-launch-context';
import {definitionSha256} from './prepare-w1-native-queue';
import {privateJournal} from './gelato-case-evidence';
import {createSetupCleanup,setupMonitor} from './gelato-setup-cleanup';
let received=false,done=false,ownerGone=false;let monitor:ReturnType<typeof setupMonitor>|undefined,timer:ReturnType<typeof setInterval>|undefined;
let record:ReturnType<typeof privateJournal>|undefined,bindingSha256:string|undefined,packetSha256:string|undefined;
const send=(v:unknown)=>new Promise<void>(r=>process.connected&&process.send?process.send(v,()=>r()):r());
async function finish(p:Promise<unknown>){
 const value=await p;if(!value||done)return;done=true;if(timer)clearInterval(timer);
 try{if(!record)throw Error('Durable receipt unavailable');record('setup-settlement-terminal',{bindingSha256,packetSha256,at:new Date().toISOString(),terminal:value});await send(value);process.exitCode=(value as {kind:string}).kind==='failed'?1:0;}
 catch{process.exitCode=1;await send({kind:'failed',receiptUnconfirmed:true});}
 if(process.connected)process.disconnect();
}
const stop=()=>{ownerGone=true;if(monitor)void finish(monitor.ownerExited());else process.exitCode=1;};
process.on('disconnect',()=>{if(!done)stop();});for(const s of ['SIGTERM','SIGINT'] as const)process.on(s,stop);
process.on('message',async raw=>{
 if(raw==='owner-exited'){stop();return;}if(raw==='retire'){if(monitor)await finish(monitor.retire());return;}if(received)return;received=true;
 try{const c=LaunchContext.parse(raw);if(c.transport.kind!=='synthetic-loopback')throw Error('Local review harness requires synthetic loopback');
  await privateDirectory(c.journalRoot);record=privateJournal(c.journalRoot);bindingSha256=c.bindingSha256;packetSha256=c.approval.packetSha256;
  const origin=c.transport.origin,direct=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Unwired transport denied');};
  const fetcher:typeof fetch=async(input,init)=>{
   const target=String(input),u=new URL(target);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port)throw Error('Exact target required');
   const wire=origin+'/?target='+encodeURIComponent(target),r=await direct(wire,init);
   if(r.redirected||(r.url&&r.url!==wire)){void r.body?.cancel().catch(()=>{});throw Error('Loopback wire endpoint changed');}
   // The network-only synthetic hop is validated above. Preserve the logical target contract without following a redirect.
   return new Response(r.body,{status:r.status,headers:r.headers});
  };
  monitor=setupMonitor(createSetupCleanup(c,fetcher),Date.parse(c.binding.packet.expiresAt));
  if(ownerGone||!process.connected){await finish(monitor.ownerExited());return;}
  await send({kind:'armed'});
  timer=setInterval(()=>{if(monitor?.state()==='armed')void finish(monitor.tick());},20);
 }catch{done=true;process.exitCode=1;await send({kind:'failed'});if(process.connected)process.disconnect();}
});
setTimeout(()=>{if(!received)process.exit(1);},10000).unref();
