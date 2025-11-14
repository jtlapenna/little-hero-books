-- Test data setup for Health Monitor W1.5 Stuck Orders path
-- Stuck orders: execution_status = 'processing' AND started_at < NOW() - 30 minutes

-- ============================================
-- TEST: Stuck Order (Processing > 30 minutes)
-- ============================================
-- Order should have:
-- - execution_status: 'processing'
-- - started_at: > 30 minutes ago
-- - current_workflow: any workflow (2A, 2B, 3, or 4)
-- This will be detected by the stuck query and processed by the Stuck path

-- Use an existing order or create a test scenario
-- Let's use a test order ID - adjust the WHERE clause to match an existing order
UPDATE orders
SET 
  execution_status = 'processing',
  current_workflow = '2A',
  started_at = NOW() - INTERVAL '45 minutes',  -- Stuck for 45 minutes (> 30 min threshold)
  updated_at = NOW() - INTERVAL '45 minutes',
  retry_count = 0,
  error_message = NULL,
  error_type = NULL
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
  -- Check if it will be detected (should be > 30 minutes)
  CASE 
    WHEN started_at < NOW() - INTERVAL '30 minutes' THEN '✅ WILL BE DETECTED AS STUCK'
    ELSE '❌ Not stuck yet'
  END as stuck_status
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
    WHEN started_at < NOW() - INTERVAL '30 minutes' THEN '✅ STUCK'
    ELSE '❌ Not stuck'
  END as stuck_status
FROM orders
WHERE execution_status = 'processing'
  AND started_at < NOW() - INTERVAL '30 minutes'
ORDER BY started_at ASC;

