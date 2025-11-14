-- Diagnose why JOHN-TEST3 didn't progress to W2A
-- This checks the order's state in Supabase to see what went wrong

-- 1. Check the order's current state
SELECT 
  id,
  amazon_order_id,
  execution_status,
  next_workflow,
  current_workflow,
  status,
  priority,
  queued_at,
  started_at,
  workflow_step,
  one_manifest_url IS NOT NULL as has_manifest_url,
  character_specs IS NOT NULL as has_character_specs,
  created_at,
  updated_at
FROM orders
WHERE amazon_order_id = 'JOHN-TEST3';

-- 2. Check if the order would be picked up by W1.1 router
-- Router query: execution_status = 'ready_for_processing'
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  CASE 
    WHEN execution_status != 'ready_for_processing' THEN '❌ Wrong execution_status: ' || execution_status
    WHEN next_workflow IS NULL THEN '❌ Missing next_workflow'
    WHEN next_workflow != '2A' THEN '⚠️ Wrong next_workflow: ' || next_workflow || ' (expected: 2A)'
    ELSE '✅ Ready to route to 2A'
  END as routing_status,
  queued_at,
  priority
FROM orders
WHERE amazon_order_id = 'JOHN-TEST3';

-- 3. Check if there are other orders blocking it (priority/queued_at)
-- Priority is VARCHAR(20), so we compare strings. Router uses: priority DESC NULLS LAST, queued_at ASC
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  priority,
  queued_at,
  CASE 
    WHEN execution_status = 'ready_for_processing' AND next_workflow = '2A' THEN '✅ Would be picked up before JOHN-TEST3'
    ELSE '❌ Not blocking'
  END as blocking_status
FROM orders
WHERE execution_status = 'ready_for_processing'
  AND next_workflow = '2A'
  AND amazon_order_id != 'JOHN-TEST3'
  AND (
    -- Priority comparison: NULL is treated as lowest, then string comparison
    (COALESCE(priority, '') > COALESCE((SELECT priority FROM orders WHERE amazon_order_id = 'JOHN-TEST3'), ''))
    OR (
      COALESCE(priority, '') = COALESCE((SELECT priority FROM orders WHERE amazon_order_id = 'JOHN-TEST3'), '')
      AND queued_at < (SELECT queued_at FROM orders WHERE amazon_order_id = 'JOHN-TEST3')
    )
  )
ORDER BY priority DESC NULLS LAST, queued_at ASC NULLS LAST;

-- 4. Check if W0 actually completed (has 1-manifest.json)
-- This would need to be checked in R2, but we can verify the manifest URL is set
SELECT 
  amazon_order_id,
  one_manifest_url,
  CASE 
    WHEN one_manifest_url IS NULL THEN '❌ No manifest URL set'
    WHEN one_manifest_url = '' THEN '❌ Empty manifest URL'
    ELSE '✅ Manifest URL: ' || one_manifest_url
  END as manifest_status
FROM orders
WHERE amazon_order_id = 'JOHN-TEST3';

