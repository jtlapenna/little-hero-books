-- View all orders with their current stages and processing status
-- This shows execution_status, workflow_step, current_workflow, and more

SELECT 
  id,
  amazon_order_id,
  execution_status,
  status as overall_status,
  workflow_step,
  current_workflow,
  next_workflow,
  priority,
  started_at,
  queued_at,
  created_at,
  updated_at,
  -- Calculate how long processing (if applicable)
  CASE 
    WHEN execution_status = 'processing' AND started_at IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (NOW() - started_at)) / 60
    ELSE NULL
  END as minutes_processing,
  -- Stuck status indicator
  CASE 
    WHEN execution_status = 'processing' AND started_at IS NULL THEN '⚠️ No timestamp'
    WHEN execution_status = 'processing' AND started_at < NOW() - INTERVAL '1 hour' THEN '🔴 Stuck > 1h'
    WHEN execution_status = 'processing' AND started_at < NOW() - INTERVAL '30 minutes' THEN '🟠 Stuck > 30m'
    WHEN execution_status = 'processing' THEN '🟡 Processing'
    WHEN execution_status = 'ready_for_processing' THEN '🟢 Ready'
    WHEN execution_status = 'done' THEN '✅ Done'
    ELSE '❓ ' || execution_status
  END as status_indicator,
  -- Manifest status
  manifest_2a_url IS NOT NULL as has_2a_manifest,
  manifest_2b_url IS NOT NULL as has_2b_manifest,
  manifest_3_url IS NOT NULL as has_3_manifest,
  -- Lulu status
  lulu_status,
  lulu_job_id
FROM orders
ORDER BY 
  -- Put processing orders first, then by started_at
  CASE execution_status
    WHEN 'processing' THEN 1
    WHEN 'ready_for_processing' THEN 2
    ELSE 3
  END,
  started_at ASC NULLS LAST,
  created_at DESC;

-- ============================================
-- Summary by execution_status
-- ============================================

SELECT 
  execution_status,
  COUNT(*) as count,
  MIN(started_at) as oldest_started,
  MAX(started_at) as newest_started,
  AVG(EXTRACT(EPOCH FROM (NOW() - started_at)) / 60) as avg_minutes_processing
FROM orders
WHERE execution_status = 'processing'
GROUP BY execution_status

UNION ALL

SELECT 
  execution_status,
  COUNT(*) as count,
  MIN(queued_at) as oldest_queued,
  MAX(queued_at) as newest_queued,
  NULL as avg_minutes_processing
FROM orders
WHERE execution_status = 'ready_for_processing'
GROUP BY execution_status

UNION ALL

SELECT 
  execution_status,
  COUNT(*) as count,
  NULL as oldest,
  NULL as newest,
  NULL as avg_minutes_processing
FROM orders
WHERE execution_status NOT IN ('processing', 'ready_for_processing')
GROUP BY execution_status
ORDER BY execution_status;

-- ============================================
-- Summary by workflow_step
-- ============================================

SELECT 
  workflow_step,
  execution_status,
  COUNT(*) as count
FROM orders
GROUP BY workflow_step, execution_status
ORDER BY workflow_step, execution_status;

-- ============================================
-- Stuck orders only (processing > 30 minutes)
-- ============================================

SELECT 
  amazon_order_id,
  execution_status,
  current_workflow,
  workflow_step,
  started_at,
  EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 as minutes_processing,
  manifest_2a_url IS NOT NULL as has_2a,
  manifest_2b_url IS NOT NULL as has_2b,
  manifest_3_url IS NOT NULL as has_3
FROM orders
WHERE execution_status = 'processing'
  AND (
    started_at < NOW() - INTERVAL '30 minutes'
    OR started_at IS NULL
  )
ORDER BY started_at ASC NULLS LAST;

