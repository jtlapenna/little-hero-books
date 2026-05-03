# LHL message library

Registry of every outreach variant R2 produces or Jeff hand-writes. Each entry is one variant; one creator can have multiple entries if they're being pitched on multiple channels or with multiple angles in sequence.

This is the single source of truth for "what variant got sent to whom" and "which angle is winning." Pair with `outreach-data/lhl/copy-review.md` (per-variant review log), `outreach-data/lhl/experiments.md` (when running formal A/B tests), and `outreach-data/lhl/sent-log.md` (one row per actual send, references back here via `variant_id`).

---

## Status lifecycle

| Status | Meaning | Set by |
|---|---|---|
| `drafted` | Just written, not yet voice-checked or claims-checked | R2 |
| `copy_reviewed` | Voice + claims pass complete, no red flags | R2 (auto, after self-check) or Jeff |
| `approved` | Jeff has approved this variant for sending | Jeff (manual) |
| `sent` | Actually sent to one or more creators | Jeff post-send (or future send routine) |
| `paused` | Not currently using; may resume later | Jeff |
| `retired` | Won't be used again (poor fit, or replaced by a better variant) | Jeff |

R2 produces `drafted` → self-checks against voice guide + anti-patterns → advances to `copy_reviewed` if clean. Jeff is the only one who advances `copy_reviewed → approved` and `approved → sent`.

---

## Variant ID convention

`lhl-{angle_tag}-v{N}` where `angle_tag` matches `docs/marketing/outreach/lhl/outreach-angles.md`.

**One variant per (angle_tag, channel) pair.** The same angle delivered as email vs. IG-DM is two distinct variants because body length, opener phrasing, and sign-off differ materially. Track the channel in the `channel` column of the registry; the `variant_id` itself doesn't encode channel — the registry row is the source of truth.

Examples:
- `lhl-librarian-kidlit-curator-v1` (channel: email)
- `lhl-librarian-kidlit-curator-v2` (channel: dm-instagram — same angle, different channel, separate variant)
- `lhl-literacy-educator-v1` (channel: email)
- `lhl-diverse-representation-v1` (channel: email)
- `lhl-read-aloud-storytime-v1` (channel: dm-instagram)
- `lhl-gift-curator-v1` (channel: email)

Increment the `vN` suffix when a meaningful change is made (new opening sentence, different CTA shape, new claim, or new channel for the same angle). Cosmetic edits (typo fixes, single-word tweaks) keep the same ID.

---

## Registry

| `variant_id` | `angle_tag` | Channel | Status | Created | Last sent | Sends to date | Replies | Notes |
|---|---|---|---|---|---|---|---|---|
| lhl-librarian-kidlit-curator-v1 | librarian-kidlit-curator | email | copy_reviewed | 2026-05-02 | — | 0 | 0 | First version. Middle paragraph varies per creator instantiation (format reference). Used for @happily.ever.elephants, thispicturebooklife, @picturebookplaydate, @thechildrensbookreview. |
| lhl-diverse-representation-v1 | diverse-representation | email | copy_reviewed | 2026-05-02 | — | 0 | 0 | First version. Default "Most personalized books..." comparison (no Wonderbly name). Advocacy reference varies per creator. Used for @biracialbookworms, @blackbabybooks, @thetinyactivists, @thetututeacher (business flag: talent-managed; Jeff review before send). |
| lhl-read-aloud-storytime-v1 | read-aloud-storytime | email | copy_reviewed | 2026-05-02 | — | 0 | 0 | First version. Hedged first-reaction framing ("tends to be"). Dual-creator offer token noted in template. Used for @ryan_and_craig. |
| lhl-literacy-educator-v1 | literacy-educator | email | copy_reviewed | 2026-05-02 | — | 0 | 0 | First version. Themes from CLAUDE.md only (emotional intelligence, courage, friendship). No curriculum-alignment claims. Audience reference varies per creator. Used for @raisingreaderstobecomeleaders, @growingbookbybook, @kaylynjohnson_slp, @littlereaders.futureleaders. |
| lhl-gift-curator-v1 | gift-curator | email | copy_reviewed | 2026-05-03 | — | 0 | 0 | First version. Baby-shower / birthday / registry gift-context framing. Middle paragraph audience-context sentence varies per creator. Used for @bfppodcast (podcast, passed_with_notes: angle contextual/audience-driven), @newmodernmom. |

---

## Variant detail format

When a variant is added, also write a per-variant file at `outreach-data/lhl/message-variants/{variant_id}.md` with:

```
---
variant_id: lhl-librarian-kidlit-curator-v1
angle_tag: librarian-kidlit-curator
channel: email | dm-instagram | dm-tiktok | dm-substack
status: drafted | copy_reviewed | approved | sent | paused | retired
created: YYYY-MM-DD
created_by: R2 | Jeff | other
based_on: (optional) lhl-{...}-v{N-1}  # if iterated from a prior variant
sends_to_date: 0
replies_to_date: 0
positive_replies_to_date: 0
copy_review_status: pending | passed | flagged
copy_review_notes: (optional)
---

# Subject line (if email)

[Body]

[Sign-off]
```

The per-variant file is the canonical text. The registry table above tracks state.

---

## How drafts (per-creator) reference the library

When R2 writes a per-creator draft to `outreach-data/lhl/drafts/{YYYY-MM-DD}-{handle}.md`, the draft frontmatter includes:

```
variant_id: lhl-librarian-kidlit-curator-v1
angle_tag: librarian-kidlit-curator
```

The draft body is the variant text with creator-specific personalization tokens filled in (name, channel-specific reference, etc.). The variant file in `message-variants/` stays as the canonical template; the draft is the per-creator instantiation.

---

## When to spin up a new variant

- The angle is new (just added to `outreach-angles.md`) and needs a v1
- Existing variant has clearly underperformed (low reply rate after ≥10 sends) and we want to test a hypothesized improvement
- Jeff has rewritten the variant text materially
- We're A/B testing a specific dimension (opener, CTA, comparison phrasing) — log the test in `experiments.md`

---

## Iteration log

| Date | Change |
|---|---|
| 2026-05-01 | Library schema created. R2 deployment will populate first variants. |
| 2026-05-02 | Clarified: one variant per (angle_tag, channel) pair. |
