-- Diagnose Rogue Order and Missing Test Order Issues
-- This script helps identify why orders are not being picked up correctly

-- 1. Check all orders and their execution status
SELECT
  id,
  amazon_order_id,
  execution_status,
  status,
  workflow_step,
  next_workflow,
  current_workflow,
  started_at,
  queued_at,
  review_stages->>'preBria' as prebria_status,
  review_stages->>'postBria' as postbria_status,
  created_at,
  updated_at
FROM orders
WHERE amazon_order_id IN ('E2E-002', 'unknown-order')
ORDER BY created_at DESC;

-- 2. Check router query conditions
-- Router fetches: execution_status = 'ready_for_processing' AND next_workflow IS NOT NULL
SELECT
  id,
  amazon_order_id,
  execution_status,
  next_workflow,
  priority,
  queued_at,
  started_at,
  current_workflow,
  CASE 
    WHEN execution_status = 'ready_for_processing' AND next_workflow IS NOT NULL THEN '✅ Router will pick up'
    WHEN execution_status = 'processing' THEN '❌ Already processing (router ignores)'
    WHEN execution_status = 'ready_for_processing' AND next_workflow IS NULL THEN '❌ Missing next_workflow'
    WHEN execution_status != 'ready_for_processing' THEN '❌ Wrong execution_status'
    ELSE '❓ Unknown issue'
  END as router_status
FROM orders
WHERE amazon_order_id IN ('E2E-002', 'unknown-order')
ORDER BY created_at DESC;

-- 3. Check for orders with "unknown-order" (rogue orders)
SELECT
  id,
  amazon_order_id,
  execution_status,
  next_workflow,
  workflow_step,
  created_at,
  updated_at,
  manifest_2a_url,
  character_hash
FROM orders
WHERE amazon_order_id = 'unknown-order'
ORDER BY created_at DESC;

-- 4. Check recent order creation timestamps to see when rogue order appeared
SELECT
  amazon_order_id,
  execution_status,
  next_workflow,
  workflow_step,
  created_at,
  updated_at,
  EXTRACT(EPOCH FROM (updated_at - created_at)) as seconds_between_create_update
FROM orders
WHERE amazon_order_id IN ('E2E-002', 'unknown-order')
ORDER BY created_at DESC;

-- 5. Check if there are any orders with invalid next_workflow values
SELECT
  id,
  amazon_order_id,
  execution_status,
  next_workflow,
  workflow_step,
  CASE 
    WHEN next_workflow IN ('2A', '2B', '3', '4') THEN '✅ Valid workflow'
    WHEN next_workflow = 'book-generation' THEN '❌ Invalid: book-generation (should be 2A)'
    WHEN next_workflow IS NULL THEN '❌ Missing next_workflow'
    ELSE '❌ Unknown workflow: ' || next_workflow
  END as workflow_validation
FROM orders
WHERE execution_status = 'ready_for_processing'
ORDER BY queued_at ASC NULLS LAST;

-- 6. Check audit logs or workflow execution logs for clues about when rogue order was created
-- (If these tables exist)
SELECT 
  'Check workflow_execution_logs table if it exists' as note,
  'Look for entries around 2025-11-12 02:55:17' as timestamp_hint;

