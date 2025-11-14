-- QUICK FIX: Reset ALL orders stuck in processing state
-- This will free up W1.1 capacity immediately
-- Use with caution - only run if you've verified the orders are truly stuck

-- ============================================
-- OPTION 1: Reset ALL processing orders (aggressive)
-- ============================================

-- Uncomment to reset ALL orders in processing state:
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
WHERE execution_status = 'processing';
*/

-- ============================================
-- OPTION 2: Reset only orders stuck > 30 minutes (safer)
-- ============================================

-- Uncomment to reset only orders stuck > 30 minutes:
/*
UPDATE orders
SET 
  execution_status = CASE 
    WHEN (current_workflow = '2A' AND manifest_2a_url IS NOT NULL) THEN 'done'
    WHEN (current_workflow = '2B' AND manifest_2b_url IS NOT NULL) THEN 'done'
    WHEN (current_workflow = '3' AND manifest_3_url IS NOT NULL) THEN 'done'
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
-- VERIFY AFTER RUNNING
-- ============================================

-- After running either option, verify:
SELECT * FROM queue_status;
-- Should show processing_count = 0 (or only very recent orders)

