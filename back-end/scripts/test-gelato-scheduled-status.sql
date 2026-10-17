CREATE FUNCTION pg_temp.scheduled_expect_error(query text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE query; EXCEPTION WHEN OTHERS THEN IF position(expected in SQLERRM)>0 THEN RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'Expected scheduler rejection: %',query;
END $$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.gelato_scheduled_status) THEN RAISE EXCEPTION 'Migration enrolled existing work'; END IF;
 IF (SELECT saved FROM public.test_scheduled_upgrade_baseline) IS DISTINCT FROM
   (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.print_provider_submissions s) THEN RAISE EXCEPTION 'Upgrade altered existing submissions'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.gelato_scheduled_status'::regclass) THEN RAISE EXCEPTION 'RLS missing'; END IF;
 IF has_table_privilege('anon','public.gelato_scheduled_status','SELECT') OR has_table_privilege('authenticated','public.gelato_scheduled_status','INSERT') THEN RAISE EXCEPTION 'Public scheduler access'; END IF;
 IF has_function_privilege('anon','public.claim_gelato_scheduled_status(text,integer)','EXECUTE') OR
   has_function_privilege('authenticated','public.register_gelato_scheduled_status(uuid,text,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Public scheduler RPC'; END IF;
END $$;
SET ROLE anon;
SELECT pg_temp.scheduled_expect_error('SELECT * FROM public.gelato_scheduled_status','permission denied');
SELECT pg_temp.scheduled_expect_error($q$SELECT * FROM public.claim_gelato_scheduled_status(repeat('a',64),30)$q$,'permission denied');
RESET ROLE;
CREATE TABLE public.test_scheduled_jobs(kind integer PRIMARY KEY,submission_id uuid);
DO $$ DECLARE s uuid; j record; seen uuid[]:='{}'; next_time timestamptz; until_time timestamptz;
BEGIN
 FOR n IN 1..7 LOOP
   INSERT INTO public.print_provider_submissions(provider,order_reference_id,workflow_job_idempotency_key,logical_group,root_order_id,claim_token,lease_expires_at,request_state)
   VALUES('gelato','SCHEDULED-REF-'||n,'SCHEDULED-JOB-'||n,'SCHEDULED-GROUP-'||n,'SCHEDULED-ROOT-'||n,gen_random_uuid(),clock_timestamp(),'submitted') RETURNING id INTO s;
   INSERT INTO public.test_scheduled_jobs VALUES(n,s);
   PERFORM public.register_gelato_scheduled_status(s,repeat('a',64),true);
   UPDATE public.gelato_scheduled_status SET next_attempt_at=clock_timestamp()-make_interval(secs=>100-n) WHERE submission_id=s;
 END LOOP;
 -- Seven candidates require more than two maximum-three route invocations.
 FOR n IN 1..7 LOOP
   SELECT * INTO STRICT j FROM public.claim_gelato_scheduled_status(repeat('a',64),30);
   IF j.submission_id=ANY(seen) THEN RAISE EXCEPTION 'Failed oldest work starved later jobs'; END IF;
   seen:=array_append(seen,j.submission_id);
   IF n=1 THEN PERFORM public.finish_gelato_scheduled_status(j.submission_id,j.lease_token,'failed','timeout');
   ELSE PERFORM public.finish_gelato_scheduled_status(j.submission_id,j.lease_token,'success'); END IF;
 END LOOP;
 IF cardinality(seen)<>7 OR EXISTS(SELECT 1 FROM public.claim_gelato_scheduled_status(repeat('a',64),30)) THEN RAISE EXCEPTION 'Due selection/backoff incorrect'; END IF;
 SELECT submission_id INTO s FROM public.test_scheduled_jobs WHERE kind=1;
 IF (SELECT last_success_at IS NOT NULL OR consecutive_failures<>1 OR next_attempt_at<clock_timestamp()+interval '20 seconds' FROM public.gelato_scheduled_status WHERE submission_id=s) THEN RAISE EXCEPTION 'Timeout incorrectly succeeded'; END IF;
 UPDATE public.gelato_scheduled_status SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE submission_id=s;
 SELECT * INTO STRICT j FROM public.claim_gelato_scheduled_status(repeat('a',64),30);
 PERFORM pg_temp.scheduled_expect_error(format('SELECT public.finish_gelato_scheduled_status(%L,%L,%L)',s,gen_random_uuid(),'success'),'ownership');
 PERFORM pg_temp.scheduled_expect_error(format('SELECT public.apply_gelato_scheduled_snapshots(%L,%L,''[]'',''[]'')',s,gen_random_uuid()),'ownership');
 PERFORM pg_temp.scheduled_expect_error(format('SELECT public.hold_gelato_scheduled_refresh(%L,%L,''[]'',''reason'')',s,gen_random_uuid()),'ownership');
 UPDATE public.gelato_scheduled_status SET lease_expires_at=clock_timestamp()-interval '1 second',next_attempt_at=clock_timestamp()-interval '1 second' WHERE submission_id=s;
 PERFORM pg_temp.scheduled_expect_error(format('SELECT public.apply_gelato_scheduled_snapshots(%L,%L,''[]'',''[]'')',s,j.lease_token),'ownership');
 PERFORM pg_temp.scheduled_expect_error(format('SELECT public.finish_gelato_scheduled_status(%L,%L,%L)',s,j.lease_token,'success'),'ownership');
 SELECT * INTO STRICT j FROM public.claim_gelato_scheduled_status(repeat('a',64),30);
 UPDATE public.gelato_scheduled_status SET enabled=false WHERE submission_id=s;
 PERFORM pg_temp.scheduled_expect_error(format('SELECT public.apply_gelato_scheduled_snapshots(%L,%L,''[]'',''[]'')',s,j.lease_token),'ownership');
 UPDATE public.gelato_scheduled_status SET enabled=true WHERE submission_id=s;
 PERFORM public.finish_gelato_scheduled_status(s,j.lease_token,'failed','rate_limited',429,1800);
 IF (SELECT next_attempt_at<clock_timestamp()+interval '1790 seconds' FROM public.gelato_scheduled_status WHERE submission_id=s) THEN RAISE EXCEPTION 'Retry-After ignored'; END IF;
 -- Stable terminal lookback: never extended by a later terminal check.
 SELECT submission_id INTO s FROM public.test_scheduled_jobs WHERE kind=2;
 INSERT INTO public.print_provider_submission_items(submission_id,item_reference_id,child_order_id,child_order_key,status) VALUES(s,'scheduled-terminal-item',999991,'SCHEDULED-TERMINAL','delivered');
 UPDATE public.gelato_scheduled_status SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE submission_id=s;
 SELECT * INTO STRICT j FROM public.claim_gelato_scheduled_status(repeat('a',64),30);
 PERFORM public.finish_gelato_scheduled_status(s,j.lease_token,'success');
 SELECT terminal_until INTO STRICT until_time FROM public.gelato_scheduled_status WHERE submission_id=s;
 IF until_time IS NULL THEN RAISE EXCEPTION 'Terminal lookback missing'; END IF;
 UPDATE public.print_provider_submission_items SET status='returned' WHERE submission_id=s;
 UPDATE public.gelato_scheduled_status SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE submission_id=s;
 SELECT * INTO STRICT j FROM public.claim_gelato_scheduled_status(repeat('a',64),30);
 PERFORM public.finish_gelato_scheduled_status(s,j.lease_token,'success');
 IF (SELECT terminal_until FROM public.gelato_scheduled_status WHERE submission_id=s) IS DISTINCT FROM until_time THEN RAISE EXCEPTION 'Terminal horizon moved'; END IF;
 UPDATE public.gelato_scheduled_status SET terminal_until=clock_timestamp()-interval '1 second',next_attempt_at=clock_timestamp()-interval '1 second' WHERE submission_id=s;
 IF EXISTS(SELECT 1 FROM public.claim_gelato_scheduled_status(repeat('a',64),30)) THEN RAISE EXCEPTION 'Expired terminal cohort was polled'; END IF;
 IF EXISTS(SELECT 1 FROM public.claim_gelato_scheduled_status(repeat('b',64),30)) THEN RAISE EXCEPTION 'Wrong account claimed work'; END IF;
END $$;
-- Leave one registered due job for two-connection SKIP LOCKED evidence in the harness.
UPDATE public.gelato_scheduled_status SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE submission_id=(SELECT submission_id FROM public.test_scheduled_jobs WHERE kind=7);
SELECT 'Scheduled upgrade/ACL/empty cohort, seven-job fairness, expiry/token/revocation, Retry-After and stable terminal lookback: ok' AS result;
