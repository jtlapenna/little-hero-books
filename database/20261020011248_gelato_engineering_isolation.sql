-- Local-reviewed preparation only. Empty scope; no enrollment, flag or gate changes.
-- Requires scoped engineering windows, scheduled status, financial observations and ordinary release store.
BEGIN;
CREATE TABLE IF NOT EXISTS public.gelato_isolation_scopes (
 id uuid PRIMARY KEY,
 root_order_id text NOT NULL UNIQUE REFERENCES public.gelato_engineering_submission_windows(root_order_id),
 token_sha256 text NOT NULL CHECK(token_sha256 ~ '^[a-f0-9]{64}$'),
 account_key_sha256 text NOT NULL CHECK(account_key_sha256 ~ '^[a-f0-9]{64}$'),
 fixture_manifest_sha256 text NOT NULL CHECK(fixture_manifest_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 closed_at timestamptz,
 submission_id uuid UNIQUE REFERENCES public.print_provider_submissions(id),
 status_claim_limit integer NOT NULL DEFAULT 3 CHECK(status_claim_limit BETWEEN 1 AND 3),
 status_claims integer NOT NULL DEFAULT 0 CHECK(status_claims BETWEEN 0 AND status_claim_limit),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 minutes')
);
ALTER TABLE public.gelato_isolation_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gelato_isolation_scopes FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.gelato_isolation_scopes TO service_role;
GRANT UPDATE(submission_id,status_claims,closed_at) ON public.gelato_isolation_scopes TO service_role;
ALTER TABLE public.gelato_scheduled_status ADD COLUMN IF NOT EXISTS engineering_scope_id uuid REFERENCES public.gelato_isolation_scopes(id);

CREATE OR REPLACE FUNCTION public.assert_gelato_isolation_gates_off()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE dispatch boolean; release boolean;
BEGIN
 SELECT enabled INTO dispatch FROM public.print_provider_dispatch_gates WHERE provider='gelato' FOR SHARE;
 SELECT enabled INTO release FROM public.gelato_ordinary_release_gate WHERE id=true FOR SHARE;
 IF dispatch IS DISTINCT FROM false OR release IS DISTINCT FROM false THEN RAISE EXCEPTION 'Normal Gelato gates must remain OFF'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_gelato_isolation_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE win public.gelato_engineering_submission_windows%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-'closed_at'-'submission_id'-'status_claims') IS DISTINCT FROM (to_jsonb(OLD)-'closed_at'-'submission_id'-'status_claims')
   OR (OLD.closed_at IS NOT NULL AND NEW IS DISTINCT FROM OLD)
   OR (OLD.submission_id IS NOT NULL AND NEW.submission_id IS DISTINCT FROM OLD.submission_id)
   OR NEW.status_claims NOT IN (OLD.status_claims,OLD.status_claims+1) THEN RAISE EXCEPTION 'Isolation authority is immutable and cannot be reopened'; END IF;
  IF NEW.closed_at IS NULL AND NEW.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Isolation authority expired during work'; END IF;
  IF NEW.submission_id IS DISTINCT FROM OLD.submission_id AND (NEW.submission_id IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.print_provider_submissions sub WHERE sub.id=NEW.submission_id AND sub.root_order_id=NEW.root_order_id
    AND (SELECT array_agg(child_order_id ORDER BY child_order_id) FROM public.print_provider_submission_items WHERE submission_id=sub.id)=
        (SELECT child_order_ids FROM public.gelato_engineering_submission_windows WHERE root_order_id=NEW.root_order_id)))
  THEN RAISE EXCEPTION 'Isolation submission binding differs'; END IF;
  RETURN NEW;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gelato-root:'||NEW.root_order_id,0));
 PERFORM public.assert_gelato_isolation_gates_off();
 SELECT * INTO STRICT win FROM public.gelato_engineering_submission_windows WHERE root_order_id=NEW.root_order_id FOR SHARE;
 IF NEW.closed_at IS NOT NULL OR NEW.submission_id IS NOT NULL OR NEW.status_claims<>0
  OR win.closed_at IS NOT NULL OR win.opened_at>clock_timestamp() OR win.expires_at<=clock_timestamp()
  OR NEW.created_at<win.opened_at OR NEW.created_at>clock_timestamp() OR NEW.expires_at>win.expires_at OR NEW.expires_at<=clock_timestamp()
  OR win.account_key_sha256 IS DISTINCT FROM NEW.account_key_sha256 OR win.fixture_manifest_sha256 IS DISTINCT FROM NEW.fixture_manifest_sha256
  OR NOT public.gelato_engineering_dispatch_allowed(NEW.root_order_id,win.child_order_ids) THEN RAISE EXCEPTION 'Invalid fresh isolation authority'; END IF;
 -- Old provider/submission roots are never admitted, even if they are labelled TEST.
 IF EXISTS(SELECT 1 FROM public.print_provider_submissions WHERE root_order_id=NEW.root_order_id)
  OR EXISTS(SELECT 1 FROM public.orders WHERE id=ANY(win.child_order_ids) AND
   (print_submission_id IS NOT NULL OR print_claim_token IS NOT NULL OR to_jsonb(orders)->>'gelato_order_id' IS NOT NULL
    OR to_jsonb(orders)->>'gelato_status' IS NOT NULL OR to_jsonb(orders)->>'lulu_job_id' IS NOT NULL OR to_jsonb(orders)->>'lulu_status' IS NOT NULL))
 THEN RAISE EXCEPTION 'Isolation requires fresh unsubmitted children'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_gelato_isolation_scope ON public.gelato_isolation_scopes;
