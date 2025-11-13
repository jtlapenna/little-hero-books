# "Mark for Manual Review" - What It Does

## Overview
When an order is "marked for manual review", it means the automated retry system has given up and the order requires human intervention to fix.

## What Happens to the Order

**Database Changes:**
- `execution_status` → `'error_requires_manual_review'`
- `error_message` → Updated with reason (e.g., "Max retries reached" or "Orphaned order")
- Order is **no longer automatically retried** by W1.3
- Order is **no longer picked up** by W1.1 router

**What This Means:**
- The order is stuck and needs admin attention
- The automated system has tried multiple times and failed
- An admin must manually investigate and fix the issue
- The order will remain in this state until manually fixed

## W1.2 - Stuck Workflow Manager

**When it marks for manual review:**
- Order has been retried 3+ times (`retry_count >= 3`)
- Order was detected as stuck (processing > 30 minutes)
- All automatic retry attempts have failed

**What it does:**
```javascript
execution_status: 'error_requires_manual_review'
error_message: 'Max retries reached. <original error message>'
```

**Then:**
- Logs alert to console: `🚨 MANUAL REVIEW REQUIRED`
- TODO: Send to Slack/Email (not implemented yet)

**Where to find these orders:**
- They will appear in the admin UI with `execution_status: 'error_requires_manual_review'`
- Can be queried: `SELECT * FROM orders WHERE execution_status = 'error_requires_manual_review'`

## W1.3 - Retry Recovery Manager

**Does NOT have "mark for manual review"**
- W1.3 only resets orders for retry
- It doesn't make decisions about manual review
- If an order needs manual review, W1.2 or W1.4 handles it

## W1.4 - Orphaned Orders Monitor

**When it marks for manual review:**
- `error_max_retries_exceeded`: Order has `retry_count >= 3` and is in error state
- `error_no_retry_scheduled`: Order is in error state but has no retry scheduled AND `retry_count >= 3`

**What it does:**
```javascript
execution_status: 'error_requires_manual_review'
error_message: 'Orphaned order: <error message>. Requires manual intervention.'
```

**Then:**
- Logs to "Alert: Orphaned Orders" node
- TODO: Send to Slack/Email (not implemented yet)

**Where to find these orders:**
- Appear in `/admin/orphaned-orders` page
- Can be queried via `orphaned_orders` view
- Can be manually recovered via admin UI

## How to Handle Manual Review Orders

### Option 1: Admin UI
- Visit `/admin/orphaned-orders` or `/admin/stuck-orders`
- Find orders with `execution_status: 'error_requires_manual_review'`
- Investigate the error message
- Manually fix the issue (e.g., fix data, restart workflow, etc.)
- Reset order to `ready_for_processing` when fixed

### Option 2: SQL Query
```sql
-- Find all orders requiring manual review
SELECT 
  amazon_order_id,
  execution_status,
  error_message,
  error_type,
  retry_count,
  workflow_step,
  current_workflow
FROM orders
WHERE execution_status = 'error_requires_manual_review'
ORDER BY updated_at DESC;
```

### Option 3: Manual Reset (if you fix the issue)
```sql
-- After fixing the issue, reset the order for retry
UPDATE orders
SET 
  execution_status = 'ready_for_processing',
  error_message = NULL,
  error_type = NULL,
  retry_count = 0,  -- Reset retry count if issue is fixed
  next_retry_at = NULL,
  current_workflow = NULL,
  started_at = NULL
WHERE amazon_order_id = 'ORDER-ID-HERE';
```

## Summary

| Workflow | When It Marks for Review | What It Sets | Where to Find |
|----------|-------------------------|--------------|---------------|
| **W1.2** | `retry_count >= 3` | `error_requires_manual_review` | Admin UI, SQL query |
| **W1.3** | Never (only resets for retry) | N/A | N/A |
| **W1.4** | `retry_count >= 3` OR orphaned with no retry | `error_requires_manual_review` | `/admin/orphaned-orders` |

**Key Point:** Once marked for manual review, the order stops all automated processing and requires human intervention to continue.

