/** Actual disposable Postgres + canonical admission SQL. No URL/env/secret loading or business requests. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {LocalPreviewDatabase,quote} from '../../scripts/testing/local-preview-database';
import {prepareAdmissionSql} from './helpers/gelato-admission-sql';
const root=path.resolve(__dirname,'../..'),checks:string[]=[];
let seq=20000;const token='a'.repeat(64),account='b'.repeat(64),manifest='c'.repeat(64);
const j=(v:unknown)=>quote(JSON.stringify(v))+'::jsonb',mark=(s:string)=>{checks.push(s);console.log('PASS '+s);};
export type Fixture=ReturnType<typeof fixture>;
export function fixture(children=1){
 const scope=randomUUID(),r='TEST-GELATO-FENCE-'+scope.slice(0,8),ids=Array.from({length:children},()=>++seq);
 const packet={schema:'lhl.gelato-isolated-case@1',runId:'LOCAL-FENCE-'+scope,scopeId:scope,rootOrderId:r,sourceSha:'c9b939f6a25bda6fa1ee4090973cea2c924c5450',nativeDefinitionSha256:'d'.repeat(64),fixtureManifestSha256:manifest,accountKeySha256:account,
 startsAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),members:ids.map((id,i)=>({orderDbId:id,orderId:children===1?r:r+'-'+i,edition:children===1?'standard':'amazon',pdfSha256:createHash('sha256').update('SYNTHETIC-CHILD-'+id).digest('hex')}))};
 const address={name:'Synthetic Recipient',address_line_1:'1 Local Fixture Way',address_line_2:'',city:'Fixture',state_code:'CA',postal_code:'00000',country_code:'US',email:'fixture@example.test'};
 const c={label:children===1?'WEB':'SIB',packet,productUid:'confirmed-square-product',shippingTier:'standard',frozenAddress:address,contactEmail:address.email};
 return {scope,root:r,ids,packet,c,catalog:{cases:[c]},token,account,manifest};
}
export function seed(db:LocalPreviewDatabase,f:Fixture){for(const m of f.packet.members)db.sql(`INSERT INTO public.orders(id,"orderId",root_order_id,book_specs,print_provider,print_product_uid,product_info,shipping_tier,shipping_address,customer_email,print_config_version,print_inner_page_count,print_api_page_count,print_expected_pdf_page_count,execution_status,customer_approval_required,customer_approval_status) VALUES(${m.orderDbId},${quote(m.orderId)},${quote(f.root)},'{"testMode":true}','gelato',${quote(f.c.productUid)},'{"quantity":1}','standard',${j(f.c.frozenAddress)},'fixture@example.test',2,32,32,35,'done',true,'pending')`);}
export const admission=(f:Fixture)=>'SET ROLE service_role;'+prepareAdmissionSql({label:f.c.label,packet:f.packet},f.token,'SYNTHETIC HUMAN REVIEW ONLY',f.catalog);
export const identity=(f:Fixture)=>({p_scope_id:f.scope,p_root_order_id:f.root,p_token_sha256:f.token,p_account_key_sha256:f.account,p_fixture_manifest_sha256:f.manifest,p_child_order_ids:f.ids});
export const revocation=(f:Fixture,patch:Record<string,unknown>={})=>{const p={...identity(f),...patch};return 'SET ROLE service_role; SELECT public.revoke_gelato_admission('+Object.entries(p).map(([k,v])=>k+'=>'+(Array.isArray(v)?'ARRAY['+v.join(',')+']::bigint[]':quote(v))).join(',')+')';};
export function setup(db:LocalPreviewDatabase){
 db.start(root,true);db.sql('GRANT SELECT,UPDATE ON public.orders TO service_role; ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email text,ADD COLUMN IF NOT EXISTS shipping_tier text');
 for(const file of ['database/20261019081857_gelato_ordinary_release_store.sql','database/20261020011248_gelato_engineering_isolation.sql'])db.sql(readFileSync(path.join(root,file),'utf8'));
}
export function apply(db:LocalPreviewDatabase){const files=readdirSync(path.join(root,'database')).filter(n=>n.endsWith('_gelato_admission_settlement.sql'));assert.equal(files.length,1);db.sql(readFileSync(path.join(root,'database',files[0]),'utf8'));}
export function closed(db:LocalPreviewDatabase,f:Fixture){
 assert.equal(db.sql('SELECT count(*) FROM public.gelato_admission_revocations WHERE scope_id='+quote(f.scope)+' AND root_order_id='+quote(f.root)),'1');
 assert.equal(db.sql('SELECT count(*) FROM public.gelato_isolation_scopes WHERE root_order_id='+quote(f.root)+' AND closed_at IS NULL'),'0');
 assert.equal(db.sql('SELECT count(*) FROM public.gelato_engineering_submission_windows WHERE root_order_id='+quote(f.root)+' AND closed_at IS NULL'),'0');
}
async function main(){const db=new LocalPreviewDatabase();function rejectSQL(sql:string,why:RegExp){try{db.sql(sql);assert.fail('SQL unexpectedly accepted');}catch(e:any){assert.match(String(e.stderr||e.message),why);}}
try{
 setup(db);
 const before=fixture();seed(db,before);assert.throws(()=>db.sql('SET ROLE service_role; SELECT public.close_gelato_isolation_scope('+quote(before.scope)+','+quote(before.token)+')'));
 db.sql(admission(before));assert.equal(db.sql('SELECT count(*) FROM public.gelato_isolation_scopes WHERE closed_at IS NULL'),'1');db.sql('SET ROLE service_role; SELECT public.close_gelato_isolation_scope('+quote(before.scope)+','+quote(before.token)+')');mark('Original SQL reproduces cleanup-before-admission race');
 apply(db);apply(db);mark('Candidate applies twice without enrolling or reopening authority');
 for(let i=900000;i<900006;i++)db.sql(`INSERT INTO public.orders(id,"orderId",book_specs,execution_status) VALUES(${i},'SYNTHETIC-EXCLUDED-${i}','{"testMode":false}','done')`);
 const sentinel=()=>db.sql("SELECT md5(jsonb_agg(to_jsonb(o) ORDER BY id)::text) FROM public.orders o WHERE id>=900000"),initial=sentinel();
 for(const n of [1,2]){const f=fixture(n);seed(db,f);db.sql(revocation(f));closed(db,f);rejectSQL(admission(f),/Admission permanently revoked/);closed(db,f);assert.equal(db.sql("SELECT bool_and(customer_approval_status='pending' AND NOT coalesce(human_approved,false)) FROM public.orders WHERE id=ANY(ARRAY["+f.ids.join(',')+'])'),'t');db.sql(revocation(f));closed(db,f);mark('Revocation first permanently rejects delayed canonical admission '+n+' children');}
 for(const n of [1,2]){const f=fixture(n);seed(db,f);db.sql(admission(f));db.sql(revocation(f));closed(db,f);rejectSQL(admission(f),/Fresh held fixture differs; do not replay or repair/);mark('Admission first is closed once and cannot replay '+n+' children');}
 {
 const f=fixture();seed(db,f);const a=await db.openSession(),b=await db.openSession();try{
 await a.query(admission(f).replace(/COMMIT;\s*$/,'')+';');let done=false;const revoke=b.query(revocation(f)).then(v=>{done=true;return v;});await sleep(75);assert(!done);await a.query('COMMIT');await revoke;closed(db,f);mark('Actual revocation waits for pending admission commit then closes it');
 }finally{await Promise.all([a.close(),b.close()]);}}
 {
 const f=fixture();seed(db,f);const a=await db.openSession(),b=await db.openSession();try{
 await a.query('SET ROLE service_role; BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('+quote('gelato-root:'+f.root)+',0))');let admitted=false;const delayed=b.query(admission(f)).then(()=>{admitted=true;},()=>{});await sleep(75);assert(!admitted);await a.query(revocation(f)+'; COMMIT');await delayed;assert(!admitted);closed(db,f);mark('Admission already waiting on root lock sees committed revocation and rolls back');
 }finally{await Promise.all([a.close(),b.close()]);}}
 {
 const f=fixture();seed(db,f);const a=await db.openSession(),b=await db.openSession();try{await a.query(admission(f).replace(/COMMIT;\s*$/,''));const r=b.query(revocation(f));await sleep(50);await a.query('ROLLBACK');await r;closed(db,f);assert.equal(db.sql('SELECT customer_approval_status FROM public.orders WHERE id='+f.ids[0]),'pending');mark('Admission rollback/lost setup leaves durable revocation and pending fixture');}finally{await Promise.all([a.close(),b.close()]);}}
 {
 const f=fixture();seed(db,f);db.sql(admission(f));for(const patch of [{p_token_sha256:'d'.repeat(64)},{p_account_key_sha256:'d'.repeat(64)},{p_fixture_manifest_sha256:'d'.repeat(64)},{p_scope_id:randomUUID()},{p_root_order_id:'TEST-GELATO-FOREIGN'},{p_child_order_ids:[999999]}])rejectSQL(revocation(f,patch),/Admitted identity differs|Parent identity differs|Invalid exact admission identity/);assert.equal(db.sql('SELECT count(*) FROM public.gelato_admission_revocations WHERE root_order_id='+quote(f.root)),'0');db.sql(revocation(f));closed(db,f);mark('Existing scope rejects foreign token/account/fixture/root/UUID/membership without side effects');
 for(const patch of [{p_token_sha256:'d'.repeat(64)},{p_account_key_sha256:'d'.repeat(64)},{p_fixture_manifest_sha256:'d'.repeat(64)},{p_scope_id:randomUUID()},{p_root_order_id:'TEST-GELATO-FOREIGN'}])rejectSQL(revocation(f,patch),/Revocation identity differs/);mark('Durable fence cannot be rebound by a foreign identity');}
 {
 const f=fixture();seed(db,f);for(const patch of [{p_root_order_id:'ORDINARY-ROOT'},{p_child_order_ids:[]},{p_child_order_ids:[1,1]},{p_token_sha256:'bad'}])rejectSQL(revocation(f,patch),/Invalid exact admission identity/);db.sql("UPDATE public.orders SET book_specs='{\"testMode\":false}' WHERE id="+f.ids[0]);rejectSQL(revocation(f),/fresh exact synthetic fixtures/);mark('Malformed identity and non-test fixtures rejected before revocation');}
 {
 const f=fixture();seed(db,f);db.sql(revocation(f));for(const role of ['anon','authenticated']){assert.throws(()=>db.sql('SET ROLE '+role+';SELECT * FROM public.gelato_admission_revocations'));assert.throws(()=>db.sql(revocation(f).replace('SET ROLE service_role','SET ROLE '+role)));}assert.throws(()=>db.sql('SET ROLE service_role;DELETE FROM public.gelato_admission_revocations WHERE scope_id='+quote(f.scope)));assert.throws(()=>db.sql('SET ROLE service_role;UPDATE public.gelato_admission_revocations SET revoked_at=now()'));assert.throws(()=>db.sql('DELETE FROM public.gelato_admission_revocations WHERE scope_id='+quote(f.scope)));mark('RLS/grants and permanent tombstone prevent anonymous access or reopening');}
 {
 for(const isolation of ['REPEATABLE READ','SERIALIZABLE']){const f=fixture();seed(db,f);rejectSQL('BEGIN ISOLATION LEVEL '+isolation+';'+admission(f).replace('BEGIN;',''),/requires read committed settlement/);rejectSQL('BEGIN ISOLATION LEVEL '+isolation+';'+revocation(f)+';COMMIT',/requires read committed settlement/);}mark('Stale-snapshot isolation levels fail closed');}
 {
 const f=fixture();seed(db,f);const params={...identity(f)};const a=await db.openSession(),b=await db.openSession();try{await Promise.all([a.query(revocation(f)),b.query(revocation(f))]);closed(db,f);mark('Two cleanup workers settle one immutable fence idempotently');}finally{await Promise.all([a.close(),b.close()]);}}
 assert.equal(sentinel(),initial);assert.equal(db.sql("SELECT enabled FROM public.print_provider_dispatch_gates WHERE provider='gelato'"),'f');assert.equal(db.sql('SELECT enabled FROM public.gelato_ordinary_release_gate WHERE id=true'),'f');assert.equal(db.sql('SELECT count(*) FROM public.print_provider_submissions'),'0');assert.equal(db.sql('SELECT count(*) FROM public.print_provider_submission_notifications'),'0');mark('Six synthetic excluded rows unchanged; both gates OFF; no submissions or messages');
 console.log(JSON.stringify({passed:true,groups:checks.length,realDisposablePostgres:true,canonicalAdmissionProducer:true,hostedOrProviderCalls:0,realCredentialsRead:0,liveOrdersRead:0,checks}));
 }finally{db.close();}}
if(require.main===module)void main().catch(e=>{console.error(e);process.exitCode=1;});
