# JOHN-TEST3 Deep Diagnosis

## Critical Finding: Potential Field Name Mismatch in W0

Looking at W0's "Supabase Upsert (orders)" node code, I found a potential issue:

**W0 sets:**
```javascript
orderId: manifest.amazonOrderId,        // ⚠️ This field might not exist in schema
amazon_order_id: manifest.amazonOrderId,
```

**The schema uses:**
- `amazon_order_id` as the UNIQUE field (for upsert conflict resolution)
- No `orderId` field in the main schema

**Potential Issue:**
If W0's PATCH tries to update by `amazon_order_id` but includes `orderId` in the body, Supabase might:
1. Accept the PATCH but ignore the `orderId` field (if it doesn't exist)
2. Or fail silently if there's a constraint issue

## W0 Upsert Logic Flow

1. **First tries PATCH:**
   ```
   PATCH /rest/v1/orders?amazon_order_id=eq.JOHN-TEST3
   Body: { orderId: "JOHN-TEST3", amazon_order_id: "JOHN-TEST3", execution_status: "ready_for_processing", ... }
   ```

2. **If PATCH returns no data, tries POST:**
   ```
   POST /rest/v1/orders
   Body: { orderId: "JOHN-TEST3", amazon_order_id: "JOHN-TEST3", ... }
   ```

## Potential Root Causes

### 1. Backend API Created Order First
- Backend API (`/api/orders`) creates order with `execution_status='ready_for_processing'` and `next_workflow='2A'`
- W0 then runs and tries to PATCH the existing order
- If W0's PATCH includes `orderId` field (which doesn't exist), Supabase might reject it or ignore it
- Result: Order exists but W0's update didn't apply correctly

### 2. W0 PATCH Failed Silently
- W0's PATCH might have failed due to:
  - Invalid field name (`orderId` doesn't exist)
  - Missing required fields
  - Constraint violation
- The code then tries POST, but POST will fail if order already exists (unique constraint on `amazon_order_id`)
- Result: Order stuck in whatever state backend API created it in

### 3. W0 POST Failed Due to Conflict
- If backend API created order first
- W0's PATCH might return empty array (no rows updated)
- W0 then tries POST, which fails due to unique constraint
- Error might be caught and logged but not surfaced
- Result: Order exists but W0's fields weren't updated

## Diagnostic Queries to Run

### Check if orderId field exists:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND column_name IN ('orderId', 'amazon_order_id');
```

### Check order's actual state:
```sql
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  queued_at,
  workflow_step,
  one_manifest_url,
  created_at,
  updated_at
FROM orders
WHERE amazon_order_id = 'JOHN-TEST3';
```

### Check if W0's fields were applied:
```sql
-- Compare created_at vs updated_at
-- If updated_at is close to created_at, W0 might not have updated it
SELECT 
  amazon_order_id,
  created_at,
  updated_at,
  EXTRACT(EPOCH FROM (updated_at - created_at)) as seconds_between,
  CASE 
    WHEN EXTRACT(EPOCH FROM (updated_at - created_at)) < 5 THEN '⚠️ W0 might not have updated (updated_at too close to created_at)'
    ELSE '✅ W0 likely updated (updated_at significantly after created_at)'
  END as update_status
FROM orders
WHERE amazon_order_id = 'JOHN-TEST3';
```

## Recommended Fixes

### Immediate Fix:
Run the fix SQL to set correct state:
```sql
-- See docs/database/fix-john-test3-queue-for-2a.sql
```

### Long-term Fixes:

1. **Remove `orderId` from W0 upsert:**
   - W0 should only set `amazon_order_id`, not `orderId`
   - The schema doesn't have an `orderId` field

2. **Improve W0 error handling:**
   - Log PATCH response status and data
   - If PATCH returns empty array, check if order exists before trying POST
   - If order exists but PATCH failed, log the error clearly

3. **Add validation:**
   - After W0 upsert, verify the order has correct `execution_status` and `next_workflow`
   - If not, log error and alert

4. **Consider using Supabase upsert with `onConflict`:**
   - Instead of PATCH then POST, use POST with `?on_conflict=amazon_order_id`
   - This is more reliable and handles both insert and update cases

