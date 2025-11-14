-- URGENT: Investigate queue_status count bug
-- After deleting orders, W1.1 still shows currentProcessing: 5
-- This queries everything needed to diagnose the issue

-- ============================================
-- PART 1: Check what queue_status actually is
-- ============================================

-- 1a. Check if queue_status is a VIEW
SELECT 
  table_name,
  table_type,
  table_schema
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'queue_status';

-- 1b. If it's a view, get the view definition
SELECT 
  view_definition
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name = 'queue_status';

-- 1c. Check if get_queue_status() function exists
SELECT 
  routine_name,
  routine_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'get_queue_status';

-- 1d. Get full function definition with body
SELECT 
  pg_get_functiondef(oid) as function_definition
FROM pg_proc
WHERE proname = 'get_queue_status';

-- ============================================
-- PART 2: Compare counts - queue_status vs direct query
-- ============================================

-- 2a. What queue_status returns (if view exists)
SELECT * FROM queue_status;

-- 2b. What get_queue_status() returns (if function exists)
SELECT * FROM get_queue_status();

-- 2c. Direct COUNT query on orders table (ground truth)
SELECT 
  COUNT(*) FILTER (WHERE execution_status = 'processing') as processing_count,
  COUNT(*) FILTER (WHERE execution_status = 'ready_for_processing') as queued_count,
  COUNT(*) as total_orders,
  COUNT(*) FILTER (WHERE execution_status IS NULL) as null_status_count
FROM orders;

-- 2d. List ALL orders with execution_status='processing' (if any exist)
SELECT 
  id,
  amazon_order_id,
  execution_status,
  current_workflow,
  started_at,
  created_at,
  updated_at
FROM orders
WHERE execution_status = 'processing'
ORDER BY started_at ASC NULLS LAST;

-- ============================================
-- PART 3: Check for soft deletes or hidden records
-- ============================================

-- 3a. Check if there's a deleted_at column
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND column_name LIKE '%delete%';

-- 3b. Check for any records that might be "hidden" but still counted
SELECT 
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE execution_status = 'processing') as processing_rows,
  COUNT(*) FILTER (WHERE execution_status = 'ready_for_processing') as queued_rows
FROM orders;

-- ============================================
-- PART 4: Check PostgREST schema cache
-- ============================================

-- 4a. Check if queue_status is exposed via PostgREST
-- (This would show in Supabase API, but we can't query it directly from SQL)
-- Note: PostgREST caches schema. If view/function was recently created/modified,
-- the cache might be stale. Solution: Restart PostgREST or wait for cache refresh.

-- ============================================
-- PART 5: Test for caching issues
-- ============================================

-- 5a. Run queue_status multiple times to see if count changes
-- (Run this query 3-5 times in quick succession)
SELECT 
  'Run 1' as test_run,
  * 
FROM queue_status;

-- 5b. Compare timestamps to see if data is stale
SELECT 
  MAX(updated_at) as latest_order_update,
  MAX(started_at) as latest_started_at,
  NOW() as current_time,
  NOW() - MAX(updated_at) as time_since_last_update
FROM orders
WHERE execution_status = 'processing';

-- ============================================
-- PART 6: Check for materialized views
-- ============================================

-- 6a. Check if queue_status is a materialized view
SELECT 
  schemaname,
  matviewname,
  hasindexes,
  ispopulated
FROM pg_matviews
WHERE matviewname = 'queue_status';

-- If it's a materialized view and not populated, that's the bug!
-- Fix: REFRESH MATERIALIZED VIEW queue_status;

