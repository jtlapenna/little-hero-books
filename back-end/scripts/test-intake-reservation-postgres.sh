#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
pg_test_dir="$(mktemp -d "${TMPDIR:-/tmp}/lhl-reservation.XXXXXXXX")"
cleanup() { pg_ctl -D "$pg_test_dir/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$pg_test_dir"; }
trap cleanup EXIT
initdb -D "$pg_test_dir/data" -A trust -U postgres >/dev/null
pg_ctl -D "$pg_test_dir/data" -o "-c listen_addresses='' -c unix_socket_directories='$pg_test_dir'" -w start >/dev/null
export PGHOST="$pg_test_dir" PGUSER=postgres PGDATABASE=postgres
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE unexpected_role NOLOGIN;
SQL
# Reproduce the missing primitive before applying the migration.
if psql -X -v ON_ERROR_STOP=1 -q -c "SELECT public.lhl_reserve_intake_intent('x','{}'::jsonb)" >"$pg_test_dir/before" 2>&1; then
  printf 'primitive unexpectedly existed before migration\n' >&2; exit 1
fi
if ! grep -q 'does not exist' "$pg_test_dir/before"; then cat "$pg_test_dir/before" >&2; exit 1; fi
# Unexpected default table privileges must fail the transaction.
psql -X -v ON_ERROR_STOP=1 -q -c 'ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO unexpected_role'
if psql -X -v ON_ERROR_STOP=1 -q -f "$repo_root/database/20261028000001_lhl_intake_reservation.sql" >"$pg_test_dir/default-acl" 2>&1; then
  printf 'migration accepted default table privileges\n' >&2; exit 1
fi
if ! grep -q 'Unexpected intake reservation function privilege' "$pg_test_dir/default-acl"; then cat "$pg_test_dir/default-acl" >&2; exit 1; fi
psql -X -v ON_ERROR_STOP=1 -q -c 'ALTER DEFAULT PRIVILEGES REVOKE SELECT ON TABLES FROM unexpected_role'
# Ownership inheritance must fail before the schema or table can be used.
psql -X -v ON_ERROR_STOP=1 -q -c 'GRANT postgres TO service_role'
if psql -X -v ON_ERROR_STOP=1 -q -f "$repo_root/database/20261028000001_lhl_intake_reservation.sql" >"$pg_test_dir/owner-acl" 2>&1; then
  printf 'migration accepted service membership in owner role\n' >&2; exit 1
fi
if ! grep -q 'Unexpected intake reservation function privilege' "$pg_test_dir/owner-acl"; then cat "$pg_test_dir/owner-acl" >&2; exit 1; fi
psql -X -v ON_ERROR_STOP=1 -q -c 'REVOKE postgres FROM service_role'
# A role that can SET ROLE to service_role must also be rejected.
psql -X -v ON_ERROR_STOP=1 -q -c 'ALTER ROLE unexpected_role NOINHERIT'
psql -X -v ON_ERROR_STOP=1 -q -c 'GRANT service_role TO unexpected_role'
if psql -X -v ON_ERROR_STOP=1 -q -f "$repo_root/database/20261028000001_lhl_intake_reservation.sql" >"$pg_test_dir/member-acl" 2>&1; then
  printf 'migration accepted service-role membership\n' >&2; exit 1
fi
if ! grep -q 'Unexpected intake reservation function privilege' "$pg_test_dir/member-acl"; then cat "$pg_test_dir/member-acl" >&2; exit 1; fi
psql -X -v ON_ERROR_STOP=1 -q -c 'REVOKE service_role FROM unexpected_role'
psql -X -v ON_ERROR_STOP=1 -q -f "$repo_root/database/20261028000001_lhl_intake_reservation.sql"
# Existing objects cause the migration to stop, never silently adopt them.
if psql -X -v ON_ERROR_STOP=1 -q -f "$repo_root/database/20261028000001_lhl_intake_reservation.sql" >"$pg_test_dir/existing" 2>&1; then
  printf 'migration adopted existing schema\n' >&2; exit 1
