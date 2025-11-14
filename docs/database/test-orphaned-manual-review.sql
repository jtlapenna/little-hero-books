-- Test: Orphaned Recovery Action - Manual Review
-- This sets up an order that should trigger the "require_manual_review" recovery action
-- 
-- Conditions (test multiple scenarios):
-- 1. error_max_retries_exceeded: retry_count >= 3
-- 2. manual_review_pending: execution_status = 'error_requires_manual_review' for > 24 hours
-- 3. ready_not_picked_up + workflow 4 + missing manifest
-- 
-- Expected Result:
-- - Health Monitor should classify this as action = 'require_manual_review'
-- - Should PATCH Supabase: set execution_status = 'error_requires_manual_review'
-- - Should set requires_human_review = true
-- - Should set error_message = 'Orphaned order: Max retries exceeded or stuck. Requires manual intervention.'
-- - Should set error_type = 'orphaned_order'

-- Scenario 1: Max retries exceeded (use JESSICA-CUNT, ID: 171)
UPDATE orders
SET 
  execution_status = 'error',
  error_type = 'workflow_timeout',
  error_message = 'Workflow timed out - max retries exceeded',
  next_workflow = '2A',
  retry_count = 3,  -- Max retries reached
  next_retry_at = NULL,
  current_workflow = NULL,
  started_at = NULL,
  updated_at = NOW()
WHERE amazon_order_id = 'JESSICA-CUNT';

-- Scenario 2: Manual review pending > 24 hours (use JOHN-TEST4, ID: 170)
-- First, set it to error_requires_manual_review with old timestamp
UPDATE orders
SET 
  execution_status = 'error_requires_manual_review',
  error_type = 'orphaned_order',
  error_message = 'Requires manual intervention',
  requires_human_review = true,
  next_workflow = '4',
  retry_count = 2,
  next_retry_at = NULL,
  current_workflow = NULL,
  started_at = NULL,
  -- Set updated_at to 25 hours ago to trigger manual_review_pending
  updated_at = NOW() - INTERVAL '25 hours'
WHERE amazon_order_id = 'JOHN-TEST4';

-- Scenario 3: Ready not picked up + workflow 4 + missing manifest (use JOHN-TEST5, ID: 175)
UPDATE orders
SET 
  execution_status = 'ready_for_processing',
  error_type = NULL,
  error_message = NULL,
  next_workflow = '4',
  one_manifest_url = NULL,  -- Missing manifest
  retry_count = 0,
  next_retry_at = NULL,
  current_workflow = NULL,
  started_at = NULL,
  -- Set queued_at to 2 hours ago to trigger ready_not_picked_up
  queued_at = NOW() - INTERVAL '2 hours',
  updated_at = NOW()
WHERE amazon_order_id = 'JOHN-TEST5';

-- Verify Scenario 1: Max retries exceeded
SELECT 
  'Scenario 1: Max Retries Exceeded' as scenario,
  id,
  amazon_order_id,
  execution_status,
  error_type,
  retry_count,
  next_retry_at,
  CASE 
    WHEN execution_status = 'error' AND retry_count >= 3
    THEN '✅ Will trigger manual_review action'
    ELSE '❌ May not trigger manual_review action'
  END as expected_action
FROM orders
WHERE amazon_order_id = 'JESSICA-CUNT';

-- Verify Scenario 2: Manual review pending
SELECT 
  'Scenario 2: Manual Review Pending' as scenario,
  id,
  amazon_order_id,
  execution_status,
  error_type,
  requires_human_review,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - updated_at)) / 3600 as hours_since_update,
  CASE 
    WHEN execution_status = 'error_requires_manual_review' 
         AND EXTRACT(EPOCH FROM (NOW() - updated_at)) / 3600 > 24
    THEN '✅ Will trigger manual_review action'
    ELSE '❌ May not trigger manual_review action'
  END as expected_action
FROM orders
WHERE amazon_order_id = 'JOHN-TEST4';

-- Verify Scenario 3: Ready not picked up + workflow 4 + missing manifest
SELECT 
  'Scenario 3: Ready Not Picked Up + Workflow 4 + Missing Manifest' as scenario,
  id,
  amazon_order_id,
  execution_status,
  next_workflow,
  one_manifest_url,
  queued_at,
  EXTRACT(EPOCH FROM (NOW() - queued_at)) / 3600 as hours_since_queued,
  CASE 
    WHEN execution_status = 'ready_for_processing' 
         AND next_workflow = '4' 
         AND one_manifest_url IS NULL
         AND queued_at < NOW() - INTERVAL '1 hour'
    THEN '✅ Will trigger manual_review action'
    ELSE '❌ May not trigger manual_review action'
  END as expected_action
FROM orders
WHERE amazon_order_id = 'JOHN-TEST5';

-- Verify all via get_orphaned_orders() RPC function
SELECT 
  amazon_order_id,
  orphan_reason,
  execution_status,
  retry_count,
  next_workflow,
  one_manifest_url,
  'Should be classified as require_manual_review' as expected_classification
FROM get_orphaned_orders()
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
ORDER BY amazon_order_id;

