-- Fix the 3 current stuck orders
-- They're in 'error' status but need to be scheduled for retry

-- Check current state
SELECT 
  amazon_order_id,
  execution_status,
  retry_count,
  next_retry_at,
  error_type,
  error_message,
  updated_at
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
ORDER BY updated_at DESC;

-- Fix: Schedule retry for orders that are in error but don't have next_retry_at
UPDATE orders
SET 
  execution_status = 'error',
  retry_count = COALESCE(retry_count, 0) + 1,
  next_retry_at = NOW() + INTERVAL '5 minutes',
  error_type = COALESCE(error_type, 'workflow_timeout'),
  error_message = COALESCE(error_message, 'Manually scheduled for retry after being orphaned'),
  current_workflow = NULL,
  started_at = NULL,
  updated_at = NOW()
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
  AND execution_status = 'error'
  AND (next_retry_at IS NULL OR retry_count IS NULL OR retry_count < 3);

-- Verify the fix
SELECT 
  amazon_order_id,
  execution_status,
  retry_count,
  next_retry_at,
  CASE 
    WHEN execution_status = 'error' 
         AND next_retry_at IS NOT NULL 
         AND next_retry_at <= NOW() + INTERVAL '6 minutes'
         AND retry_count < 3
    THEN '✅ Ready for W1.3 (will be ready in ~5 min)'
    WHEN execution_status = 'error' 
         AND next_retry_at IS NOT NULL 
         AND next_retry_at > NOW()
    THEN '⏳ Waiting: ' || ROUND(EXTRACT(EPOCH FROM (next_retry_at - NOW())) / 60, 1) || ' min'
    ELSE '❓ Check status'
  END as status
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5');

