-- Fix order execution_status to ready_for_processing so router cron can pick it up
-- Run this in Supabase SQL Editor

UPDATE orders
SET
  execution_status = 'ready_for_processing',
  current_workflow = NULL,
  started_at = NULL,
  error_message = NULL,
  error_type = NULL,
  retry_count = 0,
  next_retry_at = NULL,
  last_error_at = NULL,
  queued_at = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP
WHERE amazon_order_id = '111-0060602-1283417'
  AND execution_status = 'processing';

-- Verify the update
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  current_workflow,
  started_at,
  queued_at,
  updated_at
FROM orders
WHERE amazon_order_id = '111-0060602-1283417';

