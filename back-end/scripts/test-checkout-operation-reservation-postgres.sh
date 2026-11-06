#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"
pg_test_dir="$(mktemp -d "${TMPDIR:-/tmp}/lhl-checkout-reservation.XXXXXXXX")"
cleanup() {
  pg_ctl -D "$pg_test_dir/data" -m immediate stop >/dev/null 2>&1 || true
  python3 -c 'import shutil,sys; shutil.rmtree(sys.argv[1])' "$pg_test_dir"
}
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
if psql -X -v ON_ERROR_STOP=1 -q -c "SELECT public.lhl_reserve_checkout_operation('website_checkout',decode(repeat('01',32),'hex'),decode(repeat('02',32),'hex'),decode(repeat('03',32),'hex'),2)" >"$pg_test_dir/before" 2>&1; then
  printf 'primitive unexpectedly existed before migration\n' >&2; exit 1
fi
grep -q 'does not exist' "$pg_test_dir/before"
psql -X -v ON_ERROR_STOP=1 -q -c 'ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO unexpected_role'
if psql -X -v ON_ERROR_STOP=1 -q -f "$repo_root/database/20261028000002_lhl_checkout_operation_reservation.sql" >"$pg_test_dir/acl" 2>&1; then
  printf 'migration accepted unexpected table privilege\n' >&2; exit 1
fi
grep -q 'Unexpected checkout reservation privilege' "$pg_test_dir/acl"
psql -X -v ON_ERROR_STOP=1 -q -c 'ALTER DEFAULT PRIVILEGES REVOKE SELECT ON TABLES FROM unexpected_role'
psql -X -v ON_ERROR_STOP=1 -q -c 'GRANT service_role TO unexpected_role'
if psql -X -v ON_ERROR_STOP=1 -q -f "$repo_root/database/20261028000002_lhl_checkout_operation_reservation.sql" >"$pg_test_dir/member" 2>&1; then
  printf 'migration accepted service role membership\n' >&2; exit 1
fi
grep -q 'Unexpected checkout reservation privilege' "$pg_test_dir/member"
psql -X -v ON_ERROR_STOP=1 -q -c 'REVOKE service_role FROM unexpected_role'
psql -X -v ON_ERROR_STOP=1 -q -f "$repo_root/database/20261028000002_lhl_checkout_operation_reservation.sql"
if psql -X -v ON_ERROR_STOP=1 -q -f "$repo_root/database/20261028000002_lhl_checkout_operation_reservation.sql" >"$pg_test_dir/existing" 2>&1; then
  printf 'migration silently adopted existing objects\n' >&2; exit 1
