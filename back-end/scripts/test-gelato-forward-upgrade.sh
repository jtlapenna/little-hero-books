#!/usr/bin/env bash
set -euo pipefail
# Called only by the disposable PostgreSQL harness, never against hosted data.
task_root=$1
task_pg_bin=$2
task_pg_dir=$3
task_legacy_base=ad3074d708f926264a4bb6636fd2d45e33b4c56e
task_legacy_psql=("$task_pg_bin/psql" -h "$task_pg_dir" -p 55439 -d gelato_legacy_upgrade -v ON_ERROR_STOP=1)
"$task_pg_bin/psql" -h "$task_pg_dir" -p 55439 -d postgres -v ON_ERROR_STOP=1 -q -c 'CREATE DATABASE gelato_legacy_upgrade'
git -C "$task_root" show "$task_legacy_base:database/migration-print-provider-fields.sql" >"$task_pg_dir/legacy-schema.sql"
git -C "$task_root" show "$task_legacy_base:back-end/scripts/test-gelato-print-submissions.sql" >"$task_pg_dir/legacy-cases.sql"
git -C "$task_root" show "$task_legacy_base:back-end/scripts/test-gelato-engineering-conversion.sql" >"$task_pg_dir/test-gelato-engineering-conversion.sql"
"${task_legacy_psql[@]}" -q >"$task_pg_dir/legacy-upgrade.log" 2>&1 <<'SQL'
CREATE TABLE public.orders(id bigserial PRIMARY KEY,"orderId" text NOT NULL UNIQUE,root_order_id text,amazon_order_id text,book_id text,book_specs jsonb,product_info jsonb,one_manifest_url text,created_at timestamptz DEFAULT now(),execution_status text,next_workflow text,current_workflow text,started_at timestamptz,shipping_address jsonb);
INSERT INTO public.orders(id,"orderId",book_id,book_specs,one_manifest_url,execution_status,next_workflow) VALUES
(1,'LEGACY-TOP','book-finding-our-inner-voice',NULL,NULL,'ready_for_processing','4'),
(2,'LEGACY-NESTED',NULL,'{"bookId":"book-finding-our-inner-voice"}',NULL,'ready_for_processing','4'),
(3,'LEGACY-URL',NULL,NULL,'https://synthetic.r2.dev/book-mvp-simple-adventure/orders/LEGACY-URL/manifests/1-manifest.json','ready_for_processing','4'),
(4,'LEGACY-CONFLICT','book-finding-our-inner-voice','{"bookId":"other-book"}',NULL,'ready_for_processing','4');
SELECT setval('public.orders_id_seq',100);
GRANT SELECT ON public.orders TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;
SQL
for task_migration in "$task_pg_dir/legacy-schema.sql" "$task_root/database/migration-gelato-engineering-notification-suppression.sql" "$task_root/database/migration-gelato-scoped-engineering-windows.sql" "$task_root/database/migration-gelato-engineering-conversions.sql" "$task_pg_dir/legacy-cases.sql"; do
 "${task_legacy_psql[@]}" -f "$task_migration" >>"$task_pg_dir/legacy-upgrade.log" 2>&1 || { tail -20 "$task_pg_dir/legacy-upgrade.log";exit 1; }
done
"${task_legacy_psql[@]}" -q >>"$task_pg_dir/legacy-upgrade.log" 2>&1 <<'SQL'
CREATE TABLE public.test_legacy_rows AS SELECT 'submissions' AS kind,jsonb_agg(to_jsonb(s) ORDER BY id) AS saved FROM public.print_provider_submissions s
 UNION ALL SELECT 'roots',jsonb_agg(to_jsonb(s) ORDER BY submission_id,provider_order_id) FROM public.print_provider_submission_orders s
 UNION ALL SELECT 'items',jsonb_agg(to_jsonb(s) ORDER BY submission_id,item_reference_id) FROM public.print_provider_submission_items s
 UNION ALL SELECT 'notifications',jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.print_provider_submission_notifications s;
SQL
for task_iteration in 1 2; do
 for task_migration in 20261017200507_gelato_scheduled_status.sql 20261017201742_gelato_financial_observations.sql; do
  "${task_legacy_psql[@]}" -f "$task_root/database/$task_migration" >>"$task_pg_dir/legacy-upgrade.log" 2>&1 || { tail -20 "$task_pg_dir/legacy-upgrade.log";exit 1; }
 done
done
"${task_legacy_psql[@]}" -q >>"$task_pg_dir/legacy-upgrade.log" 2>&1 <<'SQL'
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.gelato_scheduled_status) THEN RAISE EXCEPTION 'Upgrade enrolled legacy work';END IF;
 IF EXISTS(SELECT 1 FROM public.print_provider_submission_orders WHERE observation_revision<>0 OR financial_observation IS NOT NULL OR financial_observed_at IS NOT NULL OR financial_action_reason IS NOT NULL) THEN RAISE EXCEPTION 'Upgrade fabricated financial evidence';END IF;
 IF EXISTS(SELECT 1 FROM public.test_legacy_rows b JOIN (
 SELECT 'submissions' AS kind,jsonb_agg(to_jsonb(s) ORDER BY id) AS saved FROM public.print_provider_submissions s
 UNION ALL SELECT 'roots',jsonb_agg(to_jsonb(s)-ARRAY['observation_revision','financial_observation','financial_observed_at','financial_action_reason'] ORDER BY submission_id,provider_order_id) FROM public.print_provider_submission_orders s
 UNION ALL SELECT 'items',jsonb_agg(to_jsonb(s) ORDER BY submission_id,item_reference_id) FROM public.print_provider_submission_items s
 UNION ALL SELECT 'notifications',jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.print_provider_submission_notifications s
 ) a USING(kind) WHERE a.saved IS DISTINCT FROM b.saved) THEN RAISE EXCEPTION 'Upgrade modified historical evidence';END IF;
END $$;
SQL
echo 'Historical ad3074d7 schema + populated cases -> forward migrations twice: historical rows unchanged, empty cohort, financial evidence unknown'
