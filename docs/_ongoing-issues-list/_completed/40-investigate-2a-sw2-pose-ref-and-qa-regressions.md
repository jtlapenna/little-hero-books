# Issue: Investigate 2A / SW2 pose reference and QA regressions

**Status:** ✅ Completed  
**Priority:** High  
**Created:** 2026-03-06  
**Last Updated:** 2026-03-11

## Summary

This issue originally captured a cluster of regressions that appeared to be blocking reliable W2A validation:

1. SW2 sometimes downloaded the wrong pose reference image, for example `pose00.png` while the run was trying to QA `pose01.png`.
2. Pose QA sometimes fell into a generic parser failure (`validator parse error`) even when the images appeared valid.
3. SW3 auto-flip validation could not be meaningfully tested because bad SW2 outcomes prevented clean handoff into SW3.

Runtime verification on March 11, 2026 showed these regressions no longer reproduce in the current workflow behavior.

## Final Assessment

The issue document had become stale relative to the current workflows.

Important clarification:
- `allowZeroPose = true` is not itself a bug.
- Pose 0 is intended to run as part of the normal pose set.
- The real failure case was narrower: a non-zero pose run accidentally inheriting pose 0 reference identity later in the flow.

That failure did not reproduce in the verified runs.

## Verification Results

### Pose reference identity

Verified with runtime node outputs:

- Pose 0 run:
  - `Stamp Pose Index` kept `poseNumber: 0`
  - `Resolve Pose Ref (IMAGE P)` emitted `poseRefKey: .../pose00.png`
  - SW2 `Schema Check + Defaults` kept `poseRefKey: .../pose00.png`
  - `Get Pose` fetched the pose 0 reference

- Pose 1 run:
  - `Stamp Pose Index` kept `poseNumber: 1`
  - `Resolve Pose Ref (IMAGE P)` emitted `poseRefKey: .../pose01.png`
  - SW2 `Schema Check + Defaults` kept `poseRefKey: .../pose01.png`
  - `Get Pose` fetched the pose 1 reference

Conclusion:
- pose 0 stayed pose 0
- pose 1 stayed pose 1
- the original “non-zero silently becoming pose00” regression did not reproduce

### Pose QA parsing

Verified with runtime node outputs on a valid pose 1 run:

- `HTTP: Pose QA (Gemini)` returned a valid JSON text response
- `Drop QA Payload1` extracted both `qaRawText` and `qaText`
- `Parse QA Verdict1` produced the expected structured verdict:
  - `pose_score: 1`
  - `single_subject: true`
  - `extra_limbs: false`
  - `bg_white: true`
  - `leakage_from_pose_ref: false`
  - `cropped: false`

One internal note:
- `Restore Binaries After QA HTTP1` still showed an empty `qaRawText` in the sampled run
- despite that, `Parse QA Verdict1` still resolved the QA text and parsed the correct verdict

Conclusion:
- the current flow is functionally healthy even if that intermediate node remains a little untidy internally

### SW3 impact

Because both pose reference identity and Pose QA parsing verified cleanly, the original premise that SW3 testing was blocked by unstable SW2 behavior is no longer supported.

## Evidence Used

The following runtime nodes were checked:

- pose 0 reference verification:
  - `Expand to N Poses`
  - `Stamp Pose Index`
  - `Resolve Pose Ref (IMAGE P)`
  - `Schema Check + Defaults`
  - `Get Pose`

- pose 1 reference verification:
  - `Stamp Pose Index`
  - `Resolve Pose Ref (IMAGE P)`
  - `Schema Check + Defaults`
  - `Get Pose`

- pose 1 QA verification:
  - `HTTP: Pose QA (Gemini)`
  - `Drop QA Payload1`
  - `Restore Binaries After QA HTTP1`
  - `Parse QA Verdict1`

## Acceptance Criteria

- [x] A clean pose 0 run uses the expected pose 0 reference
- [x] A clean non-zero run does not silently resolve to pose 0
- [x] `Get Pose` downloads the correct pose reference for the current pose
- [x] Pose QA produces a structured parsed verdict on a valid response
- [x] Generic parser fallback no longer appears on valid Gemini responses
- [x] SW3 is no longer practically blocked by SW2 instability
- [x] This issue is moved out of active status

## Notes

- The recent SW3 work was not the cause of the original SW2 pose reference issue because SW3 executes later.
- The current source review and runtime verification both showed this document had become stale.
- The relevant question was never whether pose 0 should exist, but whether non-zero runs kept their own pose identity end-to-end.
