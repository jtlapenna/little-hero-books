/** Explicitly wired, draft-only diagnostic transport. No default fetch, environment loader or live CLI. */
import {createHash,randomBytes} from 'node:crypto';
import {verifyGelatoRuntimeKeyProof} from '../../src/lib/books/gelato-runtime-key-proof';
import path from 'node:path';
import {readFile,readdir} from 'node:fs/promises';
import {z} from 'zod';
import {GELATO_TERMINAL_WEBHOOK_MS,GELATO_METADATA_REQUEST_MS,GELATO_STATUS_OBSERVATION_ITERATIONS} from './gelato-runner-deadlines';
import {definitionSha256,workflowDefinition} from './prepare-w1-native-queue';
import {IsolatedCasePacket,workflowPath,type IsolatedCase} from './prepare-gelato-isolated-workflows';
import {FileCaseJournal,NORMAL_FLAGS,validatePreparedClaim,type RunnerClaim,type IsolatedRunnerDependencies} from './gelato-isolated-case-runner';
import {GelatoProviderOrderSchema,validateGelatoConnectedOrdersWithFiles} from '../../src/lib/books/gelato-provider-snapshot';
import type {GelatoDraftOrderRequest} from '../../src/lib/books/gelato-api-contract';
import {GELATO_STORED_FILE_HOST} from '../../src/lib/books/gelato-stored-file';
import retiredFingerprints from '../../../scripts/security/compromised-credential-fingerprints.json';
import {parsePrinterFileUrl} from '../../src/lib/printer-file-grants';
import {assertGelatoUnconvertedTestDraft} from '../../src/lib/books/gelato-test-safety';

const hash=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const instant=z.string().datetime({offset:true});
const https=z.string().url().superRefine((v,c)=>{const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password||u.hash) c.addIssue({code:'custom',message:'An exact HTTPS binding is required'});});
const stageNames=['queue','assembly','draft','timer'] as const;
const workflowBinding=z.object({id,versionId:id,definitionSha256:hash,credentialReferencesSha256:hash}).strict();
const workflowBindings=z.object({queue:workflowBinding,assembly:workflowBinding,draft:workflowBinding,timer:workflowBinding}).strict();
const recipient=GelatoProviderOrderSchema.shape.shippingAddress;
export const ProtectedRunnerBinding=z.object({
 packet:IsolatedCasePacket,deploymentId:z.string().uuid(),deploymentOrigin:https,n8nOrigin:https,workflowBindings,cohortRowsSha256:hash,
 // URLs/keys are private, immutable and individually approved. They are not read from workflow output.
 artifacts:z.array(z.object({orderDbId:z.number().int().positive().safe(),key:z.string().min(1),sourceUrl:https,bytes:z.number().int().positive().max(32_000_000)}).strict()).min(1).max(2),
 expectedRequest:z.object({productUid:z.string().min(1),shipmentMethodUid:z.string().min(1),currency:z.literal('USD'),shippingAddress:recipient}).strict(),
 funding:z.object({accountKeySha256:hash,at:instant,expiresAt:instant,evidenceSha256:hash,noCard:z.literal(true),zeroWallets:z.literal(true),noCredits:z.literal(true),noInvoiceOrOtherRoute:z.literal(true),providerMessagesSuppressed:z.literal(true)}).strict(),
}).strict().superRefine((b,c)=>{
 const p=b.packet,u=new URL(b.n8nOrigin),deployment=new URL(b.deploymentOrigin);
 if(deployment.origin!==b.deploymentOrigin||!/^https:\/\/[a-z0-9-]+\.little-hero-labs-admin\.pages\.dev$/.test(b.deploymentOrigin))c.addIssue({code:'custom',message:'Exact immutable Pages deployment origin required'});
 if(u.origin!==b.n8nOrigin||u.port)c.addIssue({code:'custom',message:'n8n origin must be canonical'});
 if(new Set(stageNames.map(k=>b.workflowBindings[k].id)).size!==4)c.addIssue({code:'custom',message:'Distinct owned workflows required'});
 if(b.artifacts.length!==p.members.length||new Set(b.artifacts.map(a=>a.orderDbId)).size!==p.members.length||b.artifacts.some(a=>{
  const m=p.members.find(m=>m.orderDbId===a.orderDbId);return !m||!new RegExp('^book-finding-our-inner-voice/orders/'+m.orderId+'/gelato/print/v2/[a-f0-9]{24}\\.pdf$').test(a.key)||new URL(a.sourceUrl).origin!=='https://admin.littleherolabs.com'||new URL(a.sourceUrl).pathname!=='/api/pdf/'+a.key;
 }))c.addIssue({code:'custom',message:'Exact owned artifact binding required'});
 if(b.funding.accountKeySha256!==p.accountKeySha256||Date.parse(b.funding.expiresAt)>Date.parse(p.expiresAt)||Date.parse(b.funding.expiresAt)<=Date.parse(b.funding.at))c.addIssue({code:'custom',message:'Funding attestation binding differs'});
});
export type ProtectedBinding=z.infer<typeof ProtectedRunnerBinding>;
export interface ProtectedCredentials {backend:string;scope:string;intake:string;n8n:string;database:string;cloudflare:string;gelato:string}
export interface ProtectedRunnerOptions {
 fetcher:typeof fetch; // Mandatory injection: constructing this adapter cannot discover a live transport.
 now():number;
 sleep(ms:number,signal:AbortSignal):Promise<void>;
 credentials:ProtectedCredentials;
 journalRoot:string;
}
export const sha256=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
export const credentialReferenceSha256=(w:ReturnType<typeof workflowDefinition>)=>definitionSha256(w.nodes.map(n=>({id:n.id,credentials:n.credentials??null})));
export const protectedCaseDirectory=(journalRoot:string,p:IsolatedCase)=>path.join(journalRoot,definitionSha256({accountKeySha256:p.accountKeySha256,rootOrderId:p.rootOrderId}));
const obj=z.record(z.string(),z.unknown());
const one=(v:unknown)=>{const rows=z.array(obj).length(1).parse(v);return rows[0];};
const backend='https://admin.littleherolabs.com';
const database='https://mdnthwpcnphjnnblbvxk.supabase.co/rest/v1/';
const cloudflare='https://api.cloudflare.com/client/v4/accounts/3daae940fcb6fc5b8bbd9bb8fcc62854/pages/projects/little-hero-labs-admin';
const rowSelect='id,orderId,root_order_id,amazon_order_id,print_provider,book_specs,customer_approval_required,customer_approval_status,print_book_id,print_config_version,print_format_id,print_product_uid,print_inner_page_count,print_api_page_count,print_expected_pdf_page_count';
export const protectedCohortColumns=rowSelect;
const scopeSelect='id,root_order_id,token_sha256,account_key_sha256,fixture_manifest_sha256,expires_at,closed_at,submission_id,status_claims';
const windowSelect='root_order_id,child_order_ids,account_key_sha256,fixture_manifest_sha256,opened_at,expires_at,closed_at';

