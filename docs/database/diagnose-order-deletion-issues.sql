-- Diagnose why orders can't be deleted from Supabase
-- Even though they've been deleted from R2

-- ============================================
-- PART 1: Check foreign key constraints
-- ============================================

-- 1a. List all foreign key constraints on orders table
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
LEFT JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
  AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'orders'
ORDER BY tc.table_name, tc.constraint_name;

-- 1b. Check if any related tables have records preventing deletion
-- (Even with CASCADE, if there's a constraint violation, deletion fails)
SELECT 
  'character_generations' as table_name,
  COUNT(*) as record_count,
  COUNT(DISTINCT order_id) as unique_order_ids
FROM character_generations
WHERE EXISTS (SELECT 1 FROM orders WHERE orders.id = character_generations.order_id)

UNION ALL

SELECT 
  'failed_orders' as table_name,
  COUNT(*) as record_count,
  COUNT(DISTINCT order_id) as unique_order_ids
FROM failed_orders
WHERE EXISTS (SELECT 1 FROM orders WHERE orders.id = failed_orders.order_id)

UNION ALL

SELECT 
  'audit_logs' as table_name,
  COUNT(*) as record_count,
  COUNT(DISTINCT order_id) as unique_order_ids
FROM audit_logs
WHERE EXISTS (SELECT 1 FROM orders WHERE orders.id = audit_logs.order_id)

UNION ALL

SELECT 
  'human_review_queue' as table_name,
  COUNT(*) as record_count,
  COUNT(DISTINCT order_id) as unique_order_ids
FROM human_review_queue
WHERE EXISTS (SELECT 1 FROM orders WHERE orders.id = human_review_queue.order_id)

UNION ALL

SELECT 
  'workflow_execution_logs' as table_name,
  COUNT(*) as record_count,
  COUNT(DISTINCT order_id) as unique_order_ids
FROM workflow_execution_logs
WHERE EXISTS (SELECT 1 FROM orders WHERE orders.id = workflow_execution_logs.order_id);

-- ============================================
-- PART 2: Check RLS (Row Level Security) policies
-- ============================================

-- 2a. Check if RLS is enabled on orders table
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'orders';

-- 2b. List all RLS policies on orders table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'orders';

-- ============================================
-- PART 3: Check for triggers that might prevent deletion
-- ============================================

-- 3a. List all triggers on orders table
SELECT 
  trigger_name,
  event_manipulation,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'orders'
  AND event_object_schema = 'public';

-- ============================================
-- PART 4: Test deletion on a specific order
-- ============================================

-- 4a. Find orders that should be deletable (have no critical dependencies)
-- Replace 'ORDER-ID-HERE' with an actual order ID you're trying to delete
/*
SELECT 
  o.id,
  o.amazon_order_id,
  o.execution_status,
  (SELECT COUNT(*) FROM character_generations WHERE order_id = o.id) as character_gen_count,
  (SELECT COUNT(*) FROM failed_orders WHERE order_id = o.id) as failed_order_count,
  (SELECT COUNT(*) FROM audit_logs WHERE order_id = o.id) as audit_log_count,
  (SELECT COUNT(*) FROM human_review_queue WHERE order_id = o.id) as review_queue_count,
  (SELECT COUNT(*) FROM workflow_execution_logs WHERE order_id = o.id) as workflow_log_count
FROM orders o
WHERE o.amazon_order_id = 'ORDER-ID-HERE';
*/

-- ============================================
-- PART 5: Check for unique constraints that might conflict
-- ============================================

-- 5a. Check unique constraints on orders table
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'orders'
  AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
ORDER BY tc.constraint_type, kcu.ordinal_position;

