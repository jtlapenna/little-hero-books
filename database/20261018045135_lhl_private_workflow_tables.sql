-- LHL private workflow tables: catalog/ACL changes only; no customer row access.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $restrict$
DECLARE
  table_name text;
  target regclass;
  role_name text;
  private_tables text[] := ARRAY['audit_logs','character_generations','failed_orders','human_review_queue','workflow_execution_logs'];
BEGIN
  IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role') OR
     has_schema_privilege('anon','public','CREATE') OR
     has_schema_privilege('authenticated','public','CREATE') THEN
    RAISE EXCEPTION 'Service bypass and nonwritable public schema are prerequisites';
  END IF;
  -- Validate the whole set before restricting any member. Unexpected state fails closed.
  FOREACH table_name IN ARRAY private_tables LOOP
    target := to_regclass(format('public.%I',table_name));
    IF target IS NULL OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=target AND relkind='r' AND relrowsecurity) THEN
      RAISE EXCEPTION 'Expected existing regular RLS table public.%',table_name;
    END IF;
    IF NOT (SELECT bool_and(has_table_privilege('service_role',target,priv))
            FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) priv) THEN
      RAISE EXCEPTION 'Existing server CRUD missing for public.%',table_name;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=table_name AND
      (p.policyname <> 'Authenticated users can view '||table_name OR p.cmd<>'SELECT' OR
       p.roles<>ARRAY['authenticated']::name[] OR p.permissive<>'PERMISSIVE' OR
       p.qual IS DISTINCT FROM 'true' OR p.with_check IS NOT NULL)) THEN
      RAISE EXCEPTION 'Unexpected policy for public.%; review before restricting',table_name;
    END IF;
  END LOOP;
  FOREACH table_name IN ARRAY private_tables LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','Authenticated users can view '||table_name,table_name);
  END LOOP;
  FOREACH table_name IN ARRAY private_tables LOOP
    target := to_regclass(format('public.%I',table_name));
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_table_privilege(role_name,target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
         has_any_column_privilege(role_name,target,'SELECT,INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'Residual client authority for % on public.%',role_name,table_name;
      END IF;
    END LOOP;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=target) OR
       EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=table_name) OR
       NOT (SELECT bool_and(has_table_privilege('service_role',target,priv))
            FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) priv) THEN
      RAISE EXCEPTION 'Server access or RLS postcondition failed for public.%',table_name;
    END IF;
  END LOOP;
END;
$restrict$;
NOTIFY pgrst, 'reload schema';
COMMIT;
