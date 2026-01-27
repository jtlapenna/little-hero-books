# Issue: Audit and Fix Regenerate Buttons on Order Review Page

**Status:** 🟡 Needs Audit  
**Priority:** Medium  
**Created:** 2026-01-27  
**Last Updated:** 2026-01-27

## Description

Need to audit and fix the regenerate buttons on the order review page. These buttons allow manual retry/regeneration of workflow outputs (2A, 2B, 3, 4) but may have issues with reliability, error handling, or state management.

## Impact

- Manual recovery from workflow failures may not work
- Regenerated outputs may not update correctly
- Order state may become inconsistent after regeneration
- User frustration with unreliable recovery tools

## Areas to Audit

### 1. Button Functionality
- [ ] Do all regenerate buttons work? (2A, 2B, 3, 4)
- [ ] Do they trigger correct workflows/endpoints?
- [ ] Are they disabled when appropriate?
- [ ] Do they show loading/error states?

### 2. Backend Endpoints
- [ ] `/api/admin/orders/[orderId]/regenerate-2a`
- [ ] `/api/admin/orders/[orderId]/regenerate-2b`
- [ ] `/api/admin/orders/[orderId]/regenerate-3`
- [ ] `/api/admin/orders/[orderId]/regenerate-4`
- [ ] Do they properly reset state?
- [ ] Do they trigger correct workflows?
- [ ] Do they update Supabase correctly?

### 3. State Management
- [ ] Does regeneration clear previous state?
- [ ] Does it update `execution_status` correctly?
- [ ] Does it reset `workflow_step` appropriately?
- [ ] Does it clear error states?
- [ ] Does it queue next workflow correctly?

### 4. Error Handling
- [ ] Are errors displayed to user?
- [ ] Are errors recoverable?
- [ ] Is error state cleared on retry?
- [ ] Are validation errors caught?

### 5. Idempotency
- [ ] Can buttons be clicked multiple times safely?
- [ ] Do repeated clicks cause issues?
- [ ] Is there proper debouncing/loading state?

## Affected Files

- `back-end/src/app/orders/[orderId]/page.tsx` (UI buttons)
- `back-end/src/app/api/admin/orders/[orderId]/regenerate-2a/route.ts`
- `back-end/src/app/api/admin/orders/[orderId]/regenerate-2b/route.ts`
- `back-end/src/app/api/admin/orders/[orderId]/regenerate-3/route.ts`
- `back-end/src/app/api/admin/orders/[orderId]/regenerate-4/route.ts`

## Known Issues (from git history)

Recent fixes suggest previous issues:
- ✅ Fixed: Error handling improvements
- ✅ Fixed: Supabase update reliability
- ✅ Fixed: URL field handling (empty strings)
- ✅ Fixed: Error/retry state clearing
- ✅ Fixed: Cache-busting for image replacement

But full audit still needed to ensure all issues resolved.

## Proposed Audit Steps

1. **Test each regenerate button:**
   - Click each button with order in various states
   - Verify correct workflow triggered
   - Check state updates
   - Test error scenarios

2. **Review endpoint logic:**
   - Verify state reset logic
   - Check Supabase updates
   - Review workflow triggering
   - Test edge cases

3. **Check UI feedback:**
   - Loading states
   - Error messages
   - Success indicators
   - Button states (disabled/enabled)

4. **Test idempotency:**
   - Multiple clicks
   - Rapid clicks
   - Concurrent requests

5. **Verify state consistency:**
   - Before/after state
   - Manifest updates
   - Workflow progression
   - Error clearing

## Related Issues

- Issue #02: Upsert/Manifest system (regenerate may depend on this)
- Issue #05: Error resolution system (regenerate is error recovery)

## Notes

- Recent commits show multiple fixes, but full audit needed
- Regenerate buttons are critical for manual recovery
- Need to ensure they're reliable and user-friendly

## Finding (2026-01-27): Regenerate W3 not picked up by cron

### Symptom

- Clicking **Regenerate W3** updates the order to `execution_status='ready_for_processing'` and `next_workflow='3'`, but the cron router does not pick it up.

### Root cause

- The cron router query in `back-end/src/app/api/cron/router/route.ts` was excluding any order with Lulu fields set:
  - `lulu_job_id` not null **or**
  - `lulu_status` not null
- This blocks *all* auto-routing (including W2B/W3 regenerations) for any order that has ever been printed (e.g. `lulu_status='SHIPPED'`).

### Fix

- Updated `back-end/src/app/api/cron/router/route.ts` so that:
  - **W2B/W3** can be routed even if Lulu fields exist (manual regeneration scenario)
  - **W4** is still guarded: only route W4 if Lulu fields are cleared (the `regenerate-4` endpoint already clears them)

### Verification steps (targeted)

1. In Supabase, set (or via button) an order to:
   - `execution_status='ready_for_processing'`
   - `next_workflow='3'`
   - keep `lulu_job_id`/`lulu_status` populated
2. Run the cron router (`GET /api/cron/router`) and confirm:
   - it logs the order under `byWorkflow: { '3': [...] }`
   - it updates `queued_at` and `status='queued_for_processing'`
   - it triggers the n8n router webhook with the order included
