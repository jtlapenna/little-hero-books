CREATE FUNCTION pg_temp.observation_expect_error(query text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE query; EXCEPTION WHEN OTHERS THEN IF position(expected in SQLERRM)>0 THEN RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'Expected observation rejection';
END $$;
DO $$ DECLARE s uuid; expected jsonb; stale jsonb; results jsonb; financial jsonb; before_rows jsonb; token uuid; dispatch_before boolean;
BEGIN
 SELECT enabled INTO STRICT dispatch_before FROM public.print_provider_dispatch_gates WHERE provider='gelato';
 SELECT id INTO STRICT s FROM public.print_provider_submissions WHERE workflow_job_idempotency_key='cp1-key';
 financial:='{"version":1,"status":"pending","currency":"USD","receipts":[],"processedFiles":[],"reviewReason":null}';
 SELECT jsonb_agg(jsonb_build_object('providerOrderId',provider_order_id,'digest',snapshot_digest,'eventAt',last_event_at,'observationRevision',observation_revision))
   INTO expected FROM public.print_provider_submission_orders WHERE submission_id=s;
 SELECT jsonb_agg(jsonb_build_object('providerOrderId',po.provider_order_id,'digest',repeat('7',64),'status',po.status,'orderType',po.order_type,'accepted',true,'actionReason',NULL,
   'snapshot',po.snapshot,'financialObservation',financial,'financialAccepted',true,'financialActionReason',NULL,
   'items',(SELECT jsonb_agg(jsonb_build_object('itemReferenceId',i.item_reference_id,'providerItemId',i.provider_item_id,'status',i.status,'orderType',po.order_type,'actionReason',NULL,'tracking',i.tracking))
     FROM public.print_provider_submission_items i WHERE i.submission_id=s AND i.provider_order_id=po.provider_order_id)))
   INTO results FROM public.print_provider_submission_orders po WHERE po.submission_id=s;
 PERFORM public.apply_gelato_provider_snapshots(s,expected,results,'[]','[]');
 IF EXISTS(SELECT 1 FROM public.print_provider_submission_orders WHERE submission_id=s AND (financial_observation IS DISTINCT FROM financial OR financial_observed_at IS NULL)) THEN RAISE EXCEPTION 'Financial bootstrap missing'; END IF;
 SELECT jsonb_agg(jsonb_build_object('providerOrderId',provider_order_id,'digest',snapshot_digest,'eventAt',last_event_at,'observationRevision',observation_revision))
   INTO expected FROM public.print_provider_submission_orders WHERE submission_id=s;
 stale:=expected;
 -- Identical provider digest/time still advances observation revision. A delayed
 -- manual/webhook hold or application result must no longer overwrite this check.
 PERFORM public.apply_gelato_provider_snapshots(s,expected,results,'[]','[]');
 PERFORM pg_temp.observation_expect_error(format('SELECT public.apply_gelato_provider_snapshots(%L,%L,%L)',s,stale,results),'changed concurrently');
 PERFORM pg_temp.observation_expect_error(format('SELECT public.hold_gelato_provider_refresh(%L,%L,%L)',s,stale,'old_failed_check'),'Stale Gelato refresh hold');
 SELECT jsonb_agg(jsonb_build_object('providerOrderId',provider_order_id,'digest',snapshot_digest,'eventAt',last_event_at,'observationRevision',observation_revision))
   INTO expected FROM public.print_provider_submission_orders WHERE submission_id=s;
 -- Same-time changed finance is held separately, without undoing fulfillment or
 -- replacing the previously accepted payment observation.
 SELECT jsonb_agg(value || jsonb_build_object('financialObservation',jsonb_set(financial,'{status}','"paid"'),'financialAccepted',false,'financialActionReason','same_timestamp_financial_change')) INTO results FROM jsonb_array_elements(results);
 PERFORM public.apply_gelato_provider_snapshots(s,expected,results,'[]','[]');
 IF EXISTS(SELECT 1 FROM public.print_provider_submission_orders WHERE submission_id=s AND (financial_observation->>'status'<>'pending' OR financial_action_reason<>'same_timestamp_financial_change')) THEN RAISE EXCEPTION 'Conflicting financial observation replaced accepted evidence'; END IF;
 SELECT jsonb_agg(jsonb_build_object('providerOrderId',provider_order_id,'digest',snapshot_digest,'eventAt',last_event_at,'observationRevision',observation_revision)),
   jsonb_agg(to_jsonb(po) ORDER BY provider_order_id) INTO expected,before_rows FROM public.print_provider_submission_orders po WHERE submission_id=s;
 PERFORM pg_temp.observation_expect_error(format('SELECT public.apply_gelato_provider_snapshots(%L,%L,%L)',s,expected,jsonb_set(results,'{1,snapshot,customerReferenceId}','"wrong-group"')),'identity changed');
 IF before_rows IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(po) ORDER BY provider_order_id) FROM public.print_provider_submission_orders po WHERE submission_id=s) THEN RAISE EXCEPTION 'Invalid graph partially wrote financial observations'; END IF;
 -- Both operation orders: scheduled result then delayed manual result; manual
 -- result then delayed scheduled result. Queue token ownership and revision CAS
 -- are separate fences and both must hold.
 PERFORM public.register_gelato_scheduled_status(s,repeat('c',64),true);
 SELECT lease_token INTO STRICT token FROM public.claim_gelato_scheduled_status(repeat('c',64),30);
 PERFORM public.apply_gelato_scheduled_snapshots(s,token,expected,results,'[]','[]');
 PERFORM pg_temp.observation_expect_error(format('SELECT public.apply_gelato_provider_snapshots(%L,%L,%L)',s,expected,results),'changed concurrently');
 SELECT jsonb_agg(jsonb_build_object('providerOrderId',provider_order_id,'digest',snapshot_digest,'eventAt',last_event_at,'observationRevision',observation_revision)) INTO expected FROM public.print_provider_submission_orders WHERE submission_id=s;
 PERFORM public.apply_gelato_provider_snapshots(s,expected,results,'[]','[]');
 PERFORM pg_temp.observation_expect_error(format('SELECT public.apply_gelato_scheduled_snapshots(%L,%L,%L,%L)',s,token,expected,results),'changed concurrently');
 PERFORM public.finish_gelato_scheduled_status(s,token,'requires_review');
 IF (SELECT last_success_at IS NULL OR last_result<>'requires_review' FROM public.gelato_scheduled_status WHERE submission_id=s) THEN RAISE EXCEPTION 'Completed review check freshness missing'; END IF;
 IF dispatch_before IS DISTINCT FROM (SELECT enabled FROM public.print_provider_dispatch_gates WHERE provider='gelato') THEN RAISE EXCEPTION 'Status observation changed dispatch'; END IF;
