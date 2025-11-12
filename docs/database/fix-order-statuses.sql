-- Fix order statuses to match router expectations
-- This script corrects execution_status values so router works correctly

-- 1. Fix orders with "new" status that incorrectly have ready_for_processing
-- These orders haven't been through W0 yet, so they should NOT be ready
UPDATE orders
SET execution_status = 'pending_validation'
WHERE execution_status = 'ready_for_processing'
  AND status = 'new'
  AND (workflow_step IS NULL OR next_workflow IS NULL);

-- 2. Set E2E-002 to ready_for_processing since it has:
--    - next_workflow = '2A' (ready to route)
--    - workflow_step = 'order_intake' (has been through W0)
--    - manifest URL exists
-- Note: Even though character_specs is missing, it has next_workflow set
UPDATE orders
SET 
  execution_status = 'ready_for_processing',
  started_at = NULL,
  current_workflow = NULL
WHERE amazon_order_id = 'E2E-002'
  AND next_workflow IS NOT NULL
  AND workflow_step IS NOT NULL;

-- 3. Keep other orders with "pending_validation" status as-is
-- (They need to go through W0 first)

-- 4. Verify the results
SELECT 
  amazon_order_id,
  execution_status,
  status,
  workflow_step,
  next_workflow,
  character_specs IS NOT NULL as has_character_specs,
  one_manifest_url IS NOT NULL as has_manifest
FROM orders
ORDER BY 
  CASE WHEN amazon_order_id = 'E2E-002' THEN 0 ELSE 1 END,
  created_at DESC;

