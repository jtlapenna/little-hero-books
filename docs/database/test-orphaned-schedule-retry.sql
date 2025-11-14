-- Test: Orphaned Recovery Action - Schedule Retry
-- This sets up an order that should trigger the "schedule_retry" recovery action
-- 
-- Conditions:
-- - Order has orphan_reason = 'error_no_retry_scheduled'
-- - Order has retry_count < 3 (has retries remaining)
-- - Order has execution_status = 'error'
-- 
-- Expected Result:
-- - Health Monitor should classify this as action = 'schedule_retry'
-- - Should PATCH Supabase: increment retry_count, set next_retry_at to 5 minutes from now
-- - Should set execution_status = 'ready_for_processing'
-- - Should clear current_workflow and started_at
-- - Should clear error fields

-- Use JOHN-TEST4 (ID: 170) for testing
UPDATE orders
SET 
  execution_status = 'error',
  error_type = 'workflow_timeout',
  error_message = 'Workflow timed out - test for schedule_retry recovery',
  next_workflow = '2A',
  retry_count = 1,  -- Less than 3, so should schedule retry
  next_retry_at = NULL,  -- No retry scheduled yet
  current_workflow = NULL,
  started_at = NULL,
  one_manifest_url = NULL,  -- Ensure it's not picked up for create_manifest
  updated_at = NOW()
WHERE amazon_order_id = 'JOHN-TEST4';

-- Verify the order setup
SELECT 
  id,
  amazon_order_id,
  execution_status,
  error_type,
  error_message,
  next_workflow,
  retry_count,
  next_retry_at,
  current_workflow,
  started_at,
  updated_at,
  -- Check if it will be picked up by get_orphaned_orders()
  CASE 
    WHEN execution_status = 'error' AND retry_count < 3 AND next_retry_at IS NULL
    THEN '✅ Will trigger schedule_retry action'
    ELSE '❌ May not trigger schedule_retry action'
  END as expected_action
FROM orders
WHERE amazon_order_id = 'JOHN-TEST4';

-- Verify via get_orphaned_orders() RPC function
SELECT 
  amazon_order_id,
  orphan_reason,
  execution_status,
  retry_count,
  next_retry_at,
  'Should be classified as schedule_retry' as expected_classification
FROM get_orphaned_orders()
WHERE amazon_order_id = 'JOHN-TEST4';

