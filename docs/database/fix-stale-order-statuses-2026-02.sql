-- ONE-TIME CLEANUP: Fix all stale order statuses (Feb 2026)
--
-- Problem: Multiple orders have stale status / workflow_step / execution_status
-- because the Lulu webhook and other routes were not updating these fields.
--
-- Run this ONCE in the Supabase SQL editor after deploying the code fixes.
-- Always preview with SELECT before running the UPDATE.

BEGIN;

-- 1. Fix shipped/delivered orders with stale status or workflow_step
-- These orders have lulu_status = SHIPPED or DELIVERED but their display status
-- and workflow_step were never updated.
UPDATE orders
SET
  status = CASE lulu_status
    WHEN 'SHIPPED' THEN 'shipped'
    WHEN 'DELIVERED' THEN 'delivered'
  END,
  workflow_step = 'done',
  execution_status = 'done',
  started_at = NULL,
  current_workflow = NULL,
  updated_at = NOW()
WHERE lulu_status IN ('SHIPPED', 'DELIVERED')
  AND (
    status NOT IN ('shipped', 'delivered', 'done')
    OR workflow_step != 'done'
    OR execution_status != 'done'
  );

-- 2. Fix order 699 (pending customer approval but flagged as workflow_timeout)
-- The health monitor changed execution_status from 'processing' to 'error'.
-- Clear the stale processing/error fields so it returns to normal approval state.
UPDATE orders
SET
  execution_status = 'done',
  error_type = NULL,
  error_message = NULL,
  last_error_at = NULL,
  next_retry_at = NULL,
  retry_count = 0,
  started_at = NULL,
  current_workflow = NULL,
  updated_at = NOW()
WHERE id = 699
  AND customer_approval_status = 'pending'
  AND execution_status IN ('processing', 'error');

-- 3. Fix any other completed orders still marked ready_for_processing
-- These have a lulu_status set (meaning Lulu accepted them) but execution_status
-- was never transitioned to 'done'.
UPDATE orders
SET
  execution_status = 'done',
  started_at = NULL,
  current_workflow = NULL,
  updated_at = NOW()
WHERE lulu_status IS NOT NULL
  AND lulu_status != ''
  AND execution_status IN ('ready_for_processing', 'processing')
  AND lulu_status NOT IN ('CREATED', 'UNPAID', 'PAYMENT_IN_PROGRESS', 'PRODUCTION_READY', 'PRODUCTION_DELAYED');

COMMIT;
