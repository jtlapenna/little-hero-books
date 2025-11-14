-- Fix JESSICA-CUNT to show manual review banner
-- This order has retry_count = 3 but execution_status might not be 'error_requires_manual_review'

-- First, check current status
SELECT 
  amazon_order_id,
  execution_status,
  retry_count,
  error_type,
  error_message,
  workflow_step
FROM orders
WHERE amazon_order_id = 'JESSICA-CUNT';

-- If execution_status is 'error' (not 'error_requires_manual_review'), update it:
UPDATE orders
SET 
  execution_status = 'error_requires_manual_review',
  error_message = COALESCE(
    error_message, 
    'Max retries (3) exceeded. Automated recovery system has given up. Requires manual intervention.'
  ),
  error_type = COALESCE(error_type, 'workflow_timeout')
WHERE amazon_order_id = 'JESSICA-CUNT'
  AND execution_status = 'error'
  AND retry_count >= 3;

-- Verify the update
SELECT 
  amazon_order_id,
  execution_status,
  retry_count,
  error_type,
  error_message
FROM orders
WHERE amazon_order_id = 'JESSICA-CUNT';

-- After this update, the order detail page should show the manual review banner

