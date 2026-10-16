-- Exact synthetic cohorts only. Normal dispatch and runtime flags are unchanged.
-- Apply after migration-gelato-engineering-notification-suppression.sql while OFF.
BEGIN;
CREATE TABLE IF NOT EXISTS public.gelato_engineering_submission_windows (
 root_order_id text PRIMARY KEY CHECK(root_order_id ~ '^TEST-GELATO-[A-Za-z0-9-]+$' AND length(root_order_id)<=50),
 child_order_ids bigint[] NOT NULL CHECK(cardinality(child_order_ids) BETWEEN 1 AND 2),
 opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 closed_at timestamptz,
 account_key_sha256 text NOT NULL CHECK(account_key_sha256 ~ '^[a-f0-9]{64}$'),
 fixture_manifest_sha256 text NOT NULL CHECK(fixture_manifest_sha256 ~ '^[a-f0-9]{64}$'),
 evidence_run_id text NOT NULL CHECK(evidence_run_id ~ '^[A-Za-z0-9-]{1,100}$'),
 CHECK(expires_at>opened_at AND expires_at<=opened_at+interval '30 minutes')
);
ALTER TABLE public.gelato_engineering_submission_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gelato_engineering_submission_windows FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.gelato_engineering_submission_windows FROM service_role;
GRANT SELECT,INSERT ON public.gelato_engineering_submission_windows TO service_role;
GRANT UPDATE(closed_at) ON public.gelato_engineering_submission_windows TO service_role;

CREATE OR REPLACE FUNCTION public.guard_gelato_engineering_window()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF (to_jsonb(NEW)-'closed_at') IS DISTINCT FROM (to_jsonb(OLD)-'closed_at') OR
    (OLD.closed_at IS NOT NULL AND NEW.closed_at IS DISTINCT FROM OLD.closed_at) OR NEW.closed_at IS NULL THEN
   RAISE EXCEPTION 'Engineering window is immutable and may only be closed once';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_gelato_engineering_window() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_gelato_engineering_window() TO service_role;
DROP TRIGGER IF EXISTS guard_gelato_engineering_window ON public.gelato_engineering_submission_windows;
CREATE TRIGGER guard_gelato_engineering_window BEFORE UPDATE ON public.gelato_engineering_submission_windows
 FOR EACH ROW EXECUTE FUNCTION public.guard_gelato_engineering_window();

CREATE OR REPLACE FUNCTION public.gelato_engineering_dispatch_allowed(p_root text,p_child_ids bigint[])
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE win public.gelato_engineering_submission_windows%ROWTYPE; ids bigint[]; actual_ids bigint[];
BEGIN
 IF p_root IS NULL OR p_root !~ '^TEST-GELATO-[A-Za-z0-9-]+$' OR cardinality(p_child_ids) NOT BETWEEN 1 AND 2 THEN RETURN false; END IF;
 SELECT * INTO win FROM public.gelato_engineering_submission_windows WHERE root_order_id=p_root FOR SHARE;
 IF NOT FOUND OR win.closed_at IS NOT NULL OR win.opened_at>clock_timestamp() OR win.expires_at<=clock_timestamp() THEN RETURN false; END IF;
 SELECT array_agg(id ORDER BY id) INTO ids FROM unnest(p_child_ids) id;
 IF ids IS DISTINCT FROM win.child_order_ids OR cardinality(ids)<>(SELECT count(DISTINCT id) FROM unnest(ids) id) THEN RETURN false; END IF;
 SELECT array_agg(id ORDER BY id) INTO actual_ids FROM public.orders WHERE coalesce(root_order_id,amazon_order_id,"orderId")=p_root;
 IF actual_ids IS DISTINCT FROM ids THEN RETURN false; END IF;
 RETURN NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.id=ANY(ids) AND
   (o."orderId" !~ '^TEST-GELATO-[A-Za-z0-9-]+$' OR o.book_specs->'testMode' IS DISTINCT FROM 'true'::jsonb OR
    o.print_provider IS DISTINCT FROM 'gelato' OR o.print_config_version<2 OR o.print_expected_pdf_page_count IS DISTINCT FROM 35));
