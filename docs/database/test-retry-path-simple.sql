-- Simple SQL to set up an order for the Retry path
-- This will make the order eligible for retry processing in the Health Monitor workflow
--
-- Requirements for retry path:
-- - execution_status = 'error'
-- - next_retry_at <= NOW() (retry time has arrived)
-- - retry_count < 3 (hasn't exceeded max retries)
-- - character_hash: required for retry processing
-- - next_workflow: the workflow to retry (2A, 2B, 3, or 4)

-- Update an order to be retry-ready
-- Replace 'JOHN-TEST4' with your desired order ID
UPDATE orders
SET 
  execution_status = 'error',
  error_type = 'workflow_timeout',
  error_message = 'Workflow timed out - ready for retry',
  retry_count = 1,  -- Set to 0, 1, or 2 (must be < 3)
  next_retry_at = NOW() - INTERVAL '5 minutes',  -- Set in the past so retry time has arrived
  next_workflow = '2A',  -- Set to the workflow you want to retry: '2A', '2B', '3', or '4'
  current_workflow = NULL,  -- Clear current workflow
  started_at = NULL,  -- Clear started_at
  updated_at = NOW()
WHERE amazon_order_id = 'JOHN-TEST4'
  AND id = 170;

-- Verify the order is retry-ready
SELECT 
  id,
  amazon_order_id,
  execution_status,
  error_type,
  error_message,
  retry_count,
  next_retry_at,
  next_workflow,
  character_hash,
  CASE 
    WHEN execution_status = 'error' 
         AND next_retry_at IS NOT NULL 
         AND next_retry_at <= NOW() 
         AND retry_count < 3
    THEN '✅ RETRY-READY - Will be processed by Health Monitor'
    WHEN execution_status != 'error' THEN '❌ Wrong status: ' || execution_status
    WHEN next_retry_at IS NULL THEN '❌ Missing next_retry_at'
    WHEN next_retry_at > NOW() THEN '⏳ Waiting (retry time: ' || next_retry_at || ')'
    WHEN retry_count >= 3 THEN '❌ Max retries reached (retry_count: ' || retry_count || ')'
    ELSE '❓ Check manually'
  END as retry_status,
  -- Time since retry time passed
  EXTRACT(EPOCH FROM (NOW() - next_retry_at)) / 60 as minutes_since_retry_time
FROM orders
WHERE amazon_order_id = 'JOHN-TEST4'
  AND id = 170;