CREATE TRIGGER guard_gelato_isolation_scope BEFORE INSERT OR UPDATE ON public.gelato_isolation_scopes FOR EACH ROW EXECUTE FUNCTION public.guard_gelato_isolation_scope();

CREATE OR REPLACE FUNCTION public.load_gelato_isolation_scope(p_scope_id uuid,p_token_sha256 text,p_account_key_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE s public.gelato_isolation_scopes%ROWTYPE; win public.gelato_engineering_submission_windows%ROWTYPE;
BEGIN
 -- No order/submission selector before authenticating exact scope/token/account.
 SELECT * INTO s FROM public.gelato_isolation_scopes WHERE id=p_scope_id AND token_sha256=p_token_sha256 AND account_key_sha256=p_account_key_sha256;
 IF NOT FOUND THEN RAISE EXCEPTION 'Isolation authority unavailable'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gelato-root:'||s.root_order_id,0));
 PERFORM public.assert_gelato_isolation_gates_off();
 SELECT * INTO STRICT s FROM public.gelato_isolation_scopes WHERE id=p_scope_id FOR UPDATE;
 SELECT * INTO STRICT win FROM public.gelato_engineering_submission_windows WHERE root_order_id=s.root_order_id FOR SHARE;
 IF s.closed_at IS NOT NULL OR s.expires_at<=clock_timestamp() OR win.closed_at IS NOT NULL OR win.opened_at>clock_timestamp()
  OR win.expires_at<=clock_timestamp() OR win.account_key_sha256 IS DISTINCT FROM p_account_key_sha256
  OR win.fixture_manifest_sha256 IS DISTINCT FROM s.fixture_manifest_sha256
  OR NOT public.gelato_engineering_dispatch_allowed(s.root_order_id,win.child_order_ids) THEN RAISE EXCEPTION 'Isolation authority expired or changed'; END IF;
 RETURN jsonb_build_object('scopeId',s.id,'rootOrderId',s.root_order_id,'orderDbIds',win.child_order_ids,
  'expiresAt',least(s.expires_at,win.expires_at),'submissionId',s.submission_id,'fixtureManifestSha256',s.fixture_manifest_sha256,'statusClaimsRemaining',s.status_claim_limit-s.status_claims,
  'providerOrderIds',coalesce((SELECT jsonb_agg(provider_order_id ORDER BY provider_order_id) FROM public.print_provider_submission_orders WHERE submission_id=s.submission_id),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.claim_gelato_isolation_queue(p_scope_id uuid,p_token_sha256 text,p_account_key_sha256 text,p_routes jsonb,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE scope jsonb; result jsonb; ids bigint[];
BEGIN
 scope:=public.load_gelato_isolation_scope(p_scope_id,p_token_sha256,p_account_key_sha256);
 IF scope->>'submissionId' IS NOT NULL THEN RETURN jsonb_build_object('dispatch',false,'reason','isolation_claim_already_consumed'); END IF;
 IF jsonb_typeof(p_routes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_routes) NOT BETWEEN 1 AND 2 THEN RAISE EXCEPTION 'Invalid isolation routes'; END IF;
 SELECT array_agg((v->>'orderDbId')::bigint ORDER BY (v->>'orderDbId')::bigint) INTO ids FROM jsonb_array_elements(p_routes) v;
 IF to_jsonb(ids) IS DISTINCT FROM scope->'orderDbIds' OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_routes) v WHERE v->>'rootOrderId' IS DISTINCT FROM scope->>'rootOrderId')
  OR p_idempotency_key IS DISTINCT FROM 'w1.1:'||(scope->>'rootOrderId')||':'||array_to_string(ids,'-') THEN RAISE EXCEPTION 'Isolation membership differs'; END IF;
 PERFORM id FROM public.orders WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.orders WHERE id=ANY(ids) AND
  (print_submission_id IS NOT NULL OR print_claim_token IS NOT NULL OR execution_status IS DISTINCT FROM 'ready_for_processing'
   OR next_workflow NOT IN ('4','4-aggregate') OR next_workflow IS NULL OR current_workflow IS NOT NULL OR started_at IS NOT NULL
   OR to_jsonb(orders)->>'customer_approval_status'='revision_requested'
   OR (to_jsonb(orders)->>'customer_approval_required'='true' AND to_jsonb(orders)->>'customer_approval_status' IS DISTINCT FROM 'approved')))
 THEN RAISE EXCEPTION 'Isolation children are not freshly approved and ready'; END IF;
 result:=public.claim_gelato_print_submission(p_routes,p_idempotency_key);
 IF result->'dispatch' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Fresh isolation claim was not granted'; END IF;
 UPDATE public.gelato_isolation_scopes SET submission_id=(result->>'submissionId')::uuid WHERE id=p_scope_id;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.fence_gelato_isolation_claim(p_scope_id uuid,p_token_sha256 text,p_account_key_sha256 text,p_submission_id uuid,p_claim_token uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE scope jsonb;
BEGIN
 scope:=public.load_gelato_isolation_scope(p_scope_id,p_token_sha256,p_account_key_sha256);
 IF (scope->>'submissionId')::uuid IS DISTINCT FROM p_submission_id THEN RAISE EXCEPTION 'Isolation fence differs'; END IF;
 PERFORM public.fence_gelato_print_submission(p_submission_id,p_claim_token);
END $$;

CREATE OR REPLACE FUNCTION public.register_gelato_isolation_status(p_scope_id uuid,p_token_sha256 text,p_account_key_sha256 text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE scope jsonb; sid uuid; existing uuid;
BEGIN
 scope:=public.load_gelato_isolation_scope(p_scope_id,p_token_sha256,p_account_key_sha256);sid:=(scope->>'submissionId')::uuid;
 IF sid IS NULL OR NOT EXISTS(SELECT 1 FROM public.print_provider_submissions WHERE id=sid AND request_state='submitted')
  OR (SELECT count(*) FROM public.print_provider_submission_orders WHERE submission_id=sid)<>1
  OR EXISTS(SELECT 1 FROM public.print_provider_submission_orders WHERE submission_id=sid AND order_type IS DISTINCT FROM 'draft')
 THEN RAISE EXCEPTION 'Isolation polling requires its fresh submitted draft'; END IF;
 SELECT engineering_scope_id INTO existing FROM public.gelato_scheduled_status WHERE submission_id=sid;
 IF FOUND THEN
  IF existing IS DISTINCT FROM p_scope_id THEN RAISE EXCEPTION 'Registration ownership differs'; END IF;
  RETURN; -- Never re-enable/reset an existing registration or its budget.
 END IF;
 PERFORM public.register_gelato_scheduled_status(sid,p_account_key_sha256,true);
 UPDATE public.gelato_scheduled_status SET engineering_scope_id=p_scope_id WHERE submission_id=sid;
END $$;

CREATE OR REPLACE FUNCTION public.claim_gelato_isolation_status(p_scope_id uuid,p_token_sha256 text,p_account_key_sha256 text)
RETURNS TABLE(submission_id uuid,lease_token uuid) LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE scope jsonb; sid uuid; token uuid:=gen_random_uuid();
BEGIN
 scope:=public.load_gelato_isolation_scope(p_scope_id,p_token_sha256,p_account_key_sha256);sid:=(scope->>'submissionId')::uuid;
 IF sid IS NULL OR (scope->>'statusClaimsRemaining')::integer<=0 THEN RETURN; END IF;
 PERFORM 1 FROM public.gelato_scheduled_status j JOIN public.print_provider_submissions s ON s.id=j.submission_id
  WHERE j.submission_id=sid AND j.engineering_scope_id=p_scope_id AND j.account_key_sha256=p_account_key_sha256 AND j.enabled
   AND s.request_state='submitted' AND j.next_attempt_at<=clock_timestamp()
   AND (j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp()) AND (j.terminal_until IS NULL OR j.terminal_until>clock_timestamp()) FOR UPDATE OF j;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE public.gelato_isolation_scopes SET status_claims=status_claims+1 WHERE id=p_scope_id;
 UPDATE public.gelato_scheduled_status j SET lease_token=token,lease_expires_at=clock_timestamp()+interval '30 seconds',
  next_attempt_at=clock_timestamp()+interval '30 seconds',last_attempt_at=clock_timestamp(),attempt_count=attempt_count+1 WHERE j.submission_id=sid;
 RETURN QUERY SELECT sid,token;
END $$;

CREATE OR REPLACE FUNCTION public.assert_gelato_isolation_status(p_scope_id uuid,p_token_sha256 text,p_account_key_sha256 text,p_submission_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE scope jsonb;
BEGIN
 scope:=public.load_gelato_isolation_scope(p_scope_id,p_token_sha256,p_account_key_sha256);
 IF (scope->>'submissionId')::uuid IS DISTINCT FROM p_submission_id OR NOT EXISTS(SELECT 1 FROM public.gelato_scheduled_status WHERE submission_id=p_submission_id AND engineering_scope_id=p_scope_id)
 THEN RAISE EXCEPTION 'Isolation status membership differs'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.apply_gelato_isolation_snapshots(p_scope_id uuid,p_token_sha256 text,p_account_key_sha256 text,p_submission_id uuid,p_poll_token uuid,p_expected jsonb,p_results jsonb,p_notifications jsonb DEFAULT '[]',p_notification_holds jsonb DEFAULT '[]')
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.assert_gelato_isolation_status(p_scope_id,p_token_sha256,p_account_key_sha256,p_submission_id);
 PERFORM public.apply_gelato_scheduled_snapshots(p_submission_id,p_poll_token,p_expected,p_results,p_notifications,p_notification_holds);
 PERFORM public.load_gelato_isolation_scope(p_scope_id,p_token_sha256,p_account_key_sha256); -- Expiry after blocking writers rolls the transaction back.
END $$;
CREATE OR REPLACE FUNCTION public.hold_gelato_isolation_refresh(p_scope_id uuid,p_token_sha256 text,p_account_key_sha256 text,p_submission_id uuid,p_poll_token uuid,p_expected jsonb,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.assert_gelato_isolation_status(p_scope_id,p_token_sha256,p_account_key_sha256,p_submission_id);
 PERFORM public.hold_gelato_scheduled_refresh(p_submission_id,p_poll_token,p_expected,p_reason);
 PERFORM public.load_gelato_isolation_scope(p_scope_id,p_token_sha256,p_account_key_sha256); -- Expiry after blocking writers rolls the transaction back.
END $$;
CREATE OR REPLACE FUNCTION public.finish_gelato_isolation_status(p_scope_id uuid,p_token_sha256 text,p_account_key_sha256 text,p_submission_id uuid,p_poll_token uuid,p_result text,p_error_class text DEFAULT NULL,p_http_status integer DEFAULT NULL,p_retry_after_seconds integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.assert_gelato_isolation_status(p_scope_id,p_token_sha256,p_account_key_sha256,p_submission_id);
 PERFORM public.finish_gelato_scheduled_status(p_submission_id,p_poll_token,p_result,p_error_class,p_http_status,p_retry_after_seconds);
 PERFORM public.load_gelato_isolation_scope(p_scope_id,p_token_sha256,p_account_key_sha256); -- Expiry after blocking writers rolls the transaction back.
END $$;
CREATE OR REPLACE FUNCTION public.close_gelato_isolation_scope(p_scope_id uuid,p_token_sha256 text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE s public.gelato_isolation_scopes%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.gelato_isolation_scopes WHERE id=p_scope_id AND token_sha256=p_token_sha256;
 IF NOT FOUND THEN RAISE EXCEPTION 'Isolation authority unavailable'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gelato-root:'||s.root_order_id,0));
 SELECT * INTO STRICT s FROM public.gelato_isolation_scopes WHERE id=p_scope_id FOR UPDATE;
 IF s.closed_at IS NOT NULL THEN RETURN; END IF;
 UPDATE public.gelato_isolation_scopes SET closed_at=clock_timestamp() WHERE id=p_scope_id;
 UPDATE public.gelato_engineering_submission_windows SET closed_at=clock_timestamp() WHERE root_order_id=s.root_order_id AND closed_at IS NULL;
 UPDATE public.gelato_scheduled_status SET enabled=false,lease_token=NULL,lease_expires_at=NULL WHERE submission_id=s.submission_id AND account_key_sha256=s.account_key_sha256;
END $$;

-- Existing ordinary selector retains its behavior except explicit exclusion of isolated jobs.
CREATE OR REPLACE FUNCTION public.claim_gelato_scheduled_status(p_account_key_sha256 text,p_lease_seconds integer DEFAULT 30)
RETURNS TABLE(submission_id uuid,lease_token uuid) LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE picked uuid; token uuid:=gen_random_uuid();
BEGIN
 IF p_account_key_sha256 IS NULL OR p_account_key_sha256 !~ '^[a-f0-9]{64}$' OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 5 AND 60 THEN
   RAISE EXCEPTION 'Invalid scheduled Gelato claim';
 END IF;
 SELECT j.submission_id INTO picked FROM public.gelato_scheduled_status j
 JOIN public.print_provider_submissions s ON s.id=j.submission_id
 WHERE j.engineering_scope_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.gelato_isolation_scopes iso WHERE iso.submission_id=j.submission_id) AND j.enabled AND j.account_key_sha256=p_account_key_sha256 AND s.request_state='submitted'
   AND j.next_attempt_at<=clock_timestamp() AND (j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp())
   AND (j.terminal_until IS NULL OR j.terminal_until>clock_timestamp())
 ORDER BY j.next_attempt_at,j.submission_id FOR UPDATE OF j SKIP LOCKED LIMIT 1;
 IF picked IS NULL THEN RETURN; END IF;
 UPDATE public.gelato_scheduled_status j SET lease_token=token,lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),
   next_attempt_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),last_attempt_at=clock_timestamp(),attempt_count=attempt_count+1 WHERE j.submission_id=picked;
 RETURN QUERY SELECT picked,token;
END $$;


DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('assert_gelato_isolation_gates_off','guard_gelato_isolation_scope','load_gelato_isolation_scope','claim_gelato_isolation_queue','fence_gelato_isolation_claim','register_gelato_isolation_status','claim_gelato_isolation_status','assert_gelato_isolation_status','apply_gelato_isolation_snapshots','hold_gelato_isolation_refresh','finish_gelato_isolation_status','close_gelato_isolation_scope')
 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
COMMIT;
