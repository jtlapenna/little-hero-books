# Issue: Ensure Upsert / Manifest / Queuing System is Working

**Status:** 🟡 Needs Audit  
**Priority:** High  
**Created:** 2026-01-27  
**Last Updated:** 2026-01-27

## Description

Need to verify and ensure that the entire system for:
- **Manifest upserts** (updating existing manifests in R2)
- **Manifest creation/updates** across all workflows
- **Order queuing** (setting `next_workflow`, `execution_status`, `queued_at`)
- **Workflow routing** (cron job picking up orders)

...is working correctly and consistently across all workflows.

## Impact

- Orders may not progress through workflows automatically
- Manifests may not be properly updated/merged
- Cron router may not pick up orders correctly
- State inconsistencies between Supabase and R2 manifests

## Areas to Audit

### 1. Manifest Updates
- [ ] W0: Creates 1-manifest.json, updates Supabase
- [ ] W2A: Creates/updates 2a-manifest.json, updates Supabase
- [ ] W2B: Creates/updates 2b-manifest.json (via callback aggregator), updates Supabase
- [ ] W3: Creates/updates 3-manifest.json, updates Supabase
- [ ] W4: Uses manifests but may not create new ones

### 2. Supabase State Updates
- [ ] `manifest_*_url` fields updated correctly
- [ ] `workflow_step` updated correctly
- [ ] `execution_status` set appropriately (`ready_for_processing`, `processing`, `done`, `error`)
- [ ] `next_workflow` set correctly
- [ ] `queued_at` set when order should be picked up by router
- [ ] `current_workflow` cleared when workflow completes

### 3. Queuing Logic
- [ ] `determineNextWorkflow()` function logic correct
- [ ] Cron router (`w1.1`) picks up orders correctly
- [ ] Orders don't get stuck or routed backwards
- [ ] Manual overrides (approval buttons) properly queue next workflow

### 4. Manifest Merging
- [ ] 2B callback aggregator properly merges pose results
- [ ] No data loss when merging manifests
- [ ] Idempotent operations (reruns don't duplicate data)

## Affected Files

- `back-end/src/lib/determine-next-workflow.ts`
- `back-end/src/app/api/cron/router/route.ts`
- `back-end/src/app/api/cron/amazon-orders/route.ts`
- `back-end/src/lib/approval-store.ts`
- `back-end/src/lib/status-service.ts`
- All workflow webhook handlers:
  - `back-end/src/app/api/webhooks/workflow-0-complete/route.ts`
  - `back-end/src/app/api/webhooks/workflow-2b-complete/route.ts`
  - `back-end/src/app/api/webhooks/workflow-3-complete/route.ts`
- n8n workflows: w0, w1.1, w2A, w2B, w3, w4

## Known Issues (from recent fixes)

1. ✅ Fixed: Orders reverting to 2A after being set to 2B (fixed in `determine-next-workflow.ts` and `cron/amazon-orders/route.ts`)
2. ✅ Fixed: Approval buttons not setting `next_workflow` (fixed in `approval-store.ts`)
3. 🔴 Open: 2B manifest merging broken (see issue #01)

## Proposed Audit Steps

1. **Trace a complete order flow:**
   - From Amazon order intake → W0 → W2A → W2B → W3 → W4
   - Document each manifest creation/update
   - Document each Supabase state change
   - Verify `next_workflow` progression

2. **Test edge cases:**
   - Order rerun through same workflow
   - Manual approval/override
   - Error recovery
   - Partial completion scenarios

3. **Verify consistency:**
   - Supabase state matches R2 manifest state
   - `next_workflow` matches actual workflow progression
   - No orphaned states or stuck orders

4. **Check for race conditions:**
   - Multiple callbacks updating same manifest
   - Cron job running while workflow in progress
   - Manual actions conflicting with automated flows

## Related Issues

- Issue #01: Fix 2B Workflow (manifest merging)
- Issue #03: Fix cover page rendering (may be related to manifest data)

## Notes

- Recent fixes addressed some routing issues, but full system audit needed
- Need to ensure all workflows follow consistent patterns
- Consider creating a state machine diagram for order progression