fi
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$ BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='lhl_checkout_reservation_private.operations'::regclass) THEN RAISE EXCEPTION 'RLS disabled'; END IF;
 IF has_schema_privilege('service_role','lhl_checkout_reservation_private','USAGE') OR has_table_privilege('service_role','lhl_checkout_reservation_private.operations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN RAISE EXCEPTION 'direct access'; END IF;
 IF has_function_privilege('anon','public.lhl_reserve_checkout_operation(text,bytea,bytea,bytea,integer)','EXECUTE') OR has_function_privilege('authenticated','public.lhl_reserve_checkout_operation(text,bytea,bytea,bytea,integer)','EXECUTE') OR NOT has_function_privilege('service_role','public.lhl_reserve_checkout_operation(text,bytea,bytea,bytea,integer)','EXECUTE') THEN RAISE EXCEPTION 'function grants'; END IF;
END $$;
SET ROLE service_role;
DO $$
DECLARE a record; b record; c record;
DECLARE cap bytea := decode(repeat('01',32),'hex');
DECLARE m bytea := decode(repeat('02',32),'hex');
DECLARE members bytea := decode(repeat('03',32),'hex');
BEGIN
 SELECT * INTO a FROM public.lhl_reserve_checkout_operation('website_checkout',cap,m,members,2);
 SELECT * INTO b FROM public.lhl_reserve_checkout_operation('website_checkout',cap,m,members,2);
 IF a.outcome <> 'new_pending_hold' OR b.outcome <> 'existing_unknown_hold' OR a.operation_id <> b.operation_id OR a.root_id <> b.root_id OR a.member_ids <> b.member_ids OR cardinality(a.member_ids) <> 2 OR a.member_ids[1] = a.member_ids[2] THEN RAISE EXCEPTION 'matching retry'; END IF;
 SELECT * INTO c FROM public.lhl_reserve_checkout_operation('website_checkout',cap,decode(repeat('04',32),'hex'),members,2);
 IF c.outcome <> 'conflict_hold' OR c.operation_id IS NOT NULL THEN RAISE EXCEPTION 'input conflict'; END IF;
 SELECT * INTO c FROM public.lhl_reserve_checkout_operation('website_checkout',cap,m,decode(repeat('04',32),'hex'),2);
 IF c.outcome <> 'conflict_hold' THEN RAISE EXCEPTION 'membership conflict'; END IF;
 SELECT * INTO c FROM public.lhl_reserve_checkout_operation('website_checkout',cap,m,members,1);
 IF c.outcome <> 'conflict_hold' THEN RAISE EXCEPTION 'member count conflict'; END IF;
 SELECT * INTO c FROM public.lhl_reserve_checkout_operation('website_checkout',decode(repeat('09',32),'hex'),m,members,2);
 IF c.outcome <> 'new_pending_hold' OR c.operation_id = a.operation_id OR c.root_id = a.root_id OR c.member_ids = a.member_ids THEN RAISE EXCEPTION 'distinct capability'; END IF;
 SELECT * INTO c FROM public.lhl_reserve_checkout_operation('website_checkout',NULL,m,members,2);
 IF c.outcome <> 'invalid_hold' THEN RAISE EXCEPTION 'null capability'; END IF;
 SELECT * INTO c FROM public.lhl_reserve_checkout_operation('website_checkout',cap,m,members,101);
 IF c.outcome <> 'invalid_hold' THEN RAISE EXCEPTION 'invalid member count'; END IF;
 BEGIN PERFORM * FROM lhl_checkout_reservation_private.operations; RAISE EXCEPTION 'direct read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN BEGIN PERFORM public.lhl_reserve_checkout_operation('website_checkout',NULL,NULL,NULL,1); RAISE EXCEPTION 'anon allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN BEGIN PERFORM public.lhl_reserve_checkout_operation('website_checkout',NULL,NULL,NULL,1); RAISE EXCEPTION 'authenticated allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
DO $$ BEGIN
 BEGIN UPDATE lhl_checkout_reservation_private.operations SET input_mac=decode(repeat('00',32),'hex'); RAISE EXCEPTION 'update allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'checkout reservations are immutable' THEN RAISE; END IF; END;
 BEGIN DELETE FROM lhl_checkout_reservation_private.operations; RAISE EXCEPTION 'delete allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'checkout reservations are immutable' THEN RAISE; END IF; END;
 BEGIN TRUNCATE lhl_checkout_reservation_private.operations; RAISE EXCEPTION 'truncate allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'checkout reservations are immutable' THEN RAISE; END IF; END;
END $$;
BEGIN;
SELECT * FROM public.lhl_reserve_checkout_operation('website_checkout',decode(repeat('10',32),'hex'),decode(repeat('02',32),'hex'),decode(repeat('03',32),'hex'),1);
ROLLBACK;
DO $$ DECLARE result text; BEGIN SELECT outcome INTO result FROM public.lhl_reserve_checkout_operation('website_checkout',decode(repeat('10',32),'hex'),decode(repeat('02',32),'hex'),decode(repeat('03',32),'hex'),1); IF result <> 'new_pending_hold' THEN RAISE EXCEPTION 'rollback persisted'; END IF; END $$;
SQL
for pair in same conflict; do
  cap=11; [ "$pair" = same ] || cap=12
  right=02; [ "$pair" = same ] || right=04
  psql -X -v ON_ERROR_STOP=1 -Atq -c "SET ROLE service_role; SELECT outcome FROM public.lhl_reserve_checkout_operation('website_checkout',decode(repeat('$cap',32),'hex'),decode(repeat('02',32),'hex'),decode(repeat('03',32),'hex'),2)" >"$pg_test_dir/$pair.1" & first=$!
  psql -X -v ON_ERROR_STOP=1 -Atq -c "SET ROLE service_role; SELECT outcome FROM public.lhl_reserve_checkout_operation('website_checkout',decode(repeat('$cap',32),'hex'),decode(repeat('$right',32),'hex'),decode(repeat('03',32),'hex'),2)" >"$pg_test_dir/$pair.2" & second=$!
  wait "$first"; wait "$second"
  actual="$(cat "$pg_test_dir/$pair.1" "$pg_test_dir/$pair.2" | sort)"
  expected="$(printf 'new_pending_hold\n%s\n' "$([ "$pair" = same ] && printf existing_unknown_hold || printf conflict_hold)" | sort)"
  [ "$actual" = "$expected" ] || { printf '%s: unexpected result %s\n' "$pair" "$actual" >&2; exit 1; }
done
# Compare database membership with the real checkout sibling-ID helper.
for count in 1 2 100; do
  CHECKOUT_RESULT="$(psql -X -v ON_ERROR_STOP=1 -Atq -c "SET ROLE service_role; SELECT row_to_json(r) FROM public.lhl_reserve_checkout_operation('website_checkout',decode(lpad(to_hex($count),64,'0'),'hex'),decode(repeat('02',32),'hex'),decode(repeat('03',32),'hex'),$count) r")" CHECKOUT_COUNT="$count" \
    node --import "$repo_root/back-end/node_modules/tsx/dist/loader.mjs" --input-type=module -e '
      import assert from "node:assert/strict";
      import helpers from "./back-end/src/lib/sibling-order-helpers.ts";
      const { buildSiblingOrderId } = helpers;
      const r = JSON.parse(process.env.CHECKOUT_RESULT);
      const count = Number(process.env.CHECKOUT_COUNT);
      const expected = Array.from({length: count}, (_, i) => count === 1 ? r.root_id : buildSiblingOrderId(r.root_id, String(i + 1)));
      assert.deepEqual(r.member_ids, expected);
    '
done
# Hold an insertion open and verify the competing transaction cannot decide
# until the first commits. Retry must observe its committed binding.
for pair in locked-same locked-conflict; do
  cap=15; [ "$pair" = locked-same ] || cap=16
  right=02; [ "$pair" = locked-same ] || right=04
  marker="$pg_test_dir/$pair.ready"
  psql -X -v ON_ERROR_STOP=1 -Atq >"$pg_test_dir/$pair.first" <<SQL &
BEGIN;
SET ROLE service_role;
SELECT outcome FROM public.lhl_reserve_checkout_operation('website_checkout',decode(repeat('$cap',32),'hex'),decode(repeat('02',32),'hex'),decode(repeat('03',32),'hex'),2);
\! touch "$marker"
SELECT pg_sleep(2);
COMMIT;
SQL
  first=$!
  for unused in {1..100}; do [ -e "$marker" ] && break; sleep 0.02; done
  [ -e "$marker" ] || { printf 'locked transaction did not start\n' >&2; exit 1; }
  attempt="SELECT outcome FROM public.lhl_reserve_checkout_operation('website_checkout',decode(repeat('$cap',32),'hex'),decode(repeat('$right',32),'hex'),decode(repeat('03',32),'hex'),2)"
  if psql -X -v ON_ERROR_STOP=1 -Atq -c "SET ROLE service_role; SET lock_timeout='200ms'; $attempt" >"$pg_test_dir/$pair.second" 2>&1; then
    printf 'competing reservation did not block\n' >&2; exit 1
  fi
  grep -q 'lock timeout' "$pg_test_dir/$pair.second"
  wait "$first"
  expected=existing_unknown_hold; [ "$pair" = locked-same ] || expected=conflict_hold
  [ "$(psql -X -v ON_ERROR_STOP=1 -Atq -c "SET ROLE service_role; $attempt")" = "$expected" ] || { printf 'locked retry mismatch\n' >&2; exit 1; }
done
# A committed result discarded by the caller remains an unknown hold.
lost="SELECT outcome FROM public.lhl_reserve_checkout_operation('website_checkout',decode(repeat('13',32),'hex'),decode(repeat('02',32),'hex'),decode(repeat('03',32),'hex'),2)"
psql -X -v ON_ERROR_STOP=1 -Atq -c "SET ROLE service_role; $lost" >/dev/null
[ "$(psql -X -v ON_ERROR_STOP=1 -Atq -c "SET ROLE service_role; $lost")" = existing_unknown_hold ]
# Terminating an uncommitted session models process death before commit.
psql -X -v ON_ERROR_STOP=1 -Atq >"$pg_test_dir/killed" 2>&1 <<SQL &
BEGIN;
SET ROLE service_role;
SELECT outcome FROM public.lhl_reserve_checkout_operation('website_checkout',decode(repeat('14',32),'hex'),decode(repeat('02',32),'hex'),decode(repeat('03',32),'hex'),2);
\! touch "$pg_test_dir/inserted"
SELECT pg_sleep(30);
COMMIT;
SQL
child=$!
for unused in {1..100}; do [ -e "$pg_test_dir/inserted" ] && break; sleep 0.02; done
[ -e "$pg_test_dir/inserted" ] || { printf 'crash transaction did not start\n' >&2; exit 1; }
backend="$(psql -X -Atq -c "SELECT pid FROM pg_stat_activity WHERE query = 'SELECT pg_sleep(30);' AND pid <> pg_backend_pid()")"
[ -n "$backend" ] || { printf 'crash backend missing\n' >&2; exit 1; }
psql -X -Atq -c "SELECT pg_terminate_backend($backend)" >/dev/null
wait "$child" || true
result="$(psql -X -v ON_ERROR_STOP=1 -Atq -c "SET ROLE service_role; SELECT outcome FROM public.lhl_reserve_checkout_operation('website_checkout',decode(repeat('14',32),'hex'),decode(repeat('02',32),'hex'),decode(repeat('03',32),'hex'),2)")"
[ "$result" = new_pending_hold ] || { printf 'crashed transaction persisted\n' >&2; exit 1; }
printf 'checkout operation reservation PostgreSQL tests passed\n'
