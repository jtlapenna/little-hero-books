-- Setup Orphaned Orders Monitor
-- Run this entire file in Supabase SQL Editor (copy/paste all SQL, don't use \i command)

-- Step 1: Create the view
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

-- Step 2: Create the function
CREATE OR REPLACE FUNCTION get_orphaned_orders()
RETURNS TABLE (
  id INTEGER,
  amazon_order_id VARCHAR(50),
  execution_status VARCHAR(50),
  retry_count INTEGER,
  next_retry_at TIMESTAMP,
  error_type VARCHAR(100),
  error_message TEXT,
  current_workflow VARCHAR(50),
  started_at TIMESTAMP,
  updated_at TIMESTAMP,
  workflow_step VARCHAR(50),
  next_workflow VARCHAR(50),
  orphan_reason TEXT,
  minutes_orphaned NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.amazon_order_id,
    o.execution_status,
    o.retry_count,
    o.next_retry_at,
    o.error_type,
    o.error_message,
    o.current_workflow,
    o.started_at,
    o.updated_at,
    o.workflow_step,
    o.next_workflow,
    -- Classification of why it's orphaned
    CASE 
      -- Error orders without retry scheduled
      WHEN o.execution_status = 'error' 
           AND o.next_retry_at IS NULL 
           AND (o.retry_count IS NULL OR o.retry_count < 3)
      THEN 'error_no_retry_scheduled'::TEXT
      
      -- Error orders that exceeded max retries but not in manual review
      WHEN o.execution_status = 'error' 
           AND o.retry_count >= 3
      THEN 'error_max_retries_exceeded'::TEXT
      
      -- Processing orders stuck too long (should be caught by W1.2)
      WHEN o.execution_status = 'processing' 
           AND o.started_at IS NOT NULL 
           AND o.started_at < NOW() - INTERVAL '1 hour'
      THEN 'processing_stuck_over_hour'::TEXT
      
      -- Processing orders with no timestamp (should be caught by W1.2)
      WHEN o.execution_status = 'processing' 
           AND o.started_at IS NULL
      THEN 'processing_no_timestamp'::TEXT
      
      -- Ready but not being picked up (capacity issue or router not running)
      WHEN o.execution_status = 'ready_for_processing' 
           AND o.queued_at IS NOT NULL 
           AND o.queued_at < NOW() - INTERVAL '30 minutes'
      THEN 'ready_not_picked_up'::TEXT
      
      ELSE NULL::TEXT
    END as orphan_reason,
    -- How long orphaned
    EXTRACT(EPOCH FROM (NOW() - o.updated_at)) / 60 as minutes_orphaned
  FROM orders o
  WHERE 
    -- Error orders without proper retry setup
    (o.execution_status = 'error' 
     AND (o.next_retry_at IS NULL OR o.retry_count >= 3))
    -- Processing orders stuck
    OR (o.execution_status = 'processing' 
        AND (o.started_at IS NULL OR o.started_at < NOW() - INTERVAL '1 hour'))
    -- Ready but not picked up
    OR (o.execution_status = 'ready_for_processing' 
        AND o.queued_at < NOW() - INTERVAL '30 minutes')
  ORDER BY o.updated_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_orphaned_orders() TO service_role;
GRANT EXECUTE ON FUNCTION get_orphaned_orders() TO anon;

-- Add comment
COMMENT ON FUNCTION get_orphaned_orders() IS 'Returns orders that are stuck/orphaned and not being processed by any workflow. Used by W1.4 Orphaned Orders Monitor.';

