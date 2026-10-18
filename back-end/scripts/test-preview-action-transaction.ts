import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { LocalPreviewDatabase, quote } from '../../scripts/testing/local-preview-database';

async function main() {
 const db=new LocalPreviewDatabase(); let checks=0;
 Object.assign(process.env,{SUPABASE_URL:'https://preview-transaction.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-preview-service'});
 const original=globalThis.fetch; globalThis.fetch=async()=>{throw Error('No real network')};
 try {
  db.start(resolve('..'));
  const { PREVIEW_ACTION_SNAPSHOT_FIELDS } = await import('../src/lib/customer-preview-access');
  const expected=()=>Object.fromEntries(PREVIEW_ACTION_SNAPSHOT_FIELDS.map(k=>[k,db.row()[k]??null]));
  const changes={customer_approval_status:'approved',next_workflow:'4',execution_status:'ready_for_processing',workflow_step:'customer_approval',current_workflow:null,started_at:null,human_approved:true};
  const call=(token='local-preview-link-A',snapshot=expected(),action='approve',patch:Record<string,unknown>=changes,limit:number|null=1)=>`SET ROLE service_role; SELECT public.commit_customer_preview_action(1,${quote(token)},${quote(JSON.stringify(snapshot))}::jsonb,${quote(action)},${quote(JSON.stringify(patch))}::jsonb,${limit===null?'NULL':limit});`;
  const check=(name:string,value:unknown)=>{assert(value,name);checks++};
  for(const role of ['anon','authenticated']) { db.reset(); assert.throws(()=>db.sql(`SET ROLE ${role}; SELECT public.commit_customer_preview_action(1,'x','{}','approve','{}')`)); checks++; }
  db.reset(); check('normal atomic approval',db.sql(call())==='t');check('token consumed',db.sql("SELECT used_at IS NOT NULL FROM preview_tokens WHERE token='local-preview-link-A'")==='t');check('row approved',db.row().customer_approval_status==='approved');
  for(const patch of ["current_workflow='3'","started_at=now()","execution_status='processing'","manifest_3_url=NULL","review_stages='{}'","workflow_step=NULL"]) {
   db.reset();db.sql('UPDATE orders SET '+patch);check('unready fails: '+patch,db.sql(call())==='f');check('unready token intact',db.sql('SELECT count(*) FROM preview_tokens WHERE used_at IS NOT NULL')==='0');
  }
  for(const alias of ['1','0001','LEGACY-ALIAS']) { db.reset();db.sql("UPDATE orders SET order_id='LEGACY-ALIAS'; UPDATE preview_tokens SET order_id="+quote(alias));check('exact resolver alias '+alias,db.sql(call())==='t'); }
  db.reset();db.sql('UPDATE orders SET revision_count=1');check('strict correction limit',db.sql(call('local-preview-link-A',expected(),'reject',{customer_approval_status:'revision_requested',revision_count:2}))==='f');check('explicit legacy nonstrict correction limit',db.sql(call('local-preview-link-A',expected(),'reject',{customer_approval_status:'revision_requested',revision_count:2},null))==='t');
  db.reset();const stale=expected();db.sql("UPDATE orders SET updated_at=updated_at+interval '1 second'");check('stale snapshot',db.sql(call('local-preview-link-A',stale))==='f');
  db.reset();db.sql("UPDATE preview_tokens SET expires_at=now()-interval '1 second'");check('expired',db.sql(call())==='f');
  db.reset();db.sql("UPDATE preview_tokens SET order_id='FOREIGN' WHERE token='local-preview-link-A'");check('foreign token',db.sql(call())==='f');
  db.reset();db.sql("CREATE FUNCTION public.inject_token_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic token persistence failure'; END $$; CREATE TRIGGER inject BEFORE UPDATE ON preview_tokens FOR EACH ROW EXECUTE FUNCTION public.inject_token_failure();");
  assert.throws(()=>db.sql(call()));check('row rollback',db.row().customer_approval_status==='pending');check('link rollback',db.sql('SELECT count(*) FROM preview_tokens WHERE used_at IS NOT NULL')==='0');db.sql('DROP TRIGGER inject ON preview_tokens');check('same link retry',db.sql(call())==='t');
  db.reset();const raceSnapshot=expected();const results=await Promise.all([db.sqlAsync(call('local-preview-link-A',raceSnapshot)),db.sqlAsync(call('local-preview-link-B',raceSnapshot,'reject',{customer_approval_status:'revision_requested',revision_count:1,next_workflow:null}))]);check('distinct links one winner',results.filter(x=>x==='t').length===1);check('only winning link consumed',db.sql('SELECT count(*) FROM preview_tokens WHERE used_at IS NOT NULL')==='1');
  db.reset();db.sql("INSERT INTO orders SELECT (jsonb_populate_record(NULL::orders,to_jsonb(o)||'{\"id\":2,\"orderId\":\"LOCAL-SIB-2\"}'::jsonb)).* FROM orders o WHERE id=1; INSERT INTO print_provider_submissions VALUES('11111111-1111-4111-8111-111111111111','gelato',NULL); UPDATE orders SET customer_approval_status='approved'; INSERT INTO print_provider_submission_items VALUES('11111111-1111-4111-8111-111111111111',1),('11111111-1111-4111-8111-111111111111',2); UPDATE orders SET customer_approval_status='pending' WHERE id=2;");
  assert.throws(()=>db.sql("UPDATE print_provider_submissions SET send_started_at=now()"));check('send remains unauthorized',db.sql('SELECT send_started_at IS NULL FROM print_provider_submissions')==='t');db.sql("UPDATE orders SET customer_approval_status='approved'");db.sql('UPDATE print_provider_submissions SET send_started_at=now()');check('all approved send authorization',db.sql('SELECT send_started_at IS NOT NULL FROM print_provider_submissions')==='t');
  console.log(JSON.stringify({passed:true,checks,disposablePostgres:true,liveRequests:0,scope:'Atomic preview action + current sibling approval send fence; no provider execution'}));
 } finally {globalThis.fetch=original;db.close();}
}
void main().catch(e=>{console.error(e);process.exitCode=1});
