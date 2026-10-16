-- Included in the same disposable psql session as test-gelato-print-submissions.sql.
UPDATE public.print_provider_dispatch_gates SET enabled=false WHERE provider='gelato';
CREATE TABLE public.test_conversion_cases(kind text PRIMARY KEY,submission_id uuid,authorization_id uuid);
INSERT INTO public.orders(id,"orderId",root_order_id,execution_status,next_workflow,shipping_address,book_specs)
SELECT id,'TEST-GELATO-CONVERT-'||id,CASE WHEN id=9803 THEN 'TEST-GELATO-CONVERT-9802' ELSE 'TEST-GELATO-CONVERT-'||id END,
 'ready_for_processing',CASE WHEN id IN(9802,9803) THEN '4-aggregate' ELSE '4' END,
 '{"name":"Test","street1":"123 Test St","city":"Test City","state":"CA","zip":"90001","country":"US"}'::jsonb,'{"testMode":true}'::jsonb
FROM unnest(ARRAY[9801,9802,9803,9804,9805,9806]) id;
DO $$ DECLARE child bigint; ids bigint[]; claim jsonb; sid uuid; token uuid; request jsonb; graph jsonb; root text; BEGIN
 FOR child IN SELECT unnest(ARRAY[9801,9802,9804,9805,9806]) LOOP
  ids:=CASE WHEN child=9802 THEN ARRAY[9802,9803]::bigint[] ELSE ARRAY[child] END;
  claim:=public.claim_gelato_print_submission(pg_temp.routes(ids),'conversion-'||child);
  IF claim->>'reason'<>'gate_closed' THEN RAISE EXCEPTION 'Conversion fixture unexpectedly dispatched'; END IF;
  root:='TEST-GELATO-CONVERT-'||child;
  INSERT INTO public.gelato_engineering_submission_windows(root_order_id,child_order_ids,expires_at,account_key_sha256,fixture_manifest_sha256,evidence_run_id)
   VALUES(root,ids,clock_timestamp()+interval '10 minutes',repeat('a',64),repeat('f',64),'conversion-fixture');
  claim:=public.claim_gelato_print_submission(pg_temp.routes(ids),'conversion-'||child);sid:=(claim->>'submissionId')::uuid;token:=(claim->>'claimToken')::uuid;
  PERFORM pg_temp.record_quote(sid,token);
  PERFORM public.begin_gelato_print_submission(sid,token,'conversion-native-'||child,repeat('a',64));
  PERFORM public.authorize_gelato_print_send(sid,token,'conversion-native-'||child,repeat('a',64));
  PERFORM public.record_gelato_accepted_root(sid,token,'conversion-native-'||child,'conversion-provider-'||child);
  SELECT request_snapshot->'request' INTO request FROM public.print_provider_submissions WHERE id=sid;
  SELECT jsonb_build_array(jsonb_build_object('id','conversion-provider-'||child,'orderType','draft','orderReferenceId',request->>'orderReferenceId',
   'customerReferenceId',root,'currency','USD','fulfillmentStatus','draft','updatedAt',clock_timestamp(),'connectedOrderIds','[]'::jsonb,
   'shippingAddress',request->'shippingAddress','items',(SELECT jsonb_agg(v||jsonb_build_object('id','conversion-item-'||(v->>'itemReferenceId'),'fulfillmentStatus','created')) FROM jsonb_array_elements(request->'items') v))) INTO graph;
  PERFORM public.persist_gelato_draft_result(sid,token,'conversion-native-'||child,graph);
  UPDATE public.gelato_engineering_submission_windows SET closed_at=clock_timestamp() WHERE root_order_id=root;
  INSERT INTO public.test_conversion_cases(kind,submission_id) VALUES(CASE child WHEN 9801 THEN 'single' WHEN 9802 THEN 'siblings' WHEN 9804 THEN 'race' WHEN 9805 THEN 'expiry-begin' ELSE 'expiry-send' END,sid);
 END LOOP;
