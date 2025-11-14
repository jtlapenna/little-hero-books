-- Diagnose why W1.1 thinks there are 5 orders processing
-- This identifies orders stuck in 'processing' state that are blocking new orders

-- 1. Check the queue_status view (what W1.1 uses)
SELECT * FROM queue_status;

-- 2. Find ALL orders stuck in 'processing' state
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
  -- Calculate how long they've been processing
  EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 as minutes_processing,
  CASE 
    WHEN started_at IS NULL THEN '⚠️ No started_at timestamp'
    WHEN started_at < NOW() - INTERVAL '1 hour' THEN '🔴 STUCK > 1 hour'
    WHEN started_at < NOW() - INTERVAL '30 minutes' THEN '🟠 STUCK > 30 minutes'
    WHEN started_at < NOW() - INTERVAL '10 minutes' THEN '🟡 Processing > 10 minutes'
    ELSE '🟢 Recently started'
  END as stuck_status
FROM orders
WHERE execution_status = 'processing'
ORDER BY started_at ASC NULLS LAST;

-- 3. Check if queue_status view exists and what it returns
-- If view doesn't exist, check the function
SELECT 
  COUNT(*) FILTER (WHERE execution_status = 'processing') as processing_count,
  COUNT(*) FILTER (WHERE execution_status = 'ready_for_processing') as queued_count
FROM orders;

-- 4. Find orders that should NOT be in 'processing' state
-- (e.g., started_at is very old, or workflow completed but status wasn't updated)
SELECT 
  amazon_order_id,
  execution_status,
  current_workflow,
  started_at,
  EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 as minutes_processing,
  status,
  workflow_step,
  -- Check if there's a manifest that suggests the workflow completed
  manifest_2a_url IS NOT NULL as has_2a_manifest,
  manifest_2b_url IS NOT NULL as has_2b_manifest,
  manifest_3_url IS NOT NULL as has_3_manifest
FROM orders
WHERE execution_status = 'processing'
  AND (
    -- Stuck for more than 1 hour
    started_at < NOW() - INTERVAL '1 hour'
    -- Or no started_at timestamp (shouldn't be processing)
    OR started_at IS NULL
  )
ORDER BY started_at ASC NULLS LAST;

-- 5. Check for orders that might have completed but weren't updated
-- (e.g., have manifests but still marked as processing)
SELECT 
  amazon_order_id,
  execution_status,
  current_workflow,
  started_at,
  manifest_2a_url IS NOT NULL as has_2a_manifest,
  manifest_2b_url IS NOT NULL as has_2b_manifest,
  manifest_3_url IS NOT NULL as has_3_manifest,
  lulu_status,
  status as overall_status
FROM orders
WHERE execution_status = 'processing'
ORDER BY started_at ASC NULLS LAST;

