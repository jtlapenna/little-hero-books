-- Manually schedule retry for the 3 stuck orders
-- This sets them up so W1.3 can pick them up

UPDATE orders
SET 
  execution_status = 'error',
  retry_count = COALESCE(retry_count, 0) + 1,
  next_retry_at = NOW() + INTERVAL '5 minutes', -- 5 min delay for first retry
  error_type = 'workflow_timeout',
  error_message = 'Manually scheduled for retry after workflow timeout',
  current_workflow = NULL,
  started_at = NULL,
  updated_at = NOW()
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
  AND execution_status = 'error'
  AND (retry_count IS NULL OR retry_count < 3);

-- Verify the update
SELECT 
  amazon_order_id,
  execution_status,
  retry_count,
  next_retry_at,
  error_type,
  CASE 
    WHEN execution_status = 'error' 
         AND next_retry_at IS NOT NULL 
         AND next_retry_at <= NOW() + INTERVAL '6 minutes' -- Within next 6 min
         AND retry_count < 3
    THEN '✅ Ready for W1.3 (will be ready in ~5 min)'
    WHEN execution_status = 'error' 
         AND next_retry_at IS NOT NULL 
         AND next_retry_at > NOW()
    THEN '⏳ Waiting for retry time: ' || EXTRACT(EPOCH FROM (next_retry_at - NOW())) / 60 || ' minutes'
    ELSE '❓ Check status'
  END as status
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5');

