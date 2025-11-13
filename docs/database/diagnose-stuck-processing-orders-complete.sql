-- Complete diagnostic for stuck processing orders blocking W1.1
-- Run these queries in Supabase SQL Editor to identify the problem

-- ============================================
-- PART 1: Check queue_status view/function
-- ============================================

-- 1a. Check if queue_status view exists
SELECT 
  table_name, 
  table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'queue_status';

-- 1b. If view exists, check what it returns
SELECT * FROM queue_status;

-- 1c. If view doesn't exist, check the function
SELECT get_queue_status();

-- 1d. Manual calculation (what queue_status should show)
SELECT 
  COUNT(*) FILTER (WHERE execution_status = 'processing') as processing_count,
  COUNT(*) FILTER (WHERE execution_status = 'ready_for_processing') as queued_count,
  COUNT(*) as total_orders
FROM orders;

-- ============================================
-- PART 2: Find stuck orders
-- ============================================

-- 2a. ALL orders in 'processing' state (these are blocking new orders)
SELECT 
  id,
  amazon_order_id,
  execution_status,
  current_workflow,
  started_at,
  queued_at,
  next_workflow,
  workflow_step,
  status,
  -- How long stuck
  EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 as minutes_processing,
  -- Stuck status
  CASE 
    WHEN started_at IS NULL THEN '⚠️ No started_at timestamp'
    WHEN started_at < NOW() - INTERVAL '1 hour' THEN '🔴 STUCK > 1 hour'
    WHEN started_at < NOW() - INTERVAL '30 minutes' THEN '🟠 STUCK > 30 minutes'
    WHEN started_at < NOW() - INTERVAL '10 minutes' THEN '🟡 Processing > 10 minutes'
    ELSE '🟢 Recently started'
  END as stuck_status,
  -- Check if workflow might have completed
  manifest_2a_url IS NOT NULL as has_2a_manifest,
  manifest_2b_url IS NOT NULL as has_2b_manifest,
  manifest_3_url IS NOT NULL as has_3_manifest,
  lulu_status
FROM orders
WHERE execution_status = 'processing'
ORDER BY started_at ASC NULLS LAST;

-- 2b. Count by stuck duration
SELECT 
  CASE 
    WHEN started_at IS NULL THEN 'No timestamp'
    WHEN started_at < NOW() - INTERVAL '1 hour' THEN '> 1 hour'
    WHEN started_at < NOW() - INTERVAL '30 minutes' THEN '30 min - 1 hour'
    WHEN started_at < NOW() - INTERVAL '10 minutes' THEN '10 - 30 min'
    ELSE '< 10 minutes'
  END as duration_category,
  COUNT(*) as count
FROM orders
WHERE execution_status = 'processing'
GROUP BY duration_category
ORDER BY 
  CASE duration_category
    WHEN 'No timestamp' THEN 1
    WHEN '> 1 hour' THEN 2
    WHEN '30 min - 1 hour' THEN 3
    WHEN '10 - 30 min' THEN 4
    ELSE 5
  END;

-- ============================================
-- PART 3: Check for orders that completed but weren't updated
-- ============================================

-- 3a. Orders marked 'processing' but have manifests (suggests workflow completed)
SELECT 
  amazon_order_id,
  execution_status,
  current_workflow,
  started_at,
  manifest_2a_url IS NOT NULL as has_2a,
  manifest_2b_url IS NOT NULL as has_2b,
  manifest_3_url IS NOT NULL as has_3,
  lulu_status,
  status as overall_status
FROM orders
WHERE execution_status = 'processing'
  AND (
    manifest_2a_url IS NOT NULL 
    OR manifest_2b_url IS NOT NULL 
    OR manifest_3_url IS NOT NULL
    OR lulu_status IS NOT NULL
  )
ORDER BY started_at ASC NULLS LAST;

-- ============================================
-- PART 4: Summary for quick diagnosis
-- ============================================

-- 4. Quick summary
SELECT 
  'Processing' as status,
  COUNT(*) as count,
  MIN(started_at) as oldest_started,
  MAX(started_at) as newest_started,
  AVG(EXTRACT(EPOCH FROM (NOW() - started_at)) / 60) as avg_minutes_processing
FROM orders
WHERE execution_status = 'processing'

UNION ALL

SELECT 
  'Ready for Processing' as status,
  COUNT(*) as count,
  MIN(queued_at) as oldest_queued,
  MAX(queued_at) as newest_queued,
  NULL as avg_minutes_processing
FROM orders
WHERE execution_status = 'ready_for_processing';

