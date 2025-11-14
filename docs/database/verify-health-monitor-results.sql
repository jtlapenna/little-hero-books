-- Verification queries to check if orders received correct status updates
-- Run this after executing the Health Monitor workflow to verify results
--
-- This script checks:
-- 1. Stuck orders: Should be marked as error, with retry scheduled OR marked for manual review
-- 2. Retry orders: Should be reset to ready_for_processing, with next_workflow set
-- 3. Orphaned orders: Should have appropriate recovery actions applied
--
-- NOTE: The "POTENTIAL ISSUES" query excludes orders updated in the last 15 minutes
-- to avoid flagging orders that were just processed by the Health Monitor

-- ============================================
-- VERIFY STUCK ORDERS
-- ============================================
-- After processing, stuck orders should:
-- - execution_status = 'error' (marked as error)
-- - Either: next_retry_at set (scheduled for retry) OR execution_status = 'error_requires_manual_review'
-- - retry_count incremented if retry was scheduled

SELECT 
  'STUCK ORDER VERIFICATION' as check_type,
  id,
  amazon_order_id,
  execution_status,
  error_type,
  error_message,
  retry_count,
  next_retry_at,
  CASE 
    WHEN execution_status = 'error' AND next_retry_at IS NOT NULL 
    THEN '✅ Scheduled for retry'
    WHEN execution_status = 'error_requires_manual_review'
    THEN '✅ Marked for manual review'
    WHEN execution_status = 'error' AND next_retry_at IS NULL
    THEN '⚠️  Error but no retry/manual review set'
    ELSE '❌ Unexpected status: ' || execution_status
  END as verification_status,
  CASE 
    WHEN next_retry_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (next_retry_at - NOW())) / 60
    ELSE NULL
  END as minutes_until_retry
FROM orders
WHERE amazon_order_id = 'JESSICA-CUNT'
  AND id = 171;

-- ============================================
-- VERIFY RETRY ORDERS
-- ============================================
-- After processing, retry orders should:
-- - execution_status = 'ready_for_processing' (reset for retry)
-- - next_workflow set to the workflow to retry
-- - current_workflow = NULL
-- - started_at = NULL
-- - error_message = NULL (cleared)
-- - error_type = NULL (cleared)

SELECT 
  'RETRY ORDER VERIFICATION' as check_type,
  id,
  amazon_order_id,
  execution_status,
  next_workflow,
  current_workflow,
  started_at,
  error_type,
  error_message,
  retry_count,
  next_retry_at,
  CASE 
    WHEN execution_status = 'ready_for_processing' 
         AND next_workflow IS NOT NULL
         AND current_workflow IS NULL
         AND started_at IS NULL
         AND error_type IS NULL
    THEN '✅ Correctly reset for retry'
    WHEN execution_status != 'ready_for_processing'
    THEN '❌ Wrong status: ' || execution_status
    WHEN next_workflow IS NULL
    THEN '❌ Missing next_workflow'
    WHEN current_workflow IS NOT NULL
    THEN '⚠️  current_workflow not cleared'
    WHEN started_at IS NOT NULL
    THEN '⚠️  started_at not cleared'
    WHEN error_type IS NOT NULL
    THEN '⚠️  error_type not cleared'
    ELSE '❓ Check manually'
  END as verification_status
FROM orders
WHERE amazon_order_id = 'JOHN-TEST4'
  AND id = 170;

-- ============================================
-- VERIFY ORPHANED ORDERS
-- ============================================
-- After processing, orphaned orders should have different statuses based on recovery action:
-- 
-- Schedule Retry:
--   - execution_status = 'error'
--   - next_retry_at set (future date)
--   - retry_count incremented
--
-- Manual Review:
--   - execution_status = 'error_requires_manual_review'
--   - error_type = 'orphaned_order' or similar
--   - error_message contains "Orphaned order"
--
-- Reset Processing:
--   - execution_status = 'ready_for_processing'
--   - current_workflow = NULL
--   - started_at = NULL
--   - error_message = NULL
--   - error_type = NULL
--
-- Create Manifest:
--   - one_manifest_url should be set (if successful)
--   - OR execution_status = 'error_requires_manual_review' (if failed)

