# Issue: Improve 2B Background Removal QA to Catch Common Artifacts

**Status:** ✅ Completed  
**Priority:** High  
**Created:** 2026-01-28  
**Last Updated:** 2026-03-14

## Description

2B background removal QA is not consistently catching common failure modes/artifacts in the generated transparent PNGs (e.g., **missing eye / missing teeth / interior transparency hole on a face pose**).

We need to improve the QA stage in the 2B workflow so it flags these issues reliably and routes the order/pose to review/regeneration when necessary.

Recent live testing confirmed that:

- the current neon-background composite step is working as intended
- Gemini can still return `needs_review: false` with `confidence: 1.0` on an obviously bad image
- this is therefore not just a routing bug or stale prompt bug; the current model-only QA approach is not reliable enough as the primary gate

## Impact

- Visibly broken character renders (especially face/eyes/hands) can slip through to W3 assembly
- Increased downstream rework (postBria / postPdf) and customer-facing defects
- Wasted cost/time on assembling/approving unusable assets

## Example Failure Modes to Catch

- Missing facial features (e.g., missing eye on pose 2)
- Missing / erased teeth on open-mouth poses
- Holes/gaps in the silhouette (transparent cutouts in body/face)
- Harsh/incorrect cutout edges (jagged haloing, clipped hair)
- Unwanted background remnants (noise, shadows, patches)
- Over-aggressive removal (parts of the character removed)

## Affected Areas / Files

- Primary: `docs/n8n-workflow-files/finals/w2B-sw1-single-pose.json`
- Potentially related:
  - `docs/n8n-workflow-files/2b-project/w2B-Background_Removal.BASELINE.json`
  - `back-end/src/components/stages/post-bria-stage.tsx`
  - Any shared QA scripts/nodes used by 2B

## Current Understanding

1. The current workflow composites the transparent PNG over a neon green background and sends both:
   - the composited image
   - the original transparent PNG
   to Gemini for review.

2. The current prompt is already fairly specific. It tells Gemini to inspect:
   - left eye
   - right eye
   - mouth / teeth
   - interior holes showing neon green inside the silhouette

3. In live testing, Gemini still missed an obvious failure case even when:
   - the composite was visibly correct
   - the defect was visible in the face / mouth area
   - the prompt was updated to focus on eyes, teeth, and interior neon-green holes

4. Conclusion:
   - prompt quality is not the main blocker anymore
   - Gemini may still be useful as a secondary opinion, but it should not be the only decision-maker for this class of QA

## Recommended Strategy

### 1. Move the primary gate to deterministic image checks

The most reliable path is to treat this as an image-structure problem first, not a semantic vision problem.

Recommended primary checks:

- **Interior alpha-hole detection on the transparent PNG**
  - Build a binary mask from alpha.
  - Flood-fill from the outer border through transparent pixels.
  - Any transparent region not connected to the outer border is an interior hole.
  - Ignore tiny regions and a small edge halo tolerance.
  - If an interior hole remains, set:
    - `entry.needsReview = true`
    - `entry.reviewReason = 'INTERIOR_HOLE'`

- **Composite neon-pixel confirmation**
  - On the neon composite, check whether neon-green pixels appear inside the subject silhouette.
  - This gives a second deterministic signal that is easier to inspect/debug than model output alone.

- **Face-priority heuristics**
  - If an interior hole is found in the upper-middle face band, classify as likely eye issue.
  - If an interior hole is found in the lower-middle face band, classify as likely mouth/teeth issue.
  - These labels can help reviewers, but the first goal is simply to block bad assets from silently passing.

Why this should be the main strategy:

- it is cheap
- it is explainable
- it directly targets the artifact we are seeing
- it does not depend on model interpretation quality
- it can fail closed (flag for review when uncertain)

### 2. Keep Gemini as a secondary classifier, not the gate

Gemini can still add value after deterministic checks:

- generate a more human-readable reason
- distinguish likely `MISSING_EYE_LEFT` vs `MISSING_EYE_RIGHT` vs `MISSING_TEETH`
- help triage borderline edge / hair / profile cases

But the workflow should not rely on Gemini alone to decide whether a clearly broken asset passes.

### 3. Add a small golden test set for 2B QA

Create and preserve a small fixed dataset of known outputs:

- obvious missing eye
- obvious missing teeth
- obvious interior face hole
- legitimate blink / closed-mouth / profile cases
- a few clean controls