END $$;

CREATE OR REPLACE FUNCTION public.gelato_engineering_submission_allowed(p_submission_id uuid,p_token uuid,p_key_sha256 text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE; ids bigint[];
BEGIN
 SELECT * INTO s FROM public.print_provider_submissions WHERE id=p_submission_id;
 IF NOT FOUND OR s.provider<>'gelato' OR s.claim_token IS DISTINCT FROM p_token THEN RETURN false; END IF;
 SELECT array_agg(child_order_id ORDER BY child_order_id) INTO ids FROM public.print_provider_submission_items WHERE submission_id=s.id;
 IF NOT public.gelato_engineering_dispatch_allowed(s.root_order_id,ids) THEN RETURN false; END IF;
 IF p_key_sha256 IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.gelato_engineering_submission_windows WHERE root_order_id=s.root_order_id AND account_key_sha256=p_key_sha256) THEN RETURN false; END IF;
 RETURN public.gelato_submission_is_engineering_test(s.id);
END $$;
REVOKE ALL ON FUNCTION public.gelato_engineering_dispatch_allowed(text,bigint[]),public.gelato_engineering_submission_allowed(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gelato_engineering_dispatch_allowed(text,bigint[]),public.gelato_engineering_submission_allowed(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_gelato_print_submission(
  p_routes jsonb, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  r jsonb;
  o public.orders%ROWTYPE;
  s public.print_provider_submissions%ROWTYPE;
  ids bigint[];
  actual_ids bigint[];
  root_id text;
  group_id text;
  new_token uuid;
  gate_open boolean;
  destination jsonb;
BEGIN
  IF jsonb_typeof(p_routes) <> 'array' OR jsonb_array_length(p_routes) = 0
     OR jsonb_array_length(p_routes) > 100 OR coalesce(length(p_idempotency_key),0) = 0 THEN
    RAISE EXCEPTION 'Invalid print claim';
  END IF;
  SELECT enabled INTO STRICT gate_open FROM public.print_provider_dispatch_gates WHERE provider = 'gelato' FOR SHARE;
  SELECT array_agg((v->>'orderDbId')::bigint ORDER BY (v->>'orderDbId')::bigint) INTO ids FROM jsonb_array_elements(p_routes) v;
  IF cardinality(ids) <> (SELECT count(DISTINCT v) FROM unnest(ids) v) THEN RAISE EXCEPTION 'Duplicate print membership'; END IF;
  root_id := p_routes->0->>'rootOrderId';
  IF coalesce(length(root_id),0) = 0 THEN RAISE EXCEPTION 'Missing print root'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('gelato-root:' || root_id,0));
  PERFORM id FROM public.orders WHERE id = ANY(ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.orders WHERE id = ANY(ids)) <> cardinality(ids) THEN RAISE EXCEPTION 'Missing print order'; END IF;
  SELECT array_agg(id ORDER BY id) INTO actual_ids FROM public.orders WHERE coalesce(root_order_id,to_jsonb(orders)->>'amazon_order_id',"orderId") = root_id;
  IF cardinality(actual_ids) > 1 AND actual_ids <> ids THEN RAISE EXCEPTION 'Incomplete print group'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_routes) LOOP
    SELECT * INTO STRICT o FROM public.orders WHERE id = (r->>'orderDbId')::bigint;
    IF r->>'provider' IS DISTINCT FROM 'gelato' OR r->>'bookId' IS DISTINCT FROM 'book-finding-our-inner-voice'
       OR coalesce((r->>'configVersion')::integer,0) < 2 OR coalesce((r->>'innerPageCount')::integer,0) <> 32
       OR coalesce((r->>'apiPageCount')::integer,0) < 1 OR coalesce((r->>'expectedPdfPageCount')::integer,0) <> 35 OR coalesce(length(r->>'productUid'),0) = 0
       OR r->>'rootOrderId' IS DISTINCT FROM root_id
       OR o."orderId" IS DISTINCT FROM r->>'orderId'
       OR coalesce(o.root_order_id,to_jsonb(o)->>'amazon_order_id',o."orderId") IS DISTINCT FROM root_id
       OR (r - 'orderDbId' - 'orderId' - 'formatId') IS DISTINCT FROM ((p_routes->0) - 'orderDbId' - 'orderId' - 'formatId') THEN
      RAISE EXCEPTION 'Invalid frozen print routing';
    END IF;
    IF cardinality(ids) > 1 THEN
      IF destination IS NULL THEN destination := public.gelato_print_destination_key(to_jsonb(o)->'shipping_address'); END IF;
      IF public.gelato_print_destination_key(to_jsonb(o)->'shipping_address') IS DISTINCT FROM destination THEN RAISE EXCEPTION 'Print destination mismatch'; END IF;
    END IF;
    IF (o.print_provider IS NOT NULL AND o.print_provider <> 'gelato')
       OR (o.print_config_version IS NOT NULL AND o.print_config_version IS DISTINCT FROM (r->>'configVersion')::integer)
       OR (o.print_product_uid IS NOT NULL AND o.print_product_uid IS DISTINCT FROM r->>'productUid')
       OR (o.print_inner_page_count IS NOT NULL AND o.print_inner_page_count IS DISTINCT FROM (r->>'innerPageCount')::integer)
       OR (o.print_api_page_count IS NOT NULL AND o.print_api_page_count IS DISTINCT FROM (r->>'apiPageCount')::integer)
       OR (o.print_expected_pdf_page_count IS NOT NULL AND o.print_expected_pdf_page_count IS DISTINCT FROM (r->>'expectedPdfPageCount')::integer) THEN
      RAISE EXCEPTION 'Frozen print assignment mismatch';
    END IF;
    UPDATE public.orders SET print_provider = 'gelato', print_config_version = (r->>'configVersion')::integer,
      print_product_uid = r->>'productUid', print_inner_page_count = (r->>'innerPageCount')::integer,
      print_api_page_count = (r->>'apiPageCount')::integer,
      print_expected_pdf_page_count = (r->>'expectedPdfPageCount')::integer,
      print_book_id = r->>'bookId', print_format_id = r->>'formatId',
      print_manifest_key = (r->>'bookId') || '/orders/' || (r->>'orderId') || '/manifests/1-manifest.json' WHERE id = o.id;
  END LOOP;
  gate_open := gate_open OR public.gelato_engineering_dispatch_allowed(root_id,ids);
  IF NOT gate_open THEN RETURN jsonb_build_object('dispatch',false,'reason','gate_closed'); END IF;
  group_id := CASE WHEN cardinality(ids) = 1 THEN 'order:' || ids[1] ELSE 'group:' || root_id END;
  SELECT * INTO s FROM public.print_provider_submissions WHERE provider = 'gelato' AND logical_group = group_id FOR UPDATE;
  IF FOUND THEN
    SELECT array_agg(child_order_id ORDER BY child_order_id) INTO actual_ids FROM public.print_provider_submission_items WHERE submission_id = s.id;
    IF actual_ids IS DISTINCT FROM ids OR s.workflow_job_idempotency_key <> p_idempotency_key THEN RAISE EXCEPTION 'Print submission membership mismatch'; END IF;
    IF s.request_state <> 'failed' THEN
      RETURN jsonb_build_object('dispatch',false,'reason',s.request_state,'submissionId',s.id);
    END IF;
    IF EXISTS (SELECT 1 FROM public.orders WHERE id = ANY(ids) AND
        (execution_status IS DISTINCT FROM 'ready_for_processing' OR print_submission_id IS DISTINCT FROM s.id OR print_claim_token IS DISTINCT FROM s.claim_token)) THEN
      RAISE EXCEPTION 'Print resume ownership mismatch';
    END IF;
    IF s.send_started_at IS NOT NULL THEN RAISE EXCEPTION 'Gelato consumed send requires reconciliation'; END IF;
    new_token := gen_random_uuid();
    UPDATE public.print_provider_submissions SET claim_token = new_token, lease_expires_at = clock_timestamp()+interval '15 minutes',
      request_state = 'claimed', owning_execution_id = NULL, quote_snapshot = NULL, request_snapshot = NULL, send_started_at = NULL, accepted_root_order_id = NULL, action_reason = NULL, quote_id = NULL, shipment_method_uid = NULL,
      shipment_policy_version = NULL, quoted_at = NULL, quote_item_reference_ids = '{}', quote_request_fingerprint = NULL, quote_claim_token = NULL, updated_at = clock_timestamp() WHERE id = s.id;
    UPDATE public.orders SET print_claim_token = new_token, execution_status = 'processing', current_workflow = '4', started_at = clock_timestamp() WHERE id = ANY(ids);
    RETURN jsonb_build_object('dispatch',true,'submissionId',s.id,'claimToken',new_token,'orderReferenceId',s.order_reference_id);
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE id = ANY(ids) AND
      (execution_status IS DISTINCT FROM 'ready_for_processing' OR next_workflow NOT IN ('4','4-aggregate') OR next_workflow IS NULL
       OR print_submission_id IS NOT NULL OR print_claim_token IS NOT NULL)) THEN
    RAISE EXCEPTION 'Print group is not claimable';
  END IF;
  new_token := gen_random_uuid();
  INSERT INTO public.print_provider_submissions(provider,order_reference_id,workflow_job_idempotency_key,logical_group,root_order_id,claim_token,lease_expires_at,request_state)
  VALUES ('gelato','lhb-gelato-' || gen_random_uuid(),p_idempotency_key,group_id,root_id,new_token,clock_timestamp()+interval '15 minutes','claimed') RETURNING * INTO s;
  INSERT INTO public.print_provider_submission_items(submission_id,item_reference_id,child_order_id,child_order_key)
    SELECT s.id,'lhb-item-' || id,id,"orderId" FROM public.orders WHERE id = ANY(ids);
  UPDATE public.orders SET print_submission_id = s.id, print_claim_token = new_token,
    execution_status = 'processing', current_workflow = '4', started_at = clock_timestamp() WHERE id = ANY(ids);
  RETURN jsonb_build_object('dispatch',true,'submissionId',s.id,'claimToken',new_token,'orderReferenceId',s.order_reference_id);
