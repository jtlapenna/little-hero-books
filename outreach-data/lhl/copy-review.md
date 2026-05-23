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
- [ ] **No verbatim repetition of product-attribute sentences across paragraphs.** Specifically watch for the "their favorite animal joins for the final reveal" beat appearing in both the opener and the body. The opener (from voice-guide standard openers) already carries it; angle bodies should not restate it. If both contain it, drop the body restatement.

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
| 2026-05-02 | lhl-librarian-kidlit-curator-v1 | R2 | passed | Re-fire batch: @thechildrensbookreview. All checklist items pass. Opener: "I'm Jeff at..." (varied). ~148 words. "Growing Readers" and "since 2008" references verified from pipeline. No animal-reveal repetition. Preview URL present. |
| 2026-05-02 | lhl-diverse-representation-v1 | R2 | passed | Re-fire batch: @blackbabybooks. All checklist items pass. Opener: "Jeff here from..." (varied). ~155 words. Default comparison framing (no Wonderbly named). "Black Children's Book Week" reference verified from pipeline. No animal-reveal repetition. Preview URL present. |
| 2026-05-02 | lhl-diverse-representation-v1 | R2 | passed | Re-fire batch: @thetinyactivists. All checklist items pass. Opener: "I'm Jeff, founder of..." (varied). ~158 words. "Queer Kid Lit Camp" and custom-pronouns references verified from pipeline and CLAUDE.md. No animal-reveal repetition. Preview URL present. |
| 2026-05-02 | lhl-diverse-representation-v1 | R2 | passed_with_notes | Re-fire batch: @thetututeacher. All COPY checklist items pass. Opener: "I'm Jeff from..." (varied). ~150 words. Advocacy reference verified. No animal-reveal repetition. BUSINESS NOTE (not a copy flag): talent-managed (Serendipity Lit + How Now Booking); Jeff should review before approving to send. Copy advances to copy-reviewed. |
| 2026-05-02 | lhl-literacy-educator-v1 | R2 | passed | Re-fire batch: @kaylynjohnson_slp. All checklist items pass. Opener: "Jeff here from..." (varied). ~163 words (within ceiling). SLP and toddler-preschool audience references verified from pipeline. No animal-reveal repetition. Preview URL present. |
| 2026-05-02 | lhl-literacy-educator-v1 | R2 | passed | Re-fire batch: @littlereaders.futureleaders. All checklist items pass. Opener: "I'm Jeff at..." (varied). ~143 words. "Books that support conversations" verbatim from pipeline niche description. No animal-reveal repetition. Preview URL present. |
| 2026-05-02 | — | R2 (humanizer) | passed | Re-fire batch summary: All 6 drafts passed all humanizer checks. No em dashes, no AI vocabulary, no curly quotes. 4 opener variants used across the 6 drafts. Animal-reveal collision NOT recurring — fixed templates confirmed working (reveal in opener paragraph only for all 6 drafts). All 6 remain copy-reviewed. Minor non-AI note on @thetututeacher: "Your advocacy...is exactly the audience" has slightly mixed logic; worth a read-aloud by Jeff before sending (not a downgrade). |

---

## When R2 flags a draft

If R2 produces a draft that fails the checklist:

