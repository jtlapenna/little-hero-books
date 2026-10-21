/** Process coordinator; no network, credential discovery, scope issuer or default live action. */
import {fork,type ChildProcess} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import path from 'node:path';
import {readLaunchContext} from './gelato-protected-launch-context';
import {GELATO_LIVE_TESTS_PAUSED} from '../../src/lib/books/gelato-test-safety';
export async function launchProtectedCase(file:string,digest:string,mode:'rehearse'|'execute-approved-unpaid',events?:(event:'armed'|'primary-started',child:ChildProcess)=>void){
 if(mode==='execute-approved-unpaid')throw Error(GELATO_LIVE_TESTS_PAUSED);
 const c=await readLaunchContext(file,digest);
 if((mode==='rehearse')!==(c.transport.kind==='synthetic-loopback'))throw Error('Transport requires matching explicit command');
 if(Date.now()<Date.parse(c.binding.packet.startsAt)||Date.now()>=Date.parse(c.binding.packet.expiresAt))throw Error('Launch window inactive');
 let primary:ReturnType<typeof child>|undefined,stopping=false;
 function child(role:'primary'|'monitor'){
  const worker=fork(path.resolve(__dirname,'gelato-protected-launch-worker.ts'),[role],{detached:role==='monitor',execPath:process.execPath,execArgv:['--import','tsx'],env:{PATH:process.env.PATH,NODE_ENV:'test'},stdio:['ignore','ignore','ignore','ipc']});
  const messages=new Set<string>();let exited=false,code:number|null=null;
  worker.on('error',()=>{exited=true;code=1;});worker.on('message',(v:unknown)=>{if(v&&typeof v==='object'&&'kind' in v&&['armed','passed','closed','stopped'].includes(String(v.kind)))messages.add(String(v.kind));});
  worker.once('exit',value=>{exited=true;code=value;if(role==='primary'&&monitor.worker.connected)monitor.worker.send('owner-exited',()=>{});});
  worker.send(c,err=>{if(err)worker.kill('SIGKILL');});
  return {worker,messages,ended:()=>exited,code:()=>code};
 }
 const monitor=child('monitor');
 const stop=()=>{stopping=true;primary?.worker.kill('SIGKILL');if(monitor.worker.connected)monitor.worker.send('owner-exited',()=>{});};
 process.once('SIGTERM',stop);process.once('SIGINT',stop);
 const wait=async(predicate:()=>boolean,ms:number)=>{const end=Date.now()+ms;while(!predicate()){if(Date.now()>=end)throw Error('Process confirmation deadline');await sleep(20);}};
 let passed=false,closed=false;
 try{
  await wait(()=>monitor.messages.has('armed')||monitor.ended(),10_000);if(!monitor.messages.has('armed')||monitor.ended())throw Error('Independent monitor did not arm');
  events?.('armed',monitor.worker);if(stopping)throw Error('Launch was stopped before primary start');
  primary=child('primary');events?.('primary-started',primary.worker);
  await wait(()=>primary!.ended()||monitor.ended(),Math.max(1,Date.parse(c.binding.packet.expiresAt)-Date.now())+35_000);
  passed=primary.ended()&&primary.code()===0&&primary.messages.has('passed');
 }finally{
  stop();
  try{await wait(()=>monitor.ended(),30_000);closed=monitor.code()===0&&monitor.messages.has('closed');}finally{
   if(!monitor.ended())monitor.worker.kill('SIGKILL');
   if(primary&&!primary.ended()){primary.worker.kill('SIGKILL');await wait(()=>primary!.ended(),5000).catch(()=>{});}
   process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
  }
 }
 if(!passed||!closed)throw Error('Launch stopped; no replay; cleanup requires verified reconciliation if unconfirmed');
 return {passed:true,independentMonitorClosed:true,maximumSpendCents:0,customerMessages:false};
}
