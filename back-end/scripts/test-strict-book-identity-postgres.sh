#!/usr/bin/env bash
set -euo pipefail

# Disposable, socket-only PostgreSQL; no credentials or hosted service required.
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
pg_test_dir="$(mktemp -d "${TMPDIR:-/tmp}/lhl-book-id.XXXXXXXX")"
cleanup() {
  pg_ctl -D "$pg_test_dir/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$pg_test_dir"
}
trap cleanup EXIT
initdb -D "$pg_test_dir/data" -A trust -U postgres >/dev/null
pg_ctl -D "$pg_test_dir/data" -o "-c listen_addresses='' -c unix_socket_directories='$pg_test_dir'" -w start >/dev/null
export PGHOST="$pg_test_dir" PGUSER=postgres PGDATABASE=postgres
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE public.orders (id text, "orderId" text, order_id text, root_order_id text);
GRANT SELECT ON public.orders TO service_role;
INSERT INTO public.orders VALUES
  (1,'BOOK-A','BOOK-A','ROOT'),
  (2,'BOOK-AB','BOOK-AB','ROOT'),
  (3,'BOOK-C','DIFFERENT','ROOT'),
  (4,'DUPLICATE',NULL,'ROOT'),
  (5,NULL,'DUPLICATE','ROOT'),
  (6,NULL,'SNAKE','ROOT'),
  (7,NULL,'', 'ROOT'),
  (NULL,'NULL-ID',NULL,'ROOT'),
  ('9007199254740993','BIG-ID',NULL,'ROOT'),
  (9,'REUSED-ID-1',NULL,'ROOT'),
  (9,'REUSED-ID-2',NULL,'ROOT'),
  (E'\t','WHITESPACE-ID',NULL,'ROOT');
-- Show the old prefix selection can choose a sibling for an absent exact ID.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.orders WHERE "orderId" ILIKE 'BOOK-%' LIMIT 1)
    OR EXISTS(SELECT 1 FROM public.orders WHERE "orderId" = 'BOOK-') THEN
   RAISE EXCEPTION 'prefix reproduction fixture failed';
 END IF;
END $$;
SQL
psql -X -v ON_ERROR_STOP=1 -q -f "$repo_root/database/20261028000000_lhl_strict_book_identity.sql"
psql -X -v ON_ERROR_STOP=1 -q -f "$repo_root/database/20261028000000_lhl_strict_book_identity.sql"
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE ROLE unexpected_role NOLOGIN;
GRANT EXECUTE ON FUNCTION public.lhl_strict_book_identity(text) TO unexpected_role;
SQL
if psql -X -v ON_ERROR_STOP=1 -q -f "$repo_root/database/20261028000000_lhl_strict_book_identity.sql" >"$pg_test_dir/unexpected-grant.log" 2>&1; then
  printf 'migration accepted an unexpected function grant\n' >&2
  exit 1
fi
if ! grep -q 'Unexpected strict book identity function privilege' "$pg_test_dir/unexpected-grant.log"; then
  cat "$pg_test_dir/unexpected-grant.log" >&2
  exit 1
fi
psql -X -v ON_ERROR_STOP=1 -q -c 'REVOKE ALL ON FUNCTION public.lhl_strict_book_identity(text) FROM unexpected_role'
psql -X -v ON_ERROR_STOP=1 -q -c 'GRANT service_role TO unexpected_role'
if psql -X -v ON_ERROR_STOP=1 -q -f "$repo_root/database/20261028000000_lhl_strict_book_identity.sql" >"$pg_test_dir/unexpected-member.log" 2>&1; then
  printf 'migration accepted inherited function access\n' >&2
  exit 1
fi
if ! grep -q 'Unexpected strict book identity function privilege' "$pg_test_dir/unexpected-member.log"; then
  cat "$pg_test_dir/unexpected-member.log" >&2
  exit 1
