BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS print_provider text CHECK (print_provider IN ('lulu', 'gelato')),
  ADD COLUMN IF NOT EXISTS print_config_version integer CHECK (print_config_version > 0),
  ADD COLUMN IF NOT EXISTS print_product_uid text,
  ADD COLUMN IF NOT EXISTS print_inner_page_count integer CHECK (print_inner_page_count > 0),
  ADD COLUMN IF NOT EXISTS print_api_page_count integer CHECK (print_api_page_count > 0),
  ADD COLUMN IF NOT EXISTS print_expected_pdf_page_count integer CHECK (print_expected_pdf_page_count > 0),
  ADD COLUMN IF NOT EXISTS print_book_id text,
  ADD COLUMN IF NOT EXISTS print_format_id text,
  ADD COLUMN IF NOT EXISTS print_manifest_key text,
  ADD COLUMN IF NOT EXISTS print_submission_id uuid,
  ADD COLUMN IF NOT EXISTS print_claim_token uuid,
  ADD COLUMN IF NOT EXISTS gelato_status text,
  ADD COLUMN IF NOT EXISTS gelato_order_id text,
  ADD COLUMN IF NOT EXISTS gelato_order_type text,
  ADD COLUMN IF NOT EXISTS gelato_action_reason text,
  ADD COLUMN IF NOT EXISTS gelato_tracking jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS gelato_updated_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS orders_frozen_print_identity_unique
  ON public.orders("orderId") WHERE print_manifest_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.print_provider_dispatch_gates (
  provider text PRIMARY KEY CHECK (provider = 'gelato'),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.print_provider_dispatch_gates(provider) VALUES ('gelato') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.print_provider_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider = 'gelato'),
  order_reference_id text NOT NULL,
  workflow_job_idempotency_key text NOT NULL,
  logical_group text NOT NULL,
  root_order_id text NOT NULL,
  claim_token uuid NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  request_state text NOT NULL CHECK (request_state IN ('claimed','submitting','outcome_unknown','submitted','failed')),
  quote_id text,
  shipment_method_uid text,
  shipment_policy_version integer,
  quoted_at timestamptz,
  quote_item_reference_ids text[] NOT NULL DEFAULT '{}',
  quote_request_fingerprint text,
  quote_claim_token uuid,
  owning_execution_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(provider, order_reference_id),
  UNIQUE(provider, workflow_job_idempotency_key),
  UNIQUE(provider, logical_group)
);
ALTER TABLE public.print_provider_submissions
  ADD COLUMN IF NOT EXISTS quote_id text,
  ADD COLUMN IF NOT EXISTS shipment_method_uid text,
  ADD COLUMN IF NOT EXISTS shipment_policy_version integer,
  ADD COLUMN IF NOT EXISTS quoted_at timestamptz,
  ADD COLUMN IF NOT EXISTS quote_item_reference_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS quote_request_fingerprint text,
  ADD COLUMN IF NOT EXISTS quote_claim_token uuid,
  ADD COLUMN IF NOT EXISTS quote_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS request_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS send_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_root_order_id text,
  ADD COLUMN IF NOT EXISTS action_reason text;
