-- Generated with supabase migration new gelato_financial_observations.
-- Install before the new application; old refresh writers fail closed after revision advances.
BEGIN;
ALTER TABLE public.print_provider_submission_orders
  ADD COLUMN IF NOT EXISTS observation_revision bigint NOT NULL DEFAULT 0 CHECK(observation_revision>=0),
  ADD COLUMN IF NOT EXISTS financial_observation jsonb,
  ADD COLUMN IF NOT EXISTS financial_observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS financial_action_reason text;

CREATE OR REPLACE FUNCTION public.persist_gelato_print_result(p_submission_id uuid,p_token uuid,p_execution_id text,p_orders jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE; external jsonb; item jsonb; expected jsonb; refs text[]; actual text[]; changed integer;
BEGIN
  PERFORM public.lock_gelato_submission_root(p_submission_id);
  SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id=p_submission_id FOR UPDATE;
  IF s.claim_token IS DISTINCT FROM p_token OR s.owning_execution_id IS DISTINCT FROM p_execution_id OR s.send_started_at IS NULL OR
     s.request_state NOT IN ('submitting','outcome_unknown','submitted') OR s.request_snapshot IS NULL THEN RAISE EXCEPTION 'Stale Gelato result ownership'; END IF;
  IF jsonb_typeof(p_orders) IS DISTINCT FROM 'array' OR jsonb_array_length(p_orders)=0 OR jsonb_array_length(p_orders)>100 THEN RAISE EXCEPTION 'Invalid Gelato result graph'; END IF;
  SELECT array_agg(item_reference_id ORDER BY item_reference_id) INTO refs FROM public.print_provider_submission_items WHERE submission_id=s.id;
  SELECT array_agg(i->>'itemReferenceId' ORDER BY i->>'itemReferenceId') INTO actual FROM jsonb_array_elements(p_orders) e CROSS JOIN LATERAL jsonb_array_elements(e->'items') i;
  IF actual IS DISTINCT FROM refs THEN RAISE EXCEPTION 'Gelato result graph membership mismatch'; END IF;
  IF s.accepted_root_order_id IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_orders) e WHERE e->>'id'=s.accepted_root_order_id) THEN RAISE EXCEPTION 'Gelato accepted root missing'; END IF;
  IF (SELECT count(DISTINCT e->>'id') FROM jsonb_array_elements(p_orders) e)<>jsonb_array_length(p_orders) THEN RAISE EXCEPTION 'Duplicate Gelato external order'; END IF;
  IF (WITH RECURSIVE reachable(id) AS (
    SELECT s.accepted_root_order_id UNION
    SELECT cid FROM reachable r JOIN jsonb_array_elements(p_orders) e ON e->>'id'=r.id
    CROSS JOIN LATERAL jsonb_array_elements_text(e->'connectedOrderIds') cid
  ) SELECT count(DISTINCT id) FROM reachable)<>jsonb_array_length(p_orders) THEN RAISE EXCEPTION 'Gelato result graph is disconnected'; END IF;
  IF s.request_state='submitted' THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_orders) e CROSS JOIN LATERAL jsonb_array_elements(e->'items') it
      LEFT JOIN public.print_provider_submission_items i ON i.submission_id=s.id AND i.item_reference_id=it->>'itemReferenceId'
      WHERE i.provider_order_id IS DISTINCT FROM e->>'id' OR i.provider_item_id IS DISTINCT FROM it->>'id') OR
      (SELECT count(*) FROM public.print_provider_submission_orders WHERE submission_id=s.id)<>jsonb_array_length(p_orders) THEN
      RAISE EXCEPTION 'Gelato replay mapping differs from accepted result';
    END IF;
    RETURN jsonb_build_object('submissionId',s.id,'reused',true);
  END IF;
  IF (SELECT count(DISTINCT (e->>'id')||':'||(i->>'id')) FROM jsonb_array_elements(p_orders) e CROSS JOIN LATERAL jsonb_array_elements(e->'items') i)<>cardinality(refs) THEN RAISE EXCEPTION 'Missing or duplicate Gelato provider item identity'; END IF;
  FOR external IN SELECT value FROM jsonb_array_elements(p_orders) LOOP
    IF external->>'orderReferenceId' IS DISTINCT FROM s.order_reference_id OR coalesce(external->>'orderType','') NOT IN ('draft','order') OR
       external->>'customerReferenceId' IS DISTINCT FROM s.root_order_id OR external->>'currency' IS DISTINCT FROM s.request_snapshot#>>'{request,currency}' THEN RAISE EXCEPTION 'Gelato result identity mismatch'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(external->'connectedOrderIds') cid WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_orders) e WHERE e->>'id'=cid)) THEN RAISE EXCEPTION 'Gelato connected graph is incomplete'; END IF;
    IF public.normalized_gelato_recipient(external->'shippingAddress') IS DISTINCT FROM public.normalized_gelato_recipient(s.request_snapshot#>'{request,shippingAddress}') THEN RAISE EXCEPTION 'Gelato result recipient mismatch'; END IF;
    INSERT INTO public.print_provider_submission_orders(submission_id,provider,provider_order_id,status,last_event_at,order_type,snapshot,snapshot_digest,financial_observation,financial_observed_at,financial_action_reason)
    VALUES(s.id,'gelato',external->>'id',external->>'fulfillmentStatus',(external->>'updatedAt')::timestamptz,external->>'orderType',external-'financialObservation',md5((external-'financialObservation')::text),
      CASE WHEN external#>>'{financialObservation,reviewReason}' IS NULL THEN nullif(external->'financialObservation','null'::jsonb) ELSE NULL END,
      CASE WHEN jsonb_typeof(external->'financialObservation')='object' AND external#>>'{financialObservation,reviewReason}' IS NULL THEN clock_timestamp() ELSE NULL END,external#>>'{financialObservation,reviewReason}')
    ON CONFLICT(submission_id,provider_order_id) DO NOTHING;
    UPDATE public.print_provider_submission_orders SET last_checked_at=clock_timestamp(),progress_status=CASE WHEN external->>'fulfillmentStatus'<>'on_hold' THEN external->>'fulfillmentStatus' ELSE NULL END WHERE submission_id=s.id AND provider_order_id=external->>'id';
    FOR item IN SELECT value FROM jsonb_array_elements(external->'items') LOOP
      SELECT value INTO STRICT expected FROM jsonb_array_elements(s.request_snapshot#>'{request,items}') WHERE value->>'itemReferenceId'=item->>'itemReferenceId';
      IF item->>'productUid' IS DISTINCT FROM expected->>'productUid' OR (item->>'quantity')::integer IS DISTINCT FROM (expected->>'quantity')::integer OR
         (item->>'pageCount' IS NOT NULL AND (item->>'pageCount')::integer IS DISTINCT FROM (expected->>'pageCount')::integer) OR item->'files' IS DISTINCT FROM expected->'files' THEN
        RAISE EXCEPTION 'Gelato result item mismatch';
      END IF;
      UPDATE public.print_provider_submission_items SET provider_order_id=external->>'id',provider_item_id=item->>'id',status=item->>'fulfillmentStatus',
        progress_status=CASE WHEN item->>'fulfillmentStatus'<>'on_hold' THEN item->>'fulfillmentStatus' ELSE NULL END,last_event_at=(external->>'updatedAt')::timestamptz
        WHERE submission_id=s.id AND item_reference_id=item->>'itemReferenceId' AND (provider_order_id IS NULL OR provider_order_id=external->>'id');
      IF NOT FOUND THEN RAISE EXCEPTION 'Gelato item already belongs to another provider order'; END IF;
    END LOOP;
  END LOOP;
  UPDATE public.print_provider_submissions SET request_state='submitted',action_reason=NULL,updated_at=clock_timestamp() WHERE id=s.id;
  UPDATE public.orders o SET gelato_status=CASE WHEN po.order_type='draft' THEN 'draft' ELSE i.status END,gelato_order_type=po.order_type,gelato_order_id=i.provider_order_id,
    gelato_action_reason=CASE WHEN po.order_type='draft' THEN 'awaiting_draft_review' ELSE 'recovered_provider_order_requires_refresh' END,
    gelato_updated_at=i.last_event_at,execution_status='done',current_workflow=NULL,started_at=NULL,next_workflow=NULL
    FROM public.print_provider_submission_items i JOIN public.print_provider_submission_orders po ON po.submission_id=i.submission_id AND po.provider_order_id=i.provider_order_id
    WHERE i.submission_id=s.id AND o.id=i.child_order_id AND o.print_submission_id=s.id AND o.print_claim_token=p_token;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>cardinality(refs) THEN RAISE EXCEPTION 'Gelato order projection membership mismatch'; END IF;
  RETURN jsonb_build_object('submissionId',s.id,'reused',false);
END $$;

CREATE OR REPLACE FUNCTION public.apply_gelato_provider_snapshots(p_submission_id uuid,p_expected jsonb,p_results jsonb,p_notifications jsonb DEFAULT '[]',p_notification_holds jsonb DEFAULT '[]')
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE; prior public.print_provider_submission_orders%ROWTYPE;
 result jsonb; expected jsonb; item jsonb; provider_snapshot jsonb; changed integer; refs text[]; actual text[]; notification jsonb; payload jsonb; notification_id uuid; package_reference bigint;
BEGIN
 PERFORM public.lock_gelato_submission_root(p_submission_id);
 SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id=p_submission_id FOR UPDATE;
 IF s.request_state<>'submitted' OR jsonb_typeof(p_results) IS DISTINCT FROM 'array' OR jsonb_typeof(p_expected) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid Gelato refresh'; END IF;
 IF jsonb_array_length(p_results)<> (SELECT count(*) FROM public.print_provider_submission_orders WHERE submission_id=s.id) OR
   (SELECT count(DISTINCT value->>'providerOrderId') FROM jsonb_array_elements(p_results))<>jsonb_array_length(p_results) THEN RAISE EXCEPTION 'Incomplete Gelato refresh graph'; END IF;
 SELECT array_agg(item_reference_id ORDER BY item_reference_id) INTO refs FROM public.print_provider_submission_items WHERE submission_id=s.id;
 SELECT array_agg(i->>'itemReferenceId' ORDER BY i->>'itemReferenceId') INTO actual FROM jsonb_array_elements(p_results) r CROSS JOIN LATERAL jsonb_array_elements(r->'items') i;
 IF actual IS DISTINCT FROM refs THEN RAISE EXCEPTION 'Gelato refresh membership mismatch'; END IF;
 FOR result IN SELECT value FROM jsonb_array_elements(p_results) LOOP
   SELECT * INTO STRICT prior FROM public.print_provider_submission_orders WHERE submission_id=s.id AND provider_order_id=result->>'providerOrderId' FOR UPDATE;
   SELECT value INTO STRICT expected FROM jsonb_array_elements(p_expected) WHERE value->>'providerOrderId'=prior.provider_order_id;
   IF prior.snapshot_digest IS DISTINCT FROM expected->>'digest' OR prior.last_event_at IS DISTINCT FROM (expected->>'eventAt')::timestamptz OR
      prior.observation_revision IS DISTINCT FROM coalesce((expected->>'observationRevision')::bigint,0) THEN RAISE EXCEPTION 'Gelato refresh snapshot changed concurrently'; END IF;
   provider_snapshot:=result->'snapshot';
   IF provider_snapshot->>'id' IS DISTINCT FROM prior.provider_order_id OR provider_snapshot->>'orderReferenceId' IS DISTINCT FROM s.order_reference_id OR
      provider_snapshot->>'customerReferenceId' IS DISTINCT FROM s.root_order_id OR provider_snapshot->>'currency' IS DISTINCT FROM s.request_snapshot#>>'{request,currency}' OR
      public.normalized_gelato_recipient(provider_snapshot->'shippingAddress') IS DISTINCT FROM public.normalized_gelato_recipient(s.request_snapshot#>'{request,shippingAddress}') THEN RAISE EXCEPTION 'Gelato refresh identity changed'; END IF;
   IF coalesce((result->>'accepted')::boolean,false) THEN
     IF (provider_snapshot->>'updatedAt')::timestamptz<prior.last_event_at OR coalesce(result->>'digest','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid Gelato refresh timestamp or digest'; END IF;
     UPDATE public.print_provider_submission_orders SET last_checked_at=clock_timestamp(),status=result->>'status',progress_status=CASE WHEN result->>'status'<>'on_hold' THEN result->>'status' ELSE progress_status END,order_type=result->>'orderType',snapshot=provider_snapshot,snapshot_digest=result->>'digest',
       last_event_at=(provider_snapshot->>'updatedAt')::timestamptz,action_reason=result->>'actionReason' WHERE id=prior.id;
   ELSE
     UPDATE public.print_provider_submission_orders SET action_reason=result->>'actionReason' WHERE id=prior.id;
   END IF;
   UPDATE public.print_provider_submission_orders SET observation_revision=observation_revision+1,
     financial_observation=CASE WHEN coalesce((result->>'accepted')::boolean,false) AND coalesce((result->>'financialAccepted')::boolean,false) AND jsonb_typeof(result->'financialObservation')='object' THEN result->'financialObservation' ELSE financial_observation END,
     financial_observed_at=CASE WHEN coalesce((result->>'accepted')::boolean,false) AND coalesce((result->>'financialAccepted')::boolean,false) AND jsonb_typeof(result->'financialObservation')='object' THEN clock_timestamp() ELSE financial_observed_at END,
     financial_action_reason=CASE WHEN coalesce((result->>'accepted')::boolean,false) AND jsonb_typeof(result->'financialObservation')='object' THEN result->>'financialActionReason' ELSE financial_action_reason END
     WHERE id=prior.id;
   FOR item IN SELECT value FROM jsonb_array_elements(result->'items') LOOP
     UPDATE public.print_provider_submission_items SET status=item->>'status',progress_status=CASE WHEN item->>'status'<>'on_hold' THEN item->>'status' ELSE progress_status END,action_reason=item->>'actionReason',tracking=coalesce(nullif(item->'tracking','null'::jsonb),tracking),
       last_event_at=CASE WHEN item->>'actionReason' IS NULL OR item->>'actionReason'='awaiting_draft_review' THEN (provider_snapshot->>'updatedAt')::timestamptz ELSE last_event_at END
       WHERE submission_id=s.id AND item_reference_id=item->>'itemReferenceId' AND provider_order_id=prior.provider_order_id AND provider_item_id=item->>'providerItemId';
     IF NOT FOUND THEN RAISE EXCEPTION 'Gelato refresh item identity changed'; END IF;
     UPDATE public.orders o SET gelato_status=CASE WHEN item->>'orderType'='draft' THEN 'draft' ELSE item->>'status' END,gelato_order_type=item->>'orderType',
       gelato_action_reason=item->>'actionReason',gelato_tracking=i.tracking,gelato_updated_at=i.last_event_at
       FROM public.print_provider_submission_items i WHERE i.submission_id=s.id AND i.item_reference_id=item->>'itemReferenceId' AND o.id=i.child_order_id AND o.print_submission_id=s.id;
   END LOOP;
 END LOOP;
 FOR notification IN SELECT value FROM jsonb_array_elements(p_notification_holds) LOOP
   IF jsonb_typeof(notification->'childOrderId') IS DISTINCT FROM 'number' OR coalesce(notification->>'reason','')='' OR NOT EXISTS(SELECT 1 FROM public.print_provider_submission_items WHERE submission_id=s.id AND child_order_id=(notification->>'childOrderId')::bigint) THEN RAISE EXCEPTION 'Invalid Gelato notification hold membership'; END IF;
   INSERT INTO public.print_provider_submission_notifications(submission_id,child_order_id,notification_type,delivery_state,attempt_result)
     VALUES(s.id,(notification->>'childOrderId')::bigint,'notification-review:'||(notification->>'reason'),'held',notification->>'reason')
     ON CONFLICT(submission_id,child_order_id,notification_type) DO NOTHING;
   UPDATE public.print_provider_submission_items SET action_reason=notification->>'reason' WHERE submission_id=s.id AND child_order_id=(notification->>'childOrderId')::bigint;
   UPDATE public.orders SET gelato_action_reason=notification->>'reason' WHERE print_submission_id=s.id AND id=(notification->>'childOrderId')::bigint;
 END LOOP;
 FOR notification IN SELECT value FROM jsonb_array_elements(p_notifications) LOOP
   payload:=notification->'payload';
   IF jsonb_typeof(payload->'childOrderIds') IS DISTINCT FROM 'array' OR jsonb_typeof(notification->'childOrderId') IS DISTINCT FROM 'number' OR
      EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'childOrderIds') child WHERE jsonb_typeof(child) IS DISTINCT FROM 'number' OR child::text !~ '^[1-9][0-9]*$') OR
      coalesce(payload->>'kind','') NOT IN ('d2c-printing','d2c-shipped','amazon-shipped') OR jsonb_array_length(payload->'childOrderIds')=0 OR
      (notification->>'childOrderId')::bigint IS DISTINCT FROM (SELECT min(value::bigint) FROM jsonb_array_elements_text(payload->'childOrderIds')) OR
      EXISTS(SELECT 1 FROM jsonb_array_elements_text(payload->'childOrderIds') child WHERE NOT EXISTS(SELECT 1 FROM public.print_provider_submission_items i WHERE i.submission_id=s.id AND i.child_order_id=child::bigint)) THEN RAISE EXCEPTION 'Invalid Gelato notification membership'; END IF;
   notification_id:=gen_random_uuid();
   package_reference:=nextval('public.gelato_notification_package_reference_seq');
   IF payload->>'kind'='amazon-shipped' THEN payload:=payload||jsonb_build_object('packageReferenceId',package_reference::text); END IF;
   INSERT INTO public.print_provider_submission_notifications(id,submission_id,child_order_id,notification_type,payload,payload_digest,idempotency_key,amazon_package_reference)
     VALUES(notification_id,s.id,(notification->>'childOrderId')::bigint,notification->>'type',payload,md5(payload::text),'gelato-'||notification_id::text,package_reference)
     ON CONFLICT(submission_id,child_order_id,notification_type) DO NOTHING;
 END LOOP;
 UPDATE public.print_provider_submissions SET action_reason=CASE WHEN EXISTS(SELECT 1 FROM public.print_provider_submission_orders WHERE submission_id=s.id AND action_reason IS NOT NULL) THEN 'provider_snapshot_requires_review' ELSE NULL END,updated_at=clock_timestamp() WHERE id=s.id;
END $$;

CREATE OR REPLACE FUNCTION public.hold_gelato_provider_refresh(p_submission_id uuid,p_expected jsonb,p_reason text)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE;
BEGIN
 PERFORM public.lock_gelato_submission_root(p_submission_id);
 SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id=p_submission_id FOR UPDATE;
 IF jsonb_typeof(p_expected) IS DISTINCT FROM 'array' OR jsonb_array_length(p_expected)<>(SELECT count(*) FROM public.print_provider_submission_orders WHERE submission_id=s.id) OR
   (SELECT count(DISTINCT value->>'providerOrderId') FROM jsonb_array_elements(p_expected))<>jsonb_array_length(p_expected) THEN RAISE EXCEPTION 'Invalid Gelato refresh hold graph'; END IF;
 IF s.request_state<>'submitted' OR EXISTS(SELECT 1 FROM public.print_provider_submission_orders po
   LEFT JOIN jsonb_array_elements(p_expected) e ON e->>'providerOrderId'=po.provider_order_id
   WHERE po.submission_id=s.id AND (po.snapshot_digest IS DISTINCT FROM e->>'digest' OR po.last_event_at IS DISTINCT FROM (e->>'eventAt')::timestamptz OR
     po.observation_revision IS DISTINCT FROM coalesce((e->>'observationRevision')::bigint,0))) THEN RAISE EXCEPTION 'Stale Gelato refresh hold'; END IF;
 UPDATE public.print_provider_submission_orders SET action_reason=p_reason,observation_revision=observation_revision+1 WHERE submission_id=s.id;
 UPDATE public.print_provider_submission_items SET action_reason=p_reason WHERE submission_id=s.id;
 UPDATE public.orders o SET gelato_action_reason=p_reason FROM public.print_provider_submission_items i WHERE i.submission_id=s.id AND o.id=i.child_order_id;
 UPDATE public.print_provider_submissions SET action_reason=p_reason,updated_at=clock_timestamp() WHERE id=s.id;
END $$;
REVOKE ALL ON FUNCTION public.persist_gelato_print_result(uuid,uuid,text,jsonb),public.apply_gelato_provider_snapshots(uuid,jsonb,jsonb,jsonb,jsonb),public.hold_gelato_provider_refresh(uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.persist_gelato_print_result(uuid,uuid,text,jsonb),public.apply_gelato_provider_snapshots(uuid,jsonb,jsonb,jsonb,jsonb),public.hold_gelato_provider_refresh(uuid,jsonb,text) TO service_role;
COMMIT;
