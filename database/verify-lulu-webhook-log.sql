-- Verify lulu_webhook_log table exists and show recent rows.
-- Run after migration-lulu-webhook-log.sql

SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'lulu_webhook_log'
) AS table_exists;

SELECT id, received_at, print_job_id, status_name, order_found, order_id, updated, error_message
FROM lulu_webhook_log
ORDER BY received_at DESC
LIMIT 20;
