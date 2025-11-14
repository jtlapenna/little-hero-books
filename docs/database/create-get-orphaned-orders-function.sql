-- Create a function to get orphaned orders (for n8n to call via RPC)
-- This function returns the same data as the orphaned_orders view

-- Drop existing function first (required when changing return type)
DROP FUNCTION IF EXISTS get_orphaned_orders();

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
  one_manifest_url TEXT,
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
    o.one_manifest_url,
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
      
      -- Manual review orders that have been waiting too long (should be reviewed)
      WHEN o.execution_status = 'error_requires_manual_review'
           AND o.updated_at < NOW() - INTERVAL '24 hours'
      THEN 'manual_review_pending'::TEXT
      
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
    -- Manual review orders waiting too long (optional: only if > 24 hours)
    OR (o.execution_status = 'error_requires_manual_review'
        AND o.updated_at < NOW() - INTERVAL '24 hours')
  ORDER BY o.updated_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_orphaned_orders() TO service_role;
GRANT EXECUTE ON FUNCTION get_orphaned_orders() TO anon;

-- Add comment
COMMENT ON FUNCTION get_orphaned_orders() IS 'Returns orders that are stuck/orphaned and not being processed by any workflow. Used by W1.4 Orphaned Orders Monitor.';

