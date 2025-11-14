# W1.2 Multiple Orders Processing Issue

## Problem

W1.2 detected 3 stuck orders but only 1 was processed by the "Schedule Retry" node.

## Root Cause

n8n processes items **one at a time** by default. Each node receives items sequentially and processes them. However, if a node fails for one item, it can stop the workflow or skip remaining items.

**The Schedule Retry node processes each order individually**, but if the PATCH request fails for any order (e.g., wrong `order_id`), that order is skipped.

## Why Only 1 Order Was Processed

Looking at the output, only `JESSICA-CUNT` (id: 171) was returned. This suggests:

1. **The other 2 orders might have failed in earlier nodes** (Mark Stuck as Error, Log to Failed Orders)
2. **The Schedule Retry node might have failed for the other 2** (wrong `order_id`, PATCH failed)
3. **The workflow might have stopped after first error**

## Solution

### 1. Ensure All Nodes Process All Items

By default, n8n nodes process all items. But we need to ensure:
- No node stops on error
- All PATCH requests use correct `order_id`
- Errors are logged but don't stop workflow

### 2. Check W1.2 Execution Logs

Look at the execution logs for:
- How many orders were detected by "Detect Stuck Orders"
- How many were marked as error by "Mark Stuck as Error"
- How many were logged to failed_orders by "Log to Failed Orders"
- How many reached "Schedule Retry"

### 3. Verify order_id is Correct

The Schedule Retry node uses `$json.order_id` from the failed_orders record. Verify:
- "Log to Failed Orders" correctly sets `order_id: $json.id` (the orders table ID)
- "Decide Retry or Manual Review" preserves `order_id`
- Schedule Retry uses `$json.order_id` correctly

### 4. Add Error Handling

Consider adding error handling so one failed order doesn't stop the others:
- Use "Continue on Fail" option in nodes
- Add error logging
- Don't stop workflow on individual order failures

## Verification

Run this query to see which orders were actually scheduled for retry:

```sql
SELECT 
  amazon_order_id,
  execution_status,
  retry_count,
  next_retry_at,
  error_message,
  updated_at
FROM orders
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5')
ORDER BY updated_at DESC;
```

If only 1 has `next_retry_at` set, the other 2 failed somewhere in the workflow.

