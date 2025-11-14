-- SQL to set up one order for each of the three Health Monitor paths simultaneously
-- This will test all three paths (Stuck, Retry, Orphaned) in a single Health Monitor run
--
-- Orders used:
-- - JESSICA-CUNT (ID: 171) -> Stuck path
-- - JOHN-TEST4 (ID: 170) -> Retry path
-- - JOHN-TEST5 (ID: 175) -> Orphaned path (Schedule Retry action)

-- ============================================
-- PATH 1: STUCK ORDER
-- ============================================
-- Order: JESSICA-CUNT (ID: 171)
-- Requirements:
-- - execution_status = 'processing'
-- - started_at > 30 minutes ago (stuck threshold)
-- - current_workflow set to a workflow
-- - NOT also caught by orphaned query (so keep it < 1 hour)

UPDATE orders
SET 
  execution_status = 'processing',
  current_workflow = '2A',
  started_at = NOW() - INTERVAL '45 minutes',  -- Stuck for 45 minutes (> 30 min threshold, < 1 hour orphaned threshold)
  updated_at = NOW() - INTERVAL '45 minutes',
  retry_count = 0,
  error_message = NULL,
  error_type = NULL,
  next_retry_at = NULL,
  next_workflow = '2A'
WHERE amazon_order_id = 'JESSICA-CUNT'
  AND id = 171;

-- ============================================
-- PATH 2: RETRY-READY ORDER
-- ============================================
-- Order: JOHN-TEST4 (ID: 170)
-- Requirements:
-- - execution_status = 'error'
-- - next_retry_at <= NOW() (retry time has arrived)
-- - retry_count < 3 (hasn't exceeded max retries)
-- - character_hash required for retry processing

UPDATE orders
SET 
  execution_status = 'error',
  error_type = 'workflow_timeout',
  error_message = 'Workflow timed out - ready for retry',
  retry_count = 1,  -- Must be < 3
  next_retry_at = NOW() - INTERVAL '5 minutes',  -- Retry time has passed
  next_workflow = '2A',  -- Workflow to retry
  current_workflow = NULL,  -- Clear current workflow
  started_at = NULL,  -- Clear started_at
  updated_at = NOW()
WHERE amazon_order_id = 'JOHN-TEST4'
  AND id = 170;

-- ============================================
-- PATH 3: ORPHANED ORDER (Schedule Retry action)
-- ============================================
-- Order: JOHN-TEST5 (ID: 175)
-- Requirements:
-- - Will be detected by get_orphaned_orders() function
-- - Should be classified as 'error_no_retry_scheduled' or similar
-- - Should route to 'schedule_retry' action
-- - Set queued_at to ensure it's picked up as orphaned

UPDATE orders
SET 
  execution_status = 'error',
  error_type = 'missing_manifest',
  error_message = 'Missing required 1-manifest.json file - test scenario for orphaned schedule retry',
  retry_count = 1,  -- < 3 so it will schedule retry
  next_retry_at = NULL,  -- No retry scheduled (this is why it's orphaned)
  next_workflow = '4',
  current_workflow = NULL,
  started_at = NULL,
  queued_at = NOW() - INTERVAL '2 hours',  -- Queued 2 hours ago (will be detected as orphaned)
  updated_at = NOW() - INTERVAL '2 hours',
  workflow_step = 'book_assembly_completed',
  one_manifest_url = NULL  -- Missing manifest
WHERE amazon_order_id = 'JOHN-TEST5'
  AND id = 175;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify Stuck Order
SELECT 
  'STUCK PATH' as path,
  id,
  amazon_order_id,
  execution_status,
  current_workflow,
  started_at,
  EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 as minutes_stuck,
  CASE 
    WHEN execution_status = 'processing' 
         AND started_at IS NOT NULL 
         AND started_at < NOW() - INTERVAL '30 minutes'
    THEN '✅ WILL BE DETECTED AS STUCK'
    ELSE '❌ Not stuck'
  END as status
FROM orders
WHERE amazon_order_id = 'JESSICA-CUNT'
  AND id = 171;

-- Verify Retry Order
SELECT 
  'RETRY PATH' as path,
  id,
  amazon_order_id,
  execution_status,
  error_type,
  retry_count,
  next_retry_at,
  next_workflow,
  character_hash,
  CASE 
    WHEN execution_status = 'error' 
         AND next_retry_at IS NOT NULL 
         AND next_retry_at <= NOW() 
         AND retry_count < 3
    THEN '✅ WILL BE DETECTED AS RETRY-READY'
    ELSE '❌ Not retry-ready'
  END as status
FROM orders
WHERE amazon_order_id = 'JOHN-TEST4'
  AND id = 170;

-- Verify Orphaned Order
SELECT 
  'ORPHANED PATH' as path,
  id,
  amazon_order_id,
  execution_status,
  error_type,
  retry_count,
  next_retry_at,
  next_workflow,
  queued_at,
  EXTRACT(EPOCH FROM (NOW() - queued_at)) / 60 as minutes_since_queued,
  one_manifest_url,
  CASE 
    WHEN execution_status = 'error' 
         AND next_retry_at IS NULL
         AND retry_count < 3
    THEN '✅ LIKELY ORPHANED (check get_orphaned_orders() function)'
    ELSE '❓ Check manually'
  END as status
FROM orders
WHERE amazon_order_id = 'JOHN-TEST5'
  AND id = 175;

-- ============================================
-- SUMMARY: All three orders ready
-- ============================================
SELECT 
  amazon_order_id,
  execution_status,
  CASE 
    WHEN amazon_order_id = 'JESSICA-CUNT' THEN 'STUCK'
    WHEN amazon_order_id = 'JOHN-TEST4' THEN 'RETRY'
    WHEN amazon_order_id = 'JOHN-TEST5' THEN 'ORPHANED'
  END as expected_path,
  current_workflow,
  started_at,
  next_retry_at,
  retry_count,
  error_type
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
  AND id IN (171, 170, 175)
ORDER BY 
  CASE amazon_order_id
    WHEN 'JESSICA-CUNT' THEN 1
    WHEN 'JOHN-TEST4' THEN 2
    WHEN 'JOHN-TEST5' THEN 3
  END;

