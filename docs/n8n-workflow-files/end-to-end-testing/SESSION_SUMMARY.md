# Session Summary - Workflow 2B Testing & Fixes

## Project Overview

**Little Hero Books** - Personalized children's book service that generates custom stories through Amazon Custom listings and automated print-on-demand fulfillment.

**Target Age:** 3-7 years old  
**Tagline:** "Every child is the hero of their own story"  
**Story Theme:** The Adventure Compass (magical journey through enchanted locations)

## System Architecture

### Workflow Pipeline
1. **W0** - Order Intake Validation (receives Amazon orders, normalizes, creates manifest, stores in Supabase)
2. **W1.1** - Queue Manager and Router (fetches ready orders, routes to appropriate workflow)
3. **W1.2** - Stuck Workflow Manager (detects and recovers stuck orders)
4. **W2A** - AI Character Generation (generates character assets for each pose)
5. **W2B** - Background Removal (removes backgrounds using Bria API, transparency QA)
6. **W3** - PNG Assembly (assembles poses into book pages)
7. **W4** - Print Fulfillment (sends to Lulu for printing)

### Database (Supabase/PostgreSQL)
- **`orders`** table - Main order tracking with `execution_status`, `next_workflow`, `review_stages` (JSONB)
- **`failed_orders`** table - Error tracking and retry management
- **Key fields:**
  - `execution_status`: `ready_for_processing`, `processing`, `error`, `error_requires_manual_review`
  - `next_workflow`: `2A`, `2B`, `3`, `4`
  - `review_stages`: JSONB with `preBria`, `postBria`, `postPdf` stages
  - `orderId` (NOT NULL) and `amazon_order_id` (for matching)

## Recent Work Completed

### Workflow 2B Fixes (Issues 1-4)

#### Issue 1: `next_workflow` not set to '3' after 2B completion
**Status:** ✅ Fixed  
**Solution:** Added `next_workflow: '3'` to Supabase upsert body in 2B

#### Issue 2: Status values don't match constants
**Status:** ✅ Fixed  
**Solution:** Updated `status` and `review_stages.postBria.status` to use correct enum values:
- `status`: `pending_bg_removal_review` or `pending_assembly`
- `review_stages.postBria.status`: `in-review` or `ready`

#### Issue 3: `review_stages` merge behavior
**Status:** ✅ Fixed  
**Problem:** Supabase's `resolution=merge-duplicates` does NOT deep-merge JSONB. Updating only `postBria` was replacing the entire object, losing `preBria` and `postPdf`.

**Solution:** Added new "Fetch and Merge Review Stages" node in 2B workflow:
- Fetches existing `review_stages` from Supabase
- Merges new `postBria` data with existing stages
- Preserves `preBria` and `postPdf` stages
- Passes merged object to Supabase upsert

**Location:** `docs/n8n-workflow-files/finals/LHB - 2.B. - Background Removal.json`

#### Issue 4: `posesSucceeded` count showing 0 in manifest
**Status:** ✅ Fixed  
**Problem:** Filter in "Build 2B Manifest" required both `bgRemovedKey` AND `bgRemovedImageUrl`, but `bgRemovedImageUrl` could be null even when processing succeeded.

**Solution:** Updated filter to only require `bgRemovedKey` and `briaStatus === 'completed'`:
```javascript
const processedPoses = updatedEntries.filter(e => e.bgRemovedKey && e.briaStatus === 'completed');
```

Also added logic to construct `bgRemovedImageUrl` from R2 path if missing.

#### Issue 5: Missing `execution_status` update after 2B completion
**Status:** ✅ Fixed  
**Problem:** After 2B completes successfully (no review needed), `execution_status` remained `'processing'` instead of being set to `'ready_for_processing'`. This prevented the router (W1.1) from picking up the order for workflow 3.

**Solution:** Updated Supabase upsert in 2B workflow to set:
- `execution_status: 'ready_for_processing'` when `needsReview === false` (router picks up automatically)
- `execution_status: 'processing'` when `needsReview === true` (stays until approval)
- Also clears `started_at`, `current_workflow`, and sets `queued_at` when ready for next workflow

**Location:** `docs/n8n-workflow-files/finals/LHB - 2.B. - Background Removal.json` - "Supabase Upsert 2B" node

