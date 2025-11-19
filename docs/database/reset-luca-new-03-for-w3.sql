-- Reset LUCA-NEW-03 to run through W3 again
-- This will:
-- 1. Clear the 3-manifest URL (force fresh run)
-- 2. Reset workflow_step to indicate it needs W3
-- 3. Set next_workflow to '3'
-- 4. Set execution_status to 'ready_for_processing'
-- 5. Clear current_workflow and started_at
-- 6. Update queued_at to now so router picks it up
-- 7. Optionally reset review_stages.postPdf.status to 'pending'

UPDATE orders
SET 
  manifest_3_url = NULL, -- Clear existing 3-manifest to force fresh run
  workflow_step = 'bria_processing_complete', -- Reset to before W3 (after 2B)
  next_workflow = '3', -- Route to workflow 3
  execution_status = 'ready_for_processing', -- Ready for router to pick up
  current_workflow = NULL, -- Clear current workflow
  started_at = NULL, -- Clear started_at
  queued_at = NOW(), -- Update queued_at so router prioritizes it
  updated_at = NOW(),
  -- Optionally reset postPdf review status (uncomment if you want to reset review)
  -- review_stages = jsonb_set(
  --   review_stages,
  --   '{postPdf,status}',
  --   '"pending"'
  -- )
WHERE amazon_order_id = 'LUCA-NEW-03';

-- Verify the update
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  current_workflow,
  workflow_step,
  manifest_3_url IS NOT NULL as has_3_manifest,
  queued_at,
  review_stages->'postPdf'->>'status' as postPdf_status
FROM orders
WHERE amazon_order_id = 'LUCA-NEW-03';

