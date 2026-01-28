# Issue: Fix W2A Auto-Flip Feature (not working)

**Status:** 🔴 Open  
**Priority:** High  
**Created:** 2026-01-28  
**Last Updated:** 2026-01-28

## Description

The **auto-flip** feature in the W2A workflow (`w2A-SW3-Upload.json`) is not working. This likely impacts character pose generation/orientation consistency (e.g., left/right facing), and may reduce downstream quality or require manual corrections.

## Impact

- Character poses may be oriented incorrectly (mirrored the wrong way)
- Increased QA time / manual intervention
- Potential downstream layout issues (W3 composition assumes a specific facing/orientation)

## Affected File(s)

- `docs/n8n-workflow-files/finals/w2A-SW3-Upload.json`

## Symptoms / Repro

- Auto-flip does not trigger when expected
- Output images do not reflect the intended flip decision
- Any “flipped” metadata (if present) does not match the actual image orientation

## Investigation Needed

1. **Locate the auto-flip decision point**
   - Where is flip computed (prompting vs post-processing)?
   - Is flip driven by pose metadata, a model response, or deterministic rules?

2. **Verify data flow**
   - Does flip state propagate through nodes to the upload/output?
   - Is it overwritten/reset by later nodes?

3. **Verify output handling**
   - If flip is done via image transform: confirm the transform actually runs
   - If flip is encoded in URLs/keys: confirm the correct asset is referenced

4. **Check for schema/field mismatches**
   - E.g., `flip` vs `flipped` vs `shouldFlip`, or numeric vs boolean

## Proposed Fix (likely)

- Ensure the flip decision is **computed once** and carried through as a single field (e.g., `flipped: boolean`)
- Apply flip consistently either:
  - **At generation time** (prompt/model), or
  - **As an explicit image transform step** prior to upload
- Add/update manifest fields so downstream steps can rely on:
  - `poseNumber`
  - `flipped`
  - final `imagePath` / `r2Key`

## Acceptance Criteria

- [ ] Auto-flip reliably flips images when expected across multiple poses/orders
- [ ] Flip metadata is correct and matches the rendered image
- [ ] Downstream workflows (W2B/W3) receive consistent orientation and do not regress

## Notes

- Coordinate with W3 composition assumptions (pose placement + any per-pose transforms).

