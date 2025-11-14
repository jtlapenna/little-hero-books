-- Test order deletion to see the actual error message
-- Replace 'TEST-ORDER-ID' with an actual order ID you want to delete

-- Step 1: Check if order exists and show related records
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
WHERE o.amazon_order_id = 'TEST-ORDER-ID';

-- Step 2: Try to delete (this will show the actual error if it fails)
BEGIN;

DELETE FROM orders 
WHERE amazon_order_id = 'TEST-ORDER-ID';

-- If successful, commit:
-- COMMIT;

-- If it fails, you'll see an error message like:
-- "ERROR: update or delete on table "orders" violates foreign key constraint..."
-- This will tell us exactly what's blocking the deletion

-- To rollback if needed:
-- ROLLBACK;