END $$;

CREATE OR REPLACE FUNCTION public.begin_gelato_print_submission(p_submission_id uuid, p_token uuid, p_execution_id text, p_request_fingerprint text)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE; current_refs text[]; normal_gate boolean;
BEGIN
  IF coalesce(length(p_execution_id),0) = 0 THEN RAISE EXCEPTION 'Missing print execution'; END IF;
  SELECT enabled INTO normal_gate FROM public.print_provider_dispatch_gates WHERE provider='gelato' FOR SHARE;
  PERFORM public.lock_gelato_submission_root(p_submission_id);
  SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id = p_submission_id FOR UPDATE;
  -- Recheck after blocking locks: an authorization may expire while waiting.
  IF NOT (coalesce(normal_gate,false) OR public.gelato_engineering_submission_allowed(p_submission_id,p_token)) THEN RAISE EXCEPTION 'Gelato dispatch disabled'; END IF;
  IF s.claim_token IS DISTINCT FROM p_token OR s.lease_expires_at <= clock_timestamp() OR s.request_state <> 'claimed' THEN RAISE EXCEPTION 'Stale print claim'; END IF;
  IF coalesce(p_request_fingerprint,'') !~ '^[a-f0-9]{64}$' OR s.quote_request_fingerprint IS DISTINCT FROM p_request_fingerprint
     OR s.quote_claim_token IS DISTINCT FROM p_token OR s.quote_id IS NULL OR s.shipment_method_uid IS NULL OR s.shipment_policy_version IS NULL
     OR s.quoted_at IS NULL OR s.quoted_at > clock_timestamp() OR s.quoted_at < clock_timestamp()-interval '15 minutes' THEN
    RAISE EXCEPTION 'Current Gelato quote required before submission';
  END IF;
  SELECT array_agg(item_reference_id ORDER BY item_reference_id) INTO current_refs
    FROM public.print_provider_submission_items WHERE submission_id = s.id;
  IF current_refs IS NULL OR current_refs IS DISTINCT FROM s.quote_item_reference_ids THEN
    RAISE EXCEPTION 'Gelato quote membership changed before submission';
  END IF;
  IF EXISTS (SELECT 1 FROM public.print_provider_submission_items i JOIN public.orders o ON o.id = i.child_order_id
      WHERE i.submission_id = s.id AND (o.print_provider IS DISTINCT FROM 'gelato' OR o.print_submission_id IS DISTINCT FROM s.id OR o.print_claim_token IS DISTINCT FROM p_token)) THEN
    RAISE EXCEPTION 'Print claim ownership mismatch';
  END IF;
  IF s.quote_snapshot IS NULL THEN RAISE EXCEPTION 'Gelato quoted request snapshot is missing'; END IF;
  UPDATE public.print_provider_submissions SET request_state = 'submitting', request_snapshot=quote_snapshot, owning_execution_id = p_execution_id, updated_at = clock_timestamp() WHERE id = s.id;
