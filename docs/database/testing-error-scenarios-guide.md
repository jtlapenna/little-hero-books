# Testing Error Scenarios Guide

## Current Test Orders Setup

After running `test-different-error-scenarios.sql`, you have three orders set to different error scenarios:

### 1. JESSICA-CUNT - Missing Manifest
- **Status:** `error`
- **Error Type:** `missing_manifest`
- **Retry Count:** 1
- **Manifest:** `one_manifest_url = NULL`

**Expected Behavior:**
- Should appear on "Orders Needing Attention" page
- Should show "Missing Manifest" badge
- W1.4 should detect and route to "Recover: Create Manifest" action
- Clicking "Create Manifest" button should create 1-manifest.json and reset order

**Testing Steps:**
1. Verify order appears on Orders Needing Attention page
2. Wait for W1.4 to run (every 10 minutes) OR manually click "Create Manifest" button
3. Verify 1-manifest.json is created in R2
4. Verify order status resets to `ready_for_processing`
5. Verify order is picked up by W1.1 router

**Action:** Use "Create Manifest" button to test recovery, or wait for W1.4 to auto-recover

---

### 2. JOHN-TEST4 - Stuck Processing (Over 1 Hour)
- **Status:** `processing`
- **Started At:** 2 hours ago
- **Current Workflow:** `2A`
- **Error Type:** `NULL` (not yet marked as error)

**Expected Behavior:**
- Should appear on "Orders Needing Attention" page as "Stuck > 1h"
- W1.2 should detect (runs every 5 minutes) and mark as `error` with `workflow_timeout`
- W1.4 should detect as `processing_stuck_over_hour` and route to "Recover: Reset Processing"
- Should reset to `ready_for_processing` and be picked up by router

**Testing Steps:**
1. Verify order appears on Orders Needing Attention page
2. Wait for W1.2 to run (every 5 minutes) - should mark as error
3. Wait for W1.4 to run (every 10 minutes) - should reset processing
4. OR manually use "Reset Processing" button
5. Verify order is picked up by W1.1 router

**Action:** Wait for workflows to auto-recover, or manually use "Reset Processing" button

---

### 3. JOHN-TEST5 - API Error (Ready for Retry)
- **Status:** `error`
- **Error Type:** `api_error`
- **Retry Count:** 1 (below max of 3)
- **Next Retry At:** 5 minutes ago (ready now)

**Expected Behavior:**
- Should appear on "Orders Needing Attention" page
- Should show "Not Picked Up" badge if queued > 60 minutes
- W1.3 should detect (runs every 2 minutes) and reset to `ready_for_processing`
- Should increment retry_count to 2
- Should be picked up by W1.1 router

**Testing Steps:**
1. Verify order appears on Orders Needing Attention page
2. Wait for W1.3 to run (every 2 minutes) - should reset to ready_for_processing
3. Verify retry_count increments to 2
4. Verify order is picked up by W1.1 router

**Action:** Wait for W1.3 to auto-retry, or manually use "Schedule Retry" button

---

## Recommended Testing Approach

### Option 1: Let Workflows Auto-Recover (Recommended)
1. **Monitor the Orders Needing Attention page** - refresh every few minutes
2. **Watch n8n execution logs** for W1.2, W1.3, and W1.4
3. **Verify each order is handled correctly:**
   - JESSICA-CUNT: Should be recovered by W1.4 "Create Manifest" action
   - JOHN-TEST4: Should be detected by W1.2, then recovered by W1.4
   - JOHN-TEST5: Should be recovered by W1.3 retry manager

### Option 2: Manual Recovery (Faster Testing)
1. **JESSICA-CUNT:** Click "Create Manifest" button on order detail page
2. **JOHN-TEST4:** Use "Reset Processing" button on Orders Needing Attention page
3. **JOHN-TEST5:** Use "Schedule Retry" button on Orders Needing Attention page

### Option 3: Mixed Approach
- Manually recover 1-2 orders to test UI
- Let 1 order auto-recover to test workflow integration

---

## What to Verify

### For Each Order:
1. ✅ Appears on "Orders Needing Attention" page
2. ✅ Shows correct error badge/reason
3. ✅ Recovery action works (manual or automatic)
4. ✅ Order status updates correctly after recovery
5. ✅ Order is picked up by W1.1 router after recovery
6. ✅ Order progresses through workflow correctly

### System-Wide:
1. ✅ W1.2 detects stuck processing orders
2. ✅ W1.3 picks up orders ready for retry
3. ✅ W1.4 detects and recovers orphaned orders
4. ✅ Error badges display correctly
5. ✅ Multiple errors badge shows unique errors (no duplicates)
6. ✅ Tooltips are clickable and show above table

---

## Reset After Testing

If you want to reset all three orders back to a clean state, uncomment and run the reset query at the bottom of `test-different-error-scenarios.sql`:

```sql
UPDATE orders
SET 
  execution_status = 'ready_for_processing',
  error_type = NULL,
  error_message = NULL,
  retry_count = 0,
  next_retry_at = NULL,
  current_workflow = NULL,
  started_at = NULL,
  updated_at = NOW()
WHERE amazon_order_id IN ('JESSICA-CUNT', 'JOHN-TEST4', 'JOHN-TEST5');
```

---

## Next Steps

1. **Run the test SQL** to set up the scenarios
2. **Refresh the Orders Needing Attention page** to see all three orders
3. **Monitor for 10-15 minutes** to see workflows auto-recover
4. **Or manually test recovery actions** for faster feedback
5. **Verify each order progresses correctly** after recovery

