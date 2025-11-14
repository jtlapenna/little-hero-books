-- Comprehensive diagnostic query for orphaned orders
-- Run this for each order to understand why it's not processing

-- Replace 'ORDER-ID-HERE' with the actual order ID (e.g., 'JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
-- Or use IN clause for multiple orders: WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')

SELECT 
  -- Basic Order Info
  id,
  amazon_order_id,
  created_at,
  updated_at,
  
  -- Execution Status
  execution_status,
  status as overall_status,
  
  -- Workflow State
  workflow_step,
  current_workflow,
  next_workflow,
  
  -- Error Information
  error_type,
  error_message,
  retry_count,
  next_retry_at,
  
  -- Timing Information
  queued_at,
  started_at,
  CASE 
    WHEN started_at IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (NOW() - started_at)) / 60
    ELSE NULL
  END as minutes_processing,
  CASE 
    WHEN queued_at IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (NOW() - queued_at)) / 60
    ELSE NULL
  END as minutes_queued,
  
  -- Priority & Capacity
  priority,
  
  -- Manifest Status
  one_manifest_url IS NOT NULL as has_1_manifest,
  manifest_2a_url IS NOT NULL as has_2a_manifest,
  manifest_2b_url IS NOT NULL as has_2b_manifest,
  manifest_3_url IS NOT NULL as has_3_manifest,
  
  -- Router Eligibility
  CASE 
    WHEN execution_status = 'ready_for_processing' AND next_workflow IS NOT NULL 
    THEN '✅ Router will pick up'
    WHEN execution_status = 'ready_for_processing' AND next_workflow IS NULL 
    THEN '❌ Missing next_workflow (router ignores)'
    WHEN execution_status = 'processing' 
    THEN '❌ Already processing (router ignores)'
    WHEN execution_status = 'error' AND next_retry_at IS NOT NULL AND next_retry_at <= NOW() AND retry_count < 3
    THEN '✅ Ready for W1.3 retry'
    WHEN execution_status = 'error' AND retry_count >= 3
    THEN '❌ Max retries exceeded (needs manual review)'
    WHEN execution_status = 'error_requires_manual_review'
    THEN '⚠️ Requires manual review'
    ELSE '❓ Unknown state: ' || execution_status
  END as router_status,
  
  -- W1.3 Retry Eligibility
  CASE 
    WHEN execution_status != 'error' THEN '❌ Wrong status: ' || execution_status
    WHEN next_retry_at IS NULL THEN '❌ Missing next_retry_at'
    WHEN next_retry_at > NOW() THEN '⏳ Waiting: ' || ROUND(EXTRACT(EPOCH FROM (next_retry_at - NOW())) / 60, 1) || ' min'
    WHEN retry_count >= 3 THEN '❌ Max retries reached (>= 3)'
    WHEN execution_status = 'error' 
         AND next_retry_at <= NOW() 
         AND retry_count < 3
    THEN '✅ READY FOR W1.3'
    ELSE '❓ Unknown issue'
  END as w1_3_status,
  
  -- Character Specs Status (for missing data investigation)
  CASE 
    WHEN character_specs IS NULL THEN '❌ NULL'
    WHEN character_specs::text = '{}' THEN '⚠️ Empty object'
    ELSE '✅ Has data'
  END as character_specs_status,
  CASE 
    WHEN product_info IS NULL THEN '❌ NULL'
    WHEN product_info::text = '{}' THEN '⚠️ Empty object'
    ELSE '✅ Has data'
  END as product_info_status

FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
ORDER BY updated_at DESC;

-- ============================================
-- Additional: Check failed_orders table
-- ============================================
-- This shows detailed error history from W1.2
SELECT 
  fo.id,
  fo.order_id,
  o.amazon_order_id,
  fo.error_type,
  fo.error_message,
  fo.error_details,
  fo.retry_count,
  fo.failed_at,
  fo.workflow_step
FROM failed_orders fo
JOIN orders o ON fo.order_id = o.id
WHERE o.amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
ORDER BY fo.failed_at DESC;

-- ============================================
-- Additional: Check router capacity
-- ============================================
-- This shows if router is at capacity
SELECT * FROM queue_status;

-- Count processing orders
SELECT 
  COUNT(*) as processing_count,
  COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '1 hour') as stuck_over_hour,
  COUNT(*) FILTER (WHERE started_at IS NULL) as no_timestamp
FROM orders
WHERE execution_status = 'processing';

-- ============================================
-- Additional: Check for blocking orders
-- ============================================
-- Orders that might be blocking router capacity
SELECT 
  amazon_order_id,
  execution_status,
  current_workflow,
  started_at,
  EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 as minutes_processing
FROM orders
WHERE execution_status = 'processing'
ORDER BY started_at ASC;

