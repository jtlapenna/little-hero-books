-- Comprehensive test data setup for Health Monitor W1.5
-- Tests all three paths: Stuck, Retry, and Orphaned (with all orphaned sub-paths)

-- ============================================
-- SCENARIO 1: STUCK ORDER
-- ============================================
-- Order: JESSICA-CUNT (ID: 171)
-- Path: Stuck Orders
-- Expected: Detected as stuck, marked as error, then either scheduled for retry or marked for manual review

UPDATE orders
SET 
  execution_status = 'processing',
  current_workflow = '2A',
  started_at = NOW() - INTERVAL '45 minutes',  -- Stuck for 45 minutes (> 30 min threshold)
  updated_at = NOW() - INTERVAL '45 minutes',
  retry_count = 0,
  error_message = NULL,
  error_type = NULL,
  next_retry_at = NULL,
  next_workflow = '2A'
WHERE amazon_order_id = 'JESSICA-CUNT'
  AND id = 171;

-- ============================================
-- SCENARIO 2: RETRY-READY ORDER
-- ============================================
-- Order: JOHN-TEST4 (ID: 170)
-- Path: Retry Orders
-- Expected: Detected as retry-ready, reset to ready_for_processing, sent to router

UPDATE orders
SET 
  execution_status = 'error',
  error_type = 'workflow_timeout',
  error_message = 'Workflow timed out - test scenario for retry',
  retry_count = 1,
  next_retry_at = NOW() - INTERVAL '5 minutes',  -- Retry time has passed
  next_workflow = '2B',
  current_workflow = NULL,
  started_at = NULL,
  updated_at = NOW()
WHERE amazon_order_id = 'JOHN-TEST4'
  AND id = 170;

-- ============================================
-- SCENARIO 3: ORPHANED - SCHEDULE RETRY
-- ============================================
-- Order: JOHN-TEST5 (ID: 175) - Schedule Retry path
-- Path: Orphaned Orders -> Schedule Retry
-- Expected: Classified as schedule_retry, retry scheduled

UPDATE orders
SET 
  execution_status = 'error',
  error_type = 'missing_manifest',
  error_message = 'Missing required 1-manifest.json file - test scenario for schedule retry',
  retry_count = 1,
  next_retry_at = NULL,  -- No retry scheduled (this is why it's orphaned)
  current_workflow = NULL,
  started_at = NULL,
  next_workflow = '4',
  updated_at = NOW()
WHERE amazon_order_id = 'JOHN-TEST5'
  AND id = 175;

-- ============================================
-- SCENARIO 4: ORPHANED - MANUAL REVIEW
-- ============================================
-- Order: Create a new test order or use an existing one
-- Path: Orphaned Orders -> Manual Review
-- Expected: Classified as require_manual_review, marked for manual review

-- Note: You'll need to adjust the WHERE clause to match an available order
-- This scenario requires:
-- - orphan_reason: 'ready_not_picked_up'
-- - next_workflow: '4'
-- - one_manifest_url: NULL (missing manifest at workflow 4)
-- - execution_status: 'ready_for_processing'
-- - queued_at: < NOW() - 30 minutes

-- Example (uncomment and adjust order ID):
-- UPDATE orders
-- SET 
--   execution_status = 'ready_for_processing',
--   next_workflow = '4',
--   one_manifest_url = NULL,
--   one_manifest_key = NULL,
--   current_workflow = NULL,
--   started_at = NULL,
--   error_message = NULL,
--   error_type = NULL,
--   queued_at = NOW() - INTERVAL '1 hour',  -- Queued > 30 minutes ago
--   updated_at = NOW() - INTERVAL '1 hour'
-- WHERE amazon_order_id = 'YOUR-ORDER-ID'
--   AND id = YOUR_ORDER_ID;

-- ============================================
-- SCENARIO 5: ORPHANED - RESET PROCESSING
-- ============================================
-- Order: Use another test order
-- Path: Orphaned Orders -> Reset Processing
-- Expected: Classified as reset_processing, reset to ready_for_processing

-- This scenario requires:
-- - orphan_reason: 'ready_not_picked_up'
-- - next_workflow: '2A' or '2B' or '3' (not workflow 4)
-- - execution_status: 'ready_for_processing'
-- - queued_at: < NOW() - 30 minutes

-- Example (uncomment and adjust order ID):
-- UPDATE orders
-- SET 
--   execution_status = 'ready_for_processing',
--   next_workflow = '2A',
--   current_workflow = NULL,
--   started_at = NULL,
--   error_message = NULL,
--   error_type = NULL,
--   queued_at = NOW() - INTERVAL '1 hour',  -- Queued > 30 minutes ago
--   updated_at = NOW() - INTERVAL '1 hour'
-- WHERE amazon_order_id = 'YOUR-ORDER-ID'
--   AND id = YOUR_ORDER_ID;

-- ============================================
-- Verify all test scenarios
-- ============================================
SELECT 
  id,
  amazon_order_id,
  execution_status,
  current_workflow,
  next_workflow,
  error_type,
  retry_count,
  next_retry_at,
  started_at,
  queued_at,
  one_manifest_url,
  -- Stuck status
  CASE 
    WHEN execution_status = 'processing' 
         AND started_at IS NOT NULL 
         AND started_at < NOW() - INTERVAL '30 minutes'
    THEN '✅ STUCK'
    ELSE NULL
  END as stuck_status,
  -- Retry status
  CASE 
    WHEN execution_status = 'error' 
         AND next_retry_at IS NOT NULL 
         AND next_retry_at <= NOW() 
         AND retry_count < 3
    THEN '✅ RETRY-READY'
    ELSE NULL
  END as retry_status,
  -- Orphaned classification (simplified)
  CASE 
    WHEN execution_status = 'error' 
         AND next_retry_at IS NULL 
         AND (retry_count IS NULL OR retry_count < 3)
    THEN 'ORPHANED: error_no_retry_scheduled'
    WHEN execution_status = 'ready_for_processing' 
         AND queued_at IS NOT NULL 
         AND queued_at < NOW() - INTERVAL '30 minutes'
         AND next_workflow = '4'
         AND one_manifest_url IS NULL
    THEN 'ORPHANED: ready_not_picked_up -> manual_review'
    WHEN execution_status = 'ready_for_processing' 
         AND queued_at IS NOT NULL 
         AND queued_at < NOW() - INTERVAL '30 minutes'
         AND next_workflow != '4'
    THEN 'ORPHANED: ready_not_picked_up -> reset_processing'
    ELSE NULL
  END as orphaned_classification,
  -- Minutes calculations
  CASE 
    WHEN started_at IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (NOW() - started_at)) / 60
    ELSE NULL
  END as minutes_stuck,
  CASE 
    WHEN queued_at IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (NOW() - queued_at)) / 60
    ELSE NULL
  END as minutes_since_queued
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
ORDER BY 
  CASE execution_status
    WHEN 'processing' THEN 1
    WHEN 'error' THEN 2
    WHEN 'ready_for_processing' THEN 3
    ELSE 4
  END,
  amazon_order_id;

