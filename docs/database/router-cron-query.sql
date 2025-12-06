-- W1.1 Router Cron Query
-- This is the exact query used by /api/cron/router to find orders ready for processing

-- ============================================
-- 1. Capacity Check (checks queue_status view)
-- ============================================
SELECT * FROM queue_status;

-- This view returns:
-- - processing_count: Orders currently in 'processing' status
-- - queued_count: Orders with execution_status = 'ready_for_processing'

-- ============================================
-- 2. Main Query: Fetch Ready Orders
-- ============================================
-- This is the exact query from back-end/src/app/api/cron/router/route.ts (lines 125-133)

SELECT 
  id,
  amazon_order_id,
  character_hash,
  next_workflow,
  dedication_text,
  one_manifest_url,
  character_specs,
  execution_status,
  priority,
  queued_at,
  updated_at
FROM orders
WHERE execution_status = 'ready_for_processing'
  AND next_workflow IS NOT NULL
ORDER BY 
  priority DESC NULLS LAST,
  updated_at ASC NULLS FIRST,
  queued_at ASC NULLS FIRST
LIMIT {availableSlots};

-- Where availableSlots = max(0, 5 - processing_count)
-- Max concurrent orders = 5

-- ============================================
-- 3. Filter Conditions Summary
-- ============================================
-- Required conditions:
--   - execution_status = 'ready_for_processing'
--   - next_workflow IS NOT NULL
--   - processing_count < 5 (capacity check)
--
-- Ordering priority:
--   1. priority DESC NULLS LAST (high priority first)
--   2. updated_at ASC NULLS FIRST (fallback for orders without queued_at)
--   3. queued_at ASC NULLS FIRST (primary ordering when queued_at exists)
--
-- Limit:
--   - availableSlots = max(0, 5 - processing_count)

-- ============================================
-- 4. Supabase REST API Equivalent
-- ============================================
-- GET /rest/v1/orders?
--   execution_status=eq.ready_for_processing
--   &next_workflow=not.is.null
--   &order=priority.desc.nulls.last,queued_at.asc.nulls.first,updated_at.asc.nulls.first
--   &limit=5
--   &select=id,amazon_order_id,character_hash,next_workflow,dedication_text,one_manifest_url,character_specs,execution_status,priority,queued_at,updated_at

-- ============================================
-- 5. Test Query: See What Router Would Fetch
-- ============================================
-- Run this to see exactly what orders the router would pick up:

WITH capacity_check AS (
  SELECT 
    (SELECT COUNT(*) FROM orders WHERE execution_status = 'processing') as processing_count
),
available_slots AS (
  SELECT GREATEST(0, 5 - processing_count) as slots FROM capacity_check
)
SELECT 
  o.id,
  o.amazon_order_id,
  o.execution_status,
  o.next_workflow,
  o.priority,
  o.queued_at,
  o.updated_at,
  CASE 
    WHEN o.execution_status != 'ready_for_processing' THEN '❌ Wrong status'
    WHEN o.next_workflow IS NULL THEN '❌ Missing next_workflow'
    ELSE '✅ Would be picked up'
  END as router_eligibility
FROM orders o, available_slots
WHERE o.execution_status = 'ready_for_processing'
  AND o.next_workflow IS NOT NULL
ORDER BY 
  o.priority DESC NULLS LAST,
  o.updated_at ASC NULLS FIRST,
  o.queued_at ASC NULLS FIRST
LIMIT (SELECT slots FROM available_slots);

-- ============================================
-- 6. Check Orders That Should Be Routed But Aren't
-- ============================================
-- Find orders that match router criteria but aren't being picked up:

SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  priority,
  queued_at,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - COALESCE(queued_at, updated_at))) / 60 as minutes_waiting,
  CASE 
    WHEN execution_status != 'ready_for_processing' THEN '❌ Wrong status: ' || execution_status
    WHEN next_workflow IS NULL THEN '❌ Missing next_workflow'
    WHEN (SELECT COUNT(*) FROM orders WHERE execution_status = 'processing') >= 5 THEN '⚠️ At capacity (5 processing)'
    ELSE '✅ Should be picked up'
  END as issue
FROM orders
WHERE execution_status = 'ready_for_processing'
  AND next_workflow IS NOT NULL
ORDER BY 
  priority DESC NULLS LAST,
  queued_at ASC NULLS FIRST,
  updated_at ASC NULLS FIRST;

