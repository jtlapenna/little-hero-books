# JOHN-TEST3 Issue Analysis

## Problem
Order `JOHN-TEST3` was created in W0 and has a `1-manifest.json`, but it never progressed to W2A. It should have been automatically queued and run through W2A.

## Expected Flow
1. **W0** creates order → Sets `execution_status='ready_for_processing'` and `next_workflow='2A'`
2. **W1.1 Router** (runs every 30 seconds) queries for orders with `execution_status='ready_for_processing'`
3. Router routes order to **W2A** based on `next_workflow='2A'`
4. **W2A** processes the order

## Possible Root Causes

### 1. W0 Supabase Upsert Failed
- W0's "Supabase Upsert (orders)" node might have failed silently
- Check n8n execution logs for W0 to see if there were any errors
- The order might exist in Supabase but with wrong `execution_status` or `next_workflow`

### 2. Backend API Created Order First
- The backend API (`/api/orders`) also creates orders with `execution_status='ready_for_processing'` and `next_workflow='2A'`
- If W0 ran after the backend API, W0's upsert might have failed or overwrote fields incorrectly
- Check if there's a conflict between backend API and W0

### 3. Order State in Supabase
- The order might have:
  - `execution_status` set to something other than `'ready_for_processing'`
  - `next_workflow` set to `NULL` or something other than `'2A'`
  - Missing `queued_at` timestamp
  - `priority` set incorrectly (blocked by higher priority orders)

## Diagnosis Steps

1. **Run diagnostic SQL:**
   ```sql
   -- See docs/database/diagnose-john-test3.sql
   ```
   This will show:
   - Current order state
   - Whether it would be picked up by router
   - If other orders are blocking it
   - Manifest URL status

2. **Check W0 execution logs in n8n:**
   - Look for the "Supabase Upsert (orders)" node
   - Check if it succeeded or failed
   - Look for any error messages

3. **Check W1.1 router logs:**
   - Look for executions around the time the order was created
   - Check if the router fetched any orders
   - Check if `JOHN-TEST3` appears in the logs

## Quick Fix

If the order exists but has wrong state, run:
```sql
-- See docs/database/fix-john-test3-queue-for-2a.sql
```

This will set:
- `execution_status = 'ready_for_processing'`
- `next_workflow = '2A'`
- `queued_at = CURRENT_TIMESTAMP` (if not already set)
- Clear `started_at` and `current_workflow`

## Prevention

To prevent this in the future:
1. Add error handling/alerting for W0 Supabase upsert failures
2. Add validation to ensure orders created by W0 have correct state
3. Add monitoring to detect orders stuck in `ready_for_processing` for too long
4. Consider using database triggers or constraints to ensure required fields are set

