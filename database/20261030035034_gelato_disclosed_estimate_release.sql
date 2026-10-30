-- CLI-generated local migration; not applied to a hosted database.
-- John selected disclosed estimate approval for one specifically approved test copy.
-- Keep original version2 verified-total packets strict; version3 has UNKNOWN final charge.
-- No gate, legacy row, credential or approval is enabled/rewritten. Existing function ACL retained.
BEGIN;
CREATE OR REPLACE FUNCTION public.assert_gelato_ordinary_packet(p_permit jsonb,p_packet jsonb,p_binding jsonb) RETURNS void
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE a jsonb; m jsonb; o jsonb; item jsonb; req jsonb:=p_binding#>'{submission,snapshot,request}'; cfg jsonb:=p_binding#>'{submission,snapshot,config}'; pay jsonb:=CASE WHEN p_packet->>'version'='3' THEN p_packet->'estimate' ELSE p_packet->'payable' END; estimate_mode boolean:=(p_packet->>'version' IS NOT DISTINCT FROM '3'); limit_name text:=CASE WHEN p_packet->>'version'='3' THEN 'maximumQuotedSubtotalCents' ELSE 'maximumTotalCents' END; amount numeric; id_text text; expected text[];
BEGIN
 IF jsonb_typeof(p_permit)<>'object' OR jsonb_typeof(p_packet)<>'object' OR
  (estimate_mode AND ((SELECT count(*) FROM jsonb_object_keys(p_permit))<>12 OR p_permit->>'pricingPolicy' IS DISTINCT FROM 'disclosed_estimate_test_print_v1' OR p_packet->>'pricingPolicy' IS DISTINCT FROM p_permit->>'pricingPolicy' OR p_permit ? 'maximumTotalCents' OR p_packet ? 'maximumTotalCents' OR p_packet ? 'payable')) OR
  (NOT estimate_mode AND ((SELECT count(*) FROM jsonb_object_keys(p_permit))<>11 OR p_packet->>'version' IS DISTINCT FROM '2' OR p_packet ? 'estimate' OR p_permit ? 'pricingPolicy')) OR p_permit->>'accountSha256' !~ '^[a-f0-9]{64}$' OR p_permit->>'packetSha256' !~ '^[a-f0-9]{64}$' OR
  p_permit->>'requestSnapshotSha256' IS DISTINCT FROM public.gelato_ordinary_digest(p_binding#>'{submission,snapshot}') OR
  p_permit->>'packetSha256' IS DISTINCT FROM public.gelato_ordinary_digest(p_packet) OR
  p_packet->>'destinationSha256' IS DISTINCT FROM public.gelato_ordinary_digest(p_binding#>'{submission,snapshot,request,shippingAddress}') OR
  p_packet->>'originalRequestSha256' IS DISTINCT FROM p_permit->>'requestSnapshotSha256' OR
  p_packet->>'permitId' IS DISTINCT FROM p_permit->>'id' OR p_packet->>'submissionId' IS DISTINCT FROM p_permit->>'submissionId' OR
  p_packet->>'providerOrderId' IS DISTINCT FROM p_permit->>'providerOrderId' OR p_packet->>'accountSha256' IS DISTINCT FROM p_permit->>'accountSha256' OR
  p_packet->>'approvedAt' IS DISTINCT FROM p_permit->>'approvedAt' OR p_packet->>'expiresAt' IS DISTINCT FROM p_permit->>'expiresAt' OR
  p_permit->>'currency' IS DISTINCT FROM 'USD' OR p_packet->>'currency' IS DISTINCT FROM 'USD' OR pay->>'currency' IS DISTINCT FROM 'USD' OR
  p_packet->>limit_name IS DISTINCT FROM p_permit->>limit_name OR coalesce(p_permit->>limit_name,'') !~ '^(0|[1-9][0-9]{0,11})$' OR
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
 IF pay->>'source' IS DISTINCT FROM (CASE WHEN estimate_mode THEN 'gelato_product_shipping_estimate' ELSE 'verified_provider_payable' END) OR pay->>'accountSha256' IS DISTINCT FROM p_permit->>'accountSha256' OR
  coalesce(pay->>'responseSha256','') !~ '^[a-f0-9]{64}$' OR coalesce(pay->>'quoteResponseSha256','') !~ '^[a-f0-9]{64}$' OR coalesce(pay->>'requestFingerprint','') !~ '^[a-f0-9]{64}$' OR coalesce(pay->>'quoteId','')='' OR
  coalesce(pay->>'quotedAt','')='' OR pay->>'requestFingerprint' IS DISTINCT FROM p_binding#>>'{submission,quoteFingerprint}' OR
  (pay->>'quotedAt')::timestamptz>clock_timestamp() OR (pay->>'quotedAt')::timestamptz<clock_timestamp()-interval '15 minutes' THEN RAISE EXCEPTION 'Ordinary payable evidence missing or stale'; END IF;
 FOREACH id_text IN ARRAY (CASE WHEN estimate_mode THEN ARRAY['productsCents','shippingCents','quotedSubtotalCents'] ELSE ARRAY['productsCents','shippingCents','taxesCents','feesCents','discountCents','totalCents'] END) LOOP
  IF coalesce(pay->>id_text,'') !~ '^(0|[1-9][0-9]{0,11})$' THEN RAISE EXCEPTION 'Ordinary payable amount invalid'; END IF;
 END LOOP;
 IF estimate_mode THEN
  IF jsonb_array_length(p_permit->'artifacts')<>1 OR jsonb_array_length(req->'items')<>1 OR req#>>'{items,0,quantity}' IS DISTINCT FROM '1' OR
   pay->'taxesCents' IS DISTINCT FROM 'null'::jsonb OR pay->'feesCents' IS DISTINCT FROM 'null'::jsonb OR pay->'discountCents' IS DISTINCT FROM 'null'::jsonb OR pay->'totalCents' IS DISTINCT FROM 'null'::jsonb OR
   pay->'finalChargeMayDiffer' IS DISTINCT FROM 'true'::jsonb OR pay->'providerChargeCapEnforced' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'Estimate disclosure or single test-copy scope differs'; END IF;
  amount:=(pay->>'productsCents')::numeric+(pay->>'shippingCents')::numeric;
  IF amount<>(pay->>'quotedSubtotalCents')::numeric OR amount>(p_permit->>limit_name)::numeric THEN RAISE EXCEPTION 'Ordinary quoted subtotal exceeds approved threshold'; END IF;
 ELSE
 amount:=(pay->>'productsCents')::numeric+(pay->>'shippingCents')::numeric+(pay->>'taxesCents')::numeric+(pay->>'feesCents')::numeric-(pay->>'discountCents')::numeric;
 IF amount<0 OR amount<>(pay->>'totalCents')::numeric OR amount>(p_permit->>limit_name)::numeric THEN RAISE EXCEPTION 'Ordinary approved spend exceeds maximum'; END IF;
 END IF;
END $$;
COMMIT;