Any workflow or prompt change should be evaluated against this set before rollout.

## Prompting Ideas Worth Trying

Prompting is still worth iterating on, but it should be treated as an experiment layer, not the core solution.

### High-value prompt changes to try

1. **Force a step-by-step inspection order**
   - Ask Gemini to inspect the face in this exact sequence:
     - left eye
     - right eye
     - mouth / teeth
   - Require each region to be evaluated separately before the final verdict.

2. **Require region-specific findings in the JSON**
   - Instead of only returning `needs_review`, require fields such as:
     - `left_eye_status`
     - `right_eye_status`
     - `mouth_teeth_status`
     - `interior_hole_seen`
   - This reduces the chance that the model jumps straight to a shallow global summary.

3. **Use a fail-closed instruction for neon-green detection**
   - Tell Gemini:
     - if any pixel that looks close to neon green is visible inside the face or mouth area, mark review
     - if the model is not sure whether the green is interior or edge halo, mark review

4. **Make the model explicitly compare the two images**
   - Instruct it to:
     - use the original transparent PNG to infer where the silhouette exists
     - then verify whether the composite shows neon green in regions that should still belong to the character

5. **Ask for a structured mini-checklist before final JSON**
   - This can be done inside the reasoning request while still returning strict JSON.
   - Example concept:
     - inspect left eye
     - inspect right eye
     - inspect teeth / mouth
     - inspect for interior green holes
     - then summarize

6. **Bias toward review for face defects only**
   - Tell Gemini to be especially conservative in the face region and less sensitive elsewhere.
   - This helps prioritize the highest-visibility failures first.

### More aggressive prompt experiments

- **Face crop + full image together**
  - Send:
    - the full composite
    - a cropped face image
    - the original PNG
  - The face crop may reduce missed detections caused by the model treating the face as too small relative to the full frame.

- **Multiple targeted crops**
  - Send separate crops for:
    - left eye zone
    - right eye zone
    - mouth / teeth zone
  - This may improve sensitivity, especially on small or noisy artifacts.

- **Two-pass prompting**
  - Pass 1: detect whether any face-region defect may exist.
  - Pass 2: only if suspicious, classify the likely issue.
  - This may outperform a single prompt that tries to do everything at once.

- **Consensus / retry strategy**
  - Run the same image through two slightly different prompts.
  - If either flags review, fail closed.
  - This increases cost, but may still be acceptable if used only on suspicious cases.

## Near-Term Implementation Plan

1. Add deterministic interior-hole detection in 2B before Gemini review.
2. Set `needsReview` immediately when deterministic checks fail.
3. Preserve a machine-readable `reviewReason` such as:
   - `INTERIOR_HOLE`
   - `LIKELY_MISSING_EYE`
   - `LIKELY_MISSING_TEETH`
4. Optionally call Gemini only after that for finer labeling / reviewer context.
5. Evaluate prompt experiments only against a fixed golden set, not ad hoc impressions.

## Investigation / Validation Tasks

1. Identify the exact node where deterministic transparency QA should run in 2B.
2. Decide whether deterministic checks should live:
   - directly in n8n code nodes, or
   - in a backend helper/service called from n8n
3. Build a small regression pack of known-bad and known-good PNGs.
4. Verify that when a deterministic check fails, routing and manifests correctly set:
   - `entry.needsReview = true`
   - `entry.reviewReason`
   - aggregate review flags
   - downstream review stage / human-review status
5. Measure false positives on legitimate blink / profile / closed-mouth examples.

## Acceptance Criteria

- [x] Known bad outputs (e.g., missing eye / missing teeth / interior face hole) are flagged by the updated 2B QA flow
- [x] 2B-SW1 correctly sends the neon composite and original PNG to Gemini with prompt/image order aligned
- [x] Flagged poses reliably route into review/regeneration flow (no silent pass-through)
- [x] The live 2B-SW1 QA issue discussed here is resolved and can be treated as closed

## Notes

- Live testing on 2026-03-11 showed a clear false negative from Gemini even with a focused face/eyes/teeth prompt and a correct neon composite.
- We should prioritize **cheap, deterministic checks** first, then use model-based checks only where they add incremental value.
- Resolved by tightening the 2B-SW1 face-focused QA prompt, verifying the neon composite wiring, and fixing the prompt/image-order mismatch so Gemini now receives the inputs as described.
