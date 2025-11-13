-- Check why JOHN-TEST4 and JOHN-TEST5 aren't being picked up by router
-- Based on query results showing:
-- - JOHN-TEST4: NULL one_manifest_url (data quality issue)
-- - JOHN-TEST5: All data looks good but still not picked up

-- 1. Check if there are other orders ahead in queue
-- Router orders by: priority DESC, queued_at ASC
-- Router limits to: 5 orders (availableSlots)
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  priority,
  queued_at,
  EXTRACT(EPOCH FROM (NOW() - queued_at)) / 60 as minutes_queued,
  one_manifest_url IS NOT NULL as has_manifest,
  -- Check queue position
  ROW_NUMBER() OVER (
    ORDER BY 
      priority DESC NULLS LAST,
      queued_at ASC NULLS LAST
  ) as queue_position
FROM orders
WHERE execution_status = 'ready_for_processing'
ORDER BY 
  priority DESC NULLS LAST,
  queued_at ASC NULLS LAST
LIMIT 10;

-- 2. Check if JOHN-TEST4's NULL manifest is blocking it
-- Router's "Prep Workflow 4 Orders" node uses one_manifest_url
-- If it's NULL, the router might skip it or fail
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  one_manifest_url,
  CASE 
    WHEN one_manifest_url IS NULL THEN '❌ NULL manifest - router may skip'
    WHEN one_manifest_url IS NOT NULL THEN '✅ Has manifest'
    ELSE '❓ Unknown'
  END as manifest_status,
  -- Check if manifest exists in R2 (if URL is set)
  CASE 
    WHEN one_manifest_url IS NULL THEN 'N/A'
    ELSE 'Check R2 for: ' || one_manifest_url
  END as manifest_check
FROM orders
WHERE amazon_order_id IN ('JOHN-TEST4', 'JOHN-TEST5');

-- 3. Check router capacity and processing orders
SELECT 
  (SELECT COUNT(*) FROM orders WHERE execution_status = 'processing') as current_processing,
  (SELECT COUNT(*) FROM orders WHERE execution_status = 'ready_for_processing') as ready_count,
  (SELECT COUNT(*) FROM orders WHERE execution_status = 'ready_for_processing' AND next_workflow = '4') as ready_for_workflow_4,
  CASE 
    WHEN (SELECT COUNT(*) FROM orders WHERE execution_status = 'processing') >= 5 
    THEN '❌ At capacity (>= 5 processing)'
    ELSE '✅ Has capacity'
  END as capacity_status,
  -- Check if our test orders would be in top 5
  (SELECT COUNT(*) FROM orders o2 
   WHERE o2.execution_status = 'ready_for_processing'
     AND (
       (o2.priority > COALESCE((SELECT priority FROM orders WHERE amazon_order_id = 'JOHN-TEST4'), ''))
       OR (o2.priority = (SELECT priority FROM orders WHERE amazon_order_id = 'JOHN-TEST4') 
           AND o2.queued_at < (SELECT queued_at FROM orders WHERE amazon_order_id = 'JOHN-TEST4'))
     )
  ) as orders_ahead_of_test4,
  (SELECT COUNT(*) FROM orders o2 
   WHERE o2.execution_status = 'ready_for_processing'
     AND (
       (o2.priority > COALESCE((SELECT priority FROM orders WHERE amazon_order_id = 'JOHN-TEST5'), ''))
       OR (o2.priority = (SELECT priority FROM orders WHERE amazon_order_id = 'JOHN-TEST5') 
           AND o2.queued_at < (SELECT queued_at FROM orders WHERE amazon_order_id = 'JOHN-TEST5'))
     )
  ) as orders_ahead_of_test5;

-- 4. Check if router's query would return these orders
-- Router queries: execution_status = 'ready_for_processing'
-- Does NOT filter by next_workflow in the query
-- Orders by: priority DESC, queued_at ASC
-- Limits by: availableSlots (usually 5)
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  priority,
  queued_at,
  one_manifest_url IS NOT NULL as has_manifest,
  -- Simulate router's exact query
  CASE 
    WHEN execution_status = 'ready_for_processing' THEN '✅ Would be fetched by router'
    ELSE '❌ Would NOT be fetched: ' || execution_status
  END as router_fetch_status,
  -- Check if it would be in top 5
  CASE 
    WHEN execution_status = 'ready_for_processing' 
     AND (SELECT COUNT(*) FROM orders o2 
          WHERE o2.execution_status = 'ready_for_processing'
            AND (
              (o2.priority > COALESCE(orders.priority, '') OR (o2.priority = orders.priority AND o2.queued_at < orders.queued_at))
              OR (o2.priority IS NULL AND orders.priority IS NOT NULL)
            )
         ) < 5
    THEN '✅ Would be in top 5'
    WHEN execution_status = 'ready_for_processing'
    THEN '⚠️ Would be fetched but NOT in top 5 (other orders ahead)'
    ELSE '❌ Would NOT be fetched'
  END as router_position_status
FROM orders
WHERE amazon_order_id IN ('JOHN-TEST4', 'JOHN-TEST5');

-- 5. Check for any other data issues that might block routing
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  priority,
  queued_at,
  character_hash,
  one_manifest_url,
  character_specs IS NOT NULL as has_character_specs,
  -- Comprehensive data quality check
  CASE 
    WHEN execution_status != 'ready_for_processing' THEN '❌ Wrong execution_status: ' || execution_status
    WHEN next_workflow IS NULL THEN '❌ NULL next_workflow'
    WHEN next_workflow NOT IN ('2A', '2B', '3', '4') THEN '⚠️ Invalid next_workflow: ' || next_workflow
    WHEN character_hash IS NULL THEN '⚠️ NULL character_hash'
    WHEN one_manifest_url IS NULL AND next_workflow IN ('3', '4') THEN '⚠️ NULL one_manifest_url (required for workflow ' || next_workflow || ')'
    WHEN priority IS NULL THEN '⚠️ NULL priority (will sort last)'
    WHEN queued_at IS NULL THEN '⚠️ NULL queued_at (will sort last)'
    ELSE '✅ All data looks good'
  END as comprehensive_data_check
FROM orders
WHERE amazon_order_id IN ('JOHN-TEST4', 'JOHN-TEST5');

