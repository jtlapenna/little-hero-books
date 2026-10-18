/** Run existing fulfillment SQL plus the new preview fences in a disposable database. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LocalPreviewDatabase } from '../../scripts/testing/local-preview-database';
const root=path.resolve('..'), db=new LocalPreviewDatabase();
try {
 db.start(root,true);
 const original=readFileSync(path.join(root,'back-end/scripts/test-gelato-print-submissions.sql'),'utf8').replace(/^\\ir ([A-Za-z0-9_-]+\.sql)$/gm,(_,file)=>readFileSync(path.join(root,'back-end/scripts',file),'utf8'));
 db.sql(original + `
 CREATE TABLE public.test_scheduled_upgrade_baseline AS SELECT jsonb_agg(to_jsonb(s) ORDER BY id) AS saved FROM public.print_provider_submissions s;
 ` + readFileSync(path.join(root,'back-end/scripts/test-gelato-scheduled-status.sql'),'utf8') + readFileSync(path.join(root,'back-end/scripts/test-gelato-financial-observations.sql'),'utf8') + `
 DO $$ DECLARE c jsonb; s uuid; token uuid;
 BEGIN
  UPDATE public.print_provider_dispatch_gates SET enabled=true WHERE provider='gelato';
  INSERT INTO public.orders(id,"orderId",root_order_id,execution_status,next_workflow,shipping_address,customer_approval_required,customer_approval_status)
   VALUES(90001,'LOCAL-FENCE-1','LOCAL-FENCE', 'ready_for_processing','4','{"name":"Test","street1":"123 Test St","city":"Test City","state":"CA","zip":"90001","country":"US"}',true,'approved'),
   (90002,'LOCAL-FENCE-2','LOCAL-FENCE','ready_for_processing','4','{"name":"Test","street1":"123 Test St","city":"Test City","state":"CA","zip":"90001","country":"US"}',true,'pending');
  PERFORM pg_temp.expect_error($q$SELECT public.claim_gelato_print_submission(pg_temp.routes(ARRAY[90001,90002]::bigint[]),'local-new-fence')$q$,'Gelato customer approval is not current');
  IF EXISTS(SELECT 1 FROM public.orders WHERE id IN(90001,90002) AND (print_submission_id IS NOT NULL OR execution_status<>'ready_for_processing')) THEN RAISE EXCEPTION 'Failed claim stranded an order';END IF;
  IF EXISTS(SELECT 1 FROM public.print_provider_submissions WHERE workflow_job_idempotency_key='local-new-fence') THEN RAISE EXCEPTION 'Failed claim leaked submission';END IF;
  UPDATE public.orders SET customer_approval_status='approved' WHERE id=90002;
  c:=public.claim_gelato_print_submission(pg_temp.routes(ARRAY[90001,90002]::bigint[]),'local-new-fence');
  IF NOT (c->>'dispatch')::boolean THEN RAISE EXCEPTION 'Approved claim rejected';END IF;
  s:=(c->>'submissionId')::uuid; token:=(c->>'claimToken')::uuid;
  PERFORM public.fence_gelato_print_submission(s,token);
  SELECT claim_token INTO token FROM public.print_provider_submissions WHERE id=s;
  UPDATE public.orders SET customer_approval_status='pending' WHERE id=90002;
  PERFORM pg_temp.expect_error($q$SELECT public.claim_gelato_print_submission(pg_temp.routes(ARRAY[90001,90002]::bigint[]),'local-new-fence')$q$,'Gelato customer approval is not current');
  IF (SELECT claim_token<>token OR request_state<>'failed' FROM public.print_provider_submissions WHERE id=s) OR EXISTS(SELECT 1 FROM public.orders WHERE id IN(90001,90002) AND execution_status<>'ready_for_processing') THEN RAISE EXCEPTION 'Rejected resume changed ownership';END IF;
  UPDATE public.orders SET customer_approval_status='approved' WHERE id=90002;
  c:=public.claim_gelato_print_submission(pg_temp.routes(ARRAY[90001,90002]::bigint[]),'local-new-fence');token:=(c->>'claimToken')::uuid;
  PERFORM pg_temp.record_quote(s,token);
  PERFORM public.begin_gelato_print_submission(s,token,'local-fence-exec',repeat('a',64));
  UPDATE public.orders SET customer_approval_status='revision_requested' WHERE id=90002;
  PERFORM pg_temp.expect_error(format('SELECT public.authorize_gelato_print_send(%L,%L,%L,repeat(''a'',64))',s,token,'local-fence-exec'),'Gelato customer approval is not current');
  IF (SELECT send_started_at IS NOT NULL FROM public.print_provider_submissions WHERE id=s) THEN RAISE EXCEPTION 'Rejected send mutated authorization';END IF;
  UPDATE public.orders SET customer_approval_status='approved' WHERE id=90002;
  PERFORM public.authorize_gelato_print_send(s,token,'local-fence-exec',repeat('a',64));
  IF (SELECT send_started_at IS NULL FROM public.print_provider_submissions WHERE id=s) THEN RAISE EXCEPTION 'Approved send rejected';END IF;
  UPDATE public.orders SET customer_approval_status='revision_requested' WHERE id=90002;
  PERFORM public.fence_gelato_print_submission(s,token);
  IF (SELECT request_state<>'outcome_unknown' FROM public.print_provider_submissions WHERE id=s) THEN RAISE EXCEPTION 'Revoked approval prevented safety fence';END IF;
  c:=public.begin_gelato_reconciliation(s,'local-read-only-recovery');
  IF NOT (c->>'recover')::boolean THEN RAISE EXCEPTION 'Revoked approval prevented read-only recovery';END IF;
  token:=(c->>'claimToken')::uuid;
  PERFORM public.finish_gelato_reconciliation_hold(s,token,'local-read-only-recovery','local-no-provider-call');
  UPDATE public.print_provider_dispatch_gates SET enabled=false WHERE provider='gelato';
 END $$;
 `);
 // Mirror established backend UPDATE rights explicitly: the original legacy fixture
 // granted only SELECT on its pre-created orders table.
 db.sql(`GRANT UPDATE ON public.orders TO service_role;
 INSERT INTO public.orders(id,"orderId",root_order_id,updated_at,manifest_3_url,customer_approval_status,customer_approval_required,execution_status,workflow_step,review_stages)
 VALUES(90003,'LOCAL-SERVICE-PREVIEW','LOCAL-SERVICE-PREVIEW',now(),'book/orders/LOCAL-SERVICE-PREVIEW/manifests/3-manifest.json','pending',true,'done','customer_approval','{"postPdf":{"status":"approved"}}');
 INSERT INTO public.preview_tokens(token,order_id,expires_at) VALUES('local-service-link','LOCAL-SERVICE-PREVIEW',now()+interval '1 day');`);
 const snapshot=db.sql(`SELECT jsonb_object_agg(k,coalesce(to_jsonb(o)->k,'null'::jsonb)) FROM public.orders o, unnest(ARRAY['orderId','order_id','root_order_id','amazon_order_id','updated_at','manifest_3_url','customer_approval_status','customer_approval_required','revision_count','execution_status','workflow_step','current_workflow','started_at','review_stages','print_submission_id','lulu_job_id','lulu_status']) k WHERE o.id=90003`);
 const escaped=snapshot.replaceAll("'","''");
 assert.equal(db.sql(`SET ROLE service_role;SELECT public.commit_customer_preview_action(90003,'local-service-link','${escaped}'::jsonb,'approve','{"customer_approval_status":"approved","next_workflow":"4","execution_status":"ready_for_processing"}'::jsonb)`),'t');
 assert.equal(db.sql("SELECT enabled FROM public.print_provider_dispatch_gates WHERE provider='gelato'"),'f');
 console.log(JSON.stringify({passed:true,existingSqlSuites:['print-submissions','scheduled-status','financial-observations'],newChecks:['pending sibling claim rolls back all membership/state','approved claim uses existing RPC','failed claim resume rechecks approval','post-send fence and read-only recovery remain available after revocation','service-role preview transaction with established UPDATE rights','revision after quote blocks real authorize RPC without send marker','approval restored permits existing authorize RPC','disposable normal gate restored OFF'],liveRequests:0,physicalProduction:false}));
} finally { db.close(); }
