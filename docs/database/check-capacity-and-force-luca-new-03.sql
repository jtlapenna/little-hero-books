-- Check current capacity and see why LUCA-NEW-03 isn't being picked up

-- 1. Check how many orders are currently processing (this determines capacity)
SELECT 
  execution_status,
  COUNT(*) as count,
  array_agg(amazon_order_id ORDER BY started_at) as order_ids
FROM orders
WHERE execution_status = 'processing'
GROUP BY execution_status;

-- 2. Check all ready orders and their queue position
SELECT 
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
  ) as queue_position,
  CASE 
    WHEN amazon_order_id = 'LUCA-NEW-03' THEN '🎯 TARGET'
    ELSE ''
  END as is_target
FROM orders
WHERE execution_status = 'ready_for_processing'
  AND next_workflow IS NOT NULL
ORDER BY 
  priority DESC NULLS LAST,
  queued_at ASC NULLS FIRST,
  updated_at ASC NULLS FIRST
LIMIT 10;

-- 3. FORCE LUCA-NEW-03 to be picked up next by:
--    - Setting priority to 'high' (temporarily)
--    - Or clearing other processing orders if they're stuck
--    - Or manually setting it to processing and calling W3 webhook directly

-- Option A: Temporarily boost priority (will be picked up on next router run)
UPDATE orders
SET 
  priority = 'high',
  queued_at = NOW() - INTERVAL '1 minute', -- Make it older so it's prioritized
  updated_at = NOW()
WHERE amazon_order_id = 'LUCA-NEW-03'
  AND execution_status = 'ready_for_processing';

-- Verify the change
SELECT 
  amazon_order_id,
  priority,
  queued_at,
  execution_status,
  next_workflow
FROM orders
WHERE amazon_order_id = 'LUCA-NEW-03';

-- Option B: If you want to reset priority back to normal after it's picked up:
-- UPDATE orders SET priority = 'normal' WHERE amazon_order_id = 'LUCA-NEW-03';

