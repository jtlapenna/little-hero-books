-- Diagnostic SQL to identify router issues
-- Run this in Supabase SQL Editor to understand what's happening

-- 1. Check all orders and their execution_status values
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
  priority,
  character_specs IS NOT NULL as has_character_specs,
  one_manifest_url IS NOT NULL as has_manifest_url,
  created_at,
  updated_at
FROM orders
ORDER BY created_at DESC;

-- 2. Check specifically what the router would fetch
-- (orders with execution_status = 'ready_for_processing')
SELECT 
  id,
  amazon_order_id,
  execution_status,
  status,
  next_workflow,
  priority,
  queued_at
FROM orders
WHERE execution_status = 'ready_for_processing'
ORDER BY priority DESC NULLS LAST, queued_at ASC NULLS LAST;

-- 3. Check for NULL execution_status (which might be getting picked up)
SELECT 
  id,
  amazon_order_id,
  execution_status,
  status,
  next_workflow
FROM orders
WHERE execution_status IS NULL;

-- 4. Check queue_status view (what the router uses for capacity)
SELECT * FROM queue_status;

-- 5. Check if orders_ready_for_workflow view exists and what it shows
SELECT * FROM orders_ready_for_workflow LIMIT 10;

-- 6. Check for orders with missing data (character_specs, manifest, etc.)
SELECT 
  amazon_order_id,
  execution_status,
  status,
  character_specs IS NULL as missing_character_specs,
  one_manifest_url IS NULL as missing_manifest_url,
  shipping_address IS NULL as missing_shipping,
  customer_email IS NULL as missing_email
FROM orders
WHERE character_specs IS NULL 
   OR one_manifest_url IS NULL
   OR shipping_address IS NULL;

