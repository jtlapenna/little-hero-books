-- Reset E2E-002 for 2B Workflow Testing
-- This script resets the order to a state where:
-- 1. 2A has completed (workflow_step = '2A-complete')
-- 2. preBria stage is approved (ready for 2B)
-- 3. Router (W1.1) can pick it up and route to 2B
-- 4. Tests both the duplicate trigger fix and Supabase upsert fix

UPDATE orders
SET
  -- Router fields (W1.1 will pick up orders with these values)
  execution_status = 'ready_for_processing',
  next_workflow = '2B',
  queued_at = CURRENT_TIMESTAMP,
  started_at = NULL,
  current_workflow = NULL,
  
  -- Workflow step (2A must be complete before 2B)
  workflow_step = '2A-complete',
  
  -- Review stages (preBria must be approved to proceed to 2B)
  review_stages = jsonb_set(
    COALESCE(review_stages, '{}'::jsonb),
    '{preBria}',
    jsonb_build_object(
      'status', 'approved',
      'reviewedAt', CURRENT_TIMESTAMP,
      'reviewer', 'system'
    )
  ),
  
  -- Overall status (calculated status for post-2A, pre-2B state)
  status = 'pending_bg_removal',
  
  -- Clear any error/retry state
  error_message = NULL,
  error_type = NULL,
  retry_count = 0,
  last_error_at = NULL,
  next_retry_at = NULL,
  
  -- Clear processing flags
  requires_human_review = false,
  
  -- Update timestamp
  updated_at = CURRENT_TIMESTAMP
  
WHERE amazon_order_id = 'E2E-002';

-- Verify the reset
SELECT
  amazon_order_id,
  execution_status,
  next_workflow,
  current_workflow,
  workflow_step,
  status,
  queued_at,
  started_at,
  review_stages->'preBria'->>'status' as prebria_status,
  review_stages->'postBria'->>'status' as postbria_status,
  manifest_2a_url IS NOT NULL as has_2a_manifest,
  one_manifest_url IS NOT NULL as has_1_manifest,
  character_specs IS NOT NULL as has_character_specs,
  updated_at
FROM orders
WHERE amazon_order_id = 'E2E-002';

-- Expected output:
-- execution_status: 'ready_for_processing'
-- next_workflow: '2B'
-- current_workflow: NULL
-- workflow_step: '2A-complete'
-- status: 'pending_bg_removal'
-- prebria_status: 'approved'
-- postbria_status: 'pending' (or NULL)
-- Router should pick this up and route to 2B

