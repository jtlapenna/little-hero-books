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
-- Set to ready_for_processing with old queued_at to get orphan_reason = 'ready_not_picked_up'
-- This will trigger the classification logic that checks for missing manifest at workflow 4
-- IMPORTANT: Include character_specs and product_info so Create Manifest endpoint can work
UPDATE orders
SET 
  execution_status = 'ready_for_processing',
  error_type = NULL,
  error_message = NULL,
  next_workflow = '4',
  one_manifest_url = NULL,  -- Missing manifest - this is the key condition
  current_workflow = NULL,
  started_at = NULL,
  retry_count = 0,
  next_retry_at = NULL,
  queued_at = NOW() - INTERVAL '2 hours',  -- Old enough to be detected as orphaned
  updated_at = NOW() - INTERVAL '2 hours',
  -- Required fields for Create Manifest endpoint
  character_specs = COALESCE(
    character_specs,
    '{
      "childName": "Jessica",
      "age": 5,
      "pronouns": "she/her",
      "skinTone": "tan",
      "hairColor": "brown",
      "hairStyle": "curly-long",
      "animalGuide": "unicorn",
      "clothingStyle": "adventure",
      "favoriteColor": "purple"
    }'::jsonb
  ),
  product_info = COALESCE(
    product_info,
    '{
      "quantity": 1,
      "bookSpecs": {
        "title": "Jessica and the Adventure Compass",
        "totalPages": 16,
        "format": "8.5x8.5_softcover",
        "bookType": "adventure"
      },
      "shippingAddress": {
        "name": "Test Customer",
        "address": "123 Test St",
        "city": "Portland",
        "state": "OR",
        "zip": "97201",
        "phone": "+1-555-123-4567"
      }
    }'::jsonb
  ),
  customer_email = COALESCE(customer_email, 'test@littleherolabs.com'),
  customer_name = COALESCE(customer_name, 'Test Customer'),
  dedication_text = COALESCE(dedication_text, 'For our little adventurer!')
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
    WHEN execution_status = 'ready_for_processing' 
         AND one_manifest_url IS NULL 
         AND next_workflow = '4'
         AND queued_at < NOW() - INTERVAL '30 minutes'
    THEN '✅ Will trigger create_manifest action (via ready_not_picked_up + missing manifest)'
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

