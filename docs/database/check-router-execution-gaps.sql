-- Check for router execution gaps and why ready_for_processing orders aren't being picked up
-- This helps diagnose if W1.1 router is skipping executions

-- 1. Check current router capacity and ready orders
SELECT 
  'Current Status' as check_type,
  (SELECT COUNT(*) FROM orders WHERE execution_status = 'processing') as processing_count,
  (SELECT COUNT(*) FROM orders WHERE execution_status = 'ready_for_processing' AND next_workflow IS NOT NULL) as ready_count,
  (SELECT COUNT(*) FROM orders WHERE execution_status = 'ready_for_processing' AND next_workflow IS NULL) as ready_no_workflow
FROM orders
LIMIT 1;

-- 2. Check ready_for_processing orders and their eligibility
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  priority,
  queued_at,
  EXTRACT(EPOCH FROM (NOW() - queued_at)) / 60 as minutes_queued,
  CASE 
    WHEN next_workflow IS NULL THEN '❌ Missing next_workflow'
    WHEN next_workflow NOT IN ('2A', '2B', '3', '4') THEN '❌ Invalid next_workflow: ' || next_workflow
    WHEN execution_status != 'ready_for_processing' THEN '❌ Wrong status: ' || execution_status
    ELSE '✅ Should be picked up by router'
  END as router_eligibility,
  -- Check if blocked by priority
  (SELECT COUNT(*) FROM orders o2 
   WHERE o2.execution_status = 'ready_for_processing' 
     AND o2.next_workflow = orders.next_workflow
     AND (
       (o2.priority = 'high' AND orders.priority != 'high')
       OR (o2.priority = 'normal' AND orders.priority = 'low')
       OR (o2.queued_at < orders.queued_at)
     )
  ) as orders_ahead_by_priority
FROM orders
WHERE execution_status = 'ready_for_processing'
ORDER BY 
  priority DESC,
  queued_at ASC;

-- 3. Check for orders that should have been picked up but weren't
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  queued_at,
  EXTRACT(EPOCH FROM (NOW() - queued_at)) / 60 as minutes_queued,
  'Should have been picked up > 30 min ago' as issue
FROM orders
WHERE execution_status = 'ready_for_processing'
  AND next_workflow IS NOT NULL
  AND queued_at < NOW() - INTERVAL '30 minutes'
ORDER BY queued_at ASC;

-- 4. Check router query conditions (what W1.1 actually queries for)
-- W1.1 queries: execution_status = 'ready_for_processing' AND next_workflow IS NOT NULL
-- Then checks capacity: processing_count < 5
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  queued_at,
  CASE 
    WHEN execution_status = 'ready_for_processing' AND next_workflow IS NOT NULL 
    THEN '✅ Matches router query'
    ELSE '❌ Does NOT match router query'
  END as matches_router_query,
  CASE 
    WHEN (SELECT COUNT(*) FROM orders WHERE execution_status = 'processing') >= 5
    THEN '❌ Router at capacity (>= 5 processing)'
    ELSE '✅ Router has capacity'
  END as capacity_check
FROM orders
WHERE amazon_order_id IN ('JOHN-TEST4', 'JOHN-TEST5')
ORDER BY queued_at ASC;

