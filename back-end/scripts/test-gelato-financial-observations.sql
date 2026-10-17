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
SELECT 'Financial bootstrap/held observations, revision CAS including identical snapshots/stale holds, graph rollback and scheduled/manual overlap: ok' AS result;