1. Set the variant's `copy_review_status: flagged` in `message-library.md`
2. Append a row here with status `flagged` and explicit notes
3. Surface the flag in the R2 daily summary output ("3 drafts ready, 1 flagged, see copy-review.md row [date])
4. **Do NOT advance** the variant or per-creator draft to `copy_reviewed`. Jeff resolves flagged drafts manually.

---

| 2026-05-03 | lhl-librarian-kidlit-curator-v1 | R2 | flagged | @happily.ever.elephants: opener "I'm Jeff, founder of Little Hero Labs." is identical to 2026-05-03-growingbookbybook.md. Batch opener repetition. Draft downgraded to `drafted`. Fix: swap opener form before approving. All other checks pass. |
| 2026-05-03 | lhl-librarian-kidlit-curator-v1 | R2 | passed | thispicturebooklife: all checklist items pass. Opener "Jeff here from..." (varied). ~127 words. No em dashes, curly quotes, AI vocab, dollar amounts, mechanism. Animal reveal in opener only. "picture books you pair and recommend" verifiable from pipeline. Preview URL present. |
| 2026-05-03 | lhl-diverse-representation-v1 | R2 | passed | @biracialbookworms: all checklist items pass. Opener "I'm Jeff from..." (varied). ~146 words. Default comparison framing (no Wonderbly named). Animal reveal in opener only. Advocacy references verifiable from handle and bio. Preview URL present. |
| 2026-05-03 | lhl-read-aloud-storytime-v1 | R2 | passed | @ryan_and_craig: all checklist items pass. Opener "Jeff here from..." (duo salutation). ~133 words. Animal reveal in opener only; final-pages beat in body hedged ("tends to"). "personalized copies" plural for duo. Read-aloud reference verifiable from pipeline. Preview URL present. |
| 2026-05-03 | lhl-literacy-educator-v1 | R2 | flagged | @raisingreaderstobecomeleaders: body sentence "Themes are courage, friendship, and emotional intelligence." is identical to 2026-05-03-growingbookbybook.md. Batch sentence repetition. Draft downgraded to `drafted`. Fix: vary phrasing in this draft or the growingbookbybook draft. All other checks pass. |
| 2026-05-03 | lhl-librarian-kidlit-curator-v1 | R2 | passed | @picturebookplaydate: all checklist items pass. Opener "Jeff here, founder of..." (varied). ~124 words. Animal reveal in opener only. "daily picture-book recs" verifiable from pipeline. Preview URL present. |
| 2026-05-03 | lhl-literacy-educator-v1 | R2 | flagged | @growingbookbybook: two flags from humanizer. (1) Opener "I'm Jeff, founder of Little Hero Labs." identical to 2026-05-03-happily.ever.elephants.md. (2) "Themes are courage, friendship, and emotional intelligence." identical to 2026-05-03-raisingreaderstobecomeleaders.md. Also: "exactly the demo we're reaching" reads corporate. Draft downgraded to `drafted`. Fix opener, theme sentence, and swap "demo" for "audience." |
| 2026-05-03 | — | R2 (humanizer) | passed | Batch summary: no em dashes, no AI vocabulary, no curly quotes, no animal-reveal repetition within any individual draft detected across all 7 drafts. 5 opener forms used across 7 drafts. Offer paragraph is near-identical by design (template). 3 cross-batch repetition flags issued (opener x2, theme-sentence x2, one corporate word). 4 drafts remain copy-reviewed; 3 downgraded to drafted/flagged for Jeff fixes. |

---

| 2026-05-03 | lhl-librarian-kidlit-curator-v1 | R2 | passed | Batch: thispicturebooklife. All checklist items pass. Opener: "Jeff here from..." (varied). ~127 words. Animal reveal in opener only. "picture books you pair and recommend" verifiable from pipeline. No em dashes, curly quotes, AI vocab, dollar amounts. Preview URL present. |
| 2026-05-03 | lhl-diverse-representation-v1 | R2 | passed | Batch: @biracialbookworms. All checklist items pass. Opener: "I'm Jeff from..." (varied). ~146 words. Default comparison framing (no Wonderbly named). Animal reveal in opener only; body covers representation angle. Advocacy references verifiable from handle + bio. No em dashes, AI vocab, dollar amounts. Preview URL present. |
| 2026-05-03 | lhl-read-aloud-storytime-v1 | R2 | passed | Batch: @ryan_and_craig. All checklist items pass. Opener: "Jeff here from..." (duo salutation). ~133 words. On-camera framing hedged ("tends to"). Animal reveal in opener only. "personalized copies" plural for duo. Format reference verifiable from pipeline. No em dashes, AI vocab, dollar amounts. Preview URL present. |
| 2026-05-03 | lhl-librarian-kidlit-curator-v1 | R2 | passed | Batch: @picturebookplaydate. All checklist items pass. Opener: "Jeff here, founder of..." (varied). ~124 words. Animal reveal in opener only. "daily picture-book recs" verifiable from pipeline. No em dashes, curly quotes, AI vocab, dollar amounts. Preview URL present. |
| 2026-05-03 | lhl-librarian-kidlit-curator-v1 | R2 (humanizer) | flagged | @happily.ever.elephants: opener "I'm Jeff, founder of Little Hero Labs." is identical to draft 2026-05-03-growingbookbybook.md. Batch opener repetition. Draft downgraded to `drafted`. Fix: swap to a different canonical opener form (e.g. "Jeff here from..." or "I'm Jeff at..."). |
| 2026-05-03 | lhl-literacy-educator-v1 | R2 (humanizer) | flagged | @raisingreaderstobecomeleaders: body sentence "Themes are courage, friendship, and emotional intelligence." is identical to draft 2026-05-03-growingbookbybook.md. Batch sentence repetition. Draft downgraded to `drafted`. Fix: vary the themes phrasing in this draft or the growingbookbybook draft. |
| 2026-05-03 | lhl-literacy-educator-v1 | R2 (humanizer) | flagged | @growingbookbybook: two flags. (1) Opener "I'm Jeff, founder of Little Hero Labs." identical to 2026-05-03-happily.ever.elephants.md. (2) "Themes are courage, friendship, and emotional intelligence." identical to 2026-05-03-raisingreaderstobecomeleaders.md. Also: "exactly the demo we're reaching" reads corporate. Draft downgraded to `drafted`. Fix opener, vary theme sentence, replace "demo" with "audience" or rephrase. |
| 2026-05-03 | — | R2 (humanizer) | passed | Batch summary: No em dashes, no AI vocabulary, no curly quotes, no within-draft animal-reveal repetition detected across all 7 drafts. 5 opener variants used. Offer paragraph near-identical by design (template). 3 drafts downgraded post-humanizer: @happily.ever.elephants (opener dup), @raisingreaderstobecomeleaders (theme sentence dup), @growingbookbybook (opener dup + theme sentence dup + "demo"). 4 drafts remain copy-reviewed: thispicturebooklife, @biracialbookworms, @ryan_and_craig, @picturebookplaydate. |
| 2026-05-03 | lhl-gift-curator-v1 | R2 | passed_with_notes | Batch: @bfppodcast. All checklist items pass. Opener: "Jeff here from..." (varied from newmodernmom draft). ~113 words. No em dashes, curly quotes, AI vocab, dollar amounts, mechanism, or animal-reveal mentions. "Your listeners are right in baby-shower and first-birthday territory" verifiable from pipeline (pregnancy + new-mom podcast). ANGLE NOTE (not a copy flag): gift-curator angle is audience-driven rather than creator-content-catalog match; podcast does not run gift roundups explicitly. Jeff should confirm angle fit before approving. |
| 2026-05-03 | lhl-gift-curator-v1 | R2 | passed | Batch: @newmodernmom. All checklist items pass. Opener: "I'm Jeff at..." (varied from bfppodcast draft). ~114 words. No em dashes, curly quotes, AI vocab, dollar amounts, mechanism, or animal-reveal mentions. "You cover baby-registry picks and early-motherhood finds" verifiable from pipeline niche (Modern-mom lifestyle / baby registry / motherhood). "birthday, baby shower, and registry content" three-item list is factual, not performative. Preview URL present. |
| 2026-05-03 | — | R2 (humanizer) | passed | R2 re-run batch summary: No em dashes, no AI vocabulary, no curly quotes detected in either draft. 2 distinct opener forms (Jeff here from / I'm Jeff at). Cross-batch close line near-identical by design (template). Minor cosmetic note on bfppodcast Draft 1: "territory" slightly formal; low concern, no downgrade. Both drafts remain copy-reviewed. |

---

| 2026-05-16 | lhl-librarian-kidlit-curator-v1 | R2 | passed | Batch: @thebookmommy. All checklist items pass. Opener: "I'm Jeff, founder of Little Hero Labs." (variant 1). ~131 words. No em dashes, curly quotes, AI vocab, dollar amounts, mechanism, or animal-throughout claims. Specific references ("Old Town Books", "whattoreadtoyourkids.com") verifiable from pipeline (NPR feature + her own blog). No verbatim repetition within draft. Preview URL present. |
| 2026-05-16 | lhl-diverse-representation-v1 | R2 | passed | Batch: @heritagemomblog. All checklist items pass. Opener: "Jeff here from Little Hero Labs." (variant 2). ~145 words. No em dashes, curly quotes, AI vocab, dollar amounts, mechanism. Default comparison framing (no Wonderbly named). "mirrors and windows" reference verifiable from heritagemom.com and media kit. No animal-throughout claim. Preview URL present. Cosmetic note: last body sentence slightly long -- Jeff may simplify on edit. Not a downgrade. |
| 2026-05-16 | lhl-diverse-representation-v1 | R2 | passed | Batch: @babylibrarians. All checklist items pass. Opener: "I'm Jeff at Little Hero Labs." (variant 3). ~135 words. No em dashes, curly quotes, AI vocab, dollar amounts, mechanism. Varied angle body ("Your child's look, hometown, and pronouns" vs standard list). "babylibrarians.com" reference verifiable from her own site. No animal-throughout claim. Preview URL present. |
| 2026-05-16 | lhl-diverse-representation-v1 | R2 | passed | Batch: @whitesugarbrownsugar. All checklist items pass. Opener: "I'm Jeff from Little Hero Labs." (variant 4). ~140 words. No em dashes, curly quotes, AI vocab, dollar amounts, mechanism. "transracial adoptive families you write for" verifiable from her blog bio and book content. No animal-throughout claim. Preview URL present. |
| 2026-05-16 | lhl-diverse-representation-v1 | R2 | passed | Batch: @growingupguptas. All checklist items pass. Opener: "Jeff here, founder of Little Hero Labs." (variant 5). ~135 words. No em dashes, curly quotes, AI vocab, dollar amounts, mechanism. Angle body varied: "let parents choose from" (not "pick from"). "multicultural family author" verifiable from "I Love Masala Me" book. No animal-throughout claim. Preview URL present. |
| 2026-05-16 | lhl-diverse-representation-v1 | R2 | passed | Batch: @biculturalmama. All checklist items pass. Opener: "I'm Jeff. I run Little Hero Labs." (variant 6 -- two-sentence form). ~130 words. No em dashes, curly quotes, AI vocab, dollar amounts, mechanism. Angle body varied: "Most personalized books pick from" (no "let parents"). "Asian-American and bicultural families" characterization verifiable from biculturalmama.com mission. No animal-throughout claim. Preview URL present. |
| 2026-05-16 | lhl-literacy-educator-v1 | R2 | passed_with_notes | Batch: @colbysharp. All copy checklist items pass. Opener: "I'm Jeff, and I run Little Hero Labs." (variant 7). ~135 words. No em dashes, curly quotes, AI vocab, dollar amounts, mechanism. "Nerdy Book Club" reference verifiable (co-founder). "picture-book conversations" characterization fair and public. No animal-throughout claim. Preview URL present. BUSINESS NOTE (not a copy flag): primary audience is K-5 educators with 5th-grade skew; LHL 0-7 sweet spot has partial overlap via picture-book read-alouds. Jeff should confirm this fit before approving. Cosmetic: 3-item themes list ("emotional intelligence, courage, and quiet self-discovery") -- informational not performative; trimming optional. Copy advances to copy-reviewed. |
| 2026-05-16 | — | R2 (humanizer) | passed | Batch summary (2026-05-16): No em dashes, no AI vocabulary, no curly quotes detected across all 7 drafts. 7 distinct opener forms used (no exact repetition). "Most personalized books let parents pick from pre-made characters." appears in drafts 2/3/4 (with word-level variations in 5/6) -- canonical diverse-representation angle framing, intentional template pattern, NOT flagged per established precedent ("near-identical by design"). Offer paragraph near-identical by design (template). Within-draft repetition: none. No drafts downgraded post-humanizer. 2 cosmetic notes surfaced (not downgrades): @heritagemomblog last-sentence length; @colbysharp 3-item list. All 7 drafts remain copy-reviewed. |

---

| 2026-05-18 | lhl-literacy-educator-v1 | R2 | passed | Batch: @little.farm.montessori. All checklist items pass. Opener: "I'm Jeff, founder of Little Hero Labs." (variant 1). ~165 words. No em dashes, curly quotes, AI vocab, dollar amounts, mechanism, or animal-throughout claims. Angle body references "Little Farm" and "inner direction" -- both verifiable from pipeline (Director of Little Farm Nature School). No verbatim repetition within draft. Preview URL present. Minor cosmetic note: 3-item theme list ("quiet self-discovery, courage, and finding confidence from the inside out") -- informational, not performative; not a downgrade. Additional note: email from contact page search snippet; Jeff should verify address directly before sending. |
| 2026-05-18 | lhl-literacy-educator-v1 | R2 | passed | Batch: @outsidethetoybox. All checklist items pass. Opener: "Jeff here from Little Hero Labs." (variant 2 -- varied from @little.farm.montessori). ~165 words. No em dashes, curly quotes, AI vocab, dollar amounts, mechanism, or animal-throughout claims. Angle body references "fifteen years in Montessori and Reggio Emilia classrooms" -- verifiable from pipeline notes (15 yrs Montessori + Reggio Emilia). No verbatim repetition within draft. Preview URL present. |
| 2026-05-18 | — | R2 (humanizer) | passed | Batch summary (2026-05-18): No em dashes, no AI vocabulary, no curly quotes detected across both drafts. 2 distinct opener forms used ("I'm Jeff, founder of..." / "Jeff here from..."). Product description varied at word level ("becomes the hero" / "is the hero"). Offer paragraph near-identical by design (intentional template). Cross-batch middle-paragraph repetition: none. One cosmetic flag carried forward on @little.farm.montessori (3-item list, already in copy_review_notes). One additional cosmetic note from humanizer on @little.farm.montessori: "respecting each child's own inner direction" slightly abstract -- Jeff may tighten on edit; not a downgrade. Both drafts remain copy-reviewed. |

---

| 2026-05-19 | lhl-librarian-kidlit-curator-v1 | R2 | passed | Batch: moonbow (Taylor Sterling / MOONBOW). All checklist items pass. Opener: "I'm Jeff, founder of Little Hero Labs." (variant 1). ~139 words (within 100-180 ceiling). No em dashes, curly quotes, AI vocabulary, dollar amounts, mechanism, or animal-throughout claims. Angle body ("MOONBOW covers picture books that hold up as art. This one has watercolor-style illustration and a quiet emotional arc for ages 0-7.") verifiable from pipeline (art-forward picture-book curator; Substack Featured Publication 2023). No verbatim repetition within draft. Offer paragraph follows template. Preview URL present (full https://www.littleherolabs.com/preview). Contact: moonbow.books@substack.com (MOONBOW-specific address per her own taylor-sterling.com /moonbow page). |
| 2026-05-19 | lhl-librarian-kidlit-curator-v1 | R2 (humanizer) | passed | Batch summary (2026-05-19): No em dashes, no AI vocabulary, no curly quotes detected. 1 draft in batch. 4 distinct sentence openers ("I'm Jeff...", "MOONBOW covers...", "We're running...", "You can see..."). Sentence length varies throughout all paragraphs. Cosmetic note: "a natural fit for your readers" is a slightly generic phrase but not on the AI-vocabulary list; surrounding paragraph specificity earns it. No downgrade. Draft remains copy-reviewed. |

---

| 2026-05-20 | lhl-gift-curator-v1 | R2 | passed_with_notes | Batch: @jesskeys_. All checklist items pass. Opener: "Jeff here from Little Hero Labs." (varied from recent batches). ~157 words (within 100-180 ceiling). No em dashes, curly quotes, AI vocabulary, dollar amounts, mechanism, or animal-throughout claims. Angle body ("Your Baby and Kids gift guide feels like a natural fit. A personalized hero book is the kind of gift a new parent genuinely doesn't see coming, and it ships via Amazon Custom.") verifiable from pipeline (recurring Baby and Kids gift guide on jesskeys.com; new mom). No verbatim repetition within draft. Offer paragraph follows template. Preview URL present. NOTE: "for your daughter" references pipeline note (R1 sourced from public content: new mom). Jeff should verify this detail is from her own public posts before sending. |
| 2026-05-20 | lhl-gift-curator-v1 | R2 (humanizer) | passed | Batch summary (2026-05-20): No em dashes, no AI vocabulary, no curly quotes detected. 1 draft in batch. 11 distinct sentence openers (none repeated). Sentence length varies throughout (6, 20, 21, 13, 11, 22, 7, 9, 15, 13, 11 words). No negative parallelism, no rule-of-three, no copula avoidance, no sycophantic language. No AI-tell patterns detected. Draft remains copy-reviewed. |

---

| 2026-05-21 | lhl-literacy-educator-v1 | R2 | passed_with_notes | Batch: @generationmindful. All checklist items pass. Opener: "I'm Jeff, founder of Little Hero Labs." (variant 1). ~145 words. No em dashes, curly quotes, AI vocab, dollar amounts, mechanism, or animal-throughout claims. Angle body ("The emotional-intelligence theme runs through the whole story. Your audience already cares about helping kids build those same skills.") verifiable from pipeline (SEL/EI brand, Affiliates program, parent-educator audience). No verbatim repetition within draft. Preview URL present. BUSINESS NOTES (not copy flags): (1) support@genmindful.com is contact-page email; may be general inbox. Jeff should verify routing before sending. (2) Generation Mindful sells its own SEL products; body frames LHL as complementary keepsake. Jeff should confirm framing is acceptable. |
| 2026-05-21 | lhl-literacy-educator-v1 | R2 | passed_with_notes | Batch: @highloveparenting. All checklist items pass. Opener: "Jeff here from Little Hero Labs." (variant 2). ~130 words. No em dashes, curly quotes, AI vocab, dollar amounts, mechanism, or animal-throughout claims. Angle body ("Your work centers on helping parents build emotionally safe connections with their kids. That same inner-voice development is what this story is built around.") verifiable from pipeline (conscious/EI parenting coach; CNBC contributor). No verbatim repetition within draft. Preview URL present. BUSINESS NOTE (not copy flag): Email from LinkedIn aggregation (reem@highloveparenting.com); Jeff should verify before sending. |
| 2026-05-21 | lhl-literacy-educator-v1 | R2 | passed_with_notes | Batch: @copingskillsforkids. All checklist items pass. Opener: "I'm Jeff at Little Hero Labs." (variant 3). ~148 words. No em dashes, curly quotes, AI vocab, dollar amounts, mechanism, or animal-throughout claims. Angle body ("Coping-skills work and inner-voice stories sit close together. The emotional arc of this book is a child learning to trust their own feelings...") verifiable from pipeline (LMHC + SEL/coping-skills for kids). No verbatim repetition within draft. Preview URL present. NOTES for Jeff (not copy flags): (1) Score 13/20, viable tier; included because batch is light. (2) Email from public site aggregation; verify before sending. (3) TPT store suggests educator/counselor audience skew; pitch targets parent-buyer segment. Jeff should confirm fit. |
| 2026-05-21 | — | R2 (humanizer) | passed | Batch summary (2026-05-21): No em dashes, no AI vocabulary, no curly quotes detected across all 3 drafts. 3 distinct opener forms ("I'm Jeff, founder of..." / "Jeff here from..." / "I'm Jeff at..."). Product description line near-identical by design (template). Offer paragraph near-identical by design (template). Middle paragraphs all distinct; no cross-draft repetition. Sentence length varies within each draft. No negative parallelism, no rule-of-three flourishes, no copula avoidance, no sycophantic openers. No within-draft animal-reveal repetition (animal not mentioned in any draft). Cosmetic note on @generationmindful: one long sentence in middle paragraph ("A personalized keepsake that puts the child at the center...") -- not a downgrade; Jeff may tighten on edit. All 3 drafts remain copy-reviewed. |

---

| 2026-05-23 | lhl-diverse-representation-v1 | R2 | passed | Batch: @vivalamami. All checklist items pass. Opener: "Jeff here from Little Hero Labs." (default founder-direct). ~150 words (within 100-180 ceiling). No em dashes, curly quotes, AI vocabulary, dollar amounts, mechanism, or animal-throughout claims. Diverse-representation angle body: default comparison framing ("Most personalized books let parents pick from pre-made characters. We let them create their own.") -- not B1 Wonderbly-named variant. "bicultural families who haven't always seen their kids reflected in personalized books" verifiable from public brand identity (Viva la Mami mission). Preview URL present. |
| 2026-05-23 | lhl-diverse-representation-v1 | R2 (humanizer) | passed | Batch summary (2026-05-23): No em dashes, no AI vocabulary, no curly quotes detected. 13 distinct sentence openers (Jeff, We, Our, Most, We, Hair, Every, That, We're, Would, I'd, If, You). Three "We"-starting sentences across separate paragraphs -- intentional template structure, not AI tell. Sentence length range: 6-22 words, good variation. No negative parallelism, no rule-of-three, no corporate rhythm. "personalized" appears 3x -- intentional brand language, not flagged. No within-draft animal-reveal repetition (animal not mentioned). Draft remains copy-reviewed. |

---

## Iteration log

| Date | Change |
|---|---|
| 2026-05-01 | Schema created. R2 deployment will populate the review log starting tomorrow. |
