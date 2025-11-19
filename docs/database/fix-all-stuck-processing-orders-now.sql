-- IMMEDIATE FIX: Reset ALL orders stuck in processing state
-- This will free up W1.1 capacity immediately
-- 
-- This script:
-- 1. Identifies orders stuck in 'processing' state
-- 2. Checks if their workflow actually completed (has manifest)
-- 3. Sets to 'done' if completed, or 'ready_for_processing' if truly stuck
-- 4. Clears processing state (started_at, current_workflow)

-- ============================================
-- STEP 1: Preview what will be reset
-- ============================================

SELECT 
  amazon_order_id,
  execution_status,
  current_workflow,
  workflow_step,
  started_at,
  EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 as minutes_processing,
  manifest_2a_url IS NOT NULL as has_2a_manifest,
  manifest_2b_url IS NOT NULL as has_2b_manifest,
  manifest_3_url IS NOT NULL as has_3_manifest,
  CASE 
    -- If workflow completed (has manifest), will set to 'done'
    WHEN (current_workflow = '2A' AND manifest_2a_url IS NOT NULL) THEN '✅ Will set to done (2A completed)'
    WHEN (current_workflow = '2B' AND manifest_2b_url IS NOT NULL) THEN '✅ Will set to done (2B completed)'
    WHEN (current_workflow = '3' AND manifest_3_url IS NOT NULL) THEN '✅ Will set to done (3 completed)'
    -- If workflow_step indicates completion, set to 'done'
    WHEN workflow_step IN ('2A-complete', 'ai_generation_completed') THEN '✅ Will set to done (workflow_step indicates 2A complete)'
    WHEN workflow_step IN ('2B-complete', 'bria_processing_complete') THEN '✅ Will set to done (workflow_step indicates 2B complete)'
    WHEN workflow_step = 'book_assembly_completed' THEN '✅ Will set to done (workflow_step indicates 3 complete)'
    -- Otherwise, truly stuck - reset to ready_for_processing
    ELSE '⚠️ Will set to ready_for_processing (truly stuck)'
  END as reset_action
FROM orders
WHERE execution_status = 'processing'
ORDER BY started_at ASC NULLS LAST;

-- ============================================
-- STEP 2: Reset all stuck orders
-- ============================================

UPDATE orders
SET 
  execution_status = CASE 
    -- If workflow completed (has manifest), set to 'done'
    WHEN (current_workflow = '2A' AND manifest_2a_url IS NOT NULL) THEN 'done'
    WHEN (current_workflow = '2B' AND manifest_2b_url IS NOT NULL) THEN 'done'
    WHEN (current_workflow = '3' AND manifest_3_url IS NOT NULL) THEN 'done'
    -- If workflow_step indicates completion, set to 'done'
    WHEN workflow_step IN ('2A-complete', 'ai_generation_completed') THEN 'done'
    WHEN workflow_step IN ('2B-complete', 'bria_processing_complete') THEN 'done'
    WHEN workflow_step = 'book_assembly_completed' THEN 'done'
    -- Otherwise, reset to ready_for_processing for retry
    ELSE 'ready_for_processing'
  END,
  started_at = NULL,
  current_workflow = NULL,
  error_message = CASE 
    WHEN execution_status = 'processing' AND (
      (current_workflow = '2A' AND manifest_2a_url IS NULL) OR
      (current_workflow = '2B' AND manifest_2b_url IS NULL) OR
      (current_workflow = '3' AND manifest_3_url IS NULL)
    ) THEN 'Workflow timeout - reset by cleanup (stuck > 30 minutes)'
    ELSE error_message
  END,
  error_type = CASE 
    WHEN execution_status = 'processing' AND (
      (current_workflow = '2A' AND manifest_2a_url IS NULL) OR
      (current_workflow = '2B' AND manifest_2b_url IS NULL) OR
      (current_workflow = '3' AND manifest_3_url IS NULL)
    ) THEN 'workflow_timeout'
    ELSE error_type
  END,
  updated_at = NOW()
WHERE execution_status = 'processing';

-- ============================================
-- STEP 3: Verify the fix
-- ============================================

-- Check queue_status after fix
SELECT * FROM queue_status;
-- Should show processing_count = 0 (or only very recent orders < 30 min)

-- Check direct count
SELECT 
  execution_status,
  COUNT(*) as count
FROM orders
GROUP BY execution_status
ORDER BY count DESC;

-- List any remaining processing orders (should be none or very recent)
SELECT 
  amazon_order_id,
  execution_status,
  current_workflow,
  started_at,
  EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 as minutes_processing
FROM orders
WHERE execution_status = 'processing'
ORDER BY started_at DESC;

