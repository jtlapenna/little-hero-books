# Issue: Pinpoint `skinToneCanonical` overwrite source (`skin-medium`)

**Status:** ✅ Completed  
**Priority:** High  
**Created:** 2026-03-06  
**Last Updated:** 2026-03-14

## Resolution

The upstream overwrite source was investigated sufficiently for current operations, and downstream protections now keep dark-tone orders on the correct canonical path during pose reference selection. This issue is being closed as completed, with follow-up monitoring handled operationally rather than as an open investigation ticket.

## Problem Summary

For deep / medium-dark test orders, SW1 sometimes receives `skinToneCanonical: "skin-medium"` even when character specs indicate dark tones (for example `characterSpecs.skinTone: "deep"` or `"deep-dark"`).  
This causes pose reference selection to use the non-`skin-deep` path unless downstream logic compensates.

## Why this issue exists

We have confirmed a downstream symptom and added safeguards in SW1, but we have **not yet identified the first writer** that sets `skinToneCanonical` to `skin-medium`.

Current uncertainty:
- Earlier hypothesis pointed to `W1.1`, but this is not yet proven.
- The value may be written earlier (W0/SW0) or overwritten in W2A orchestration before SW1.

## Goal

Identify the **exact first node/workflow step** that writes or overwrites `skinToneCanonical` with `skin-medium` for a dark-tone order.

## Scope

In scope:
- W0 intake + normalization
- W1.1 router payload prep
- W2A orchestrator normalization/shims
- SW0/SW1 handoff fields that may rehydrate or overwrite tone fields

Out of scope:
- Prompt quality tuning
- Pose generation quality itself
- Auto-flip logic

## Step-by-step pseudocode (investigation)

```text
choose one known failing order id

for each stage in [W0, W1.1, W2A-Orchestrator, SW0, SW1 pre-resolver]:
  capture payload snapshot with:
    orderId
    characterSpecs.skinTone
    characterSpecs.skinToneCanonical
    skinToneCanonical (top-level)
    orderContext.characterSpecs.skinTone
    ctx.characterSpecs.skinTone
    node/workflow name + timestamp

build a timeline of these snapshots in order

find the first snapshot where:
  skinToneCanonical == "skin-medium"
  AND prior snapshot did not have that value

mark that node as root writer
trace if value is "defaulted" or mapped from another field
propose minimal fix at that node (not only downstream compensation)
```

## Investigation Plan

1. **Freeze one failing order as trace subject**
   - Use a single order ID and run ID to avoid mixed evidence.
2. **Instrument or inspect key nodes**
   - Add temporary telemetry taps (or execution-data capture) at stage boundaries.
3. **Build ordered evidence table**
   - Compare tone fields at each stage.
4. **Pinpoint first mutation point**
   - Record workflow + node + code snippet + exact assignment path.
5. **Propose root fix**
   - Apply correction at the earliest safe mutation point.

## Evidence to Capture

- `orderId`
- `workflowName`
- `nodeName`
- `timestamp`
- `characterSpecs.skinTone`
- `characterSpecs.skinToneCanonical`
- `skinToneCanonical` (top-level)
- `orderContext.characterSpecs.skinTone`
- `ctx.characterSpecs.skinTone`
- any fallback/default branch taken (if/else path)

## Root Cause Candidates

1. **Defaulting branch** sets canonical tone to medium when tone key is missing/empty.
2. **Field priority order** prefers stale top-level canonical over fresh `characterSpecs.skinTone`.
3. **Envelope merge step** drops populated specs, then recomputes canonical from default.
4. **String normalization mismatch** (`deep` vs `deep-dark` vs `skin-deep`) routes into medium fallback.

## Acceptance Criteria

- [ ] First writer node for `skinToneCanonical: "skin-medium"` is identified with evidence.
- [ ] Root-cause assignment path is documented (exact field precedence or fallback rule).
- [ ] Minimal fix is proposed at the root mutation point.
- [ ] One validation run confirms deep/medium-dark orders keep dark canonical tone through SW1 input.
- [ ] No regression for light/medium/tan orders.

## Notes

- SW1 now has defensive fallback logic, but this issue remains open until the **upstream source** is fixed.
- Keep this issue focused on data lineage and mutation source, not visual quality.