END $$;

CREATE OR REPLACE FUNCTION public.authorize_gelato_print_send(p_submission_id uuid, p_token uuid, p_execution_id text, p_request_fingerprint text)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE; current_refs text[]; normal_gate boolean;
BEGIN
  SELECT enabled INTO normal_gate FROM public.print_provider_dispatch_gates WHERE provider='gelato' FOR SHARE;
  PERFORM public.lock_gelato_submission_root(p_submission_id);
  SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id = p_submission_id FOR UPDATE;
  -- Recheck after blocking locks: an authorization may expire while waiting.
  IF NOT (coalesce(normal_gate,false) OR public.gelato_engineering_submission_allowed(p_submission_id,p_token)) THEN RAISE EXCEPTION 'Gelato dispatch disabled'; END IF;
  IF s.claim_token IS DISTINCT FROM p_token OR s.lease_expires_at <= clock_timestamp()
     OR s.request_state <> 'submitting' OR s.owning_execution_id IS DISTINCT FROM p_execution_id THEN RAISE EXCEPTION 'Stale print sender'; END IF;
  IF coalesce(p_request_fingerprint,'') !~ '^[a-f0-9]{64}$' OR s.quote_request_fingerprint IS DISTINCT FROM p_request_fingerprint
     OR s.quote_claim_token IS DISTINCT FROM p_token OR s.quote_id IS NULL OR s.shipment_method_uid IS NULL OR s.shipment_policy_version IS NULL
     OR s.quoted_at IS NULL OR s.quoted_at > clock_timestamp() OR s.quoted_at < clock_timestamp()-interval '15 minutes' THEN
    RAISE EXCEPTION 'Current Gelato quote required before send';
  END IF;
  SELECT array_agg(item_reference_id ORDER BY item_reference_id) INTO current_refs
    FROM public.print_provider_submission_items WHERE submission_id = s.id;
  IF current_refs IS NULL OR current_refs IS DISTINCT FROM s.quote_item_reference_ids THEN
    RAISE EXCEPTION 'Gelato quote membership changed before send';
  END IF;
  IF EXISTS (SELECT 1 FROM public.print_provider_submission_items i LEFT JOIN public.orders o ON o.id = i.child_order_id
      WHERE i.submission_id = s.id AND (o.id IS NULL OR o.print_submission_id IS DISTINCT FROM s.id OR o.print_claim_token IS DISTINCT FROM p_token OR o.print_provider IS DISTINCT FROM 'gelato')) THEN
    RAISE EXCEPTION 'Print send ownership mismatch';
  END IF;
  IF s.send_started_at IS NOT NULL THEN RAISE EXCEPTION 'Gelato print request has already started'; END IF;
  UPDATE public.print_provider_submissions SET send_started_at=clock_timestamp() WHERE id=s.id;
END $$;

COMMIT;