#### Issue 6: `preBria` not being preserved in review_stages
**Status:** ✅ Fixed  
**Problem:** The "Fetch and Merge Review Stages" node wasn't correctly fetching or preserving `preBria` from Supabase. The fetch response handling needed improvement to handle JSONB fields that might come as strings and better error handling.

**Solution:** Enhanced the "Fetch and Merge Review Stages" node with:
- Better response parsing (handles JSONB as string or object)
- Enhanced error logging and debugging
- Validation that `review_stages` is a valid non-empty object before using it
- Added `json: true` option to request helper for proper JSON parsing

**Location:** `docs/n8n-workflow-files/finals/LHB - 2.B. - Background Removal.json` - "Fetch and Merge Review Stages" node

**Verification:** Test run confirmed `preBria` is now correctly preserved in both the merge output and Supabase upsert result.

## Current Status

### Workflow 2B Testing
- ✅ All 6 issues fixed (Issues 1-4 from previous session, Issues 5-6 from this session)
- ✅ Test run completed successfully
- ✅ **VERIFIED:** 2B manifest and Supabase upsert results reviewed
- ✅ **FIXED:** Issue 5 - Missing `execution_status` update
- ✅ **FIXED:** Issue 6 - Missing `preBria` preservation

### Next Steps

**2B Verification Results:**
- ✅ Manifest output: All counts correct (13 succeeded, 0 failed)
- ✅ Supabase upsert: `next_workflow = '3'`, `status = 'pending_assembly'`, `review_stages.postBria` correct
- ✅ Issue 5 fixed: `execution_status` now set correctly
- ⚠️ Note: `review_stages.preBria` missing in test results (may not have existed before 2B)

**Ready for Workflow 3 Testing:**
- Move on to testing Workflow 3 (PNG Assembly)
- Verify 3 can read 2B manifest correctly
- Test book assembly process
- Verify router picks up order with `execution_status = 'ready_for_processing'` and `next_workflow = '3'`

## Key Files & Locations

### Workflow Files
- `docs/n8n-workflow-files/finals/LHB - 0 - ORDER INTAKE VALIDATION.json` - W0
- `docs/n8n-workflow-files/finals/LHB - 1.1- Queue Manager and Router.json` - W1.1
- `docs/n8n-workflow-files/finals/LHB - 1.2- Stuck Workflow Manager.json` - W1.2
- `docs/n8n-workflow-files/finals/2A - Orchestrator.json` - W2A
- `docs/n8n-workflow-files/finals/LHB - 2.B. - Background Removal.json` - W2B (recently fixed)
- `docs/n8n-workflow-files/finals/` - W3 and W4 (to be tested)

### Database Scripts
- `docs/database/reset-e2e-002-for-2b-test.sql` - Reset test order for 2B testing
- `docs/database/test-jsonb-merge-behavior.sql` - Test script for JSONB merge behavior
- `docs/database/` - Various diagnostic and fix scripts

### Documentation
- `docs/n8n-workflow-files/end-to-end-testing/FIX-2B-issues.md` - Detailed 2B fixes
- `docs/n8n-workflow-files/end-to-end-testing/ERROR_HANDLING_REQUIREMENTS.md` - Error handling needs
- `docs/n8n-workflow-files/end-to-end-testing/STUCK_WORKFLOW_MANAGEMENT.md` - Stuck workflow system

### Status Constants
- `back-end/src/constants/statuses.ts` - Single source of truth for all status enums:
  - `OrderStatus`
  - `ReviewStageStatus`
  - `DisplayStatus`
  - `CustomerApprovalStatus`
  - `WorkflowStep`
  - `LuluStatus`

## Test Order

**Order ID:** `E2E-002`  
**Character Hash:** `3a1cf88859d2cfff`  
**Poses:** 13 poses (0-12)

## Key Technical Details

### Supabase JSONB Merge Behavior
**Important:** Supabase's `resolution=merge-duplicates` does NOT deep-merge JSONB fields. It replaces the entire object. Always fetch existing data and merge manually when updating nested JSONB fields like `review_stages`.

### Router (W1.1) Behavior
- Fetches orders with `execution_status = 'ready_for_processing'`
- Orders by `priority DESC, queued_at ASC`
- Marks order as `processing` before triggering workflow
- Uses idempotency keys to prevent duplicate triggers
- Has "Verify Order Claimed" nodes to prevent duplicate triggers

