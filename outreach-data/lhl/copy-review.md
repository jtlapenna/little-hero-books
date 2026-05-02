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
| 2026-05-02 | lhl-librarian-kidlit-curator-v1 | R2 | passed | Batch: @happily.ever.elephants. All checklist items pass. Opener: default founder-direct. Outcome-framed. 145 words. No em dashes, curly quotes, AI vocab, dollar amounts, mechanism, or animal-throughout claims. Format reference ("school families") verifiable from pipeline. Preview URL present. |
| 2026-05-02 | lhl-librarian-kidlit-curator-v1 | R2 | passed | Batch: thispicturebooklife. All checklist items pass. Opener: "I'm Jeff at..." variant. Outcome-framed. 145 words. Middle reference ("alongside your picks on connection") verifiable from pipeline blog notes. Preview URL present. |
| 2026-05-02 | lhl-diverse-representation-v1 | R2 | passed | Batch: @biracialbookworms. All checklist items pass. Opener: "I'm Jeff from..." variant. 165 words (within 180 ceiling). Default comparison framing (no Wonderbly named). Advocacy reference verifiable from handle + stated bio. Preview URL present. |
| 2026-05-02 | lhl-read-aloud-storytime-v1 | R2 | passed | Batch: @ryan_and_craig. All checklist items pass. Opener: "Jeff here from..." variant. 140 words. First-reaction framing hedged ("tends to be"). Animal placed at final pages, not throughout. Dual-creator offer adapted. Preview URL present. |
| 2026-05-02 | lhl-literacy-educator-v1 | R2 | passed | Batch: @raisingreaderstobecomeleaders. All checklist items pass. Opener: "I'm Jeff, founder..." 145 words. "Books By Age" reference scout-verified on 2026-05-01. Themes accurate per CLAUDE.md. No curriculum-alignment claims. Preview URL present. |
| 2026-05-02 | lhl-librarian-kidlit-curator-v1 | R2 | passed | Batch: @picturebookplaydate. All checklist items pass. Opener: "Jeff here from..." (varied from other librarian-kidlit drafts in batch). 130 words. Daily-recs reference verifiable from pipeline. Preview URL present. |
| 2026-05-02 | lhl-literacy-educator-v1 | R2 | passed | Batch: @growingbookbybook. All checklist items pass. Opener: "I'm Jeff at..." (varied from other literacy-educator draft in batch). 140 words. Audience description verifiable from pipeline notes. Themes accurate. Preview URL present. |
| 2026-05-02 | lhl-librarian-kidlit-curator-v1 | R2 (humanizer) | flagged | thispicturebooklife: "Their favorite animal joins for the final reveal" repeated verbatim in paragraphs 1 and 2. Also: "Your child is illustrated to look like them on every page" is grammatically awkward mid-paragraph. Draft downgraded to `drafted`. Fix: remove animal reveal from opener or rephrase middle. |
| 2026-05-02 | lhl-diverse-representation-v1 | R2 (humanizer) | flagged | @biracialbookworms: Animal-reveal sentence repeated across paragraphs 1 and 2. Root cause is a template collision: standard product-description opener + diverse-representation angle both carry the animal reveal. Draft downgraded to `drafted`. Fix: end opener after "illustrated to look like them" and let middle paragraph carry the animal reveal exclusively. |
| 2026-05-02 | lhl-librarian-kidlit-curator-v1 | R2 (humanizer) | flagged | @picturebookplaydate: Same animal-reveal repetition as thispicturebooklife. Draft downgraded to `drafted`. Fix: same as above. |
| 2026-05-02 | — | R2 (humanizer) | passed | Batch summary: No em dashes, no AI vocabulary, no curly quotes detected across all 7 drafts. 4 opener variants used. 3 drafts downgraded post-humanizer due to repeated animal-reveal sentence. 4 drafts remain copy-reviewed. |

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
