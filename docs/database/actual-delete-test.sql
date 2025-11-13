-- ACTUAL DELETE TEST - This will show the real error
-- Replace 'YOUR-ORDER-ID-HERE' with an actual order ID you're trying to delete

-- Step 1: Verify the order exists
SELECT 
  id,
  amazon_order_id,
  execution_status,
  created_at
FROM orders
WHERE amazon_order_id = 'YOUR-ORDER-ID-HERE';

-- Step 2: Try to delete it and see what happens
-- If this fails, you'll get an error message that tells us exactly why

DELETE FROM orders 
WHERE amazon_order_id = 'YOUR-ORDER-ID-HERE'
RETURNING id, amazon_order_id;

-- If successful, you'll see the deleted row returned
-- If it fails, you'll see an error message

-- Step 3: Verify it's gone
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM orders WHERE amazon_order_id = 'YOUR-ORDER-ID-HERE')
    THEN 'Order still exists - deletion failed'
    ELSE 'Order deleted successfully ✅'
  END as deletion_status;

