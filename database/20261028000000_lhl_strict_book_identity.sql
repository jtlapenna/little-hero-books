-- Local-only preparation. This lookup does not establish publication authority.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.lhl_strict_book_identity(p_book_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
  WITH schema_state AS (
    SELECT count(*) FILTER (WHERE a.attname IN ('orderId', 'order_id')) AS aliases,
           count(*) FILTER (WHERE a.attname IN ('orderId', 'order_id')
             AND a.atttypid NOT IN ('pg_catalog.text'::regtype, 'pg_catalog.varchar'::regtype)) AS unsupported_aliases,
           count(*) FILTER (WHERE a.attname = 'id') AS row_ids,
           pg_catalog.row_security_active('public.orders'::regclass) AS rls_restricts_visibility
    FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = 'public.orders'::regclass AND a.attnum > 0 AND NOT a.attisdropped
  ), candidates AS MATERIALIZED (
    SELECT to_jsonb(o) AS row_data
    FROM public.orders AS o
    WHERE ((to_jsonb(o)->>'orderId') COLLATE "C" = p_book_id COLLATE "C" OR (to_jsonb(o)->>'order_id') COLLATE "C" = p_book_id COLLATE "C")
  ), evaluation AS (
    SELECT count(*) AS matches,
      coalesce(bool_or(
        (row_data->>'orderId' IS NOT NULL AND row_data->>'order_id' IS NOT NULL
         AND (row_data->>'orderId') COLLATE "C" <> (row_data->>'order_id') COLLATE "C")
        OR jsonb_typeof(row_data->'id') NOT IN ('number', 'string')
        OR nullif(btrim(row_data->>'id', U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '') IS NULL
        OR (row_data->>'id') COLLATE "C" <> btrim(row_data->>'id', U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') COLLATE "C"
      ), false) AS invalid,
      (jsonb_agg(row_data)->0) AS found_row
    FROM candidates
  )
  SELECT CASE
    WHEN p_book_id IS NULL OR p_book_id = '' OR p_book_id COLLATE "C" <> btrim(p_book_id, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') COLLATE "C"
      THEN jsonb_build_object('status', 'invalid_input')
    WHEN schema_state.aliases = 0 OR schema_state.unsupported_aliases > 0 OR schema_state.row_ids <> 1 OR schema_state.rls_restricts_visibility
      THEN jsonb_build_object('status', 'schema_unavailable')
    WHEN evaluation.matches = 0 THEN jsonb_build_object('status', 'absent')
    WHEN evaluation.matches <> 1 OR evaluation.invalid
      OR (SELECT count(*) FROM public.orders AS same_id
          WHERE (to_jsonb(same_id)->>'id') COLLATE "C" =
                (evaluation.found_row->>'id') COLLATE "C") <> 1
      THEN jsonb_build_object('status', 'ambiguous')
    ELSE jsonb_build_object('status', 'found', 'row', jsonb_set(evaluation.found_row, '{id}', to_jsonb(evaluation.found_row->>'id')))
  END
  FROM schema_state CROSS JOIN evaluation;
$function$;

REVOKE ALL ON FUNCTION public.lhl_strict_book_identity(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lhl_strict_book_identity(text) TO service_role;
DO $acl$
DECLARE function_oid oid := 'public.lhl_strict_book_identity(text)'::regprocedure;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS p,
      LATERAL pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
    WHERE p.oid = function_oid AND a.privilege_type = 'EXECUTE'
      AND a.grantee <> p.proowner AND a.grantee <> 'service_role'::regrole
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS r, pg_catalog.pg_proc AS p
    WHERE p.oid = function_oid AND r.oid <> p.proowner
      AND r.rolname <> 'service_role' AND NOT r.rolsuper
      AND pg_catalog.has_function_privilege(r.oid, function_oid, 'EXECUTE')
  ) OR has_function_privilege('anon', function_oid, 'EXECUTE')
    OR has_function_privilege('authenticated', function_oid, 'EXECUTE')
    OR NOT has_function_privilege('service_role', function_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected strict book identity function privilege';
  END IF;
END;
$acl$;
COMMIT;
