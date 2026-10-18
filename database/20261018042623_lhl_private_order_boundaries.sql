-- LHL server-only order boundary. No row reads/writes or function-body changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE lhl_order_boundary_before ON COMMIT DROP AS
SELECT p.oid, p.prosrc, p.proowner, p.prosecdef
FROM pg_proc p
WHERE p.oid IN (to_regprocedure('public.upsert_from_manifest_2a(text,jsonb)'),
                to_regprocedure('public.upsert_from_manifest_2b(text,jsonb)'));

DO $preflight$
BEGIN
  IF (SELECT count(*) FROM pg_temp.lhl_order_boundary_before) <> 2 THEN
    RAISE EXCEPTION 'Expected exact two manifest functions';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_temp.lhl_order_boundary_before WHERE NOT prosecdef) OR
     md5((SELECT prosrc FROM pg_proc WHERE oid='public.upsert_from_manifest_2a(text,jsonb)'::regprocedure)) <> 'fde95b0b1d7b493034f8a9d492a24e35' OR
     md5((SELECT prosrc FROM pg_proc WHERE oid='public.upsert_from_manifest_2b(text,jsonb)'::regprocedure)) <> '244d8d7a4f90fc4128fd6acd00282caa' THEN
    RAISE EXCEPTION 'Manifest function body or security mode drift';
  END IF;
  IF has_schema_privilege('anon','public','CREATE') OR
     has_schema_privilege('authenticated','public','CREATE') THEN
    RAISE EXCEPTION 'Public schema must not be client writable';
  END IF;
  IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role') OR
     NOT (SELECT bool_and(has_table_privilege('service_role','public.orders',priv))
          FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) priv) THEN
    RAISE EXCEPTION 'Existing service-role orders access must be preserved';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.orders'::regclass) THEN
    RAISE EXCEPTION 'Orders RLS must already be enabled';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orders' AND
    (policyname NOT IN ('Authenticated users can view orders','Authenticated users can modify orders') OR
     roles <> ARRAY['authenticated']::name[] OR
     (policyname='Authenticated users can view orders' AND (cmd<>'SELECT' OR qual IS DISTINCT FROM 'true' OR with_check IS NOT NULL)) OR
     (policyname='Authenticated users can modify orders' AND (cmd<>'ALL' OR qual IS DISTINCT FROM 'true' OR with_check IS DISTINCT FROM 'true')))) THEN
    RAISE EXCEPTION 'Orders policy drift; review before restricting';
  END IF;
END;
$preflight$;

REVOKE ALL ON TABLE public.orders FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Authenticated users can view orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can modify orders" ON public.orders;

REVOKE EXECUTE ON FUNCTION public.upsert_from_manifest_2a(text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_from_manifest_2b(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_from_manifest_2a(text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_from_manifest_2b(text,jsonb) TO service_role;
ALTER FUNCTION public.upsert_from_manifest_2a(text,jsonb) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.upsert_from_manifest_2b(text,jsonb) SET search_path = pg_catalog, public, pg_temp;

DO $postflight$
DECLARE
  role_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_temp.lhl_order_boundary_before b JOIN pg_proc p USING (oid)
             WHERE p.prosrc IS DISTINCT FROM b.prosrc OR p.proowner <> b.proowner OR p.prosecdef <> b.prosecdef) THEN
    RAISE EXCEPTION 'Manifest implementation/owner changed unexpectedly';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_temp.lhl_order_boundary_before b USING (oid)
             WHERE NOT ('search_path=pg_catalog, public, pg_temp' = ANY(coalesce(p.proconfig,ARRAY[]::text[])))) THEN
    RAISE EXCEPTION 'Manifest fixed search path missing';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(role_name,'public.orders','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
       has_any_column_privilege(role_name,'public.orders','SELECT,INSERT,UPDATE,REFERENCES') OR
       has_function_privilege(role_name,'public.upsert_from_manifest_2a(text,jsonb)','EXECUTE') OR
       has_function_privilege(role_name,'public.upsert_from_manifest_2b(text,jsonb)','EXECUTE') THEN
      RAISE EXCEPTION 'Residual client authority for %, including inherited/column grants', role_name;
    END IF;
  END LOOP;
  IF NOT (SELECT bool_and(has_table_privilege('service_role','public.orders',priv))
          FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) priv) OR
     NOT has_function_privilege('service_role','public.upsert_from_manifest_2a(text,jsonb)','EXECUTE') OR
     NOT has_function_privilege('service_role','public.upsert_from_manifest_2b(text,jsonb)','EXECUTE') OR
     NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.orders'::regclass) OR
     EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orders') THEN
    RAISE EXCEPTION 'Server access or RLS postcondition failed';
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';
COMMIT;
