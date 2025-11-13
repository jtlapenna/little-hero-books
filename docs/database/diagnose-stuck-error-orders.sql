-- Diagnose why error orders aren't being picked up by W1.2 or W1.3

-- Check all error orders and their retry status
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
  -- Why W1.2 won't pick them up (only looks for 'processing' status)
  CASE 
    WHEN execution_status = 'processing' THEN '✅ W1.2 will detect'
    ELSE '❌ W1.2 ignores (not processing)'
  END as w1_2_status,
  -- Why W1.3 won't pick them up
  CASE 
    WHEN execution_status != 'error' THEN '❌ Wrong status: ' || execution_status
    WHEN next_retry_at IS NULL THEN '❌ Missing next_retry_at'
    WHEN next_retry_at > NOW() THEN '⏳ Waiting: ' || ROUND(EXTRACT(EPOCH FROM (next_retry_at - NOW())) / 60, 1) || ' min'
    WHEN retry_count >= 3 THEN '❌ Max retries reached (>= 3)'
    WHEN execution_status = 'error' 
         AND next_retry_at <= NOW() 
         AND retry_count < 3
    THEN '✅ READY FOR W1.3'
    ELSE '❓ Unknown issue'
  END as w1_3_status,
  -- How long stuck
  EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 as minutes_since_update
FROM orders
WHERE execution_status IN ('error', 'error_requires_manual_review', 'processing')
ORDER BY updated_at DESC;

-- Find orders that are truly orphaned (error but no retry scheduled)
SELECT 
  amazon_order_id,
  execution_status,
  retry_count,
  next_retry_at,
  error_type,
  updated_at,
  'ORPHANED - Error but no retry scheduled' as issue
FROM orders
WHERE execution_status = 'error'
  AND (next_retry_at IS NULL OR retry_count IS NULL)
ORDER BY updated_at DESC;

-- Find orders that exceeded max retries but aren't in manual review
SELECT 
  amazon_order_id,
  execution_status,
  retry_count,
  next_retry_at,
  error_type,
  updated_at,
  'EXCEEDED MAX RETRIES - Should be in manual review' as issue
FROM orders
WHERE execution_status = 'error'
  AND retry_count >= 3
ORDER BY updated_at DESC;

