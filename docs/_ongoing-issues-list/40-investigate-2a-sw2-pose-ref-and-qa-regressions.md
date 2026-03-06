# Issue: Investigate 2A / SW2 pose reference and QA regressions

**Status:** 🔴 Open  
**Priority:** High  
**Created:** 2026-03-06  
**Last Updated:** 2026-03-06

## Problem Summary

Several regressions are currently blocking reliable W2A validation:

1. SW2 sometimes downloads the wrong pose reference image, for example `pose00.png` while the run is trying to QA `pose01.png`.
2. Pose QA sometimes falls into a generic parser failure (`validator parse error`) even when the images appear valid.
3. SW3 auto-flip validation cannot be meaningfully tested yet because bad SW2 outcomes prevent clean handoff into SW3.

## Current Symptoms

- In SW2, `Get Pose` is receiving `{{ $json.poseRefKey }}` as `.../pose00.png` on runs that should be using non-zero poses such as `pose01.png`.
- In SW1, fields such as `poseRefPublicUrl` and `poseRefKey` can already show `pose00.png` while the same payload still contains other pose01-related fields.
- In Pose QA, one failure mode shows a real but incorrect low score / wrong reasoning because the wrong pose reference was paired with the generated image.
- In another failure mode, the final Pose QA payload becomes:
  - `qaText: ""`
  - `qaVerdict.notes: "validator parse error"`
  - fallback reasons like `multiple_subjects`, `extra_limbs`, `cropped`, etc.

## Issues To Track

### Issue A: Wrong pose reference key is being resolved upstream

Observed symptom:
- Non-zero poses can arrive in SW2 with `poseRefKey` already pointing to `pose00.png`.

Likely root cause:
- Existing zero-pose logic is enabled too early and too broadly.
- A `poseNumber` of `0` is being introduced upstream, then preserved through SW1/SW2 and re-expanded into `pose00.png`.

Most likely source chain:
1. `SIBLING - w2A-Orchestrator.json`
   - `Expand to N Poses`
   - defaults `allowZeroPose` to `true`
   - emits pose numbers starting at `0`
2. `SIBLING - w2A-SW1-Pose_Generation.json`
   - `Stamp Pose Index`
   - preserves zero instead of normalizing to `1`
3. `SIBLING - w2A-SW1-Pose_Generation.json`
   - `Resolve Pose Ref (IMAGE P)`
   - converts `poseNumber: 0` into `pose00.png`
4. `SIBLING - w2A-SW2-Pose_and_Style_QA.json`
   - `Schema Check + Defaults`
   - rebuilds `poseRefKey` from `poseNumber`
5. `SIBLING - w2A-SW2-Pose_and_Style_QA.json`
   - `Get Pose`
   - faithfully downloads the wrong key it was given

Why this matters:
- Once the wrong reference image is paired with the generated image, Pose QA can fail for legitimate-looking output because it is evaluating against the wrong pose target.

### Issue B: Pose QA text is being lost before parsing

Observed symptom:
- `qaText` is empty at `Parse QA Verdict1`
- parser falls back to default failure payload with `validator parse error`

Likely root cause:
- Pose QA text is extracted successfully, then dropped by a later slimming / binary-restore step before the parser runs.

Most likely source chain:
1. `SIBLING - w2A-SW2-Pose_and_Style_QA.json`
   - `Drop QA Payload1`
   - correctly extracts Gemini text into `qaRawText` / `qaText`
2. `SIBLING - w2A-SW2-Pose_and_Style_QA.json`
   - `Slim1`
   - preserves `qaText`
3. `SIBLING - w2A-SW2-Pose_and_Style_QA.json`
   - `Restore Binaries After QA HTTP1`
   - rebuilds a minimal payload but does not preserve incoming `qaText` / `qaRawText`
4. `SIBLING - w2A-SW2-Pose_and_Style_QA.json`
   - `Parse QA Verdict1`
   - receives no text and falls back to generic parser failure

Why this matters:
- This masks the true reason for Pose QA failure.
- It also makes debugging much harder because valid Gemini output can be lost before parsing.

### Issue C: Pose QA fallback recovery is stale / brittle

Observed symptom:
- `Parse QA Verdict1` tries to recover text from old back-reference node names.

