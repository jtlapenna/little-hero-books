/** Protected runner core. No default transport, environment loading, scope issuer or live CLI. */
import {z} from 'zod';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {definitionSha256} from './prepare-w1-native-queue';
import {IsolatedCasePacket,workflowPath,type IsolatedCase} from './prepare-gelato-isolated-workflows';
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const files=z.array(z.object({orderDbId:z.number().int().positive().safe(),sha256:hash}).strict()).min(1).max(2);
export const NORMAL_FLAGS=['GELATO_DRAFT_SUBMISSION_ENABLED','GELATO_CANCEL_ENABLED','GELATO_STATUS_RELAY_ENABLED','GELATO_STATUS_POLLING_ENABLED','GELATO_SCHEDULED_STATUS_ENABLED','GELATO_NOTIFICATIONS_ENABLED'] as const;
const off=z.object(Object.fromEntries(NORMAL_FLAGS.map(k=>[k,z.literal(false)])) as Record<typeof NORMAL_FLAGS[number],z.ZodLiteral<false>>).strict();
const gates=z.object({dispatch:z.literal(false),ordinaryRelease:z.literal(false)}).strict();
const readback=z.object({at:z.string().datetime({offset:true}),sourceSha:z.string(),packetSha256:hash,accountKeySha256:hash,statusAccountKeySha256:hash,
 workflowSha256:z.object({queue:hash,assembly:hash,draft:hash,timer:hash}).strict(),flags:off,gates,
 noFundingRoutes:z.literal(true),applicationMessagesSuppressed:z.literal(true),providerMessagesSuppressed:z.literal(true),
 ownedFreshCohortVerified:z.literal(true),recipientVerified:z.literal(true),fixtureManifestSha256:hash}).strict();
const claim=z.object({provider:z.literal('gelato'),dispatchRoute:z.literal('dispatch'),rootOrderId:z.string(),routeKind:z.enum(['single','sibling']),
 submissionId:z.string().uuid(),claimToken:z.string().uuid(),orderDbIds:z.array(z.number().int().positive().safe()).min(1).max(2),
 idempotencyKey:z.string(),orders:z.array(z.object({orderDbId:z.number().int().positive().safe(),orderId:z.string(),formatId:z.string(),rootOrderId:z.string(),provider:z.literal('gelato'),bookId:z.literal('book-finding-our-inner-voice'),configVersion:z.literal(2),innerPageCount:z.literal(32),apiPageCount:z.literal(32),expectedPdfPageCount:z.literal(35)}).passthrough()).min(1).max(2)}).passthrough();
