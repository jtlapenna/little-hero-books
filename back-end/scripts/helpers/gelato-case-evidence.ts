/** Local case evidence only; no authority issuance, network transport or credential discovery. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,lstatSync,realpathSync,openSync,writeSync,fsyncSync,closeSync} from 'node:fs';
import path from 'node:path';
import {protectedCaseDirectory} from './gelato-protected-runner-adapter';
import {definitionSha256} from './prepare-w1-native-queue';
function privateJson(file:string,max=100_000){const s=lstatSync(file);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&(s.mode&0o777)===0o600&&s.uid===process.getuid?.()&&s.size<=max&&realpathSync(file)===file);return JSON.parse(readFileSync(file,'utf8'));}
function journalProof(c:any){
 const dir=protectedCaseDirectory(c.journalRoot,c.binding.packet),binding=privateJson(path.join(dir,'binding.json'));assert.equal(binding.packetSha256,definitionSha256(c.binding.packet));
 const names=readdirSync(dir).filter(n=>/^\d{3}\.json$/.test(n)).sort();assert(names.length>0&&names.length<=100);let timerStarted=false,timerConfirmed=false;
 const events=names.map((name,i)=>{assert.equal(name,String(i+1).padStart(3,'0')+'.json');return privateJson(path.join(dir,name));});
 for(const e of events){assert(['starting','confirmed','unconfirmed'].includes(e.state));assert.notEqual(e.state,'unconfirmed');if(e.step==='start-owned-timer'){if(e.state==='starting'){assert(!timerStarted);timerStarted=true;}else if(e.state==='confirmed')timerConfirmed=true;}}
 for(const step of ['protected-binding:'+c.bindingSha256,'preflight','queue','assembly','verify-frozen-assembly','draft','verify-provider-draft','register-status','start-owned-timer','observe-owned-timer','close-owned-scope','stop-owned-timer','verify-independent-closure'])assert.equal(events.filter(e=>e.step===step&&e.state==='confirmed').length,1,'Missing/duplicate journal confirmation: '+step);
 assert(timerStarted&&timerConfirmed);return definitionSha256({binding,events});
}

export function privateJournal(directory:string){
 const dir=path.resolve(directory),s=lstatSync(dir);assert(s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o777)===0o700&&s.uid===process.getuid?.());
 return (name:string,value:unknown)=>{assert(/^[A-Za-z0-9_-]+$/.test(name));const fd=openSync(path.join(dir,name+'.json'),'wx',0o600);try{const data=Buffer.from(JSON.stringify(value)+'\n');let offset=0;while(offset<data.length)offset+=writeSync(fd,data,offset);fsyncSync(fd);}finally{closeSync(fd);}const parent=openSync(dir,'r');try{fsyncSync(parent);}finally{closeSync(parent);}};
}
export function closureFromSuccessfulLaunch(c:any,plan:any,file:string,digest:string,result:any){
 assert(result.passed===true&&result.independentMonitorClosed===true&&result.maximumSpendCents===0&&result.customerMessages===false);const primaryJournalSha256=journalProof(c);
 return {schema:'lhl.independent-case-closure@1',label:plan.label,rootOrderId:plan.packet.rootOrderId,workflowIds:plan.items.map((i:any)=>i.id).sort(),packetSha256:plan.packetSha256,bindingSha256:c.bindingSha256,launchContextSha256:digest,closedAt:new Date().toISOString(),scopeClosed:true,parentWindowClosed:true,registrationDisabled:true,leaseCleared:true,workflowsInactive:true,allSixControlsOff:true,bothGatesOff:true,activationSettled:true,independentMonitorConfirmed:true,outcome:'passed',primaryJournalSha256,contextFile:file,planSha256:definitionSha256(plan)};
}
