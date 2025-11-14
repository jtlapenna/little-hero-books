-- Test data setup for Health Monitor W1.5 Stuck Orders path
-- Stuck orders: execution_status = 'processing' AND started_at < NOW() - 30 minutes
-- 
-- IMPORTANT: To ensure orders route to STUCK path (not orphaned):
-- - started_at must be > 30 minutes ago (for stuck query)
-- - started_at must be < 1 hour ago (to avoid orphaned classification)
-- - The orphaned query classifies processing orders stuck > 1 hour as 'processing_stuck_over_hour'
-- - So for pure stuck path testing, use 30-60 minutes range

-- ============================================
-- TEST: Stuck Order (Processing > 30 minutes, < 1 hour)
-- ============================================
-- Order should have:
-- - execution_status: 'processing'
-- - started_at: > 30 minutes ago BUT < 1 hour ago (to avoid orphaned classification)
-- - current_workflow: any workflow (2A, 2B, 3, or 4)
-- This will be detected by the stuck query and processed by the Stuck path
-- (NOT by the orphaned query, which only catches orders stuck > 1 hour)

-- Use an existing order or create a test scenario
-- Let's use a test order ID - adjust the WHERE clause to match an existing order
UPDATE orders
SET 
  execution_status = 'processing',
  current_workflow = '2A',
  started_at = NOW() - INTERVAL '45 minutes',  -- Stuck for 45 minutes (> 30 min, < 1 hour)
  updated_at = NOW() - INTERVAL '45 minutes',
  retry_count = 0,
  error_message = NULL,
  error_type = NULL,
  next_retry_at = NULL  -- Ensure no retry scheduled
WHERE amazon_order_id = 'JESSICA-CUNT'
  AND id = 171;

-- Verify the update
SELECT 
  id,
  amazon_order_id,
  execution_status,
  current_workflow,
  started_at,
  retry_count,
  -- Calculate minutes stuck
  EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 as minutes_stuck,
  -- Check if it will be detected by stuck query (> 30 minutes)
  CASE 
    WHEN started_at < NOW() - INTERVAL '30 minutes' 
         AND started_at >= NOW() - INTERVAL '1 hour'
    THEN '✅ WILL BE DETECTED AS STUCK (not orphaned)'
    WHEN started_at < NOW() - INTERVAL '1 hour'
    THEN '⚠️ WILL BE DETECTED AS BOTH STUCK AND ORPHANED'
    WHEN started_at < NOW() - INTERVAL '30 minutes'
    THEN '✅ WILL BE DETECTED AS STUCK'
    ELSE '❌ Not stuck yet'
  END as stuck_status,
  -- Check if it will also be detected as orphaned
  CASE 
    WHEN started_at < NOW() - INTERVAL '1 hour'
    THEN '⚠️ ALSO ORPHANED (processing_stuck_over_hour)'
    WHEN started_at IS NULL
    THEN '⚠️ ALSO ORPHANED (processing_no_timestamp)'
    ELSE '✅ Not orphaned'
  END as orphaned_status
FROM orders
WHERE amazon_order_id = 'JESSICA-CUNT'
  AND id = 171;

-- ============================================
-- Optional: Create multiple stuck orders for testing
-- ============================================
-- Uncomment and adjust order IDs as needed

-- UPDATE orders
-- SET 
--   execution_status = 'processing',
--   current_workflow = '2B',
--   started_at = NOW() - INTERVAL '1 hour',
--   updated_at = NOW() - INTERVAL '1 hour',
--   retry_count = 1
-- WHERE amazon_order_id = 'JOHN-TEST4'
--   AND id = 170;

-- UPDATE orders
-- SET 
--   execution_status = 'processing',
--   current_workflow = '3',
--   started_at = NOW() - INTERVAL '2 hours',
--   updated_at = NOW() - INTERVAL '2 hours',
--   retry_count = 0
-- WHERE amazon_order_id = 'JOHN-TEST5'
--   AND id = 175;

-- ============================================
-- Verify all stuck orders
-- ============================================
SELECT 
  id,
  amazon_order_id,
  execution_status,
  current_workflow,
  started_at,
  retry_count,
  EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 as minutes_stuck,
  CASE 
    WHEN started_at < NOW() - INTERVAL '30 minutes' 
         AND started_at >= NOW() - INTERVAL '1 hour'
    THEN '✅ STUCK (not orphaned)'
    WHEN started_at < NOW() - INTERVAL '1 hour'
    THEN '⚠️ STUCK + ORPHANED'
    WHEN started_at IS NULL
    THEN '⚠️ ORPHANED (no timestamp)'
    ELSE '❌ Not stuck'
  END as classification_status
FROM orders
WHERE execution_status = 'processing'
  AND started_at < NOW() - INTERVAL '30 minutes'
ORDER BY started_at ASC;