CREATE TABLE IF NOT EXISTS public.print_provider_submission_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.print_provider_submissions(id),
  provider text NOT NULL CHECK (provider = 'gelato'),
  provider_order_id text NOT NULL,
  status text NOT NULL,
  last_event_at timestamptz,
  UNIQUE(provider, provider_order_id),
  UNIQUE(submission_id, provider_order_id)
);
CREATE TABLE IF NOT EXISTS public.print_provider_submission_items (
  submission_id uuid NOT NULL REFERENCES public.print_provider_submissions(id),
  item_reference_id text NOT NULL,
  child_order_id bigint NOT NULL,
  child_order_key text NOT NULL,
  provider_order_id text,
  status text,
  last_event_at timestamptz,
  PRIMARY KEY(submission_id, item_reference_id),
  UNIQUE(submission_id, child_order_id),
  UNIQUE(submission_id, child_order_key),
  FOREIGN KEY(submission_id, provider_order_id)
    REFERENCES public.print_provider_submission_orders(submission_id, provider_order_id)
);
CREATE TABLE IF NOT EXISTS public.print_provider_submission_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  child_order_id bigint NOT NULL,
  notification_type text NOT NULL,
  delivery_state text NOT NULL DEFAULT 'pending' CHECK (delivery_state IN ('pending','delivering','delivered','failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at timestamptz,
  attempt_result text,
  UNIQUE(submission_id, child_order_id, notification_type),
  FOREIGN KEY(submission_id, child_order_id)
    REFERENCES public.print_provider_submission_items(submission_id, child_order_id)
);

ALTER TABLE public.print_provider_submission_items
  ADD COLUMN IF NOT EXISTS artifact_key text,
  ADD COLUMN IF NOT EXISTS artifact_fingerprint text,
  ADD COLUMN IF NOT EXISTS artifact_claim_token uuid,
  ADD COLUMN IF NOT EXISTS pdf_page_count integer,
  ADD COLUMN IF NOT EXISTS provider_item_id text,
  ADD COLUMN IF NOT EXISTS tracking jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS action_reason text,
  ADD COLUMN IF NOT EXISTS progress_status text;
ALTER TABLE public.print_provider_submission_orders
  ADD COLUMN IF NOT EXISTS order_type text,
  ADD COLUMN IF NOT EXISTS snapshot jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_digest text,
  ADD COLUMN IF NOT EXISTS action_reason text,
  ADD COLUMN IF NOT EXISTS progress_status text,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_print_submission_fk') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_print_submission_fk
      FOREIGN KEY(print_submission_id) REFERENCES public.print_provider_submissions(id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.legacy_print_book_id(p_order jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE hints text[]; identities text[]; manifest_key text; product jsonb; specs jsonb;
BEGIN
  product := p_order->'product_info';
  specs := p_order->'book_specs';
  IF jsonb_typeof(product) = 'string' THEN product := (product#>>'{}')::jsonb; END IF;
  IF jsonb_typeof(specs) = 'string' THEN specs := (specs#>>'{}')::jsonb; END IF;
  hints := ARRAY[p_order->>'book_id',p_order->>'project',specs->>'bookId',specs->>'book_id',
    product->>'bookId',product->>'book_id',product#>>'{bookSpecs,bookId}',product#>>'{book_specs,bookId}'];
  manifest_key := split_part(split_part(p_order->>'one_manifest_url','?',1),'#',1);
  manifest_key := regexp_replace(manifest_key,'^https://[^/]+\.r2\.(dev|cloudflarestorage\.com)/','');
  manifest_key := regexp_replace(manifest_key,'^https://admin\.littleherolabs\.com/api/manifests/','');
  IF manifest_key = split_part(manifest_key,'/',1) || '/orders/' || (p_order->>'orderId') || '/manifests/1-manifest.json' THEN
    hints := array_append(hints,split_part(manifest_key,'/',1));
  ELSIF coalesce(length(manifest_key),0) > 0 THEN
    RETURN NULL;
  END IF;
  SELECT array_agg(DISTINCT trim(hint)) INTO identities FROM unnest(hints) hint WHERE coalesce(length(trim(hint)),0) > 0;
  IF cardinality(identities) = 1 AND identities[1] IN ('book-finding-our-inner-voice','book-mvp-simple-adventure','book-2-example') THEN RETURN identities[1]; END IF;
  RETURN NULL;
EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
END $$;

UPDATE public.orders o SET print_provider = 'lulu'
WHERE print_provider IS NULL
  AND o.created_at <= (SELECT created_at FROM public.print_provider_dispatch_gates WHERE provider = 'gelato')
  AND public.legacy_print_book_id(to_jsonb(o)) IS NOT NULL;

CREATE OR REPLACE FUNCTION public.gelato_print_destination_key(address jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE fields text[]; normalized jsonb;
BEGIN
  IF jsonb_typeof(address) = 'string' THEN address := (address#>>'{}')::jsonb; END IF;
  fields := ARRAY[
    coalesce(nullif(trim(address->>'name'),''),nullif(trim(address->>'recipient_name'),'')),
    coalesce(nullif(trim(address->>'address_line_1'),''),nullif(trim(address->>'address_line1'),''),nullif(trim(address->>'address1'),''),nullif(trim(address->>'street1'),''),nullif(trim(address->>'street'),''),nullif(trim(address->>'address'),'')),
    coalesce(nullif(trim(address->>'address_line_2'),''),nullif(trim(address->>'address_line2'),''),nullif(trim(address->>'address2'),''),nullif(trim(address->>'street2'),''),''),
    nullif(trim(address->>'city'),''),coalesce(nullif(trim(address->>'state_code'),''),nullif(trim(address->>'state'),'')),
    coalesce(nullif(trim(address->>'postal_code'),''),nullif(trim(address->>'postcode'),''),nullif(trim(address->>'zip'),'')),
    coalesce(nullif(trim(address->>'country_code'),''),nullif(trim(address->>'country'),''))];
  IF array_position(fields,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Incomplete print destination'; END IF;
  SELECT jsonb_agg(lower(regexp_replace(trim(value),'\s+',' ','g'))) INTO normalized FROM unnest(fields) value;
  RETURN normalized;
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

CREATE OR REPLACE FUNCTION public.lock_gelato_submission_root(p_submission_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE root_id text;
BEGIN
  SELECT root_order_id INTO STRICT root_id FROM public.print_provider_submissions WHERE id = p_submission_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('gelato-root:' || root_id,0));
END $$;
REVOKE ALL ON FUNCTION public.lock_gelato_submission_root(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_gelato_submission_root(uuid) TO service_role;

DROP FUNCTION IF EXISTS public.begin_gelato_print_submission(uuid,uuid,text);
DROP FUNCTION IF EXISTS public.authorize_gelato_print_send(uuid,uuid,text);
DROP FUNCTION IF EXISTS public.record_gelato_print_quote(uuid,uuid,text,text,integer,timestamptz,text[]);

CREATE OR REPLACE FUNCTION public.begin_gelato_print_submission(p_submission_id uuid, p_token uuid, p_execution_id text, p_request_fingerprint text)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE; current_refs text[];
BEGIN
  IF coalesce(length(p_execution_id),0) = 0 THEN RAISE EXCEPTION 'Missing print execution'; END IF;
  IF NOT coalesce((SELECT enabled FROM public.print_provider_dispatch_gates WHERE provider = 'gelato' FOR SHARE),false) THEN RAISE EXCEPTION 'Gelato dispatch disabled'; END IF;
  PERFORM public.lock_gelato_submission_root(p_submission_id);
  SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id = p_submission_id FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.renew_gelato_print_submission(
  p_submission_id uuid, p_token uuid, p_execution_id text, p_lease_seconds integer DEFAULT 900
) RETURNS timestamptz LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE; renewed_until timestamptz;
BEGIN
  IF p_lease_seconds < 30 OR p_lease_seconds > 900 THEN RAISE EXCEPTION 'Invalid print lease duration'; END IF;
  PERFORM public.lock_gelato_submission_root(p_submission_id);
  SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id = p_submission_id FOR UPDATE;
  IF s.claim_token IS DISTINCT FROM p_token OR s.lease_expires_at <= clock_timestamp()
     OR s.request_state <> 'submitting' OR s.owning_execution_id IS DISTINCT FROM p_execution_id THEN
    RAISE EXCEPTION 'Stale print lease renewal';
  END IF;
  renewed_until := clock_timestamp() + make_interval(secs => p_lease_seconds);
  UPDATE public.print_provider_submissions SET lease_expires_at = renewed_until,
    updated_at = clock_timestamp() WHERE id = s.id;
  RETURN renewed_until;
END $$;

CREATE OR REPLACE FUNCTION public.fence_gelato_print_submission(p_submission_id uuid, p_token uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE; new_token uuid;
BEGIN
  PERFORM public.lock_gelato_submission_root(p_submission_id);
  SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id = p_submission_id FOR UPDATE;
  IF s.claim_token IS DISTINCT FROM p_token OR s.request_state NOT IN ('claimed','submitting') THEN RAISE EXCEPTION 'Stale print fence'; END IF;
  IF EXISTS (SELECT 1 FROM public.print_provider_submission_items i JOIN public.orders o ON o.id = i.child_order_id
      WHERE i.submission_id = s.id AND (o.print_submission_id IS DISTINCT FROM s.id OR o.print_claim_token IS DISTINCT FROM p_token)) THEN
    RAISE EXCEPTION 'Print fence ownership mismatch';
  END IF;
  new_token := gen_random_uuid();
  UPDATE public.print_provider_submissions SET claim_token = new_token, lease_expires_at = clock_timestamp(),
    request_state = CASE WHEN s.send_started_at IS NULL THEN 'failed' ELSE 'outcome_unknown' END,
    quote_id = NULL, shipment_method_uid = NULL, shipment_policy_version = NULL, quoted_at = NULL,
    quote_item_reference_ids = '{}', quote_request_fingerprint = NULL, quote_claim_token = NULL, updated_at = clock_timestamp() WHERE id = s.id;
  UPDATE public.orders o SET print_claim_token = new_token,
    execution_status = CASE WHEN s.send_started_at IS NULL THEN 'ready_for_processing' ELSE execution_status END,
    current_workflow = CASE WHEN s.send_started_at IS NULL THEN NULL ELSE current_workflow END,
    started_at = CASE WHEN s.send_started_at IS NULL THEN NULL ELSE started_at END
    FROM public.print_provider_submission_items i WHERE i.submission_id = s.id AND i.child_order_id = o.id;
END $$;

CREATE OR REPLACE FUNCTION public.authorize_gelato_print_send(p_submission_id uuid, p_token uuid, p_execution_id text, p_request_fingerprint text)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE; current_refs text[];
BEGIN
  IF NOT coalesce((SELECT enabled FROM public.print_provider_dispatch_gates WHERE provider = 'gelato' FOR SHARE),false) THEN RAISE EXCEPTION 'Gelato dispatch disabled'; END IF;
  PERFORM public.lock_gelato_submission_root(p_submission_id);
  SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id = p_submission_id FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.record_gelato_print_quote(
  p_submission_id uuid, p_token uuid, p_quote_id text, p_shipment_method_uid text,
  p_policy_version integer, p_quoted_at timestamptz, p_item_reference_ids text[], p_request_fingerprint text
) RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE; expected_refs text[];
BEGIN
  PERFORM public.lock_gelato_submission_root(p_submission_id);
  SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id = p_submission_id FOR UPDATE;
  IF s.claim_token IS DISTINCT FROM p_token OR s.lease_expires_at <= clock_timestamp() OR s.request_state <> 'claimed' THEN
    RAISE EXCEPTION 'Stale print claim';
  END IF;
  IF coalesce(p_request_fingerprint,'') !~ '^[a-f0-9]{64}$' OR coalesce(length(trim(p_quote_id)),0) = 0 OR coalesce(length(trim(p_shipment_method_uid)),0) = 0
     OR p_policy_version IS NULL OR p_policy_version < 1 OR p_quoted_at IS NULL OR p_quoted_at > clock_timestamp()
     OR p_quoted_at < clock_timestamp()-interval '15 minutes' THEN
    RAISE EXCEPTION 'Invalid Gelato quote';
  END IF;
  SELECT array_agg(item_reference_id ORDER BY item_reference_id) INTO expected_refs
    FROM public.print_provider_submission_items WHERE submission_id = p_submission_id;
  IF expected_refs IS NULL OR p_item_reference_ids IS NULL
     OR expected_refs IS DISTINCT FROM (SELECT array_agg(value ORDER BY value) FROM unnest(p_item_reference_ids) value)
     OR cardinality(p_item_reference_ids) <> cardinality(expected_refs) THEN
    RAISE EXCEPTION 'Gelato quote membership mismatch';
  END IF;
  UPDATE public.print_provider_submissions SET quote_id = trim(p_quote_id), shipment_method_uid = trim(p_shipment_method_uid),
    shipment_policy_version = p_policy_version, quoted_at = p_quoted_at, quote_item_reference_ids = expected_refs,
    quote_request_fingerprint = p_request_fingerprint, quote_claim_token = p_token,
    updated_at = clock_timestamp() WHERE id = p_submission_id;
END $$;

CREATE OR REPLACE FUNCTION public.canonical_print_manifest_key(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT regexp_replace(regexp_replace(split_part(split_part(p_value,'?',1),'#',1),
    '^https://[^/]+/api/manifests/',''), '^https://[^/]+\.r2\.(dev|cloudflarestorage\.com)/','');
$$;

CREATE OR REPLACE FUNCTION public.guard_print_provider_assignment()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE field text;
BEGIN
  FOREACH field IN ARRAY ARRAY['print_provider','print_config_version','print_product_uid','print_inner_page_count','print_api_page_count','print_expected_pdf_page_count','print_book_id','print_format_id','print_manifest_key'] LOOP
    IF (to_jsonb(OLD)->>field) IS NOT NULL AND (to_jsonb(NEW)->field) IS DISTINCT FROM (to_jsonb(OLD)->field) THEN
      RAISE EXCEPTION 'Frozen print assignment mismatch';
    END IF;
  END LOOP;
  IF NEW.print_manifest_key IS NOT NULL AND (NEW.print_book_id IS NULL OR NEW.print_format_id IS NULL OR
      NEW.print_manifest_key <> NEW.print_book_id || '/orders/' || NEW."orderId" || '/manifests/1-manifest.json') THEN
    RAISE EXCEPTION 'Invalid frozen W0 manifest identity';
  END IF;
  IF NEW.print_manifest_key IS NOT NULL AND NEW.one_manifest_url IS NOT NULL AND
      public.canonical_print_manifest_key(NEW.one_manifest_url) IS DISTINCT FROM NEW.print_manifest_key THEN
    RAISE EXCEPTION 'Frozen W0 manifest pointer mismatch';
  END IF;
  IF NEW.print_book_id IS NOT NULL AND (to_jsonb(NEW)->>'book_id') IS NOT NULL AND
      (to_jsonb(NEW)->>'book_id') IS DISTINCT FROM NEW.print_book_id THEN
    RAISE EXCEPTION 'Frozen W0 book identity mismatch';
  END IF;
  IF NEW.print_format_id IS NOT NULL AND (to_jsonb(NEW)->>'format_id') IS NOT NULL AND
      (to_jsonb(NEW)->>'format_id') IS DISTINCT FROM NEW.print_format_id THEN
    RAISE EXCEPTION 'Frozen W0 format identity mismatch';
  END IF;
  IF NEW.print_book_id IS NOT NULL AND (to_jsonb(OLD)->>'book_id') IS NOT NULL AND
      (to_jsonb(OLD)->>'book_id') IS DISTINCT FROM NEW.print_book_id THEN
    RAISE EXCEPTION 'Frozen W0 book identity mismatch';
  END IF;
  IF OLD.print_provider IS NOT NULL AND OLD.one_manifest_url IS NOT NULL AND
      NEW.print_manifest_key IS NOT NULL AND public.canonical_print_manifest_key(OLD.one_manifest_url) IS DISTINCT FROM NEW.print_manifest_key THEN
    RAISE EXCEPTION 'Frozen W0 manifest identity mismatch';
  END IF;
  IF OLD.print_manifest_key IS NOT NULL AND NEW.one_manifest_url IS DISTINCT FROM OLD.one_manifest_url AND
      public.canonical_print_manifest_key(NEW.one_manifest_url) IS DISTINCT FROM OLD.print_manifest_key THEN
    RAISE EXCEPTION 'Frozen W0 manifest pointer mismatch';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_print_provider_assignment ON public.orders;
CREATE TRIGGER guard_print_provider_assignment BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_print_provider_assignment();
REVOKE ALL ON FUNCTION public.guard_print_provider_assignment() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_gelato_print_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE root_id text;
BEGIN
  IF TG_OP = 'UPDATE' AND coalesce(NEW.root_order_id,to_jsonb(NEW)->>'amazon_order_id',NEW."orderId") IS NOT DISTINCT FROM coalesce(OLD.root_order_id,to_jsonb(OLD)->>'amazon_order_id',OLD."orderId") AND NEW."orderId" IS NOT DISTINCT FROM OLD."orderId" THEN RETURN NEW; END IF;
  root_id := CASE WHEN TG_OP = 'DELETE' THEN coalesce(OLD.root_order_id,to_jsonb(OLD)->>'amazon_order_id',OLD."orderId") ELSE coalesce(NEW.root_order_id,to_jsonb(NEW)->>'amazon_order_id',NEW."orderId") END;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('gelato-root:' || root_id,0)) THEN RAISE EXCEPTION 'Gelato root busy; retry identity write'; END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.print_provider_submission_items i
        JOIN public.print_provider_submissions s ON s.id = i.submission_id
        WHERE i.child_order_id = OLD.id AND
          (s.request_state<>'failed' OR s.send_started_at IS NOT NULL) AND
           (s.request_state<>'submitted' OR i.provider_order_id IS NULL OR i.last_event_at IS NULL OR NOT EXISTS(SELECT 1 FROM public.print_provider_submission_orders verified WHERE verified.submission_id=s.id AND verified.provider_order_id=i.provider_order_id) OR EXISTS(SELECT 1 FROM public.print_provider_submission_items other WHERE other.submission_id=s.id AND (coalesce(other.status,'') NOT IN ('delivered','canceled') OR other.action_reason IS NOT NULL)) OR
            EXISTS(SELECT 1 FROM public.print_provider_submission_orders po WHERE po.submission_id=s.id AND (po.order_type<>'order' OR po.status NOT IN ('delivered','canceled') OR po.action_reason IS NOT NULL)) OR
            EXISTS(SELECT 1 FROM public.print_provider_submission_notifications n WHERE n.submission_id=s.id AND n.delivery_state NOT IN ('delivered','suppressed') AND
              (n.child_order_id=OLD.id OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(n.payload->'childOrderIds') affected WHERE affected=OLD.id::text))))) THEN
      RAISE EXCEPTION 'Cannot delete an unresolved Gelato print item';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.print_provider_submission_items WHERE child_order_id = OLD.id) THEN
    RAISE EXCEPTION 'Cannot change frozen Gelato print identity';
  END IF;
  IF EXISTS (SELECT 1 FROM public.print_provider_submissions WHERE root_order_id = root_id) THEN
    RAISE EXCEPTION 'Cannot change frozen Gelato print membership';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_gelato_print_membership ON public.orders;
CREATE TRIGGER guard_gelato_print_membership BEFORE INSERT OR DELETE OR UPDATE OF root_order_id,amazon_order_id,"orderId" ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_gelato_print_membership();
REVOKE ALL ON FUNCTION public.guard_gelato_print_membership() FROM PUBLIC, anon, authenticated;

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
DROP TRIGGER IF EXISTS guard_gelato_owned_order ON public.orders;
CREATE TRIGGER guard_gelato_owned_order BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_gelato_owned_order();
REVOKE ALL ON FUNCTION public.guard_gelato_owned_order() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.print_provider_dispatch_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_provider_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_provider_submission_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_provider_submission_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_provider_submission_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.print_provider_dispatch_gates, public.print_provider_submissions,
  public.print_provider_submission_orders, public.print_provider_submission_items,
  public.print_provider_submission_notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.print_provider_dispatch_gates, public.print_provider_submissions,
  public.print_provider_submission_orders, public.print_provider_submission_items,
  public.print_provider_submission_notifications TO service_role;
REVOKE ALL ON FUNCTION public.claim_gelato_print_submission(jsonb,text),
  public.begin_gelato_print_submission(uuid,uuid,text,text), public.fence_gelato_print_submission(uuid,uuid),
  public.authorize_gelato_print_send(uuid,uuid,text,text), public.renew_gelato_print_submission(uuid,uuid,text,integer),
  public.record_gelato_print_quote(uuid,uuid,text,text,integer,timestamptz,text[],text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_gelato_print_submission(jsonb,text),
  public.begin_gelato_print_submission(uuid,uuid,text,text), public.fence_gelato_print_submission(uuid,uuid),
  public.authorize_gelato_print_send(uuid,uuid,text,text), public.renew_gelato_print_submission(uuid,uuid,text,integer),
  public.record_gelato_print_quote(uuid,uuid,text,text,integer,timestamptz,text[],text) TO service_role;

CREATE OR REPLACE FUNCTION public.register_gelato_print_artifact(
  p_submission_id uuid,p_token uuid,p_order_db_id bigint,p_key text,p_fingerprint text,p_pdf_page_count integer
) RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE; o public.orders%ROWTYPE; i public.print_provider_submission_items%ROWTYPE;
BEGIN
  PERFORM public.lock_gelato_submission_root(p_submission_id);
  SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id=p_submission_id FOR UPDATE;
  IF s.claim_token IS DISTINCT FROM p_token OR s.request_state<>'claimed' OR s.lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Stale Gelato artifact claim'; END IF;
  SELECT * INTO STRICT o FROM public.orders WHERE id=p_order_db_id FOR UPDATE;
  SELECT * INTO STRICT i FROM public.print_provider_submission_items WHERE submission_id=s.id AND child_order_id=o.id;
  IF o.print_provider IS DISTINCT FROM 'gelato' OR o.print_submission_id IS DISTINCT FROM s.id OR o.print_claim_token IS DISTINCT FROM p_token OR
     p_fingerprint !~ '^[a-f0-9]{24}$' OR p_key IS DISTINCT FROM o.print_book_id||'/orders/'||o."orderId"||'/gelato/print/v'||o.print_config_version||'/'||p_fingerprint||'.pdf' OR
     p_pdf_page_count IS DISTINCT FROM o.print_expected_pdf_page_count THEN RAISE EXCEPTION 'Invalid Gelato artifact receipt'; END IF;
  IF s.quote_id IS NOT NULL AND (i.artifact_key IS DISTINCT FROM p_key OR i.artifact_claim_token IS DISTINCT FROM p_token) THEN RAISE EXCEPTION 'Quoted Gelato artifact is frozen'; END IF;
  UPDATE public.print_provider_submission_items SET artifact_key=p_key,artifact_fingerprint=p_fingerprint,artifact_claim_token=p_token,pdf_page_count=p_pdf_page_count
    WHERE submission_id=s.id AND child_order_id=o.id;
END $$;

CREATE OR REPLACE FUNCTION public.record_gelato_quote_snapshot(
  p_submission_id uuid,p_token uuid,p_quote_id text,p_shipment_method_uid text,p_policy_version integer,p_quoted_at timestamptz,
  p_item_reference_ids text[],p_request_fingerprint text,p_snapshot jsonb
) RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE; request jsonb; item jsonb; i public.print_provider_submission_items%ROWTYPE; o public.orders%ROWTYPE; address jsonb; recipient jsonb; canonical_name text;
BEGIN
  PERFORM public.record_gelato_print_quote(p_submission_id,p_token,p_quote_id,p_shipment_method_uid,p_policy_version,p_quoted_at,p_item_reference_ids,p_request_fingerprint);
  SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id=p_submission_id;
  request:=p_snapshot->'request';
  IF request->>'orderType' IS DISTINCT FROM 'draft' OR request->>'orderReferenceId' IS DISTINCT FROM s.order_reference_id OR
     request->>'currency' IS DISTINCT FROM 'USD' OR jsonb_typeof(request->'shippingAddress') IS DISTINCT FROM 'object' OR
     coalesce(request#>>'{shippingAddress,email}','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR
     coalesce(p_snapshot->>'shippingTier','')='' OR
     request->>'customerReferenceId' IS DISTINCT FROM s.root_order_id OR request->>'shipmentMethodUid' IS DISTINCT FROM p_shipment_method_uid OR
     jsonb_typeof(request->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(request->'items')<>cardinality(p_item_reference_ids) OR
     p_snapshot#>>'{config,provider}' IS DISTINCT FROM 'gelato' OR (p_snapshot#>>'{config,shipmentMethodPolicy,version}')::integer IS DISTINCT FROM p_policy_version THEN
    RAISE EXCEPTION 'Invalid Gelato quote request snapshot';
  END IF;
  IF (SELECT count(DISTINCT value->>'itemReferenceId') FROM jsonb_array_elements(request->'items'))<>cardinality(p_item_reference_ids) THEN RAISE EXCEPTION 'Duplicate Gelato snapshot membership'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(request->'items') LOOP
    SELECT * INTO STRICT i FROM public.print_provider_submission_items WHERE submission_id=s.id AND item_reference_id=item->>'itemReferenceId';
    SELECT * INTO STRICT o FROM public.orders WHERE id=i.child_order_id;
    address:=o.shipping_address;
    canonical_name:=regexp_replace(btrim(coalesce(address->>'name',address->>'recipient_name',to_jsonb(o)->>'customer_name','')),'\s+',' ','g');
    recipient:=jsonb_build_object('firstName',split_part(canonical_name,' ',1),'lastName',CASE WHEN position(' ' in canonical_name)>0 THEN substring(canonical_name from position(' ' in canonical_name)+1) ELSE '' END,
      'country',coalesce(address->>'country_code',address->>'country'),
      'addressLine1',coalesce(address->>'address_line_1',address->>'address_line1',address->>'address1',address->>'street1',address->>'street',address->>'address'),
      'addressLine2',coalesce(address->>'address_line_2',address->>'address_line2',address->>'address2',address->>'street2',''),
      'city',address->>'city','state',coalesce(address->>'state_code',address->>'state'),'postCode',coalesce(address->>'postcode',address->>'postal_code',address->>'zip'),
      'phone',coalesce(address->>'phone_number',address->>'phone',''),'email',coalesce(to_jsonb(o)->>'customer_email',address->>'email',request#>>'{shippingAddress,email}'));
    IF public.normalized_gelato_recipient(request->'shippingAddress') IS DISTINCT FROM public.normalized_gelato_recipient(recipient) OR
      (to_jsonb(o)->>'shipping_tier' IS NOT NULL AND lower(to_jsonb(o)->>'shipping_tier') IS DISTINCT FROM p_snapshot->>'shippingTier') OR
      p_snapshot#>>'{config,productUid}' IS DISTINCT FROM o.print_product_uid OR
      (p_snapshot#>>'{config,apiPageCount}')::integer IS DISTINCT FROM o.print_api_page_count OR
      (p_snapshot#>>'{config,expectedPdfPageCount}')::integer IS DISTINCT FROM o.print_expected_pdf_page_count THEN RAISE EXCEPTION 'Gelato quote recipient or configuration differs from saved order'; END IF;
    IF i.artifact_claim_token IS DISTINCT FROM p_token OR i.artifact_key IS NULL OR i.pdf_page_count IS DISTINCT FROM o.print_expected_pdf_page_count OR
       item->>'productUid' IS DISTINCT FROM o.print_product_uid OR (item->>'pageCount')::integer IS DISTINCT FROM o.print_api_page_count OR
       (item->>'quantity')::integer IS DISTINCT FROM coalesce((to_jsonb(o)->>'quantity')::integer,(to_jsonb(o)#>>'{product_info,quantity}')::integer,1) OR
       jsonb_array_length(item->'files')<>1 OR item#>>'{files,0,type}' IS DISTINCT FROM 'default' OR
       coalesce(item#>>'{files,0,url}','') !~ '^https://[^/?#]+/api/pdf/' OR
       right(item#>>'{files,0,url}',length('/api/pdf/'||i.artifact_key)) IS DISTINCT FROM '/api/pdf/'||i.artifact_key THEN RAISE EXCEPTION 'Gelato quote snapshot differs from registered print input'; END IF;
  END LOOP;
  UPDATE public.print_provider_submissions SET quote_snapshot=p_snapshot WHERE id=s.id;
END $$;

CREATE OR REPLACE FUNCTION public.record_gelato_accepted_root(p_submission_id uuid,p_token uuid,p_execution_id text,p_root_id text)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE;
BEGIN
  PERFORM public.lock_gelato_submission_root(p_submission_id);
  SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id=p_submission_id FOR UPDATE;
  IF s.claim_token IS DISTINCT FROM p_token OR s.owning_execution_id IS DISTINCT FROM p_execution_id OR s.request_state NOT IN ('submitting','outcome_unknown') OR s.send_started_at IS NULL OR
     p_root_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$' OR (s.accepted_root_order_id IS NOT NULL AND s.accepted_root_order_id<>p_root_id) THEN RAISE EXCEPTION 'Invalid Gelato acceptance evidence'; END IF;
  UPDATE public.print_provider_submissions SET accepted_root_order_id=p_root_id WHERE id=s.id;
END $$;

CREATE OR REPLACE FUNCTION public.normalized_gelato_recipient(p_address jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_object_agg(key,lower(regexp_replace(btrim(coalesce(p_address->>key,'')),'\s+',' ','g')))
 FROM unnest(ARRAY['country','firstName','lastName','addressLine1','addressLine2','city','postCode','state','email','phone','companyName']) key;
$$;
REVOKE ALL ON FUNCTION public.normalized_gelato_recipient(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.normalized_gelato_recipient(jsonb) TO service_role;

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
    INSERT INTO public.print_provider_submission_orders(submission_id,provider,provider_order_id,status,last_event_at,order_type,snapshot,snapshot_digest)
    VALUES(s.id,'gelato',external->>'id',external->>'fulfillmentStatus',(external->>'updatedAt')::timestamptz,external->>'orderType',external,md5(external::text))
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
CREATE OR REPLACE FUNCTION public.persist_gelato_draft_result(p_submission_id uuid,p_token uuid,p_execution_id text,p_orders jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_orders) e WHERE e->>'orderType' IS DISTINCT FROM 'draft') THEN RAISE EXCEPTION 'Automated Gelato create accepts drafts only'; END IF;
 RETURN public.persist_gelato_print_result(p_submission_id,p_token,p_execution_id,p_orders);
END $$;
REVOKE ALL ON FUNCTION public.register_gelato_print_artifact(uuid,uuid,bigint,text,text,integer),public.record_gelato_quote_snapshot(uuid,uuid,text,text,integer,timestamptz,text[],text,jsonb),
 public.record_gelato_accepted_root(uuid,uuid,text,text),public.persist_gelato_draft_result(uuid,uuid,text,jsonb),public.persist_gelato_print_result(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_gelato_print_artifact(uuid,uuid,bigint,text,text,integer),public.record_gelato_quote_snapshot(uuid,uuid,text,text,integer,timestamptz,text[],text,jsonb),
 public.record_gelato_accepted_root(uuid,uuid,text,text),public.persist_gelato_draft_result(uuid,uuid,text,jsonb),public.persist_gelato_print_result(uuid,uuid,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.begin_gelato_reconciliation(p_submission_id uuid,p_execution_id text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE; token uuid;
BEGIN
 PERFORM public.lock_gelato_submission_root(p_submission_id);
 SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id=p_submission_id FOR UPDATE;
 IF s.request_state IN ('submitted','failed') OR s.lease_expires_at>clock_timestamp() THEN RETURN jsonb_build_object('recover',false); END IF;
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
CREATE OR REPLACE FUNCTION public.finish_gelato_reconciliation_hold(p_submission_id uuid,p_token uuid,p_execution_id text,p_reason text)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE;
BEGIN
 PERFORM public.lock_gelato_submission_root(p_submission_id);
 SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id=p_submission_id FOR UPDATE;
 IF s.request_state<>'outcome_unknown' OR s.claim_token IS DISTINCT FROM p_token OR s.owning_execution_id IS DISTINCT FROM p_execution_id THEN RAISE EXCEPTION 'Stale Gelato reconciliation owner'; END IF;
 UPDATE public.print_provider_submissions SET action_reason=p_reason,lease_expires_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=s.id;
 UPDATE public.orders o SET gelato_action_reason=p_reason FROM public.print_provider_submission_items i WHERE i.submission_id=s.id AND o.id=i.child_order_id;
END $$;
CREATE SEQUENCE IF NOT EXISTS public.gelato_notification_package_reference_seq START 1000000000;
REVOKE ALL ON SEQUENCE public.gelato_notification_package_reference_seq FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SEQUENCE public.gelato_notification_package_reference_seq TO service_role;
ALTER TABLE public.print_provider_submission_notifications
 ADD COLUMN IF NOT EXISTS payload jsonb,
 ADD COLUMN IF NOT EXISTS payload_digest text,
 ADD COLUMN IF NOT EXISTS idempotency_key text,
 ADD COLUMN IF NOT EXISTS amazon_package_reference bigint,
 ADD COLUMN IF NOT EXISTS attempt_token uuid,
 ADD COLUMN IF NOT EXISTS attempt_started_at timestamptz,
 ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
 ADD COLUMN IF NOT EXISTS first_attempt_at timestamptz,
 ADD COLUMN IF NOT EXISTS external_message_id text,
 ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE public.print_provider_submission_notifications DROP CONSTRAINT IF EXISTS print_provider_submission_notifications_delivery_state_check;
ALTER TABLE public.print_provider_submission_notifications ADD CONSTRAINT print_provider_submission_notifications_delivery_state_check
 CHECK(delivery_state IN ('pending','delivering','delivered','failed','held','ambiguous','suppressed'));

DROP FUNCTION IF EXISTS public.apply_gelato_provider_snapshots(uuid,jsonb,jsonb);
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
   IF prior.snapshot_digest IS DISTINCT FROM expected->>'digest' OR prior.last_event_at IS DISTINCT FROM (expected->>'eventAt')::timestamptz THEN RAISE EXCEPTION 'Gelato refresh snapshot changed concurrently'; END IF;
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
REVOKE ALL ON FUNCTION public.begin_gelato_reconciliation(uuid,text),public.finish_gelato_reconciliation_hold(uuid,uuid,text,text),public.apply_gelato_provider_snapshots(uuid,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_gelato_reconciliation(uuid,text),public.finish_gelato_reconciliation_hold(uuid,uuid,text,text),public.apply_gelato_provider_snapshots(uuid,jsonb,jsonb,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.hold_gelato_provider_refresh(p_submission_id uuid,p_expected jsonb,p_reason text)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE;
BEGIN
 PERFORM public.lock_gelato_submission_root(p_submission_id);
 SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id=p_submission_id FOR UPDATE;
 IF s.request_state<>'submitted' OR EXISTS(SELECT 1 FROM public.print_provider_submission_orders po
   LEFT JOIN jsonb_array_elements(p_expected) e ON e->>'providerOrderId'=po.provider_order_id
   WHERE po.submission_id=s.id AND (po.snapshot_digest IS DISTINCT FROM e->>'digest' OR po.last_event_at IS DISTINCT FROM (e->>'eventAt')::timestamptz)) THEN RAISE EXCEPTION 'Stale Gelato refresh hold'; END IF;
 UPDATE public.print_provider_submission_orders SET action_reason=p_reason WHERE submission_id=s.id;
 UPDATE public.print_provider_submission_items SET action_reason=p_reason WHERE submission_id=s.id;
 UPDATE public.orders o SET gelato_action_reason=p_reason FROM public.print_provider_submission_items i WHERE i.submission_id=s.id AND o.id=i.child_order_id;
 UPDATE public.print_provider_submissions SET action_reason=p_reason,updated_at=clock_timestamp() WHERE id=s.id;
END $$;
REVOKE ALL ON FUNCTION public.hold_gelato_provider_refresh(uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hold_gelato_provider_refresh(uuid,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.gelato_notification_eligible(p_notification_id uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE n public.print_provider_submission_notifications%ROWTYPE; child text; i public.print_provider_submission_items%ROWTYPE; o public.orders%ROWTYPE; po public.print_provider_submission_orders%ROWTYPE; target jsonb;
BEGIN
 SELECT * INTO STRICT n FROM public.print_provider_submission_notifications WHERE id=p_notification_id;
 IF n.payload IS NULL OR n.idempotency_key IS NULL OR (SELECT request_state FROM public.print_provider_submissions WHERE id=n.submission_id)<>'submitted' THEN RETURN false; END IF;
 FOR child IN SELECT value FROM jsonb_array_elements_text(n.payload->'childOrderIds') LOOP
   SELECT * INTO i FROM public.print_provider_submission_items WHERE submission_id=n.submission_id AND child_order_id=child::bigint;
   SELECT * INTO o FROM public.orders WHERE id=child::bigint AND print_submission_id=n.submission_id AND print_provider='gelato';
   IF i.child_order_id IS NULL OR o.id IS NULL OR i.action_reason IS NOT NULL OR o.gelato_order_type<>'order' THEN RETURN false; END IF;
   SELECT * INTO po FROM public.print_provider_submission_orders WHERE submission_id=n.submission_id AND provider_order_id=i.provider_order_id;
   IF po.action_reason IS NOT NULL OR po.order_type<>'order' OR po.last_checked_at<clock_timestamp()-interval '10 minutes' OR po.last_checked_at IS NULL THEN RETURN false; END IF;
   SELECT value INTO target FROM public.print_provider_submissions s CROSS JOIN LATERAL jsonb_array_elements(s.request_snapshot->'notificationTargets') WHERE s.id=n.submission_id AND (value->>'childOrderId')::bigint=child::bigint;
   IF target IS NULL THEN RETURN false; END IF;
   IF n.payload->>'kind'='d2c-printing' THEN
     IF i.status NOT IN ('in_production','printed') OR target->>'customerEmail' IS DISTINCT FROM n.payload#>>'{email,to}' OR to_jsonb(o)->>'customer_email' IS DISTINCT FROM n.payload#>>'{email,to}' THEN RETURN false; END IF;
   ELSE
     IF (i.status NOT IN ('shipped','in_transit') AND NOT(n.payload->>'kind'='amazon-shipped' AND i.status='delivered')) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(i.tracking) parcel WHERE parcel->>'packageId'=n.payload->>'packageId' AND parcel->>'providerOrderId'=n.payload->>'providerOrderId' AND parcel->>'trackingNumber'=n.payload->>'trackingNumber' AND parcel->>'carrier'=n.payload->>'carrier' AND
       parcel->'providerItemIds' @> jsonb_build_array(i.provider_item_id) AND
       (n.payload->>'kind'<>'amazon-shipped' OR (jsonb_array_length(parcel->'providerItemIds')=jsonb_array_length(n.payload->'childOrderIds') AND
       NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(parcel->'providerItemIds') expected_item WHERE NOT EXISTS(SELECT 1 FROM public.print_provider_submission_items member
         WHERE member.submission_id=n.submission_id AND member.provider_item_id=expected_item AND member.child_order_id IN(SELECT value::bigint FROM jsonb_array_elements_text(n.payload->'childOrderIds'))))))) THEN RETURN false; END IF;
     IF n.payload->>'kind'='d2c-shipped' THEN
       IF target->>'customerEmail' IS DISTINCT FROM n.payload#>>'{email,to}' OR to_jsonb(o)->>'customer_email' IS DISTINCT FROM n.payload#>>'{email,to}' THEN RETURN false; END IF;
     ELSIF n.payload->>'kind'='amazon-shipped' THEN
       IF target->>'amazonOrderId' IS DISTINCT FROM n.payload->>'amazonOrderId' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(n.payload->'orderItems') item
         JOIN jsonb_array_elements((SELECT request_snapshot#>'{request,items}' FROM public.print_provider_submissions WHERE id=n.submission_id)) requested ON requested->>'itemReferenceId'=i.item_reference_id
         WHERE item->>'orderItemId'=target->>'amazonOrderItemId' AND (item->>'quantity')::integer=(requested->>'quantity')::integer) THEN RETURN false; END IF;
     ELSE RETURN false;
     END IF;
   END IF;
 END LOOP;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.claim_gelato_notification(p_notification_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE n public.print_provider_submission_notifications%ROWTYPE; token uuid; submission uuid;
BEGIN
 SELECT submission_id INTO STRICT submission FROM public.print_provider_submission_notifications WHERE id=p_notification_id;
 PERFORM public.lock_gelato_submission_root(submission);
 SELECT * INTO STRICT n FROM public.print_provider_submission_notifications WHERE id=p_notification_id FOR UPDATE;
 IF n.delivery_state NOT IN ('pending','failed','ambiguous','delivering') OR (n.delivery_state='delivering' AND n.lease_expires_at>clock_timestamp()) OR
   (n.last_attempt_at IS NOT NULL AND n.last_attempt_at>clock_timestamp()-interval '2 minutes') THEN RETURN jsonb_build_object('claimed',false); END IF;
 IF n.payload IS NULL OR n.idempotency_key IS NULL THEN
   UPDATE public.print_provider_submission_notifications SET delivery_state='held',attempt_result='notification_payload_requires_review',updated_at=clock_timestamp() WHERE id=n.id;
   RETURN jsonb_build_object('claimed',false);
 END IF;
 IF n.first_attempt_at IS NOT NULL AND n.first_attempt_at<=clock_timestamp()-interval '23 hours' THEN
   UPDATE public.print_provider_submission_notifications SET delivery_state='held',attempt_result='idempotency_window_requires_review',updated_at=clock_timestamp() WHERE id=n.id;
   RETURN jsonb_build_object('claimed',false);
 END IF;
 token:=gen_random_uuid();
 UPDATE public.print_provider_submission_notifications SET delivery_state='delivering',attempt_token=token,attempt_started_at=NULL,lease_expires_at=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp() WHERE id=n.id;
 RETURN jsonb_build_object('claimed',true,'attemptToken',token,'payload',n.payload,'idempotencyKey',n.idempotency_key);
END $$;
CREATE OR REPLACE FUNCTION public.authorize_gelato_notification(p_notification_id uuid,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE n public.print_provider_submission_notifications%ROWTYPE; submission uuid; obsolete boolean;
BEGIN
 SELECT submission_id INTO STRICT submission FROM public.print_provider_submission_notifications WHERE id=p_notification_id;
 PERFORM public.lock_gelato_submission_root(submission);
 SELECT * INTO STRICT n FROM public.print_provider_submission_notifications WHERE id=p_notification_id FOR UPDATE;
 IF n.delivery_state<>'delivering' OR n.attempt_token IS DISTINCT FROM p_token OR n.lease_expires_at<=clock_timestamp() OR n.attempt_started_at IS NOT NULL THEN RAISE EXCEPTION 'Stale Gelato notification sender'; END IF;
 IF n.first_attempt_at IS NOT NULL AND n.first_attempt_at<=clock_timestamp()-interval '23 hours' THEN
   UPDATE public.print_provider_submission_notifications SET delivery_state='held',attempt_result='idempotency_window_requires_review',lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=n.id;
   RETURN jsonb_build_object('send',false);
 END IF;
 IF NOT public.gelato_notification_eligible(n.id) THEN
   SELECT bool_and(CASE WHEN n.payload->>'kind'='d2c-printing' THEN i.status IN ('shipped','in_transit','delivered','canceled','returned','failed') WHEN n.payload->>'kind'='amazon-shipped' THEN i.status IN ('canceled','returned','failed') ELSE i.status IN ('delivered','canceled','returned','failed') END)
   INTO obsolete FROM public.print_provider_submission_items i WHERE i.submission_id=n.submission_id AND i.child_order_id IN(SELECT value::bigint FROM jsonb_array_elements_text(n.payload->'childOrderIds'));
   UPDATE public.print_provider_submission_notifications SET delivery_state=CASE WHEN obsolete AND n.first_attempt_at IS NULL THEN 'suppressed' ELSE 'held' END,attempt_result='notification_eligibility_changed',lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=n.id;
   RETURN jsonb_build_object('send',false);
 END IF;
 UPDATE public.print_provider_submission_notifications SET attempt_started_at=clock_timestamp(),first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),last_attempt_at=clock_timestamp(),attempt_count=attempt_count+1 WHERE id=n.id;
 RETURN jsonb_build_object('send',true);
END $$;
CREATE OR REPLACE FUNCTION public.finish_gelato_notification(p_notification_id uuid,p_token uuid,p_confirmed boolean,p_external_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE n public.print_provider_submission_notifications%ROWTYPE; submission uuid;
BEGIN
 SELECT submission_id INTO STRICT submission FROM public.print_provider_submission_notifications WHERE id=p_notification_id;
 PERFORM public.lock_gelato_submission_root(submission);
 SELECT * INTO STRICT n FROM public.print_provider_submission_notifications WHERE id=p_notification_id FOR UPDATE;
 IF n.delivery_state<>'delivering' OR n.attempt_token IS DISTINCT FROM p_token OR n.attempt_started_at IS NULL THEN RAISE EXCEPTION 'Stale Gelato notification result'; END IF;
 UPDATE public.print_provider_submission_notifications SET delivery_state=CASE WHEN p_confirmed THEN 'delivered' ELSE 'ambiguous' END,external_message_id=p_external_id,
   attempt_result=CASE WHEN p_confirmed THEN 'confirmed' ELSE 'provider_send_unconfirmed' END,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=n.id;
END $$;
CREATE OR REPLACE FUNCTION public.release_gelato_notification(p_notification_id uuid,p_token uuid,p_hold boolean)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE n public.print_provider_submission_notifications%ROWTYPE; submission uuid;
BEGIN
 SELECT submission_id INTO STRICT submission FROM public.print_provider_submission_notifications WHERE id=p_notification_id;
 PERFORM public.lock_gelato_submission_root(submission);
 SELECT * INTO STRICT n FROM public.print_provider_submission_notifications WHERE id=p_notification_id FOR UPDATE;
 IF n.delivery_state<>'delivering' OR n.attempt_token IS DISTINCT FROM p_token OR n.attempt_started_at IS NOT NULL THEN RAISE EXCEPTION 'Gelato notification send cannot be released'; END IF;
 UPDATE public.print_provider_submission_notifications SET delivery_state=CASE WHEN p_hold THEN 'held' WHEN first_attempt_at IS NULL THEN 'pending' ELSE 'ambiguous' END,
 lease_expires_at=NULL,attempt_result=CASE WHEN p_hold THEN 'notification_payload_requires_review' ELSE 'sender_unavailable' END,updated_at=clock_timestamp() WHERE id=n.id;
END $$;
REVOKE ALL ON FUNCTION public.release_gelato_notification(uuid,uuid,boolean),public.gelato_notification_eligible(uuid),public.claim_gelato_notification(uuid),public.authorize_gelato_notification(uuid,uuid),public.finish_gelato_notification(uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_gelato_notification(uuid,uuid,boolean),public.gelato_notification_eligible(uuid),public.claim_gelato_notification(uuid),public.authorize_gelato_notification(uuid,uuid),public.finish_gelato_notification(uuid,uuid,boolean,text) TO service_role;

CREATE OR REPLACE FUNCTION public.list_gelato_poll_candidates(p_limit integer DEFAULT 3)
RETURNS TABLE(id uuid,request_state text) LANGUAGE sql SET search_path=public,pg_temp AS $$
 SELECT s.id,s.request_state FROM public.print_provider_submissions s
 WHERE (s.request_state IN ('claimed','submitting','outcome_unknown') AND s.lease_expires_at<=clock_timestamp()) OR
   (s.request_state='submitted' AND (EXISTS(SELECT 1 FROM public.print_provider_submission_items i JOIN public.orders o ON o.id=i.child_order_id
     WHERE i.submission_id=s.id AND (i.status IS NULL OR i.status NOT IN ('delivered','canceled') OR i.action_reason IS NOT NULL)) OR
   EXISTS(SELECT 1 FROM public.print_provider_submission_notifications n WHERE n.submission_id=s.id AND n.delivery_state NOT IN ('delivered','suppressed'))))
 ORDER BY s.updated_at,s.id LIMIT least(greatest(p_limit,1),3);
$$;
REVOKE ALL ON FUNCTION public.list_gelato_poll_candidates(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_gelato_poll_candidates(integer) TO service_role;

COMMIT;
