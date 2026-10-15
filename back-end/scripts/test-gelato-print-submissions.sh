#!/usr/bin/env bash
set -euo pipefail
task_root=$(cd "$(dirname "$0")/../.." && pwd)
task_pg_bin=${GELATO_TEST_PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}
if [[ ! -x "$task_pg_bin/initdb" ]]; then
  task_pg_bin=$(dirname "$(command -v initdb)")
fi
task_pg_dir=$(mktemp -d /tmp/lhl-gelato-pg-test.XXXXXX)
task_pg_started=false
cleanup() {
  if [[ "$task_pg_started" == true ]]; then "$task_pg_bin/pg_ctl" -D "$task_pg_dir/data" -m immediate -w stop >/dev/null; fi
  rm -rf "$task_pg_dir"
}
trap cleanup EXIT
"$task_pg_bin/initdb" -D "$task_pg_dir/data" --auth=trust --no-locale >"$task_pg_dir/init.log" 2>&1
"$task_pg_bin/pg_ctl" -D "$task_pg_dir/data" -l "$task_pg_dir/server.log" -o "-k $task_pg_dir -h '' -p 55439" -w start >/dev/null
task_pg_started=true
task_psql=("$task_pg_bin/psql" -h "$task_pg_dir" -p 55439 -d postgres -v ON_ERROR_STOP=1)
"${task_psql[@]}" >"$task_pg_dir/setup.log" 2>&1 <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.orders(id bigserial PRIMARY KEY,"orderId" text NOT NULL UNIQUE,root_order_id text,amazon_order_id text,book_id text,book_specs jsonb,product_info jsonb,one_manifest_url text,created_at timestamptz DEFAULT now(),execution_status text,next_workflow text,current_workflow text,started_at timestamptz,shipping_address jsonb);
INSERT INTO public.orders(id,"orderId",book_id,book_specs,one_manifest_url,execution_status,next_workflow) VALUES
(1,'LEGACY-TOP','book-finding-our-inner-voice',NULL,NULL,'ready_for_processing','4'),
(2,'LEGACY-NESTED',NULL,'{"bookId":"book-finding-our-inner-voice"}',NULL,'ready_for_processing','4'),
(3,'LEGACY-URL',NULL,NULL,'https://synthetic.r2.dev/book-mvp-simple-adventure/orders/LEGACY-URL/manifests/1-manifest.json','ready_for_processing','4'),
(4,'LEGACY-CONFLICT','book-finding-our-inner-voice','{"bookId":"other-book"}',NULL,'ready_for_processing','4');
SELECT setval('public.orders_id_seq',100);
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;
SQL
task_schema_sql=${GELATO_TEST_PRINT_SCHEMA:-"$task_root/database/migration-print-provider-fields.sql"}
for task_iteration in 1 2; do
  if ! "${task_psql[@]}" -f "$task_schema_sql" >"$task_pg_dir/migration.log" 2>&1; then
    tail -15 "$task_pg_dir/migration.log"; exit 1
  fi
done
# Exercise forward migration idempotence as well as the fresh schema.
for task_iteration in 1 2; do
  "${task_psql[@]}" -f "$task_root/database/migration-gelato-engineering-notification-suppression.sql" >"$task_pg_dir/engineering-migration.log" 2>&1
done
"${task_psql[@]}" -f "$task_root/back-end/scripts/test-gelato-print-submissions.sql"
# Force a started engineering sender and prove the forward migration refuses it.
"${task_psql[@]}" >"$task_pg_dir/engineering-flight-setup.log" 2>&1 <<'SQL'
UPDATE public.print_provider_submission_notifications SET delivery_state='delivering',attempt_started_at=clock_timestamp(),attempt_token=gen_random_uuid()
 WHERE id=(SELECT n.id FROM public.print_provider_submission_notifications n WHERE public.gelato_submission_is_engineering_test(n.submission_id) ORDER BY n.id LIMIT 1);
