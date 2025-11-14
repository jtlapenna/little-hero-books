# JOHN-TEST3 Root Cause Analysis

## 🔴 CRITICAL ISSUE FOUND: Invalid Field in W0 Upsert

### The Problem

In W0's "Supabase Upsert (orders)" node (line ~140), the code sets:
```javascript
const body = {
  orderId: manifest.amazonOrderId,        // ❌ THIS FIELD DOESN'T EXIST IN SCHEMA!
  amazon_order_id: manifest.amazonOrderId,
  execution_status: 'ready_for_processing',
  next_workflow: '2A',
  // ... other fields
};
```

**The schema only has `amazon_order_id`, NOT `orderId`.**

### What Happens

1. **Backend API** (`/api/orders`) creates order first with correct fields
2. **W0** runs and tries to PATCH the existing order
3. W0's PATCH includes `orderId` field (which doesn't exist in schema)
4. Supabase might:
   - **Option A:** Accept PATCH but ignore `orderId` field → Order updated but might have issues
   - **Option B:** Reject PATCH silently → W0 tries POST, which fails due to unique constraint
   - **Option C:** PATCH succeeds but doesn't update `execution_status`/`next_workflow` correctly

### W0's Upsert Logic

```javascript
// First tries PATCH
PATCH /rest/v1/orders?amazon_order_id=eq.JOHN-TEST3
Body: { orderId: "JOHN-TEST3", amazon_order_id: "JOHN-TEST3", ... }

// If PATCH returns empty array, tries POST
POST /rest/v1/orders
Body: { orderId: "JOHN-TEST3", amazon_order_id: "JOHN-TEST3", ... }
```

**Problem:** If backend API created order first, PATCH should work but might fail due to `orderId` field. Then POST fails due to unique constraint, and the error might be swallowed.

## Diagnosis Checklist

Run these queries in order:

### 1. Check if orderId field exists (it shouldn't):
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND column_name = 'orderId';
-- Should return 0 rows
```

### 2. Check order's current state:
```sql
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  queued_at,
  workflow_step,
  one_manifest_url,
  created_at,
  updated_at,
  CASE 
    WHEN execution_status != 'ready_for_processing' THEN '❌ Wrong execution_status'
    WHEN next_workflow IS NULL THEN '❌ Missing next_workflow'
    WHEN next_workflow != '2A' THEN '⚠️ Wrong next_workflow: ' || next_workflow
    WHEN one_manifest_url IS NULL THEN '❌ Missing manifest URL'
    ELSE '✅ Ready for router'
  END as status
FROM orders
WHERE amazon_order_id = 'JOHN-TEST3';
```

### 3. Check if W0 updated the order:
```sql
-- If updated_at is very close to created_at, W0 might not have updated it
SELECT 
  amazon_order_id,
  created_at,
  updated_at,
  EXTRACT(EPOCH FROM (updated_at - created_at)) as seconds_between,
  CASE 
    WHEN EXTRACT(EPOCH FROM (updated_at - created_at)) < 2 THEN '⚠️ W0 likely did NOT update (updated_at = created_at)'
    WHEN EXTRACT(EPOCH FROM (updated_at - created_at)) < 10 THEN '⚠️ W0 might not have updated (very close timestamps)'
    ELSE '✅ W0 likely updated (updated_at significantly after created_at)'
  END as update_status
FROM orders
WHERE amazon_order_id = 'JOHN-TEST3';
```

### 4. Check for other orders blocking it:
```sql
-- See fixed query in diagnose-john-test3.sql (priority is VARCHAR, not INT)
```

## The Fix

### Immediate Fix (for JOHN-TEST3):
```sql
-- See docs/database/fix-john-test3-queue-for-2a.sql
UPDATE orders
SET
  execution_status = 'ready_for_processing',
  next_workflow = '2A',
  queued_at = COALESCE(queued_at, CURRENT_TIMESTAMP),
  started_at = NULL,
  current_workflow = NULL,
  updated_at = CURRENT_TIMESTAMP
WHERE amazon_order_id = 'JOHN-TEST3';
```

### Long-term Fix (for W0 workflow):

**Remove `orderId` field from W0's Supabase upsert:**

In `LHB - 0 - ORDER INTAKE VALIDATION.json`, line ~140, change:
```javascript
// BEFORE (WRONG):
const body = {
  orderId: manifest.amazonOrderId,        // ❌ Remove this line
  amazon_order_id: manifest.amazonOrderId,
  // ...
};

// AFTER (CORRECT):
const body = {
  amazon_order_id: manifest.amazonOrderId,  // ✅ Only this field
  // ...
};
```

**Also consider using POST with `on_conflict` instead of PATCH then POST:**
```javascript
// Instead of PATCH then POST, use:
POST /rest/v1/orders?on_conflict=amazon_order_id
Body: { amazon_order_id: "...", execution_status: "...", ... }
Headers: { Prefer: "resolution=merge-duplicates,return=representation" }
```

This is more reliable and handles both insert and update cases in one request.

## Why This Matters

- **Backend API** creates orders correctly
- **W0** is supposed to update them with manifest URL and ensure correct state
- If W0's update fails, orders get stuck in wrong state
- Router can't pick them up if `execution_status` or `next_workflow` is wrong

## Next Steps

1. ✅ Fixed SQL diagnostic query (priority type issue)
2. ⏳ Run diagnostic queries to confirm root cause
3. ⏳ Fix W0 workflow to remove `orderId` field
4. ⏳ Test with a new order to verify fix works
5. ⏳ Consider migrating W0 to use `on_conflict` upsert pattern

