-- Retire a Gelato print claim that failed before anything was sent, so the order can be queued for print again.
-- Evidence this is safe is checked inside the function: state failed, send never started, no accepted provider root,
-- no provider orders, and no release/conversion/status/isolation record that refers to the submission.
CREATE OR REPLACE FUNCTION public.retire_failed_unsent_gelato_submission(p_submission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE s public.print_provider_submissions%ROWTYPE; unlinked integer;
BEGIN
  PERFORM public.lock_gelato_submission_root(p_submission_id);
  SELECT * INTO STRICT s FROM public.print_provider_submissions WHERE id = p_submission_id FOR UPDATE;
  IF s.request_state <> 'failed' OR s.send_started_at IS NOT NULL OR s.accepted_root_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only a failed Gelato submission that never sent can be retired';
  END IF;
  IF EXISTS (SELECT 1 FROM public.print_provider_submission_orders WHERE submission_id = s.id)
     OR EXISTS (SELECT 1 FROM public.print_provider_submission_items WHERE submission_id = s.id AND provider_order_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.gelato_ordinary_release_roots WHERE submission_id = s.id)
     OR EXISTS (SELECT 1 FROM public.gelato_ordinary_release_permits WHERE submission_id = s.id)
     OR EXISTS (SELECT 1 FROM public.gelato_engineering_conversions WHERE submission_id = s.id)
     OR EXISTS (SELECT 1 FROM public.gelato_scheduled_status WHERE submission_id = s.id)
     OR EXISTS (SELECT 1 FROM public.gelato_isolation_scopes WHERE submission_id = s.id) THEN
    RAISE EXCEPTION 'Gelato submission has provider or release records and cannot be retired';
  END IF;
  IF EXISTS (SELECT 1 FROM public.print_provider_submission_notifications WHERE submission_id = s.id AND (delivery_state <> 'pending' OR attempt_count > 0)) THEN
    RAISE EXCEPTION 'Gelato submission has notification history and cannot be retired';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE print_submission_id = s.id AND (execution_status IS DISTINCT FROM 'ready_for_processing' OR print_claim_token IS DISTINCT FROM s.claim_token)) THEN
    RAISE EXCEPTION 'Orders linked to this Gelato submission changed since the failure; inspect before retrying';
  END IF;
  UPDATE public.orders SET print_submission_id = NULL, print_claim_token = NULL WHERE print_submission_id = s.id;
  GET DIAGNOSTICS unlinked = ROW_COUNT;
  DELETE FROM public.print_provider_submission_notifications WHERE submission_id = s.id;
  DELETE FROM public.print_provider_submission_items WHERE submission_id = s.id;
  DELETE FROM public.print_provider_submissions WHERE id = s.id;
  -- The submission row is deleted so a new claim can use the same group and idempotency key; return what it held for the caller's log.
  RETURN jsonb_build_object('retired', true, 'submissionId', s.id, 'ordersUnlinked', unlinked, 'orderReferenceId', s.order_reference_id,
    'logicalGroup', s.logical_group, 'actionReason', s.action_reason, 'claimedAt', s.created_at, 'failedAt', s.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.retire_failed_unsent_gelato_submission(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retire_failed_unsent_gelato_submission(uuid) TO service_role;