SQL
if "${task_psql[@]}" -f "$task_root/database/migration-gelato-engineering-notification-suppression.sql" >"$task_pg_dir/engineering-flight-rejection.log" 2>&1; then
 echo 'Suppression migration accepted a started engineering sender'; exit 1
fi
rg -q 'Engineering notification send in flight' "$task_pg_dir/engineering-flight-rejection.log"
"${task_psql[@]}" >"$task_pg_dir/engineering-backfill-setup.log" 2>&1 <<'SQL'
-- No external sender exists in this disposable database; reconcile the simulated attempt.
UPDATE public.print_provider_submission_notifications SET delivery_state='pending',attempt_started_at=NULL
 WHERE public.gelato_submission_is_engineering_test(submission_id);
UPDATE public.print_provider_submission_notifications SET delivery_state='delivered',attempt_result='synthetic-delivered-receipt'
 WHERE id=(SELECT n.id FROM public.print_provider_submission_notifications n WHERE public.gelato_submission_is_engineering_test(n.submission_id) ORDER BY n.id LIMIT 1);
CREATE TABLE public.test_delivered_engineering_receipt AS
 SELECT id,to_jsonb(n) AS receipt FROM public.print_provider_submission_notifications n WHERE n.delivery_state='delivered' AND public.gelato_submission_is_engineering_test(n.submission_id);
SQL
"${task_psql[@]}" -f "$task_root/database/migration-gelato-engineering-notification-suppression.sql" >"$task_pg_dir/engineering-backfill.log" 2>&1
"${task_psql[@]}" >"$task_pg_dir/engineering-backfill-check.log" 2>&1 <<'SQL'
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.print_provider_submission_notifications n WHERE public.gelato_submission_is_engineering_test(n.submission_id) AND n.delivery_state NOT IN ('suppressed','delivered')) THEN
  RAISE EXCEPTION 'Legacy engineering intent not quarantined';
 END IF;
 IF EXISTS(SELECT 1 FROM public.test_delivered_engineering_receipt saved LEFT JOIN public.print_provider_submission_notifications n ON n.id=saved.id WHERE saved.receipt IS DISTINCT FROM to_jsonb(n)) THEN
  RAISE EXCEPTION 'Forward migration changed delivered evidence';
 END IF;
END $$;
SQL


"${task_psql[@]}" >"$task_pg_dir/concurrent-setup.log" 2>&1 <<'SQL'
INSERT INTO public.orders(id,"orderId",root_order_id,execution_status,next_workflow,shipping_address)
SELECT id,'TEST-' || id,'TEST-CONCURRENT','ready_for_processing','4',
  '{"name":"Test","street1":"123 Test St","city":"Test City","state":"CA","zip":"90001","country":"US"}'::jsonb
FROM unnest(ARRAY[50,51]) id;
CREATE FUNCTION public.test_print_routes() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_agg(jsonb_build_object('orderDbId',id,'orderId',"orderId",'rootOrderId',root_order_id,
    'provider','gelato','bookId','book-finding-our-inner-voice','configVersion',2,'formatId','standard',
    'productUid','synthetic-gelato-product','innerPageCount',32,'apiPageCount',32,'expectedPdfPageCount',35) ORDER BY id)
  FROM public.orders WHERE id IN (50,51);
$$;
SQL
"${task_psql[@]}" -At >"$task_pg_dir/claim-first.log" 2>&1 <<'SQL' &
BEGIN;
SELECT public.claim_gelato_print_submission(public.test_print_routes(),'concurrent-key');
SELECT pg_sleep(2);
COMMIT;
SQL
task_first_pid=$!
"${task_psql[@]}" -At >"$task_pg_dir/claim-second.log" 2>&1 <<'SQL' &
SELECT public.claim_gelato_print_submission(public.test_print_routes(),'concurrent-key');
SQL
task_second_pid=$!
wait "$task_first_pid"
wait "$task_second_pid"
task_dispatch_count=$(rg -o '"dispatch": true' "$task_pg_dir/claim-first.log" "$task_pg_dir/claim-second.log" | wc -l | tr -d ' ')
[[ "$task_dispatch_count" == 1 ]] || { echo 'Concurrent claims dispatched more than once'; exit 1; }
if "${task_psql[@]}" -c "INSERT INTO public.orders(\"orderId\",root_order_id) VALUES ('TEST-52','TEST-CONCURRENT')" >"$task_pg_dir/membership.log" 2>&1; then
  echo 'Frozen membership accepted a new child'; exit 1