Likely root cause:
- The parser still references node names that do not match the actual current workflow naming in this file.

Why this matters:
- Once `qaText` is lost, parser recovery is unreliable.
- This increases the chance that a recoverable response becomes a hard fallback failure.

### Issue D: SW3 validation remains blocked by upstream SW2 instability

Observed symptom:
- SW3 auto-flip work cannot be fully tested because images are failing or being mispaired in SW2 before they reach SW3.

Why this matters:
- Even though SW3 changes may now be correct, they cannot be verified until SW1/SW2 pose reference and QA parsing are stable.

## Evidence Summary

- Wrong pose pairing evidence:
  - SW2 `Get Pose` receives `poseRefKey` as `.../pose00.png` on runs intended for non-zero poses.
  - SW1 `Build Dynamic Pose Prompt` / `Resolve Pose Ref (IMAGE P)` can already show `poseRefPublicUrl` as `pose00.png` while other fields still imply pose01.
- Parser-failure evidence:
  - final payload can show `qaText: ""`
  - fallback `qaVerdict` becomes:
    - `pose_score: 0`
    - `single_subject: false`
    - `extra_limbs: true`
    - `bg_white: false`
    - `leakage_from_pose_ref: true`
    - `cropped: true`
    - `notes: "validator parse error"`

## Step-by-step pseudocode (investigation)

```text
pick one failing retry run and one clean pose00 run

trace pose identity fields across:
  Orchestrator -> SW1 -> SW2

for each boundary, capture:
  poseNumber
  currentPoseNumber
  allowZeroPose
  poseRefKey
  poseRefPublicUrl
  __meta.poseNumber
  retryAttempt / retryTag

find the first node where:
  poseNumber becomes 0 unexpectedly
  OR poseRefKey is rebuilt as pose00.png

trace pose QA text across:
  HTTP: Pose QA (Gemini)
  Drop QA Payload1
  Slim1
  Restore Binaries After QA HTTP1
  Parse QA Verdict1

for each boundary, capture:
  qaRawText
  qaText
  candidates[0].content.parts[].text presence

find the first node where qaText is lost

fix in this order:
  1. pose reference identity / zero-pose leakage
  2. qaText preservation + parser recovery
  3. re-run SW2 on clean examples
  4. only then resume SW3 verification
```

## Recommended Starting Point

Start with **Issue A** first.

Reason:
- It is the earliest mutation problem.
- It likely explains the visible “wrong pose” QA failures.
- As long as SW2 is pairing `pose01` output with `pose00` reference, later QA behavior is not trustworthy.

Best first target:
- `SIBLING - w2A-Orchestrator.json`
  - `Expand to N Poses`

First question to answer there:
- Should `allowZeroPose` really default to `true` for these runs, or should zero-pose be explicit / opt-in only?

After that, fix **Issue B** next:
- `SIBLING - w2A-SW2-Pose_and_Style_QA.json`
  - `Restore Binaries After QA HTTP1`
- Preserve `qaText` / `qaRawText` instead of dropping them before `Parse QA Verdict1`

## Proposed Fix Order

1. Fix pose-number / pose-reference lineage at the earliest source.
2. Fix Pose QA text preservation before parsing.
3. Tighten parser fallback node references only if still needed after text preservation.
4. Re-test SW2 with:
   - one known pose01 retry case
   - one clean pose00 case
5. Resume SW3 auto-flip verification only after SW2 passes cleanly.

## Acceptance Criteria

- [ ] Non-zero SW1/SW2 runs no longer silently resolve to `pose00.png`
- [ ] `Get Pose` downloads the correct pose reference for the current pose
- [ ] `qaText` survives through `Parse QA Verdict1`
- [ ] Generic parser fallback no longer appears on valid Gemini responses
- [ ] Pose QA results are trustworthy on at least one clean pose00 example and one non-zero example
- [ ] SW3 can be tested using clean outputs that pass through SW2

## Notes

- The recent SW3 work is likely not the cause of the SW2 pose reference issue because SW3 executes later.
- The current evidence points to a combination of:
  - upstream zero-pose enablement / preservation
  - downstream QA text loss during payload slimming / restore
