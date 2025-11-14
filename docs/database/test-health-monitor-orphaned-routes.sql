-- Test data setup for Health Monitor W1.5 orphaned recovery routes
-- This script sets up test orders for Schedule Retry and Manual Review paths

-- ============================================
-- TEST 1: Schedule Retry Path
-- ============================================
-- Order should have:
-- - orphan_reason: 'error_no_retry_scheduled'
-- - retry_count < 3
-- - execution_status: 'error'
-- - next_retry_at: null or in the past
-- This will be classified as action: 'schedule_retry'

UPDATE orders
SET 
  execution_status = 'error',
  error_type = 'missing_manifest',
  error_message = 'Missing required 1-manifest.json file - test scenario for schedule retry',
  retry_count = 1,
  next_retry_at = NULL,
  current_workflow = NULL,
  started_at = NULL,
  updated_at = NOW()
WHERE amazon_order_id = 'JESSICA-CUNT'
  AND id = 171;

-- Verify the update
SELECT 
  id,
  amazon_order_id,
  execution_status,
  error_type,
  retry_count,
  next_retry_at,
  current_workflow,
  started_at
FROM orders
WHERE amazon_order_id = 'JESSICA-CUNT'
  AND id = 171;

-- ============================================
-- TEST 2: Manual Review Path
-- ============================================
-- Order should have:
-- - orphan_reason: 'ready_not_picked_up'
-- - next_workflow: '4'
-- - one_manifest_url: NULL (missing manifest)
-- - execution_status: 'ready_for_processing'
-- This will be classified as action: 'require_manual_review'

UPDATE orders
SET 
  execution_status = 'ready_for_processing',
  next_workflow = '4',
  one_manifest_url = NULL,
  one_manifest_key = NULL,
  current_workflow = NULL,
  started_at = NULL,
  error_message = NULL,
  error_type = NULL,
  updated_at = NOW()
WHERE amazon_order_id = 'JOHN-TEST4'
  AND id = 170;

-- Verify the update
SELECT 
  id,
  amazon_order_id,
  execution_status,
  next_workflow,
  one_manifest_url,
  current_workflow,
  started_at
FROM orders
WHERE amazon_order_id = 'JOHN-TEST4'
  AND id = 170;

-- ============================================
-- TEST 3: Reset Processing Path (Already tested)
-- ============================================
-- Order should have:
-- - orphan_reason: 'ready_not_picked_up'
-- - next_workflow: '2A' (not workflow 4)
-- - execution_status: 'ready_for_processing'
-- This will be classified as action: 'reset_processing'
-- (JOHN-TEST5 is already set up for this)

-- ============================================
-- Set queued_at for ready_for_processing orders
-- ============================================
-- get_orphaned_orders() requires queued_at < NOW() - INTERVAL '30 minutes'
-- for orders with execution_status = 'ready_for_processing'
-- Set queued_at to 1 hour ago to ensure they're picked up

UPDATE orders
SET 
  queued_at = NOW() - INTERVAL '1 hour',
  updated_at = NOW() - INTERVAL '1 hour'
WHERE amazon_order_id IN ('JOHN-TEST4', 'JOHN-TEST5')
  AND execution_status = 'ready_for_processing';

-- ============================================
-- Verify all test orders are ready
-- ============================================
SELECT 
  id,
  amazon_order_id,
  execution_status,
  error_type,
  retry_count,
  next_retry_at,
  next_workflow,
  one_manifest_url,
  current_workflow,
  started_at,
  queued_at,
  updated_at,
  -- Calculate minutes since queued_at (for ready orders)
  CASE 
    WHEN queued_at IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (NOW() - queued_at)) / 60
    ELSE NULL
  END as minutes_since_queued
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
ORDER BY amazon_order_id;

