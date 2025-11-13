-- Check if orders are ready for W1.3 to pick up
-- W1.3 queries for: execution_status='error' AND next_retry_at <= NOW() AND retry_count < 3

SELECT 
  id,
  amazon_order_id,
  execution_status,
  retry_count,
  next_retry_at,
  error_type,
  error_message,
  next_workflow,
  -- Check if order matches W1.3 criteria
  CASE 
    WHEN execution_status = 'error' 
         AND next_retry_at IS NOT NULL 
         AND next_retry_at <= NOW() 
         AND retry_count < 3
    THEN '✅ READY FOR W1.3'
    WHEN execution_status = 'error' 
         AND next_retry_at IS NULL
    THEN '❌ Missing next_retry_at'
    WHEN execution_status = 'error' 
         AND next_retry_at > NOW()
    THEN '⏳ Waiting (retry time not yet arrived)'
    WHEN execution_status = 'error' 
         AND retry_count >= 3
    THEN '❌ Max retries reached'
    WHEN execution_status != 'error'
    THEN '❌ Wrong status: ' || execution_status
    ELSE '❓ Check manually'
  END as w1_3_status,
  -- Time until retry (if waiting)
  CASE 
    WHEN next_retry_at IS NOT NULL AND next_retry_at > NOW()
    THEN EXTRACT(EPOCH FROM (next_retry_at - NOW())) / 60
    ELSE NULL
  END as minutes_until_retry,
  updated_at
FROM orders
WHERE execution_status = 'error'
  OR next_retry_at IS NOT NULL
  OR retry_count > 0
ORDER BY 
  CASE 
    WHEN execution_status = 'error' 
         AND next_retry_at IS NOT NULL 
         AND next_retry_at <= NOW() 
         AND retry_count < 3
    THEN 1
    ELSE 2
  END,
  next_retry_at ASC NULLS LAST;

-- Check if Schedule Retry node actually updated orders
-- Look for orders that should have been updated recently
SELECT 
  amazon_order_id,
  execution_status,
  retry_count,
  next_retry_at,
  error_type,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 as minutes_since_update
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
ORDER BY updated_at DESC;

