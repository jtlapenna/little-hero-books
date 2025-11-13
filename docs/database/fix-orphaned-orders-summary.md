# Fix Orphaned Orders - Summary

## Issue 1: JESSICA-CUNT Not Showing Manual Review Banner

**Problem:** Order has `retry_count = 3` but `execution_status = 'error'` (should be `'error_requires_manual_review'`)

**Fix:** Run `docs/database/fix-jessica-cunt-status-now.sql`

```sql
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
```

**After fix:** The order detail page (`/orders/JESSICA-CUNT`) will show the manual review alert banner.

---

## Issue 2: JOHN-TEST4 & JOHN-TEST5 Not Being Picked Up by Router

**Problem:** Orders are `ready_for_processing` with `next_workflow = '4'`, match router query, router has capacity, but aren't being picked up.

**Root Cause:** Router execution gaps - if W1.1 router execution takes > 30 seconds, the next scheduled run is skipped, causing orders to be missed.

**Diagnosis:**
1. ✅ Router query matches: `execution_status = 'ready_for_processing'` AND `next_workflow IS NOT NULL`
2. ✅ Router has capacity: `processing_count = 0` (not at capacity)
3. ✅ Orders are eligible: Both have `next_workflow = '4'`
4. ❌ **Router execution gaps** - orders queued during skipped runs aren't picked up

**How to Check Execution Gaps:**

1. **In n8n UI:**
   - Go to W1.1 workflow
   - Click "Executions" tab
   - Sort by "Started At" (newest first)
   - Look for gaps > 1 minute between executions
   - Router should run every 30 seconds: `10:00:00`, `10:00:30`, `10:01:00`, etc.
   - If you see: `10:00:00`, `10:02:00` ← **2 minute gap!**

2. **Check execution duration:**
   - If any execution takes > 30 seconds, the next run is skipped
   - This causes execution gaps

**Solutions:**

### Option 1: Wait for Router to Pick Up (if gaps are temporary)
- Router will eventually pick up orders when it runs during a non-gap period
- Check router execution logs to see if it's running consistently now

### Option 2: Manually Reset Orders (if truly stuck)
- Use orphaned orders page to "Reset Processing"
- This will set `execution_status = 'error'` and schedule retry
- W1.3 will pick them up and reset to `ready_for_processing`

### Option 3: Fix Execution Gaps (long-term)
1. **Add timeouts to HTTP requests in W1.1**
2. **Optimize slow nodes** (identify which nodes take longest)
3. **Increase trigger interval** (e.g., every 1 minute instead of 30 seconds)
4. **Check n8n server resources** (CPU, memory)

**Immediate Fix for JOHN-TEST4 & JOHN-TEST5:**

Since they're eligible but not being picked up, you can:

1. **Wait** - Router should pick them up eventually
2. **Manually trigger** - Use orphaned orders page "Reset Processing" action
3. **Check router logs** - Verify router is running and not hitting errors

---

## Verification

After fixing JESSICA-CUNT:
```sql
SELECT 
  amazon_order_id,
  execution_status,
  retry_count,
  error_type,
  error_message
FROM orders
WHERE amazon_order_id = 'JESSICA-CUNT';
```

Expected result:
- `execution_status = 'error_requires_manual_review'`
- Manual review banner should appear on order detail page

For JOHN-TEST4 & JOHN-TEST5:
- Check router execution logs for gaps
- Monitor if router picks them up in next few cycles
- If not picked up after 5 minutes, use "Reset Processing" action

