-- Investigate why router isn't picking up JOHN-TEST4 and JOHN-TEST5
-- Router SHOULD pick them up on next execution - let's find out why it's not

-- 1. Check exact router query conditions
-- Router queries: execution_status = 'ready_for_processing'
-- Orders by: priority DESC, queued_at ASC
-- Limits by: availableSlots (usually 5)
-- Does NOT filter by next_workflow in the query itself
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  priority,
  queued_at,
  EXTRACT(EPOCH FROM (NOW() - queued_at)) / 60 as minutes_queued,
  -- Simulate router's exact query
  CASE 
    WHEN execution_status = 'ready_for_processing' THEN '✅ Matches router query'
    ELSE '❌ Does NOT match: ' || execution_status
  END as matches_router_query
FROM orders
WHERE amazon_order_id IN ('JOHN-TEST4', 'JOHN-TEST5')
ORDER BY queued_at ASC;

-- 2. Check what router would actually fetch (simulate exact query)
-- This is what router's "Fetch Ready Orders" node queries
SELECT 
  id,
  amazon_order_id,
  execution_status,
  next_workflow,
  priority,
  queued_at,
  character_hash,
  one_manifest_url IS NOT NULL as has_manifest
FROM orders
WHERE execution_status = 'ready_for_processing'
ORDER BY 
  priority DESC NULLS LAST,
  queued_at ASC NULLS LAST
LIMIT 5;

-- 3. Check if these orders appear in the router's fetch results
-- If they don't appear in query #2, that's why they're not being picked up
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  priority,
  queued_at,
  CASE 
    WHEN execution_status != 'ready_for_processing' THEN '❌ Wrong execution_status'
    WHEN priority IS NULL THEN '⚠️ NULL priority (will sort last)'
    WHEN queued_at IS NULL THEN '⚠️ NULL queued_at (will sort last)'
    ELSE '✅ Should appear in router query'
  END as router_query_status,
  -- Count how many orders are ahead in queue
  (SELECT COUNT(*) FROM orders o2 
   WHERE o2.execution_status = 'ready_for_processing'
     AND (
       (o2.priority > COALESCE(orders.priority, '') OR (o2.priority = orders.priority AND o2.queued_at < orders.queued_at))
       OR (o2.priority IS NULL AND orders.priority IS NOT NULL)
     )
  ) as orders_ahead_in_queue
FROM orders
WHERE amazon_order_id IN ('JOHN-TEST4', 'JOHN-TEST5');

-- 4. Check router capacity (what router checks before fetching)
SELECT 
  (SELECT COUNT(*) FROM orders WHERE execution_status = 'processing') as current_processing,
  (SELECT COUNT(*) FROM orders WHERE execution_status = 'ready_for_processing') as ready_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM orders WHERE execution_status = 'processing') >= 5 
    THEN '❌ At capacity (>= 5 processing)'
    ELSE '✅ Has capacity'
  END as capacity_status;

-- 5. Check if there's something wrong with the orders themselves
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  priority,
  queued_at,
  character_hash,
  one_manifest_url,
  character_specs IS NOT NULL as has_character_specs,
  -- Check for any data issues
  CASE 
    WHEN execution_status != 'ready_for_processing' THEN '❌ Wrong execution_status'
    WHEN next_workflow IS NULL THEN '⚠️ NULL next_workflow (router will still fetch, but routing will skip)'
    WHEN next_workflow NOT IN ('2A', '2B', '3', '4') THEN '⚠️ Invalid next_workflow: ' || next_workflow
    WHEN character_hash IS NULL THEN '⚠️ NULL character_hash'
    WHEN one_manifest_url IS NULL THEN '⚠️ NULL one_manifest_url'
    ELSE '✅ Order data looks good'
  END as data_quality_check
FROM orders
WHERE amazon_order_id IN ('JOHN-TEST4', 'JOHN-TEST5');