export function createProtectedRunnerAdapter(raw:unknown,approvedBindingSha256:string,o:ProtectedRunnerOptions){
 const b=ProtectedRunnerBinding.parse(raw),p=b.packet;
 if(definitionSha256(b)!==approvedBindingSha256)throw Error('Protected binding is not approved');
 const credentials=z.object({backend:z.string().min(16),scope:z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),intake:z.string().min(16),n8n:z.string().min(16),database:z.string().min(16),cloudflare:z.string().min(16),gelato:z.string().min(16)}).strict().parse(o.credentials);
 if(Object.values(credentials).some(v=>retiredFingerprints.includes(sha256(v))))throw Error('Retired private authority rejected');
 if(sha256(credentials.gelato)!==p.accountKeySha256)throw Error('Private account key differs');
 // Each adapter owns finite budgets. Cleanup has an independent budget and never reads provider data.
 let calls=0,cleanupCalls=0,providerReads=0,totalBytes=0,cleanupBytes=0,claim:RunnerClaim|undefined,providerId:string|undefined,timerStartedAt=0;
 const dispatched=new Set<string>();let ownsAttempt=false,preflightVerified=false,assemblyVerified=false,providerVerified=false,statusRegistered=false;
 const journal=new FileCaseJournal(protectedCaseDirectory(o.journalRoot,p));
 const requireOwner=()=>{if(!ownsAttempt)throw Error('Durable attempt ownership required');};
 const requirePreflight=()=>{requireOwner();if(!preflightVerified)throw Error('Successful private preflight required');};
 const request=async(url:string,method:'GET'|'POST',headers:Record<string,string>,body:unknown,signal:AbortSignal,cleanup=false,binary=false,timeoutMs=GELATO_METADATA_REQUEST_MS)=>{
  signal.throwIfAborted();if(cleanup?++cleanupCalls>24:++calls>200)throw Error('Protected call budget ended');
  const local=AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]);let response:Response;
  try{
   const pending=o.fetcher(url,{method,headers:{...headers,'Cache-Control':'no-cache',...(method==='POST'?{'Content-Type':'application/json'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',signal:local});
   // An injected adapter can ignore AbortSignal. Cleanup must still progress to stop/readback.
   void pending.then(r=>{if(local.aborted)void r.body?.cancel().catch(()=>{});},()=>{});
   response=await new Promise<Response>((resolve,reject)=>{
    const abort=()=>reject(Error('Protected request deadline'));local.addEventListener('abort',abort,{once:true});
    if(local.aborted)abort();pending.then(resolve,reject).finally(()=>local.removeEventListener('abort',abort));
   });
  }
  catch{throw Error('Protected request not confirmed');}
  if(!response.ok||response.status>=300||response.redirected||(response.url&&response.url!==url)){void response.body?.cancel().catch(()=>{});throw Error('Protected HTTP response rejected');}
  const limit=binary?32_000_000:2_000_000,parts:Uint8Array[]=[];let bytes=0;
  const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>limit)){void response.body?.cancel().catch(()=>{});throw Error('Protected response length rejected');}
  const reader=response.body?.getReader();if(!reader)throw Error('Protected body unavailable');
  try{for(;;){local.throwIfAborted();const next=await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve,reject)=>{
   const abort=()=>reject(Error('Protected body deadline'));local.addEventListener('abort',abort,{once:true});
   reader.read().then(resolve,reject).finally(()=>local.removeEventListener('abort',abort));
  });if(next.done)break;bytes+=next.value.byteLength;if(cleanup)cleanupBytes+=next.value.byteLength;else totalBytes+=next.value.byteLength;if(bytes>limit||(cleanup?cleanupBytes>16_000_000:totalBytes>160_000_000))throw Error('Protected byte budget ended');parts.push(next.value);}}
  finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
  if(length!==null&&bytes!==Number(length))throw Error('Protected body truncated');
  const result=Buffer.concat(parts);if(binary)return result;
  try{return JSON.parse(result.toString()) as unknown;}catch{throw Error('Protected JSON invalid');}
 };
 const json=async(url:string,method:'GET'|'POST',headers:Record<string,string>,body:unknown,signal:AbortSignal,cleanup=false)=>request(url,method,headers,body,signal,cleanup);
 const db=async(table:string,params:Record<string,string>,signal:AbortSignal,cleanup=false)=>json(database+table+'?'+new URLSearchParams(params),'GET',{apikey:credentials.database,Authorization:'Bearer '+credentials.database},undefined,signal,cleanup);
 const n8n=async(stage:typeof stageNames[number],action:''|'/activate'|'/deactivate',signal:AbortSignal,cleanup=false)=>json(b.n8nOrigin+'/api/v1/workflows/'+b.workflowBindings[stage].id+action,action?'POST':'GET',{'X-N8N-API-KEY':credentials.n8n},action?{}:undefined,signal,cleanup);
 const controls=async(signal:AbortSignal,cleanup=false)=>{
  const raw=await json(cloudflare,'GET',{Authorization:'Bearer '+credentials.cloudflare},undefined,signal,cleanup) as {success?:boolean;result?:Record<string,unknown>};
  if(raw.success!==true||!raw.result)throw Error('Infrastructure readback missing');
  const settings=raw.result.deployment_configs as {production?:{env_vars?:Record<string,{value?:unknown}>}};
  const serving=raw.result.canonical_deployment as {id?:string;url?:string;deployment_trigger?:{metadata?:{commit_hash?:string}};env_vars?:Record<string,{value?:unknown}>};
  if(serving?.deployment_trigger?.metadata?.commit_hash!==p.sourceSha||serving.id!==b.deploymentId||serving.url!==b.deploymentOrigin)throw Error('Serving source/deployment differs');
  for(const vars of [settings?.production?.env_vars,serving?.env_vars]){
   if(!vars||NORMAL_FLAGS.some(k=>vars[k]?.value!=='false'))throw Error('Normal controls are not explicitly OFF');
   // Masked settings establish presence/type only. Immutable deployment pin plus the
   // fresh runtime challenge in preflight establish effective values; masks never do.
   if(!cleanup&&(['GELATO_API_KEY','GELATO_STATUS_API_KEY'].some(k=>{const entry=vars[k] as {type?:unknown;value?:unknown}|undefined;return entry?.type!=='secret_text'||!(entry.value===null||entry.value===''||typeof entry.value==='string'&&sha256(entry.value)===p.accountKeySha256);})))throw Error('Account/status secret metadata unverified');
  }
  const dispatch=one(await db('print_provider_dispatch_gates',{select:'enabled',provider:'eq.gelato'},signal,cleanup));
  const release=one(await db('gelato_ordinary_release_gate',{select:'id,enabled',id:'eq.true'},signal,cleanup));
  if(dispatch.enabled!==false||release.enabled!==false)throw Error('Normal gates are not OFF');
  return {flags:Object.fromEntries(NORMAL_FLAGS.map(k=>[k,false])),gates:{dispatch:false,ordinaryRelease:false}};
 };
 const scope=async(signal:AbortSignal,cleanup=false)=>{
  const s=one(await db('gelato_isolation_scopes',{select:scopeSelect,id:'eq.'+p.scopeId},signal,cleanup));
  if(s.id!==p.scopeId||s.root_order_id!==p.rootOrderId||s.token_sha256!==sha256(credentials.scope)||s.account_key_sha256!==p.accountKeySha256||s.fixture_manifest_sha256!==p.fixtureManifestSha256||Date.parse(String(s.expires_at))!==Date.parse(p.expiresAt))throw Error('Exact scope binding differs');
  const win=one(await db('gelato_engineering_submission_windows',{select:windowSelect,root_order_id:'eq.'+p.rootOrderId},signal,cleanup));
  if(win.root_order_id!==p.rootOrderId||win.account_key_sha256!==p.accountKeySha256||win.fixture_manifest_sha256!==p.fixtureManifestSha256||definitionSha256(win.child_order_ids)!==definitionSha256(p.members.map(m=>m.orderDbId).sort((a,b)=>a-b))||Date.parse(String(win.opened_at))>Date.parse(p.startsAt)||Date.parse(String(win.expires_at))<Date.parse(p.expiresAt))throw Error('Parent window differs');
  if(!cleanup&&(s.closed_at!==null||win.closed_at!==null||o.now()<Date.parse(p.startsAt)||o.now()>=Date.parse(p.expiresAt)))throw Error('Exact scope inactive');
  return {s,win};
 };
 const active=async(signal:AbortSignal)=>{await scope(signal);await controls(signal);signal.throwIfAborted();if(o.now()>=Date.parse(p.expiresAt))throw Error('Scope execution budget ended');};
 const workflow=async(stage:typeof stageNames[number],activeState:boolean,signal:AbortSignal,cleanup=false)=>{
  const raw=z.object({id:z.string(),versionId:z.string(),activeVersionId:z.string().nullable(),active:z.boolean()}).passthrough().parse(await n8n(stage,'',signal,cleanup));const w=workflowDefinition(raw);
  if(raw.id!==b.workflowBindings[stage].id||raw.versionId!==b.workflowBindings[stage].versionId||activeState&&raw.activeVersionId!==raw.versionId||raw.active!==activeState||definitionSha256(w)!==b.workflowBindings[stage].definitionSha256||credentialReferenceSha256(w)!==b.workflowBindings[stage].credentialReferencesSha256||JSON.stringify(w).includes('__LHL_'))throw Error('Installed workflow binding differs');
  return raw;
 };
 const members=async(c:RunnerClaim,signal:AbortSignal)=>{
  const rows=z.array(obj).min(1).max(2).parse(await db('print_provider_submission_items',{select:'submission_id,item_reference_id,child_order_id,child_order_key,artifact_key,artifact_fingerprint,artifact_claim_token,pdf_page_count,provider_order_id,provider_item_id',submission_id:'eq.'+c.submissionId,order:'child_order_id'},signal));
  if(rows.length!==p.members.length||new Set(rows.map(r=>r.child_order_id)).size!==rows.length||rows.some(r=>!p.members.some(m=>m.orderDbId===r.child_order_id&&m.orderId===r.child_order_key)||r.submission_id!==c.submissionId||r.item_reference_id!=='lhb-item-'+r.child_order_id||r.artifact_claim_token!==c.claimToken||r.pdf_page_count!==35||!b.artifacts.some(a=>a.orderDbId===r.child_order_id&&a.key===r.artifact_key&&a.key.endsWith('/'+r.artifact_fingerprint+'.pdf'))))throw Error('Owned immutable artifact receipt differs');return rows;
 };
 const bytes=async(url:string,expected:string,size:number,signal:AbortSignal)=>{
  const body=await request(url,'GET',{},undefined,signal,false,true);if(!Buffer.isBuffer(body)||body.length!==size||sha256(body)!==expected)throw Error('Frozen PDF bytes differ');
 };
 const isolation=async(action:'register-status'|'close',signal:AbortSignal)=>json(backend+'/api/internal/w4/engineering-isolation','POST',{Authorization:'Bearer '+credentials.backend,'x-lhl-engineering-token':credentials.scope},{scopeId:p.scopeId,action},signal,action==='close');
 const registration=async(signal:AbortSignal,cleanup=false)=>{
  const {s}=await scope(signal,cleanup);if(s.submission_id===null)return {s,job:null};
  const rows=z.array(obj).max(1).parse(await db('gelato_scheduled_status',{select:'submission_id,engineering_scope_id,account_key_sha256,enabled,lease_token,lease_expires_at,attempt_count,last_success_at,last_result,last_error_class',submission_id:'eq.'+String(s.submission_id)},signal,cleanup));
  const job=rows[0]??null;if(job&&(job.submission_id!==s.submission_id||job.engineering_scope_id!==p.scopeId||job.account_key_sha256!==p.accountKeySha256))throw Error('Status registration ownership differs');return {s,job};
 };
 const timerActivationSettled=async(registrationExists:boolean)=>{
  // A point-in-time inactive GET cannot settle an earlier activation with a lost acknowledgement.
  // Missing/corrupt primary evidence never prevents revocation, but cannot establish cleanup success.
  try{
   const directory=protectedCaseDirectory(o.journalRoot,p);
   const binding=z.object({packetSha256:z.literal(definitionSha256(p))}).strict().parse(JSON.parse(await readFile(path.join(directory,'binding.json'),'utf8')));void binding;
   const names=(await readdir(directory)).filter(n=>/^\d{3}\.json$/.test(n)).sort();if(names.length>100) return false;
   let started=false,settled=false,bound=false;
   for(let i=0;i<names.length;i++){
    if(names[i]!==String(i+1).padStart(3,'0')+'.json')return false;
    const event=z.object({step:z.string(),state:z.enum(['starting','confirmed','unconfirmed'])}).strict().parse(JSON.parse(await readFile(path.join(directory,names[i]),'utf8')));
    if(event.step==='protected-binding:'+definitionSha256(b)&&event.state==='confirmed')bound=true;
    if(event.step==='start-owned-timer'){if(event.state==='starting'){if(started)return false;started=true;}else if(event.state==='confirmed')settled=true;else return false;}
   }
   return bound&&(started&&settled||!registrationExists&&!started);
  }catch{return false;}
 };
 const verifyClosed=async(signal:AbortSignal)=>{
  const {s,win}=await scope(signal,true);const {job}=await registration(signal,true);
  if(!s.closed_at||!win.closed_at||(job&&(job.enabled!==false||job.lease_token!==null||job.lease_expires_at!==null)))throw Error('Independent closure missing');
  for(const stage of stageNames)await workflow(stage,false,signal,true);
  const offControls=await controls(signal,true);
  if(!await timerActivationSettled(job!==null))throw Error('Timer activation acknowledgement unresolved; keep later cases stopped');
  return {scopeClosed:true,parentWindowClosed:true,registrationDisabled:true,leaseCleared:true,...offControls};
 };
 const d:IsolatedRunnerDependencies={now:o.now,journal:{claim:async hash=>{if(hash!==definitionSha256(p))throw Error('Journal packet differs');await journal.claim(hash);await journal.record({step:'protected-binding:'+definitionSha256(b),state:'confirmed'});ownsAttempt=true;},record:e=>journal.record(e)},
  preflight:async signal=>{
   requireOwner();preflightVerified=false;await active(signal);
   const challenge=randomBytes(32).toString('hex');
   const diagnostic=await json(b.deploymentOrigin+'/api/internal/w4/submit-gelato-draft?keyChallenge='+challenge,'GET',{Authorization:'Bearer '+credentials.backend},undefined,signal) as Record<string,unknown>;
   if(diagnostic.contextAvailable!==true||diagnostic.draftsEnabled!==false||['cloudflare','globalProcess','nodeProcess'].some(k=>{const v=diagnostic[k] as Record<string,unknown>;return !v||v.present!==true||v.isString!==true||v.isFalse!==true||v.isTrue!==false;}))throw Error('Request-time OFF diagnostic differs');
   verifyGelatoRuntimeKeyProof(diagnostic.keyAttestation,challenge,credentials.gelato);
   if(o.now()-Date.parse(b.funding.at)>60_000||o.now()<Date.parse(b.funding.at)-1000||o.now()>=Date.parse(b.funding.expiresAt))throw Error('Fresh funding/message attestation required');
   const {s}=await scope(signal);if(s.submission_id!==null||s.status_claims!==0)throw Error('Fresh unconsumed scope required');
   const rows=z.array(obj).length(p.members.length).parse(await db('orders',{select:rowSelect,id:'in.('+p.members.map(m=>m.orderDbId).sort((a,b)=>a-b).join(',')+')',order:'id'},signal));
   if(definitionSha256(rows)!==b.cohortRowsSha256||rows.some(r=>!p.members.some(m=>m.orderDbId===r.id&&m.orderId===r.orderId)||r.print_provider!=='gelato'||(r.book_specs as {testMode?:unknown})?.testMode!==true))throw Error('Owned approved fresh cohort differs');
   for(const stage of stageNames)await workflow(stage,stage!=='timer',signal);
   const finalControls=await controls(signal);preflightVerified=true;
   return {at:new Date(o.now()).toISOString(),sourceSha:p.sourceSha,packetSha256:definitionSha256(p),accountKeySha256:p.accountKeySha256,statusAccountKeySha256:p.accountKeySha256,workflowSha256:Object.fromEntries(stageNames.map(k=>[k,b.workflowBindings[k].definitionSha256])),...finalControls,noFundingRoutes:true,applicationMessagesSuppressed:true,providerMessagesSuppressed:true,ownedFreshCohortVerified:true,recipientVerified:true,fixtureManifestSha256:p.fixtureManifestSha256};
  },
  workflow:async(stage,webhookPath,body,signal)=>{
   requirePreflight();
   if(stage==='queue'){if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)throw Error('Queue selectors forbidden');}
   else{const c=validatePreparedClaim(body,p);if(!claim||c.submissionId!==claim.submissionId||c.claimToken!==claim.claimToken||!dispatched.has('queue'))throw Error('Owned queue claim required');}
   if(stage==='draft'&&!assemblyVerified)throw Error('Independent assembly verification required');
   if(webhookPath!==workflowPath(p,stage)||dispatched.has(stage))throw Error('Workflow dispatch is not replayable');
   // Reserve synchronously before any await; another caller cannot pass the same slot.
   dispatched.add(stage);await active(signal);await workflow(stage,true,signal);signal.throwIfAborted();
   const result=await request(b.n8nOrigin+'/webhook/'+webhookPath,'POST',{'x-lhl-isolated-intake':credentials.intake},body,signal,false,false,GELATO_TERMINAL_WEBHOOK_MS);
   if(stage==='queue')claim=validatePreparedClaim(result,p);return result;
  },
  verifyAssembly:async(c,_assembly,signal)=>{
   requirePreflight();if(!dispatched.has('assembly')||!claim||c.submissionId!==claim.submissionId||c.claimToken!==claim.claimToken)throw Error('Assembly claim is not owned');await active(signal);const rows=await members(c,signal);
   for(const a of b.artifacts){const m=p.members.find(m=>m.orderDbId===a.orderDbId)!;await bytes(a.sourceUrl,m.pdfSha256,a.bytes,signal);}
   assemblyVerified=true;return rows.map(r=>({orderDbId:r.child_order_id,sha256:p.members.find(m=>m.orderDbId===r.child_order_id)!.pdfSha256}));
  },
  verifyProviderDraft:async(c,_draft,signal)=>{
   requirePreflight();await active(signal);if(!assemblyVerified||!dispatched.has('draft')||!claim||c.submissionId!==claim.submissionId||c.claimToken!==claim.claimToken)throw Error('Unowned submission');
   const sub=one(await db('print_provider_submissions',{select:'id,root_order_id,claim_token,request_state,accepted_root_order_id,order_reference_id,request_snapshot',id:'eq.'+c.submissionId},signal));
   if(sub.id!==c.submissionId||sub.root_order_id!==p.rootOrderId||sub.claim_token!==c.claimToken||sub.request_state!=='submitted'||typeof sub.accepted_root_order_id!=='string')throw Error('Provider acceptance is not mapped');
   providerId=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/).parse(sub.accepted_root_order_id);
   const rows=await members(c,signal);const request=(sub.request_snapshot as {request?:GelatoDraftOrderRequest})?.request;
   if(!request||request.orderType!=='draft'||request.orderReferenceId!==sub.order_reference_id||request.customerReferenceId!==p.rootOrderId||request.currency!==b.expectedRequest.currency||request.shipmentMethodUid!==b.expectedRequest.shipmentMethodUid||definitionSha256(recipient.parse(request.shippingAddress))!==definitionSha256(b.expectedRequest.shippingAddress)||request.items.length!==rows.length||new Set(request.items.map(i=>i.itemReferenceId)).size!==rows.length)throw Error('Saved request differs');
   for(const m of rows){const item=request.items.find(i=>i.itemReferenceId===m.item_reference_id);if(!item||item.productUid!==b.expectedRequest.productUid||item.quantity!==1||item.pageCount!==32||item.files.length!==1||item.files[0].type!=='default'||!parsePrinterFileUrl(item.files[0].url,String(m.artifact_key)))throw Error('Saved item/file differs');}
   if(++providerReads>1)throw Error('Provider read budget ended');
   const rawProvider=await json('https://order.gelatoapis.com/v4/orders/'+providerId,'GET',{'X-API-KEY':credentials.gelato},undefined,signal) as {financialStatus?:unknown};
   const provider=GelatoProviderOrderSchema.parse(rawProvider);
   assertGelatoUnconvertedTestDraft(rawProvider);
   if(provider.id!==providerId||provider.connectedOrderIds.some(i=>i!==providerId)||provider.orderType!=='draft'||rawProvider.financialStatus!=='draft')throw Error('Provider draft/account graph differs');
   await validateGelatoConnectedOrdersWithFiles([provider],request,async(ref,url)=>{
    const m=rows.find(m=>m.item_reference_id===ref),a=b.artifacts.find(a=>a.orderDbId===m?.child_order_id);if(!a)throw Error('Foreign provider file');
    const u=new URL(url);if(u.protocol!=='https:'||u.hostname!==GELATO_STORED_FILE_HOST||u.port||u.username||u.password||u.hash)throw Error('Provider original host rejected');
    await bytes(url,p.members.find(m=>m.orderDbId===a.orderDbId)!.pdfSha256,a.bytes,signal);return true;
   },true);
   // Even an unchanged source URL must have fresh independently downloaded bytes.
   for(const item of provider.items)for(const file of item.files)if(request.items.find(i=>i.itemReferenceId===item.itemReferenceId)?.files[0].url===file.url){const m=rows.find(m=>m.item_reference_id===item.itemReferenceId)!,a=b.artifacts.find(a=>a.orderDbId===m.child_order_id)!;await bytes(file.url,p.members.find(m=>m.orderDbId===a.orderDbId)!.pdfSha256,a.bytes,signal);}
   for(const m of rows){const item=provider.items.find(i=>i.itemReferenceId===m.item_reference_id);if(m.provider_order_id!==providerId||m.provider_item_id!==item?.id)throw Error('Saved child/provider mapping differs');}
   const mapped=z.array(obj).length(1).parse(await db('print_provider_submission_orders',{select:'provider_order_id,order_type',submission_id:'eq.'+c.submissionId},signal));if(mapped[0].provider_order_id!==providerId||mapped[0].order_type!=='draft')throw Error('Saved provider graph differs');
   const notifications=z.array(obj).max(1).parse(await db('print_provider_submission_notifications',{select:'id',submission_id:'eq.'+c.submissionId,limit:'1'},signal));if(notifications.length)throw Error('Unexpected notification intent');
   providerVerified=true;return {submissionId:c.submissionId,rootOrderId:p.rootOrderId,accountKeySha256:p.accountKeySha256,orderType:'draft',financialStatus:'draft',providerRootIds:[providerId],files:p.members.map(m=>({orderDbId:m.orderDbId,sha256:m.pdfSha256})),customerMessages:false};
  },
  isolation:async(action,body,signal)=>{
   if(body.scopeId!==p.scopeId||body.action!==action)throw Error('Isolation action differs');
   if(action==='close')return isolation(action,signal);
   requirePreflight();if(!providerVerified||dispatched.has('register-status'))throw Error('Owned verified draft required');dispatched.add('register-status');await active(signal);
   const result=await isolation(action,signal);z.object({registered:z.literal(true),customerMessages:z.literal(false)}).strict().parse(result);statusRegistered=true;return result;
  },
  timer:async(action,signal)=>{
   if(action==='stop'){
    // New webhook copies are owned by this window too. Restore every copy to OFF.
    // Send every stop independently, timer first. One hung copy cannot suppress another stop.
    const stages=['timer',...stageNames.filter(s=>s!=='timer')] as const;
    const results=await Promise.allSettled(stages.map(async stage=>{await n8n(stage,'/deactivate',signal,true);await workflow(stage,false,signal,true);}));
    if(results.some(r=>r.status==='rejected'))throw Error('Owned workflow closure unconfirmed');return {stopped:true};
   }
   if(action==='start'){requirePreflight();if(!statusRegistered)throw Error('Owned status registration required');if(dispatched.has('timer'))throw Error('Timer start not replayable');dispatched.add('timer');await active(signal);await workflow('timer',false,signal);const {job}=await registration(signal);if(!job||job.enabled!==true||job.attempt_count!==0)throw Error('New owned status registration required');timerStartedAt=o.now();await n8n('timer','/activate',signal);await workflow('timer',true,signal);return {started:true,workflowSha256:b.workflowBindings.timer.definitionSha256};}
   if(!timerStartedAt||!providerId)throw Error('Owned timer has not started');
   const seen=new Set<string>(),completed:Array<{start:number;end:number}>=[];let successful=0;
   for(let tick=0;tick<GELATO_STATUS_OBSERVATION_ITERATIONS;tick++){
    await active(signal);await workflow('timer',true,signal);
    const page=z.object({data:z.array(z.object({id,workflowId:id,status:z.string(),mode:z.string(),startedAt:instant,stoppedAt:instant.nullable()}).passthrough()).max(10),nextCursor:z.string().nullable().optional()}).parse(await json(b.n8nOrigin+'/api/v1/executions?'+new URLSearchParams({workflowId:b.workflowBindings.timer.id,limit:'10',includeData:'false'}),'GET',{'X-N8N-API-KEY':credentials.n8n},undefined,signal));
    if(page.nextCursor)throw Error('Timer observation incomplete');
    for(const e of page.data){
     const start=Date.parse(e.startedAt),end=e.stoppedAt===null?null:Date.parse(e.stoppedAt),ceiling=Math.min(o.now()+1000,Date.parse(p.expiresAt));
     if(e.workflowId!==b.workflowBindings.timer.id||!Number.isFinite(start)||start<timerStartedAt||start>ceiling||end!==null&&(!Number.isFinite(end)||end<start||end>ceiling)||e.mode!=='trigger')throw Error('Foreign/stale/future timer execution');
     if(!['new','running','waiting','success'].includes(e.status))throw Error('Hosted timer failed or returned an unknown state');if(e.status==='success'&&end===null)throw Error('Completed timer execution has no terminal timestamp');if(e.status==='success'&&end!==null&&!seen.has(e.id)){seen.add(e.id);completed.push({start,end});}
    }
    const {s,job}=await registration(signal);if(!job||job.enabled!==true||job.last_error_class!==null||job.last_result==='failed'||Number(s.status_claims)>3)throw Error('Scoped polling failed');
    const attempts=z.number().int().min(0).max(3).parse(job.attempt_count),claims=z.number().int().min(0).max(3).parse(s.status_claims);
    if(attempts!==claims)throw Error('Persisted timer claims differ');
    const successAt=job.last_success_at===null?null:Date.parse(instant.parse(job.last_success_at));
    if(successAt!==null&&(successAt<timerStartedAt||successAt>Math.min(o.now()+1000,Date.parse(p.expiresAt))))throw Error('Persisted refresh timestamp differs');
    if(job.last_result==='success'&&successAt!==null&&attempts>=1&&completed.some(e=>successAt>=e.start-1000&&successAt<=e.end+1000)){successful=attempts;break;}
    await o.sleep(10_000,signal);
   }
   if(!successful)throw Error('No proven successful hosted refresh');
   return {ticks:Math.min(3,seen.size),actualClaims:successful,successfulRefreshes:1,errors:0,providerRoots:[providerId],customerMessages:false,source:'hosted-timer'};
  },verifyClosed};
 return {dependencies:d,bindingSha256:definitionSha256(b),workflowHashes:Object.fromEntries(stageNames.map(k=>[k,b.workflowBindings[k].definitionSha256])),
  // Recovery-only capability is independent of journal ownership, process state, expiry and GELATO keys.
  closeOnly:async()=>{
   let close=false,stop=false;try{const r=await isolation('close',AbortSignal.timeout(5000)) as {closed?:boolean};close=r.closed===true;}catch{/* Always attempt timer stop and independent readback. */}
   try{await d.timer('stop',AbortSignal.timeout(5000));stop=true;}catch{/* Never suppress verification. */}
   let verified=false;try{await verifyClosed(AbortSignal.timeout(10_000));verified=true;}catch{/* Unconfirmed cleanup stops later cases. */}
   if(!close||!stop||!verified)throw Error('Independent cleanup unconfirmed');return {closed:true,stopped:true,verified:true,customerMessages:false};
  },counters:()=>({calls,cleanupCalls,providerReads,totalBytes,cleanupBytes})};
}

/** Run this monitor in an independent process, armed before the primary may dispatch.
 * ownerExited must represent its dedicated IPC/process handle, never an unverified reused PID.
 * Loss of monitor cancellation also attempts close; monitoring never resumes business work. */
export async function watchProtectedRunner(adapter:Pick<ReturnType<typeof createProtectedRunnerAdapter>,'closeOnly'>,
 options:{deadline:number;now():number;ownerExited():boolean;sleep(ms:number,signal:AbortSignal):Promise<void>;signal:AbortSignal}){
 try{while(!options.ownerExited()&&options.now()<options.deadline){options.signal.throwIfAborted();await options.sleep(Math.min(1000,Math.max(1,options.deadline-options.now())),options.signal);}}
 finally{await adapter.closeOnly();}
 return {closed:true,customerMessages:false};
}
