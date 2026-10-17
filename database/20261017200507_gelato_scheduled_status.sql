-- Generated with `supabase migration new gelato_scheduled_status`.
-- Empty opt-in cohort: no existing submission/order is enrolled or modified.
BEGIN;
CREATE TABLE IF NOT EXISTS public.gelato_scheduled_status (
 submission_id uuid PRIMARY KEY REFERENCES public.print_provider_submissions(id),
 account_key_sha256 text NOT NULL CHECK(account_key_sha256 ~ '^[a-f0-9]{64}$'),
 enabled boolean NOT NULL DEFAULT false,
 registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_token uuid, lease_expires_at timestamptz,
 attempt_count bigint NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
 consecutive_failures integer NOT NULL DEFAULT 0 CHECK(consecutive_failures BETWEEN 0 AND 20),
 last_attempt_at timestamptz, last_success_at timestamptz,
 last_result text CHECK(last_result IN ('success','requires_review','failed')),
 last_error_class text CHECK(last_error_class IN ('rate_limited','provider_unavailable','provider_rejected','timeout','invalid_snapshot','database_failure','unexpected_failure')),
 last_http_status integer CHECK(last_http_status BETWEEN 100 AND 599),
 active_interval_seconds integer NOT NULL DEFAULT 300 CHECK(active_interval_seconds BETWEEN 60 AND 3600),
 terminal_interval_seconds integer NOT NULL DEFAULT 3600 CHECK(terminal_interval_seconds BETWEEN 300 AND 86400),
 terminal_window_seconds integer NOT NULL DEFAULT 604800 CHECK(terminal_window_seconds BETWEEN 3600 AND 1209600),
 terminal_until timestamptz,
 CHECK((lease_token IS NULL)=(lease_expires_at IS NULL))
);
CREATE INDEX IF NOT EXISTS gelato_scheduled_status_due ON public.gelato_scheduled_status(next_attempt_at,submission_id) WHERE enabled;
ALTER TABLE public.gelato_scheduled_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gelato_scheduled_status FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.gelato_scheduled_status TO service_role;

CREATE OR REPLACE FUNCTION public.register_gelato_scheduled_status(p_submission_id uuid,p_account_key_sha256 text,p_enabled boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.lock_gelato_submission_root(p_submission_id);
 IF p_account_key_sha256 !~ '^[a-f0-9]{64}$' OR p_account_key_sha256 IS NULL OR p_enabled IS NULL OR
   NOT EXISTS(SELECT 1 FROM public.print_provider_submissions WHERE id=p_submission_id AND provider='gelato' AND request_state='submitted') THEN
   RAISE EXCEPTION 'Invalid scheduled Gelato registration';
 END IF;
 -- Existing registration/account ownership cannot be silently replaced or enabled.
 INSERT INTO public.gelato_scheduled_status(submission_id,account_key_sha256,enabled) VALUES(p_submission_id,p_account_key_sha256,p_enabled);
END $$;

CREATE OR REPLACE FUNCTION public.claim_gelato_scheduled_status(p_account_key_sha256 text,p_lease_seconds integer DEFAULT 30)
RETURNS TABLE(submission_id uuid,lease_token uuid) LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE picked uuid; token uuid:=gen_random_uuid();
BEGIN
 IF p_account_key_sha256 IS NULL OR p_account_key_sha256 !~ '^[a-f0-9]{64}$' OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 5 AND 60 THEN
   RAISE EXCEPTION 'Invalid scheduled Gelato claim';
 END IF;
 SELECT j.submission_id INTO picked FROM public.gelato_scheduled_status j
 JOIN public.print_provider_submissions s ON s.id=j.submission_id
 WHERE j.enabled AND j.account_key_sha256=p_account_key_sha256 AND s.request_state='submitted'
   AND j.next_attempt_at<=clock_timestamp() AND (j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp())
   AND (j.terminal_until IS NULL OR j.terminal_until>clock_timestamp())
 ORDER BY j.next_attempt_at,j.submission_id FOR UPDATE OF j SKIP LOCKED LIMIT 1;
 IF picked IS NULL THEN RETURN; END IF;
 UPDATE public.gelato_scheduled_status j SET lease_token=token,lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),
   next_attempt_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),last_attempt_at=clock_timestamp(),attempt_count=attempt_count+1 WHERE j.submission_id=picked;
 RETURN QUERY SELECT picked,token;
END $$;

