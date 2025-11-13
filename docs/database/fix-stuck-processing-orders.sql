-- Fix orders stuck in 'processing' state
-- This resets them to 'ready_for_processing' so W1.1 can pick them up again

-- OPTION 1: Reset ALL stuck orders (use with caution)
-- Uncomment to reset all orders stuck > 1 hour
/*
UPDATE orders
SET 
  execution_status = 'ready_for_processing',
  started_at = NULL,
  current_workflow = NULL,
  updated_at = NOW()
WHERE execution_status = 'processing'
  AND started_at < NOW() - INTERVAL '1 hour';
*/

-- OPTION 2: Reset specific orders (safer - review first)
-- First, run the diagnostic query to see which orders are stuck
-- Then uncomment and update the WHERE clause with specific amazon_order_ids

-- Example: Reset specific stuck orders
/*
UPDATE orders
SET 
  execution_status = 'ready_for_processing',
  started_at = NULL,
  current_workflow = NULL,
  updated_at = NOW()
WHERE execution_status = 'processing'
  AND amazon_order_id IN ('ORDER-1', 'ORDER-2', 'ORDER-3');
*/

-- OPTION 3: Reset orders stuck > 30 minutes (recommended)
-- This is safer than 1 hour - catches stuck orders faster
UPDATE orders
SET 
  execution_status = 'ready_for_processing',
  started_at = NULL,
  current_workflow = NULL,
  updated_at = NOW()
WHERE execution_status = 'processing'
  AND (
    -- Stuck for more than 30 minutes
    started_at < NOW() - INTERVAL '30 minutes'
    -- Or no started_at timestamp (shouldn't be processing)
    OR started_at IS NULL
  );

-- Verify the fix
SELECT 
  COUNT(*) as still_processing,
  COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '30 minutes') as stuck_old,
  COUNT(*) FILTER (WHERE started_at IS NULL) as no_timestamp
FROM orders
WHERE execution_status = 'processing';

-- Check queue_status after fix
SELECT * FROM queue_status;

