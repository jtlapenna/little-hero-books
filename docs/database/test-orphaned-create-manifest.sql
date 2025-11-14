-- Test: Orphaned Recovery Action - Create Manifest
-- This sets up an order that should trigger the "create_manifest" recovery action
-- 
-- Conditions:
-- - Order is at workflow 4 (next_workflow = '4')
-- - Order is missing one_manifest_url (NULL)
-- - Order has execution_status = 'error' or 'ready_for_processing'
-- 
-- Expected Result:
-- - Health Monitor should classify this as action = 'create_manifest'
-- - Should call /api/admin/orders/{orderId}/create-manifest
-- - Should create 1-manifest.json in R2
-- - Should update Supabase: one_manifest_url, execution_status = 'ready_for_processing', next_workflow = '2A'

-- Use JESSICA-CUNT (ID: 171) for testing
UPDATE orders
SET 
  execution_status = 'error',
  error_type = 'missing_manifest',
  error_message = 'Missing 1-manifest.json - test for create_manifest recovery',
  next_workflow = '4',
  one_manifest_url = NULL,
  current_workflow = NULL,
  started_at = NULL,
  retry_count = 0,
  next_retry_at = NULL,
  updated_at = NOW()
WHERE amazon_order_id = 'JESSICA-CUNT';

-- Verify the order setup
SELECT 
  id,
  amazon_order_id,
  execution_status,
  error_type,
  error_message,
  next_workflow,
  one_manifest_url,
  retry_count,
  current_workflow,
  started_at,
  updated_at,
  -- Check if it will be picked up by get_orphaned_orders()
  CASE 
    WHEN execution_status = 'error' AND one_manifest_url IS NULL AND next_workflow = '4' 
    THEN '✅ Will trigger create_manifest action'
    ELSE '❌ May not trigger create_manifest action'
  END as expected_action
FROM orders
WHERE amazon_order_id = 'JESSICA-CUNT';

-- Verify via get_orphaned_orders() RPC function
SELECT 
  amazon_order_id,
  orphan_reason,
  execution_status,
  next_workflow,
  one_manifest_url,
  'Should be classified as create_manifest' as expected_classification
FROM get_orphaned_orders()
WHERE amazon_order_id = 'JESSICA-CUNT';