fi
psql -X -v ON_ERROR_STOP=1 -q -c 'REVOKE service_role FROM unexpected_role'
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$
DECLARE actual jsonb;
BEGIN
  actual := public.lhl_strict_book_identity('BOOK-A');
  IF actual->>'status' <> 'found' OR actual->'row'->>'id' <> '1' THEN RAISE EXCEPTION 'exact match: %',actual; END IF;
  IF public.lhl_strict_book_identity('BOOK-')->>'status' <> 'absent' THEN RAISE EXCEPTION 'prefix matched'; END IF;
  IF public.lhl_strict_book_identity('ROOT')->>'status' <> 'absent' THEN RAISE EXCEPTION 'root matched'; END IF;
  IF public.lhl_strict_book_identity('book-a')->>'status' <> 'absent' THEN RAISE EXCEPTION 'case folded'; END IF;
  IF public.lhl_strict_book_identity('BOOK-C')->>'status' <> 'ambiguous' OR public.lhl_strict_book_identity('DIFFERENT')->>'status' <> 'ambiguous' THEN RAISE EXCEPTION 'contradictory row accepted'; END IF;
  IF public.lhl_strict_book_identity('REUSED-ID-1')->>'status' <> 'ambiguous' THEN RAISE EXCEPTION 'reused row id accepted'; END IF;
  IF public.lhl_strict_book_identity('DUPLICATE')->>'status' <> 'ambiguous' THEN RAISE EXCEPTION 'duplicate row accepted'; END IF;
  IF public.lhl_strict_book_identity('SNAKE')->>'status' <> 'found' THEN RAISE EXCEPTION 'snake alias lost'; END IF;
  IF public.lhl_strict_book_identity('BIG-ID')->'row'->>'id' <> '9007199254740993' OR jsonb_typeof(public.lhl_strict_book_identity('BIG-ID')->'row'->'id') <> 'string' THEN RAISE EXCEPTION 'large row id lost precision'; END IF;
  IF public.lhl_strict_book_identity('WHITESPACE-ID')->>'status' <> 'ambiguous' THEN RAISE EXCEPTION 'whitespace row id accepted'; END IF;
  IF public.lhl_strict_book_identity('NULL-ID')->>'status' <> 'ambiguous' THEN RAISE EXCEPTION 'missing row id accepted'; END IF;
  IF public.lhl_strict_book_identity(E'\tBOOK-A')->>'status' <> 'invalid_input' OR public.lhl_strict_book_identity(U&'\00A0BOOK-A')->>'status' <> 'invalid_input' OR public.lhl_strict_book_identity(U&'\FEFFBOOK-A')->>'status' <> 'invalid_input' OR public.lhl_strict_book_identity(' BOOK-A')->>'status' <> 'invalid_input' OR public.lhl_strict_book_identity(NULL)->>'status' <> 'invalid_input' THEN RAISE EXCEPTION 'invalid input accepted'; END IF;
  IF has_function_privilege('anon','public.lhl_strict_book_identity(text)','EXECUTE') OR has_function_privilege('authenticated','public.lhl_strict_book_identity(text)','EXECUTE') OR NOT has_function_privilege('service_role','public.lhl_strict_book_identity(text)','EXECUTE') THEN RAISE EXCEPTION 'incorrect grants'; END IF;
END $$;
SET ROLE service_role;
DO $$ BEGIN IF public.lhl_strict_book_identity('BOOK-A')->>'status' <> 'found' THEN RAISE EXCEPTION 'service role cannot read'; END IF; END $$;
RESET ROLE;
-- Permission inherited through a group role still obeys the RLS visibility hold.
CREATE ROLE order_reader NOLOGIN;
GRANT SELECT ON public.orders TO order_reader;
REVOKE SELECT ON public.orders FROM service_role;
GRANT order_reader TO service_role;
SET ROLE service_role;
DO $$ BEGIN IF public.lhl_strict_book_identity('BOOK-A')->>'status' <> 'found' THEN RAISE EXCEPTION 'inherited reader access failed'; END IF; END $$;
RESET ROLE;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY visible_only_one ON public.orders FOR SELECT TO order_reader USING ("orderId" IN ('BOOK-A', 'DUPLICATE'));
SET ROLE service_role;
DO $$ BEGIN
  IF public.lhl_strict_book_identity('DUPLICATE')->>'status' <> 'schema_unavailable' THEN RAISE EXCEPTION 'RLS hid duplicate'; END IF;
  IF public.lhl_strict_book_identity('SNAKE')->>'status' <> 'schema_unavailable' THEN RAISE EXCEPTION 'RLS hid row'; END IF;
  IF public.lhl_strict_book_identity('BOOK-A')->>'status' <> 'schema_unavailable' THEN RAISE EXCEPTION 'RLS visible row falsely accepted'; END IF;
END $$;
RESET ROLE;
DROP POLICY visible_only_one ON public.orders;
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
SET ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.lhl_strict_book_identity('BOOK-A');
    RAISE EXCEPTION 'anon unexpectedly executed RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.lhl_strict_book_identity('BOOK-A');
    RAISE EXCEPTION 'authenticated unexpectedly executed RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
DELETE FROM public.orders WHERE "orderId" = 'WHITESPACE-ID';
ALTER TABLE public.orders ALTER COLUMN id TYPE bigint USING id::bigint;
DO $$ BEGIN
  IF public.lhl_strict_book_identity('BIG-ID')->'row'->>'id' <> '9007199254740993'
     OR jsonb_typeof(public.lhl_strict_book_identity('BIG-ID')->'row'->'id') <> 'string'
  THEN RAISE EXCEPTION 'numeric bigint row id lost precision'; END IF;
END $$;
ALTER TABLE public.orders DROP COLUMN "orderId";
DO $$ BEGIN IF public.lhl_strict_book_identity('SNAKE')->>'status' <> 'found' THEN RAISE EXCEPTION 'one supported alias should work'; END IF; END $$;
ALTER TABLE public.orders DROP COLUMN order_id;
DO $$ BEGIN IF public.lhl_strict_book_identity('SNAKE')->>'status' <> 'schema_unavailable' THEN RAISE EXCEPTION 'absent schema returned as no row'; END IF; END $$;
ALTER TABLE public.orders ADD COLUMN order_id integer;
DO $$ BEGIN IF public.lhl_strict_book_identity('1')->>'status' <> 'schema_unavailable' THEN RAISE EXCEPTION 'unsupported alias type accepted'; END IF; END $$;
ALTER TABLE public.orders DROP COLUMN order_id;
ALTER TABLE public.orders ADD COLUMN order_id text;
ALTER TABLE public.orders DROP COLUMN id;
DO $$ BEGIN IF public.lhl_strict_book_identity('SNAKE')->>'status' <> 'schema_unavailable' THEN RAISE EXCEPTION 'missing id accepted'; END IF; END $$;
SQL
printf 'strict book identity PostgreSQL tests passed\n'
