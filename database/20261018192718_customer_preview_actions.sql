-- Local-reviewed source only. Install before deploying the matching preview handlers.
-- Token + exact order CAS share one transaction; no split-write fallback.
BEGIN;
CREATE OR REPLACE FUNCTION public.commit_customer_preview_action(
  p_order_id bigint, p_token text, p_expected jsonb, p_action text, p_changes jsonb, p_revision_limit integer DEFAULT 1
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  saved jsonb; link jsonb; names text; changed integer;
  allowed constant text[] := ARRAY['customer_approval_status','customer_approval_required','customer_approval_approved_at','execution_status','workflow_step','current_workflow','started_at','next_workflow','human_approved','human_reviewed_at','human_reviewer','rejection_history','revision_count','review_stages','qa_notes','regeneration_instructions','updated_at'];
  expected_keys constant text[] := ARRAY['orderId','order_id','root_order_id','amazon_order_id','updated_at','manifest_3_url','customer_approval_status','customer_approval_required','revision_count','execution_status','workflow_step','current_workflow','started_at','review_stages','print_submission_id','lulu_job_id','lulu_status'];
BEGIN
  IF p_order_id IS NULL OR p_token IS NULL OR p_action IS NULL OR p_action NOT IN ('approve','reject') OR (p_revision_limit IS NOT NULL AND p_revision_limit<1) OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object' OR jsonb_typeof(p_changes) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_expected)) <> cardinality(expected_keys)
    OR EXISTS(SELECT 1 FROM unnest(expected_keys) k WHERE NOT p_expected ? k)
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_changes) k WHERE NOT k = ANY(allowed)) THEN RETURN false; END IF;
  -- Always lock the order first, then a link. Distinct links serialize on the order.
  SELECT to_jsonb(o) INTO saved FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF saved IS NULL OR EXISTS(SELECT 1 FROM jsonb_each(p_expected) e WHERE COALESCE(saved->e.key,'null'::jsonb) IS DISTINCT FROM e.value)
    OR saved->>'customer_approval_status' IN ('approved','revision_requested') THEN RETURN false; END IF;
  IF NULLIF(saved->>'manifest_3_url','') IS NULL OR COALESCE(saved->>'workflow_step','') NOT IN ('book_assembly_completed','customer_approval')
    OR saved->>'execution_status' IS DISTINCT FROM 'done' OR NULLIF(saved->>'current_workflow','') IS NOT NULL OR saved->>'started_at' IS NOT NULL
    OR lower(COALESCE(saved#>>'{review_stages,postPdf,status}',saved#>>'{review_stages,post_pdf,status}','')) <> 'approved'
    OR NULLIF(saved->>'print_submission_id','') IS NOT NULL OR NULLIF(saved->>'lulu_job_id','') IS NOT NULL OR NULLIF(saved->>'lulu_status','') IS NOT NULL THEN RETURN false; END IF;
  SELECT to_jsonb(t) INTO link FROM public.preview_tokens t WHERE t.token=p_token AND t.used_at IS NULL AND t.expires_at > clock_timestamp() FOR UPDATE;
  IF link IS NULL THEN RETURN false; END IF;
  IF link->>'order_id' NOT IN (COALESCE(saved->>'orderId',''),COALESCE(saved->>'order_id',''),saved->>'id')
    AND NOT (CASE WHEN link->>'order_id' ~ '^[0-9]+$' THEN (link->>'order_id')::numeric=p_order_id ELSE false END) THEN
    IF link->>'order_id' NOT IN (COALESCE(saved->>'root_order_id',''),COALESCE(saved->>'amazon_order_id',''))
      OR EXISTS(SELECT 1 FROM public.orders o WHERE o.id <> p_order_id AND link->>'order_id' IN (to_jsonb(o)->>'orderId',to_jsonb(o)->>'order_id',to_jsonb(o)->>'root_order_id',to_jsonb(o)->>'amazon_order_id')) THEN RETURN false; END IF;
  END IF;
  IF p_action='approve' AND (p_changes->>'customer_approval_status' IS DISTINCT FROM 'approved' OR p_changes->>'next_workflow' IS DISTINCT FROM '4') THEN RETURN false; END IF;
  IF p_action='reject' AND (p_changes->>'customer_approval_status' IS DISTINCT FROM 'revision_requested' OR (p_revision_limit IS NOT NULL AND (COALESCE((saved->>'revision_count')::int,0)>=p_revision_limit OR (p_changes->>'revision_count')::int>p_revision_limit)) OR (p_changes->>'revision_count')::int IS NULL OR (p_changes->>'revision_count')::int < COALESCE((saved->>'revision_count')::int,0)+1) THEN RETURN false; END IF;
  p_changes := p_changes || jsonb_build_object('updated_at',clock_timestamp());
  SELECT string_agg(format('%I',key),', ' ORDER BY key) INTO names FROM jsonb_object_keys(p_changes) key;
  EXECUTE format('UPDATE public.orders SET (%s)=(SELECT %s FROM jsonb_populate_record(NULL::public.orders,$1)) WHERE id=$2',names,names) USING p_changes,p_order_id;
  UPDATE public.preview_tokens SET used_at=clock_timestamp() WHERE token=p_token AND used_at IS NULL AND expires_at>clock_timestamp();
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'Preview token changed before commit'; END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.commit_customer_preview_action(bigint,text,jsonb,text,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_customer_preview_action(bigint,text,jsonb,text,jsonb,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.guard_gelato_customer_approval_before_send()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE member jsonb; found integer := 0;
BEGIN
  FOR member IN SELECT to_jsonb(o) FROM public.orders o JOIN public.print_provider_submission_items i ON i.child_order_id=o.id
    WHERE i.submission_id=NEW.id ORDER BY o.id FOR UPDATE OF o LOOP
    found := found+1;
    IF member->>'customer_approval_status'='revision_requested'
      OR (member->>'customer_approval_required'='true' AND member->>'customer_approval_status' IS DISTINCT FROM 'approved') THEN
      RAISE EXCEPTION 'Gelato customer approval is not current';
    END IF;
  END LOOP;
  IF found=0 THEN RAISE EXCEPTION 'Gelato send has no current members'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_gelato_customer_approval_before_send() FROM PUBLIC,anon,authenticated;
-- Trigger execution uses existing authorization RPC ownership; no new caller grants.
DROP TRIGGER IF EXISTS gelato_customer_approval_before_send ON public.print_provider_submissions;
CREATE TRIGGER gelato_customer_approval_before_send BEFORE UPDATE OF send_started_at ON public.print_provider_submissions
FOR EACH ROW WHEN (NEW.provider='gelato' AND OLD.send_started_at IS NULL AND NEW.send_started_at IS NOT NULL)
EXECUTE FUNCTION public.guard_gelato_customer_approval_before_send();
-- Recheck current approval when the claim RPC installs/rotates processing ownership.
-- This covers new claims and retries while preserving archived item insertion.
CREATE OR REPLACE FUNCTION public.guard_gelato_customer_approval_on_resume()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.print_provider_submissions s WHERE s.id=NEW.print_submission_id
      AND s.request_state='claimed' AND s.send_started_at IS NULL)
    AND (NEW.customer_approval_status='revision_requested'
      OR (NEW.customer_approval_required=true AND NEW.customer_approval_status IS DISTINCT FROM 'approved')) THEN
    RAISE EXCEPTION 'Gelato customer approval is not current';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_gelato_customer_approval_on_resume() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS gelato_customer_approval_on_resume ON public.orders;
-- Includes first ownership assignment and retries that reuse existing item rows.
-- Fencing returns orders to ready; it must remain possible after revoked approval.
CREATE TRIGGER gelato_customer_approval_on_resume BEFORE UPDATE OF print_claim_token ON public.orders
FOR EACH ROW WHEN (NEW.print_provider='gelato' AND NEW.execution_status='processing'
  AND NEW.print_claim_token IS NOT NULL AND NEW.print_claim_token IS DISTINCT FROM OLD.print_claim_token)
EXECUTE FUNCTION public.guard_gelato_customer_approval_on_resume();
COMMIT;
