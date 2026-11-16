BEGIN;
-- Empty by default. Activation is an explicit, expiring decision for a concrete prepared test.
CREATE TABLE IF NOT EXISTS public.gelato_admin_test_release_scopes (
 order_id text PRIMARY KEY REFERENCES public.orders("orderId"),
 submission_id uuid NOT NULL UNIQUE REFERENCES public.print_provider_submissions(id),
 account_sha256 text NOT NULL CHECK(account_sha256 ~ '^[a-f0-9]{64}$'),
 approval_actor text NOT NULL CHECK(approval_actor ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)), enabled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.gelato_admin_test_release_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gelato_admin_test_release_scopes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.gelato_admin_test_release_scopes TO service_role;

CREATE OR REPLACE FUNCTION public.gelato_admin_test_release_scope_active(p_order_id text,p_account_sha256 text)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE scope public.gelato_admin_test_release_scopes%ROWTYPE; o public.orders%ROWTYPE; s public.print_provider_submissions%ROWTYPE;
BEGIN
 SELECT * INTO scope FROM public.gelato_admin_test_release_scopes WHERE order_id=p_order_id FOR SHARE;
 IF NOT FOUND OR NOT scope.enabled OR scope.account_sha256 IS DISTINCT FROM p_account_sha256
 OR scope.expires_at<=clock_timestamp() OR scope.expires_at>clock_timestamp()+interval '24 hours' THEN RETURN false; END IF;
 SELECT * INTO o FROM public.orders WHERE "orderId"=p_order_id;
 SELECT * INTO s FROM public.print_provider_submissions WHERE id=scope.submission_id;
 RETURN coalesce(s.operator_approval_consumed_at IS NOT NULL AND s.operator_approval_actor=scope.approval_actor AND s.operator_review_packet->>'accountSha256'=scope.account_sha256 AND o.print_submission_id=scope.submission_id AND public.admin_workflow_test_preparation_allowed(to_jsonb(o))
 AND o.product_info#>>'{_admin_workflow_test,createdBy}'=scope.approval_actor,false);
END $$;
CREATE OR REPLACE FUNCTION public.gelato_admin_test_release_permit_allowed(p_permit jsonb,p_actor text)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE scope public.gelato_admin_test_release_scopes%ROWTYPE;
BEGIN
 SELECT * INTO scope FROM public.gelato_admin_test_release_scopes WHERE submission_id::text=p_permit->>'submissionId' FOR SHARE;
 IF NOT FOUND OR scope.approval_actor IS DISTINCT FROM p_actor OR scope.account_sha256 IS DISTINCT FROM p_permit->>'accountSha256' THEN RETURN false; END IF;
 RETURN public.gelato_admin_test_release_scope_active(scope.order_id,scope.account_sha256);
END $$;
REVOKE ALL ON FUNCTION public.gelato_admin_test_release_scope_active(text,text),public.gelato_admin_test_release_permit_allowed(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gelato_admin_test_release_scope_active(text,text),public.gelato_admin_test_release_permit_allowed(jsonb,text) TO service_role;
CREATE OR REPLACE FUNCTION public.guard_gelato_ordinary_permit() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE fresh jsonb; root public.gelato_ordinary_release_roots%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Ordinary permit evidence cannot be deleted'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'ready' OR NEW.owner_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL OR NEW.send_started_at IS NOT NULL OR NEW.closed_at IS NOT NULL OR NEW.observation IS NOT NULL OR
   NEW.approved_at>clock_timestamp() OR NEW.expires_at<=clock_timestamp() OR NEW.id::text IS DISTINCT FROM NEW.permit->>'id' OR NEW.submission_id::text IS DISTINCT FROM NEW.permit->>'submissionId' OR
   NEW.provider_order_id IS DISTINCT FROM NEW.permit->>'providerOrderId' OR NEW.account_sha256 IS DISTINCT FROM NEW.permit->>'accountSha256' OR NEW.approved_at IS DISTINCT FROM(NEW.permit->>'approvedAt')::timestamptz OR NEW.expires_at IS DISTINCT FROM(NEW.permit->>'expiresAt')::timestamptz THEN RAISE EXCEPTION 'New ordinary permit must be exact and unused'; END IF;
  fresh:=public.gelato_ordinary_current_binding(NEW.submission_id);
  IF NEW.binding IS DISTINCT FROM fresh THEN RAISE EXCEPTION 'Ordinary initial binding differs'; END IF;
  PERFORM public.assert_gelato_ordinary_packet(NEW.permit,NEW.packet,fresh);
  RETURN NEW;
 END IF;
 IF(to_jsonb(NEW)-ARRAY['state','owner_token','lease_expires_at','send_started_at','closed_at','observation']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','owner_token','lease_expires_at','send_started_at','closed_at','observation']) OR OLD.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Ordinary approval is immutable or closed'; END IF;
 IF NOT((OLD.state='ready' AND NEW.state='preparing') OR(OLD.state='preparing' AND NEW.state IN('sending','preflight_failed','outcome_unknown')) OR
  (OLD.state='sending' AND NEW.state IN('converted','outcome_unknown','observing')) OR(OLD.state='outcome_unknown' AND NEW.state='observing') OR(OLD.state='observing' AND NEW.state IN('outcome_unknown','converted'))) THEN RAISE EXCEPTION 'Ordinary state cannot replay'; END IF;
 IF OLD.send_started_at IS NOT NULL AND NEW.send_started_at IS DISTINCT FROM OLD.send_started_at THEN RAISE EXCEPTION 'Ordinary send marker cannot change'; END IF;
 IF NEW.state IN('preparing','sending') THEN
  IF NOT (coalesce((SELECT enabled FROM public.gelato_ordinary_release_gate WHERE id=true FOR SHARE),false) OR public.gelato_admin_test_release_permit_allowed(NEW.permit,NEW.approval_actor)) OR NEW.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Ordinary release is disabled or expired'; END IF;
  fresh:=public.gelato_ordinary_current_binding(NEW.submission_id);
  IF fresh IS DISTINCT FROM NEW.binding THEN RAISE EXCEPTION 'Ordinary approved binding changed'; END IF;
  PERFORM public.assert_gelato_ordinary_packet(NEW.permit,NEW.packet,fresh);
 END IF;
 SELECT * INTO STRICT root FROM public.gelato_ordinary_release_roots WHERE provider_order_id=NEW.provider_order_id FOR UPDATE;
 IF root.owner_permit_id IS DISTINCT FROM NEW.id OR root.account_sha256 IS DISTINCT FROM NEW.account_sha256 OR root.submission_id IS DISTINCT FROM NEW.submission_id THEN RAISE EXCEPTION 'Ordinary root ownership differs'; END IF;
 IF NEW.state='converted' THEN
  IF NEW.owner_token IS DISTINCT FROM OLD.owner_token OR (OLD.lease_expires_at IS NULL OR OLD.lease_expires_at<=clock_timestamp()) THEN RAISE EXCEPTION 'Ordinary observation ownership expired';END IF;
  PERFORM public.assert_gelato_ordinary_observation(NEW.permit,NEW.binding,NEW.observation);
 END IF;
 IF NEW.state IN('preflight_failed','outcome_unknown') AND NEW.owner_token IS DISTINCT FROM OLD.owner_token AND OLD.lease_expires_at>clock_timestamp() THEN RAISE EXCEPTION 'Active ordinary owner cannot be replaced';END IF;
 IF NEW.state='preparing' AND(NEW.owner_token IS NULL OR NEW.lease_expires_at IS NULL OR NEW.lease_expires_at<=clock_timestamp() OR NEW.lease_expires_at>clock_timestamp()+interval '61 seconds' OR root.consumed_at IS NOT NULL) THEN RAISE EXCEPTION 'Invalid ordinary preparation';END IF;
 IF NEW.state IN('sending','observing') AND(NEW.lease_expires_at IS NULL OR NOT isfinite(NEW.lease_expires_at) OR NEW.lease_expires_at<=clock_timestamp() OR NEW.lease_expires_at>clock_timestamp()+interval '61 seconds') THEN RAISE EXCEPTION 'Ordinary active lease must be bounded';END IF;
 IF NEW.state='sending' AND(NEW.owner_token IS DISTINCT FROM OLD.owner_token OR (OLD.lease_expires_at IS NULL OR OLD.lease_expires_at<=clock_timestamp()) OR NEW.send_started_at IS NULL OR root.consumed_at IS NULL) THEN RAISE EXCEPTION 'Invalid ordinary send authority';END IF;
 IF NEW.state='preflight_failed' AND(OLD.send_started_at IS NOT NULL OR root.consumed_at IS NOT NULL) THEN RAISE EXCEPTION 'An attempted ordinary send cannot be reopened';END IF;
 IF NEW.state='observing' AND(OLD.state IN('sending','observing') AND OLD.lease_expires_at>clock_timestamp() OR NEW.owner_token IS NULL OR NEW.owner_token=OLD.owner_token OR NEW.lease_expires_at<=clock_timestamp()) THEN RAISE EXCEPTION 'Ordinary sender or observer still owns lease';END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.acquire_gelato_ordinary_release(p_id uuid,p_account_sha256 text) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE a public.gelato_ordinary_release_permits%ROWTYPE; root public.gelato_ordinary_release_roots%ROWTYPE; token uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO a FROM public.gelato_ordinary_release_permits WHERE id=p_id;
 IF NOT FOUND THEN RETURN '{"kind":"disabled"}'; END IF;
 PERFORM public.lock_gelato_submission_root(a.submission_id);
 SELECT * INTO STRICT root FROM public.gelato_ordinary_release_roots WHERE provider_order_id=a.provider_order_id FOR UPDATE;
 SELECT * INTO STRICT a FROM public.gelato_ordinary_release_permits WHERE id=p_id FOR UPDATE;
 IF NOT (coalesce((SELECT enabled FROM public.gelato_ordinary_release_gate WHERE id=true FOR SHARE),false) OR public.gelato_admin_test_release_permit_allowed(a.permit,a.approval_actor)) THEN RETURN '{"kind":"disabled"}';END IF;
 IF a.account_sha256 IS DISTINCT FROM p_account_sha256 THEN RAISE EXCEPTION 'Ordinary account differs';END IF;
 IF root.consumed_at IS NOT NULL OR a.state NOT IN('ready','preparing') THEN RETURN '{"kind":"already_attempted"}';END IF;
 IF root.owner_permit_id IS NOT NULL OR a.state='preparing' THEN RETURN '{"kind":"busy"}';END IF;
 UPDATE public.gelato_ordinary_release_roots SET owner_permit_id=p_id WHERE provider_order_id=a.provider_order_id;
 UPDATE public.gelato_ordinary_release_permits SET state='preparing',owner_token=token,lease_expires_at=clock_timestamp()+interval '60 seconds' WHERE id=p_id;
 RETURN jsonb_build_object('kind','acquired','permit',a.permit,'ownerToken',token);
END $$;

-- The signed-in print-review action may establish this exact scope only after
-- the same actor's separate pre-create approval was consumed and a draft saved.
-- Existing disabled/expired scopes are never re-enabled or extended by this RPC.
CREATE OR REPLACE FUNCTION public.register_admin_workflow_test_release_scope(p_order_id text,p_actor text,p_account_sha256 text,p_expires_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE o public.orders%ROWTYPE; s public.print_provider_submissions%ROWTYPE; scope public.gelato_admin_test_release_scopes%ROWTYPE;
BEGIN
 IF p_expires_at IS NULL OR NOT isfinite(p_expires_at) OR p_expires_at<=clock_timestamp() OR p_expires_at>clock_timestamp()+interval '24 hours'
 OR coalesce(p_account_sha256,'') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid exact print scope'; END IF;
 SELECT * INTO STRICT o FROM public.orders WHERE "orderId"=p_order_id;
 PERFORM public.lock_gelato_submission_root(o.print_submission_id);
 SELECT * INTO STRICT o FROM public.orders WHERE id=o.id FOR UPDATE;
 SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id=o.print_submission_id FOR UPDATE;
 IF NOT public.gelato_admin_test_preparation_allowed(s.id) OR s.request_state<>'submitted'
 OR s.operator_approval_actor IS DISTINCT FROM p_actor OR s.operator_approval_consumed_at IS NULL
 OR s.operator_review_packet->>'accountSha256' IS DISTINCT FROM p_account_sha256
 OR s.operator_review_packet->'quoteSnapshot' IS DISTINCT FROM s.request_snapshot
 OR o.product_info#>>'{_admin_workflow_test,createdBy}' IS DISTINCT FROM p_actor
 OR (SELECT count(*) FROM public.print_provider_submission_orders WHERE submission_id=s.id)<>1
 OR NOT EXISTS(SELECT 1 FROM public.print_provider_submission_orders WHERE submission_id=s.id AND provider_order_id=s.accepted_root_order_id AND order_type='draft')
 THEN RAISE EXCEPTION 'Exact approved workflow test draft required'; END IF;
 INSERT INTO public.gelato_admin_test_release_scopes(order_id,submission_id,account_sha256,approval_actor,expires_at,enabled)
 VALUES(p_order_id,s.id,p_account_sha256,p_actor,p_expires_at,true) ON CONFLICT(order_id) DO NOTHING;
 SELECT * INTO STRICT scope FROM public.gelato_admin_test_release_scopes WHERE order_id=p_order_id FOR SHARE;
 IF scope.submission_id IS DISTINCT FROM s.id OR scope.account_sha256 IS DISTINCT FROM p_account_sha256 OR scope.approval_actor IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Print activation scope differs'; END IF;
 RETURN public.gelato_admin_test_release_scope_active(scope.order_id,scope.account_sha256);
END $$;
REVOKE ALL ON FUNCTION public.register_admin_workflow_test_release_scope(text,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_admin_workflow_test_release_scope(text,text,text,timestamptz) TO service_role;
COMMIT;
