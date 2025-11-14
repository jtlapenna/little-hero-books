-- Find the 5 orders blocking W1.1 capacity
-- Then fix them

-- ============================================
-- STEP 1: Identify the 5 blocking orders
-- ============================================

SELECT 
  id,
  amazon_order_id,
  execution_status,
  current_workflow,
  started_at,
  workflow_step,
  manifest_2a_url IS NOT NULL as has_2a_manifest,
  manifest_2b_url IS NOT NULL as has_2b_manifest,
  manifest_3_url IS NOT NULL as has_3_manifest,
  EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 as minutes_processing,
  CASE 
    WHEN started_at IS NULL THEN 'No timestamp'
    WHEN started_at < NOW() - INTERVAL '1 hour' THEN 'Stuck > 1 hour'
    WHEN started_at < NOW() - INTERVAL '30 minutes' THEN 'Stuck > 30 minutes'
    ELSE 'Recent'
  END as status_category
FROM orders
WHERE execution_status = 'processing'
ORDER BY started_at ASC NULLS LAST;

-- ============================================
-- STEP 2: Check if any have completed workflows (have manifests)
-- ============================================

-- Orders that have manifests but are still marked as processing
SELECT 
  amazon_order_id,
  current_workflow,
  CASE 
    WHEN current_workflow = '2A' AND manifest_2a_url IS NOT NULL THEN '✅ 2A completed'
    WHEN current_workflow = '2B' AND manifest_2b_url IS NOT NULL THEN '✅ 2B completed'
    WHEN current_workflow = '3' AND manifest_3_url IS NOT NULL THEN '✅ 3 completed'
    ELSE '❌ No manifest'
  END as completion_status,
  started_at,
  EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 as minutes_processing
FROM orders
WHERE execution_status = 'processing'
  AND (
    (current_workflow = '2A' AND manifest_2a_url IS NOT NULL)
    OR (current_workflow = '2B' AND manifest_2b_url IS NOT NULL)
    OR (current_workflow = '3' AND manifest_3_url IS NOT NULL)
  );

-- ============================================
-- STEP 3: Reset all stuck orders (SAFE - only resets if stuck > 30 min or no timestamp)
-- ============================================

-- First, see what will be reset (run this first to review!)
SELECT 
  amazon_order_id,
  current_workflow,
  started_at,
  EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 as minutes_processing,
  CASE 
    WHEN current_workflow = '2A' AND manifest_2a_url IS NOT NULL THEN 'Will set to done (2A completed)'
    WHEN current_workflow = '2B' AND manifest_2b_url IS NOT NULL THEN 'Will set to done (2B completed)'
    WHEN current_workflow = '3' AND manifest_3_url IS NOT NULL THEN 'Will set to done (3 completed)'
    ELSE 'Will set to ready_for_processing (truly stuck)'
  END as reset_action
FROM orders
WHERE execution_status = 'processing'
  AND (
    started_at < NOW() - INTERVAL '30 minutes'
    OR started_at IS NULL
  );

-- If the above looks correct, uncomment and run this to reset them:
/*
UPDATE orders
SET 
  execution_status = CASE 
    -- If workflow completed (has manifest), set to 'done'
    WHEN (current_workflow = '2A' AND manifest_2a_url IS NOT NULL) THEN 'done'
    WHEN (current_workflow = '2B' AND manifest_2b_url IS NOT NULL) THEN 'done'
    WHEN (current_workflow = '3' AND manifest_3_url IS NOT NULL) THEN 'done'
    -- Otherwise, reset to ready_for_processing for retry
    ELSE 'ready_for_processing'
  END,
  started_at = NULL,
  current_workflow = NULL,
  updated_at = NOW()
WHERE execution_status = 'processing'
  AND (
    started_at < NOW() - INTERVAL '30 minutes'
    OR started_at IS NULL
  );
*/

-- ============================================
-- STEP 4: Verify the fix
-- ============================================

-- Check queue_status after fix
SELECT * FROM queue_status;

-- Check direct count
SELECT 
  COUNT(*) FILTER (WHERE execution_status = 'processing') as processing_count,
  COUNT(*) FILTER (WHERE execution_status = 'ready_for_processing') as queued_count
FROM orders;

-- Should show processing_count = 0 (or only very recent orders < 30 min)

