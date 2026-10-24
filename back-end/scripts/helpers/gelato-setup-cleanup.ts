/** Local repair candidate. Mandatory injected transport; no env/default fetch, provider access or business authority. */
import assert from 'node:assert/strict';
import {LaunchContext,type Launch} from './gelato-protected-launch-context';
import {sha256,credentialReferenceSha256} from './gelato-protected-runner-adapter';
import {definitionSha256,workflowDefinition} from './prepare-w1-native-queue';
import {NORMAL_FLAGS} from './gelato-isolated-case-runner';
const database='https://mdnthwpcnphjnnblbvxk.supabase.co/rest/v1/';
const infrastructure='https://api.cloudflare.com/client/v4/accounts/3daae940fcb6fc5b8bbd9bb8fcc62854/pages/projects/little-hero-labs-admin';
const stages=['queue','assembly','draft','timer'] as const;
export function settlementIdentity(raw:Launch){const c=LaunchContext.parse(raw),p=c.binding.packet;return {p_scope_id:p.scopeId,p_root_order_id:p.rootOrderId,p_token_sha256:sha256(c.credentials.scope),p_account_key_sha256:p.accountKeySha256,p_fixture_manifest_sha256:p.fixtureManifestSha256,p_child_order_ids:p.members.map(m=>m.orderDbId).sort((a,b)=>a-b)};}
export function createSetupCleanup(raw:Launch,fetcher:typeof fetch,now:()=>number=Date.now){
 const c=LaunchContext.parse(raw),b=c.binding,p=b.packet,identity=settlementIdentity(c);let calls=0,bytes=0,started=false;
 const auth={apikey:c.credentials.database,Authorization:'Bearer '+c.credentials.database};
 const counters=()=>({calls,bytes,providerCalls:0,maximumCalls:24,maximumBytes:16_000_000});
 async function cleanup(){
  assert(!started,'Setup cleanup cannot replay');started=true;const end=now()+20_000,errors:string[]=[];
  const bounded=async<T>(task:Promise<T>,signal:AbortSignal)=>new Promise<T>((resolve,reject)=>{const abort=()=>reject(Error('Setup cleanup request deadline'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();task.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
  const request=async(url:string,method:'GET'|'POST',headers:Record<string,string>,body?:unknown)=>{
   assert(now()<end&&calls<24&&bytes<16_000_000,'Setup cleanup budget ended');calls++;
   const signal=AbortSignal.timeout(Math.max(1,Math.min(5000,end-now())));
   const pending=fetcher(url,{method,headers:{...headers,'X-LHL-Setup-Settlement':'1','Cache-Control':'no-cache',...(method==='POST'?{'Content-Type':'application/json'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',signal});
   void pending.then(r=>{if(signal.aborted)void r.body?.cancel().catch(()=>{});},()=>{});
   const r=await bounded(pending,signal);
   const length=r.headers.get('content-length');
   if(!r.ok||r.redirected||(r.url&&r.url!==url)||length!==null&&(!/^\d+$/.test(length)||Number(length)>Math.min(2_000_000,16_000_000-bytes))){void r.body?.cancel().catch(()=>{});throw Error('Setup response unconfirmed or beyond remaining budget');}
   const reader=r.body?.getReader();assert(reader);const parts:Uint8Array[]=[];let size=0;
   try{for(;;){const v=await bounded(reader.read(),signal);if(v.done)break;size+=v.value.byteLength;bytes+=v.value.byteLength;assert(size<=2_000_000&&bytes<=16_000_000);parts.push(v.value);}}
   catch(e){void reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
   assert(length===null||size===Number(length));return JSON.parse(Buffer.concat(parts).toString());
  };
  const get=(table:string,params:Record<string,string>)=>request(database+table+'?'+new URLSearchParams(params),'GET',auth);
  const attempt=async(name:string,fn:()=>Promise<void>)=>{try{await fn();}catch{errors.push(name);}};
  await attempt('revocation',async()=>{const r=await request(database+'rpc/revoke_gelato_admission','POST',auth,identity);assert.deepEqual(r,{revoked:true,scopeId:p.scopeId,rootOrderId:p.rootOrderId,scopePresent:r.scopePresent,parentPresent:r.parentPresent,scopeClosed:true,parentClosed:true,registrationDisabled:true,leaseCleared:true,customerMessages:false});assert(typeof r.scopePresent==='boolean'&&typeof r.parentPresent==='boolean');});
  // Always attempt to stop all exact copies, even if the revoke acknowledgment was lost.
  for(const stage of stages)await attempt('stop-'+stage,async()=>{await request(b.n8nOrigin+'/api/v1/workflows/'+b.workflowBindings[stage].id+'/deactivate','POST',{'X-N8N-API-KEY':c.credentials.n8n},{});});
  for(const stage of stages)await attempt('readback-'+stage,async()=>{const r=await request(b.n8nOrigin+'/api/v1/workflows/'+b.workflowBindings[stage].id,'GET',{'X-N8N-API-KEY':c.credentials.n8n}),w=b.workflowBindings[stage];assert(r.id===w.id&&r.versionId===w.versionId&&r.active===false&&r.activeVersionId===null&&definitionSha256(workflowDefinition(r))===w.definitionSha256&&credentialReferenceSha256(workflowDefinition(r))===w.credentialReferencesSha256);});
  await attempt('fence-readback',async()=>{const rows=await get('gelato_admission_revocations',{select:'scope_id,root_order_id,token_sha256,account_key_sha256,fixture_manifest_sha256,child_order_ids,revoked_at',scope_id:'eq.'+p.scopeId,root_order_id:'eq.'+p.rootOrderId});assert(Array.isArray(rows)&&rows.length===1);const f=rows[0];for(const [k,v] of Object.entries(identity))assert.deepEqual(f[k.slice(2)],v);assert(Number.isFinite(Date.parse(f.revoked_at))&&Date.parse(f.revoked_at)<=now()+1000);});
  let submission:string|null=null;
  await attempt('scope-readback',async()=>{const rows=await get('gelato_isolation_scopes',{select:'id,root_order_id,token_sha256,account_key_sha256,fixture_manifest_sha256,closed_at,submission_id',id:'eq.'+p.scopeId});assert(Array.isArray(rows)&&rows.length<=1);if(rows.length){const s=rows[0];assert(s.id===p.scopeId&&s.root_order_id===p.rootOrderId&&s.token_sha256===identity.p_token_sha256&&s.account_key_sha256===p.accountKeySha256&&s.fixture_manifest_sha256===p.fixtureManifestSha256&&typeof s.closed_at==='string');assert(s.submission_id===null||typeof s.submission_id==='string'&&/^[a-f0-9-]{36}$/.test(s.submission_id));submission=s.submission_id;}});
  await attempt('parent-readback',async()=>{const rows=await get('gelato_engineering_submission_windows',{select:'root_order_id,account_key_sha256,fixture_manifest_sha256,child_order_ids,closed_at',root_order_id:'eq.'+p.rootOrderId});assert(Array.isArray(rows)&&rows.length<=1);if(rows.length){const w=rows[0];assert(w.root_order_id===p.rootOrderId&&w.account_key_sha256===p.accountKeySha256&&w.fixture_manifest_sha256===p.fixtureManifestSha256&&typeof w.closed_at==='string');assert.deepEqual(w.child_order_ids,identity.p_child_order_ids);}});
  if(submission!==null)await attempt('registration-readback',async()=>{const rows=await get('gelato_scheduled_status',{select:'submission_id,engineering_scope_id,account_key_sha256,enabled,lease_token,lease_expires_at',submission_id:'eq.'+submission});assert(Array.isArray(rows)&&rows.length<=1);if(rows.length){const j=rows[0];assert(j.submission_id===submission&&j.engineering_scope_id===p.scopeId&&j.account_key_sha256===p.accountKeySha256&&j.enabled===false&&j.lease_token===null&&j.lease_expires_at===null);}});
  await attempt('controls-readback',async()=>{const r=await request(infrastructure,'GET',{Authorization:'Bearer '+c.credentials.cloudflare}),serving=r.result?.canonical_deployment;assert(r.success===true&&serving?.id===b.deploymentId&&serving.url===b.deploymentOrigin&&serving.deployment_trigger?.metadata?.commit_hash===p.sourceSha);for(const vars of [r.result?.deployment_configs?.production?.env_vars,serving.env_vars])assert(vars&&NORMAL_FLAGS.every(k=>vars[k]?.value==='false'));});
  await attempt('dispatch-gate',async()=>{const rows=await get('print_provider_dispatch_gates',{select:'enabled',provider:'eq.gelato'});assert(Array.isArray(rows)&&rows.length===1&&rows[0].enabled===false);});
  await attempt('release-gate',async()=>{const rows=await get('gelato_ordinary_release_gate',{select:'enabled',id:'eq.true'});assert(Array.isArray(rows)&&rows.length===1&&rows[0].enabled===false);});
  if(errors.length)throw Object.assign(Error('Setup settlement unconfirmed: '+errors.join(',')),{counters:counters()});
  return {confirmed:true,scopePermanentlyRevoked:true,scopeClosed:true,parentClosed:true,registrationDisabled:true,leaseCleared:true,workflowsInactive:true,allSixControlsOff:true,bothGatesOff:true,customerMessages:false,...counters()};
 }
 return {cleanup,counters};
}
export type SetupCleanup=ReturnType<typeof createSetupCleanup>;
/** Single state transition arbitrates retirement vs deadline/owner-loss. No process can kill cleanup as a successful retirement. */
export function setupMonitor(adapter:Pick<SetupCleanup,'cleanup'|'counters'>,deadline:number,now:()=>number=Date.now){
 let state:'armed'|'cleaning'|'closed'|'failed'|'retired'='armed';let result:unknown,pending:Promise<unknown>|undefined;
 function close(){if(pending)return pending;if(state==='retired')return Promise.resolve(result);state='cleaning';pending=adapter.cleanup().then(r=>{state='closed';result={kind:'closed',result:r};return result;},()=>{state='failed';result={kind:'failed',counters:adapter.counters()};return result;});return pending;}
 return {state:()=>state,tick:()=>now()>=deadline?close():Promise.resolve(null),ownerExited:close,
  retire:()=>{if(state==='armed'&&now()<deadline){state='retired';result={kind:'retired',counters:adapter.counters()};return Promise.resolve(result);}return close();}};
}
