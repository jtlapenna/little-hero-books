# Issue: Improve Pose 01 Prompt (front-facing success rate)

**Status:** 🔴 Open  
**Priority:** Medium  
**Created:** 2026-01-28  
**Last Updated:** 2026-03-13

## Description

Pose 01 is not reliably generating a **straight, front-facing** character. The prompt/instructions for pose 1 need adjustment so the model produces the intended orientation and framing more consistently.

## Impact

- Lower character quality on a key early pose
- More re-runs / manual QA
- Downstream composition (W3) can look “off” if the character is angled or turned

## Suspected Root Cause

- Prompt for pose 01 may be under-specified about:
  - camera angle (frontal vs 3/4)
  - head/torso alignment
  - symmetry and gaze direction
  - feet/stance placement and cropping
- Negative constraints may be missing (e.g., “no profile/3/4 view”, “no turned shoulders”)

## Investigation Needed

1. Identify where the pose 01 prompt is defined (W2A prompt template / pose mapping / LLM node).
2. Review recent failed pose 01 outputs and categorize failure modes:
   - 3/4 turn
   - profile
   - head turned
   - camera tilted
   - body cropped incorrectly
3. Confirm whether “auto-flip” interacts with pose 01 (should not be masking prompt issues).

## Proposed Prompt Updates (high-level)

- Explicitly require:
  - **front-facing**: shoulders square to camera, both eyes visible, nose centered
  - **neutral camera**: straight-on camera, no angle, no tilt
  - **composition**: full character visible (or the exact framing we want), centered placement
- Explicitly forbid:
  - profile / 3/4 view
  - body rotation / head turned
  - extreme perspective

## Next Attempt

- Prompt tightening alone did not fix pose 01 reliably enough.
- Next test: for **pose 01 only**, change Gemini request assembly so the **POSE** reference image is sent **before** the **BASE** character image.
- Rationale: the model may still be over-anchoring on the base character image and “naturalizing” the pose into a slight 3/4 walking angle even when the prompt is strict.
- Keep the stronger pose 01 prompt, but test image-order priority before doing another wording pass.

## Acceptance Criteria

- [ ] Pose 01 generates front-facing correctly in repeated test runs (same character spec, multiple seeds/runs)
- [ ] Fewer manual regenerations needed for pose 01
- [ ] No regression to other poses’ quality or style consistency

## Notes

- Once fixed, capture a small “before/after” sample set (5–10 renders) for reference.
