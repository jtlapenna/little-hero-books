-- Generated with cached Supabase CLI2.121.0: migration new gelato_admission_settlement.
-- No enrollment/backfill or normal gate/control changes; install only under separate rollout approval.
-- Durable exact-root/scope revocation, including cleanup that arrives before admission.
BEGIN;
CREATE TABLE IF NOT EXISTS public.gelato_admission_revocations (
 scope_id uuid PRIMARY KEY,
 root_order_id text NOT NULL UNIQUE CHECK(root_order_id ~ '^TEST-GELATO-[A-Za-z0-9-]+$' AND length(root_order_id)<=50),
 token_sha256 text NOT NULL CHECK(token_sha256 ~ '^[a-f0-9]{64}$'),
 account_key_sha256 text NOT NULL CHECK(account_key_sha256 ~ '^[a-f0-9]{64}$'),
 fixture_manifest_sha256 text NOT NULL CHECK(fixture_manifest_sha256 ~ '^[a-f0-9]{64}$'),
 child_order_ids bigint[] NOT NULL CHECK(cardinality(child_order_ids) BETWEEN 1 AND 2),
 revoked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.gelato_admission_revocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gelato_admission_revocations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.gelato_admission_revocations TO service_role;

CREATE OR REPLACE FUNCTION public.guard_gelato_admission_revocation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Admission revocation is permanent'; END IF;
 IF NEW.child_order_ids IS DISTINCT FROM ARRAY(SELECT DISTINCT id FROM unnest(NEW.child_order_ids) id ORDER BY id)
    OR EXISTS(SELECT 1 FROM unnest(NEW.child_order_ids) id WHERE id IS NULL OR id<=0)
    OR NEW.revoked_at>clock_timestamp() THEN RAISE EXCEPTION 'Invalid admission revocation'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_gelato_admission_revocation ON public.gelato_admission_revocations;
CREATE TRIGGER guard_gelato_admission_revocation BEFORE INSERT OR UPDATE OR DELETE ON public.gelato_admission_revocations
 FOR EACH ROW EXECUTE FUNCTION public.guard_gelato_admission_revocation();

CREATE OR REPLACE FUNCTION public.reject_revoked_gelato_admission()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 -- A post-lock command snapshot is required. Non-default isolation fails closed rather than reading a stale revocation snapshot.
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Admission requires read committed settlement'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gelato-root:'||NEW.root_order_id,0));
 IF TG_TABLE_NAME='gelato_isolation_scopes' THEN PERFORM pg_advisory_xact_lock(hashtextextended('gelato-admission-scope:'||(to_jsonb(NEW)->>'id'),0)); END IF;
 IF EXISTS(SELECT 1 FROM public.gelato_admission_revocations WHERE root_order_id=NEW.root_order_id)
    OR (TG_TABLE_NAME='gelato_isolation_scopes' AND EXISTS(SELECT 1 FROM public.gelato_admission_revocations WHERE scope_id=(to_jsonb(NEW)->>'id')::uuid))
 THEN RAISE EXCEPTION 'Admission permanently revoked'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_reject_revoked_gelato_window ON public.gelato_engineering_submission_windows;
CREATE TRIGGER a_reject_revoked_gelato_window BEFORE INSERT ON public.gelato_engineering_submission_windows
 FOR EACH ROW EXECUTE FUNCTION public.reject_revoked_gelato_admission();
DROP TRIGGER IF EXISTS a_reject_revoked_gelato_scope ON public.gelato_isolation_scopes;
CREATE TRIGGER a_reject_revoked_gelato_scope BEFORE INSERT ON public.gelato_isolation_scopes
 FOR EACH ROW EXECUTE FUNCTION public.reject_revoked_gelato_admission();

