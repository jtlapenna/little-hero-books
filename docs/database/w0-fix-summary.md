# W0 Fix Summary - Root Cause Resolution

## Problem Identified

Order `JOHN-TEST3` (and potentially others) were created in W0 with a `1-manifest.json`, but never progressed to W2A because W0's Supabase upsert was failing silently.

## Root Cause

**W0's "Supabase Upsert (orders)" node had two critical issues:**

1. **Invalid Field:** Included `orderId: manifest.amazonOrderId` in the request body, but the schema only has `amazon_order_id`, not `orderId`. This caused Supabase to reject or ignore the update.

2. **Inefficient Pattern:** Used PATCH then POST pattern instead of the more reliable `on_conflict` upsert pattern used by other workflows (2A, 2B, 3, 4).

## What Happened

1. Backend API (`/api/orders`) creates order with `execution_status='ready_for_processing'` and `next_workflow='2A'`
2. W0 runs and tries to update the order with manifest URL
3. W0's PATCH includes invalid `orderId` field → Supabase rejects/ignores it
4. W0 tries POST → Fails due to unique constraint (order already exists)
5. Order remains in backend API's initial state (might have wrong fields)
6. Router can't pick it up if `execution_status` or `next_workflow` is wrong

## The Fix

### Changes Made to W0 Workflow

**File:** `docs/n8n-workflow-files/finals/LHB - 0 - ORDER INTAKE VALIDATION.json`

**Node:** "Supabase Upsert (orders)"

**Changes:**
1. ✅ **Removed invalid `orderId` field** - Only use `amazon_order_id` (matches schema)
2. ✅ **Changed to POST with `on_conflict`** - Uses same pattern as workflows 2A, 2B, 3, 4
3. ✅ **Updated header** - Changed `Prefer: return=representation` to `Prefer: resolution=merge-duplicates,return=representation`
4. ✅ **Simplified logic** - Removed PATCH-then-POST pattern, now single POST request

**Before:**
```javascript
const body = {
  orderId: manifest.amazonOrderId,        // ❌ Invalid field
  amazon_order_id: manifest.amazonOrderId,
  // ...
};
// PATCH first, then POST if PATCH fails
```

**After:**
```javascript
const body = {
  amazon_order_id: manifest.amazonOrderId,  // ✅ Only valid fields
  // ...
};
// POST with on_conflict=amazon_order_id (handles both insert and update)
```

## Benefits

1. **More Reliable:** Single POST request handles both insert and update cases
2. **Consistent:** Matches pattern used by all other workflows
3. **No Invalid Fields:** Only includes fields that exist in schema
4. **Better Error Handling:** Simpler code path, easier to debug

## Testing

After deploying this fix:
1. Create a new test order via W0
2. Verify it progresses to W2A automatically
3. Check Supabase to confirm `execution_status='ready_for_processing'` and `next_workflow='2A'` are set correctly
4. Verify router picks it up within 30 seconds

## Related Files

- `docs/database/diagnose-john-test3.sql` - Diagnostic queries (fixed priority type issue)
- `docs/database/fix-john-test3-queue-for-2a.sql` - Manual fix for existing stuck orders
- `docs/database/john-test3-root-cause.md` - Detailed root cause analysis

