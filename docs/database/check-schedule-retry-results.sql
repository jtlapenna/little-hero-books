-- Check if orders were properly updated by Schedule Retry node
-- This verifies that W1.2's "Schedule Retry" node successfully updated orders

-- 1. Check orders that should have been scheduled for retry
-- Look for orders with:
-- - execution_status = 'ready_for_processing' (or 'error')
-- - next_retry_at is set (not null)
-- - retry_count > 0
-- - error_type = 'workflow_timeout' (or similar)

SELECT 
  amazon_order_id,
  execution_status,
  retry_count,
  next_retry_at,
  error_type,
  error_message,
  current_workflow,
  started_at,
  updated_at,
  -- Check if next_retry_at is in the past (ready to retry)
  CASE 
    WHEN next_retry_at IS NOT NULL AND next_retry_at <= NOW() 
    THEN 'Ready for retry'
    WHEN next_retry_at IS NOT NULL AND next_retry_at > NOW()
    THEN 'Waiting for retry time'
    ELSE 'No retry scheduled'
  END as retry_status
FROM orders
WHERE retry_count > 0
  OR next_retry_at IS NOT NULL
  OR error_type = 'workflow_timeout'
ORDER BY next_retry_at ASC NULLS LAST, updated_at DESC;

-- 2. Check orders that were recently updated by Schedule Retry
-- (updated in the last hour and have retry_count set)
SELECT 
  amazon_order_id,
  execution_status,
  retry_count,
  next_retry_at,
  error_type,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 as minutes_since_update
FROM orders
WHERE updated_at > NOW() - INTERVAL '1 hour'
  AND (retry_count > 0 OR next_retry_at IS NOT NULL)
ORDER BY updated_at DESC;

-- 3. Check if any orders are ready for W1.3 to pick up
-- W1.3 looks for: execution_status='error' AND next_retry_at <= now() AND retry_count < 3
SELECT 
  amazon_order_id,
  execution_status,
  retry_count,
  next_retry_at,
  error_type,
  CASE 
    WHEN execution_status = 'error' 
         AND next_retry_at IS NOT NULL 
         AND next_retry_at <= NOW() 
         AND retry_count < 3
    THEN '✅ Ready for W1.3'
    WHEN execution_status = 'error' 
         AND next_retry_at IS NOT NULL 
         AND next_retry_at > NOW()
    THEN '⏳ Waiting for retry time'
    WHEN execution_status = 'error' 
         AND retry_count >= 3
    THEN '❌ Max retries reached'
    WHEN execution_status = 'ready_for_processing'
         AND next_retry_at IS NOT NULL
    THEN '⚠️ Status mismatch (should be error)'
    ELSE '❓ Not ready'
  END as w1_3_status
FROM orders
WHERE execution_status IN ('error', 'ready_for_processing')
  AND (retry_count > 0 OR next_retry_at IS NOT NULL)
ORDER BY next_retry_at ASC NULLS LAST;

