-- Fix order 111-0060602-1283417 that was overwritten by Amazon orders cron
-- This sets the order back to the state w0 should have set

UPDATE orders
SET
  execution_status = 'ready_for_processing',
  next_workflow = '2A',
  status = 'new',
  updated_at = CURRENT_TIMESTAMP
WHERE amazon_order_id = '111-0060602-1283417'
  AND (execution_status = 'pending_w0' OR next_workflow IS NULL);

-- Verify the fix
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  workflow_step,
  status,
  updated_at
FROM orders
WHERE amazon_order_id = '111-0060602-1283417';

