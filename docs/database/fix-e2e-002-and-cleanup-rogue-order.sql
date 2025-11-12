-- Fix E2E-002 and Cleanup Rogue Order
-- This script addresses the issues identified in the diagnostic

-- ISSUE 1: E2E-002 is in "processing" state, so router won't pick it up
-- When you approved it, it should have been set to "ready_for_processing"
-- But it's currently "processing" with current_workflow = "2B"
-- This suggests it was already processing when approved, OR the approval didn't work correctly

-- SOLUTION: Reset E2E-002 to ready_for_processing if it's stuck in processing
UPDATE orders
SET
  execution_status = 'ready_for_processing',
  started_at = NULL,
  current_workflow = NULL,
  -- Keep next_workflow as 2B (from approval)
  queued_at = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP
WHERE amazon_order_id = 'E2E-002'
  AND execution_status = 'processing'
  AND next_workflow = '2B';

-- ISSUE 2: Rogue order with "unknown-order" and invalid next_workflow
-- The rogue order has:
--   - amazon_order_id: "unknown-order" (should never happen)
--   - next_workflow: "book-generation" (invalid - should be "2A", "2B", "3", or "4")
--   - execution_status: "ready_for_processing" (so router will try to pick it up)
--   - workflow_step: "2A-complete" (suggests it came from 2A workflow)

-- SOLUTION: Delete the rogue order (it's invalid and will cause router errors)
DELETE FROM orders
WHERE amazon_order_id = 'unknown-order'
  AND next_workflow = 'book-generation';

-- Verify the fixes
SELECT
  id,
  amazon_order_id,
  execution_status,
  next_workflow,
  current_workflow,
  started_at,
  queued_at,
  review_stages->>'preBria' as prebria_status,
  CASE 
    WHEN execution_status = 'ready_for_processing' AND next_workflow IS NOT NULL THEN '✅ Ready for router'
    WHEN execution_status = 'processing' THEN '❌ Already processing'
    ELSE '❓ Other status'
  END as router_status
FROM orders
WHERE amazon_order_id IN ('E2E-002', 'unknown-order')
ORDER BY created_at DESC;

