-- Empty-by-default authorization for exact synthetic no-payment diagnostics only.
-- Does not enable normal dispatch, change draft creation or attach payment.
BEGIN;
CREATE TABLE IF NOT EXISTS public.gelato_engineering_conversions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_id uuid NOT NULL UNIQUE REFERENCES public.print_provider_submissions(id),
 provider_root_id text NOT NULL UNIQUE,
 account_key_sha256 text NOT NULL CHECK(account_key_sha256 ~ '^[a-f0-9]{64}$'),
 fixture_manifest_sha256 text NOT NULL CHECK(fixture_manifest_sha256 ~ '^[a-f0-9]{64}$'),
 funding_receipt_sha256 text NOT NULL CHECK(funding_receipt_sha256 ~ '^[a-f0-9]{64}$'),
 no_payment_routes_confirmed boolean NOT NULL CHECK(no_payment_routes_confirmed),
 funding_inspected_at timestamptz NOT NULL,
 opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 artifacts jsonb NOT NULL CHECK(jsonb_typeof(artifacts)='array' AND jsonb_array_length(artifacts) BETWEEN 1 AND 2),
 state text NOT NULL DEFAULT 'ready' CHECK(state IN ('ready','preparing','sending','converted','rejected','outcome_unknown','preflight_failed')),
 owner_token uuid, preparing_at timestamptz, send_started_at timestamptz, completed_at timestamptz,
 preflight_sha256 text CHECK(preflight_sha256 ~ '^[a-f0-9]{64}$'),
 closed_at timestamptz,
 observations jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(observations)='object'),
 CHECK(expires_at>opened_at AND expires_at<=opened_at+interval '15 minutes'),
 CHECK(funding_inspected_at<=opened_at AND expires_at<=funding_inspected_at+interval '15 minutes')
);
ALTER TABLE public.gelato_engineering_conversions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gelato_engineering_conversions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.gelato_engineering_conversions TO service_role;
GRANT UPDATE(state,owner_token,preparing_at,send_started_at,completed_at,preflight_sha256,closed_at,observations) ON public.gelato_engineering_conversions TO service_role;

