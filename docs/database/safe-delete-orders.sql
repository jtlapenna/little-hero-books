-- Safe deletion script for orders
-- This handles all related records and constraints

-- ============================================
-- OPTION 1: Delete single order by amazon_order_id
-- ============================================

-- Replace 'ORDER-ID-HERE' with the actual order ID
/*
BEGIN;

-- First, verify the order exists and show what will be deleted
SELECT 
  o.id,
  o.amazon_order_id,
  (SELECT COUNT(*) FROM character_generations WHERE order_id = o.id) as character_gen_count,
  (SELECT COUNT(*) FROM failed_orders WHERE order_id = o.id) as failed_order_count,
  (SELECT COUNT(*) FROM audit_logs WHERE order_id = o.id) as audit_log_count,
  (SELECT COUNT(*) FROM human_review_queue WHERE order_id = o.id) as review_queue_count,
  (SELECT COUNT(*) FROM workflow_execution_logs WHERE order_id = o.id) as workflow_log_count
FROM orders o
WHERE o.amazon_order_id = 'ORDER-ID-HERE';

-- Delete the order (CASCADE will handle related records)
DELETE FROM orders 
WHERE amazon_order_id = 'ORDER-ID-HERE';

-- Verify deletion
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM orders WHERE amazon_order_id = 'ORDER-ID-HERE') 
    THEN 'Order still exists - deletion failed'
    ELSE 'Order deleted successfully'
  END as deletion_status;

COMMIT;
*/

-- ============================================
-- OPTION 2: Delete multiple orders by execution_status
-- ============================================

-- Delete all orders stuck in 'processing' state (after verifying they're truly stuck)
/*
BEGIN;

-- First, see what will be deleted
SELECT 
  amazon_order_id,
  execution_status,
  current_workflow,
  started_at,
  (SELECT COUNT(*) FROM character_generations WHERE order_id = orders.id) as related_records
FROM orders
WHERE execution_status = 'processing'
  AND (
    started_at < NOW() - INTERVAL '1 hour'
    OR started_at IS NULL
  );

-- Delete them
DELETE FROM orders
WHERE execution_status = 'processing'
  AND (
    started_at < NOW() - INTERVAL '1 hour'
    OR started_at IS NULL
  );

COMMIT;
*/

-- ============================================
-- OPTION 3: Delete orders by list of IDs
-- ============================================

-- Delete specific orders from a list
/*
BEGIN;

DELETE FROM orders
WHERE amazon_order_id IN (
  'ORDER-1',
  'ORDER-2',
  'ORDER-3'
);

COMMIT;
*/

-- ============================================
-- OPTION 4: Manual deletion with explicit cleanup (if CASCADE doesn't work)
-- ============================================

-- If CASCADE isn't working, manually delete related records first
/*
BEGIN;

-- Replace 'ORDER-ID-HERE' with actual order ID
DECLARE @order_id INTEGER;
SELECT @order_id = id FROM orders WHERE amazon_order_id = 'ORDER-ID-HERE';

-- Delete related records manually
DELETE FROM character_generations WHERE order_id = @order_id;
DELETE FROM failed_orders WHERE order_id = @order_id;
DELETE FROM audit_logs WHERE order_id = @order_id;
DELETE FROM human_review_queue WHERE order_id = @order_id;
DELETE FROM workflow_execution_logs WHERE order_id = @order_id;

-- Now delete the order
DELETE FROM orders WHERE id = @order_id;

COMMIT;
*/

-- ============================================
-- OPTION 5: Check RLS policies and bypass if needed
-- ============================================

-- If RLS is blocking deletion, you may need to:
-- 1. Temporarily disable RLS
-- 2. Delete the order
-- 3. Re-enable RLS

/*
-- Check current RLS status
SELECT rowsecurity FROM pg_tables WHERE tablename = 'orders';

-- Temporarily disable RLS (requires superuser or table owner)
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

-- Delete order
DELETE FROM orders WHERE amazon_order_id = 'ORDER-ID-HERE';

-- Re-enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
*/