fi
rg -q 'Cannot change frozen Gelato print membership' "$task_pg_dir/membership.log"
echo 'test-gelato-print-submissions concurrency: ok'

# Row-first deletion must fail fast while fencing holds the root lock.
"${task_psql[@]}" -At >"$task_pg_dir/delete-contention.log" 2>&1 <<SQL &
BEGIN;
SELECT id FROM public.orders WHERE id = 50 FOR UPDATE;
\! touch '$task_pg_dir/row-locked'
SELECT pg_sleep(2);
DELETE FROM public.orders WHERE id = 50;
COMMIT;
SQL
task_delete_pid=$!
for task_attempt in {1..50}; do
  [[ -f "$task_pg_dir/row-locked" ]] && break
  sleep 0.05
done
[[ -f "$task_pg_dir/row-locked" ]] || { echo 'Row-lock probe did not start'; exit 1; }
"${task_psql[@]}" -At >"$task_pg_dir/fence-contention.log" 2>&1 <<'SQL' &
SET statement_timeout = '5s';
SELECT public.fence_gelato_print_submission(print_submission_id,print_claim_token) FROM public.orders WHERE id=50;
SQL
task_fence_pid=$!
if wait "$task_delete_pid"; then echo 'Contended deletion unexpectedly succeeded'; exit 1; fi
wait "$task_fence_pid"
rg -q 'Gelato root busy; retry identity write' "$task_pg_dir/delete-contention.log"
"${task_psql[@]}" -At >"$task_pg_dir/post-fence.log" <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.orders WHERE id IN (50,51) AND execution_status <> 'ready_for_processing') THEN
    RAISE EXCEPTION 'Contended fence left owned rows stranded';
  END IF;
END $$;
SQL

# Two books cannot install different frozen identities for the same order.
"${task_psql[@]}" -At >"$task_pg_dir/identity-setup.log" <<'SQL'
INSERT INTO public.orders(id,"orderId",execution_status) VALUES(60,'TEST-FREEZE-RACE','done');
SQL
"${task_psql[@]}" -At >"$task_pg_dir/freeze-first.log" 2>&1 <<SQL &
BEGIN;
UPDATE public.orders SET print_provider='lulu',print_config_version=1,print_book_id='first-book',print_format_id='standard',
print_manifest_key='first-book/orders/TEST-FREEZE-RACE/manifests/1-manifest.json',one_manifest_url='first-book/orders/TEST-FREEZE-RACE/manifests/1-manifest.json' WHERE id=60;
\! touch '$task_pg_dir/identity-locked'
SELECT pg_sleep(1);
COMMIT;
SQL
task_identity_pid=$!
for task_attempt in {1..50}; do
  [[ -f "$task_pg_dir/identity-locked" ]] && break
  sleep 0.05
done
[[ -f "$task_pg_dir/identity-locked" ]] || { echo 'Identity probe did not start'; exit 1; }
if "${task_psql[@]}" -At >"$task_pg_dir/freeze-second.log" 2>&1 <<'SQL'
SET statement_timeout = '5s';
UPDATE public.orders SET print_provider='lulu',print_config_version=1,print_book_id='second-book',print_format_id='standard',
print_manifest_key='second-book/orders/TEST-FREEZE-RACE/manifests/1-manifest.json',one_manifest_url='second-book/orders/TEST-FREEZE-RACE/manifests/1-manifest.json' WHERE id=60;
SQL
then echo 'Cross-book frozen identity was overwritten'; exit 1; fi
wait "$task_identity_pid"
rg -q 'Frozen print assignment mismatch' "$task_pg_dir/freeze-second.log"
echo 'test-gelato-print-submissions row-lock and frozen-identity races: ok'