CREATE OR REPLACE FUNCTION public.guard_gelato_engineering_conversion() RETURNS trigger
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE artifact jsonb;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Engineering conversion evidence cannot be deleted'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'ready' OR NEW.owner_token IS NOT NULL OR NEW.preparing_at IS NOT NULL OR NEW.send_started_at IS NOT NULL OR
   NEW.completed_at IS NOT NULL OR NEW.preflight_sha256 IS NOT NULL OR NEW.closed_at IS NOT NULL OR NEW.observations<>'{}'::jsonb OR
   NEW.opened_at>clock_timestamp()+interval '5 seconds' OR NEW.expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'New engineering conversion must be unused and current';
  END IF;
  FOR artifact IN SELECT value FROM jsonb_array_elements(NEW.artifacts) LOOP
   IF jsonb_typeof(artifact) IS DISTINCT FROM 'object' OR jsonb_typeof(artifact->'child_order_id') IS DISTINCT FROM 'number' OR
    coalesce(artifact->>'child_order_id','') !~ '^[1-9][0-9]*$' OR coalesce(artifact->>'sha256','') !~ '^[a-f0-9]{64}$' OR
    coalesce(artifact->>'artifact_key','')='' OR coalesce(artifact->>'provider_item_id','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$' OR (SELECT count(*) FROM jsonb_object_keys(artifact))<>4 THEN
    RAISE EXCEPTION 'Exact artifact identity and byte hash required';
   END IF;
  END LOOP;
  RETURN NEW;
 END IF;
 IF (to_jsonb(NEW)-ARRAY['state','owner_token','preparing_at','send_started_at','completed_at','preflight_sha256','closed_at','observations']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['state','owner_token','preparing_at','send_started_at','completed_at','preflight_sha256','closed_at','observations']) THEN
  RAISE EXCEPTION 'Engineering conversion authorization is immutable';
 END IF;
 IF OLD.closed_at IS NOT NULL AND NEW.closed_at IS DISTINCT FROM OLD.closed_at OR OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL AND NEW.closed_at>clock_timestamp()+interval '5 seconds' THEN
  RAISE EXCEPTION 'Engineering conversion closure is terminal';
 END IF;
 IF NEW.state=OLD.state THEN
  IF (to_jsonb(NEW)-'closed_at') IS DISTINCT FROM (to_jsonb(OLD)-'closed_at') THEN RAISE EXCEPTION 'Conversion state cannot be rewritten'; END IF;
  RETURN NEW;
 END IF;
 IF NOT ((OLD.state='ready' AND NEW.state='preparing') OR (OLD.state='preparing' AND NEW.state IN ('sending','preflight_failed')) OR
   (OLD.state='sending' AND NEW.state IN ('converted','rejected','outcome_unknown')) OR (OLD.state='outcome_unknown' AND NEW.state IN ('converted','rejected'))) THEN
  RAISE EXCEPTION 'Engineering conversion transition cannot replay';
 END IF;
 IF OLD.state<>'ready' AND (NEW.owner_token IS DISTINCT FROM OLD.owner_token OR NEW.preparing_at IS DISTINCT FROM OLD.preparing_at) THEN
  RAISE EXCEPTION 'Engineering conversion owner cannot change';
 END IF;
 IF OLD.send_started_at IS NOT NULL AND (NEW.send_started_at IS DISTINCT FROM OLD.send_started_at OR NEW.preflight_sha256 IS DISTINCT FROM OLD.preflight_sha256) THEN
  RAISE EXCEPTION 'Engineering conversion send cannot restart';
 END IF;
 IF NEW.state IN ('preparing','sending') THEN
  PERFORM public.lock_gelato_submission_root(NEW.submission_id);
  IF NEW.closed_at IS NOT NULL OR NOT public.gelato_engineering_conversion_matches(NEW.id) THEN RAISE EXCEPTION 'Engineering conversion authority expired or changed'; END IF;
 END IF;
 IF NEW.state='preparing' AND (NEW.owner_token IS NULL OR NEW.preparing_at IS NULL OR NEW.send_started_at IS NOT NULL OR NEW.closed_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Engineering conversion preparation invalid';
 END IF;
 IF NEW.state='sending' AND (OLD.closed_at IS NOT NULL OR NEW.send_started_at IS NULL OR NEW.preflight_sha256 IS NULL OR NEW.completed_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Engineering conversion send invalid';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_gelato_engineering_conversion ON public.gelato_engineering_conversions;
CREATE TRIGGER guard_gelato_engineering_conversion BEFORE INSERT OR UPDATE OR DELETE ON public.gelato_engineering_conversions
 FOR EACH ROW EXECUTE FUNCTION public.guard_gelato_engineering_conversion();

CREATE OR REPLACE FUNCTION public.gelato_engineering_conversion_matches(p_id uuid) RETURNS boolean
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE a public.gelato_engineering_conversions%ROWTYPE; s public.print_provider_submissions%ROWTYPE; expected bigint[]; actual bigint[];
BEGIN
 SELECT * INTO a FROM public.gelato_engineering_conversions WHERE id=p_id;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.print_provider_dispatch_gates WHERE provider='gelato' AND enabled=false) OR a.closed_at IS NOT NULL OR a.opened_at>clock_timestamp() OR a.expires_at<=clock_timestamp() OR
  a.funding_inspected_at>clock_timestamp() OR a.funding_inspected_at<clock_timestamp()-interval '15 minutes' OR NOT a.no_payment_routes_confirmed THEN RETURN false; END IF;
 SELECT * INTO s FROM public.print_provider_submissions WHERE id=a.submission_id;
 IF NOT FOUND OR s.provider<>'gelato' OR s.request_state<>'submitted' OR s.root_order_id !~ '^TEST-GELATO-[A-Za-z0-9-]{1,38}$' OR
  s.accepted_root_order_id IS DISTINCT FROM a.provider_root_id OR s.request_snapshot->'request'->>'orderType' IS DISTINCT FROM 'draft' OR
  NOT public.gelato_submission_is_engineering_test(s.id) THEN RETURN false; END IF;
 SELECT array_agg((v->>'child_order_id')::bigint ORDER BY (v->>'child_order_id')::bigint) INTO expected FROM jsonb_array_elements(a.artifacts) v;
 SELECT array_agg(child_order_id ORDER BY child_order_id) INTO actual FROM public.print_provider_submission_items WHERE submission_id=s.id;
 IF expected IS DISTINCT FROM actual OR cardinality(expected) NOT BETWEEN 1 AND 2 OR
   (SELECT count(DISTINCT id) FROM unnest(expected) id)<>cardinality(expected) THEN RETURN false; END IF;
 IF (SELECT count(*) FROM public.print_provider_submission_orders WHERE submission_id=s.id)<>1 OR NOT EXISTS(
  SELECT 1 FROM public.print_provider_submission_orders WHERE submission_id=s.id AND provider_order_id=a.provider_root_id AND order_type='draft') THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.print_provider_submission_items i JOIN public.orders o ON o.id=i.child_order_id
  LEFT JOIN LATERAL (SELECT v FROM jsonb_array_elements(a.artifacts) v WHERE (v->>'child_order_id')::bigint=i.child_order_id) f ON true
  WHERE i.submission_id=s.id AND (o."orderId" !~ '^TEST-GELATO-[A-Za-z0-9-]{1,38}$' OR
   coalesce(o.book_specs->'testMode','false'::jsonb)<>'true'::jsonb OR o.print_provider IS DISTINCT FROM 'gelato' OR
   o.print_config_version IS NULL OR o.print_config_version<2 OR o.print_expected_pdf_page_count IS DISTINCT FROM 35 OR i.pdf_page_count IS DISTINCT FROM 35 OR
   o.print_submission_id IS DISTINCT FROM s.id OR o.print_claim_token IS DISTINCT FROM s.claim_token OR
   i.child_order_key IS DISTINCT FROM o."orderId" OR coalesce(o.root_order_id,o.amazon_order_id,o."orderId") IS DISTINCT FROM s.root_order_id OR i.provider_order_id IS DISTINCT FROM a.provider_root_id OR
   i.provider_item_id IS NULL OR i.artifact_key IS NULL OR i.artifact_fingerprint IS NULL OR i.artifact_fingerprint !~ '^[a-f0-9]{24}$' OR
   i.artifact_key IS DISTINCT FROM o.print_book_id||'/orders/'||o."orderId"||'/gelato/print/v'||o.print_config_version||'/'||i.artifact_fingerprint||'.pdf' OR
   f.v->>'artifact_key' IS DISTINCT FROM i.artifact_key OR f.v->>'provider_item_id' IS DISTINCT FROM i.provider_item_id)) THEN RETURN false; END IF;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.begin_gelato_engineering_conversion(p_id uuid,p_key_sha256 text) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE a public.gelato_engineering_conversions%ROWTYPE; token uuid;
BEGIN
 SELECT * INTO STRICT a FROM public.gelato_engineering_conversions WHERE id=p_id FOR UPDATE;
 PERFORM public.lock_gelato_submission_root(a.submission_id);
 IF a.state<>'ready' OR a.account_key_sha256 IS DISTINCT FROM p_key_sha256 OR NOT public.gelato_engineering_conversion_matches(a.id) THEN
  RAISE EXCEPTION 'Engineering conversion is not authorized'; END IF;
 token:=gen_random_uuid();
 UPDATE public.gelato_engineering_conversions SET state='preparing',owner_token=token,preparing_at=clock_timestamp() WHERE id=a.id RETURNING * INTO a;
 RETURN to_jsonb(a);
END $$;
CREATE OR REPLACE FUNCTION public.authorize_gelato_engineering_conversion_send(p_id uuid,p_token uuid,p_key_sha256 text,p_preflight_sha256 text) RETURNS void
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE a public.gelato_engineering_conversions%ROWTYPE;
BEGIN
 SELECT * INTO STRICT a FROM public.gelato_engineering_conversions WHERE id=p_id FOR UPDATE;
 PERFORM public.lock_gelato_submission_root(a.submission_id);
 IF a.state<>'preparing' OR a.owner_token IS DISTINCT FROM p_token OR a.account_key_sha256 IS DISTINCT FROM p_key_sha256 OR
  p_preflight_sha256 IS NULL OR p_preflight_sha256 !~ '^[a-f0-9]{64}$' OR NOT public.gelato_engineering_conversion_matches(a.id) THEN
  RAISE EXCEPTION 'Engineering conversion send is not authorized'; END IF;
 UPDATE public.gelato_engineering_conversions SET state='sending',send_started_at=clock_timestamp(),preflight_sha256=p_preflight_sha256 WHERE id=a.id;
END $$;
CREATE OR REPLACE FUNCTION public.finish_gelato_engineering_conversion(p_id uuid,p_token uuid,p_state text,p_observations jsonb) RETURNS void
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE a public.gelato_engineering_conversions%ROWTYPE;
BEGIN
 SELECT * INTO STRICT a FROM public.gelato_engineering_conversions WHERE id=p_id FOR UPDATE;
 IF a.owner_token IS DISTINCT FROM p_token OR p_observations IS NULL OR jsonb_typeof(p_observations)<>'object' OR
  NOT ((a.state='preparing' AND p_state='preflight_failed') OR
       (a.state='sending' AND p_state IN ('converted','rejected','outcome_unknown')) OR
       (a.state='outcome_unknown' AND p_state IN ('converted','rejected'))) THEN RAISE EXCEPTION 'Engineering conversion result is not owned'; END IF;
 UPDATE public.gelato_engineering_conversions SET state=p_state,observations=p_observations,completed_at=clock_timestamp() WHERE id=a.id;
END $$;
CREATE OR REPLACE FUNCTION public.close_gelato_engineering_conversion(p_id uuid) RETURNS void
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE public.gelato_engineering_conversions SET closed_at=clock_timestamp() WHERE id=p_id AND closed_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.guard_gelato_engineering_conversion(),public.gelato_engineering_conversion_matches(uuid),
 public.begin_gelato_engineering_conversion(uuid,text),public.authorize_gelato_engineering_conversion_send(uuid,uuid,text,text),
 public.finish_gelato_engineering_conversion(uuid,uuid,text,jsonb),public.close_gelato_engineering_conversion(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_gelato_engineering_conversion(),public.gelato_engineering_conversion_matches(uuid),
 public.begin_gelato_engineering_conversion(uuid,text),public.authorize_gelato_engineering_conversion_send(uuid,uuid,text,text),
 public.finish_gelato_engineering_conversion(uuid,uuid,text,jsonb),public.close_gelato_engineering_conversion(uuid) TO service_role;
COMMIT;
