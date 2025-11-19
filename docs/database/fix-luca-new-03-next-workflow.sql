-- Fix LUCA-NEW-03: next_workflow should be '3' not '4'
-- The order has completed workflow 3 but postPdf review is not approved
-- According to determineNextWorkflow logic, it should go back to workflow 3 for review

UPDATE orders
SET 
  next_workflow = '3', -- Should be 3, not 4 (postPdf not approved)
  execution_status = 'ready_for_processing', -- Ensure it's ready
  current_workflow = NULL, -- Clear current workflow
  started_at = NULL, -- Clear started_at
  queued_at = NOW(), -- Update queued_at so router picks it up
  updated_at = NOW()
WHERE amazon_order_id = 'LUCA-NEW-03'
  AND next_workflow = '4'; -- Only update if it's incorrectly set to 4

-- Verify the fix
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  current_workflow,
  workflow_step,
  review_stages->'postPdf'->>'status' as postPdf_status,
  manifest_3_url IS NOT NULL as has_3_manifest,
  queued_at
FROM orders
WHERE amazon_order_id = 'LUCA-NEW-03';

