-- Diagnose why orders have null character_specs and product_info
-- Check if data was ever set, when it might have been cleared, etc.

-- Check the two orders mentioned
SELECT 
  id,
  amazon_order_id,
  created_at,
  updated_at,
  character_specs,
  product_info,
  customer_name,
  customer_email,
  shipping_address,
  execution_status,
  workflow_step,
  retry_count,
  error_message,
  error_type,
  -- Check if data exists in manifests
  manifest_2a_url,
  manifest_2b_url,
  manifest_3_url,
  one_manifest_url
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
ORDER BY created_at DESC;

-- Check if there are any UPDATE operations that might have cleared data
-- (This would need to be checked in Supabase audit logs if available)

-- Check if orders were created with data initially
-- Compare created_at vs updated_at to see if there were updates after creation
SELECT 
  amazon_order_id,
  created_at,
  updated_at,
  EXTRACT(EPOCH FROM (updated_at - created_at)) / 60 as minutes_between_create_update,
  CASE 
    WHEN character_specs IS NULL THEN '❌ NULL'
    WHEN character_specs::text = '{}' THEN '⚠️ Empty object'
    ELSE '✅ Has data'
  END as character_specs_status,
  CASE 
    WHEN product_info IS NULL THEN '❌ NULL'
    WHEN product_info::text = '{}' THEN '⚠️ Empty object'
    ELSE '✅ Has data'
  END as product_info_status
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5');

-- Check if there are other orders with null character_specs (to see if it's a pattern)
SELECT 
  COUNT(*) as total_orders,
  COUNT(*) FILTER (WHERE character_specs IS NULL) as null_character_specs,
  COUNT(*) FILTER (WHERE product_info IS NULL) as null_product_info,
  COUNT(*) FILTER (WHERE character_specs IS NULL AND product_info IS NULL) as both_null
FROM orders;