CREATE OR REPLACE FUNCTION public.revoke_gelato_admission(
 p_scope_id uuid,p_root_order_id text,p_token_sha256 text,p_account_key_sha256 text,p_fixture_manifest_sha256 text,p_child_order_ids bigint[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE f public.gelato_admission_revocations%ROWTYPE; s public.gelato_isolation_scopes%ROWTYPE;
 w public.gelato_engineering_submission_windows%ROWTYPE; scope_found boolean; window_found boolean;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Revocation requires read committed settlement'; END IF;
 IF p_scope_id IS NULL OR p_root_order_id IS NULL OR p_root_order_id !~ '^TEST-GELATO-[A-Za-z0-9-]+$' OR length(p_root_order_id)>50
    OR p_token_sha256 IS NULL OR p_token_sha256 !~ '^[a-f0-9]{64}$'
    OR p_account_key_sha256 IS NULL OR p_account_key_sha256 !~ '^[a-f0-9]{64}$'
    OR p_fixture_manifest_sha256 IS NULL OR p_fixture_manifest_sha256 !~ '^[a-f0-9]{64}$'
    OR p_child_order_ids IS NULL OR cardinality(p_child_order_ids) NOT BETWEEN 1 AND 2
    OR p_child_order_ids IS DISTINCT FROM ARRAY(SELECT DISTINCT id FROM unnest(p_child_order_ids) id ORDER BY id)
    OR EXISTS(SELECT 1 FROM unnest(p_child_order_ids) id WHERE id IS NULL OR id<=0)
 THEN RAISE EXCEPTION 'Invalid exact admission identity'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gelato-root:'||p_root_order_id,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('gelato-admission-scope:'||p_scope_id::text,0));
 -- A UUID and root cannot be rebound, even if no admitted authority was ever visible.
 FOR f IN SELECT * FROM public.gelato_admission_revocations WHERE scope_id=p_scope_id OR root_order_id=p_root_order_id LOOP
  IF f.scope_id IS DISTINCT FROM p_scope_id OR f.root_order_id IS DISTINCT FROM p_root_order_id OR f.token_sha256 IS DISTINCT FROM p_token_sha256
     OR f.account_key_sha256 IS DISTINCT FROM p_account_key_sha256 OR f.fixture_manifest_sha256 IS DISTINCT FROM p_fixture_manifest_sha256
     OR f.child_order_ids IS DISTINCT FROM p_child_order_ids THEN RAISE EXCEPTION 'Revocation identity differs'; END IF;
 END LOOP;
 FOR s IN SELECT * FROM public.gelato_isolation_scopes WHERE id=p_scope_id OR root_order_id=p_root_order_id FOR UPDATE LOOP
  IF s.id IS DISTINCT FROM p_scope_id OR s.root_order_id IS DISTINCT FROM p_root_order_id OR s.token_sha256 IS DISTINCT FROM p_token_sha256
     OR s.account_key_sha256 IS DISTINCT FROM p_account_key_sha256 OR s.fixture_manifest_sha256 IS DISTINCT FROM p_fixture_manifest_sha256
  THEN RAISE EXCEPTION 'Admitted identity differs'; END IF;
 END LOOP;
 scope_found:=s.id IS NOT NULL;
 SELECT * INTO w FROM public.gelato_engineering_submission_windows WHERE root_order_id=p_root_order_id FOR UPDATE;
 window_found:=FOUND;
 IF window_found AND (w.account_key_sha256 IS DISTINCT FROM p_account_key_sha256 OR w.fixture_manifest_sha256 IS DISTINCT FROM p_fixture_manifest_sha256
                      OR w.child_order_ids IS DISTINCT FROM p_child_order_ids) THEN RAISE EXCEPTION 'Parent identity differs'; END IF;
 IF scope_found AND NOT window_found THEN RAISE EXCEPTION 'Parent authority missing'; END IF;
 IF NOT scope_found AND f.scope_id IS NULL THEN
  -- Before admission, the trusted service-role caller must still identify only fresh synthetic fixtures.
  PERFORM id FROM public.orders WHERE id=ANY(p_child_order_ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.orders WHERE id=ANY(p_child_order_ids)
      AND coalesce(root_order_id,amazon_order_id,"orderId")=p_root_order_id AND "orderId" ~ '^TEST-GELATO-[A-Za-z0-9-]+$'
      AND book_specs->'testMode'='true'::jsonb AND print_provider='gelato' AND print_submission_id IS NULL AND print_claim_token IS NULL
      AND to_jsonb(orders)->>'gelato_order_id' IS NULL AND to_jsonb(orders)->>'gelato_status' IS NULL
      AND to_jsonb(orders)->>'lulu_job_id' IS NULL AND to_jsonb(orders)->>'lulu_status' IS NULL)<>cardinality(p_child_order_ids)
  THEN RAISE EXCEPTION 'Revocation requires fresh exact synthetic fixtures'; END IF;
 END IF;
 INSERT INTO public.gelato_admission_revocations(scope_id,root_order_id,token_sha256,account_key_sha256,fixture_manifest_sha256,child_order_ids)
 VALUES(p_scope_id,p_root_order_id,p_token_sha256,p_account_key_sha256,p_fixture_manifest_sha256,p_child_order_ids)
 ON CONFLICT(scope_id) DO NOTHING;
 SELECT * INTO STRICT f FROM public.gelato_admission_revocations WHERE scope_id=p_scope_id;
 IF f.root_order_id IS DISTINCT FROM p_root_order_id OR f.token_sha256 IS DISTINCT FROM p_token_sha256
    OR f.account_key_sha256 IS DISTINCT FROM p_account_key_sha256 OR f.fixture_manifest_sha256 IS DISTINCT FROM p_fixture_manifest_sha256
    OR f.child_order_ids IS DISTINCT FROM p_child_order_ids THEN RAISE EXCEPTION 'Concurrent revocation identity differs'; END IF;
 -- Constraint conflict on a different root/scope fails the transaction; no uncertain identity is closed.
 IF scope_found THEN
  PERFORM public.close_gelato_isolation_scope(p_scope_id,p_token_sha256);
  IF s.submission_id IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM public.gelato_scheduled_status WHERE submission_id=s.submission_id AND
       (engineering_scope_id IS DISTINCT FROM p_scope_id OR account_key_sha256 IS DISTINCT FROM p_account_key_sha256))
   THEN RAISE EXCEPTION 'Registration ownership differs'; END IF;
   UPDATE public.gelato_scheduled_status SET enabled=false,lease_token=NULL,lease_expires_at=NULL
     WHERE submission_id=s.submission_id AND engineering_scope_id=p_scope_id AND account_key_sha256=p_account_key_sha256;
  END IF;
 END IF;
 IF window_found AND w.closed_at IS NULL THEN
  UPDATE public.gelato_engineering_submission_windows SET closed_at=clock_timestamp() WHERE root_order_id=p_root_order_id AND closed_at IS NULL;
 END IF;
 RETURN jsonb_build_object('revoked',true,'scopeId',p_scope_id,'rootOrderId',p_root_order_id,'scopePresent',scope_found,
   'parentPresent',window_found,'scopeClosed',true,'parentClosed',true,'registrationDisabled',true,'leaseCleared',true,'customerMessages',false);
END $$;

REVOKE ALL ON FUNCTION public.guard_gelato_admission_revocation(),public.reject_revoked_gelato_admission(),
 public.revoke_gelato_admission(uuid,text,text,text,text,bigint[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_gelato_admission_revocation(),public.reject_revoked_gelato_admission(),
 public.revoke_gelato_admission(uuid,text,text,text,text,bigint[]) TO service_role;
COMMIT;
