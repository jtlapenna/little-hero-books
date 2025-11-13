-- Create a view to monitor orphaned/stuck orders
-- This helps identify orders that are stuck without any workflow processing them

CREATE OR REPLACE VIEW orphaned_orders AS
SELECT 
  id,
  amazon_order_id,
  execution_status,
  retry_count,
  next_retry_at,
  error_type,
  error_message,
  current_workflow,
  started_at,
  updated_at,
  workflow_step,
  next_workflow,
  -- Classification of why it's orphaned
  CASE 
    -- Error orders without retry scheduled
    WHEN execution_status = 'error' 
         AND next_retry_at IS NULL 
         AND (retry_count IS NULL OR retry_count < 3)
    THEN 'error_no_retry_scheduled'
    
    -- Error orders that exceeded max retries but not in manual review
    WHEN execution_status = 'error' 
         AND retry_count >= 3
    THEN 'error_max_retries_exceeded'
    
    -- Processing orders stuck too long (should be caught by W1.2)
    WHEN execution_status = 'processing' 
         AND started_at IS NOT NULL 
         AND started_at < NOW() - INTERVAL '1 hour'
    THEN 'processing_stuck_over_hour'
    
    -- Processing orders with no timestamp (should be caught by W1.2)
    WHEN execution_status = 'processing' 
         AND started_at IS NULL
    THEN 'processing_no_timestamp'
    
    -- Ready but not being picked up (capacity issue or router not running)
    WHEN execution_status = 'ready_for_processing' 
         AND queued_at IS NOT NULL 
         AND queued_at < NOW() - INTERVAL '30 minutes'
    THEN 'ready_not_picked_up'
    
    ELSE NULL
  END as orphan_reason,
  -- How long orphaned
  EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 as minutes_orphaned
FROM orders
WHERE 
  -- Error orders without proper retry setup
  (execution_status = 'error' 
   AND (next_retry_at IS NULL OR retry_count >= 3))
  -- Processing orders stuck
  OR (execution_status = 'processing' 
      AND (started_at IS NULL OR started_at < NOW() - INTERVAL '1 hour'))
  -- Ready but not picked up
  OR (execution_status = 'ready_for_processing' 
      AND queued_at < NOW() - INTERVAL '30 minutes')
ORDER BY updated_at DESC;

-- Grant access
GRANT SELECT ON orphaned_orders TO service_role;
GRANT SELECT ON orphaned_orders TO anon;

-- Add comment
COMMENT ON VIEW orphaned_orders IS 'Identifies orders that are stuck/orphaned and not being processed by any workflow';

