-- Check why JESSICA-CUNT isn't showing manual review banner
-- The order should have execution_status = 'error_requires_manual_review'

SELECT 
  id,
  amazon_order_id,
  execution_status,
  status as overall_status,
  error_type,
  error_message,
  retry_count,
  workflow_step,
  current_workflow,
  next_workflow,
  updated_at,
  -- Check if it should show manual review banner
  CASE 
    WHEN execution_status = 'error_requires_manual_review' THEN '✅ Should show manual review banner'
    WHEN execution_status = 'error' AND retry_count >= 3 THEN '⚠️ Should be marked as error_requires_manual_review'
    ELSE '❌ Wrong status: ' || execution_status
  END as manual_review_status
FROM orders
WHERE amazon_order_id = 'JESSICA-CUNT';

-- If execution_status is not 'error_requires_manual_review', fix it:
-- UPDATE orders
-- SET execution_status = 'error_requires_manual_review',
--     error_message = COALESCE(error_message, 'Max retries (3) exceeded. Requires manual intervention.')
-- WHERE amazon_order_id = 'JESSICA-CUNT'
--   AND execution_status = 'error'
--   AND retry_count >= 3;

