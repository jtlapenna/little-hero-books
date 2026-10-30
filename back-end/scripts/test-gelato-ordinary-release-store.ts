/** Real disposable PostgreSQL, real production store/core, intercepted provider only. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {LocalPreviewDatabase,quote} from '../../scripts/testing/local-preview-database';
import {createOrdinaryReleaseFixture} from './helpers/gelato-ordinary-release-fixture';
import {createOrdinaryReleaseStore,registerReviewedOrdinaryRelease,reapExpiredOrdinaryRelease,reconcileStoredOrdinaryRelease} from '../src/lib/books/gelato-ordinary-release-store';
import {executeOrdinaryRelease,prepareOrdinaryRelease,ordinaryReleaseDigest} from '../src/lib/books/gelato-ordinary-release-core';
import {createGelatoSubmissionStore} from '../src/lib/books/gelato-submission-store';
import {AnyOrdinaryReleasePermitSchema} from '../src/lib/books/gelato-ordinary-release-core';
import {ESTIMATE_TEST_PRINT_POLICY,observeGelatoReleaseEstimate} from '../src/lib/books/gelato-release-estimate';

const root=path.resolve(__dirname,'../..'), db=new LocalPreviewDatabase();
const checks:string[]=[],mark=(name:string)=>{checks.push(name);console.log('PASS '+name);};
const json=(v:unknown)=>quote(JSON.stringify(v))+'::jsonb';
const service=(s:string)=>'SET ROLE service_role; '+s;
const value=(s:string)=>JSON.parse(db.sql(s));
const argTypes:Record<string,Record<string,string>>={
 register_gelato_ordinary_release:{p_permit:'jsonb',p_packet:'jsonb',p_actor:'text',p_evidence_sha256:'text'},
 acquire_gelato_ordinary_release:{p_id:'uuid',p_account_sha256:'text'},
 authorize_gelato_ordinary_release:{p_id:'uuid',p_token:'uuid',p_packet_sha256:'text'},
 finish_gelato_ordinary_release:{p_id:'uuid',p_token:'uuid',p_outcome:'text',p_orders:'jsonb'},
 reap_gelato_ordinary_release:{p_id:'uuid'},begin_gelato_ordinary_observation:{p_id:'uuid',p_account_sha256:'text'},
};
let loseAck='';const calls:string[]=[];
const localTransport:typeof fetch=async(input,init)=>{
 const request=new Request(input,init),url=new URL(request.url);
 assert.equal(url.origin,'https://disposable.invalid');
 try{
  if(url.pathname.startsWith('/rest/v1/rpc/')){
   assert.equal(request.method,'POST');const name=url.pathname.split('/').pop()!,types=argTypes[name];assert(types,'RPC allowlist');
   const p=await request.json();assert.deepEqual(Object.keys(p).sort(),Object.keys(types).sort());calls.push(name);
   const args=Object.entries(p).map(([k,v])=>k+'=>'+(v===null?'NULL':types[k]==='jsonb'?json(v):quote(v))+'::'+types[k]).join(',');
   const result=await db.sqlAsync(service('SELECT to_jsonb(public.'+name+'('+args+'))'));
   if(loseAck===name){loseAck='';throw Error('Synthetic committed acknowledgement lost');}
   return Response.json(JSON.parse(result));
  }
  assert.equal(request.method,'GET');const table=url.pathname.split('/').pop()!;
  assert(['print_provider_submissions','print_provider_submission_items','print_provider_submission_orders','print_provider_submission_notifications'].includes(table));
  const id=url.searchParams.get('id'),sid=url.searchParams.get('submission_id');assert(Boolean(id)!==Boolean(sid));
  const filter=id??sid;assert(typeof filter==='string'&&filter.startsWith('eq.')); const where=(id?'id':'submission_id')+'='+quote(filter.slice(3))+'::uuid';
  const rows=JSON.parse(await db.sqlAsync(service('SELECT coalesce(jsonb_agg(to_jsonb(t)),\'[]\'::jsonb) FROM public.'+table+' t WHERE '+where)));
  if(table==='print_provider_submission_items')rows.sort((a:{child_order_id:number},b:{child_order_id:number})=>a.child_order_id-b.child_order_id);
  return Response.json((request.headers.get('accept')??'').includes('object')?rows[0]:rows);
 }catch(error){console.error('Local transport rejection:',String(error).match(/\nERROR: ([^\n]+)/)?.[1]??'Local transport acknowledgement failed');return Response.json({message:error instanceof Error?error.message:'Local SQL rejected',code:'LOCAL_TEST'},{status:503});}
};
const database=createClient('https://disposable.invalid','synthetic-local-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:localTransport}});
const store=createOrdinaryReleaseStore(database), loader=createGelatoSubmissionStore(database);
let offset=1000;
function insert(table:string,row:Record<string,unknown>){
 assert(['orders','print_provider_submissions','print_provider_submission_items','print_provider_submission_orders'].includes(table));
 const columns=new Set<string>(value('SELECT jsonb_agg(column_name) FROM information_schema.columns WHERE table_schema=\'public\' AND table_name='+quote(table)));
 const selected=Object.keys(row).filter(k=>columns.has(k));
 const names=selected.map(k=>'"'+k+'"').join(',');
 db.sql('INSERT INTO public.'+table+'('+names+') SELECT '+names+' FROM jsonb_populate_record(NULL::public.'+table+','+json(row)+')');
}
type Fixture=Awaited<ReturnType<typeof createOrdinaryReleaseFixture>>;
async function fresh(format:'standard'|'amazon'='standard',children=1,quantity=1,nestedQuantity=false){
 offset+=10;const x=await createOrdinaryReleaseFixture(format,children,new Date(),offset,quantity,nestedQuantity);
 x.f.context.submission.workflow_job_idempotency_key='local-job-'+offset;
 for(const row of x.f.rows.values())insert('orders',{...row,print_submission_id:null,print_claim_token:null});
 insert('print_provider_submissions',{...x.f.context.submission,logical_group:x.f.context.submission.root_order_id});
 for(const order of x.f.context.providerOrders)insert('print_provider_submission_orders',{...order,provider:'gelato',submission_id:x.permit.submissionId});
 for(const item of x.f.context.members)insert('print_provider_submission_items',item);
 for(const row of x.f.rows.values())db.sql('UPDATE public.orders SET print_submission_id='+quote(x.permit.submissionId)+'::uuid,print_claim_token='+quote(row.print_claim_token)+'::uuid WHERE id='+row.id);
 x.d.budgetMs=30000;x.d.context=id=>loader.load(id);x.d.order=async key=>value('SELECT to_jsonb(o) FROM public.orders o WHERE "orderId"='+quote(key));
 x.d.enabled=async()=>value(service('SELECT to_jsonb(enabled) FROM public.gelato_ordinary_release_gate WHERE id'));
 x.d.store={...store,authorizeSend:async(...args)=>{const result=await store.authorizeSend(...args);if(result)x.setTransportSending();return result;}};
 return x;
}
async function approval(x:Fixture,override?:Record<string,unknown>){
 const permit={...x.permit,...override};const prepared=await prepareOrdinaryRelease(permit,x.d,AbortSignal.timeout(30000));permit.packetSha256=prepared.packetSha256;
 await registerReviewedOrdinaryRelease(database,{permit,packet:prepared.packet,actor:'local-test-reviewer',approvalEvidenceSha256:'a'.repeat(64)});return {permit,packet:prepared.packet};
}
function enabled(v:boolean){db.sql(service('UPDATE public.gelato_ordinary_release_gate SET enabled='+v));}
function row(id:string){return value('SELECT to_jsonb(a) FROM public.gelato_ordinary_release_permits a WHERE id='+quote(id)+'::uuid');}
function ledger(x:Fixture){return value('SELECT to_jsonb(r) FROM public.gelato_ordinary_release_roots r WHERE provider_order_id='+quote(x.permit.providerOrderId));}
function expire(id:string){
 // Test-only superuser fault injection into this disposable cluster, never application authority.
 db.sql('BEGIN; SET LOCAL session_replication_role=replica; UPDATE public.gelato_ordinary_release_permits SET lease_expires_at=clock_timestamp()-interval \'1 second\' WHERE id='+quote(id)+'::uuid; COMMIT;');
}
async function main(){
 globalThis.fetch=async()=>{throw Error('Global external access forbidden');};
 db.start(root,true);
 db.sql('ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS quantity integer,ADD COLUMN IF NOT EXISTS shipping_tier text,ADD COLUMN IF NOT EXISTS customer_email text,ADD COLUMN IF NOT EXISTS customer_name text');
 // Existing service clients can update orders; row locks need UPDATE on at least one column.
 db.sql('GRANT UPDATE(id) ON public.orders TO service_role');
 const legacy=db.sql('SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o');
 await fresh();
 const populated=db.sql('SELECT jsonb_build_object(\'submissions\',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.print_provider_submissions s),\'members\',(SELECT jsonb_agg(to_jsonb(i) ORDER BY child_order_id) FROM public.print_provider_submission_items i),\'roots\',(SELECT jsonb_agg(to_jsonb(o) ORDER BY provider_order_id) FROM public.print_provider_submission_orders o))');
 const ordersBefore=db.sql('SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o');
 const migration=readFileSync(path.join(root,'database/20261019081857_gelato_ordinary_release_store.sql'),'utf8');db.sql(migration);db.sql(migration);
 const estimateMigration=readFileSync(path.join(root,'database/20261030035034_gelato_disclosed_estimate_release.sql'),'utf8');db.sql(estimateMigration);db.sql(estimateMigration);
 assert.equal(db.sql('SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o'),ordersBefore);
 assert.equal(db.sql('SELECT jsonb_build_object(\'submissions\',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.print_provider_submissions s),\'members\',(SELECT jsonb_agg(to_jsonb(i) ORDER BY child_order_id) FROM public.print_provider_submission_items i),\'roots\',(SELECT jsonb_agg(to_jsonb(o) ORDER BY provider_order_id) FROM public.print_provider_submission_orders o))'),populated);
 assert.equal(db.sql('SELECT count(*) FROM public.gelato_ordinary_release_permits'),'0');
 assert.equal(await store.acquire(randomUUID(),'a'.repeat(64),new Date().toISOString()).then(r=>r.kind),'disabled');
 mark('idempotent additive migration, populated legacy orders/submissions unchanged, empty OFF gate before lookup');
 for(const role of ['anon','authenticated']){
  for(const table of ['gate','roots','permits'])assert.throws(()=>db.sql('SET ROLE '+role+'; SELECT * FROM public.gelato_ordinary_release_'+table));
  assert.throws(()=>db.sql('SET ROLE '+role+'; SELECT public.acquire_gelato_ordinary_release(gen_random_uuid(),repeat(\'a\',64))'));
 }
 assert.equal(db.sql("SELECT count(*) FROM pg_class WHERE relname LIKE 'gelato_ordinary_release_%' AND relkind='r' AND NOT relrowsecurity"),'0');
 assert.equal(db.sql("SELECT count(*) FROM pg_proc WHERE proname IN("+Object.keys(argTypes).map(quote).join(',')+") AND prosecdef"),'0');
 mark('anonymous/authenticated denied; RLS on; service RPCs invoker rights');
 enabled(true);
 for(const [format,children,label]of [['standard',1,'website W4'],['amazon',1,'Amazon W4'],['amazon',2,'Amazon siblings W4.1']] as const){
  const x=await fresh(format,children);await approval(x);
  const result=await executeOrdinaryRelease(x.permit.id,x.d);assert.deepEqual(result,{state:'converted',providerMutationAttempted:true,persistenceConfirmed:true});
  assert.equal(row(x.permit.id).state,'converted');assert(ledger(x).consumed_at);assert.equal(x.stats().patches,1);
  assert.equal((await executeOrdinaryRelease(x.permit.id,x.d)).state,'already_attempted');assert.equal(x.stats().patches,1);x.assertClean();
  mark(label+' real SQL store/core path, one intercepted PATCH, replay blocked');
 }
 {
  const x=await fresh('standard',1,2,true);await approval(x);assert.equal((await executeOrdinaryRelease(x.permit.id,x.d)).state,'converted');assert.equal(x.stats().patches,1);mark('canonical nested quantity two accepted by SQL and release review');
 }
 for(const info of [{quantity:null},JSON.stringify({quantity:null})]){
  const x=await fresh();db.sql('UPDATE public.orders SET quantity=NULL,product_info='+json(info)+' WHERE id='+x.permit.artifacts[0].childOrderId);await approval(x);assert.equal((await executeOrdinaryRelease(x.permit.id,x.d)).state,'converted');assert.equal(x.stats().patches,1);
 }
 mark('canonical object/string nested JSON-null quantities default to one');
 {
  const x=await fresh();await approval(x);const results=await Promise.all([executeOrdinaryRelease(x.permit.id,x.d),executeOrdinaryRelease(x.permit.id,x.d)]);
  assert.equal(results.filter(r=>r.state==='converted').length,1);assert.equal(x.stats().patches,1);assert.equal(row(x.permit.id).state,'converted');
  mark('two concurrent workers, same permit: one durable owner and one PATCH');
 }
 {
  const x=await fresh();await approval(x);const second=await approval(x,{id:randomUUID()});
  const results=await Promise.all([executeOrdinaryRelease(x.permit.id,x.d),executeOrdinaryRelease(second.permit.id,x.d)]);
  assert.equal(results.filter(r=>r.state==='converted').length,1);assert.equal(x.stats().patches,1);assert(ledger(x).consumed_at);
  assert.equal((await store.acquire(second.permit.id,x.permit.accountSha256,new Date().toISOString())).kind,'already_attempted');
  mark('two independently approved permits for same provider root: one PATCH across approvals');
 }
 {
  const x=await fresh();const y=await fresh('amazon',2);await approval(x);await approval(y);
  assert((await Promise.all([executeOrdinaryRelease(x.permit.id,x.d),executeOrdinaryRelease(y.permit.id,y.d)])).every(r=>r.state==='converted'));
  assert.equal(x.stats().patches,1);assert.equal(y.stats().patches,1);mark('independent roots progress concurrently');
 }
 for(const field of ['quotedAt','requestFingerprint','totalCents','taxesCents']){
  const x=await fresh();const prepared=await prepareOrdinaryRelease(x.permit,x.d,AbortSignal.timeout(30000));
  const packet=structuredClone(prepared.packet);assert(packet.version===2);delete (packet.payable as Record<string,unknown>)[field];
  const permit={...x.permit,packetSha256:ordinaryReleaseDigest(packet)};
  await assert.rejects(registerReviewedOrdinaryRelease(database,{permit,packet,actor:'local-reviewer',approvalEvidenceSha256:'a'.repeat(64)}));
  assert.equal(db.sql('SELECT count(*) FROM public.gelato_ordinary_release_permits WHERE id='+quote(permit.id)+'::uuid'),'0');
 }
 mark('missing payable date, binding fingerprint, taxes or total rejected atomically');
 for(const [column,change]of [['customer_name',quote('Changed recipient')],['customer_approval_status',quote('revision_requested')],['shipping_tier',quote('express')]] as const){
  const x=await fresh();await approval(x);const owned=await store.acquire(x.permit.id,x.permit.accountSha256,new Date().toISOString());assert.equal(owned.kind,'acquired');if(owned.kind!=='acquired')throw Error('owner');
  db.sql('UPDATE public.orders SET '+column+'='+change+' WHERE id='+x.permit.artifacts[0].childOrderId);
  await assert.rejects(store.authorizeSend(x.permit.id,owned.ownerToken,x.permit.packetSha256,new Date().toISOString()));
  assert.equal(ledger(x).consumed_at,null);assert.equal(row(x.permit.id).state,'preparing');assert.equal(x.stats().patches,0);
 }
 mark('current name, approval and shipping revocations roll back send authorization/root consumption');
 {
  const x=await fresh();await approval(x);const owner=await store.acquire(x.permit.id,x.permit.accountSha256,new Date().toISOString());assert.equal(owner.kind,'acquired');if(owner.kind!=='acquired')throw Error('owner');
  enabled(false);await assert.rejects(store.authorizeSend(x.permit.id,owner.ownerToken,x.permit.packetSha256,new Date().toISOString()));assert.equal(ledger(x).consumed_at,null);enabled(true);
  assert.throws(()=>db.sql(service('UPDATE public.gelato_ordinary_release_permits SET packet=\'{}\' WHERE id='+quote(x.permit.id)+'::uuid')));
  for(const lease of ['NULL',"'infinity'::timestamptz","clock_timestamp()+interval '1 day'"]){
   assert.throws(()=>db.sql(service('BEGIN; UPDATE public.gelato_ordinary_release_roots SET consumed_at=clock_timestamp() WHERE provider_order_id='+quote(x.permit.providerOrderId)+'; UPDATE public.gelato_ordinary_release_permits SET state=\'sending\',send_started_at=clock_timestamp(),lease_expires_at='+lease+' WHERE id='+quote(x.permit.id)+'::uuid; COMMIT;')));
   assert.equal(ledger(x).consumed_at,null);
  }
  mark('OFF revocation, immutable packet, NULL/infinite/overlong direct-DML leases rejected');
 }
 {
  const x=await fresh();await approval(x);loseAck='acquire_gelato_ordinary_release';const result=await executeOrdinaryRelease(x.permit.id,x.d);
  assert.equal(result.providerMutationAttempted,false);assert.equal(row(x.permit.id).state,'preparing');assert.equal((await executeOrdinaryRelease(x.permit.id,x.d)).state,'busy');
  const old=row(x.permit.id).owner_token;expire(x.permit.id);assert.equal(await reapExpiredOrdinaryRelease(database,x.permit.id),true);
  assert.equal(await store.finish(x.permit.id,old,'converted',[]),false);assert.equal(ledger(x).owner_permit_id,null);
  const second=await approval(x,{id:randomUUID()});assert.equal((await executeOrdinaryRelease(second.permit.id,x.d)).state,'converted');assert.equal(x.stats().patches,1);
  mark('lost acquire acknowledgement: held, expired preparation fenced; new approval can send once');
 }
 {
  const x=await fresh();await approval(x);loseAck='authorize_gelato_ordinary_release';const result=await executeOrdinaryRelease(x.permit.id,x.d);
  assert.equal(result.providerMutationAttempted,false);assert.equal(row(x.permit.id).state,'outcome_unknown');assert(ledger(x).consumed_at);assert.equal(x.stats().patches,0);
  enabled(false);const observation=await reconcileStoredOrdinaryRelease(database,x.permit.id,x.d);assert.equal(observation.state,'outcome_unknown');assert.equal(observation.persistenceConfirmed,true);
  enabled(true);assert.equal((await executeOrdinaryRelease(x.permit.id,x.d)).state,'already_attempted');assert.equal(x.stats().patches,0);
  mark('lost durable-send acknowledgement consumes permit; OFF read-only draft observation never retries');
 }
 {
  const x=await fresh();await approval(x);const a=await store.acquire(x.permit.id,x.permit.accountSha256,new Date().toISOString());assert.equal(a.kind,'acquired');if(a.kind!=='acquired')throw Error('owner');
  assert.equal(await store.authorizeSend(x.permit.id,a.ownerToken,x.permit.packetSha256,new Date().toISOString()),true);
  assert.equal((await reconcileStoredOrdinaryRelease(database,x.permit.id,x.d)).state,'busy');
  expire(x.permit.id);assert.equal(await reapExpiredOrdinaryRelease(database,x.permit.id),true);assert.equal(await store.finish(x.permit.id,a.ownerToken,'outcome_unknown'),false);
  x.convertExternally();enabled(false);const observed=await reconcileStoredOrdinaryRelease(database,x.permit.id,x.d);assert.equal(observed.state,'converted');assert.equal(observed.persistenceConfirmed,true);
  assert.equal(row(x.permit.id).state,'converted');assert.equal(x.stats().patches,0);enabled(true);
  mark('crashed sender fenced, active sender protected, expired OFF observer records conversion without PATCH');
 }
 {
  const x=await fresh();await approval(x);x.setFault('readback');const sent=await executeOrdinaryRelease(x.permit.id,x.d);assert.equal(sent.state,'outcome_unknown');assert.equal(x.stats().patches,1);
  x.setFault('');enabled(false);assert.equal((await reconcileStoredOrdinaryRelease(database,x.permit.id,x.d)).state,'converted');assert.equal(x.stats().patches,1);enabled(true);
  mark('provider accepted but readback lost: durable unknown then read-only recovery, no second send');
 }
 {
  const x=await fresh();await approval(x);loseAck='finish_gelato_ordinary_release';const result=await executeOrdinaryRelease(x.permit.id,x.d);assert.equal(result.state,'converted');assert.equal(result.persistenceConfirmed,false);assert.equal(row(x.permit.id).state,'converted');assert.equal((await executeOrdinaryRelease(x.permit.id,x.d)).state,'already_attempted');assert.equal(x.stats().patches,1);mark('lost finish acknowledgement preserves committed closure across retries');
 }
 async function estimated(x:Fixture,maximum='2000'){
  const {maximumTotalCents:_legacyCap,...base}=x.permit;
  const permit=AnyOrdinaryReleasePermitSchema.parse({...base,pricingPolicy:ESTIMATE_TEST_PRINT_POLICY,maximumQuotedSubtotalCents:maximum});
  x.d.pricingPolicy=ESTIMATE_TEST_PRINT_POLICY;
  x.d.payableEvidence=async(raw,context)=>{assert(context);return observeGelatoReleaseEstimate(raw,context);};
  x.d.approvedPacket=async id=>value(service('SELECT packet FROM public.gelato_ordinary_release_permits WHERE id='+quote(id)+'::uuid'));
  x.setRefreshQuoteMetadata(true);
  const prepared=await prepareOrdinaryRelease(permit,x.d,AbortSignal.timeout(30000));permit.packetSha256=prepared.packetSha256;
  assert(prepared.packet.version===3);return {permit,packet:prepared.packet};
 }
 const registerEstimate=async(x:Fixture,p:Awaited<ReturnType<typeof estimated>>)=>registerReviewedOrdinaryRelease(database,{
  permit:p.permit,packet:p.packet,actor:'local-estimate-reviewer',approvalEvidenceSha256:ordinaryReleaseDigest({approveExactOrder:true,acknowledgeFinalChargeMayDiffer:true,pricingPolicy:ESTIMATE_TEST_PRINT_POLICY,packetSha256:p.permit.packetSha256})});
 {
  const x=await fresh(),p=await estimated(x);await registerEstimate(x,p);
  const results=await Promise.all([executeOrdinaryRelease(p.permit.id,x.d),executeOrdinaryRelease(p.permit.id,x.d)]);
  assert.equal(results.filter(v=>v.state==='converted').length,1);assert.equal(x.stats().patches,1);assert.equal(row(p.permit.id).state,'converted');
  assert.equal(row(p.permit.id).packet.version,3);assert.equal(row(p.permit.id).packet.estimate.totalCents,null);
  assert.equal(row(p.permit.id).packet.estimate.providerChargeCapEnforced,false);assert(!('maximumTotalCents' in row(p.permit.id).permit));
  assert.equal((await executeOrdinaryRelease(p.permit.id,x.d)).state,'already_attempted');x.assertClean();
  mark('version3 acknowledged estimate, real SQL ownership/concurrency/closure, one intercepted PATCH and no replay');
 }
 for(const change of [{taxesCents:'0'},{totalCents:'1718'},{finalChargeMayDiffer:false},{providerChargeCapEnforced:true},{quotedSubtotalCents:'1719'}]){
  const x=await fresh(),p=await estimated(x);Object.assign(p.packet.estimate,change);p.permit.packetSha256=ordinaryReleaseDigest(p.packet);
  await assert.rejects(registerEstimate(x,p));assert.equal(db.sql('SELECT count(*) FROM public.gelato_ordinary_release_permits WHERE id='+quote(p.permit.id)+'::uuid'),'0');
 }
 mark('SQL refuses fabricated final costs, omitted disclosures, cap claims and invalid quoted-subtotal arithmetic');
 {
  const x=await fresh(),p=await estimated(x);await registerEstimate(x,p);x.setQuotePrices(1219,500);
  assert.equal((await executeOrdinaryRelease(p.permit.id,x.d)).state,'preflight_failed');assert.equal(x.stats().patches,0);
  assert.equal((await executeOrdinaryRelease(p.permit.id,x.d)).state,'already_attempted');
  mark('changed live-shaped product estimate cannot reuse persisted version3 approval');
 }
 {
  const x=await fresh(),p=await estimated(x);await registerEstimate(x,p);
  const owner=await store.acquire(p.permit.id,p.permit.accountSha256,new Date().toISOString());assert(owner.kind==='acquired');
  db.sql('UPDATE public.orders SET customer_approval_status=\'revision_requested\' WHERE id='+p.permit.artifacts[0].childOrderId);
  await assert.rejects(store.authorizeSend(p.permit.id,owner.ownerToken,p.permit.packetSha256,new Date().toISOString()));
  assert.equal(ledger(x).consumed_at,null);assert.equal(x.stats().patches,0);
  mark('version3 SQL send guard preserves current buyer approval and atomic root fencing');
 }
 {
  const x=await fresh(),p=await estimated(x);await registerEstimate(x,p);x.setFault('readback');
  assert.equal((await executeOrdinaryRelease(p.permit.id,x.d)).state,'outcome_unknown');assert.equal(x.stats().patches,1);
  x.setFault('');enabled(false);assert.equal((await reconcileStoredOrdinaryRelease(database,p.permit.id,x.d)).state,'converted');
  assert.equal(x.stats().patches,1);enabled(true);
  mark('version3 uncertain acceptance reconciles read-only with local gate OFF and no second PATCH');
 }
 enabled(false);assert.equal(db.sql('SELECT count(*) FROM public.print_provider_submission_notifications'),'0');
 assert.equal(db.sql('SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o WHERE id<=4'),legacy);
 mark('final local gate OFF, no notification intents, legacy rows intact');
 console.log(JSON.stringify({suite:'ordinary-release-disposable-postgres',postgres:db.sql('SHOW server_version'),checks,passed:checks.length,provider:'intercepted only',hostedDatabase:false,liveOrdersRead:0,liveOrdersWritten:0,normalControlsChanged:false,finalLocalGate:false}));
}
void main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.close());
