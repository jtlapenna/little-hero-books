-- Test data setup for Health Monitor W1.5 Retry Orders path
-- Retry-ready orders: execution_status = 'error' AND next_retry_at <= NOW() AND retry_count < 3

-- ============================================
-- TEST: Retry-Ready Order
-- ============================================
-- Order should have:
-- - execution_status: 'error'
-- - next_retry_at: <= NOW() (retry time has arrived)
-- - retry_count: < 3 (hasn't exceeded max retries)
-- - next_workflow: the workflow to retry (2A, 2B, 3, or 4)
-- - character_hash: required for retry processing
-- This will be detected by the retry query and processed by the Retry path

-- Use an existing order - adjust the WHERE clause to match an existing order
UPDATE orders
SET 
  execution_status = 'error',
  error_type = 'workflow_timeout',
  error_message = 'Workflow timed out - test scenario for retry',
  retry_count = 1,
  next_retry_at = NOW() - INTERVAL '5 minutes',  -- Retry time has passed
  next_workflow = '2A',
  current_workflow = NULL,
  started_at = NULL,
  updated_at = NOW()
WHERE amazon_order_id = 'JOHN-TEST4'
  AND id = 170;

-- Verify the update
SELECT 
  id,
  amazon_order_id,
  execution_status,
  error_type,
  retry_count,
  next_retry_at,
  next_workflow,
  character_hash,
  one_manifest_url,
  -- Check if it will be detected
  CASE 
    WHEN execution_status = 'error' 
         AND next_retry_at IS NOT NULL 
         AND next_retry_at <= NOW() 
         AND retry_count < 3
    THEN '✅ WILL BE DETECTED AS RETRY-READY'
    WHEN execution_status != 'error' THEN '❌ Wrong status: ' || execution_status
    WHEN next_retry_at IS NULL THEN '❌ Missing next_retry_at'
    WHEN next_retry_at > NOW() THEN '⏳ Waiting (retry time: ' || next_retry_at || ')'
    WHEN retry_count >= 3 THEN '❌ Max retries reached'
    ELSE '❓ Check manually'
  END as retry_status,
  -- Time until/since retry
  CASE 
    WHEN next_retry_at IS NOT NULL AND next_retry_at > NOW()
    THEN EXTRACT(EPOCH FROM (next_retry_at - NOW())) / 60
    WHEN next_retry_at IS NOT NULL AND next_retry_at <= NOW()
    THEN -EXTRACT(EPOCH FROM (NOW() - next_retry_at)) / 60
    ELSE NULL
  END as minutes_until_since_retry
FROM orders
WHERE amazon_order_id = 'JOHN-TEST4'
  AND id = 170;

-- ============================================
-- Optional: Create multiple retry-ready orders for testing
-- ============================================
-- Uncomment and adjust order IDs as needed

-- UPDATE orders
-- SET 
--   execution_status = 'error',
--   error_type = 'api_error',
--   error_message = 'API error - test scenario for retry',
--   retry_count = 0,
--   next_retry_at = NOW() - INTERVAL '10 minutes',
--   next_workflow = '2B',
--   current_workflow = NULL,
--   started_at = NULL,
--   updated_at = NOW()
-- WHERE amazon_order_id = 'JOHN-TEST5'
--   AND id = 175;

-- ============================================
-- Verify all retry-ready orders
-- ============================================
SELECT 
  id,
  amazon_order_id,
  execution_status,
  error_type,
  retry_count,
  next_retry_at,
  next_workflow,
  character_hash,
  CASE 
    WHEN execution_status = 'error' 
         AND next_retry_at IS NOT NULL 
         AND next_retry_at <= NOW() 
         AND retry_count < 3
    THEN '✅ RETRY-READY'
    ELSE '❌ Not ready'
  END as retry_status
FROM orders
WHERE execution_status = 'error'
  AND next_retry_at IS NOT NULL
  AND next_retry_at <= NOW()
  AND retry_count < 3
ORDER BY next_retry_at ASC;

