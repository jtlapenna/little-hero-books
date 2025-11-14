-- Setup order for testing Create Manifest button in backend UI
-- This ensures the order has all required data (character_specs, product_info)

-- Update the order you want to test (replace 'YOUR-ORDER-ID' with actual order ID)
UPDATE orders
SET 
  -- Required fields for Create Manifest endpoint
  character_specs = COALESCE(
    character_specs,
    '{
      "childName": "Test",
      "age": 5,
      "pronouns": "they/them",
      "skinTone": "tan",
      "hairColor": "brown",
      "hairStyle": "curly-short",
      "animalGuide": "unicorn",
      "clothingStyle": "adventure",
      "favoriteColor": "blue"
    }'::jsonb
  ),
  product_info = COALESCE(
    product_info,
    '{
      "quantity": 1,
      "bookSpecs": {
        "title": "Test and the Adventure Compass",
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
  dedication_text = COALESCE(dedication_text, 'For our little adventurer!'),
  -- Ensure manifest is missing (so button is visible)
  one_manifest_url = NULL
WHERE amazon_order_id = 'YOUR-ORDER-ID';  -- Replace with your test order ID

-- Verify the order has required data
SELECT 
  amazon_order_id,
  CASE 
    WHEN character_specs IS NULL THEN '❌ Missing character_specs'
    WHEN character_specs::text = '{}' THEN '⚠️ Empty character_specs'
    ELSE '✅ Has character_specs'
  END as character_specs_status,
  CASE 
    WHEN product_info IS NULL THEN '❌ Missing product_info'
    WHEN product_info::text = '{}' THEN '⚠️ Empty product_info'
    ELSE '✅ Has product_info'
  END as product_info_status,
  CASE 
    WHEN one_manifest_url IS NULL THEN '✅ Button will be visible'
    ELSE '❌ Button will NOT be visible (manifest exists)'
  END as button_visibility
FROM orders
WHERE amazon_order_id = 'YOUR-ORDER-ID';  -- Replace with your test order ID