END $$;
CREATE FUNCTION public.test_create_conversion_authorization(sid uuid,ttl interval DEFAULT interval '10 minutes',omit_member boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE result uuid; at timestamptz:=clock_timestamp(); root text; assets jsonb; BEGIN
 SELECT accepted_root_order_id INTO root FROM public.print_provider_submissions WHERE id=sid;
 SELECT jsonb_agg(jsonb_build_object('child_order_id',child_order_id,'artifact_key',artifact_key,'provider_item_id',provider_item_id,'sha256',repeat('b',64)) ORDER BY child_order_id) INTO assets FROM public.print_provider_submission_items WHERE submission_id=sid;
 IF omit_member THEN assets:=jsonb_build_array(assets->0); END IF;
 INSERT INTO public.gelato_engineering_conversions(submission_id,provider_root_id,account_key_sha256,fixture_manifest_sha256,funding_receipt_sha256,no_payment_routes_confirmed,funding_inspected_at,opened_at,expires_at,artifacts)
 VALUES(sid,root,repeat('a',64),repeat('f',64),repeat('c',64),true,at,at,at+ttl,assets) RETURNING id INTO result;
 RETURN result;
END $$;
DO $$ DECLARE sid uuid; aid uuid; begun jsonb; owner uuid; BEGIN
 SELECT submission_id INTO sid FROM public.test_conversion_cases WHERE kind='single';
 -- Invalid shape is rejected rather than passing through SQL NULL conditions.
 BEGIN
  aid:=public.test_create_conversion_authorization(sid);
  PERFORM pg_temp.expect_error(format('UPDATE public.gelato_engineering_conversions SET artifacts=''[{"artifact_key":"x","foo":1,"bar":2}]'' WHERE id=%L',aid),'immutable');
  PERFORM pg_temp.expect_error(format('INSERT INTO public.gelato_engineering_conversions(submission_id,provider_root_id,account_key_sha256,fixture_manifest_sha256,funding_receipt_sha256,no_payment_routes_confirmed,funding_inspected_at,opened_at,expires_at,artifacts) SELECT submission_id,provider_root_id,account_key_sha256,fixture_manifest_sha256,funding_receipt_sha256,no_payment_routes_confirmed,funding_inspected_at,opened_at,expires_at,''[{"artifact_key":"x","foo":1,"bar":2,"baz":3}]''::jsonb FROM public.gelato_engineering_conversions WHERE id=%L',aid),'Exact artifact');
  RAISE EXCEPTION 'rollback_shape_probe';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'rollback_shape_probe' THEN RAISE; END IF; END;
 BEGIN
  aid:=public.test_create_conversion_authorization(sid,interval '80 milliseconds');PERFORM pg_sleep(0.1);
  PERFORM pg_temp.expect_error(format('SELECT public.begin_gelato_engineering_conversion(%L,repeat(''a'',64))',aid),'not authorized');
  PERFORM pg_temp.expect_error(format('UPDATE public.gelato_engineering_conversions SET state=''preparing'',owner_token=gen_random_uuid(),preparing_at=clock_timestamp() WHERE id=%L',aid),'expired or changed');
  RAISE EXCEPTION 'rollback_expiry_probe';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'rollback_expiry_probe' THEN RAISE; END IF; END;
 aid:=public.test_create_conversion_authorization(sid);UPDATE public.test_conversion_cases SET authorization_id=aid WHERE kind='single';
 IF NOT public.gelato_engineering_conversion_matches(aid) THEN RAISE EXCEPTION 'Valid single rejected'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.begin_gelato_engineering_conversion(%L,repeat(''d'',64))',aid),'not authorized');
 PERFORM pg_temp.expect_error(format('UPDATE public.gelato_engineering_conversions SET expires_at=expires_at+interval ''1 minute'' WHERE id=%L',aid),'immutable');
 BEGIN
  UPDATE public.print_provider_dispatch_gates SET enabled=true WHERE provider='gelato';
  PERFORM pg_temp.expect_error(format('SELECT public.begin_gelato_engineering_conversion(%L,repeat(''a'',64))',aid),'not authorized');
  RAISE EXCEPTION 'rollback_gate_probe';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'rollback_gate_probe' THEN RAISE; END IF; END;
 BEGIN
  UPDATE public.print_provider_submission_items SET provider_item_id='foreign-item' WHERE submission_id=sid;
  IF public.gelato_engineering_conversion_matches(aid) THEN RAISE EXCEPTION 'Foreign provider item matched'; END IF;
  PERFORM pg_temp.expect_error(format('SELECT public.begin_gelato_engineering_conversion(%L,repeat(''a'',64))',aid),'not authorized');
  RAISE EXCEPTION 'rollback_item_probe';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'rollback_item_probe' THEN RAISE; END IF; END;
 begun:=public.begin_gelato_engineering_conversion(aid,repeat('a',64));owner:=(begun->>'owner_token')::uuid;
 PERFORM pg_temp.expect_error(format('SELECT public.begin_gelato_engineering_conversion(%L,repeat(''a'',64))',aid),'not authorized');
 PERFORM pg_temp.expect_error(format('SELECT public.authorize_gelato_engineering_conversion_send(%L,gen_random_uuid(),repeat(''a'',64),repeat(''e'',64))',aid),'not authorized');
 BEGIN
  PERFORM public.close_gelato_engineering_conversion(aid);
  PERFORM pg_temp.expect_error(format('SELECT public.authorize_gelato_engineering_conversion_send(%L,%L,repeat(''a'',64),repeat(''e'',64))',aid,owner),'not authorized');
  PERFORM pg_temp.expect_error(format('UPDATE public.gelato_engineering_conversions SET closed_at=NULL WHERE id=%L',aid),'terminal');
  RAISE EXCEPTION 'rollback_close_probe';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'rollback_close_probe' THEN RAISE; END IF; END;
 PERFORM public.authorize_gelato_engineering_conversion_send(aid,owner,repeat('a',64),repeat('e',64));
 PERFORM pg_temp.expect_error(format('SELECT public.authorize_gelato_engineering_conversion_send(%L,%L,repeat(''a'',64),repeat(''e'',64))',aid,owner),'not authorized');
 PERFORM public.close_gelato_engineering_conversion(aid);
 PERFORM public.finish_gelato_engineering_conversion(aid,owner,'outcome_unknown','{"noAutomaticRetry":true}');
 PERFORM public.finish_gelato_engineering_conversion(aid,owner,'converted','{"providerState":"on_hold"}');
 PERFORM pg_temp.expect_error(format('SELECT public.finish_gelato_engineering_conversion(%L,%L,''rejected'',''{}'')',aid,owner),'not owned');
 PERFORM pg_temp.expect_error(format('DELETE FROM public.gelato_engineering_conversions WHERE id=%L',aid),'cannot be deleted');
 IF EXISTS(SELECT 1 FROM public.print_provider_submission_notifications WHERE submission_id=sid) THEN RAISE EXCEPTION 'Conversion test generated message intents'; END IF;
END $$;
SET ROLE service_role;
DO $$ DECLARE sid uuid; aid uuid; begun jsonb; BEGIN
 SELECT submission_id INTO sid FROM public.test_conversion_cases WHERE kind='siblings';
 BEGIN
  aid:=public.test_create_conversion_authorization(sid,interval '10 minutes',true);
  IF public.gelato_engineering_conversion_matches(aid) THEN RAISE EXCEPTION 'Partial sibling matched'; END IF;
  BEGIN PERFORM public.begin_gelato_engineering_conversion(aid,repeat('a',64));RAISE EXCEPTION 'Partial sibling began';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Engineering conversion is not authorized' THEN RAISE; END IF;END;
  RAISE EXCEPTION 'rollback_partial_probe';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'rollback_partial_probe' THEN RAISE; END IF; END;
 aid:=public.test_create_conversion_authorization(sid);UPDATE public.test_conversion_cases SET authorization_id=aid WHERE kind='siblings';
 begun:=public.begin_gelato_engineering_conversion(aid,repeat('a',64));
 PERFORM public.authorize_gelato_engineering_conversion_send(aid,(begun->>'owner_token')::uuid,repeat('a',64),repeat('e',64));
 PERFORM public.finish_gelato_engineering_conversion(aid,(begun->>'owner_token')::uuid,'rejected','{"patchHttpStatus":400}');
 PERFORM public.close_gelato_engineering_conversion(aid);
 BEGIN UPDATE public.gelato_engineering_conversions SET funding_receipt_sha256=repeat('a',64) WHERE id=aid;RAISE EXCEPTION 'Role changed funding';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN DELETE FROM public.gelato_engineering_conversions WHERE id=aid;RAISE EXCEPTION 'Role deleted evidence';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM 1 FROM public.gelato_engineering_conversions;RAISE EXCEPTION 'anon read';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.begin_gelato_engineering_conversion(gen_random_uuid(),repeat('a',64));RAISE EXCEPTION 'anon execute';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT enabled FROM public.print_provider_dispatch_gates WHERE provider='gelato') THEN RAISE EXCEPTION 'Normal gate changed'; END IF;
END $$;
UPDATE public.print_provider_dispatch_gates SET enabled=true WHERE provider='gelato';
SELECT 'Engineering conversion one-time single/sibling, owner/key/expiry/closure/roles and no-message guards: ok' AS result;