END $$;
-- Incident regression: accepted zero-cost paid/shipped facts and attention must
-- coexist in the real projection. Roll back so later local fixtures are unchanged.
BEGIN;
DO $$ DECLARE s uuid; expected jsonb; results jsonb; notification_count bigint; dispatch_before boolean;
BEGIN
 SELECT id INTO STRICT s FROM public.print_provider_submissions WHERE workflow_job_idempotency_key='cp1-key';
 SELECT count(*) INTO notification_count FROM public.print_provider_submission_notifications WHERE submission_id=s;
 SELECT enabled INTO STRICT dispatch_before FROM public.print_provider_dispatch_gates WHERE provider='gelato';
 SELECT jsonb_agg(jsonb_build_object('providerOrderId',provider_order_id,'digest',snapshot_digest,'eventAt',last_event_at,'observationRevision',observation_revision)) INTO expected
   FROM public.print_provider_submission_orders WHERE submission_id=s;
 SELECT jsonb_agg(jsonb_build_object('providerOrderId',po.provider_order_id,'digest',repeat('8',64),'status','shipped','orderType','order','accepted',true,
   'actionReason','unexpected_test_order_production',
   'snapshot',po.snapshot || jsonb_build_object('orderType','order','fulfillmentStatus','shipped','updatedAt',greatest(clock_timestamp(),po.last_event_at+interval '1 second'),
     'items',(SELECT jsonb_agg(value || '{"fulfillmentStatus":"shipped"}'::jsonb) FROM jsonb_array_elements(po.snapshot->'items'))),
   'financialObservation',jsonb_build_object('version',1,'status','paid','currency','USD','processedFiles','[]'::jsonb,'reviewReason',NULL,
     'receipts',jsonb_build_array(jsonb_build_object('currency','USD','amounts',jsonb_build_object('total','0','totalInclVat','0')))),
   'financialAccepted',true,'financialActionReason',NULL,
   'items',(SELECT jsonb_agg(jsonb_build_object('itemReferenceId',i.item_reference_id,'providerItemId',i.provider_item_id,'status','shipped','orderType','order',
     'actionReason','unexpected_test_order_production','tracking',jsonb_build_array(jsonb_build_object('trackingNumber','SYNTHETIC-INCIDENT-TRACK','providerOrderId',po.provider_order_id,'providerItemIds',jsonb_build_array(i.provider_item_id)))))
     FROM public.print_provider_submission_items i WHERE i.submission_id=s AND i.provider_order_id=po.provider_order_id))) INTO results
   FROM public.print_provider_submission_orders po WHERE po.submission_id=s;
 PERFORM public.apply_gelato_provider_snapshots(s,expected,results,'[]','[]');
 IF EXISTS(SELECT 1 FROM public.print_provider_submission_orders WHERE submission_id=s AND (status IS DISTINCT FROM 'shipped' OR order_type IS DISTINCT FROM 'order' OR action_reason IS DISTINCT FROM 'unexpected_test_order_production'
     OR financial_observation->>'status' IS DISTINCT FROM 'paid' OR financial_observation#>>'{receipts,0,amounts,total}' IS DISTINCT FROM '0')) THEN RAISE EXCEPTION 'Incident projection lost provider or financial facts'; END IF;
 IF EXISTS(SELECT 1 FROM public.print_provider_submission_items WHERE submission_id=s AND (status IS DISTINCT FROM 'shipped' OR action_reason IS DISTINCT FROM 'unexpected_test_order_production' OR tracking#>>'{0,trackingNumber}' IS DISTINCT FROM 'SYNTHETIC-INCIDENT-TRACK'
     OR tracking#>>'{0,providerOrderId}' IS DISTINCT FROM provider_order_id OR tracking#>'{0,providerItemIds}' IS DISTINCT FROM jsonb_build_array(provider_item_id))) THEN RAISE EXCEPTION 'Incident child mapping lost attention or tracking'; END IF;
 IF EXISTS(SELECT 1 FROM public.orders WHERE print_submission_id=s AND (gelato_status IS DISTINCT FROM 'shipped' OR gelato_action_reason IS DISTINCT FROM 'unexpected_test_order_production' OR gelato_tracking#>>'{0,trackingNumber}' IS DISTINCT FROM 'SYNTHETIC-INCIDENT-TRACK')) THEN RAISE EXCEPTION 'Incident admin projection lost facts'; END IF;
 IF notification_count<>(SELECT count(*) FROM public.print_provider_submission_notifications WHERE submission_id=s) THEN RAISE EXCEPTION 'Incident queued a customer message'; END IF;
 IF dispatch_before IS DISTINCT FROM (SELECT enabled FROM public.print_provider_dispatch_gates WHERE provider='gelato') THEN RAISE EXCEPTION 'Incident observation changed dispatch'; END IF;
END $$;
ROLLBACK;
SELECT 'Financial bootstrap/held observations, revision CAS/graph rollback, scheduler overlap and zero-cost paid/shipped attention projection with no messages: ok' AS result;
