-- Reset order to start from workflow 2A
-- This clears lulu fields and sets next_workflow to '2a' so the router can pick it up
-- 
-- Usage: Run this in Supabase SQL editor or via psql
-- Replace '112-7311035-1437035' with your order ID

UPDATE orders
SET 
  execution_status = 'ready_for_processing',
  next_workflow = '2a',
  lulu_job_id = NULL,              -- Clear lulu_job_id so router can pick it up
  lulu_status = NULL,               -- Clear lulu_status so router can pick it up
  current_workflow = NULL,
  started_at = NULL,
  queued_at = NOW(),
  updated_at = NOW(),
  error_message = NULL,
  error_type = NULL,
  retry_count = 0,
  next_retry_at = NULL,
  last_error_at = NULL
WHERE amazon_order_id = '112-7311035-1437035';

-- Verify the update
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  lulu_job_id,
  lulu_status,
  queued_at,
  updated_at
FROM orders
WHERE amazon_order_id = '112-7311035-1437035';
