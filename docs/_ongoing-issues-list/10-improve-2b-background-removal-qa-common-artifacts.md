# Issue: Improve 2B Background Removal QA to Catch Common Artifacts

**Status:** 🔴 Open  
**Priority:** High  
**Created:** 2026-01-28  
**Last Updated:** 2026-01-28

## Description

2B background removal QA is not consistently catching common failure modes/artifacts in the generated transparent PNGs (e.g., **missing eye on pose 2**).

We need to improve the QA stage in the 2B workflow so it flags these issues reliably and routes the order/pose to review/regeneration when necessary.

## Impact

- Visibly broken character renders (especially face/eyes/hands) can slip through to W3 assembly
- Increased downstream rework (postBria / postPdf) and customer-facing defects
- Wasted cost/time on assembling/approving unusable assets

## Example Failure Modes to Catch

- Missing facial features (e.g., missing eye on pose 2)
- Holes/gaps in the silhouette (transparent cutouts in body/face)
- Harsh/incorrect cutout edges (jagged haloing, clipped hair)
- Unwanted background remnants (noise, shadows, patches)
- Over-aggressive removal (parts of the character removed)

## Affected Areas / Files

- Primary: `docs/n8n-workflow-files/finals/w2B-Background_Removal.json`
- Potentially related:
  - `docs/n8n-workflow-files/2b-project/w2B-Background_Removal.BASELINE.json`
  - Any shared QA scripts/nodes used by 2B

## Investigation Needed

1. Identify the current QA logic in 2B:
   - Where is transparency QA computed?
   - What thresholds/heuristics are used?
   - How is `needsReview` / `requiresHumanReview` derived?

2. Collect a small set of known-bad outputs (pose 2 missing eye, etc.) and verify:
   - Whether current QA metrics detect anything abnormal
   - If metrics detect it but routing/flagging is broken (data not propagated)

## Proposed Improvements (high-level)

- Add “artifact detection” checks beyond basic transparency:
  - **face region sanity checks** (lightweight heuristics or model-based classifier)
  - **hole detection** within the character mask (unexpected internal transparency)
  - **edge quality** / halo detection heuristics
- Ensure failures reliably set:
  - `entry.needsReview = true`
  - `entry.reviewReason` populated with a human-readable reason
  - Aggregate flags (`needsReview`, `requiresHumanReview`, `posesFailed`) updated correctly
  - Review stage updated (`review_stages.postBria.status = 'in-review'` and needsHumanReview markers)

## Acceptance Criteria

- [ ] Known bad outputs (e.g., pose 2 missing eye) are flagged by QA
- [ ] Flagged poses reliably route into review/regeneration flow (no silent pass-through)
- [ ] False positives remain acceptable (ideally measured with a small sample set)

## Notes

- We should prioritize **cheap, deterministic checks** first, then add heavier model-based checks only if needed.

