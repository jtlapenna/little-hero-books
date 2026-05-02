# LHL copy review log

Every R2-drafted batch and every hand-written variant gets a copy-review pass before advancing to `approved`. The review checks against the voice guide, anti-patterns, and the locked claims discipline.

R2 self-reviews each draft it produces and logs the pass here. Jeff reviews flagged drafts and any variant that's about to advance to `approved`.

---

## Review checklist

Run this against every draft / variant. R2 should explicitly enumerate which boxes passed in its log entry.

### Voice
- [ ] Direct founder intro opener (or A/B variant explicitly tagged)
- [ ] Outcome-framed product description (not mechanical "you build the character" language)
- [ ] Brief: 100–180 words for emails, 60–100 for DMs
- [ ] Sign-off as Jeff / Little Hero Labs (no AI persona, no "we" hiding the writer)
- [ ] URL in sign-off

### Format
- [ ] No em dashes anywhere (—)
- [ ] No curly quotes ('' "")
- [ ] Paragraph breaks every 1–3 sentences (no walls of text)
- [ ] Sentence-case subject line, no clickbait

### AI tells
- [ ] No AI vocabulary words: delve, leverage, tapestry, pivotal, intricate, underscore, fostering, garner, vibrant, in the heart of
- [ ] No negative parallelism ("It's not just X, it's Y")
- [ ] No rule-of-three flourishes when 1–2 items would suffice
- [ ] Sentence openers vary across drafts in the same batch

### Claims discipline
- [ ] No fabricated social proof, partner names, or sales numbers
- [ ] No promised shipping timelines beyond Lulu's typical 3–5 business days
- [ ] No price quotes that aren't current ($29.99 launch only; $24.99 only when a promo is actually live)
- [ ] No claim that the favorite animal is throughout the story (it's a final-pages reveal)
- [ ] No corporate fluff (synergy, leverage, brand alignment, partnership opportunity, reach out)
- [ ] Wonderbly comparison: only when in the explicit B1 variant, phrased as differentiation not swipe

### Offer / business
- [ ] No dollar amounts named in initial outreach
- [ ] No mechanism (rev share, flat fee) named in initial outreach
- [ ] Lead with gifted-book ask
- [ ] Offer-share gated on creator's interest in the book first

### Personalization
- [ ] If using specific-reference opener (A/B variant only): reference is actually specific, not generic praise
- [ ] If naming the creator's format (read-aloud, gift-roundup, etc.): claim is verifiable from public posts

### Live-URL hygiene
- [ ] Includes preview URL: `https://www.littleherolabs.com/preview` (or `littleherolabs.com/preview` for DMs)

---

## Review status options

| Status | Meaning |
|---|---|
| `passed` | All checklist items pass; safe to advance variant to `copy_reviewed` |
| `passed_with_notes` | Passes but with minor notes (e.g., "consider rewording sentence 3 for cadence"). Still advances. |
| `flagged` | One or more red flags. Variant stays `drafted`; surfaces to Jeff in the daily R2 summary. |
| `rejected` | Material problem (claim that can't be backed, voice clearly off). Variant stays `drafted`; needs rewrite or retire. |

---

## Review log

R2 appends one row per drafted variant per pass. Jeff appends rows for any manual review.

| Date | `variant_id` | Reviewer | Status | Notes |
|---|---|---|---|---|
| _none yet — R2 deployment will populate first reviews_ | | | | |

---

## When R2 flags a draft

If R2 produces a draft that fails the checklist:

1. Set the variant's `copy_review_status: flagged` in `message-library.md`
2. Append a row here with status `flagged` and explicit notes
3. Surface the flag in the R2 daily summary output ("3 drafts ready, 1 flagged, see copy-review.md row [date])
4. **Do NOT advance** the variant or per-creator draft to `copy_reviewed`. Jeff resolves flagged drafts manually.

---

## Iteration log

| Date | Change |
|---|---|
| 2026-05-01 | Schema created. R2 deployment will populate the review log starting tomorrow. |
