-- Diagnose why Schedule Retry didn't run
-- Check the current state of the 3 orders

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
  -- Check what W1.2 "Decide Retry or Manual Review" would do
  CASE 
    WHEN retry_count IS NULL OR retry_count = 0 THEN 'Would schedule retry (retry_count = 0)'
    WHEN retry_count >= 3 THEN 'Would require manual review (retry_count >= 3)'
    WHEN retry_count < 3 THEN 'Would schedule retry (retry_count < 3)'
    ELSE 'Unknown'
  END as what_w1_2_would_do,
  -- Check if ready for W1.3
  CASE 
    WHEN execution_status = 'error' 
         AND next_retry_at IS NOT NULL 
         AND next_retry_at <= NOW() 
         AND retry_count < 3
    THEN '✅ Ready for W1.3'
    WHEN execution_status = 'error' 
         AND next_retry_at IS NULL
    THEN '❌ Missing next_retry_at (Schedule Retry didn''t run)'
    WHEN execution_status = 'error' 
         AND next_retry_at > NOW()
    THEN '⏳ Waiting: ' || ROUND(EXTRACT(EPOCH FROM (next_retry_at - NOW())) / 60, 1) || ' min'
    ELSE '❓ Check manually'
  END as w1_3_status
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
ORDER BY updated_at DESC;

