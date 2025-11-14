-- Fix queue_status view/function bug
-- W1.1 queries queue_status but it may be returning incorrect counts
-- This ensures queue_status exists and returns correct counts

-- ============================================
-- PART 1: Drop existing queue_status if it exists (view or function)
-- ============================================

-- Drop view if exists
DROP VIEW IF EXISTS queue_status CASCADE;

-- Drop function if exists (in case it was created as function)
DROP FUNCTION IF EXISTS get_queue_status() CASCADE;

-- ============================================
-- PART 2: Create queue_status as a VIEW (preferred for PostgREST)
-- ============================================

-- Create queue_status view that counts orders correctly
CREATE VIEW queue_status AS
SELECT 
  COUNT(*) FILTER (WHERE execution_status = 'processing')::BIGINT as processing_count,
  COUNT(*) FILTER (WHERE execution_status = 'ready_for_processing')::BIGINT as queued_count
FROM orders;

-- Grant access to service_role (required for PostgREST)
GRANT SELECT ON queue_status TO service_role;
GRANT SELECT ON queue_status TO anon;

-- Add comment
COMMENT ON VIEW queue_status IS 'Real-time count of processing and queued orders for W1.1 router capacity checks';

-- ============================================
-- PART 3: Verify the view works
-- ============================================

-- Test query
SELECT * FROM queue_status;

-- Compare with direct count (should match)
SELECT 
  'Direct COUNT' as source,
  COUNT(*) FILTER (WHERE execution_status = 'processing') as processing_count,
  COUNT(*) FILTER (WHERE execution_status = 'ready_for_processing') as queued_count
FROM orders

UNION ALL

SELECT 
  'queue_status view' as source,
  processing_count,
  queued_count
FROM queue_status;

-- ============================================
-- PART 4: Refresh PostgREST schema cache (if needed)
-- ============================================

-- Note: PostgREST caches schema. After creating/modifying views, you may need to:
-- 1. Wait a few minutes for cache to refresh automatically
-- 2. Or restart PostgREST service (requires Supabase admin access)
-- 3. Or call: NOTIFY pgrst, 'reload schema' (if enabled)

-- For now, the view should work immediately via direct SQL queries
-- PostgREST REST API may take a few minutes to see the new view

