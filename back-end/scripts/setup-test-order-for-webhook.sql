-- SQL script to create a test order with lulu_job_id for webhook testing
-- Run this in Supabase SQL Editor

-- First, check if we have any existing test orders
SELECT orderId, amazon_order_id, lulu_job_id, lulu_status 
FROM orders 
WHERE orderId LIKE 'TEST-%' OR amazon_order_id LIKE 'TEST-%'
LIMIT 5;

-- Option 1: Update an existing test order with a lulu_job_id
-- Replace 'YOUR_TEST_ORDER_ID' with an actual order ID from above
-- UPDATE orders 
-- SET lulu_job_id = '12345',
--     lulu_status = NULL,
--     tracking_number = NULL,
--     tracking_url = NULL,
--     carrier = NULL
-- WHERE orderId = 'YOUR_TEST_ORDER_ID' OR amazon_order_id = 'YOUR_TEST_ORDER_ID';

-- Option 2: Create a new test order (if needed)
-- INSERT INTO orders (
--   orderId,
--   amazonOrderId,
--   childName,
--   childAge,
--   status,
--   lulu_job_id,
--   lulu_status
-- ) VALUES (
--   'TEST-WEBHOOK-001',
--   'TEST-WEBHOOK-001',
--   'Test Child',
--   5,
--   'pending_print',
--   '12345',  -- This is the print_job_id we'll use in webhook tests
--   NULL
-- );

-- After running the webhook test, verify the update:
-- SELECT orderId, lulu_job_id, lulu_status, tracking_number, carrier, tracking_url
-- FROM orders 
-- WHERE lulu_job_id = '12345';

