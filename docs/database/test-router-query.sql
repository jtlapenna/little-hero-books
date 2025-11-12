-- Test what the router would actually fetch
-- This simulates the exact query the router uses

-- 1. Check capacity (what queue_status view shows)
SELECT * FROM queue_status;

-- 2. Simulate router's "Fetch Ready Orders" query
-- Router queries: execution_status = 'ready_for_processing'
-- Ordered by: priority DESC, queued_at ASC
-- Limited by: availableSlots (usually 5)
SELECT 
  id,
  amazon_order_id,
  execution_status,
  status,
  next_workflow,
  current_workflow,
  priority,
  queued_at,
  workflow_step,
  character_specs IS NOT NULL as has_character_specs,
  one_manifest_url IS NOT NULL as has_manifest_url,
  created_at
FROM orders
WHERE execution_status = 'ready_for_processing'
ORDER BY 
  priority DESC NULLS LAST,
  queued_at ASC NULLS LAST
LIMIT 5;

-- 3. Check if E2E-002 specifically would be picked up
SELECT 
  id,
  amazon_order_id,
  execution_status,
  status,
  next_workflow,
  priority,
  queued_at,
  CASE 
    WHEN execution_status = 'ready_for_processing' THEN '✅ Would be picked up'
    ELSE '❌ Would NOT be picked up'
  END as router_status
FROM orders
WHERE amazon_order_id = 'E2E-002';

-- 4. Check for any issues that might prevent routing
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  CASE 
    WHEN execution_status != 'ready_for_processing' THEN '❌ Wrong execution_status'
    WHEN next_workflow IS NULL THEN '❌ Missing next_workflow'
    WHEN next_workflow NOT IN ('2A', '2B', '3', '4') THEN '⚠️ Unknown next_workflow: ' || next_workflow
    ELSE '✅ Ready to route'
  END as routing_status
FROM orders
WHERE execution_status = 'ready_for_processing';

