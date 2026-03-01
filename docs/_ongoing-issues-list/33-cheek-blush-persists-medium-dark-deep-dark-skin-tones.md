# 33 - Cheek blush persists for medium-dark and deep-dark skin tones

## Status
🟡 In Progress

## Problem

Current cheek prompt constraints are not reliably preventing cheek blush artifacts for:
- medium-dark skin tone
- deep-dark skin tone

Even when prompt language asks for no blush, generated outputs still show visible pink/red cheek tinting in some poses.

## Decision

Create new pose reference images **without cheek blush** for only these two skin tones:
1. medium-dark
2. deep-dark

Do not change reference sets for other skin tones in this issue.

## Scope

1. Regenerate pose reference image set for medium-dark skin tone with strict no-blush target.
2. Regenerate pose reference image set for deep-dark skin tone with strict no-blush target.
3. Keep all other character attributes and pose framing consistent with existing approved references.
4. Update workflow/config pointers to use the new references for these two tones only.

## Why this approach

- Prompt-only control has proven unreliable for this artifact.
- Reference-image control is deterministic and isolated.
- Limiting to two tones minimizes risk of regression for other tones.

## Acceptance criteria

- Medium-dark reference set shows no cheek blush across required poses.
- Deep-dark reference set shows no cheek blush across required poses.
- Existing outputs for fair/light/medium tones are unchanged.
- 2A/2B downstream quality checks pass using updated references.

## Verification checklist

- Run test generations for both tones across representative poses.
- Compare new outputs against old references side-by-side.
- Confirm no unintended skin hue shift, saturation drift, or lip-color bleed.
- Confirm workflow uses updated reference keys/URLs for only these two tones.

## Risks

- Removing blush can accidentally flatten facial contrast if color grading is over-corrected.
- Reference replacement can affect identity consistency if not generated from the same base setup.

## Follow-up

If artifacts still persist after reference replacement, open a follow-up issue to:
- split cheek-region control by tone-specific mask instructions, and/or
- add a post-generation cheek-tint detector in QA for automated rejection.
