-- Install only while Gelato notification delivery is OFF. No payment or submission flag is changed.
-- Preserves delivered historical receipts; refuses an engineering send already in flight.
BEGIN;
CREATE OR REPLACE FUNCTION public.gelato_submission_is_engineering_test(p_submission_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.print_provider_submissions s WHERE s.id=p_submission_id AND
   (upper(trim(s.root_order_id)) LIKE 'TEST-GELATO-%' OR EXISTS(
     SELECT 1 FROM public.print_provider_submission_items i LEFT JOIN public.orders o ON o.id=i.child_order_id
     WHERE i.submission_id=s.id AND (upper(trim(i.child_order_key)) LIKE 'TEST-GELATO-%' OR
       upper(trim(o."orderId")) LIKE 'TEST-GELATO-%' OR upper(trim(o.root_order_id)) LIKE 'TEST-GELATO-%' OR
       upper(trim(o.amazon_order_id)) LIKE 'TEST-GELATO-%' OR o.book_specs->>'testMode'='true'))));
$$;
REVOKE ALL ON FUNCTION public.gelato_submission_is_engineering_test(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gelato_submission_is_engineering_test(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.gelato_notification_eligible(p_notification_id uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE n public.print_provider_submission_notifications%ROWTYPE; child text; i public.print_provider_submission_items%ROWTYPE; o public.orders%ROWTYPE; po public.print_provider_submission_orders%ROWTYPE; target jsonb;
BEGIN
 SELECT * INTO STRICT n FROM public.print_provider_submission_notifications WHERE id=p_notification_id;
 IF public.gelato_submission_is_engineering_test(n.submission_id) THEN RETURN false; END IF;
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
REVOKE ALL ON FUNCTION public.gelato_notification_eligible(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gelato_notification_eligible(uuid) TO service_role;
-- Existing synthetic rows stay permanently non-deliverable when flags change.
-- Lock notification writes while checking that no test send is already in flight.
LOCK TABLE public.print_provider_submission_notifications IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.print_provider_submission_notifications n
   WHERE public.gelato_submission_is_engineering_test(n.submission_id) AND
     n.delivery_state='delivering' AND n.attempt_started_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Engineering notification send in flight; stop and reconcile before installing suppression';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.suppress_gelato_engineering_notification()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF public.gelato_submission_is_engineering_test(NEW.submission_id) THEN
   NEW.delivery_state:='suppressed'; NEW.attempt_result:='engineering_test_suppressed';
   NEW.attempt_token:=NULL; NEW.attempt_started_at:=NULL; NEW.lease_expires_at:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.suppress_gelato_engineering_notification() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.suppress_gelato_engineering_notification() TO service_role;
DROP TRIGGER IF EXISTS suppress_gelato_engineering_notification ON public.print_provider_submission_notifications;
CREATE TRIGGER suppress_gelato_engineering_notification BEFORE INSERT ON public.print_provider_submission_notifications
 FOR EACH ROW EXECUTE FUNCTION public.suppress_gelato_engineering_notification();
UPDATE public.print_provider_submission_notifications n
 SET delivery_state='suppressed',attempt_result='engineering_test_suppressed',attempt_token=NULL,
     lease_expires_at=NULL,updated_at=clock_timestamp()
 WHERE public.gelato_submission_is_engineering_test(n.submission_id) AND n.delivery_state NOT IN ('delivered','suppressed');

COMMIT;
