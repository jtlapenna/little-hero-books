-- Diagnostic query to determine why orders are not progressing/routing
-- Run this in Supabase SQL Editor

-- 1. Check the specific order's current state
-- KEY ISSUE: Router cron looks for execution_status = 'ready_for_processing' AND next_workflow IS NOT NULL
SELECT 
  id,
  amazon_order_id,
  "orderId",
  status,
  execution_status,
  workflow_step,
  next_workflow,
  current_workflow,
  customer_name,
  customer_email,
  shipping_address IS NOT NULL as has_shipping_address,
  character_specs IS NOT NULL as has_character_specs,
  character_hash,
  product_info,
  error_message,
  error_type,
  retry_count,
  max_retries,
  next_retry_at,
  created_at,
  updated_at,
  queued_at,
  started_at,
  -- Check if order matches router cron criteria
  CASE 
    WHEN execution_status = 'ready_for_processing' AND next_workflow IS NOT NULL THEN '✅ READY FOR ROUTER'
    WHEN execution_status = 'pending_w0' THEN '⚠️ WAITING FOR W0 (needs to be processed by w0 first)'
    WHEN execution_status != 'ready_for_processing' THEN '❌ WRONG STATUS (needs: ready_for_processing)'
    WHEN next_workflow IS NULL THEN '❌ MISSING next_workflow (router requires this)'
    ELSE '❓ UNKNOWN STATE'
  END as router_readiness
FROM orders
WHERE amazon_order_id = '111-0060602-1283417'
   OR "orderId" = '111-0060602-1283417';

-- 2. Check all orders that should be ready for routing
-- Router cron requires: execution_status = 'ready_for_processing' AND next_workflow IS NOT NULL
SELECT 
  id,
  amazon_order_id,
  "orderId",
  status,
  execution_status,
  workflow_step,
  next_workflow,
  current_workflow,
  CASE 
    WHEN execution_status = 'ready_for_processing' AND next_workflow IS NOT NULL THEN '✅ READY FOR ROUTER'
    WHEN execution_status = 'pending_w0' THEN '⚠️ WAITING FOR W0'
    WHEN execution_status != 'ready_for_processing' THEN '❌ WRONG STATUS'
    WHEN next_workflow IS NULL THEN '❌ MISSING next_workflow'
    ELSE '❓ UNKNOWN'
  END as router_status,
  shipping_address IS NOT NULL as has_shipping,
  character_specs IS NOT NULL as has_specs,
  customer_name IS NOT NULL as has_name,
  error_message,
  retry_count,
  created_at,
  updated_at
FROM orders
WHERE (
  execution_status = 'pending_w0'
  OR execution_status = 'pending'
  OR execution_status = 'ready_for_processing'
  OR (status = 'new' AND execution_status IS NULL)
)
AND (
  shipping_address IS NOT NULL
  OR character_specs IS NOT NULL
)
ORDER BY created_at DESC
LIMIT 20;

-- 3. Check for orders stuck in processing
SELECT 
  id,
  amazon_order_id,
  "orderId",
  status,
  execution_status,
  workflow_step,
  current_workflow,
  started_at,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 as minutes_since_update,
  error_message,
  retry_count
FROM orders
WHERE execution_status = 'processing'
  AND updated_at < NOW() - INTERVAL '1 hour'
ORDER BY updated_at ASC;

-- 4. Check router cron capacity/queued orders
-- Router cron looks for: execution_status = 'ready_for_processing' AND next_workflow IS NOT NULL
SELECT 
  COUNT(*) as total_orders,
  COUNT(*) FILTER (WHERE execution_status = 'pending_w0') as pending_w0,
  COUNT(*) FILTER (WHERE execution_status = 'ready_for_processing') as ready_for_processing,
  COUNT(*) FILTER (WHERE execution_status = 'ready_for_processing' AND next_workflow IS NOT NULL) as ready_for_router,
  COUNT(*) FILTER (WHERE execution_status = 'processing') as processing,
  COUNT(*) FILTER (WHERE execution_status = 'pending') as pending,
  COUNT(*) FILTER (WHERE shipping_address IS NULL) as missing_shipping,
  COUNT(*) FILTER (WHERE character_specs IS NULL) as missing_specs,
  COUNT(*) FILTER (WHERE shipping_address IS NOT NULL AND character_specs IS NOT NULL AND execution_status = 'pending_w0') as has_data_but_waiting_w0,
  COUNT(*) FILTER (WHERE shipping_address IS NOT NULL AND character_specs IS NOT NULL AND execution_status = 'ready_for_processing' AND next_workflow IS NULL) as ready_but_missing_next_workflow
FROM orders
WHERE status = 'new'
  OR execution_status IN ('pending_w0', 'pending', 'processing', 'ready_for_processing');

-- 5. Detailed view of the specific order with all relevant fields
SELECT 
  id,
  amazon_order_id,
  "orderId",
  status,
  execution_status,
  workflow_step,
  next_workflow,
  current_workflow,
  customer_name,
  customer_email,
  shipping_address,
  character_specs,
  character_hash,
  product_info::text as product_info_text,
  error_message,
  error_type,
  retry_count,
  max_retries,
  next_retry_at,
  created_at,
  updated_at,
  queued_at,
  started_at,
  -- Check if data is actually populated (not just not null)
  CASE 
    WHEN shipping_address::text = 'null' OR shipping_address::text = '{}' THEN 'EMPTY'
    WHEN shipping_address IS NULL THEN 'NULL'
    ELSE 'POPULATED'
  END as shipping_status,
  CASE 
    WHEN character_specs::text = 'null' OR character_specs::text = '{}' THEN 'EMPTY'
    WHEN character_specs IS NULL THEN 'NULL'
    ELSE 'POPULATED'
  END as specs_status
FROM orders
WHERE amazon_order_id = '111-0060602-1283417'
   OR "orderId" = '111-0060602-1283417';

