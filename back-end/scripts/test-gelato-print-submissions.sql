CREATE FUNCTION pg_temp.routes(ids bigint[]) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_agg(jsonb_build_object('orderDbId',id,'orderId',"orderId",'rootOrderId',coalesce(root_order_id,amazon_order_id,"orderId"),
    'provider','gelato','bookId','book-finding-our-inner-voice','configVersion',2,'formatId','standard',
    'productUid','synthetic-gelato-product','innerPageCount',32,'apiPageCount',32,'expectedPdfPageCount',35) ORDER BY id)
  FROM public.orders WHERE id = ANY(ids);
$$;
CREATE FUNCTION pg_temp.expect_error(query text, expected text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE query; EXCEPTION WHEN OTHERS THEN
    IF expected IS NULL OR position(expected in SQLERRM) > 0 THEN RETURN; END IF;
    RAISE EXCEPTION 'Wrong rejection: %', SQLERRM;
  END;
  RAISE EXCEPTION 'Expected rejection: %', query;
END $$;
CREATE FUNCTION pg_temp.record_quote(p_submission_id uuid, p_token uuid, p_capability boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $$
DECLARE refs text[]; row record; s public.print_provider_submissions%ROWTYPE; items jsonb; key text;
BEGIN
  SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id=p_submission_id;
  FOR row IN SELECT o.*,i.item_reference_id FROM public.orders o JOIN public.print_provider_submission_items i ON i.child_order_id=o.id WHERE i.submission_id=s.id LOOP
    key:=row.print_book_id||'/orders/'||row."orderId"||'/gelato/print/v'||row.print_config_version||'/'||repeat('1',24)||'.pdf';
    PERFORM public.register_gelato_print_artifact(s.id,p_token,row.id,key,repeat('1',24),35);
  END LOOP;
  SELECT array_agg(i.item_reference_id ORDER BY i.item_reference_id), jsonb_agg(jsonb_build_object('itemReferenceId',i.item_reference_id,'productUid',o.print_product_uid,
    'pageCount',o.print_api_page_count,'quantity',1,'files',jsonb_build_array(jsonb_build_object('type','default','url','https://admin.littleherolabs.com/api/pdf/'||i.artifact_key||CASE WHEN p_capability THEN '?printerGrant=synthetic.header.signature' ELSE '' END))) ORDER BY i.item_reference_id)
    INTO refs,items FROM public.print_provider_submission_items i JOIN public.orders o ON o.id=i.child_order_id WHERE i.submission_id=s.id;
  PERFORM public.record_gelato_quote_snapshot(s.id,p_token,'quote-'||s.id::text,'ups_ground',1,clock_timestamp(),refs,repeat('a',64),
    jsonb_build_object('request',jsonb_build_object('orderType','draft','orderReferenceId',s.order_reference_id,'customerReferenceId',s.root_order_id,
      'shipmentMethodUid','ups_ground','currency','USD','items',items,'shippingAddress',jsonb_build_object('firstName','Test','lastName','','country','US','addressLine1','123 Test St','addressLine2',coalesce(row.shipping_address->>'street2',''),'city','Test City','state','CA','postCode','90001','email','test@example.com')),'shippingTier','standard','config',jsonb_build_object('provider','gelato','productUid','synthetic-gelato-product','apiPageCount',32,'expectedPdfPageCount',35,'shipmentMethodPolicy',jsonb_build_object('version',1))) || CASE WHEN p_capability THEN jsonb_build_object('printerFiles',jsonb_build_object('version',1,'issuedAt',floor(extract(epoch FROM clock_timestamp()))::bigint,'expiresAt',floor(extract(epoch FROM clock_timestamp()))::bigint+86400)) ELSE '{}'::jsonb END);
END $$;

INSERT INTO public.orders(id,"orderId",amazon_order_id,root_order_id,created_at,execution_status,next_workflow,shipping_address)
VALUES
  (10,'TEST-10',NULL,'TEST-GROUP',clock_timestamp(),'ready_for_processing','4','{"name":"Test","street1":"123 Test St","street2":"Unit 1","city":"Test City","state":"CA","zip":"90001","country":"US"}'),
  (11,'TEST-11',NULL,'TEST-GROUP',clock_timestamp(),'ready_for_processing','4','{"name":"Test","street1":"123 Test St","street2":"Unit 1","city":"Test City","state":"CA","zip":"90001","country":"US"}'),
  (20,'TEST-20',NULL,'TEST-PARTIAL',clock_timestamp(),'ready_for_processing','4','{"name":"Test","street1":"123 Test St","city":"Test City","state":"CA","zip":"90001","country":"US"}'),
  (21,'TEST-21',NULL,'TEST-PARTIAL',clock_timestamp(),'processing','4','{"name":"Test","street1":"123 Test St","city":"Test City","state":"CA","zip":"90001","country":"US"}'),
  (30,'TEST-30',NULL,NULL,clock_timestamp(),'ready_for_processing','4','{}'),
  (40,'ROOT-TEST','ROOT-TEST',NULL,clock_timestamp(),'ready_for_processing','4','{"name":"Test","street1":"123 Test St","city":"Test City","state":"CA","zip":"90001","country":"US"}'),
  (41,'CHILD-TEST',NULL,'ROOT-TEST',clock_timestamp(),'ready_for_processing','4','{"name":"Test","street1":"123 Test St","city":"Test City","state":"CA","zip":"90001","country":"US"}');

DO $$ DECLARE c jsonb; retry jsonb; s uuid; token uuid; later_token uuid;
BEGIN
  IF (SELECT count(*) FROM public.orders WHERE print_provider = 'lulu') <> 3 THEN RAISE EXCEPTION 'Legacy backfill count'; END IF;
  IF public.canonical_print_manifest_key('https://synthetic.r2.dev/book/orders/one/manifests/1-manifest.json?x=1') IS DISTINCT FROM 'book/orders/one/manifests/1-manifest.json' THEN RAISE EXCEPTION 'Canonical manifest URL normalization'; END IF;
  UPDATE public.orders SET print_book_id = 'book-finding-our-inner-voice', print_format_id = 'standard',
    print_manifest_key = 'book-finding-our-inner-voice/orders/LEGACY-TOP/manifests/1-manifest.json',
    one_manifest_url = 'book-finding-our-inner-voice/orders/LEGACY-TOP/manifests/1-manifest.json' WHERE id = 1;
  PERFORM pg_temp.expect_error($q$UPDATE public.orders SET print_book_id='other-book' WHERE id=1$q$,'Frozen print assignment mismatch');
  PERFORM pg_temp.expect_error($q$UPDATE public.orders SET one_manifest_url='other-book/orders/LEGACY-TOP/manifests/1-manifest.json' WHERE id=1$q$,'Frozen W0 manifest pointer');
  IF (SELECT print_provider FROM public.orders WHERE id = 4) IS NOT NULL THEN RAISE EXCEPTION 'Conflicting legacy identity was assigned'; END IF;
  IF public.legacy_print_book_id('{"book_id":"book-2-example"}'::jsonb) IS DISTINCT FROM 'book-2-example' THEN RAISE EXCEPTION 'Book 2 Lulu identity was not recognized'; END IF;
  c := public.claim_gelato_print_submission(pg_temp.routes(ARRAY[10,11]::bigint[]),'group-key');
  IF c->>'reason' <> 'gate_closed' OR EXISTS (SELECT 1 FROM public.print_provider_submissions) THEN RAISE EXCEPTION 'Closed gate claimed work'; END IF;
  IF (SELECT count(*) FROM public.orders WHERE id IN (10,11) AND print_provider = 'gelato' AND execution_status = 'ready_for_processing') <> 2 THEN RAISE EXCEPTION 'Closed gate assignment'; END IF;
  UPDATE public.print_provider_dispatch_gates SET enabled = true WHERE provider = 'gelato';
  PERFORM pg_temp.expect_error($q$SELECT public.claim_gelato_print_submission(pg_temp.routes(ARRAY[40]::bigint[]),'root-partial')$q$,'Incomplete print group');
  c := public.claim_gelato_print_submission(pg_temp.routes(ARRAY[40,41]::bigint[]),'root-complete');
  IF NOT (c->>'dispatch')::boolean THEN RAISE EXCEPTION 'Root-inclusive complete group was not claimed'; END IF;
  PERFORM pg_temp.expect_error($q$SELECT public.claim_gelato_print_submission(pg_temp.routes(ARRAY[10]::bigint[]),'partial-key')$q$);
  UPDATE public.orders SET shipping_address = jsonb_set(shipping_address,'{street2}','"Unit 2"') WHERE id = 11;
  PERFORM pg_temp.expect_error($q$SELECT public.claim_gelato_print_submission(pg_temp.routes(ARRAY[10,11]::bigint[]),'group-key')$q$);
  UPDATE public.orders SET shipping_address = jsonb_set(shipping_address,'{street2}','"Unit 1"') WHERE id = 11;
  c := public.claim_gelato_print_submission(pg_temp.routes(ARRAY[10,11]::bigint[]),'group-key');
  s := (c->>'submissionId')::uuid; token := (c->>'claimToken')::uuid;
  IF NOT (c->>'dispatch')::boolean OR (SELECT count(*) FROM public.print_provider_submission_items WHERE submission_id = s) <> 2 THEN RAISE EXCEPTION 'Missing atomic membership'; END IF;
  retry := public.claim_gelato_print_submission(pg_temp.routes(ARRAY[10,11]::bigint[]),'group-key');
  IF (retry->>'dispatch')::boolean OR retry->>'submissionId' <> c->>'submissionId' THEN RAISE EXCEPTION 'Repeated claim dispatched'; END IF;
  PERFORM pg_temp.expect_error($q$SELECT public.claim_gelato_print_submission(pg_temp.routes(ARRAY[10,11]::bigint[]),'changed-key')$q$);
  PERFORM pg_temp.expect_error($q$INSERT INTO public.orders("orderId",root_order_id) VALUES ('TEST-12','TEST-GROUP')$q$);
  PERFORM pg_temp.expect_error($q$UPDATE public.orders SET print_provider = 'lulu' WHERE id = 10$q$);
  PERFORM pg_temp.expect_error($q$DELETE FROM public.orders WHERE id = 10$q$);
  IF EXISTS (SELECT 1 FROM public.orders WHERE id IN (10,11) AND started_at IS NULL) THEN RAISE EXCEPTION 'Claim start time missing'; END IF;
  PERFORM pg_temp.expect_error($q$UPDATE public.orders SET execution_status='ready_for_processing',current_workflow=NULL,started_at=NULL WHERE id=10$q$, 'provider ownership');
  PERFORM pg_temp.expect_error($q$UPDATE public.orders SET shipping_address='{}' WHERE id=10$q$, 'inputs are frozen');
  PERFORM pg_temp.record_quote(s,token);
  PERFORM public.fence_gelato_print_submission(s,token);
  IF (SELECT count(*) FROM public.orders WHERE id IN (10,11) AND execution_status = 'ready_for_processing' AND started_at IS NULL AND current_workflow IS NULL) <> 2 THEN RAISE EXCEPTION 'Fenced group invisible to cron'; END IF;
  PERFORM pg_temp.expect_error(format('SELECT public.begin_gelato_print_submission(%L,%L,%L,repeat(''a'',64))',s,token,'old-execution'));
  retry := public.claim_gelato_print_submission(pg_temp.routes(ARRAY[10,11]::bigint[]),'group-key');
  later_token := (retry->>'claimToken')::uuid;
  IF NOT (retry->>'dispatch')::boolean OR later_token = token OR retry->>'submissionId' <> c->>'submissionId' THEN RAISE EXCEPTION 'Pre-submit retry identity'; END IF;
  IF (SELECT quote_id FROM public.print_provider_submissions WHERE id=s) IS NOT NULL THEN RAISE EXCEPTION 'Retry retained old quote'; END IF;
  PERFORM pg_temp.expect_error(format('SELECT public.begin_gelato_print_submission(%L,%L,%L,repeat(''a'',64))',s,later_token,'old-quote'), 'Current Gelato quote required');
  PERFORM pg_temp.expect_error(format('SELECT public.record_gelato_print_quote(%L,%L,%L,%L,%L,%L,%L,repeat(''a'',64))',s,later_token,'bad-membership','ups_ground',1,clock_timestamp(),ARRAY['not-an-item']::text[]),'Gelato quote membership mismatch');
  PERFORM pg_temp.expect_error(format('SELECT public.record_gelato_print_quote(%L,%L,%L,%L,%L,%L,%L,repeat(''a'',64))',s,later_token,'null-policy','ups_ground',NULL,clock_timestamp(),ARRAY['lhb-item-10','lhb-item-11']::text[]),'Invalid Gelato quote');
  PERFORM pg_temp.record_quote(s,later_token);
  UPDATE public.print_provider_submissions SET quoted_at = clock_timestamp()-interval '16 minutes' WHERE id = s;
  PERFORM pg_temp.expect_error(format('SELECT public.begin_gelato_print_submission(%L,%L,%L,repeat(''a'',64))',s,later_token,'stale-quote'), 'Current Gelato quote required');
  PERFORM pg_temp.record_quote(s,later_token);
  UPDATE public.print_provider_submission_items SET item_reference_id = 'changed-before-begin'
    WHERE submission_id = s AND item_reference_id = 'lhb-item-10';
  PERFORM pg_temp.expect_error(format('SELECT public.begin_gelato_print_submission(%L,%L,%L,repeat(''a'',64))',s,later_token,'membership-change'), 'Gelato quote membership changed');
  UPDATE public.print_provider_submission_items SET item_reference_id = 'lhb-item-10'
    WHERE submission_id = s AND item_reference_id = 'changed-before-begin';
  PERFORM pg_temp.expect_error(format('SELECT public.begin_gelato_print_submission(%L,%L,%L,repeat(''b'',64))',s,later_token,'changed-request'), 'Current Gelato quote required');
  PERFORM public.begin_gelato_print_submission(s,later_token,'new-execution',repeat('a',64));
  PERFORM public.renew_gelato_print_submission(s,later_token,'new-execution',300);
  IF (SELECT lease_expires_at FROM public.print_provider_submissions WHERE id = s) <= clock_timestamp()+interval '4 minutes' THEN RAISE EXCEPTION 'Lease renewal did not extend ownership'; END IF;
  UPDATE public.print_provider_submission_items SET item_reference_id = 'changed-before-send'
    WHERE submission_id = s AND item_reference_id = 'lhb-item-11';
  PERFORM pg_temp.expect_error(format('SELECT public.authorize_gelato_print_send(%L,%L,%L,repeat(''a'',64))',s,later_token,'new-execution'), 'Gelato quote membership changed');
  UPDATE public.print_provider_submission_items SET item_reference_id = 'lhb-item-11'
    WHERE submission_id = s AND item_reference_id = 'changed-before-send';
  PERFORM public.authorize_gelato_print_send(s,later_token,'new-execution',repeat('a',64));
  PERFORM pg_temp.expect_error(format('SELECT public.authorize_gelato_print_send(%L,%L,%L,repeat(''a'',64))',s,later_token,'new-execution'), 'already started');
  PERFORM pg_temp.expect_error(format('SELECT public.authorize_gelato_print_send(%L,%L,%L,repeat(''a'',64))',s,later_token,'wrong-execution'));
  PERFORM public.fence_gelato_print_submission(s,later_token);
  PERFORM pg_temp.expect_error(format('SELECT public.authorize_gelato_print_send(%L,%L,%L,repeat(''a'',64))',s,later_token,'new-execution'));
  retry := public.claim_gelato_print_submission(pg_temp.routes(ARRAY[10,11]::bigint[]),'group-key');
  IF (retry->>'dispatch')::boolean OR retry->>'reason' <> 'outcome_unknown' THEN RAISE EXCEPTION 'Ambiguous outcome retried'; END IF;

  PERFORM pg_temp.expect_error($q$SELECT public.claim_gelato_print_submission(pg_temp.routes(ARRAY[20,21]::bigint[]),'partial-group')$q$,'Print group is not claimable');
  IF EXISTS (SELECT 1 FROM public.orders WHERE id IN (20,21) AND print_provider IS NOT NULL) THEN RAISE EXCEPTION 'Partial claim assignment leaked'; END IF;
  c := public.claim_gelato_print_submission(pg_temp.routes(ARRAY[30]::bigint[]),'single-key');
  s := (c->>'submissionId')::uuid; token := (c->>'claimToken')::uuid;
  UPDATE public.print_provider_submissions SET lease_expires_at = clock_timestamp()-interval '1 second' WHERE id = s;
  PERFORM pg_temp.expect_error(format('SELECT public.begin_gelato_print_submission(%L,%L,%L,repeat(''a'',64))',s,token,'expired-execution'));
  PERFORM public.fence_gelato_print_submission(s,token);
  c := public.claim_gelato_print_submission(pg_temp.routes(ARRAY[30]::bigint[]),'single-key');
  token := (c->>'claimToken')::uuid;
  UPDATE public.print_provider_dispatch_gates SET enabled = false WHERE provider = 'gelato';
  PERFORM pg_temp.expect_error(format('SELECT public.begin_gelato_print_submission(%L,%L,%L,repeat(''a'',64))',s,token,'closed-execution'));
  PERFORM public.fence_gelato_print_submission(s,token);
  IF EXISTS (SELECT 1 FROM public.orders WHERE id = 30 AND (current_workflow IS NOT NULL OR execution_status <> 'ready_for_processing')) THEN RAISE EXCEPTION 'Gate closure stranded claim'; END IF;
  UPDATE public.print_provider_submissions SET request_state = 'submitted' WHERE id = s;
  UPDATE public.print_provider_submission_items SET status = 'delivered' WHERE submission_id = s;
  PERFORM pg_temp.expect_error('DELETE FROM public.orders WHERE id=30','unresolved');
  UPDATE public.print_provider_submissions SET request_state='failed',send_started_at=NULL WHERE id=s;
  DELETE FROM public.orders WHERE id = 30;
  IF NOT EXISTS (SELECT 1 FROM public.print_provider_submission_items WHERE submission_id = s AND child_order_id = 30 AND child_order_key = 'TEST-30') THEN RAISE EXCEPTION 'Archived identity lost'; END IF;
  IF has_function_privilege('anon','public.claim_gelato_print_submission(jsonb,text)','EXECUTE') OR
     has_table_privilege('authenticated','public.print_provider_submissions','SELECT') THEN RAISE EXCEPTION 'Public print access'; END IF;
  IF has_sequence_privilege('anon','public.gelato_notification_package_reference_seq','SELECT,USAGE,UPDATE') OR
     has_sequence_privilege('authenticated','public.gelato_notification_package_reference_seq','SELECT,USAGE,UPDATE') THEN
    RAISE EXCEPTION 'Public Gelato package reference sequence access';
  END IF;
  IF NOT has_sequence_privilege('service_role','public.gelato_notification_package_reference_seq','USAGE') THEN
    RAISE EXCEPTION 'Service role package reference sequence access missing';
  END IF;

END $$;

INSERT INTO public.orders(id,"orderId",amazon_order_id,execution_status,next_workflow)
VALUES (31,'TEST-31','TEST-FALLBACK','ready_for_processing','4');
DO $$ DECLARE c jsonb; s uuid; token uuid;
BEGIN
  UPDATE public.print_provider_dispatch_gates SET enabled = true WHERE provider = 'gelato';
  c := public.claim_gelato_print_submission(pg_temp.routes(ARRAY[31]::bigint[]),'fallback-key');
  s := (c->>'submissionId')::uuid; token := (c->>'claimToken')::uuid;
  PERFORM pg_temp.expect_error($q$UPDATE public.orders SET amazon_order_id = 'OTHER-ROOT' WHERE id = 31$q$,'Cannot change frozen Gelato print identity');
  PERFORM public.fence_gelato_print_submission(s,token);
  DELETE FROM public.orders WHERE id = 31;
  IF NOT EXISTS (SELECT 1 FROM public.print_provider_submission_items WHERE submission_id = s AND child_order_id = 31 AND child_order_key = 'TEST-31') THEN RAISE EXCEPTION 'No-send cancellation lost evidence'; END IF;
END $$;

SELECT 'test-gelato-print-submissions: ok' AS result;

INSERT INTO public.orders(id,"orderId",root_order_id,execution_status,next_workflow,shipping_address)
VALUES (80,'CP1-80','CP1-GROUP','ready_for_processing','4','{"name":"Test","street1":"123 Test St","city":"Test City","state":"CA","zip":"90001","country":"US"}'),
       (81,'CP1-81','CP1-GROUP','ready_for_processing','4','{"name":"Test","street1":"123 Test St","city":"Test City","state":"CA","zip":"90001","country":"US"}');
DO $$ DECLARE claim jsonb; s uuid; token uuid; request jsonb; graph jsonb; result jsonb;
BEGIN
 claim:=public.claim_gelato_print_submission(pg_temp.routes(ARRAY[80,81]::bigint[]),'cp1-key');
 s:=(claim->>'submissionId')::uuid; token:=(claim->>'claimToken')::uuid;
 PERFORM pg_temp.expect_error(format('SELECT public.register_gelato_print_artifact(%L,%L,80,%L,%L,35)',s,gen_random_uuid(),'invalid',repeat('1',24)),'Stale');
 PERFORM pg_temp.record_quote(s,token);
 PERFORM pg_temp.expect_error(format('SELECT public.register_gelato_print_artifact(%L,%L,80,%L,%L,35)',s,token,'book-finding-our-inner-voice/orders/CP1-80/gelato/print/v2/'||repeat('2',24)||'.pdf',repeat('2',24)),'frozen');
 PERFORM pg_temp.expect_error(format('SELECT public.record_gelato_quote_snapshot(%L,%L,%L,%L,1,clock_timestamp(),ARRAY[%L,%L],repeat(''a'',64),%L)',s,token,'bad-address','ups_ground','lhb-item-80','lhb-item-81',jsonb_set((SELECT quote_snapshot FROM public.print_provider_submissions WHERE id=s),'{request,shippingAddress,postCode}','"99999"')),'recipient');
 PERFORM public.begin_gelato_print_submission(s,token,'cp1-execution',repeat('a',64));
 PERFORM public.authorize_gelato_print_send(s,token,'cp1-execution',repeat('a',64));
 PERFORM public.record_gelato_accepted_root(s,token,'cp1-execution','external-80');
 SELECT request_snapshot->'request' INTO request FROM public.print_provider_submissions WHERE id=s;
 SELECT jsonb_agg(jsonb_build_object('id','external-'||i.child_order_id,'orderReferenceId',request->>'orderReferenceId','customerReferenceId',request->>'customerReferenceId',
 'shippingAddress',request->'shippingAddress','currency',request->>'currency','orderType','draft','fulfillmentStatus','created','updatedAt',clock_timestamp(),'connectedOrderIds',jsonb_build_array('external-80','external-81'),
 'items',jsonb_build_array(item||jsonb_build_object('id','item-'||i.child_order_id,'fulfillmentStatus','created'))) ORDER BY i.child_order_id)
 INTO graph FROM public.print_provider_submission_items i CROSS JOIN LATERAL jsonb_array_elements(request->'items') item
 WHERE i.submission_id=s AND item->>'itemReferenceId'=i.item_reference_id;
 PERFORM pg_temp.expect_error(format('SELECT public.persist_gelato_draft_result(%L,%L,%L,%L)',s,token,'cp1-execution',jsonb_build_array(graph->0)),'membership');
 IF EXISTS(SELECT 1 FROM public.print_provider_submission_orders WHERE submission_id=s) THEN RAISE EXCEPTION 'Partial graph persisted'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.persist_gelato_draft_result(%L,%L,%L,%L)',s,token,'cp1-execution',jsonb_set(graph,'{1,items,0,quantity}','2')),'item mismatch');
 IF EXISTS(SELECT 1 FROM public.print_provider_submission_orders WHERE submission_id=s) THEN RAISE EXCEPTION 'Failed result transaction partially persisted'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.persist_gelato_draft_result(%L,%L,%L,%L)',s,token,'other-execution',graph),'ownership');
 PERFORM pg_temp.expect_error(format('SELECT public.persist_gelato_draft_result(%L,%L,%L,%L)',s,token,'cp1-execution',jsonb_set(jsonb_set(graph,'{0,connectedOrderIds}','[]'),'{1,connectedOrderIds}','[]')),'disconnected');
 result:=public.persist_gelato_draft_result(s,token,'cp1-execution',graph);
 IF (result->>'reused')::boolean OR (SELECT count(*) FROM public.orders WHERE id IN (80,81) AND gelato_order_type='draft' AND execution_status='done')<>2 THEN RAISE EXCEPTION 'Complete graph did not project atomically'; END IF;
 UPDATE public.print_provider_submission_items SET status='in_production' WHERE submission_id=s;
 result:=public.persist_gelato_draft_result(s,token,'cp1-execution',graph);
 IF NOT (result->>'reused')::boolean OR EXISTS(SELECT 1 FROM public.print_provider_submission_items WHERE submission_id=s AND status<>'in_production') THEN RAISE EXCEPTION 'Result replay regressed lifecycle'; END IF;
 IF EXISTS(SELECT 1 FROM public.print_provider_submission_notifications WHERE submission_id=s) THEN RAISE EXCEPTION 'Draft emitted production notifications'; END IF;
END $$;
SELECT 'Gelato draft persistence atomicity and replay: ok' AS result;

DO $$ DECLARE s uuid; expected jsonb; results jsonb; result jsonb; token uuid;
BEGIN
 SELECT id,claim_token INTO s,token FROM public.print_provider_submissions WHERE workflow_job_idempotency_key='cp1-key';
 SELECT jsonb_agg(jsonb_build_object('providerOrderId',provider_order_id,'digest',snapshot_digest,'eventAt',last_event_at)) INTO expected FROM public.print_provider_submission_orders WHERE submission_id=s;
 -- Authoritative draft conversion may keep the provider timestamp unchanged.
 UPDATE public.print_provider_submission_items SET status='created' WHERE submission_id=s;
 SELECT jsonb_agg(jsonb_build_object('providerOrderId',provider_order_id,'digest',repeat('d',64),'status','created','orderType','order','accepted',true,'actionReason',NULL,
   'snapshot',jsonb_set(jsonb_set(snapshot,'{orderType}','"order"'),'{fulfillmentStatus}','"created"'),
   'items',(SELECT jsonb_agg(jsonb_build_object('itemReferenceId',i.item_reference_id,'providerItemId',i.provider_item_id,'status','created','orderType','order','actionReason',NULL,'tracking','[]'::jsonb))
     FROM public.print_provider_submission_items i WHERE i.submission_id=s AND i.provider_order_id=po.provider_order_id))) INTO results FROM public.print_provider_submission_orders po WHERE submission_id=s;
 PERFORM public.apply_gelato_provider_snapshots(s,expected,results);
 IF (SELECT count(*) FROM public.orders WHERE id IN (80,81) AND gelato_status='created' AND gelato_order_type='order' AND gelato_action_reason IS NULL)<>2 OR
   EXISTS(SELECT 1 FROM public.print_provider_submission_orders po JOIN LATERAL jsonb_array_elements(expected) e ON e->>'providerOrderId'=po.provider_order_id
     WHERE po.submission_id=s AND (po.last_event_at IS DISTINCT FROM (e->>'eventAt')::timestamptz OR po.snapshot_digest<>repeat('d',64))) THEN
   RAISE EXCEPTION 'Equal-time conversion did not project atomically with unchanged provider time'; END IF;
 IF EXISTS(SELECT 1 FROM public.print_provider_submission_notifications WHERE submission_id=s) THEN RAISE EXCEPTION 'Created conversion emitted customer intent'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.apply_gelato_provider_snapshots(%L,%L,%L)',s,expected,results),'changed concurrently');
 SELECT jsonb_agg(jsonb_build_object('providerOrderId',provider_order_id,'digest',snapshot_digest,'eventAt',last_event_at)) INTO expected FROM public.print_provider_submission_orders WHERE submission_id=s;
 SELECT jsonb_agg(jsonb_build_object('providerOrderId',provider_order_id,'digest',repeat('c',64),'status','in_production','orderType','order','accepted',true,'actionReason',NULL,
   'snapshot',jsonb_set(jsonb_set(jsonb_set(snapshot,'{updatedAt}',to_jsonb(clock_timestamp()+interval '1 minute')),'{orderType}','"order"'),'{fulfillmentStatus}','"in_production"'),
   'items',(SELECT jsonb_agg(jsonb_build_object('itemReferenceId',i.item_reference_id,'providerItemId',i.provider_item_id,'status','in_production','orderType','order','actionReason',NULL,'tracking','[]'::jsonb))
     FROM public.print_provider_submission_items i WHERE i.submission_id=s AND i.provider_order_id=po.provider_order_id))) INTO results FROM public.print_provider_submission_orders po WHERE submission_id=s;
 PERFORM public.apply_gelato_provider_snapshots(s,expected,results);
 IF (SELECT count(*) FROM public.orders WHERE id IN (80,81) AND gelato_status='in_production' AND gelato_order_type='order')<>2 THEN RAISE EXCEPTION 'Provider refresh projection failed'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.apply_gelato_provider_snapshots(%L,%L,%L)',s,expected,results),'changed concurrently');
 SELECT jsonb_agg(jsonb_build_object('providerOrderId',provider_order_id,'digest',snapshot_digest,'eventAt',last_event_at)) INTO expected FROM public.print_provider_submission_orders WHERE submission_id=s;
 PERFORM public.hold_gelato_provider_refresh(s,expected,'provider_refresh_requires_review');
 IF EXISTS(SELECT 1 FROM public.orders WHERE id IN (80,81) AND (gelato_status<>'in_production' OR gelato_action_reason<>'provider_refresh_requires_review')) THEN RAISE EXCEPTION 'Refresh hold regressed accepted state'; END IF;
 SELECT id,claim_token INTO s,token FROM public.print_provider_submissions WHERE workflow_job_idempotency_key='root-complete';
 UPDATE public.print_provider_submissions SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=s;
 result:=public.begin_gelato_reconciliation(s,'safe-pre-send-recovery');
 IF NOT (result->>'released')::boolean OR EXISTS(SELECT 1 FROM public.orders WHERE id IN(40,41) AND execution_status<>'ready_for_processing') THEN RAISE EXCEPTION 'Expired pre-send claim was not released'; END IF;
 SELECT id INTO s FROM public.print_provider_submissions WHERE workflow_job_idempotency_key='group-key';
 UPDATE public.print_provider_submissions SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=s;
 result:=public.begin_gelato_reconciliation(s,'ambiguous-recovery'); token:=(result->>'claimToken')::uuid;
 IF NOT (result->>'recover')::boolean OR (SELECT request_state FROM public.print_provider_submissions WHERE id=s)<>'outcome_unknown' THEN RAISE EXCEPTION 'Ambiguous recovery sent or released work'; END IF;
 result:=public.begin_gelato_reconciliation(s,'second-recovery');
 IF (result->>'recover')::boolean THEN RAISE EXCEPTION 'Two recovery owners'; END IF;
 PERFORM public.finish_gelato_reconciliation_hold(s,token,'ambiguous-recovery','provider_outcome_requires_review');
 IF (SELECT request_snapshot FROM public.print_provider_submissions WHERE id=s) IS NULL THEN RAISE EXCEPTION 'Recovery destroyed send evidence'; END IF;
END $$;
SELECT 'Gelato snapshot CAS and pre-send/ambiguous recovery: ok' AS result;

DO $$ DECLARE s uuid; token uuid; decision jsonb; request jsonb; graph jsonb;
BEGIN
 SELECT id INTO s FROM public.print_provider_submissions WHERE workflow_job_idempotency_key='group-key';
 decision:=public.begin_gelato_reconciliation(s,'known-accepted-recovery'); token:=(decision->>'claimToken')::uuid;
 IF NOT (decision->>'recover')::boolean THEN RAISE EXCEPTION 'Recovery did not acquire ownership'; END IF;
 PERFORM public.record_gelato_accepted_root(s,token,'known-accepted-recovery','external-10');
 SELECT request_snapshot->'request' INTO request FROM public.print_provider_submissions WHERE id=s;
 SELECT jsonb_agg(jsonb_build_object('id','external-'||i.child_order_id,'orderReferenceId',request->>'orderReferenceId','customerReferenceId',request->>'customerReferenceId',
 'shippingAddress',request->'shippingAddress','currency',request->>'currency','orderType','order','fulfillmentStatus','in_production','updatedAt',clock_timestamp(),
 'connectedOrderIds',jsonb_build_array('external-10','external-11'),
 'items',jsonb_build_array(item||jsonb_build_object('id','item-'||i.child_order_id,'fulfillmentStatus','in_production'))) ORDER BY i.child_order_id)
 INTO graph FROM public.print_provider_submission_items i CROSS JOIN LATERAL jsonb_array_elements(request->'items') item
 WHERE i.submission_id=s AND item->>'itemReferenceId'=i.item_reference_id;
 PERFORM public.persist_gelato_print_result(s,token,'known-accepted-recovery',graph);
 IF (SELECT count(*) FROM public.orders WHERE id IN(10,11) AND gelato_status='in_production' AND execution_status='done')<>2 THEN RAISE EXCEPTION 'Known accepted graph was not recovered'; END IF;
END $$;
SELECT 'Gelato accepted recovery without a second create: ok' AS result;

ALTER TABLE public.orders ADD COLUMN customer_email text;
UPDATE public.orders SET customer_email='test@example.com' WHERE id IN(80,81);
DO $$ DECLARE s uuid; expected jsonb; results jsonb; intents jsonb; n uuid; second_n uuid; claim jsonb; token uuid; key text; payload jsonb;
BEGIN
 SELECT id INTO s FROM public.print_provider_submissions WHERE workflow_job_idempotency_key='cp1-key';
 UPDATE public.print_provider_submissions SET request_snapshot=jsonb_set(request_snapshot,'{notificationTargets}',
  '[{"childOrderId":80,"childOrderKey":"CP1-80","platform":"d2c","customerEmail":"test@example.com","childName":"Test","amazonOrderId":null,"amazonOrderItemId":null},{"childOrderId":81,"childOrderKey":"CP1-81","platform":"d2c","customerEmail":"test@example.com","childName":"Test","amazonOrderId":null,"amazonOrderItemId":null}]') WHERE id=s;
 SELECT jsonb_agg(jsonb_build_object('providerOrderId',provider_order_id,'digest',snapshot_digest,'eventAt',last_event_at)) INTO expected FROM public.print_provider_submission_orders WHERE submission_id=s;
 SELECT jsonb_agg(jsonb_build_object('providerOrderId',provider_order_id,'digest',repeat('d',64),'status','in_production','orderType','order','accepted',true,'actionReason',NULL,
   'snapshot',jsonb_set(snapshot,'{updatedAt}',to_jsonb(clock_timestamp()+interval '2 minutes')),
   'items',(SELECT jsonb_agg(jsonb_build_object('itemReferenceId',i.item_reference_id,'providerItemId',i.provider_item_id,'status','in_production','orderType','order','actionReason',NULL,'tracking','[]'::jsonb))
     FROM public.print_provider_submission_items i WHERE i.submission_id=s AND i.provider_order_id=po.provider_order_id))) INTO results FROM public.print_provider_submission_orders po WHERE submission_id=s;
 SELECT jsonb_agg(jsonb_build_object('childOrderId',id,'type','d2c-printing','payload',jsonb_build_object('kind','d2c-printing','childOrderIds',jsonb_build_array(id),'childOrderKeys',jsonb_build_array("orderId"),
   'email',jsonb_build_object('from','notifications@example.com','to',customer_email,'subject','Synthetic printing','text','Synthetic body','html','<p>Synthetic</p>')))) INTO intents FROM public.orders WHERE id IN(80,81);
 PERFORM pg_temp.expect_error(format('SELECT public.apply_gelato_provider_snapshots(%L,%L,%L,%L,''[]'')',s,expected,results,jsonb_set(intents,'{0,payload,childOrderIds}','["80","81"]')),'Invalid Gelato notification membership');
 PERFORM public.apply_gelato_provider_snapshots(s,expected,results,intents,'[]');
 IF (SELECT count(*) FROM public.print_provider_submission_notifications WHERE submission_id=s)<>2 THEN RAISE EXCEPTION 'Atomic notification enqueue failed'; END IF;
 SELECT id INTO n FROM public.print_provider_submission_notifications WHERE submission_id=s AND child_order_id=80;
 SELECT id INTO second_n FROM public.print_provider_submission_notifications WHERE submission_id=s AND child_order_id=81;
 claim:=public.claim_gelato_notification(n); token:=(claim->>'attemptToken')::uuid; key:=claim->>'idempotencyKey'; payload:=claim->'payload';
 IF NOT (claim->>'claimed')::boolean OR (public.claim_gelato_notification(n)->>'claimed')::boolean THEN RAISE EXCEPTION 'Multiple notification claim owners'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.finish_gelato_notification(%L,%L,true,NULL)',n,token),'Stale');
 IF NOT (public.authorize_gelato_notification(n,token)->>'send')::boolean THEN RAISE EXCEPTION 'Eligible notification was blocked'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.authorize_gelato_notification(%L,%L)',n,token),'Stale');
 PERFORM public.finish_gelato_notification(n,token,false,NULL);
 UPDATE public.print_provider_submission_notifications SET last_attempt_at=clock_timestamp()-interval '3 minutes' WHERE id=n;
 claim:=public.claim_gelato_notification(n); token:=(claim->>'attemptToken')::uuid;
 IF claim->>'idempotencyKey' IS DISTINCT FROM key OR claim->'payload' IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Retry changed immutable message'; END IF;
 PERFORM public.authorize_gelato_notification(n,token);
 PERFORM public.finish_gelato_notification(n,token,true,'synthetic-message');
 UPDATE public.print_provider_submission_notifications SET first_attempt_at=clock_timestamp()-interval '23 hours'+interval '1 minute' WHERE id=second_n;
 claim:=public.claim_gelato_notification(second_n); token:=(claim->>'attemptToken')::uuid;
 UPDATE public.print_provider_submission_notifications SET first_attempt_at=clock_timestamp()-interval '23 hours' WHERE id=second_n;
 claim:=public.authorize_gelato_notification(second_n,token);
 IF (claim->>'send')::boolean OR (SELECT attempt_result FROM public.print_provider_submission_notifications WHERE id=second_n)<>'idempotency_window_requires_review' THEN RAISE EXCEPTION 'Authorization ignored elapsed key window'; END IF;
 UPDATE public.print_provider_submission_notifications SET first_attempt_at=NULL,delivery_state='pending' WHERE id=second_n;
 UPDATE public.print_provider_submission_items SET status='delivered' WHERE submission_id=s AND child_order_id=81;
 claim:=public.claim_gelato_notification(second_n); token:=(claim->>'attemptToken')::uuid;
 claim:=public.authorize_gelato_notification(second_n,token);
 IF (claim->>'send')::boolean OR (SELECT delivery_state FROM public.print_provider_submission_notifications WHERE id=second_n)<>'suppressed' THEN RAISE EXCEPTION 'Obsolete printing notice sent'; END IF;
 UPDATE public.print_provider_submission_items SET status='returned' WHERE submission_id=s AND child_order_id=80;
 PERFORM pg_temp.expect_error('DELETE FROM public.orders WHERE id=80','unresolved');
 UPDATE public.print_provider_submission_items SET status='delivered',action_reason=NULL WHERE submission_id=s;
 UPDATE public.print_provider_submission_orders SET status='delivered',action_reason=NULL WHERE submission_id=s;
 UPDATE public.print_provider_submission_notifications SET delivery_state='ambiguous' WHERE id=n;
 PERFORM pg_temp.expect_error('DELETE FROM public.orders WHERE id=80','unresolved');
 UPDATE public.print_provider_submission_notifications AS stored SET payload=jsonb_set(stored.payload,'{childOrderIds}','["80","81"]') WHERE id=n;
 PERFORM pg_temp.expect_error('DELETE FROM public.orders WHERE id=81','unresolved');
 UPDATE public.print_provider_submission_notifications SET delivery_state='delivered' WHERE id=n;
 UPDATE public.print_provider_submission_items SET status='shipped',tracking='[{"providerOrderId":"external-80","packageId":"shared-parcel","providerItemIds":["item-80","item-81"],"carrier":"USPS","trackingNumber":"shared-tracking"}]' WHERE submission_id=s AND child_order_id=80;
 INSERT INTO public.print_provider_submission_notifications(submission_id,child_order_id,notification_type,payload,idempotency_key) VALUES(s,80,'d2c-shipped:shared-parcel',
 '{"kind":"d2c-shipped","childOrderIds":[80],"childOrderKeys":["CP1-80"],"providerOrderId":"external-80","packageId":"shared-parcel","carrier":"USPS","trackingNumber":"shared-tracking","trackingUrl":"https://tracking.example.test/80","shipDate":"2026-10-11T12:00:00Z","email":{"from":"notifications@example.com","to":"test@example.com","subject":"Shared package","text":"Synthetic","html":"<p>Synthetic</p>"}}', 'gelato-shared-d2c-proof') RETURNING id INTO second_n;
 claim:=public.claim_gelato_notification(second_n); token:=(claim->>'attemptToken')::uuid;
 claim:=public.authorize_gelato_notification(second_n,token);
 IF NOT (claim->>'send')::boolean THEN RAISE EXCEPTION 'Shared package blocked per-child D2C shipment email'; END IF;
 PERFORM public.finish_gelato_notification(second_n,token,true,'synthetic-shared-message');
 UPDATE public.print_provider_submission_items SET status='delivered' WHERE submission_id=s AND child_order_id=80;
 UPDATE public.print_provider_submissions SET request_snapshot=jsonb_set(request_snapshot,'{notificationTargets,0}',jsonb_build_object('childOrderId',80,'amazonOrderId','111-2222222-3333333','amazonOrderItemId','amazon-item-80')) WHERE id=s;
 UPDATE public.print_provider_submission_items SET tracking='[{"providerOrderId":"external-80","packageId":"parcel-80","providerItemIds":["item-80"],"carrier":"USPS","trackingNumber":"tracking-80"}]' WHERE submission_id=s AND child_order_id=80;
 INSERT INTO public.print_provider_submission_notifications(submission_id,child_order_id,notification_type,payload,idempotency_key) VALUES(s,80,'amazon-shipped:external-80:parcel-80',
 '{"kind":"amazon-shipped","childOrderIds":[80],"childOrderKeys":["CP1-80"],"providerOrderId":"external-80","packageId":"parcel-80","carrier":"USPS","trackingNumber":"tracking-80","trackingUrl":"https://tracking.example.test/80","shipDate":"2026-10-11T12:00:00Z","amazonOrderId":"111-2222222-3333333","orderItems":[{"orderItemId":"amazon-item-80","quantity":1}],"packageReferenceId":"1000000000"}', 'gelato-operational-proof') RETURNING id INTO second_n;
 claim:=public.claim_gelato_notification(second_n); token:=(claim->>'attemptToken')::uuid;
 claim:=public.authorize_gelato_notification(second_n,token);
 IF NOT (claim->>'send')::boolean THEN RAISE EXCEPTION 'Delivered state suppressed Amazon operational confirmation'; END IF;
 PERFORM public.finish_gelato_notification(second_n,token,true,NULL);
 INSERT INTO public.print_provider_submission_notifications(submission_id,child_order_id,notification_type,delivery_state,attempt_result) VALUES(s,81,'notification-review:package','held','package_notification_requires_review');
 PERFORM pg_temp.expect_error('DELETE FROM public.orders WHERE id=81','unresolved');
 UPDATE public.print_provider_submission_notifications SET delivery_state='suppressed' WHERE notification_type='notification-review:package';
 DELETE FROM public.orders WHERE id IN(80,81);
 IF (SELECT count(*) FROM public.print_provider_submission_items WHERE submission_id=s)<>2 OR (SELECT count(*) FROM public.print_provider_submission_notifications WHERE submission_id=s)<>5 THEN RAISE EXCEPTION 'Archive deleted canonical provider records'; END IF;
END $$;
SELECT 'Gelato immutable outbox, single authorization, retry, suppression and archive guards: ok' AS result;

-- Real migrated database: queued legacy intents cannot become deliverable later.
INSERT INTO public.orders(id,"orderId",root_order_id,execution_status,next_workflow,shipping_address,customer_email,book_specs)
SELECT id,CASE id WHEN 1102 THEN 'test-gelato-child' WHEN 1106 THEN 'TEST-GELATO-MIXED' ELSE 'NOTICE-'||id END,
 CASE id WHEN 1103 THEN 'TEST-GELATO-ROOT' WHEN 1106 THEN 'NOTICE-1105' ELSE 'NOTICE-'||id END,
 'ready_for_processing','4','{"name":"Test","street1":"123 Test St","city":"Test City","state":"CA","zip":"90001","country":"US"}'::jsonb,
 'test@example.com',CASE WHEN id=1104 THEN '{"testMode":true}'::jsonb ELSE '{}'::jsonb END
 FROM unnest(ARRAY[1101,1102,1103,1104,1105,1106]) id;
DO $$ DECLARE case_id bigint; ids bigint[]; claim jsonb; s uuid; token uuid; request jsonb; graph jsonb; expected jsonb; results jsonb; n uuid; child bigint; should_suppress boolean;
BEGIN
 FOR case_id IN 1101..1105 LOOP
  ids:=CASE WHEN case_id=1105 THEN ARRAY[1105,1106]::bigint[] ELSE ARRAY[case_id] END;
  should_suppress:=case_id<>1101;
  claim:=public.claim_gelato_print_submission(pg_temp.routes(ids),'notice-guard-'||case_id);
  s:=(claim->>'submissionId')::uuid;token:=(claim->>'claimToken')::uuid;
  PERFORM pg_temp.record_quote(s,token);
  UPDATE public.print_provider_submissions SET quote_snapshot=jsonb_set(quote_snapshot,'{notificationTargets}',
   (SELECT jsonb_agg(jsonb_build_object('childOrderId',o.id,'customerEmail',o.customer_email)) FROM public.orders o WHERE o.id=ANY(ids))) WHERE id=s;
  PERFORM public.begin_gelato_print_submission(s,token,'notice-execution-'||case_id,repeat('a',64));
  PERFORM public.authorize_gelato_print_send(s,token,'notice-execution-'||case_id,repeat('a',64));
  PERFORM public.record_gelato_accepted_root(s,token,'notice-execution-'||case_id,'notice-provider-'||case_id);
  SELECT request_snapshot->'request' INTO request FROM public.print_provider_submissions WHERE id=s;
  SELECT jsonb_build_array(jsonb_build_object('id','notice-provider-'||case_id,'orderReferenceId',request->>'orderReferenceId','customerReferenceId',request->>'customerReferenceId',
   'shippingAddress',request->'shippingAddress','currency',request->>'currency','orderType','draft','fulfillmentStatus','draft','updatedAt',clock_timestamp(),'connectedOrderIds','[]'::jsonb,
   'items',jsonb_agg(item||jsonb_build_object('id','notice-item-'||i.child_order_id,'fulfillmentStatus','draft'))))
   INTO graph FROM public.print_provider_submission_items i CROSS JOIN LATERAL jsonb_array_elements(request->'items') item
   WHERE i.submission_id=s AND item->>'itemReferenceId'=i.item_reference_id;
  PERFORM public.persist_gelato_draft_result(s,token,'notice-execution-'||case_id,graph);
  SELECT jsonb_agg(jsonb_build_object('providerOrderId',provider_order_id,'digest',snapshot_digest,'eventAt',last_event_at)) INTO expected FROM public.print_provider_submission_orders WHERE submission_id=s;
  SELECT jsonb_agg(jsonb_build_object('providerOrderId',provider_order_id,'digest',repeat('c',64),'status','in_production','orderType','order','accepted',true,'actionReason',NULL,
   'snapshot',jsonb_set(jsonb_set(jsonb_set(snapshot,'{updatedAt}',to_jsonb(clock_timestamp()+interval '1 minute')),'{orderType}','"order"'),'{fulfillmentStatus}','"in_production"'),
   'items',(SELECT jsonb_agg(jsonb_build_object('itemReferenceId',i.item_reference_id,'providerItemId',i.provider_item_id,'status','in_production','orderType','order','actionReason',NULL,'tracking','[]'::jsonb))
   FROM public.print_provider_submission_items i WHERE i.submission_id=s))) INTO results FROM public.print_provider_submission_orders WHERE submission_id=s;
  PERFORM public.apply_gelato_provider_snapshots(s,expected,results);
  FOREACH child IN ARRAY ids LOOP
   INSERT INTO public.print_provider_submission_notifications(submission_id,child_order_id,notification_type,payload,idempotency_key)
    SELECT s,child,'d2c-printing',jsonb_build_object('kind','d2c-printing','childOrderIds',jsonb_build_array(child),'childOrderKeys',jsonb_build_array(i.child_order_key),
     'email',jsonb_build_object('to','test@example.com')),'notice-'||child
    FROM public.print_provider_submission_items i WHERE i.submission_id=s AND i.child_order_id=child RETURNING id INTO n;
   IF public.gelato_submission_is_engineering_test(s) IS DISTINCT FROM should_suppress THEN RAISE EXCEPTION 'Test identity not recognized'; END IF;
   IF should_suppress THEN
    IF (SELECT delivery_state FROM public.print_provider_submission_notifications WHERE id=n)<>'suppressed' THEN RAISE EXCEPTION 'Engineering insert not suppressed'; END IF;
    -- Emulate an older writer resetting a queued intent, then flip delivery ON.
    UPDATE public.print_provider_submission_notifications SET delivery_state='pending' WHERE id=n;
    IF public.gelato_notification_eligible(n) THEN RAISE EXCEPTION 'Engineering intent became eligible'; END IF;
    claim:=public.claim_gelato_notification(n);token:=(claim->>'attemptToken')::uuid;
    IF (public.authorize_gelato_notification(n,token)->>'send')::boolean THEN RAISE EXCEPTION 'Engineering notification authorized'; END IF;
   ELSIF NOT public.gelato_notification_eligible(n) THEN RAISE EXCEPTION 'Ordinary customer printing intent was blocked';
   END IF;
  END LOOP;
 END LOOP;
END $$;
SELECT 'Gelato engineering notification insert, queued retry, mixed cohort and ordinary control: ok' AS result;


-- Canonical claim -> quote -> begin -> send authorization while ordinary gate stays OFF.
UPDATE public.print_provider_dispatch_gates SET enabled=false WHERE provider='gelato';
INSERT INTO public.orders(id,"orderId",root_order_id,execution_status,next_workflow,shipping_address,book_specs)
SELECT id,CASE WHEN id=2108 THEN 'ORDINARY-2108' ELSE 'TEST-GELATO-SCOPED-'||id END,
 CASE WHEN id=2106 THEN 'TEST-GELATO-SCOPED-2105' ELSE 'TEST-GELATO-SCOPED-'||id END,
 'ready_for_processing',CASE WHEN id IN(2105,2106) THEN '4-aggregate' ELSE '4' END,
 '{"name":"Test","street1":"123 Test St","city":"Test City","state":"CA","zip":"90001","country":"US"}'::jsonb,
 CASE WHEN id=2109 THEN '{}'::jsonb WHEN id=2111 THEN '{"testMode":"true"}'::jsonb ELSE '{"testMode":true}'::jsonb END
FROM generate_series(2101,2111) id;
-- Freeze exactly as the normal closed-gate path does before allowlist installation.
DO $$ DECLARE id bigint; claim jsonb; BEGIN
 FOR id IN SELECT generate_series(2101,2111) LOOP
  IF id=2106 THEN CONTINUE; END IF;
  claim:=public.claim_gelato_print_submission(pg_temp.routes(CASE WHEN id=2105 THEN ARRAY[2105,2106]::bigint[] ELSE ARRAY[id] END),'scoped-'||id);
  IF claim->>'reason'<>'gate_closed' THEN RAISE EXCEPTION 'Unlisted root dispatched'; END IF;
 END LOOP;
END $$;
INSERT INTO public.gelato_engineering_submission_windows(root_order_id,child_order_ids,opened_at,expires_at,closed_at,account_key_sha256,fixture_manifest_sha256,evidence_run_id)
SELECT 'TEST-GELATO-SCOPED-'||id,
 CASE WHEN id=2105 THEN ARRAY[2105,2106]::bigint[] WHEN id=2107 THEN ARRAY[2107,999999]::bigint[] ELSE ARRAY[id] END,
 CASE WHEN id=2110 THEN clock_timestamp()+interval '1 minute' ELSE clock_timestamp()-interval '1 minute' END,
 CASE WHEN id=2103 THEN clock_timestamp()-interval '1 second' ELSE clock_timestamp()+interval '10 minutes' END,
 CASE WHEN id=2104 THEN clock_timestamp() ELSE NULL END,repeat('a',64),repeat('b',64),'scoped-test'
FROM unnest(ARRAY[2101,2103,2104,2105,2107,2108,2109,2110,2111]) id;

DO $$ DECLARE id bigint; ids bigint[]; c jsonb; s uuid; token uuid; later_token uuid; BEGIN
 IF has_function_privilege('anon','public.gelato_engineering_dispatch_allowed(text,bigint[])','EXECUTE') OR
    has_function_privilege('authenticated','public.gelato_engineering_submission_allowed(uuid,uuid,text)','EXECUTE') OR
    has_table_privilege('anon','public.gelato_engineering_submission_windows','SELECT') OR
    has_table_privilege('service_role','public.gelato_engineering_submission_windows','DELETE') OR
    has_column_privilege('service_role','public.gelato_engineering_submission_windows','expires_at','UPDATE') OR
    NOT has_column_privilege('service_role','public.gelato_engineering_submission_windows','closed_at','UPDATE') THEN RAISE EXCEPTION 'Window privileges broadened'; END IF;
 FOR id IN SELECT unnest(ARRAY[2102,2103,2104,2107,2108,2109,2110,2111]) LOOP
  c:=public.claim_gelato_print_submission(pg_temp.routes(ARRAY[id]),'scoped-'||id);
  IF c->>'reason'<>'gate_closed' THEN RAISE EXCEPTION 'Outside exact live cohort dispatched: %',id; END IF;
 END LOOP;
 FOR id IN SELECT unnest(ARRAY[2101,2105]) LOOP
  ids:=CASE WHEN id=2105 THEN ARRAY[2105,2106]::bigint[] ELSE ARRAY[id] END;
  c:=public.claim_gelato_print_submission(pg_temp.routes(ids),'scoped-'||id);
  IF (c->>'dispatch')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Exact test cohort not dispatched'; END IF;
  s:=(c->>'submissionId')::uuid;token:=(c->>'claimToken')::uuid;
  IF NOT public.gelato_engineering_submission_allowed(s,token,repeat('a',64)) OR
    public.gelato_engineering_submission_allowed(s,gen_random_uuid(),repeat('a',64)) OR
    public.gelato_engineering_submission_allowed(s,token,repeat('c',64)) THEN RAISE EXCEPTION 'Submission token/account binding failed'; END IF;
  PERFORM pg_temp.record_quote(s,token);
  BEGIN
   UPDATE public.gelato_engineering_submission_windows SET closed_at=clock_timestamp() WHERE root_order_id='TEST-GELATO-SCOPED-'||id;
   PERFORM pg_temp.expect_error(format('SELECT public.begin_gelato_print_submission(%L,%L,%L,%L)',s,token,'scoped-exec-'||id,repeat('a',64)),'Gelato dispatch disabled');
   RAISE EXCEPTION 'rollback_closed_begin_probe';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'rollback_closed_begin_probe' THEN RAISE; END IF; END;
  PERFORM public.begin_gelato_print_submission(s,token,'scoped-exec-'||id,repeat('a',64));
  BEGIN
   UPDATE public.gelato_engineering_submission_windows SET closed_at=clock_timestamp() WHERE root_order_id='TEST-GELATO-SCOPED-'||id;
   PERFORM pg_temp.expect_error(format('SELECT public.authorize_gelato_print_send(%L,%L,%L,%L)',s,token,'scoped-exec-'||id,repeat('a',64)),'Gelato dispatch disabled');
   RAISE EXCEPTION 'rollback_closed_send_probe';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'rollback_closed_send_probe' THEN RAISE; END IF; END;
  PERFORM public.authorize_gelato_print_send(s,token,'scoped-exec-'||id,repeat('a',64));
  PERFORM pg_temp.expect_error(format('SELECT public.authorize_gelato_print_send(%L,%L,%L,%L)',s,token,'scoped-exec-'||id,repeat('a',64)),'already started');
  IF (public.claim_gelato_print_submission(pg_temp.routes(ids),'scoped-'||id)->>'dispatch')::boolean THEN RAISE EXCEPTION 'Scoped retry duplicated claim'; END IF;
  UPDATE public.gelato_engineering_submission_windows SET closed_at=clock_timestamp() WHERE root_order_id='TEST-GELATO-SCOPED-'||id;
  IF public.gelato_engineering_submission_allowed(s,token,repeat('a',64)) THEN RAISE EXCEPTION 'Closed window remained allowed'; END IF;
  PERFORM pg_temp.expect_error(format('UPDATE public.gelato_engineering_submission_windows SET closed_at=NULL WHERE root_order_id=%L','TEST-GELATO-SCOPED-'||id),'may only be closed once');
  PERFORM pg_temp.expect_error(format('UPDATE public.gelato_engineering_submission_windows SET expires_at=expires_at+interval ''1 minute'' WHERE root_order_id=%L','TEST-GELATO-SCOPED-'||id),'immutable');
 END LOOP;
 IF (SELECT enabled FROM public.print_provider_dispatch_gates WHERE provider='gelato') THEN RAISE EXCEPTION 'Normal gate changed'; END IF;
 PERFORM pg_temp.expect_error($q$INSERT INTO public.gelato_engineering_submission_windows(root_order_id,child_order_ids,expires_at,account_key_sha256,fixture_manifest_sha256,evidence_run_id) VALUES('ORDINARY',ARRAY[1],clock_timestamp()+interval '10 minutes',repeat('a',64),repeat('b',64),'test')$q$);
 PERFORM pg_temp.expect_error($q$INSERT INTO public.gelato_engineering_submission_windows(root_order_id,child_order_ids,expires_at,account_key_sha256,fixture_manifest_sha256,evidence_run_id) VALUES('TEST-GELATO-TOO-LONG',ARRAY[1],clock_timestamp()+interval '1 hour',repeat('a',64),repeat('b',64),'test')$q$);
END $$;
SELECT 'Scoped engineering singles/siblings, expiry, key/token/membership, close and one-send guards: ok; ordinary dispatch remained OFF' AS result;
UPDATE public.print_provider_dispatch_gates SET enabled=true WHERE provider='gelato';


-- Prepare fresh claimed contexts; shell probes will close normal dispatch and expire
-- exact windows while separate connections hold each root lock.
CREATE TABLE public.test_scoped_expiry_context(kind text,submission_id uuid,claim_token uuid,root_order_id text,child_id bigint);
INSERT INTO public.orders(id,"orderId",root_order_id,execution_status,next_workflow,shipping_address,book_specs)
SELECT id,'TEST-GELATO-EXPIRY-'||id,'TEST-GELATO-EXPIRY-'||id,'ready_for_processing','4',
 '{"name":"Test","street1":"123 Test St","city":"Test City","state":"CA","zip":"90001","country":"US"}'::jsonb,'{"testMode":true}'::jsonb FROM unnest(ARRAY[2121,2122]) id;
DO $$ DECLARE id bigint; c jsonb; s uuid; token uuid; BEGIN
 FOR id IN SELECT unnest(ARRAY[2121,2122]) LOOP
  c:=public.claim_gelato_print_submission(pg_temp.routes(ARRAY[id]),'expiry-'||id);
  s:=(c->>'submissionId')::uuid;token:=(c->>'claimToken')::uuid;
  PERFORM pg_temp.record_quote(s,token);
  IF id=2122 THEN PERFORM public.begin_gelato_print_submission(s,token,'expiry-exec',repeat('a',64)); END IF;
  INSERT INTO public.test_scoped_expiry_context VALUES(CASE id WHEN 2121 THEN 'begin' ELSE 'send' END,s,token,'TEST-GELATO-EXPIRY-'||id,id);
 END LOOP;
END $$;


-- Execute the real operator privileges, not only owner-side ACL introspection.
SET ROLE service_role;
INSERT INTO public.gelato_engineering_submission_windows(root_order_id,child_order_ids,expires_at,account_key_sha256,fixture_manifest_sha256,evidence_run_id)
 VALUES('TEST-GELATO-ROLE-PROBE',ARRAY[999999]::bigint[],clock_timestamp()+interval '10 minutes',repeat('a',64),repeat('b',64),'role-proof');
UPDATE public.gelato_engineering_submission_windows SET closed_at=clock_timestamp() WHERE root_order_id='TEST-GELATO-ROLE-PROBE';
DO $$ BEGIN
 IF public.gelato_engineering_dispatch_allowed('TEST-GELATO-ROLE-PROBE',ARRAY[999999]::bigint[]) THEN RAISE EXCEPTION 'Closed missing-members cohort allowed'; END IF;
 BEGIN
  UPDATE public.gelato_engineering_submission_windows SET closed_at=NULL WHERE root_order_id='TEST-GELATO-ROLE-PROBE';
  RAISE EXCEPTION 'role_unexpected_reopen';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Engineering window is immutable%' THEN RAISE; END IF; END;
 BEGIN
  UPDATE public.gelato_engineering_submission_windows SET expires_at=expires_at+interval '1 minute' WHERE root_order_id='TEST-GELATO-ROLE-PROBE';
  RAISE EXCEPTION 'role_unexpected_extension';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  DELETE FROM public.gelato_engineering_submission_windows WHERE root_order_id='TEST-GELATO-ROLE-PROBE';
  RAISE EXCEPTION 'role_unexpected_delete';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.gelato_engineering_dispatch_allowed('TEST-GELATO-ROLE-PROBE',ARRAY[999999]::bigint[]);RAISE EXCEPTION 'anon_unexpected_execute';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM 1 FROM public.gelato_engineering_submission_windows;RAISE EXCEPTION 'anon_unexpected_read';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
SELECT 'Actual service_role insert/terminal-close privileges and anon denial: ok' AS result;

\ir test-gelato-engineering-conversion.sql

-- Exercise new signed URL snapshot through actual quote/begin/send RPCs. The SQL
-- boundary validates shape and canonical key; server HMAC verification is separate.
BEGIN;
INSERT INTO public.orders(id,"orderId",root_order_id,execution_status,next_workflow,shipping_address)
VALUES (901,'TEST-PRINTER-CAPABILITY','TEST-PRINTER-CAPABILITY','ready_for_processing','4','{"name":"Test","street1":"123 Test St","city":"Test City","state":"CA","zip":"90001","country":"US"}');
UPDATE public.print_provider_dispatch_gates SET enabled=true WHERE provider='gelato';
DO $$ DECLARE c jsonb; sid uuid; tok uuid; saved jsonb; altered jsonb; refs text[]; url text;
BEGIN
 c:=public.claim_gelato_print_submission(pg_temp.routes(ARRAY[901]::bigint[]),'synthetic-printer-grant');
 sid:=(c->>'submissionId')::uuid;tok:=(c->>'claimToken')::uuid;
 PERFORM pg_temp.record_quote(sid,tok,true);
 SELECT quote_snapshot INTO saved FROM public.print_provider_submissions WHERE id=sid;
 SELECT array_agg(item_reference_id ORDER BY item_reference_id) INTO refs FROM public.print_provider_submission_items WHERE submission_id=sid;
 url:=saved#>>'{request,items,0,files,0,url}';
 IF position('?printerGrant=' IN url)=0 THEN RAISE EXCEPTION 'Signed PDF URL was not persisted'; END IF;
 FOREACH altered IN ARRAY ARRAY[
  jsonb_set(saved,'{request,items,0,files,0,url}',to_jsonb(replace(url,'admin.littleherolabs.com','attacker.invalid'))),
  jsonb_set(saved,'{request,items,0,files,0,url}',to_jsonb(url||'&format=json')),
  jsonb_set(saved,'{request,items,0,files,0,url}',to_jsonb(replace(url,'TEST-PRINTER-CAPABILITY','OTHER'))),
  jsonb_set(saved,'{printerFiles,expiresAt}',to_jsonb(floor(extract(epoch FROM clock_timestamp()))::bigint+30)),
  saved-'printerFiles'
 ] LOOP
  PERFORM pg_temp.expect_error(format('SELECT public.record_gelato_quote_snapshot(%L,%L,%L,%L,1,clock_timestamp(),%L,repeat(''a'',64),%L)',sid,tok,'synthetic-quote','ups_ground',refs,altered));
 END LOOP;
 PERFORM public.begin_gelato_print_submission(sid,tok,'synthetic-printer-execution',repeat('a',64));
 PERFORM public.authorize_gelato_print_send(sid,tok,'synthetic-printer-execution',repeat('a',64));
 IF (SELECT request_snapshot FROM public.print_provider_submissions WHERE id=sid) IS DISTINCT FROM saved THEN RAISE EXCEPTION 'Begin changed signed snapshot'; END IF;
 IF has_function_privilege('anon','public.record_gelato_quote_snapshot(uuid,uuid,text,text,integer,timestamp with time zone,text[],text,jsonb)','EXECUTE') OR
    has_function_privilege('authenticated','public.record_gelato_quote_snapshot(uuid,uuid,text,text,integer,timestamp with time zone,text[],text,jsonb)','EXECUTE') OR
    NOT has_function_privilege('service_role','public.record_gelato_quote_snapshot(uuid,uuid,text,text,integer,timestamp with time zone,text[],text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Printer snapshot role privileges changed'; END IF;
END $$;
ROLLBACK;
SELECT 'Printer capability snapshot shape, exact host/key/query, deadline, begin/send and role contract: ok' AS result;
