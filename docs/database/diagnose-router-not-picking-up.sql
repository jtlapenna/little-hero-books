-- Diagnostic query to understand why router isn't picking up LUCA-NEW-03
-- This simulates the exact query the router uses

-- 1. Check if the order matches router criteria
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  priority,
  queued_at,
  updated_at,
  current_workflow,
  started_at,
  -- Check if it would be picked up
  CASE 
    WHEN execution_status = 'ready_for_processing' AND next_workflow IS NOT NULL 
    THEN '✅ MATCHES CRITERIA'
    ELSE '❌ DOES NOT MATCH'
  END as router_match
FROM orders
WHERE amazon_order_id = 'LUCA-NEW-03';

-- 2. Check capacity (how many orders are processing)
SELECT 
  COUNT(*) FILTER (WHERE execution_status = 'processing') as processing_count,
  COUNT(*) FILTER (WHERE execution_status = 'ready_for_processing') as queued_count,
  5 as max_concurrent,
  5 - COUNT(*) FILTER (WHERE execution_status = 'processing') as available_slots
FROM orders;

-- 3. Simulate router query - see what orders would be picked up
-- (This is the exact query the router uses)
SELECT 
  id,
  amazon_order_id,
  execution_status,
  next_workflow,
  priority,
  queued_at,
  updated_at,
  ROW_NUMBER() OVER (
    ORDER BY 
      priority DESC NULLS LAST,
      queued_at ASC NULLS FIRST,
      updated_at ASC NULLS FIRST
  ) as queue_position
FROM orders
WHERE execution_status = 'ready_for_processing'
  AND next_workflow IS NOT NULL
ORDER BY 
  priority DESC NULLS LAST,
  queued_at ASC NULLS FIRST,
  updated_at ASC NULLS FIRST
LIMIT 10;

-- 4. Check if LUCA-NEW-03 appears in the router query results
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  priority,
  queued_at,
  updated_at,
  CASE 
    WHEN amazon_order_id = 'LUCA-NEW-03' THEN '🎯 THIS IS LUCA-NEW-03'
    ELSE 'Other order'
  END as is_target
FROM orders
WHERE execution_status = 'ready_for_processing'
  AND next_workflow IS NOT NULL
ORDER BY 
  priority DESC NULLS LAST,
  queued_at ASC NULLS FIRST,
  updated_at ASC NULLS FIRST
LIMIT 10;

-- 5. Check for any orders with higher priority or older queued_at
SELECT 
  amazon_order_id,
  priority,
  queued_at,
  next_workflow,
  CASE 
    WHEN priority > (SELECT priority FROM orders WHERE amazon_order_id = 'LUCA-NEW-03') THEN 'Higher priority'
    WHEN priority = (SELECT priority FROM orders WHERE amazon_order_id = 'LUCA-NEW-03') 
         AND queued_at < (SELECT queued_at FROM orders WHERE amazon_order_id = 'LUCA-NEW-03') THEN 'Same priority, older queued_at'
    ELSE 'Behind in queue'
  END as queue_reason
FROM orders
WHERE execution_status = 'ready_for_processing'
  AND next_workflow IS NOT NULL
  AND (
    priority > (SELECT priority FROM orders WHERE amazon_order_id = 'LUCA-NEW-03')
    OR (
      priority = (SELECT priority FROM orders WHERE amazon_order_id = 'LUCA-NEW-03')
      AND queued_at < (SELECT queued_at FROM orders WHERE amazon_order_id = 'LUCA-NEW-03')
    )
  )
ORDER BY 
  priority DESC NULLS LAST,
  queued_at ASC NULLS FIRST
LIMIT 10;

