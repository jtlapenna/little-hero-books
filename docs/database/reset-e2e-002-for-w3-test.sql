-- Reset E2E-002 for Workflow 3 Testing
-- This script resets the order to a state where:
-- 1. 2B has completed (workflow_step = '2B-complete' or 'bria_processing_complete')
-- 2. postBria stage is approved (ready for W3)
-- 3. Router (W1.1) can pick it up and route to W3
-- 4. Tests dedication message flow and Supabase upsert fix

UPDATE orders
SET
  -- Router fields (W1.1 will pick up orders with these values)
  execution_status = 'ready_for_processing',
  next_workflow = '3',
  queued_at = CURRENT_TIMESTAMP,
  started_at = NULL,
  current_workflow = NULL,
  
  -- Workflow step (2B must be complete before W3)
  workflow_step = '2B-complete',
  
  -- Review stages (postBria must be approved to proceed to W3)
  -- Preserve preBria, update postBria to approved
  review_stages = jsonb_set(
    COALESCE(review_stages, '{}'::jsonb),
    '{postBria}',
    jsonb_build_object(
      'status', 'approved',
      'reviewedAt', CURRENT_TIMESTAMP,
      'reviewer', 'system',
      'posesProcessed', COALESCE((review_stages->'postBria'->>'posesProcessed')::int, 0),
      'posesSucceeded', COALESCE((review_stages->'postBria'->>'posesSucceeded')::int, 0),
      'posesFailed', COALESCE((review_stages->'postBria'->>'posesFailed')::int, 0)
    )
  ),
  
  -- Overall status (calculated status for post-2B approval, pre-W3 state)
  -- When postBria is approved and postPdf doesn't exist, status should be 'pending_assembly'
  status = 'pending_assembly',
  
  -- Ensure 2B manifest URL exists (required for W3 to download 2B manifest)
  -- If not set, this will remain NULL and W3 will construct it from orderId
  -- manifest_2b_url = manifest_2b_url,  -- Keep existing if present
  
  -- Set dedication text for testing dedication message flow
  -- This should be passed from Router to W3
  dedication_text = COALESCE(dedication_text, 'For my amazing child, who loves adventures!'),
  
  -- Clear any error/retry state
  error_message = NULL,
  error_type = NULL,
  retry_count = 0,
  last_error_at = NULL,
  next_retry_at = NULL,
  
  -- Clear processing flags (2B review is complete)
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
  review_stages->'postPdf'->>'status' as postpdf_status,
  manifest_2a_url IS NOT NULL as has_2a_manifest,
  manifest_2b_url IS NOT NULL as has_2b_manifest,
  one_manifest_url IS NOT NULL as has_1_manifest,
  character_specs IS NOT NULL as has_character_specs,
  dedication_text,
  updated_at
FROM orders
WHERE amazon_order_id = 'E2E-002';

-- Expected output:
-- execution_status: 'ready_for_processing'
-- next_workflow: '3'
-- current_workflow: NULL
-- workflow_step: '2B-complete'
-- status: 'pending_assembly'
-- prebria_status: 'approved' (or existing value)
-- postbria_status: 'approved'
-- postpdf_status: NULL (not set yet)
-- has_2b_manifest: true (should exist from 2B completion)
-- dedication_text: 'For my amazing child, who loves adventures!' (or existing value)
-- Router should pick this up and route to W3