SELECT 
  'ORPHANED ORDER VERIFICATION' as check_type,
  id,
  amazon_order_id,
  execution_status,
  error_type,
  error_message,
  retry_count,
  next_retry_at,
  next_workflow,
  current_workflow,
  started_at,
  one_manifest_url,
  CASE 
    -- Schedule Retry action
    WHEN execution_status = 'error' 
         AND next_retry_at IS NOT NULL 
         AND next_retry_at > NOW()
    THEN '✅ Scheduled for retry (retry_count: ' || retry_count || ')'
    -- Manual Review action
    WHEN execution_status = 'error_requires_manual_review'
         AND error_type LIKE '%orphaned%'
    THEN '✅ Marked for manual review'
    -- Reset Processing action
    WHEN execution_status = 'ready_for_processing'
         AND current_workflow IS NULL
         AND started_at IS NULL
         AND error_type IS NULL
    THEN '✅ Reset for processing'
    -- Create Manifest (success)
    WHEN one_manifest_url IS NOT NULL
         AND execution_status = 'ready_for_processing'
    THEN '✅ Manifest created successfully'
    -- Create Manifest (failed - should be manual review)
    WHEN execution_status = 'error_requires_manual_review'
         AND one_manifest_url IS NULL
         AND error_message LIKE '%manifest%'
    THEN '⚠️  Manifest creation failed - marked for review'
    ELSE '❓ Unknown state - check manually'
  END as verification_status,
  CASE 
    WHEN next_retry_at IS NOT NULL AND next_retry_at > NOW()
    THEN EXTRACT(EPOCH FROM (next_retry_at - NOW())) / 60
    ELSE NULL
  END as minutes_until_retry
FROM orders
WHERE amazon_order_id = 'JOHN-TEST5'
  AND id = 175;

-- ============================================
-- COMPREHENSIVE VERIFICATION SUMMARY
-- ============================================
-- Check all three test orders at once

SELECT 
  amazon_order_id,
  id,
  execution_status,
  error_type,
  retry_count,
  next_retry_at,
  next_workflow,
  current_workflow,
  one_manifest_url,
  CASE 
    WHEN amazon_order_id = 'JESSICA-CUNT' THEN 'STUCK'
    WHEN amazon_order_id = 'JOHN-TEST4' THEN 'RETRY'
    WHEN amazon_order_id = 'JOHN-TEST5' THEN 'ORPHANED'
  END as expected_path,
  CASE 
    -- Stuck order checks
    WHEN amazon_order_id = 'JESSICA-CUNT' THEN
      CASE 
        WHEN execution_status = 'error' AND (next_retry_at IS NOT NULL OR execution_status = 'error_requires_manual_review')
        THEN '✅ Processed correctly'
        ELSE '❌ Not processed correctly'
      END
    -- Retry order checks
    WHEN amazon_order_id = 'JOHN-TEST4' THEN
      CASE 
        WHEN execution_status = 'ready_for_processing' 
             AND next_workflow IS NOT NULL
             AND current_workflow IS NULL
        THEN '✅ Processed correctly'
        ELSE '❌ Not processed correctly'
      END
    -- Orphaned order checks
    WHEN amazon_order_id = 'JOHN-TEST5' THEN
      CASE 
        WHEN (execution_status = 'error' AND next_retry_at IS NOT NULL)
             OR (execution_status = 'error_requires_manual_review')
             OR (execution_status = 'ready_for_processing' AND current_workflow IS NULL)
             OR (one_manifest_url IS NOT NULL)
        THEN '✅ Processed correctly'
        ELSE '❌ Not processed correctly'
      END
    ELSE '❓ Unknown order'
  END as verification_result,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 as minutes_since_update
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
  AND id IN (171, 170, 175)
ORDER BY 
  CASE amazon_order_id
    WHEN 'JESSICA-CUNT' THEN 1
    WHEN 'JOHN-TEST4' THEN 2
    WHEN 'JOHN-TEST5' THEN 3
  END;

-- ============================================
-- CHECK FOR ORDERS STILL IN ERROR STATES
-- ============================================
-- Find orders that might have been missed or failed processing
-- NOTE: Excludes orders updated in the last 15 minutes (recently processed by Health Monitor)

SELECT 
  'POTENTIAL ISSUES' as check_type,
  id,
  amazon_order_id,
  execution_status,
  error_type,
  retry_count,
  next_retry_at,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 as minutes_since_update,
  CASE 
    WHEN execution_status = 'error' 
         AND next_retry_at IS NULL 
         AND retry_count < 3
         AND updated_at < NOW() - INTERVAL '15 minutes'
    THEN '⚠️  Error but no retry scheduled (might need manual review)'
    WHEN execution_status = 'processing'
         AND started_at < NOW() - INTERVAL '1 hour'
         AND updated_at < NOW() - INTERVAL '15 minutes'
    THEN '⚠️  Still processing after 1 hour (might be stuck)'
    WHEN execution_status = 'ready_for_processing'
         AND queued_at < NOW() - INTERVAL '2 hours'
         AND updated_at < NOW() - INTERVAL '15 minutes'
    THEN '⚠️  Ready but not picked up (might be orphaned)'
    ELSE 'OK'
  END as potential_issue
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
  AND id IN (171, 170, 175)
  AND updated_at < NOW() - INTERVAL '15 minutes'  -- Exclude recently processed orders
  AND (
    (execution_status = 'error' AND next_retry_at IS NULL AND retry_count < 3)
    OR (execution_status = 'processing' AND started_at < NOW() - INTERVAL '1 hour')
    OR (execution_status = 'ready_for_processing' AND queued_at < NOW() - INTERVAL '2 hours')
  );

