-- Clear only orders that are queued for processing (ready_for_processing status)
-- This will delete orders with execution_status = 'ready_for_processing'
-- EXCEPT E2E-002, which will be kept for testing
-- All other test orders (regardless of status) will be preserved
-- Related tables (character_generations, failed_orders, audit_logs, 
-- human_review_queue, workflow_execution_logs) will be cleared automatically via CASCADE

-- Delete only orders that are queued for processing, but keep E2E-002
-- CASCADE will automatically delete related records in:
-- - character_generations
-- - failed_orders  
-- - audit_logs
-- - human_review_queue
-- - workflow_execution_logs
DELETE FROM orders WHERE execution_status = 'ready_for_processing' AND amazon_order_id NOT IN ('E2E-002');

-- Reset E2E-002 back to ready_for_processing (in case it was already processed)
-- This ensures the order is in a clean state for testing
-- Only updating fields that definitely exist based on router workflow usage
UPDATE orders
SET 
  execution_status = 'ready_for_processing',
  started_at = NULL,
  current_workflow = NULL
WHERE amazon_order_id = 'E2E-002';

-- Verify results: Show all remaining orders and their statuses
-- E2E-002 should be ready_for_processing, other test orders should remain
SELECT 
  id,
  amazon_order_id,
  execution_status,
  next_workflow,
  current_workflow,
  one_manifest_url,
  started_at,
  created_at
FROM orders
ORDER BY 
  CASE WHEN amazon_order_id = 'E2E-002' THEN 0 ELSE 1 END,
  created_at DESC;