fi
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$ BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='lhl_intake_reservation_private.intake_reservations'::regclass) THEN RAISE EXCEPTION 'RLS disabled'; END IF;
 IF has_schema_privilege('service_role','lhl_intake_reservation_private','USAGE') OR has_table_privilege('service_role','lhl_intake_reservation_private.intake_reservations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN RAISE EXCEPTION 'direct access'; END IF;
 IF has_function_privilege('anon','public.lhl_reserve_intake_intent(text,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.lhl_reserve_intake_intent(text,jsonb)','EXECUTE') OR NOT has_function_privilege('service_role','public.lhl_reserve_intake_intent(text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'invalid function grants'; END IF;
END $$;
SET ROLE service_role;
DO $$
DECLARE i jsonb := '{"source":"web","source_operation":"session","source_item":"item1","selection":{"name":"A"},"config":{"v":1},"eligibility":"paid"}';
BEGIN
 IF public.lhl_reserve_intake_intent('A', i) <> 'new_pending_hold' THEN RAISE EXCEPTION 'new'; END IF;
 IF public.lhl_reserve_intake_intent('A', i) <> 'existing_unknown_hold' THEN RAISE EXCEPTION 'retry'; END IF;
 IF public.lhl_reserve_intake_intent('A', i || '{"extra":1}'::jsonb) <> 'conflict_hold' THEN RAISE EXCEPTION 'changed intent'; END IF;
 IF public.lhl_reserve_intake_intent('B', i || '{"source_item":"item2"}'::jsonb) <> 'new_pending_hold' THEN RAISE EXCEPTION 'sibling'; END IF;
 IF public.lhl_reserve_intake_intent('C', i - 'selection') <> 'invalid_hold' THEN RAISE EXCEPTION 'missing field'; END IF;
 IF public.lhl_reserve_intake_intent(U&'\00A0C', i) <> 'invalid_hold' THEN RAISE EXCEPTION 'unicode space'; END IF;
 IF public.lhl_reserve_intake_intent(' C', i) <> 'invalid_hold' THEN RAISE EXCEPTION 'space'; END IF;
 BEGIN PERFORM * FROM lhl_intake_reservation_private.intake_reservations; RAISE EXCEPTION 'read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN BEGIN PERFORM public.lhl_reserve_intake_intent('bad','{}'); RAISE EXCEPTION 'anon allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN BEGIN PERFORM public.lhl_reserve_intake_intent('bad','{}'); RAISE EXCEPTION 'authenticated allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
DO $$ BEGIN
 BEGIN UPDATE lhl_intake_reservation_private.intake_reservations SET intent='{}' WHERE book_key='A'; RAISE EXCEPTION 'update allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'intake reservations are immutable' THEN RAISE; END IF; END;
 BEGIN DELETE FROM lhl_intake_reservation_private.intake_reservations WHERE book_key='A'; RAISE EXCEPTION 'delete allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'intake reservations are immutable' THEN RAISE; END IF; END;
 BEGIN TRUNCATE lhl_intake_reservation_private.intake_reservations; RAISE EXCEPTION 'truncate allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'intake reservations are immutable' THEN RAISE; END IF; END;
END $$;
BEGIN;
SELECT public.lhl_reserve_intake_intent('ROLLBACK','{"source":"web","source_operation":"s","source_item":"i","selection":{},"config":{},"eligibility":"paid"}');
ROLLBACK;
DO $$ BEGIN IF public.lhl_reserve_intake_intent('ROLLBACK','{"source":"web","source_operation":"s","source_item":"i","selection":{},"config":{},"eligibility":"paid"}') <> 'new_pending_hold' THEN RAISE EXCEPTION 'rollback left reservation'; END IF; END $$;
SQL
# Start independent sessions concurrently. Each call is one transaction.
intent='{"source":"web","source_operation":"s","source_item":"i","selection":{},"config":{},"eligibility":"paid"}'
other='{"source":"web","source_operation":"s","source_item":"i","selection":{"changed":true},"config":{},"eligibility":"paid"}'
for pair in same conflict; do
  right="$intent"; [ "$pair" = same ] || right="$other"
  psql -X -v ON_ERROR_STOP=1 -Atq -c "SET ROLE service_role; SELECT public.lhl_reserve_intake_intent('$pair', '$intent'::jsonb)" >"$pg_test_dir/$pair.1" & first=$!
  psql -X -v ON_ERROR_STOP=1 -Atq -c "SET ROLE service_role; SELECT public.lhl_reserve_intake_intent('$pair', '$right'::jsonb)" >"$pg_test_dir/$pair.2" & second=$!
  wait "$first"; wait "$second"
  actual="$(cat "$pg_test_dir/$pair.1" "$pg_test_dir/$pair.2" | sort)"
  expected="$(printf 'new_pending_hold\n%s\n' "$([ "$pair" = same ] && printf existing_unknown_hold || printf conflict_hold)" | sort)"
  [ "$actual" = "$expected" ] || { printf '%s: unexpected concurrent result %s\n' "$pair" "$actual" >&2; exit 1; }
done
# Force each competing session to encounter an uncommitted reservation.
for pair in locked-same locked-conflict; do
  right="$intent"; [ "$pair" = locked-same ] || right="$other"
  rm -f "$pg_test_dir/inserted"
  psql -X -v ON_ERROR_STOP=1 -Atq >"$pg_test_dir/$pair.locked.1" <<SQL &
BEGIN;
SET ROLE service_role;
SELECT public.lhl_reserve_intake_intent('$pair', '$intent'::jsonb);
\! touch "$pg_test_dir/inserted"
SELECT pg_sleep(2);
COMMIT;
SQL
  first=$!
  for unused in {1..100}; do [ -e "$pg_test_dir/inserted" ] && break; sleep 0.02; done
  [ -e "$pg_test_dir/inserted" ] || { printf 'first transaction did not start\n' >&2; exit 1; }
  psql -X -v ON_ERROR_STOP=1 -Atq -c "SET ROLE service_role; SET lock_timeout='200ms'; SELECT public.lhl_reserve_intake_intent('$pair', '$right'::jsonb)" >"$pg_test_dir/$pair.locked.2" 2>&1 && { printf 'concurrent reservation did not block\n' >&2; exit 1; }
  if ! grep -q 'lock timeout' "$pg_test_dir/$pair.locked.2"; then cat "$pg_test_dir/$pair.locked.2" >&2; exit 1; fi
  wait "$first"
  locked_retry="$(psql -X -v ON_ERROR_STOP=1 -Atq -c "SET ROLE service_role; SELECT public.lhl_reserve_intake_intent('$pair', '$right'::jsonb)")"
  expected=existing_unknown_hold; [ "$pair" = locked-same ] || expected=conflict_hold
  [ "$locked_retry" = "$expected" ] || { printf 'locked retry did not hold\n' >&2; exit 1; }
done
# Simulate a committed reservation whose acknowledgement was lost.
psql -X -v ON_ERROR_STOP=1 -Atq -c "SET ROLE service_role; SELECT public.lhl_reserve_intake_intent('lost-ack', '$intent'::jsonb)" > /dev/null
lost_result="$(psql -X -v ON_ERROR_STOP=1 -Atq -c "SET ROLE service_role; SELECT public.lhl_reserve_intake_intent('lost-ack', '$intent'::jsonb)")"
[ "$lost_result" = existing_unknown_hold ] || { printf 'lost acknowledgement did not hold\n' >&2; exit 1; }
printf 'intake reservation PostgreSQL tests passed\n' 
