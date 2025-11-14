# Why Schedule Retry Didn't Run

## Possible Causes

### 1. Orders Already Had retry_count >= 3
If the orders already had `retry_count >= 3`, the "Decide Retry or Manual Review" node would route them to "Mark for Manual Review" instead of "Schedule Retry".

**Check:**
```sql
SELECT amazon_order_id, retry_count 
FROM orders 
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5');
```

### 2. IF Node Routed to Wrong Branch
The "Check Action" IF node checks if `action === 'require_manual_review'`. If the action is `'schedule_retry'`, it should go to the "Schedule Retry" node (false branch).

**Check W1.2 execution logs:**
- Look at "Decide Retry or Manual Review" node output
- Check what `action` value it set
- Verify which branch the IF node took

### 3. Schedule Retry Node Failed Silently
The PATCH request might have failed but not shown an error.

**Check:**
- Look at "Schedule Retry" node execution in W1.2 logs
- Check if it shows success or error
- Verify the response from Supabase

### 4. Orders Were Never Processed by W1.2
W1.2 might not have detected these orders as stuck, or they were processed before the fix.

**Check:**
- Look at W1.2 execution history
- See if these orders were ever processed
- Check when they were marked as 'error'

## How to Fix

### Option 1: Manually Schedule Retry
If orders are in 'error' status but don't have `next_retry_at` set, manually schedule them:

```sql
UPDATE orders
SET 
  execution_status = 'error',
  retry_count = COALESCE(retry_count, 0) + 1,
  next_retry_at = NOW() + INTERVAL '5 minutes', -- 5 min delay for first retry
  error_type = 'workflow_timeout',
  error_message = 'Manually scheduled for retry',
  updated_at = NOW()
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
  AND execution_status = 'error'
  AND (retry_count IS NULL OR retry_count < 3);
```

### Option 2: Reset and Let W1.2 Process Again
Reset the orders so W1.2 can process them again:

```sql
UPDATE orders
SET 
  execution_status = 'processing', -- Back to processing so W1.2 detects as stuck
  retry_count = NULL,
  next_retry_at = NULL,
  error_type = NULL,
  error_message = NULL,
  updated_at = NOW()
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5');
```

Then wait for W1.2 to run (every 5 minutes) and it should detect them as stuck and schedule retry.

