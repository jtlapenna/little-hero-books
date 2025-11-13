# Queue Status Bug Investigation Summary

## Problem
After deleting orders from R2 and Supabase, W1.1 still shows `currentProcessing: 5`, blocking all new orders.

## Root Cause Analysis

### How currentProcessing is Calculated
1. W1.1 queries `queue_status` view via PostgREST: `GET /rest/v1/queue_status?select=*`
2. The view should return: `{ processing_count: X, queued_count: Y }`
3. W1.1 calculates: `currentProcessing = response.processing_count || 0`
4. Available slots: `availableSlots = maxConcurrent (5) - currentProcessing`

### Possible Causes
1. **queue_status view doesn't exist** - PostgREST might be returning cached/stale data
2. **queue_status is a materialized view** - Needs REFRESH to update
3. **PostgREST schema cache is stale** - View exists but cache hasn't refreshed
4. **View definition is wrong** - Counting from wrong table or with wrong WHERE clause
5. **Soft-deleted records** - Orders marked as deleted but still counted

## Solution

Created `docs/database/fix-queue-status-view.sql` which:
1. Drops existing `queue_status` view/function if it exists
2. Creates a fresh `queue_status` view that counts from `orders` table
3. Grants proper permissions for PostgREST access
4. Includes verification queries

## Next Steps

1. **Run the fix SQL** in Supabase SQL Editor
2. **Wait 2-5 minutes** for PostgREST schema cache to refresh
3. **Test W1.1** - Check if `currentProcessing` now shows correct count
4. **If still wrong**, run diagnostic queries from `docs/database/investigate-queue-status-bug.sql`

## Diagnostic Queries

If the fix doesn't work, run these to investigate:

```sql
-- Check if view exists
SELECT * FROM information_schema.views WHERE table_name = 'queue_status';

-- Check view definition
SELECT view_definition FROM information_schema.views WHERE table_name = 'queue_status';

-- Compare counts
SELECT * FROM queue_status;
SELECT COUNT(*) FILTER (WHERE execution_status = 'processing') FROM orders;
```

## Prevention

After fixing, ensure:
- `queue_status` view is documented in schema
- View is included in database migrations
- PostgREST cache refresh is monitored
- W1.1 logs include actual counts for debugging

