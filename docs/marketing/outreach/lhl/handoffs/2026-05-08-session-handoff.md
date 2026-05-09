# Session Handoff: 2026-05-08

> Use this to bring a fresh Claude session up to speed. Read [CLAUDE.md](../../../../../CLAUDE.md) first for brand truth, then this doc for current state.

---

## Repo state

- **Branch:** `main` at `1303bef` (this handoff doc, sitting on top of merge `aca83a8`). Pushed to `origin/main`.
- **Just merged:** `claude/nervous-bell-52aef5` (12 commits covering IG launch + Wave 2 outreach + Amazon listing refresh). Branch deleted locally; remote tracker still exists at `origin/claude/nervous-bell-52aef5` and can be deleted on GitHub when convenient.
- **Active worktrees:** main (`/Users/jeff/Projects/little-hero-books`) + `pedantic-yalow-56e081` (the previous session's). The two `/private/tmp/lhb-admin-*` worktrees are prunable detached-HEAD scratch spaces from earlier work. Safe to `git worktree prune` if you want to tidy.
- **Working tree:** clean. The only untracked path is `.claude/worktrees/` (intentional, gitignored).

---

## What just shipped

### Instagram launch package (committed, ready to post)
- 9 logical posts in `docs/marketing/instagram-launch/posts/` (12 image files, since post 6 is a 3-slide carousel with parts 6a/6b/6c, and post 7 has an alt version). Captions + hashtags are NOT on disk yet; per [the launch README](../../../instagram-launch/README.md), they live in chat history and need to be pasted at publish time. Worth committing them next session.
- Generator script: `scripts/instagram-launch/generate-posts.py`.
- Brand-truth corrections applied: 17 hair styles (was 12), 5 skin tones renamed (light/medium/tan/medium-dark/deep), removed all "3-5 business days" timeline claims.
- `CLAUDE.md` updated to match.

### Wave 2 outreach (sent, follow-ups auto-configured)
- 22 USA-only recipients sent via Mailmeteor on 2026-05-07 (`outreach-data/lhl/mailmeteor-batch-2026-05-07.csv`).
- Drafts: `outreach-data/lhl/drafts/2026-05-07-*.md`.
- Auto follow-up: 5-day "If no reply" configured at send time (Mailmeteor Premium).
- Wave 1 follow-ups: 12 manual Gmail replies sent 2026-05-07.
- All sends logged: `outreach-data/lhl/sent-log.md` (att-2026-05-07-001 through 034).

### Amazon listing refresh (assets ready, awaiting manual upload)
- Planning doc v2: `docs/new-planning/marketing/lhl_amazon_listing_title_bullets_a_image_captions_v_2.md`.
- 14 generated assets in `docs/marketing/amazon-listing-assets/`:
  - 7 listing images (2000×2000 JPG)
  - 7 A+ Content modules (1500×750 JPG)
- Re-runnable generator: `scripts/amazon-listing/build-listing-assets.py`.
- README with IG → Amazon source mapping: `docs/marketing/amazon-listing-assets/README.md`.

---

## Open / pending tasks

| # | Task | Where |
|---|---|---|
| 1 | Reply to Candace (Elizabeth Mundt's manager) re asking-rates with the dual-track gift-in-kind + rate request message | Gmail; thread logged in `outreach-data/lhl/responses.md` |
| 2 | Send gauge-interest message via Social Cat to **Summer Wilson Fox** (@summerdoingthings) | Social Cat platform; pipeline row pre-staged with NEXT note |
| 3 | Send gauge-interest message via Social Cat to **Cece Mendez** (@cecemendez_) | Social Cat platform; pipeline row pre-staged with NEXT note |
| 4 | Manually upload Amazon listing image assets to Seller Central (Phases 1-3) | Assets ready at `docs/marketing/amazon-listing-assets/` |
| 5 | When Elizabeth's rates come back, evaluate vs framework: $300-500 sweet spot, $400-600 with usage rights ask, $600+ pass | n/a |
| 6 | When Elizabeth confirms partnership, set up `ELIZABETH15` discount code in Amazon Promotions | Seller Central → Promotions |
| 7 | When funds available, file trademark (DIY USPTO ~$350 or IP Accelerator ~$1000 / 30-90 days) → unlocks Brand Registry → unlocks Amazon Attribution | n/a |
| 8 | Monitor Wave 2 auto-follow-ups (fire 5 days after initial send if no reply) | Mailmeteor dashboard |

---

## Live outreach state files (always read at session start)

| File | What it is |
|---|---|
| `outreach-data/lhl/pipeline.md` | Master record. Every creator researched. Current bottom: R1 educational/child-development discovery (10 creators 2026-05-07) + Summer Wilson Fox + Cece Mendez |
| `outreach-data/lhl/sent-log.md` | Every outbound send. 34 May 7 entries logged |
| `outreach-data/lhl/responses.md` | Replies + sentiment. Logged: 1 bounce, 1 decline (Haley Reid Tay via Shine Talent), 1 asking-rates (Elizabeth Mundt via Candace) |
| `outreach-data/lhl/do-not-contact.md` | 90-day cap list. Currently includes @haleyreidtay |
| `outreach-data/lhl/priority-queue.md` | Curated short-list for next sends |
| `outreach-data/lhl/campaign-2026-05-07-engagement.md` | Mailmeteor open/click/reply tracking for Wave 2 |

---

## Decisions + corrections to remember

These came up mid-session and are easy to re-mistake:

1. **0% Featured Offer is NORMAL for Amazon Custom.** Customizable products show "See all buying options" instead of a Buy Box. This is by design, not a bug. Don't flag it as "critical issue."
2. **9 five-star reviews already exist on Amazon.** Don't say "0 reviews."
3. **Don't suggest using Amazon Associates tags (e.g., LHL-ELIZABETH) on own seller products.** Self-referral is a ToS violation (account termination + clawback risk).
4. **Trademark is the blocker** for both Brand Registry and Amazon Attribution. User can't fund it right now → discount codes via Amazon Promotions are the current substitute. This works without Brand Registry.
5. **Mailmeteor follow-ups can only be configured at initial send time**, not retroactively. Wave 2 has them properly configured. Future waves: configure at send.
6. **`[Your Child's] Inner Voice`** is intentional D2C-site templating that personalizes at order time. Don't replace it. (Other deprecated names, "Adventure Compass" and "Your Child's Inner Voice" without brackets, are stale and should be removed if seen.)
7. **Customization fields (per CLAUDE.md):** 17 hair styles, 8 hair colors, 5 skin tones (light/medium/tan/medium-dark/deep), 9 favorite colors, 8 animal companions. Hometown default: "Adventure City." Pronouns default: they/them.

---

## Voice rules (the ones I keep forgetting)

- **No em dashes.** Use periods or commas. Bulk-replace if any sneak in.
- **No "Team Little Hero Labs."** Sign as "Jeff, founder of Little Hero Labs" or just "Jeff."
- **No persona names** (no "Echo," no AI-assistant signoffs).
- **No fabricated social proof / testimonials / sales numbers.** Use possibility framing: "For an audience like yours, this typically means..."
- **No competitor swipes.** Differentiate via what we do.
- **No corporate fluff:** "synergy," "leverage," "brand alignment," "partnership opportunity," "reach out."
- **Prices are external-facing.** Always check current Amazon listing before quoting. Launch $29.99, promo $24.99.
- **Hyperlinks:** always use full `https://` so they auto-link reliably (e.g., `https://www.instagram.com/littleherolabs`, `https://www.littleherolabs.com/preview`).

---

## Active platforms / tools

- **Amazon Custom listing:** ASIN [B0G4QPLWKH](https://www.amazon.com/dp/B0G4QPLWKH). 15 sessions / 30 days, 1 sale, 9 five-star reviews.
- **Mailmeteor:** Premium plan. Wave 2 campaign live; auto 5-day follow-ups armed.
- **Social Cat:** Boy Mom Adventure Creators campaign running. 2 acceptances logged (Summer + Cece). Both gifted-only.
- **Instagram:** [@littleherolabs](https://www.instagram.com/littleherolabs). 9-post launch grid drafted, ready to publish.
- **D2C site:** `littleherolabs.com` (launching). `/preview` is the press/preview surface referenced in outreach.

---

## How to start the next session cleanly

1. Open a new Claude session from `/Users/jeff/Projects/little-hero-books` (the main worktree).
2. Share this file as context: `docs/marketing/outreach/lhl/handoffs/2026-05-08-session-handoff.md`.
3. First check: `git status` (should be clean), `git log --oneline -5` (should show `aca83a8` merge at top).
4. Skim the open-tasks table above and pick where to resume.
