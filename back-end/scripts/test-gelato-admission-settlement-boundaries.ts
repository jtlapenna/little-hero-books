import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {LocalPreviewDatabase,quote} from '../../scripts/testing/local-preview-database';
import {setup,apply,fixture,seed,admission,revocation,closed,type Fixture} from './test-gelato-admission-settlement';
const db=new LocalPreviewDatabase();
const passes:string[]=[];const mark=(s:string)=>{passes.push(s);console.log('PASS '+s)};
function reject(sql:string,why:RegExp){try{db.sql(sql);assert.fail('SQL unexpectedly accepted')}catch(e:any){assert.match(String(e.stderr||e.message),why);}}
function bind(f:Fixture,owner:string|null=f.scope,account=f.account){const sid=randomUUID();db.sql(`INSERT INTO public.print_provider_submissions(id,provider,order_reference_id,workflow_job_idempotency_key,logical_group,root_order_id,claim_token,lease_expires_at,request_state) VALUES(${quote(sid)},'gelato',${quote(sid)},${quote(sid)},${quote(sid)},${quote(f.root)},gen_random_uuid(),clock_timestamp(),'submitted'); INSERT INTO public.print_provider_submission_items(submission_id,item_reference_id,child_order_id,child_order_key) VALUES(${quote(sid)},${quote(sid)},${f.ids[0]},${quote(f.packet.members[0].orderId)}); SET ROLE service_role; UPDATE public.gelato_isolation_scopes SET submission_id=${quote(sid)} WHERE id=${quote(f.scope)}; INSERT INTO public.gelato_scheduled_status(submission_id,engineering_scope_id,account_key_sha256,enabled,lease_token,lease_expires_at) VALUES(${quote(sid)},${owner===null?'NULL':quote(owner)},${quote(account)},true,gen_random_uuid(),clock_timestamp()+interval '1 minute')`);return sid;}
async function main(){try{setup(db);apply(db);
{
const f=fixture();f.packet.expiresAt=new Date(Date.now()+2500).toISOString();seed(db,f);db.sql(admission(f));const sid=bind(f);await sleep(2800);assert.equal(db.sql(`SELECT expires_at<clock_timestamp() FROM public.gelato_isolation_scopes WHERE id=${quote(f.scope)}`),'t');db.sql(revocation(f));closed(db,f);assert.equal(db.sql(`SELECT NOT enabled AND lease_token IS NULL AND lease_expires_at IS NULL FROM public.gelato_scheduled_status WHERE submission_id=${quote(sid)}`),'t');db.sql(revocation(f));mark('Expired admitted scope closes exact owned registration and lease; repeated revoke succeeds');
}
{
const f=fixture();seed(db,f);db.sql(admission(f));const sid=bind(f,null);reject(revocation(f),/Registration ownership differs/);assert.equal(db.sql(`SELECT closed_at IS NULL FROM public.gelato_isolation_scopes WHERE id=${quote(f.scope)}`),'t');assert.equal(db.sql(`SELECT closed_at IS NULL FROM public.gelato_engineering_submission_windows WHERE root_order_id=${quote(f.root)}`),'t');assert.equal(db.sql(`SELECT enabled AND lease_token IS NOT NULL FROM public.gelato_scheduled_status WHERE submission_id=${quote(sid)}`),'t');assert.equal(db.sql(`SELECT count(*) FROM public.gelato_admission_revocations WHERE scope_id=${quote(f.scope)}`),'0');mark('Foreign registration rejects and rolls back inherited close, parent close, and tombstone atomically');
}
{
const f=fixture();seed(db,f);db.sql(admission(f));const sid=bind(f,f.scope,'d'.repeat(64));reject(revocation(f),/Registration ownership differs/);assert.equal(db.sql(`SELECT enabled AND lease_token IS NOT NULL FROM public.gelato_scheduled_status WHERE submission_id=${quote(sid)}`),'t');mark('Foreign registration account rejects without clearing foreign lease');
}
{
const a=fixture(),b=fixture();seed(db,a);seed(db,b);db.sql(admission(a));reject(revocation(b,{p_scope_id:a.scope}),/Admitted identity differs/);assert.equal(db.sql(`SELECT closed_at IS NULL FROM public.gelato_isolation_scopes WHERE id=${quote(a.scope)}`),'t');db.sql(revocation(b));reject(revocation(a,{p_scope_id:b.scope}),/Revocation identity differs/);db.sql(revocation(a));closed(db,a);closed(db,b);mark('Existing scope UUID with foreign root and revoked UUID with admitted foreign root both reject');
}
{
const a=fixture(),b=fixture();seed(db,a);seed(db,b);const s1=await db.openSession(),s2=await db.openSession();try{await s1.query('BEGIN;'+revocation(a));let outcome='pending';const r=s2.query(revocation(b,{p_scope_id:a.scope})).then(()=>{outcome='accepted'},e=>{assert.match(String(e),/Revocation identity differs/);outcome='rejected'});await sleep(100);assert.equal(outcome,'pending');await s1.query('COMMIT');await r;assert.equal(outcome,'rejected');closed(db,a);assert.equal(db.sql(`SELECT count(*) FROM public.gelato_admission_revocations WHERE root_order_id=${quote(b.root)}`),'0');mark('Different-root concurrent cleanup serializes on shared UUID then rejects rebinding');}finally{await Promise.all([s1.close(),s2.close()])}
}
{
const f=fixture();seed(db,f);const s1=await db.openSession(),s2=await db.openSession();try{await s1.query(`SET ROLE service_role; BEGIN;SELECT pg_advisory_xact_lock(hashtextextended(${quote('gelato-root:'+f.root)},0))`);let result='pending';const insert=`SET ROLE service_role; INSERT INTO public.gelato_engineering_submission_windows(root_order_id,child_order_ids,opened_at,expires_at,account_key_sha256,fixture_manifest_sha256,evidence_run_id) VALUES(${quote(f.root)},ARRAY[${f.ids.join(',')}],clock_timestamp(),clock_timestamp()+interval '10 minutes',${quote(f.account)},${quote(f.manifest)},'DIRECT-TRIGGER-PROBE')`;const pending=s2.query(insert).then(()=>{result='accepted'},e=>{assert.match(String(e),/Admission permanently revoked/);result='rejected'});await sleep(100);assert.equal(result,'pending');await s1.query(revocation(f)+';COMMIT');await pending;assert.equal(result,'rejected');closed(db,f);mark('Direct INSERT already inside BEFORE trigger sees fence committed after original command snapshot');}finally{await Promise.all([s1.close(),s2.close()])}
}
console.log(JSON.stringify({passed:true,checks:passes}));}finally{db.close()}}
void main().catch(e=>{console.error(e);process.exitCode=1});
