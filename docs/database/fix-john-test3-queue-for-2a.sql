-- Fix JOHN-TEST3 to queue for W2A
-- This sets the order to the correct state for W1.1 router to pick it up
-- 
-- ROOT CAUSE: W0's upsert includes invalid 'orderId' field, causing update to fail
-- This manually fixes the order state

UPDATE orders
SET
  execution_status = 'ready_for_processing',
  next_workflow = '2A',
  queued_at = COALESCE(queued_at, CURRENT_TIMESTAMP),
  started_at = NULL,
  current_workflow = NULL,
  workflow_step = COALESCE(workflow_step, 'order_intake'),
  updated_at = CURRENT_TIMESTAMP
WHERE amazon_order_id = 'JOHN-TEST3';

-- Verify the fix
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  queued_at,
  workflow_step,
  one_manifest_url IS NOT NULL as has_manifest,
  CASE 
    WHEN execution_status = 'ready_for_processing' AND next_workflow = '2A' THEN '✅ Ready for W1.1 router'
    WHEN execution_status != 'ready_for_processing' THEN '❌ Wrong execution_status: ' || execution_status
    WHEN next_workflow IS NULL THEN '❌ Missing next_workflow'
    WHEN next_workflow != '2A' THEN '❌ Wrong next_workflow: ' || next_workflow
    ELSE '❌ Still not ready'
  END as status
FROM orders
WHERE amazon_order_id = 'JOHN-TEST3';

