-- Reset E2E-002 order for router testing
-- This resets the order back to ready_for_processing so W1.1 can pick it up again

UPDATE orders
SET
  execution_status = 'ready_for_processing',
  started_at = NULL,
  current_workflow = NULL,
  error_message = NULL,
  error_type = NULL,
  retry_count = 0,
  last_error_at = NULL,
  next_retry_at = NULL,
  updated_at = CURRENT_TIMESTAMP
WHERE amazon_order_id = 'E2E-002';

-- Verify the reset
SELECT
  amazon_order_id,
  execution_status,
  next_workflow,
  current_workflow,
  started_at,
  character_specs IS NOT NULL as has_character_specs,
  one_manifest_url IS NOT NULL as has_manifest,
  workflow_step,
  status
FROM orders
WHERE amazon_order_id = 'E2E-002';

