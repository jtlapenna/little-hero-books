# Issue: Fix 2B Workflow - Optional Download 2B Manifest Nodes

**Status:** 🔴 Open  
**Priority:** High  
**Created:** 2026-01-27  
**Last Updated:** 2026-01-27

## Description

The 2B workflow (`w2B-main-orchestrator`) is currently broken due to issues with the "optional" download 2B-manifest nodes. These nodes were disabled because they were failing every time, and setting `continueOnFail: true` caused the next node to fail.

## Impact

- **Workflow 2B cannot properly merge manifest updates** from callback aggregator
- **Character images missing in W3 renders** (only cover and last interior page show characters)
- **Manifest accumulation broken** - poses processed in 2B are not being merged into the final 2b-manifest.json
- **Orders stuck** - cannot progress from 2B to W3 properly

## Root Cause

The `Download 2B Manifest (optional)` and `Download 2B Manifest (if exists)` nodes in `w2B-main-orchestrator.json`:
1. Fail with `404 Not Found` on first pass (expected - manifest doesn't exist yet)
2. When `continueOnFail: true` is set, the workflow continues but **downstream nodes receive an error object instead of valid JSON**
3. The merge logic expects either:
   - A valid manifest JSON object (on reruns)
   - No data/null (on first pass)
   - But receives an error object, causing downstream failures

## Affected Files

- `docs/n8n-workflow-files/2b-project/w2B-main-orchestrator.json`
- `docs/n8n-workflow-files/finals/w2B-Background_Removal.json`
- Live n8n workflow: `w2B-main-orchestrator`

## Current Workaround

- Manually edited `2b-manifest.json` files to populate `bgRemovedKey` for all poses
- Created `/api/admin/orders/[orderId]/repair-2b-manifest` endpoint for emergency repairs

## Proposed Solution

1. **Fix error handling in manifest download nodes:**
   - Use conditional logic to check if response is an error before passing to next node
   - Return empty object `{}` or `null` when manifest doesn't exist (instead of error object)
   - Ensure `continueOnFail: true` is set AND downstream nodes handle missing manifest gracefully

2. **Update merge logic:**
   - Check if input is an error object before attempting JSON merge
   - Default to empty manifest structure when manifest doesn't exist
   - Ensure all pose entries are properly accumulated across multiple callback runs

3. **Test scenarios:**
   - First pass through 2B (no existing manifest)
   - Second pass through 2B (manifest exists, needs merging)
   - Partial completion (some poses done, workflow rerun)

## Related Issues

- Missing character images in W3 (symptom of this issue)
- Manifest accumulation not working properly

## Notes

- User disabled these nodes in live n8n workflow to prevent failures
- The nodes are critical for manifest merging on reruns
- Need to ensure solution works for both first pass and subsequent passes
