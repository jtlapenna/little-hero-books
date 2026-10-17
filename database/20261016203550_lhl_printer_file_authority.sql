BEGIN;
-- Add bounded printer-capability URL support without changing quote ownership,
-- member receipt, saved inputs, role grants or submission/send fencing.
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
       split_part(coalesce(item#>>'{files,0,url}',''), '?', 1) IS DISTINCT FROM 'https://admin.littleherolabs.com/api/pdf/'||i.artifact_key OR
       (
         -- Historical unsigned snapshots remain readable; source requires re-quote before a new send.
         (item#>>'{files,0,url}' = 'https://admin.littleherolabs.com/api/pdf/'||i.artifact_key AND p_snapshot->'printerFiles' IS NULL)
         OR (length(item#>>'{files,0,url}') <= length('https://admin.littleherolabs.com/api/pdf/'||i.artifact_key)+4110 AND
           item#>>'{files,0,url}' = 'https://admin.littleherolabs.com/api/pdf/'||i.artifact_key||'?'||split_part(item#>>'{files,0,url}', '?', 2) AND
           split_part(item#>>'{files,0,url}', '?', 2) ~ '^printerGrant=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' AND
           p_snapshot#>>'{printerFiles,version}' = '1' AND
           coalesce(p_snapshot#>>'{printerFiles,issuedAt}','') ~ '^[0-9]{1,12}$' AND coalesce(p_snapshot#>>'{printerFiles,expiresAt}','') ~ '^[0-9]{1,12}$' AND
           (p_snapshot#>>'{printerFiles,issuedAt}')::bigint <= extract(epoch FROM clock_timestamp()) AND
           (p_snapshot#>>'{printerFiles,expiresAt}')::bigint > (p_snapshot#>>'{printerFiles,issuedAt}')::bigint AND
           (p_snapshot#>>'{printerFiles,expiresAt}')::bigint - (p_snapshot#>>'{printerFiles,issuedAt}')::bigint <= 86400 AND
           (p_snapshot#>>'{printerFiles,expiresAt}')::bigint >= extract(epoch FROM clock_timestamp())+3600)
       ) IS NOT TRUE THEN RAISE EXCEPTION 'Gelato quote snapshot differs from registered print input'; END IF;
  END LOOP;
  UPDATE public.print_provider_submissions SET quote_snapshot=p_snapshot WHERE id=s.id;
END $$;
REVOKE ALL ON FUNCTION public.record_gelato_quote_snapshot(uuid,uuid,text,text,integer,timestamptz,text[],text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_gelato_quote_snapshot(uuid,uuid,text,text,integer,timestamptz,text[],text,jsonb) TO service_role;
COMMIT;
