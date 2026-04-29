-- Supabase Security Advisor remediation
-- Addresses:
-- - policy_exists_rls_disabled
-- - rls_disabled_in_public
-- - sensitive_columns_exposed on preview_tokens.token
-- - security_definer_view on public monitoring/admin views

BEGIN;

-- Enable RLS on every public table reported by Supabase Security Advisor.
-- Tables that already have policies will start enforcing them; tables without
-- policies become service-role-only through the Data API.
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.character_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.failed_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.human_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.workflow_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.lulu_webhook_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.workflow_job_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.book_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.archived_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customer_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.preview_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.workflow_job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.workflow_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.workflow_alerts ENABLE ROW LEVEL SECURITY;

-- The legacy setup granted broad anonymous table access. RLS blocks rows by
-- default, but revoking direct anon access keeps the permission surface tight.
DO $$
DECLARE
  table_name text;
  internal_tables text[] := ARRAY[
    'audit_logs',
    'character_generations',
    'failed_orders',
    'human_review_queue',
    'orders',
    'workflow_execution_logs',
    'idempotency_keys',
    'lulu_webhook_log',
    'workflow_job_attempts',
    'book_configs',
    'archived_orders',
    'customer_feedback',
    'preview_tokens',
    'notification_logs',
    'workflow_job_events',
    'workflow_jobs',
    'workflow_alerts'
  ];
BEGIN
  FOREACH table_name IN ARRAY internal_tables
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
    END IF;
  END LOOP;
END $$;

-- These tables contain workflow internals, customer feedback, or secrets/tokens.
-- Keep them unavailable to browser/authenticated clients unless a future policy
-- is added deliberately.
DO $$
DECLARE
  table_name text;
  private_tables text[] := ARRAY[
    'idempotency_keys',
    'lulu_webhook_log',
    'workflow_job_attempts',
    'book_configs',
    'archived_orders',
    'customer_feedback',
    'preview_tokens',
    'notification_logs',
    'workflow_job_events',
    'workflow_jobs',
    'workflow_alerts'
  ];
BEGIN
  FOREACH table_name IN ARRAY private_tables
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', table_name);
    END IF;
  END LOOP;
END $$;

-- Make views obey the querying role instead of the creating role.
DO $$
DECLARE
  view_name text;
  advisor_views text[] := ARRAY[
    'pending_human_reviews',
    'orders_ready_for_workflow',
    'orphaned_orders',
    'v_orders_review',
    'queue_status',
    'workflow_status_dashboard'
  ];
BEGIN
  FOREACH view_name IN ARRAY advisor_views
  LOOP
    IF to_regclass(format('public.%I', view_name)) IS NOT NULL THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', view_name);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', view_name);
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', view_name);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
