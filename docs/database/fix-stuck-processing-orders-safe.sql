-- Safe fix for stuck processing orders
-- This resets orders that are clearly stuck (> 30 minutes) back to ready_for_processing

-- STEP 1: Review what will be reset (run this first!)
SELECT 
  amazon_order_id,
  execution_status,
  current_workflow,
  started_at,
  EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 as minutes_processing,
  manifest_2a_url IS NOT NULL as has_2a_manifest,
  manifest_2b_url IS NOT NULL as has_2b_manifest,
  manifest_3_url IS NOT NULL as has_3_manifest,
  'Will be reset' as action
FROM orders
WHERE execution_status = 'processing'
  AND (
    -- Stuck for more than 30 minutes
    started_at < NOW() - INTERVAL '30 minutes'
    -- Or no started_at timestamp (shouldn't be processing)
    OR started_at IS NULL
  )
ORDER BY started_at ASC NULLS LAST;

-- STEP 2: If the above looks correct, uncomment and run this to reset them
/*
UPDATE orders
SET 
  execution_status = 'ready_for_processing',
  started_at = NULL,
  current_workflow = NULL,
  updated_at = NOW()
WHERE execution_status = 'processing'
  AND (
    started_at < NOW() - INTERVAL '30 minutes'
    OR started_at IS NULL
  );
*/

-- STEP 3: Verify the fix
SELECT 
  COUNT(*) as still_processing,
  COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '30 minutes') as still_stuck_old,
  COUNT(*) FILTER (WHERE started_at IS NULL) as still_no_timestamp
FROM orders
WHERE execution_status = 'processing';

-- Check queue_status after fix
SELECT * FROM queue_status;

-- Check available slots calculation
SELECT 
  COUNT(*) FILTER (WHERE execution_status = 'processing') as processing_count,
  COUNT(*) FILTER (WHERE execution_status = 'ready_for_processing') as queued_count,
  5 - COUNT(*) FILTER (WHERE execution_status = 'processing') as available_slots
FROM orders;

