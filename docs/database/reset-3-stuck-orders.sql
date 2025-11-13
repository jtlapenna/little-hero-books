-- Reset the 3 stuck orders that have been processing for hundreds of minutes
-- Based on query results:
-- - JESSICA-CUNT: 373 minutes, workflow 2B
-- - JOHN-TEST4: 358 minutes, workflow 2B  
-- - JOHN-TEST5: 286 minutes, workflow 3

-- First, check their current state and manifests
SELECT 
  amazon_order_id,
  execution_status,
  current_workflow,
  workflow_step,
  started_at,
  manifest_2a_url IS NOT NULL as has_2a,
  manifest_2b_url IS NOT NULL as has_2b,
  manifest_3_url IS NOT NULL as has_3,
  EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 as minutes_processing
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
ORDER BY started_at ASC;

-- Reset them based on whether workflows completed
-- If they have manifests for their current workflow, mark as 'done'
-- Otherwise, reset to 'ready_for_processing' for retry

UPDATE orders
SET 
  execution_status = CASE 
    -- JESSICA-CUNT and JOHN-TEST4 are in 2B - check if 2B manifest exists
    WHEN amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4') 
         AND manifest_2b_url IS NOT NULL 
    THEN 'done'
    -- JOHN-TEST5 is in 3 - check if 3 manifest exists
    WHEN amazon_order_id = 'JOHN-TEST5' 
         AND manifest_3_url IS NOT NULL 
    THEN 'done'
    -- Otherwise, reset to ready_for_processing for retry
    ELSE 'ready_for_processing'
  END,
  started_at = NULL,
  current_workflow = NULL,
  error_message = CASE 
    WHEN execution_status = 'processing' 
    THEN 'Workflow timeout - reset by cleanup'
    ELSE error_message
  END,
  error_type = CASE 
    WHEN execution_status = 'processing' 
    THEN 'workflow_timeout'
    ELSE error_type
  END,
  updated_at = NOW()
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
  AND execution_status = 'processing';

-- Verify the reset
SELECT 
  amazon_order_id,
  execution_status,
  current_workflow,
  error_message,
  error_type
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5');

