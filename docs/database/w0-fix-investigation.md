# W0 Fix - Investigation & Rationale

## User's Valid Concern

The user correctly pointed out: **"W0 was working fine before some of our previous edits and commits. Why would it suddenly break if we didn't edit the n8n workflow?"**

## What Changed

### Commit `2835605` (Nov 11, 2025)
**Added:** Backend API `POST /api/orders` endpoint
- Purpose: "Receive Amazon Custom orders and store in Supabase immediately"
- Comment: "This ensures orders are tracked in the backend even if n8n fails"

### The Flow Change

**Before (if backend API wasn't being called):**
1. W0 runs → Creates order in Supabase (INSERT)
2. `orderId` field issue doesn't matter for new inserts (Supabase ignores unknown fields on INSERT)

**After (if backend API IS being called):**
1. Backend API `POST /api/orders` → Creates order in Supabase (INSERT)
2. W0 runs → Tries to UPDATE existing order (PATCH)
3. W0's PATCH includes invalid `orderId` field → Supabase might reject/ignore
4. W0 tries POST → Fails due to unique constraint (order already exists)
5. Order stuck in backend API's initial state

## The Fix is Still Valid

Even if the backend API isn't being called yet, the fix is still good because:

1. **Removes Invalid Field:** `orderId` doesn't exist in schema - should never be sent
2. **Better Pattern:** `on_conflict` upsert is more reliable than PATCH-then-POST
3. **Future-Proof:** Handles both cases (new orders and updates)
4. **Consistent:** Matches pattern used by workflows 2A, 2B, 3, 4

## Investigation Needed

To determine the actual root cause:

1. **Check if backend API is being called:**
   - Look for logs: `[POST /api/orders] Received Amazon order`
   - Check if Amazon Custom is configured to call `/api/orders` or W0 webhook directly
   - Check if manual testing is calling the backend API

2. **Check order creation flow:**
   - When was `JOHN-TEST3` created?
   - Was it created by backend API or W0?
   - Check Supabase `created_at` vs W0 execution time

3. **Check if `orderId` field was always there:**
   - Yes, it was in the previous version too
   - But it might only cause issues when UPDATING (not INSERTING)

## Recommendation

**Keep the fix** because:
- It's a valid improvement regardless of root cause
- It makes W0 more robust for both INSERT and UPDATE cases
- It aligns with other workflows' patterns

**But also investigate:**
- Is the backend API actually being used?
- If yes, ensure it's working correctly
- If no, document that W0 is the sole order creator

