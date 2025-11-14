-- Test Different Error Scenarios
-- Sets each order to a different error type/status to test system handling
-- Run this in Supabase SQL Editor

-- ============================================
-- SCENARIO 1: JESSICA-CUNT - Missing Manifest
-- ============================================
-- Tests: Missing 1-manifest.json detection and recovery
UPDATE orders
SET 
  execution_status = 'error',
  error_type = 'missing_manifest',
  error_message = 'Missing required 1-manifest.json file - test scenario',
  retry_count = 1,
  next_retry_at = NULL,
  current_workflow = NULL,
  started_at = NULL,
  one_manifest_url = NULL,  -- Remove manifest URL to simulate missing manifest
  updated_at = NOW()
WHERE amazon_order_id = 'JESSICA-CUNT';

-- ============================================
-- SCENARIO 2: JOHN-TEST4 - Stuck Processing (Over 1 Hour)
-- ============================================
-- Tests: W1.2 should detect and mark as error, W1.4 should recover
UPDATE orders
SET 
  execution_status = 'processing',
  error_type = NULL,  -- Not yet marked as error (W1.2 should do this)
  error_message = NULL,
  retry_count = 0,
  next_retry_at = NULL,
  current_workflow = '2A',
  started_at = NOW() - INTERVAL '2 hours',  -- Stuck for 2 hours
  updated_at = NOW() - INTERVAL '2 hours'
WHERE amazon_order_id = 'JOHN-TEST4';

-- ============================================
-- SCENARIO 3: JOHN-TEST5 - API Error (Ready for Retry)
-- ============================================
-- Tests: W1.3 should pick this up and schedule retry
UPDATE orders
SET 
  execution_status = 'error',
  error_type = 'api_error',
  error_message = 'API request failed - test scenario for retry recovery',
  retry_count = 1,  -- Below max (3), so should be retried
  next_retry_at = NOW() - INTERVAL '5 minutes',  -- Ready for retry now
  current_workflow = NULL,
  started_at = NULL,
  updated_at = NOW() - INTERVAL '10 minutes'
WHERE amazon_order_id = 'JOHN-TEST5';

-- ============================================
-- VERIFICATION QUERY
-- ============================================
-- Check the updated orders to verify scenarios
SELECT 
  amazon_order_id,
  execution_status,
  error_type,
  error_message,
  retry_count,
  next_retry_at,
  current_workflow,
  started_at,
  one_manifest_url IS NULL as missing_manifest,
  updated_at,
  -- Calculate time stuck (if processing)
  CASE 
    WHEN execution_status = 'processing' AND started_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (NOW() - started_at)) / 60
    ELSE NULL
  END as minutes_processing,
  -- Calculate time since queued (if ready)
  CASE 
    WHEN execution_status = 'ready_for_processing' AND queued_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (NOW() - queued_at)) / 60
    ELSE NULL
  END as minutes_queued
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
ORDER BY amazon_order_id;

-- ============================================
-- EXPECTED BEHAVIOR AFTER RUNNING WORKFLOWS
-- ============================================
-- 
-- JESSICA-CUNT (Missing Manifest):
--   - W1.4 should detect missing manifest
--   - Should route to "Recover: Create Manifest" action
--   - Should call /api/admin/orders/JESSICA-CUNT/create-manifest
--   - Should create 1-manifest.json and reset to ready_for_processing
--
-- JOHN-TEST4 (Stuck Processing):
--   - W1.2 should detect (processing > 30 min)
--   - Should mark as error with error_type = 'workflow_timeout'
--   - W1.4 should detect as orphaned (processing_stuck_over_hour)
--   - Should route to "Recover: Reset Processing" action
--   - Should reset to ready_for_processing
--
-- JOHN-TEST5 (API Error - Ready for Retry):
--   - W1.3 should detect (error status, next_retry_at <= NOW, retry_count < 3)
--   - Should reset to ready_for_processing
--   - Should increment retry_count to 2
--   - W1.1 should pick it up and route to next workflow
--
-- ============================================
-- RESET TO ORIGINAL STATE (if needed)
-- ============================================
-- Uncomment below to reset all three orders back to a clean state:
/*
UPDATE orders
SET 
  execution_status = 'ready_for_processing',
  error_type = NULL,
  error_message = NULL,
  retry_count = 0,
  next_retry_at = NULL,
  current_workflow = NULL,
  started_at = NULL,
  updated_at = NOW()
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5');
*/