export type RunnerClaim=z.infer<typeof claim>;
export interface CaseJournal {claim(packetSha256:string):Promise<void>;record(event:{step:string;state:'starting'|'confirmed'|'unconfirmed'}):Promise<void>}
/** Exclusive directory is never reused/removed, including after crash. Contains no payloads or credentials. */
export class FileCaseJournal implements CaseJournal{
 private sequence=0;constructor(private directory:string){}
 async claim(packetSha256:string){await mkdir(this.directory,{mode:0o700});await writeFile(path.join(this.directory,'binding.json'),JSON.stringify({packetSha256})+'\n',{mode:0o600,flag:'wx'});}
 async record(event:{step:string;state:'starting'|'confirmed'|'unconfirmed'}){await writeFile(path.join(this.directory,String(++this.sequence).padStart(3,'0')+'.json'),JSON.stringify(event)+'\n',{mode:0o600,flag:'wx'});}
}
export interface IsolatedRunnerDependencies{
 now():number;
 journal:CaseJournal;
 preflight(signal:AbortSignal):Promise<unknown>;
 // This adapter must be separately reviewed and approved. No arbitrary URL/action interface is provided.
 workflow(stage:'queue'|'assembly'|'draft',webhookPath:string,body:unknown,signal:AbortSignal):Promise<unknown>;
 verifyAssembly(claim:RunnerClaim,assembly:unknown,signal:AbortSignal):Promise<unknown>;
 verifyProviderDraft(claim:RunnerClaim,draft:unknown,signal:AbortSignal):Promise<unknown>;
 isolation(action:'register-status'|'close',body:{scopeId:string;action:'register-status'|'close'},signal:AbortSignal):Promise<unknown>;
 timer(action:'start'|'observe'|'stop',signal:AbortSignal):Promise<unknown>;
 verifyClosed(signal:AbortSignal):Promise<unknown>;
}
function assertFiles(raw:unknown,p:IsolatedCase){const f=files.parse(raw);if(f.length!==p.members.length||new Set(f.map(v=>v.orderDbId)).size!==p.members.length||f.some(v=>!p.members.some(m=>m.orderDbId===v.orderDbId&&m.pdfSha256===v.sha256)))throw Error('Frozen PDF bytes differ');return f;}
export function validatePreparedClaim(raw:unknown,p:IsolatedCase){
 const c=claim.parse(raw),ids=p.members.map(m=>m.orderDbId).sort((a,b)=>a-b);
 if(c.rootOrderId!==p.rootOrderId||c.routeKind!==(p.members.length===2?'sibling':'single')||c.idempotencyKey!==`w1.1:${p.rootOrderId}:${ids.join('-')}`||
 c.orderDbIds.length!==ids.length||new Set(c.orderDbIds).size!==ids.length||c.orderDbIds.some(id=>!ids.includes(id))||c.orders.length!==ids.length||new Set(c.orders.map(o=>o.orderDbId)).size!==ids.length||
 c.orders.some(o=>o.rootOrderId!==p.rootOrderId||!p.members.some(m=>m.orderDbId===o.orderDbId&&m.orderId===o.orderId&&m.edition===o.formatId)))throw Error('Runner claim differs');return c;
}
export async function runPreparedIsolatedCase(raw:unknown,workflowHashes:unknown,approval:unknown,d:IsolatedRunnerDependencies){
 const p=IsolatedCasePacket.parse(raw),packetSha256=definitionSha256(p);
 const expected=z.object({queue:hash,assembly:hash,draft:hash,timer:hash}).strict().parse(workflowHashes);
 z.object({packetSha256:z.literal(packetSha256),workflowSha256:z.literal(definitionSha256(expected)),sourceSha:z.literal(p.sourceSha),maximumSpendCents:z.literal(0),draftOnly:z.literal(true),customerMessages:z.literal(false)}).strict().parse(approval);
 const remaining=()=>Date.parse(p.expiresAt)-d.now();
 const active=()=>{if(d.now()<Date.parse(p.startsAt)||remaining()<=0)throw Error('Window inactive');};active();
 await d.journal.claim(packetSha256);
 let failed=false,timerAttempted=false,cleanupOk=false,journalFailed=false;let closedReceipt:unknown;
 const operation=async<T>(name:string,fn:(signal:AbortSignal)=>Promise<T>,cleanup=false)=>{
  const record=async(state:'starting'|'confirmed'|'unconfirmed')=>{
   try{await d.journal.record({step:name,state});}catch{journalFailed=true;if(!cleanup)throw Error('Case journal unavailable');}
  };
  if(!cleanup)active();await record('starting');
  // Journal I/O may block across expiry; no dispatch may follow a stale pre-I/O check.
  if(!cleanup)active();
  const controller=new AbortController(),ms=cleanup?10_000:Math.min(name==='observe-owned-timer'?240_000:120_000,remaining());
  if(ms<=0)throw Error('No execution budget remains');
  const timeout=setTimeout(()=>controller.abort(Error('Operation deadline ended')),ms);
  try{
   const v=await Promise.race([fn(controller.signal),new Promise<never>((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('Operation deadline ended')),{once:true}))]);
   if(!cleanup)active();await record('confirmed');return v;
  }catch{await record('unconfirmed');throw Error('Isolated operation unconfirmed: '+name);}finally{clearTimeout(timeout);controller.abort();}
 };
 try{
  const before=readback.parse(await operation('preflight',s=>d.preflight(s)));
  if(d.now()-Date.parse(before.at)>60_000||Date.parse(before.at)>d.now()+1000||before.sourceSha!==p.sourceSha||before.packetSha256!==packetSha256||before.fixtureManifestSha256!==p.fixtureManifestSha256||before.accountKeySha256!==p.accountKeySha256||before.statusAccountKeySha256!==p.accountKeySha256||definitionSha256(before.workflowSha256)!==definitionSha256(expected))throw Error('Readback differs from approved packet');
  const c=validatePreparedClaim(await operation('queue',s=>d.workflow('queue',workflowPath(p,'queue'),{},s)),p);
  const assembly=await operation('assembly',s=>d.workflow('assembly',workflowPath(p,'assembly'),c,s));
  const frozen=assertFiles(await operation('verify-frozen-assembly',s=>d.verifyAssembly(c,assembly,s)),p);
  const draft=await operation('draft',s=>d.workflow('draft',workflowPath(p,'draft'),{...c,artifactVerification:{scopeId:p.scopeId,fixtureManifestSha256:p.fixtureManifestSha256,files:frozen}},s));
  const provider=z.object({submissionId:z.literal(c.submissionId),rootOrderId:z.literal(p.rootOrderId),accountKeySha256:z.literal(p.accountKeySha256),orderType:z.literal('draft'),financialStatus:z.literal('draft'),providerRootIds:z.array(z.string().min(1)).length(1),files,
   customerMessages:z.literal(false)}).strict().parse(await operation('verify-provider-draft',s=>d.verifyProviderDraft(c,draft,s)));
  assertFiles(provider.files,p);
  const registered=await operation('register-status',s=>d.isolation('register-status',{scopeId:p.scopeId,action:'register-status'},s));
  z.object({registered:z.literal(true),customerMessages:z.literal(false)}).strict().parse(registered);
  timerAttempted=true;
  z.object({started:z.literal(true),workflowSha256:z.literal(expected.timer)}).strict().parse(await operation('start-owned-timer',s=>d.timer('start',s)));
  const observed=await operation('observe-owned-timer',s=>d.timer('observe',s));
  z.object({ticks:z.number().int().min(1).max(3),actualClaims:z.number().int().min(1).max(3),successfulRefreshes:z.number().int().min(1).max(3),errors:z.literal(0),providerRoots:z.array(z.literal(provider.providerRootIds[0])).length(1),customerMessages:z.literal(false),source:z.literal('hosted-timer')}).strict().parse(observed);
 }catch{failed=true;}
 finally{
  // Independent revocation is tried even after preflight failure, expiry or unknown dispatch acknowledgement.
  // Close first: a timer stop failure must not retain usable provider authority.
  let closeOk=false,stopOk=!timerAttempted;
  try{const close=await operation('close-owned-scope',s=>d.isolation('close',{scopeId:p.scopeId,action:'close'},s),true);z.object({closed:z.literal(true),customerMessages:z.literal(false)}).strict().parse(close);closeOk=true;}catch{ /* Stop and verify still run. */ }
  if(timerAttempted)try{z.object({stopped:z.literal(true)}).strict().parse(await operation('stop-owned-timer',s=>d.timer('stop',s),true));stopOk=true;}catch{ /* independent verification required */ }
  try{closedReceipt=z.object({scopeClosed:z.literal(true),parentWindowClosed:z.literal(true),registrationDisabled:z.literal(true),leaseCleared:z.literal(true),flags:off,gates}).strict().parse(await operation('verify-independent-closure',s=>d.verifyClosed(s),true));cleanupOk=closeOk&&stopOk;}catch{cleanupOk=false;}
 }
 if(!cleanupOk)throw Error('Independent closure unconfirmed; stop all later cases');
 if(failed||journalFailed)throw Error('Case stopped; no automatic replay is allowed; independent closure verified');
 return {passed:true,packetSha256,workflowSha256:expected,closed:closedReceipt,customerMessages:false,maximumSpendCents:0};
}
