# W0 Fix - Complete Implementation

## ✅ Changes Applied

### File: `docs/n8n-workflow-files/finals/LHB - 0 - ORDER INTAKE VALIDATION.json`
**Node:** "Supabase Upsert (orders)"

### Fix 1: Removed Invalid Field
**Before:**
```javascript
const body = {
  orderId: manifest.amazonOrderId,        // ❌ Invalid - doesn't exist in schema
  amazon_order_id: manifest.amazonOrderId,
  // ...
};
```

**After:**
```javascript
const body = {
  amazon_order_id: manifest.amazonOrderId,  // ✅ Only valid fields
  // ...
};
```

### Fix 2: Changed to Reliable Upsert Pattern
**Before:**
- PATCH first (update if exists)
- If PATCH returns empty, try POST
- Complex error handling for two requests

**After:**
- Single POST request with `?on_conflict=amazon_order_id`
- Header: `Prefer: resolution=merge-duplicates,return=representation`
- Matches pattern used by workflows 2A, 2B, 3, 4

## Why This Fixes the Issue

1. **No Invalid Fields:** Supabase won't reject/ignore the request due to unknown `orderId` field
2. **Reliable Upsert:** `on_conflict` pattern handles both insert and update cases atomically
3. **Consistent:** Matches pattern used by all other workflows
4. **Simpler:** Single request instead of PATCH-then-POST reduces failure points

## Testing Checklist

After importing the updated W0 workflow:

1. ✅ Create a new test order via W0
2. ✅ Verify it sets `execution_status='ready_for_processing'` and `next_workflow='2A'` in Supabase
3. ✅ Verify W1.1 router picks it up within 30 seconds
4. ✅ Verify it progresses to W2A automatically
5. ✅ Check n8n execution logs to confirm upsert succeeded

## For Existing Stuck Orders

If you have existing orders stuck like JOHN-TEST3, run:
```sql
-- See docs/database/fix-john-test3-queue-for-2a.sql
```

This will manually fix their state, but new orders should work correctly with the W0 fix.