### Approval Flow
- Backend approval buttons (`back-end/src/lib/approval-store.ts`) set:
  - `execution_status = 'ready_for_processing'`
  - `next_workflow` to appropriate workflow (`2B` or `3`)
  - Router (W1.1) picks up approved orders

### Error Handling Gap
**Identified but not yet fixed:** W1.1 trigger nodes don't have error handling. If a webhook is inactive, orders can get stuck in `processing` state for up to 30 minutes until W1.2 detects them. See `ERROR_HANDLING_REQUIREMENTS.md` for details.

## What to Check in 2B Results

When reviewing 2B manifest and Supabase upsert results:

1. **Manifest (`briaProcessing`):**
   - `succeeded` count should match number of successfully processed poses
   - `failed` count should be accurate
   - `totalProcessed` should match approved poses from 2A

2. **Supabase Upsert:**
   - `review_stages.postBria` should have correct counts:
     - `posesProcessed`
     - `posesSucceeded`
     - `posesFailed`
   - `review_stages.preBria` should be preserved (not null)
   - `review_stages.postPdf` should be preserved (if it existed)
   - `next_workflow` should be `'3'`
   - `status` should match review needs (`pending_bg_removal_review` or `pending_assembly`)

3. **Overall Status:**
   - If all poses succeeded and no review needed: `status = 'pending_assembly'`, `next_workflow = '3'`
   - If any poses need review: `status = 'pending_bg_removal_review'`, `next_workflow = '3'` (review happens in UI, then approval triggers 3)

## Next Session Goals

1. **Review 2B Results:**
   - Verify manifest output is correct
   - Verify Supabase upsert preserved all review stages
   - Verify counts are accurate

2. **If 2B is good:**
   - Test Workflow 3 (PNG Assembly)
   - Verify 3 can read 2B manifest
   - Test book assembly process

3. **If 2B needs fixes:**
   - Identify specific issues
   - Apply fixes
   - Re-test

4. **Future:**
   - Add error handling to W1.1 trigger nodes
   - Test full end-to-end flow
   - Test error recovery scenarios

## Important Notes

- **Always use status constants** from `back-end/src/constants/statuses.ts` - don't hardcode status values
- **JSONB merge requires manual fetch-and-merge** - Supabase doesn't deep-merge
- **Test order E2E-002** is the primary test case
- **Router (W1.1) is critical** - ensure it's working correctly before testing downstream workflows
- **Error handling is missing** in W1.1 - this should be addressed soon

## 2B Test Results Summary

**Test Order:** E2E-002  
**Character Hash:** 3a1cf88859d2cfff  
**Poses:** 13 poses (0-12)

**Manifest Results:**
- ✅ `briaProcessing.totalProcessed`: 13
- ✅ `briaProcessing.succeeded`: 13
- ✅ `briaProcessing.failed`: 0
- ✅ All poses have `bgRemovedKey`, `bgRemovedImageUrl`, and `briaStatus: 'completed'`

**Supabase Upsert Results:**
- ✅ `next_workflow`: `'3'` ✓
- ✅ `status`: `'pending_assembly'` ✓ (correct for no review needed)
- ✅ `review_stages.postBria`: All counts correct (13 processed, 13 succeeded, 0 failed)
- ✅ `review_stages.postBria.status`: `'ready'` ✓
- ⚠️ `review_stages.preBria`: Missing (may not have existed before 2B)
- ❌ `execution_status`: Was `'processing'` (should be `'ready_for_processing'`) → **FIXED**

**Issues Found & Fixed:**
1. ✅ Issue 5: Missing `execution_status` update → Fixed in workflow
2. ✅ Issue 6: Missing `preBria` preservation → Fixed in "Fetch and Merge Review Stages" node

**Final 2B Test Results (with fixes):**
- ✅ `preBria` is now preserved correctly
- ✅ `postBria` is set correctly with review status
- ✅ `execution_status` is set correctly (`processing` when review needed, `ready_for_processing` when no review)
- ✅ `next_workflow` is set to `'3'`
- ✅ `status` matches review needs (`pending_bg_removal_review` or `pending_assembly`)

**Status:** ✅ **Workflow 2B is complete and working correctly!** Ready to test Workflow 3

