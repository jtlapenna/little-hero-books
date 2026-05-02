# LHL experiments

Formal A/B tests of outreach variants. Used when we have enough volume on a single dimension to draw any signal at all (rule of thumb: ≥10 sends per arm before treating any difference as real, ≥30 per arm for confident calls).

This file is mostly empty until we have ≥20 sends in a single angle. Until then, R2 just records sends and replies normally; no experiments needed.

---

## What counts as an experiment

A single variable changed across two variants of the same angle, sent to similar segments. Examples:

- Opener style: direct founder intro vs specific-reference opener (this is the Phase 1 test in `voice-guide.md`)
- Wonderbly comparison: omitted vs named directly (Phase 2)
- CTA shape: "open to a gifted collab" vs "happy to send a preview"
- Subject line variant in email
- Body length: 120-word vs 80-word version of the same angle

What does NOT count as an experiment:
- Different angles to different creator archetypes (that's segmentation, not testing)
- One-off rephrasing for a specific creator (that's personalization)
- Tweaking after looking at results (that's iteration; reset the experiment)

---

## Primary metric

**Positive reply rate.** The denominator is sends; the numerator is replies that signal interest (anything from "tell me more" to "send the book"). Bounces, unsubscribes, and explicit declines are guardrails, not the primary metric.

Do NOT use opens or click-throughs as the primary metric. Open-tracking is unreliable (privacy filters, image-blocking) and click-throughs depend on recipient behavior we can't control.

---

## Guardrail metrics (watch but don't optimize)

- Bounce rate (a high-bouncing variant is a list problem, not a copy problem)
- Negative-reply rate (a variant that triggers "please remove me" replies is doing real damage)
- Time-to-first-reply (long delays might indicate the message is unclear, but it's noisy)

---

## Sample size guidance

| Sends per arm | What you can say |
|---|---|
| <10 | Nothing. Note the trend; don't decide. |
| 10–29 | "Looks like A is better" — promote to default if Δ ≥50% on positive-reply rate. Re-test if Δ <50%. |
| 30+ | Confident call. Lock the winner; archive the loser. |

These are heuristics, not statistics. We're not running a clinical trial; we're running outreach. Be honest about what the volume can support.

---

## Active experiments

(none)

---

## Completed experiments

(none yet — schema created 2026-05-01)

---

## Experiment template

Copy this block when adding a new experiment.

```
### EXP-NNN: [short name]

- **Hypothesis**: [one sentence — what we expect to be true and why]
- **Dimension under test**: [what's the single variable]
- **Variant A (control)**: [variant_id from message-library.md]
- **Variant B (treatment)**: [variant_id from message-library.md]
- **Segment**: [which angle / tier / list]
- **Split rule**: [how creators are assigned — random / alternating / by handle hash]
- **Started**: YYYY-MM-DD
- **Ended**: (TBD or YYYY-MM-DD)
- **Sends per arm**: A=N, B=N
- **Positive replies**: A=N, B=N
- **Bounce rate**: A=N%, B=N%
- **Decision**: [A wins / B wins / inconclusive / extend]
- **Notes**: [what we learned, what we'd test next]
```

---

## Iteration log

| Date | Change |
|---|---|
| 2026-05-01 | Schema created. No active experiments yet. |
