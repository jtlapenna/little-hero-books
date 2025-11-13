-- Check if Schedule Retry node actually updated orders
-- Look for orders that should have been scheduled for retry

SELECT 
  id,
  amazon_order_id,
  execution_status,
  retry_count,
  next_retry_at,
  error_type,
  error_message,
  updated_at,
  -- Check if Schedule Retry node ran (should have set retry_count and next_retry_at)
  CASE 
    WHEN retry_count IS NULL OR retry_count = 0 THEN '❌ retry_count not set'
    WHEN next_retry_at IS NULL THEN '❌ next_retry_at not set'
    WHEN execution_status != 'error' THEN '❌ execution_status wrong: ' || execution_status
    ELSE '✅ Scheduled for retry'
  END as schedule_status
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
ORDER BY updated_at DESC;

-- Check all error orders to see if any were scheduled
SELECT 
  amazon_order_id,
  execution_status,
  retry_count,
  next_retry_at,
  error_type,
  updated_at
FROM orders
WHERE execution_status = 'error'
ORDER BY updated_at DESC;

