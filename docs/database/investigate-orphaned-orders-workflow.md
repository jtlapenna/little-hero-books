# Investigating Orphaned Orders - Workflow Guide

## Current Situation

Based on the orphaned orders page, you have 3 orders:

1. **JESSICA-CUNT** - `error` status, "Max Retries" (3 retries), orphaned 45 min
2. **JOHN-TEST4** - `ready_for_processing` status, "Not Picked Up", 2 retries, orphaned 80 min
3. **JOHN-TEST5** - `ready_for_processing` status, "Not Picked Up", 1 retry, orphaned 117 min

## Correct Workflow

### Step 1: Investigate Each Order

**For JESSICA-CUNT (Max Retries - 3 attempts):**
- This order has failed 3 times and exceeded the retry limit
- **Action:** Mark for Manual Review (requires human investigation)
- **Why:** We need to understand what's causing the repeated failures

**For JOHN-TEST4 & JOHN-TEST5 (Ready but Not Picked Up):**
- These orders are `ready_for_processing` but W1.1 router isn't picking them up
- **Possible causes:**
  1. Router is at capacity (5 orders processing)
  2. Router isn't running
  3. `next_workflow` is NULL or invalid
  4. Priority blocking
  5. Router execution gaps (skipped runs)

### Step 2: Run Diagnostic Query

Use the diagnostic query below to get full context for each order.

### Step 3: Determine Root Cause

**For JESSICA-CUNT (3 retries):**
- Check `error_message` and `error_type` to see what failed
- Check `workflow_step` to see which workflow failed
- Check `current_workflow` to see if it's stuck in a workflow
- Check `next_workflow` to see where it should go next
- Review n8n execution logs for that order

**For JOHN-TEST4 & JOHN-TEST5 (Not Picked Up):**
- Check `next_workflow` - must be set and valid ('2A', '2B', '3', '4')
- Check W1.1 router status - is it running? At capacity?
- Check `priority` - is it being blocked by higher priority orders?
- Check `queued_at` - how long has it been queued?
- Check router execution logs for gaps

### Step 4: Take Recovery Action

**JESSICA-CUNT:**
1. **Mark for Manual Review** (via orphaned orders page)
2. Navigate to order detail page (`/orders/JESSICA-CUNT`)
3. Review the manual review alert banner (shows error details)
4. Investigate the error message to understand the failure
5. Fix the underlying issue
6. Reset to `ready_for_processing` when fixed

**JOHN-TEST4 & JOHN-TEST5:**
1. **Check router capacity** - if at capacity, wait or reset stuck orders
2. **Verify `next_workflow`** - must be set correctly
3. **Check router logs** - is W1.1 running? Any execution gaps?
4. **Option A:** If router issue - wait for router to pick them up
5. **Option B:** If data issue - fix `next_workflow` and reset
6. **Option C:** If truly stuck - use "Reset Processing" to force retry

## Diagnostic Information Needed

To determine why an order isn't processing, you need:

1. **Error Information:**
   - `error_message` - What went wrong?
   - `error_type` - Type of error (workflow_timeout, api_error, etc.)
   - `retry_count` - How many times it's been retried

2. **Workflow State:**
   - `workflow_step` - Which workflow step it's in
   - `current_workflow` - Which workflow is currently processing it (if any)
   - `next_workflow` - Which workflow should process it next
   - `execution_status` - Current execution state

3. **Timing Information:**
   - `started_at` - When processing started (if stuck)
   - `queued_at` - When it was queued (if not picked up)
   - `updated_at` - Last update time

4. **Manifest Status:**
   - Which manifests exist (1, 2a, 2b, 3, 4)
   - Manifest URLs to check workflow completion

5. **Router Status:**
   - Is W1.1 router running?
   - Current processing count (capacity check)
   - Router execution logs (any gaps?)

## Next Steps

1. Run the diagnostic query below for all 3 orders
2. Review the results to understand each order's state
3. Check n8n execution logs for failed workflows
4. Take appropriate recovery action based on findings
5. Document the root cause for future prevention

