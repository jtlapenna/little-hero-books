BEGIN;
-- Preparation admission never grants provider-send or spending authority.
ALTER TABLE public.print_provider_submissions DROP CONSTRAINT IF EXISTS print_provider_submissions_request_state_check;
ALTER TABLE public.print_provider_submissions ADD CONSTRAINT print_provider_submissions_request_state_check
 CHECK (request_state IN ('claimed','operator_review','submitting','outcome_unknown','submitted','failed'));
ALTER TABLE public.print_provider_submissions
 ADD COLUMN IF NOT EXISTS operator_review_packet jsonb,
 ADD COLUMN IF NOT EXISTS operator_review_packet_sha256 text,
 ADD COLUMN IF NOT EXISTS operator_reviewed_at timestamptz,
 ADD COLUMN IF NOT EXISTS operator_approval_actor text,
 ADD COLUMN IF NOT EXISTS operator_approval_expires_at timestamptz,
 ADD COLUMN IF NOT EXISTS operator_approval_consumed_at timestamptz;

CREATE OR REPLACE FUNCTION public.admin_workflow_test_preparation_allowed(o jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path=public,pg_temp AS $f$
 SELECT coalesce(
 o#>'{product_info,_overnight_test}'='true'::jsonb AND o#>'{product_info,_created_via_csv}'='true'::jsonb
 AND o#>>'{product_info,_admin_workflow_test,schema}'='lhb.admin-workflow-test@v1'
 AND o#>>'{product_info,_admin_workflow_test,createdBy}' ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 AND o#>>'{product_info,_admin_workflow_test,bookId}'='book-finding-our-inner-voice'
 AND o#>>'{product_info,_admin_workflow_test,formatId}'='amazon'
 AND o#>>'{product_info,_admin_workflow_test,configVersion}'=o->>'print_config_version'
 AND o->>'print_book_id'='book-finding-our-inner-voice' AND o->>'print_format_id'='amazon' AND o->>'print_provider'='gelato'
 AND coalesce(o#>>'{product_info,_sibling_order}','false')='false'
 AND coalesce(o#>>'{product_info,_quantity_unit_count}','1')='1'
 AND coalesce(o->>'quantity',o#>>'{product_info,quantity}','1')='1'
 AND o->>'customer_approval_status'='approved' AND o#>>'{review_stages,postPdf,status}'='approved'
 AND nullif(o#>>'{product_info,_admin_workflow_test,preparePrintRequestedAt}','') IS NOT NULL,false)
$f$;

CREATE OR REPLACE FUNCTION public.gelato_admin_test_preparation_allowed(p_submission_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path=public,pg_temp AS $f$
 SELECT count(*)=1 AND bool_and(public.admin_workflow_test_preparation_allowed(to_jsonb(o)))
 FROM public.print_provider_submission_items i JOIN public.orders o ON o.id=i.child_order_id WHERE i.submission_id=p_submission_id
$f$;

DROP FUNCTION IF EXISTS public.request_admin_workflow_test_print_preparation(bigint,text);
CREATE OR REPLACE FUNCTION public.request_admin_workflow_test_print_preparation(p_order_id bigint,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE o public.orders%ROWTYPE; root_id text;
BEGIN
 SELECT coalesce(root_order_id,amazon_order_id,"orderId") INTO STRICT root_id FROM public.orders WHERE id=p_order_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('gelato-root:'||root_id,0));
 SELECT * INTO STRICT o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF (SELECT count(*) FROM public.orders WHERE coalesce(root_order_id,amazon_order_id,"orderId")=root_id)<>1
 OR o.product_info#>>'{_admin_workflow_test,createdBy}' IS DISTINCT FROM p_actor
 OR o.print_submission_id IS NOT NULL OR o.gelato_order_id IS NOT NULL OR o.current_workflow IS NOT NULL
 OR NOT (o.execution_status='done' OR (o.execution_status='ready_for_processing' AND o.next_workflow='4')) OR o.manifest_3_url IS NULL THEN RAISE EXCEPTION 'Workflow test is not ready for preparation'; END IF;
 o.product_info:=jsonb_set(o.product_info,'{_admin_workflow_test,preparePrintRequestedAt}',to_jsonb(clock_timestamp()));
 IF NOT public.admin_workflow_test_preparation_allowed(to_jsonb(o)) THEN RAISE EXCEPTION 'Workflow test approval required'; END IF;
 UPDATE public.orders SET product_info=o.product_info,next_workflow='4',execution_status='ready_for_processing',
 current_workflow=NULL,started_at=NULL,queued_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=o.id;
 RETURN jsonb_build_object('orderId',o."orderId",'next_workflow','4','execution_status','ready_for_processing','queuedOrderIds',jsonb_build_array(o."orderId"));
END $$;

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
  gate_open := gate_open OR public.gelato_engineering_dispatch_allowed(root_id,ids) OR
    (cardinality(ids)=1 AND cardinality(actual_ids)=1 AND public.admin_workflow_test_preparation_allowed(to_jsonb(o)));
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

CREATE OR REPLACE FUNCTION public.guard_gelato_owned_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE; root_id text; field text;
BEGIN
  IF OLD.print_submission_id IS NULL AND NEW.print_submission_id IS NULL THEN RETURN NEW; END IF;
  root_id := coalesce(OLD.root_order_id,to_jsonb(OLD)->>'amazon_order_id',OLD."orderId");
  IF NOT pg_try_advisory_xact_lock(hashtextextended('gelato-root:' || root_id,0)) THEN
    RAISE EXCEPTION 'Gelato root busy; retry order write';
  END IF;
  SELECT * INTO s FROM public.print_provider_submissions WHERE id = coalesce(OLD.print_submission_id,NEW.print_submission_id);
  IF s.request_state='operator_review' THEN
    IF NEW.print_submission_id IS DISTINCT FROM s.id OR NEW.print_claim_token IS DISTINCT FROM s.claim_token
       OR NEW.execution_status IS DISTINCT FROM 'done' OR NEW.current_workflow IS NOT NULL OR NEW.started_at IS NOT NULL OR NEW.next_workflow IS NOT NULL THEN
      RAISE EXCEPTION 'Prepared print is held for operator review'; END IF;
    FOREACH field IN ARRAY ARRAY['shipping_address','shipping_tier','shipping_tier_resolved','quantity','product_info','customer_email','customer_name','print_book_id','print_format_id','print_config_version','manifest_3_url'] LOOP
      IF (to_jsonb(NEW)->field) IS DISTINCT FROM (to_jsonb(OLD)->field) THEN RAISE EXCEPTION 'Prepared print inputs are frozen'; END IF;
    END LOOP;
  END IF;
  IF s.request_state IN ('claimed','submitting','outcome_unknown') THEN
    IF NEW.print_submission_id IS DISTINCT FROM s.id OR NEW.print_claim_token IS DISTINCT FROM s.claim_token
       OR NEW.execution_status IS DISTINCT FROM 'processing' OR NEW.current_workflow IS DISTINCT FROM '4'
       OR NEW.started_at IS NULL THEN RAISE EXCEPTION 'Gelato print recovery requires current provider ownership'; END IF;
    FOREACH field IN ARRAY ARRAY['shipping_address','shipping_tier','shipping_tier_resolved','quantity','product_info','customer_email','customer_name'] LOOP
      IF (to_jsonb(NEW)->field) IS DISTINCT FROM (to_jsonb(OLD)->field) THEN
        RAISE EXCEPTION 'Gelato quoted order inputs are frozen while owned';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.begin_gelato_print_submission(p_submission_id uuid, p_token uuid, p_execution_id text, p_request_fingerprint text)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE; current_refs text[]; normal_gate boolean;
BEGIN
  IF coalesce(length(p_execution_id),0) = 0 THEN RAISE EXCEPTION 'Missing print execution'; END IF;
  SELECT enabled INTO normal_gate FROM public.print_provider_dispatch_gates WHERE provider='gelato' FOR SHARE;
  PERFORM public.lock_gelato_submission_root(p_submission_id);
  SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id = p_submission_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.print_provider_submission_items i JOIN public.orders o ON o.id=i.child_order_id
      WHERE i.submission_id=s.id AND o.product_info ? '_admin_workflow_test') THEN
    IF NOT public.gelato_admin_test_preparation_allowed(s.id) OR s.operator_approval_actor IS NULL
       OR s.operator_review_packet IS NULL OR s.operator_approval_expires_at IS NULL OR s.operator_approval_expires_at<=clock_timestamp() OR s.operator_approval_consumed_at IS NOT NULL
       OR s.operator_review_packet#>'{quoteSnapshot}' IS DISTINCT FROM s.quote_snapshot
       OR s.operator_review_packet->>'claimToken' IS DISTINCT FROM p_token::text
       OR s.operator_review_packet->>'executionId' IS DISTINCT FROM p_execution_id
    THEN RAISE EXCEPTION 'Exact operator print authorization required'; END IF;
  END IF;
  -- Recheck after blocking locks: an authorization may expire while waiting.
  IF NOT (coalesce(normal_gate,false) OR public.gelato_engineering_submission_allowed(p_submission_id,p_token) OR public.gelato_admin_test_preparation_allowed(s.id)) THEN RAISE EXCEPTION 'Gelato dispatch disabled'; END IF;
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
  IF EXISTS (SELECT 1 FROM public.print_provider_submission_items i JOIN public.orders o ON o.id=i.child_order_id
      WHERE i.submission_id=s.id AND o.product_info ? '_admin_workflow_test') THEN
    IF NOT public.gelato_admin_test_preparation_allowed(s.id) OR s.operator_approval_actor IS NULL
       OR s.operator_review_packet IS NULL OR s.operator_approval_expires_at IS NULL OR s.operator_approval_expires_at<=clock_timestamp() OR s.operator_approval_consumed_at IS NOT NULL
       OR s.operator_review_packet#>'{quoteSnapshot}' IS DISTINCT FROM s.quote_snapshot
       OR s.operator_review_packet->>'claimToken' IS DISTINCT FROM p_token::text
       OR s.operator_review_packet->>'executionId' IS DISTINCT FROM p_execution_id
    THEN RAISE EXCEPTION 'Exact operator print authorization required'; END IF;
  END IF;
  -- Recheck after blocking locks: an authorization may expire while waiting.
  IF NOT (coalesce(normal_gate,false) OR public.gelato_engineering_submission_allowed(p_submission_id,p_token) OR public.gelato_admin_test_preparation_allowed(s.id)) THEN RAISE EXCEPTION 'Gelato dispatch disabled'; END IF;
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
  UPDATE public.print_provider_submissions SET send_started_at=clock_timestamp(),operator_approval_consumed_at=CASE WHEN operator_approval_actor IS NOT NULL THEN clock_timestamp() ELSE NULL END WHERE id=s.id;
END $$;

CREATE OR REPLACE FUNCTION public.begin_gelato_reconciliation(p_submission_id uuid,p_execution_id text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE; token uuid;
BEGIN
 PERFORM public.lock_gelato_submission_root(p_submission_id);
 SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id=p_submission_id FOR UPDATE;
 IF s.request_state IN ('submitted','failed','operator_review') OR s.lease_expires_at>clock_timestamp() THEN RETURN jsonb_build_object('recover',false); END IF;
 IF s.request_state IN ('claimed','submitting') THEN
   PERFORM public.fence_gelato_print_submission(s.id,s.claim_token);
   SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id=s.id;
   IF s.request_state='failed' THEN RETURN jsonb_build_object('recover',false,'released',true); END IF;
 END IF;
 IF s.request_state<>'outcome_unknown' OR s.send_started_at IS NULL OR s.request_snapshot IS NULL OR coalesce(p_execution_id,'')='' THEN RAISE EXCEPTION 'Gelato reconciliation evidence missing'; END IF;
 token:=gen_random_uuid();
 UPDATE public.print_provider_submissions SET claim_token=token,owning_execution_id=p_execution_id,lease_expires_at=clock_timestamp()+interval '15 minutes',action_reason='reconciling',updated_at=clock_timestamp() WHERE id=s.id;
 UPDATE public.orders o SET print_claim_token=token FROM public.print_provider_submission_items i WHERE i.submission_id=s.id AND o.id=i.child_order_id;
 RETURN jsonb_build_object('recover',true,'claimToken',token);
END $$;

CREATE OR REPLACE FUNCTION public.hold_admin_workflow_test_print(p_submission_id uuid,p_token uuid,p_packet jsonb,p_packet_sha256 text)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE;
BEGIN
 PERFORM public.lock_gelato_submission_root(p_submission_id);
 SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id=p_submission_id FOR UPDATE;
 IF s.request_state='operator_review' AND s.claim_token=p_token THEN RETURN; END IF;
 IF s.request_state<>'claimed' OR s.claim_token IS DISTINCT FROM p_token OR s.lease_expires_at<=clock_timestamp()
 OR NOT public.gelato_admin_test_preparation_allowed(s.id) OR s.send_started_at IS NOT NULL OR s.accepted_root_order_id IS NOT NULL
 OR s.quote_snapshot IS NULL OR s.quote_claim_token IS DISTINCT FROM p_token OR s.quoted_at<clock_timestamp()-interval '15 minutes'
 OR p_packet->>'submissionId' IS DISTINCT FROM s.id::text OR p_packet->>'claimToken' IS DISTINCT FROM p_token::text
 OR p_packet->'quoteSnapshot' IS DISTINCT FROM s.quote_snapshot OR coalesce(p_packet_sha256,'') !~ '^[a-f0-9]{64}$'
 OR coalesce(p_packet->>'accountSha256','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Print preparation receipt mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM public.print_provider_submission_items i JOIN public.orders o ON o.id=i.child_order_id WHERE i.submission_id=s.id
 AND (o.print_submission_id IS DISTINCT FROM s.id OR o.print_claim_token IS DISTINCT FROM p_token)) THEN RAISE EXCEPTION 'Preparation ownership changed'; END IF;
 UPDATE public.print_provider_submissions SET request_state='operator_review',lease_expires_at=clock_timestamp(),
 owning_execution_id=NULL,operator_review_packet=p_packet,operator_review_packet_sha256=p_packet_sha256,
 operator_reviewed_at=clock_timestamp(),operator_approval_actor=NULL,operator_approval_expires_at=NULL,operator_approval_consumed_at=NULL,
 action_reason='operator_review_before_provider_submission',updated_at=clock_timestamp() WHERE id=s.id;
 UPDATE public.orders o SET execution_status='done',next_workflow=NULL,current_workflow=NULL,started_at=NULL,
 workflow_step='print_prepared',gelato_status='prepared',gelato_action_reason='operator_review_before_provider_submission',updated_at=clock_timestamp()
 FROM public.print_provider_submission_items i WHERE i.submission_id=s.id AND i.child_order_id=o.id;
END $$;

-- Refresh only renews the unsent claim; caller obtains a fresh quote and holds it again.
CREATE OR REPLACE FUNCTION public.refresh_admin_workflow_test_print(p_submission_id uuid,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE;
BEGIN
 PERFORM public.lock_gelato_submission_root(p_submission_id);
 SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id=p_submission_id FOR UPDATE;
 IF s.request_state<>'operator_review' OR s.send_started_at IS NOT NULL OR s.accepted_root_order_id IS NOT NULL
 OR NOT public.gelato_admin_test_preparation_allowed(s.id)
 OR EXISTS(SELECT 1 FROM public.print_provider_submission_items i JOIN public.orders o ON o.id=i.child_order_id
 WHERE i.submission_id=s.id AND o.product_info#>>'{_admin_workflow_test,createdBy}' IS DISTINCT FROM p_actor)
 THEN RAISE EXCEPTION 'Prepared print refresh refused'; END IF;
 UPDATE public.print_provider_submissions SET request_state='claimed',lease_expires_at=clock_timestamp()+interval '15 minutes',
 operator_review_packet=NULL,operator_review_packet_sha256=NULL,operator_reviewed_at=NULL,operator_approval_actor=NULL,
 operator_approval_expires_at=NULL,operator_approval_consumed_at=NULL,updated_at=clock_timestamp() WHERE id=s.id;
 UPDATE public.orders o SET execution_status='processing',current_workflow='4',started_at=clock_timestamp(),next_workflow=NULL
 FROM public.print_provider_submission_items i WHERE i.submission_id=s.id AND i.child_order_id=o.id;
 RETURN jsonb_build_object('submissionId',s.id,'claimToken',s.claim_token);
END $$;

CREATE OR REPLACE FUNCTION public.approve_admin_workflow_test_print(p_submission_id uuid,p_actor text,p_packet_sha256 text,p_account_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE;
BEGIN
 PERFORM public.lock_gelato_submission_root(p_submission_id);
 SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id=p_submission_id FOR UPDATE;
 IF s.request_state<>'operator_review' OR s.send_started_at IS NOT NULL OR s.accepted_root_order_id IS NOT NULL
 OR NOT public.gelato_admin_test_preparation_allowed(s.id) OR s.operator_review_packet_sha256 IS DISTINCT FROM p_packet_sha256
 OR s.operator_review_packet->>'accountSha256' IS DISTINCT FROM p_account_sha256
 OR s.operator_reviewed_at<clock_timestamp()-interval '5 minutes'
 OR s.quoted_at<clock_timestamp()-interval '5 minutes' OR s.operator_review_packet->'quoteSnapshot' IS DISTINCT FROM s.quote_snapshot
 OR EXISTS(SELECT 1 FROM public.print_provider_submission_items i JOIN public.orders o ON o.id=i.child_order_id
 WHERE i.submission_id=s.id AND (o.product_info#>>'{_admin_workflow_test,createdBy}' IS DISTINCT FROM p_actor
 OR o.print_submission_id IS DISTINCT FROM s.id OR o.print_claim_token IS DISTINCT FROM s.claim_token))
 THEN RAISE EXCEPTION 'Exact current print review required'; END IF;
 UPDATE public.print_provider_submissions SET request_state='claimed',lease_expires_at=clock_timestamp()+interval '5 minutes',
 operator_approval_actor=p_actor,operator_approval_expires_at=clock_timestamp()+interval '5 minutes',updated_at=clock_timestamp() WHERE id=s.id;
 UPDATE public.orders o SET execution_status='processing',current_workflow='4',started_at=clock_timestamp(),next_workflow=NULL
 FROM public.print_provider_submission_items i WHERE i.submission_id=s.id AND i.child_order_id=o.id;
 RETURN jsonb_build_object('submissionId',s.id,'claimToken',s.claim_token,'executionId',s.operator_review_packet->>'executionId');
END $$;
REVOKE ALL ON FUNCTION public.admin_workflow_test_preparation_allowed(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_workflow_test_preparation_allowed(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.gelato_admin_test_preparation_allowed(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gelato_admin_test_preparation_allowed(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.request_admin_workflow_test_print_preparation(bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_admin_workflow_test_print_preparation(bigint,text) TO service_role;
REVOKE ALL ON FUNCTION public.hold_admin_workflow_test_print(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hold_admin_workflow_test_print(uuid,uuid,jsonb,text) TO service_role;
REVOKE ALL ON FUNCTION public.refresh_admin_workflow_test_print(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_admin_workflow_test_print(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.approve_admin_workflow_test_print(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_admin_workflow_test_print(uuid,text,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.return_admin_workflow_test_print_hold(p_submission_id uuid,p_token uuid)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE;
BEGIN
 PERFORM public.lock_gelato_submission_root(p_submission_id);
 SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id=p_submission_id FOR UPDATE;
 IF s.request_state<>'claimed' OR s.claim_token IS DISTINCT FROM p_token OR s.send_started_at IS NOT NULL
 OR s.accepted_root_order_id IS NOT NULL OR NOT public.gelato_admin_test_preparation_allowed(s.id) THEN RAISE EXCEPTION 'Unsent preparation hold cannot be restored'; END IF;
 UPDATE public.print_provider_submissions SET request_state='operator_review',lease_expires_at=clock_timestamp(),owning_execution_id=NULL,
 operator_review_packet=NULL,operator_review_packet_sha256=NULL,operator_reviewed_at=NULL,operator_approval_actor=NULL,
 operator_approval_expires_at=NULL,operator_approval_consumed_at=NULL,action_reason='operator_review_refresh_required',updated_at=clock_timestamp() WHERE id=s.id;
 UPDATE public.orders o SET execution_status='done',next_workflow=NULL,current_workflow=NULL,started_at=NULL,
 workflow_step='print_prepared',gelato_status='prepared',gelato_action_reason='operator_review_refresh_required',updated_at=clock_timestamp()
 FROM public.print_provider_submission_items i WHERE i.submission_id=s.id AND i.child_order_id=o.id;
END $$;
REVOKE ALL ON FUNCTION public.return_admin_workflow_test_print_hold(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.return_admin_workflow_test_print_hold(uuid,uuid) TO service_role;
COMMIT;
