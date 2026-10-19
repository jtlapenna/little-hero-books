-- Empty, OFF and unreachable by public callers. No legacy rows or controls are changed.
BEGIN;
CREATE TABLE IF NOT EXISTS public.gelato_ordinary_release_gate (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false
);
INSERT INTO public.gelato_ordinary_release_gate(id,enabled) VALUES(true,false) ON CONFLICT DO NOTHING;
ALTER TABLE public.gelato_ordinary_release_gate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gelato_ordinary_release_gate FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,UPDATE(enabled) ON public.gelato_ordinary_release_gate TO service_role;

CREATE TABLE IF NOT EXISTS public.gelato_ordinary_release_roots (
 provider_order_id text PRIMARY KEY CHECK(provider_order_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$'),
 submission_id uuid NOT NULL UNIQUE REFERENCES public.print_provider_submissions(id),
 account_sha256 text NOT NULL CHECK(account_sha256 ~ '^[a-f0-9]{64}$'),
 owner_permit_id uuid, consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.gelato_ordinary_release_permits (
 id uuid PRIMARY KEY, submission_id uuid NOT NULL REFERENCES public.print_provider_submissions(id),
 provider_order_id text NOT NULL REFERENCES public.gelato_ordinary_release_roots(provider_order_id),
 account_sha256 text NOT NULL CHECK(account_sha256 ~ '^[a-f0-9]{64}$'),
 permit jsonb NOT NULL, packet jsonb NOT NULL, binding jsonb NOT NULL,
 approval_actor text NOT NULL CHECK(length(approval_actor) BETWEEN 1 AND 200),
 approval_evidence_sha256 text NOT NULL CHECK(approval_evidence_sha256 ~ '^[a-f0-9]{64}$'),
 approved_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'ready' CHECK(state IN ('ready','preparing','sending','observing','preflight_failed','outcome_unknown','converted')),
 owner_token uuid, lease_expires_at timestamptz, send_started_at timestamptz, closed_at timestamptz,
 observation jsonb,
 CHECK(expires_at>approved_at AND expires_at<=approved_at+interval '15 minutes'),
 CHECK((closed_at IS NOT NULL)=(state IN('converted','preflight_failed'))),
 CHECK(state<>'converted' OR observation IS NOT NULL),
 CHECK(state<>'sending' OR send_started_at IS NOT NULL),
 CHECK(state NOT IN('preparing','sending','observing') OR(owner_token IS NOT NULL AND lease_expires_at IS NOT NULL AND isfinite(lease_expires_at)))
);
ALTER TABLE public.gelato_ordinary_release_roots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gelato_ordinary_release_permits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gelato_ordinary_release_roots,public.gelato_ordinary_release_permits FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.gelato_ordinary_release_roots,public.gelato_ordinary_release_permits TO service_role;
GRANT UPDATE(owner_permit_id,consumed_at) ON public.gelato_ordinary_release_roots TO service_role;
GRANT UPDATE(state,owner_token,lease_expires_at,send_started_at,closed_at,observation) ON public.gelato_ordinary_release_permits TO service_role;

-- Protocol v2: keys ordered by codepoint, UTF-8 strings, finite JSON numbers.
-- Approval packets contain integer JSON counts and string-valued money.
CREATE OR REPLACE FUNCTION public.gelato_ordinary_canonical(v jsonb) RETURNS text
 LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result text;
BEGIN
 CASE jsonb_typeof(v)
 WHEN 'object' THEN SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||public.gelato_ordinary_canonical(value),',' ORDER BY key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(v);
 WHEN 'array' THEN SELECT '['||coalesce(string_agg(public.gelato_ordinary_canonical(value),',' ORDER BY ord),'')||']' INTO result FROM jsonb_array_elements(v) WITH ORDINALITY x(value,ord);
 WHEN 'number' THEN result:=trim_scale((v#>>'{}')::numeric)::text;
 ELSE result:=v::text;
 END CASE;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.gelato_ordinary_digest(v jsonb) RETURNS text
 LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT encode(sha256(convert_to(public.gelato_ordinary_canonical(v),'UTF8')),'hex')
$$;

-- All callers lock canonical submission root FIRST, then rows in deterministic order.
CREATE OR REPLACE FUNCTION public.gelato_ordinary_current_binding(p_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE; members jsonb; roots jsonb; orders jsonb; actual_ids bigint[]; stored_ids bigint[];
BEGIN
 PERFORM public.lock_gelato_submission_root(p_id);
 SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id=p_id FOR UPDATE;
 PERFORM 1 FROM public.print_provider_submission_items WHERE submission_id=p_id ORDER BY child_order_id FOR UPDATE;
 PERFORM 1 FROM public.orders o WHERE o.id IN(SELECT child_order_id FROM public.print_provider_submission_items WHERE submission_id=p_id) ORDER BY o.id FOR UPDATE;
 PERFORM 1 FROM public.print_provider_submission_orders WHERE submission_id=p_id ORDER BY provider_order_id FOR UPDATE;
 SELECT array_agg(o.id ORDER BY o.id) INTO actual_ids FROM public.orders o WHERE coalesce(o.root_order_id,o.amazon_order_id,o."orderId")=s.root_order_id;
 SELECT array_agg(child_order_id ORDER BY child_order_id) INTO stored_ids FROM public.print_provider_submission_items WHERE submission_id=p_id;
 IF actual_ids IS DISTINCT FROM stored_ids OR cardinality(stored_ids) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Ordinary release group changed'; END IF;
 SELECT jsonb_agg(jsonb_build_object('childOrderId',i.child_order_id,'childOrderKey',i.child_order_key,'itemReferenceId',i.item_reference_id,
  'providerItemId',i.provider_item_id,'providerOrderId',i.provider_order_id,'key',i.artifact_key,'fingerprint',i.artifact_fingerprint,
  'artifactClaim',i.artifact_claim_token,'pdfPages',i.pdf_page_count) ORDER BY i.child_order_id) INTO members FROM public.print_provider_submission_items i WHERE i.submission_id=p_id;
 SELECT jsonb_agg(jsonb_build_object('id',provider_order_id,'status',status,'orderType',order_type,'reason',action_reason) ORDER BY provider_order_id) INTO roots FROM public.print_provider_submission_orders WHERE submission_id=p_id;
 SELECT jsonb_agg(jsonb_build_object('id',o.id,'orderId',o."orderId",'root',coalesce(o.root_order_id,o.amazon_order_id,o."orderId"),
  'provider',o.print_provider,'submission',o.print_submission_id,'claim',o.print_claim_token,
  'book',o.print_book_id,'format',o.print_format_id,'version',o.print_config_version,'product',o.print_product_uid,
  'innerPages',o.print_inner_page_count,'apiPages',o.print_api_page_count,'pdfPages',o.print_expected_pdf_page_count,
  'quantity',coalesce(nullif(to_jsonb(o)->'quantity','null'::jsonb),nullif((CASE WHEN jsonb_typeof(o.product_info)='string' THEN(o.product_info#>>'{}')::jsonb ELSE o.product_info END)->'quantity','null'::jsonb),'1'::jsonb),'tier',to_jsonb(o)->'shipping_tier',
  'address',o.shipping_address,'customerName',to_jsonb(o)->'customer_name','email',to_jsonb(o)->'customer_email','humanApproved',to_jsonb(o)->'human_approved',
  'approvalRequired',to_jsonb(o)->'customer_approval_required','approval',to_jsonb(o)->'customer_approval_status',
  'review',to_jsonb(o)->'review_stages','workflow',o.current_workflow,'started',o.started_at,'execution',o.execution_status) ORDER BY o.id)
 INTO orders FROM public.orders o WHERE o.id=ANY(stored_ids);
 RETURN jsonb_build_object('submission',jsonb_build_object('id',s.id,'provider',s.provider,'root',s.root_order_id,'reference',s.order_reference_id,'claim',s.claim_token,
  'state',s.request_state,'quoteFingerprint',s.quote_request_fingerprint,'acceptedRoot',s.accepted_root_order_id,'snapshot',s.request_snapshot),'members',members,'roots',roots,'orders',orders);
END $$;

CREATE OR REPLACE FUNCTION public.assert_gelato_ordinary_packet(p_permit jsonb,p_packet jsonb,p_binding jsonb) RETURNS void
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE a jsonb; m jsonb; o jsonb; item jsonb; req jsonb:=p_binding#>'{submission,snapshot,request}'; cfg jsonb:=p_binding#>'{submission,snapshot,config}'; pay jsonb:=p_packet->'payable'; amount numeric; id_text text; expected text[];
BEGIN
 IF jsonb_typeof(p_permit)<>'object' OR jsonb_typeof(p_packet)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_permit))<>11 OR
  p_packet->>'version' IS DISTINCT FROM '2' OR p_permit->>'accountSha256' !~ '^[a-f0-9]{64}$' OR p_permit->>'packetSha256' !~ '^[a-f0-9]{64}$' OR
  p_permit->>'requestSnapshotSha256' IS DISTINCT FROM public.gelato_ordinary_digest(p_binding#>'{submission,snapshot}') OR
  p_permit->>'packetSha256' IS DISTINCT FROM public.gelato_ordinary_digest(p_packet) OR
  p_packet->>'destinationSha256' IS DISTINCT FROM public.gelato_ordinary_digest(p_binding#>'{submission,snapshot,request,shippingAddress}') OR
  p_packet->>'originalRequestSha256' IS DISTINCT FROM p_permit->>'requestSnapshotSha256' OR
  p_packet->>'permitId' IS DISTINCT FROM p_permit->>'id' OR p_packet->>'submissionId' IS DISTINCT FROM p_permit->>'submissionId' OR
  p_packet->>'providerOrderId' IS DISTINCT FROM p_permit->>'providerOrderId' OR p_packet->>'accountSha256' IS DISTINCT FROM p_permit->>'accountSha256' OR
  p_packet->>'approvedAt' IS DISTINCT FROM p_permit->>'approvedAt' OR p_packet->>'expiresAt' IS DISTINCT FROM p_permit->>'expiresAt' OR
  p_permit->>'currency' IS DISTINCT FROM 'USD' OR p_packet->>'currency' IS DISTINCT FROM 'USD' OR pay->>'currency' IS DISTINCT FROM 'USD' OR
  p_packet->>'maximumTotalCents' IS DISTINCT FROM p_permit->>'maximumTotalCents' OR coalesce(p_permit->>'maximumTotalCents','') !~ '^(0|[1-9][0-9]{0,11})$' OR
  p_binding#>>'{submission,id}' IS DISTINCT FROM p_permit->>'submissionId' OR p_binding#>>'{submission,provider}' IS DISTINCT FROM 'gelato' OR
  p_binding#>>'{submission,state}' IS DISTINCT FROM 'submitted' OR p_binding#>>'{submission,acceptedRoot}' IS DISTINCT FROM p_permit->>'providerOrderId' OR
  req->>'orderType' IS DISTINCT FROM 'draft' OR req->>'orderReferenceId' IS DISTINCT FROM p_binding#>>'{submission,reference}' OR req->>'customerReferenceId' IS DISTINCT FROM p_binding#>>'{submission,root}' OR
  p_packet->>'shipmentMethodUid' IS DISTINCT FROM req->>'shipmentMethodUid' OR p_packet->>'shippingTier' IS DISTINCT FROM p_binding#>>'{submission,snapshot,shippingTier}' OR
  jsonb_array_length(p_binding->'roots')<>1 OR p_binding#>>'{roots,0,id}' IS DISTINCT FROM p_permit->>'providerOrderId' OR
  p_binding#>>'{roots,0,orderType}' IS DISTINCT FROM 'draft' OR p_binding#>>'{roots,0,status}' IS DISTINCT FROM 'draft' OR
  coalesce(p_binding#>>'{roots,0,reason}','awaiting_draft_review')<>'awaiting_draft_review' THEN RAISE EXCEPTION 'Invalid ordinary approved packet'; END IF;
 IF jsonb_typeof(p_permit->'artifacts') IS DISTINCT FROM 'array' OR jsonb_array_length(p_permit->'artifacts') NOT BETWEEN 1 AND 100 OR
  jsonb_array_length(p_permit->'artifacts')<>jsonb_array_length(p_binding->'members') OR jsonb_array_length(req->'items')<>jsonb_array_length(p_binding->'members') THEN RAISE EXCEPTION 'Ordinary artifact count differs'; END IF;
 FOREACH id_text IN ARRAY ARRAY['childOrderId','itemReferenceId','providerItemId','key'] LOOP
  IF(SELECT count(DISTINCT v->>id_text) FROM jsonb_array_elements(p_permit->'artifacts')v)<>jsonb_array_length(p_permit->'artifacts') THEN RAISE EXCEPTION 'Ordinary artifact identities not unique';END IF;
 END LOOP;
 FOR a IN SELECT value FROM jsonb_array_elements(p_permit->'artifacts') LOOP
  SELECT value INTO STRICT m FROM jsonb_array_elements(p_binding->'members') WHERE value->>'childOrderId'=a->>'childOrderId';
  SELECT value INTO STRICT o FROM jsonb_array_elements(p_binding->'orders') WHERE value->>'id'=a->>'childOrderId';
  SELECT value INTO STRICT item FROM jsonb_array_elements(req->'items') WHERE value->>'itemReferenceId'=a->>'itemReferenceId';
  IF (SELECT count(*) FROM jsonb_object_keys(a))<>8 OR coalesce(a->>'sha256','') !~ '^[a-f0-9]{64}$' OR
   m->>'key' IS DISTINCT FROM a->>'key' OR m->>'itemReferenceId' IS DISTINCT FROM a->>'itemReferenceId' OR m->>'providerItemId' IS DISTINCT FROM a->>'providerItemId' OR
   m->>'providerOrderId' IS DISTINCT FROM p_permit->>'providerOrderId' OR m->>'artifactClaim' IS DISTINCT FROM p_binding#>>'{submission,claim}' OR
   coalesce(m->>'fingerprint','') !~ '^[a-f0-9]{24}$' OR a->>'key' IS DISTINCT FROM (a->>'bookId')||'/orders/'||(m->>'childOrderKey')||'/gelato/print/v'||(a->>'configVersion')||'/'||(m->>'fingerprint')||'.pdf' OR
   o->>'orderId' IS DISTINCT FROM m->>'childOrderKey' OR o->>'provider' IS DISTINCT FROM 'gelato' OR o->>'submission' IS DISTINCT FROM p_permit->>'submissionId' OR
   o->>'claim' IS DISTINCT FROM p_binding#>>'{submission,claim}' OR o->>'root' IS DISTINCT FROM p_binding#>>'{submission,root}' OR
   o->>'book' IS DISTINCT FROM a->>'bookId' OR o->>'format' IS DISTINCT FROM a->>'formatId' OR o->>'version' IS DISTINCT FROM a->>'configVersion' OR
   o->>'product' IS DISTINCT FROM cfg->>'productUid' OR item->>'productUid' IS DISTINCT FROM cfg->>'productUid' OR
   o->>'innerPages' IS DISTINCT FROM cfg->>'innerPageCount' OR o->>'apiPages' IS DISTINCT FROM cfg->>'apiPageCount' OR item->>'pageCount' IS DISTINCT FROM cfg->>'apiPageCount' OR
   o->>'pdfPages' IS DISTINCT FROM cfg->>'expectedPdfPageCount' OR m->>'pdfPages' IS DISTINCT FROM cfg->>'expectedPdfPageCount' OR
   jsonb_typeof(o->'quantity') IS DISTINCT FROM 'number' OR o->>'quantity' IS DISTINCT FROM item->>'quantity' OR
   o->>'tier' IS DISTINCT FROM p_packet->>'shippingTier' OR o->>'humanApproved' IS DISTINCT FROM 'true' OR o->>'approval'='revision_requested' OR
   (o->>'approvalRequired'='true' AND o->>'approval' IS DISTINCT FROM 'approved') OR o#>>'{review,postPdf,status}' IS DISTINCT FROM 'approved' OR
   o->>'workflow' IS NOT NULL OR o->>'started' IS NOT NULL OR o->>'execution'='processing' THEN RAISE EXCEPTION 'Ordinary current order authority changed'; END IF;
 END LOOP;
 IF p_packet->'artifacts' IS DISTINCT FROM(SELECT jsonb_agg(value||jsonb_build_object('pdfPageCount',cfg->'expectedPdfPageCount') ORDER BY ord) FROM jsonb_array_elements(p_permit->'artifacts') WITH ORDINALITY x(value,ord)) THEN RAISE EXCEPTION 'Ordinary approved artifact packet differs'; END IF;
 IF pay->>'source' IS DISTINCT FROM 'verified_provider_payable' OR pay->>'accountSha256' IS DISTINCT FROM p_permit->>'accountSha256' OR
  coalesce(pay->>'responseSha256','') !~ '^[a-f0-9]{64}$' OR coalesce(pay->>'quoteResponseSha256','') !~ '^[a-f0-9]{64}$' OR coalesce(pay->>'requestFingerprint','') !~ '^[a-f0-9]{64}$' OR coalesce(pay->>'quoteId','')='' OR
  coalesce(pay->>'quotedAt','')='' OR pay->>'requestFingerprint' IS DISTINCT FROM p_binding#>>'{submission,quoteFingerprint}' OR
  (pay->>'quotedAt')::timestamptz>clock_timestamp() OR (pay->>'quotedAt')::timestamptz<clock_timestamp()-interval '15 minutes' THEN RAISE EXCEPTION 'Ordinary payable evidence missing or stale'; END IF;
 FOREACH id_text IN ARRAY ARRAY['productsCents','shippingCents','taxesCents','feesCents','discountCents','totalCents'] LOOP
  IF coalesce(pay->>id_text,'') !~ '^(0|[1-9][0-9]{0,11})$' THEN RAISE EXCEPTION 'Ordinary payable amount invalid'; END IF;
 END LOOP;
 amount:=(pay->>'productsCents')::numeric+(pay->>'shippingCents')::numeric+(pay->>'taxesCents')::numeric+(pay->>'feesCents')::numeric-(pay->>'discountCents')::numeric;
 IF amount<0 OR amount<>(pay->>'totalCents')::numeric OR amount>(p_permit->>'maximumTotalCents')::numeric THEN RAISE EXCEPTION 'Ordinary approved spend exceeds maximum'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_gelato_ordinary_root() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Ordinary root evidence cannot be deleted'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.owner_permit_id IS NOT NULL OR NEW.consumed_at IS NOT NULL THEN RAISE EXCEPTION 'New ordinary root must be unused'; END IF;RETURN NEW;
 END IF;
 IF (NEW.provider_order_id,NEW.submission_id,NEW.account_sha256) IS DISTINCT FROM (OLD.provider_order_id,OLD.submission_id,OLD.account_sha256) OR
  (OLD.consumed_at IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'Consumed ordinary root is immutable'; END IF;
 IF OLD.owner_permit_id IS NOT NULL AND NEW.owner_permit_id IS DISTINCT FROM OLD.owner_permit_id AND EXISTS(SELECT 1 FROM public.gelato_ordinary_release_permits WHERE id=OLD.owner_permit_id AND state<>'preflight_failed') THEN RAISE EXCEPTION 'Ordinary root still owned'; END IF;
 IF NEW.consumed_at IS NOT NULL AND (NEW.owner_permit_id IS NULL OR NEW.consumed_at>clock_timestamp()) THEN RAISE EXCEPTION 'Invalid ordinary root consumption'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_gelato_ordinary_root ON public.gelato_ordinary_release_roots;
CREATE TRIGGER guard_gelato_ordinary_root BEFORE INSERT OR UPDATE OR DELETE ON public.gelato_ordinary_release_roots FOR EACH ROW EXECUTE FUNCTION public.guard_gelato_ordinary_root();

CREATE OR REPLACE FUNCTION public.assert_gelato_ordinary_observation(p_permit jsonb,p_binding jsonb,p_orders jsonb) RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE root jsonb; req jsonb; item jsonb; expected jsonb; art jsonb;
BEGIN
 IF jsonb_typeof(p_orders) IS DISTINCT FROM 'array' OR jsonb_array_length(p_orders)<>1 THEN RAISE EXCEPTION 'Ordinary converted observation incomplete';END IF;
  root:=p_orders->0;req:=p_binding#>'{submission,snapshot,request}';
  IF root->>'id' IS DISTINCT FROM p_permit->>'providerOrderId' OR root->>'orderType' IS DISTINCT FROM 'order' OR root->>'orderReferenceId' IS DISTINCT FROM req->>'orderReferenceId' OR root->>'customerReferenceId' IS DISTINCT FROM req->>'customerReferenceId' OR root->>'currency' IS DISTINCT FROM req->>'currency' OR
   root#>>'{shipment,shipmentMethodUid}' IS DISTINCT FROM req->>'shipmentMethodUid' OR coalesce(root->'connectedOrderIds','[]')<>'[]'::jsonb OR
   public.normalized_gelato_recipient(root->'shippingAddress') IS DISTINCT FROM public.normalized_gelato_recipient(req->'shippingAddress') OR jsonb_array_length(root->'items')<>jsonb_array_length(req->'items') THEN RAISE EXCEPTION 'Ordinary converted identity differs';END IF;
  IF(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(root->'items'))<>jsonb_array_length(req->'items') OR(SELECT count(DISTINCT value->>'itemReferenceId') FROM jsonb_array_elements(root->'items'))<>jsonb_array_length(req->'items') THEN RAISE EXCEPTION 'Ordinary converted items not unique';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(root->'items') LOOP
   SELECT value INTO STRICT expected FROM jsonb_array_elements(req->'items') WHERE value->>'itemReferenceId'=item->>'itemReferenceId';
   SELECT value INTO STRICT art FROM jsonb_array_elements(p_permit->'artifacts') WHERE value->>'itemReferenceId'=item->>'itemReferenceId';
   IF item->>'id' IS DISTINCT FROM art->>'providerItemId' OR item->>'productUid' IS DISTINCT FROM expected->>'productUid' OR item->>'quantity' IS DISTINCT FROM expected->>'quantity' OR
    item->>'pageCount' IS DISTINCT FROM expected->>'pageCount' OR item->'files' IS DISTINCT FROM expected->'files' THEN RAISE EXCEPTION 'Ordinary converted item changed';END IF;
  END LOOP;

END $$;

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
  IF NOT coalesce((SELECT enabled FROM public.gelato_ordinary_release_gate WHERE id=true FOR SHARE),false) OR NEW.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Ordinary release is disabled or expired'; END IF;
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
DROP TRIGGER IF EXISTS guard_gelato_ordinary_permit ON public.gelato_ordinary_release_permits;
CREATE TRIGGER guard_gelato_ordinary_permit BEFORE INSERT OR UPDATE OR DELETE ON public.gelato_ordinary_release_permits FOR EACH ROW EXECUTE FUNCTION public.guard_gelato_ordinary_permit();

CREATE OR REPLACE FUNCTION public.register_gelato_ordinary_release(p_permit jsonb,p_packet jsonb,p_actor text,p_evidence_sha256 text) RETURNS uuid
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE sid uuid:=(p_permit->>'submissionId')::uuid; pid uuid:=(p_permit->>'id')::uuid; root public.gelato_ordinary_release_roots%ROWTYPE; binding jsonb;
BEGIN
 binding:=public.gelato_ordinary_current_binding(sid);
 INSERT INTO public.gelato_ordinary_release_roots(provider_order_id,submission_id,account_sha256) VALUES(p_permit->>'providerOrderId',sid,p_permit->>'accountSha256') ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT root FROM public.gelato_ordinary_release_roots WHERE provider_order_id=p_permit->>'providerOrderId' FOR UPDATE;
 IF root.submission_id<>sid OR root.account_sha256 IS DISTINCT FROM p_permit->>'accountSha256' OR root.consumed_at IS NOT NULL THEN RAISE EXCEPTION 'Ordinary root already consumed or identity differs'; END IF;
 INSERT INTO public.gelato_ordinary_release_permits(id,submission_id,provider_order_id,account_sha256,permit,packet,binding,approval_actor,approval_evidence_sha256,approved_at,expires_at)
 VALUES(pid,sid,root.provider_order_id,root.account_sha256,p_permit,p_packet,binding,p_actor,p_evidence_sha256,(p_permit->>'approvedAt')::timestamptz,(p_permit->>'expiresAt')::timestamptz);
 RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION public.acquire_gelato_ordinary_release(p_id uuid,p_account_sha256 text) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE a public.gelato_ordinary_release_permits%ROWTYPE; root public.gelato_ordinary_release_roots%ROWTYPE; token uuid:=gen_random_uuid();
BEGIN
 IF NOT coalesce((SELECT enabled FROM public.gelato_ordinary_release_gate WHERE id=true FOR SHARE),false) THEN RETURN '{"kind":"disabled"}';END IF;
 SELECT * INTO STRICT a FROM public.gelato_ordinary_release_permits WHERE id=p_id;
 PERFORM public.lock_gelato_submission_root(a.submission_id);
 SELECT * INTO STRICT root FROM public.gelato_ordinary_release_roots WHERE provider_order_id=a.provider_order_id FOR UPDATE;
 SELECT * INTO STRICT a FROM public.gelato_ordinary_release_permits WHERE id=p_id FOR UPDATE;
 IF a.account_sha256 IS DISTINCT FROM p_account_sha256 THEN RAISE EXCEPTION 'Ordinary account differs';END IF;
 IF root.consumed_at IS NOT NULL OR a.state NOT IN('ready','preparing') THEN RETURN '{"kind":"already_attempted"}';END IF;
 IF root.owner_permit_id IS NOT NULL OR a.state='preparing' THEN RETURN '{"kind":"busy"}';END IF;
 UPDATE public.gelato_ordinary_release_roots SET owner_permit_id=p_id WHERE provider_order_id=a.provider_order_id;
 UPDATE public.gelato_ordinary_release_permits SET state='preparing',owner_token=token,lease_expires_at=clock_timestamp()+interval '60 seconds' WHERE id=p_id;
 RETURN jsonb_build_object('kind','acquired','permit',a.permit,'ownerToken',token);
END $$;
CREATE OR REPLACE FUNCTION public.authorize_gelato_ordinary_release(p_id uuid,p_token uuid,p_packet_sha256 text) RETURNS boolean
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE a public.gelato_ordinary_release_permits%ROWTYPE;
BEGIN
 SELECT * INTO STRICT a FROM public.gelato_ordinary_release_permits WHERE id=p_id;
 PERFORM public.lock_gelato_submission_root(a.submission_id);
 PERFORM 1 FROM public.gelato_ordinary_release_roots WHERE provider_order_id=a.provider_order_id FOR UPDATE;
 SELECT * INTO STRICT a FROM public.gelato_ordinary_release_permits WHERE id=p_id FOR UPDATE;
 IF a.state<>'preparing' OR a.owner_token IS DISTINCT FROM p_token OR (a.lease_expires_at IS NULL OR a.lease_expires_at<=clock_timestamp()) OR a.permit->>'packetSha256' IS DISTINCT FROM p_packet_sha256 THEN RETURN false;END IF;
 UPDATE public.gelato_ordinary_release_roots SET consumed_at=clock_timestamp() WHERE provider_order_id=a.provider_order_id AND owner_permit_id=p_id AND consumed_at IS NULL;
 IF NOT FOUND THEN RETURN false;END IF;
 UPDATE public.gelato_ordinary_release_permits SET state='sending',send_started_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '60 seconds' WHERE id=p_id;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.finish_gelato_ordinary_release(p_id uuid,p_token uuid,p_outcome text,p_orders jsonb DEFAULT NULL) RETURNS boolean
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE a public.gelato_ordinary_release_permits%ROWTYPE; req jsonb; item jsonb; expected jsonb; art jsonb; root jsonb;
BEGIN
 SELECT * INTO STRICT a FROM public.gelato_ordinary_release_permits WHERE id=p_id;
 PERFORM public.lock_gelato_submission_root(a.submission_id);
 PERFORM 1 FROM public.gelato_ordinary_release_roots WHERE provider_order_id=a.provider_order_id FOR UPDATE;
 SELECT * INTO STRICT a FROM public.gelato_ordinary_release_permits WHERE id=p_id FOR UPDATE;
 IF a.owner_token IS DISTINCT FROM p_token OR a.closed_at IS NOT NULL OR a.state NOT IN('preparing','sending','observing') OR (a.lease_expires_at IS NULL OR a.lease_expires_at<=clock_timestamp()) THEN RETURN false;END IF;
 IF p_outcome NOT IN('preflight_failed','converted','outcome_unknown') OR p_outcome IS NULL THEN RAISE EXCEPTION 'Ordinary outcome invalid';END IF;
 IF p_outcome='preflight_failed' AND a.state<>'preparing' THEN RAISE EXCEPTION 'A consumed ordinary permit cannot reset';END IF;
 IF p_outcome='converted' THEN
  IF a.state NOT IN('sending','observing') OR jsonb_typeof(p_orders) IS DISTINCT FROM 'array' OR jsonb_array_length(p_orders)<>1 THEN RAISE EXCEPTION 'Ordinary converted observation incomplete';END IF;
  PERFORM public.assert_gelato_ordinary_observation(a.permit,a.binding,p_orders);
 END IF;
 UPDATE public.gelato_ordinary_release_permits SET state=p_outcome,observation=p_orders,closed_at=CASE WHEN p_outcome IN('converted','preflight_failed') THEN clock_timestamp() ELSE NULL END WHERE id=p_id;
 IF p_outcome='preflight_failed' THEN UPDATE public.gelato_ordinary_release_roots SET owner_permit_id=NULL WHERE provider_order_id=a.provider_order_id AND consumed_at IS NULL;
 ELSIF p_outcome='outcome_unknown' THEN UPDATE public.gelato_ordinary_release_roots SET consumed_at=coalesce(consumed_at,clock_timestamp()) WHERE provider_order_id=a.provider_order_id;END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.reap_gelato_ordinary_release(p_id uuid) RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE a public.gelato_ordinary_release_permits%ROWTYPE;
BEGIN
 SELECT * INTO STRICT a FROM public.gelato_ordinary_release_permits WHERE id=p_id;
 PERFORM public.lock_gelato_submission_root(a.submission_id);
 PERFORM 1 FROM public.gelato_ordinary_release_roots WHERE provider_order_id=a.provider_order_id FOR UPDATE;
 SELECT * INTO STRICT a FROM public.gelato_ordinary_release_permits WHERE id=p_id FOR UPDATE;
 IF a.state NOT IN('preparing','sending','observing') OR a.lease_expires_at>clock_timestamp() THEN RETURN false;END IF;
 UPDATE public.gelato_ordinary_release_permits SET state=CASE WHEN a.state='preparing' THEN 'preflight_failed' ELSE 'outcome_unknown' END,owner_token=gen_random_uuid(),closed_at=CASE WHEN a.state='preparing' THEN clock_timestamp() ELSE NULL END WHERE id=p_id;
 IF a.state='preparing' THEN UPDATE public.gelato_ordinary_release_roots SET owner_permit_id=NULL WHERE provider_order_id=a.provider_order_id AND consumed_at IS NULL;END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.begin_gelato_ordinary_observation(p_id uuid,p_account_sha256 text) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE a public.gelato_ordinary_release_permits%ROWTYPE; token uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO STRICT a FROM public.gelato_ordinary_release_permits WHERE id=p_id;
 PERFORM public.lock_gelato_submission_root(a.submission_id);
 PERFORM 1 FROM public.gelato_ordinary_release_roots WHERE provider_order_id=a.provider_order_id FOR UPDATE;
 SELECT * INTO STRICT a FROM public.gelato_ordinary_release_permits WHERE id=p_id FOR UPDATE;
 IF a.account_sha256 IS DISTINCT FROM p_account_sha256 THEN RAISE EXCEPTION 'Ordinary observation account differs';END IF;
 IF a.state IN('sending','observing') AND a.lease_expires_at>clock_timestamp() THEN RETURN '{"kind":"busy"}';END IF;
 IF a.state='observing' THEN PERFORM public.reap_gelato_ordinary_release(p_id); SELECT * INTO STRICT a FROM public.gelato_ordinary_release_permits WHERE id=p_id FOR UPDATE;END IF;
 IF a.state NOT IN('sending','outcome_unknown') THEN RETURN '{"kind":"closed"}';END IF;
 UPDATE public.gelato_ordinary_release_permits SET state='observing',owner_token=token,lease_expires_at=clock_timestamp()+interval '60 seconds' WHERE id=p_id;
 RETURN jsonb_build_object('kind','observe','permit',a.permit,'ownerToken',token);
END $$;

-- Explicitly defeat inherited public-schema default grants. No SECURITY DEFINER.
REVOKE ALL ON FUNCTION public.gelato_ordinary_canonical(jsonb),public.gelato_ordinary_digest(jsonb),public.gelato_ordinary_current_binding(uuid),public.assert_gelato_ordinary_packet(jsonb,jsonb,jsonb),public.assert_gelato_ordinary_observation(jsonb,jsonb,jsonb),public.guard_gelato_ordinary_root(),public.guard_gelato_ordinary_permit(),
 public.register_gelato_ordinary_release(jsonb,jsonb,text,text),public.acquire_gelato_ordinary_release(uuid,text),public.authorize_gelato_ordinary_release(uuid,uuid,text),public.finish_gelato_ordinary_release(uuid,uuid,text,jsonb),public.reap_gelato_ordinary_release(uuid),public.begin_gelato_ordinary_observation(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gelato_ordinary_canonical(jsonb),public.gelato_ordinary_digest(jsonb),public.gelato_ordinary_current_binding(uuid),public.assert_gelato_ordinary_packet(jsonb,jsonb,jsonb),public.assert_gelato_ordinary_observation(jsonb,jsonb,jsonb),public.guard_gelato_ordinary_root(),public.guard_gelato_ordinary_permit(),
 public.register_gelato_ordinary_release(jsonb,jsonb,text,text),public.acquire_gelato_ordinary_release(uuid,text),public.authorize_gelato_ordinary_release(uuid,uuid,text),public.finish_gelato_ordinary_release(uuid,uuid,text,jsonb),public.reap_gelato_ordinary_release(uuid),public.begin_gelato_ordinary_observation(uuid,text) TO service_role;
COMMIT;