CREATE OR REPLACE FUNCTION public.assert_gelato_scheduled_status_owner(p_submission_id uuid,p_poll_token uuid)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE j public.gelato_scheduled_status%ROWTYPE;
BEGIN
 -- Same root -> queue lock order for every writer, including manual lifecycle RPCs.
 PERFORM public.lock_gelato_submission_root(p_submission_id);
 SELECT * INTO STRICT j FROM public.gelato_scheduled_status WHERE submission_id=p_submission_id FOR UPDATE;
 IF NOT j.enabled OR j.lease_token IS DISTINCT FROM p_poll_token OR p_poll_token IS NULL OR j.lease_expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'Scheduled Gelato ownership changed or expired';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.apply_gelato_scheduled_snapshots(p_submission_id uuid,p_poll_token uuid,p_expected jsonb,p_results jsonb,p_notifications jsonb DEFAULT '[]',p_notification_holds jsonb DEFAULT '[]')
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.assert_gelato_scheduled_status_owner(p_submission_id,p_poll_token);
 IF p_notifications IS DISTINCT FROM '[]'::jsonb OR p_notification_holds IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'Scheduled status cannot create notification intents'; END IF;
 PERFORM public.apply_gelato_provider_snapshots(p_submission_id,p_expected,p_results,'[]','[]');
END $$;

CREATE OR REPLACE FUNCTION public.hold_gelato_scheduled_refresh(p_submission_id uuid,p_poll_token uuid,p_expected jsonb,p_reason text)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.assert_gelato_scheduled_status_owner(p_submission_id,p_poll_token);
 PERFORM public.hold_gelato_provider_refresh(p_submission_id,p_expected,p_reason);
END $$;

CREATE OR REPLACE FUNCTION public.finish_gelato_scheduled_status(p_submission_id uuid,p_poll_token uuid,p_result text,p_error_class text DEFAULT NULL,p_http_status integer DEFAULT NULL,p_retry_after_seconds integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE j public.gelato_scheduled_status%ROWTYPE; terminal boolean; delay_seconds integer; failures integer;
BEGIN
 PERFORM public.assert_gelato_scheduled_status_owner(p_submission_id,p_poll_token);
 SELECT * INTO STRICT j FROM public.gelato_scheduled_status WHERE submission_id=p_submission_id;
 IF p_result IS NULL OR p_result NOT IN ('success','requires_review','failed') OR
   (p_result='failed' AND (p_error_class IS NULL OR p_error_class NOT IN ('rate_limited','provider_unavailable','provider_rejected','timeout','invalid_snapshot','database_failure','unexpected_failure'))) OR
   (p_result<>'failed' AND p_error_class IS NOT NULL) OR (p_http_status IS NOT NULL AND p_http_status NOT BETWEEN 100 AND 599) OR
   (p_retry_after_seconds IS NOT NULL AND p_retry_after_seconds NOT BETWEEN 0 AND 86400) THEN RAISE EXCEPTION 'Invalid scheduled Gelato result'; END IF;
 SELECT count(*)>0 AND bool_and(coalesce(status IN ('delivered','canceled','failed','returned'),false)) INTO terminal
   FROM public.print_provider_submission_items WHERE submission_id=p_submission_id;
 failures:=CASE WHEN p_result='failed' THEN least(j.consecutive_failures+1,20) ELSE 0 END;
 delay_seconds:=CASE WHEN p_result='failed' THEN greatest(coalesce(p_retry_after_seconds,0),
   ceil(least(3600.0,30.0*power(2.0,least(failures-1,7)))*(1.0+random()*0.2))::integer)
   WHEN p_result='requires_review' THEN greatest(j.active_interval_seconds,900)
   WHEN terminal THEN j.terminal_interval_seconds ELSE j.active_interval_seconds END;
 UPDATE public.gelato_scheduled_status SET lease_token=NULL,lease_expires_at=NULL,
   next_attempt_at=clock_timestamp()+make_interval(secs=>delay_seconds),consecutive_failures=failures,last_result=p_result,
   last_error_class=p_error_class,last_http_status=p_http_status,
   last_success_at=CASE WHEN p_result IN ('success','requires_review') THEN clock_timestamp() ELSE last_success_at END,
   terminal_until=CASE WHEN p_result='failed' THEN terminal_until WHEN terminal THEN coalesce(terminal_until,clock_timestamp()+make_interval(secs=>j.terminal_window_seconds)) ELSE NULL END
   WHERE submission_id=p_submission_id;
END $$;

REVOKE ALL ON FUNCTION public.register_gelato_scheduled_status(uuid,text,boolean),public.claim_gelato_scheduled_status(text,integer),
 public.assert_gelato_scheduled_status_owner(uuid,uuid),public.apply_gelato_scheduled_snapshots(uuid,uuid,jsonb,jsonb,jsonb,jsonb),
 public.hold_gelato_scheduled_refresh(uuid,uuid,jsonb,text),public.finish_gelato_scheduled_status(uuid,uuid,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_gelato_scheduled_status(uuid,text,boolean),public.claim_gelato_scheduled_status(text,integer),
 public.assert_gelato_scheduled_status_owner(uuid,uuid),public.apply_gelato_scheduled_snapshots(uuid,uuid,jsonb,jsonb,jsonb,jsonb),
 public.hold_gelato_scheduled_refresh(uuid,uuid,jsonb,text),public.finish_gelato_scheduled_status(uuid,uuid,text,text,integer,integer) TO service_role;
COMMIT;
