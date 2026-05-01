# Step 0 — Rebrand Notes (single source of truth for Steps 2–4)

This document is the authoritative input for refining the LHL outreach skills. Treat it as the source-of-truth diff between the original `lhl-*` skills on Desktop and what we want in `.claude/skills/lhl-*`.

---

## Brand Truth

| Field | Truth | Source |
|---|---|---|
| Company name | **Little Hero Labs** (LHL) | front-end (Header, Footer, all page titles, Layout description) |
| Tagline | **"Every child is the hero of their own story"** | `README.md`, `.cursorrules`. Layout description on site uses a softer variant ("become the hero of your own story"); use the README version for outreach. |
| Hero copy on site (current) | "Personalized Children's Books for Every Little Hero / Custom storybooks where your child becomes the star of the adventure" | `frontend/src/pages/index.astro` |
| Founder | Jeff, based in Grass Valley, CA | existing skill |
| Persona | **None.** Outgoing voice = "Jeff, founder of Little Hero Labs." Drop "Echo" everywhere. | Jeff confirmed |
| Domain | **littleherolabs.com** (live) | `frontend/src/layouts/Layout.astro`, every page header |
| Voice | Warm, wonder-filled, intentional, founder-direct. Plain language, not press-release. | site copy + Jeff |
| Visual identity | Warm-watercolor illustrations with character overlays. | `README.md`, `.cursorrules` |

### Project naming convention

The repo folder is `little-hero-books` (legacy). The actual company is **Little Hero Labs**, so all outreach skills, state directories, and refs use **`lhl`** prefix:
- `.claude/skills/lhl-creator-pipeline/`
- `.claude/skills/lhl-campaign-ops/`
- `outreach-data/lhl/` (dynamic state, gitignored)
- `docs/marketing/outreach/lhl/` (static playbook, committed)

---

## Product Truth — "Finding Our Inner Voice"

| Field | Truth |
|---|---|
| Story name | **"Finding Our Inner Voice"** *(deprecated names: "Adventure Compass", "[Your Child's] Inner Voice")* |
| Story arc | A magical journey through enchanted locations where the child discovers their inner strength. Themes: courage, friendship, self-discovery, emotional intelligence. |
| Format | 8.5" × 8.5" softcover, 16 pages (14 interior + covers) |
| Printer | Lulu print network |
| Production time | Typical 3–5 business days; final estimate at checkout |
| Ages | **0–7** |
| Promo price | $24.99 (Amazon, current) |
| **Launch price** | **$29.99** (locked — see recommendation below) |
| Sold via | Amazon Custom (live, ASIN B0G4QPLWKH) + littleherolabs.com (D2C, launching) |
| Amazon URL | https://www.amazon.com/dp/B0G4QPLWKH |

### Outreach-friendly description (use in pitch templates)
> A beautifully illustrated journey where your child meets friendly creatures, climbs mountains, flies among the clouds, and explores magical seas — finding their own inner voice along the way.

### Customization fields — **11 total** (was 13; "favorite food" and "occasion" removed)

**Required (7):**
1. Child's name (1–20 chars)
2. Age (0–7)
3. Hair style (12 options: afro, bun, curly-long, curly-medium, curly-short, pigtails, pom-poms, ponytail, side-part, straight-long, straight-medium, straight-short)
4. Hair color (8 options: blonde, strawberry-blonde, light-brown, medium-brown, dark-brown, auburn, black, red)
5. Skin tone (5 customer-facing values: light, medium, tan, olive, dark)
6. Favorite color (9: red, orange, yellow, green, blue, pink, purple, brown, black)
7. Animal guide (8: dog, cat, owl, lion, tiger, penguin, t-rex, unicorn)

**Optional (4):**
8. Clothing style (t-shirt and shorts / dress)
9. Hometown (free text; default "Adventure City")
10. Dedication (free text, ≤200 chars)
11. Pronouns (she/her, he/him, they/them; default they/them)

**Outreach-friendly version:** *"Choose your child's name, age, look (hair style, hair color, skin tone, favorite color), animal sidekick, hometown, dedication, and clothing — every detail shows up across the art and story."*

---

## Differentiation vs. Wonderbly (and others)

This is the genuine competitive edge. Bake this into pitch templates:

> **Wonderbly lets parents pick from pre-made characters. We let them create their own.** Your child's actual hair style, skin tone, color preference, and animal sidekick — that's the hero on every page. And soon: a growing library of stories, with the option to bring your child's already-created character into each new book.

Use this language (or shorter variants) when explaining what makes LHL distinct in pitches. It answers the implicit "why not just Wonderbly?" question without naming the competitor unless the creator brings it up.

---

## Pricing — locked at $29.99

Reasoning kept on file in case it ever needs revisiting:
- $5 jump from $24.99 promo reads as "promo ending"; $8 (+32%) reads as "they raised prices"
- "Under $30" psychological tier matters for Amazon impulse purchases
- Premium kids' gifts cluster $25–$35; $32.99 starts feeling expensive for an 8.5×8.5 softcover
- ~25% under Wonderbly's ~$39.99 — keeps the value-comparison clean
- A future raise to $32.99 is easier to justify than a future drop

**Action item for Jeff:** Update Amazon listing pricing to $29.99 before any outreach goes live. Influencers will look up the price and we don't want them quoting $24.99 to their audience or seeing a number that's about to change.

---

## Affiliate / Attribution Recommendation

Jeff asked what to do for an affiliate program. Recommendation:

**For now (Cycle 1–2): use the cheap built-in tools, no formal affiliate platform.**

**Mechanism per creator:**
1. **Amazon Attribution link** (free for brand-registered Amazon sellers) — unique URL per creator that tracks clicks → orders. Lives in the Amazon Brand Registry → Attribution dashboard. Generate one per partnership.
2. **Custom discount code** (free, via Amazon Promo or Stripe coupon) — `JEFF15`, `MARYBETH10`, etc. Gives buyer a 10% discount and tells us which creator drove the sale. Works on Amazon (Promo codes) and on the D2C site (when live, via Stripe).
3. **Compensation paid as flat fee + bonus tiers** based on the existing skill's structure (10–20% rev share for nano, $150–500 flat fee for micro), tracked via the Attribution + code data. Pay via PayPal or Stripe transfer.

**Skip these for now:**
- Formal affiliate platforms (Refersion, Impact, ShareASale, PartnerStack) — overkill until you have 50+ active partners or >$50K/month from affiliates. Costs $50–500/month + setup.
- Amazon Associates as the *primary* affiliate channel — Associates pays ~3-5% sitewide which is too thin for what creators expect; Attribution + custom codes are better for a brand-driven program.

**About the existing `bright-gift-20` Associates tag:** Note for Jeff to confirm — looks like a partner blog's or your personal Amazon Associates tag. Don't use it as the influencer-link tag (it'd commingle creator-driven sales with affiliate revenue). Keep it separate; generate dedicated Attribution links for outreach.

---

## Fulfillment Default

Confirmed by Jeff: **"Have creator order via Amazon and leave a positive review."**

This is smart — single action drives ranking + review count + sale + Attribution data simultaneously. Skills should default to:
1. Send creator their unique Amazon Attribution link
2. Ask them to use it to order, personalize at checkout, and leave a review when they receive the book
3. Provide a small Amazon promo code for the book itself or for the gifted compensation

The existing skill's "Option B — Creator orders via Amazon" path is the canonical flow. The "Option A — Ship directly" path stays as a fallback only.

---

## Asset Phase (NEW — to be added to plan)

**Jeff's input:** "We have a number of images, but we could use more assets, or a video. Let's brainstorm together."

**Scope to brainstorm in the asset phase:**

| Asset | Why it matters | Likely effort |
|---|---|---|
| **Sample preview** (4–6 page PDF or digital flipbook of an example personalized book) | Influencers won't say yes without seeing the actual product. This is the highest-leverage missing asset. | Medium — render a sample with placeholder name (e.g., "Lily") + share as PDF |
| **30-second product video** | "Type their name → watch the book appear → flip pages → kid's reaction." Universal asset for IG Reels, TikTok, podcast show notes, press kit. | Medium-high — needs filming or screen recording |
| **Press kit one-pager** (PDF) | For journalists/podcast hosts: brand story, product specs, founder quote, 3–5 hi-res images, contact. Distinguishes you from creators who just send a DM. | Low-medium |
| **Hi-res lifestyle photos** (parent + child reading book) | Powers IG carousel posts, press, gift-guide submissions. | Medium — needs a shoot or rights to existing |
| **Inside-spread mockups** | 3–4 hero shots of the watercolor pages with name visible. May already exist in `assets/` or `frontend/public/`. | Low — likely already have, just need pulled into a press-friendly format |
| **Personalization-process screen recording** | 15-second screen capture of the customize flow. Shows the "wow" moment. | Low — record once, reuse forever |

**Recommendation:** Asset phase fits between Step 7 (tone co-creation) and Step 8 (real outreach dry-run). We can draft all the templates and skills before assets exist (using a placeholder URL); we just can't *send* a real outreach email/DM without at least the sample preview ready.

**Phase output:** `docs/marketing/outreach/lhl/playbook/asset-inventory.md` with a checklist of what we have, what we're creating, and what's deferred.

---

## Stale references found across the repo

Jeff approved cleanup. These need updating:

| File | Issue | Fix | Risk |
|---|---|---|---|
| `docs/new-planning/Customization_Source_of_Truth.md` | Lists ages 3–8; includes "Favorite Food" + "Occasion" fields | Change ages to 0–7; remove favorite_food + occasion sections + their references | Low — pure doc, but skill code may still reference these fields. Verify no live code reads `occasion` / `favorite_food` before assuming safe. |
| `.cursorrules` | Says ages 3–7; says "Adventure Compass" | Change ages to 0–7; replace "Adventure Compass" → "Finding Our Inner Voice" | Low — Cursor IDE config |
| `README.md` | Says "Adventure Compass" as story name; says ages 3–7; says price $19.99–$29.99 | Change to "Finding Our Inner Voice"; ages 0–7; $29.99 launch price | Low — root README, doc only |
| `amazon-affiliate-link.txt` | Header says "Little Hero Labs Book" | Change to "Little Hero Labs — Finding Our Inner Voice" | Trivial |
| `frontend/public/site.webmanifest` | `"name": "Little Hero Books"` | Change to `"name": "Little Hero Labs"` | Low — affects PWA display name (visible to users who add the site to home screen) |
| `frontend/README.md` | References "Little Hero Books" | Change to "Little Hero Labs" | Trivial |
| ~~`frontend/src/pages/index.astro` line 78~~ | ~~Story name shown as `[Your Child's] Inner Voice`~~ | **Not stale — intentional D2C dynamic personalization placeholder.** Gets replaced at order time with the customer's child's name (e.g., "Emma's Inner Voice"). Leave alone. | n/a |

**Out of scope for cleanup but worth flagging:**
- `docs/new-planning/marketing/lhb_one_pager_website_copy_deck_launch_v_1.md` — speculative D2C site copy using wrong company name "Little Hero Books." Either delete (likely abandoned) or rename + update to LHL.
- `docs/new-planning/marketing/lhb_amazon_listing_title_bullets_a_image_captions_launch_v_1.md` — same naming issue, plus says "20+ personalization options" and uses deprecated fields.
- The customize page in front-end may still have form fields for `favorite_food` / `occasion` if those features were removed only from the SoT doc, not the form/database. Out of scope for outreach work — flag as a separate task.

---

## Diff: Desktop `lhl-*` skills → `.claude/skills/lhl-*` skills

When copying SKILL.md files from `/Users/jeff/Desktop/Desktop - Jeff's MacBook Pro (2)/skills/lhl-influencer-outreach/` and `/lhl-campaign-ops/`, apply these changes.

### Global replace_all
| Find | Replace |
|---|---|
| `Little Hero Labs` | (keep — already correct!) |
| `LHL` | (keep — already correct!) |
| `workspace/outreach/lhl/` | `outreach-data/lhl/` |
| `claude-sonnet-4-5` | `claude-sonnet-4-6` |
| `Adventure Compass` | `Finding Our Inner Voice` |
| `Your Child's Inner Voice` | `Finding Our Inner Voice` |

### Persona removal
- Drop every reference to `Echo`. Where the existing skill says "Echo responds to these triggers," rewrite to "The skill responds to these triggers" or describe behavior directly.
- Outgoing email/DM signature is **"Jeff" / "Jeff at Little Hero Labs"** — never an AI persona.

### Frontmatter updates (both skills)
- `requires.tools`: drop `gmail`. Keep `browser`. Cycle 1 is draft-only; drafts written to `outreach-data/lhl/drafts/`.

### Specific content fixes in `lhl-influencer-outreach` SKILL.md

1. **Brand mission line ~36**: change `"Every child deserves to see themselves as the hero."` → `"Every child is the hero of their own story."`
2. **Product description (lines ~57–69)**: rename theme from "Your Child's Inner Voice" to **"Finding Our Inner Voice"**. Update story description to use the outreach-friendly version above. Add the Wonderbly differentiation paragraph.
3. **Customization list (lines ~70–74)**: REPLACE the `[UPDATE]` block with the 11-field list above. Use the outreach-friendly summary in pitch templates, full list in skill body.
4. **Age range (line ~76)**: `2–8. Sweet spot: 3–6.` → `**0–7**.`
5. **Format / production (lines ~79–82)**: fill in:
   - Format: `8.5" × 8.5" softcover, 16 pages`
   - Production: `Typical 3–5 business days; final estimate at checkout`
6. **Pricing (line ~89)**: `$29.99–$32.99` → `$29.99 launch (sometimes promoted at $24.99). Wonderbly is at ~$39.99.`
7. **Shipping cost (line ~90)**: resolved by fulfillment default = "creator orders via Amazon." Just delete the TODO; reference Amazon checkout.
8. **Affiliate program section (line ~96)**: REPLACE the `[UPDATE]` block with the recommendation above (Amazon Attribution + custom codes; no formal platform; flat fee + bonus tiers per existing skill structure).
9. **Media assets (line ~108)**: `<!-- TODO(jeff): sample preview asset URL — to be created in Asset Phase -->`
10. **Amazon Custom listing (line ~42)**: `[UPDATE: ASIN or listing URL when live]` → `Live. ASIN B0G4QPLWKH. URL: https://www.amazon.com/dp/B0G4QPLWKH. Pricing update to $29.99 pending before outreach goes live.`
11. **Instagram + TikTok handles (lines ~44–45)**: keep `<!-- TODO(jeff): Instagram handle -->` and `<!-- TODO(jeff): TikTok handle (or skip TikTok DM channel) -->`
12. **"Echo" persona prompt for missing-info (line ~134)**: rewrite without Echo. Make it natural Claude voice.
13. **Hooks section (lines ~582–592)**:
   - REMOVE: `"It's like Wonderbly but half the price and you can actually see the illustrations."` (deprecated)
   - ADD: `"The first book where they're the actual hero — not a name pasted onto a stock character."`
   - ADD: `"Their hair, their skin tone, their favorite animal — they are literally the hero on every page."`
   - ADD: `"A keepsake about *their* inner voice — built around them, not adapted to them."`
14. **Pitch templates**: move all templates from inline blocks into separate files under `docs/marketing/outreach/lhl/templates/{dm-instagram,dm-tiktok,email-standard,follow-up}.md`. Skill body references them by relative path.
15. **90-day frequency cap** — Add new section:
    > Before drafting outreach for any creator, check `pipeline.md` for existing entries. If the creator has any status of `sent`, `follow-up-sent`, `responded`, `negotiating`, or `confirmed` within the last 90 days, refuse to draft and surface the existing entry. Do not re-pitch within 90 days even after a polite decline.
16. **Reference CLAUDE.md** — Replace the entire "Brand & Product Reference" section (lines ~33–127) with: "Brand and product facts live in repo-root [CLAUDE.md](../../../../CLAUDE.md). Read it at session start." Skill keeps affiliate / Amazon Attribution / outreach-specific notes inline.

### Specific content fixes in `lhl-campaign-ops` SKILL.md

1. Apply all global replace_all rules above.
2. Drop `gmail` from `requires.tools`.
3. **Production + shipping language**: replace placeholder with `"Typical 3–5 business days production; final estimate shows at checkout."`
4. **Brief template (line ~95)**: tweak fulfillment language to default to "creator orders via Amazon" path; mention positive review request.
5. Reference CLAUDE.md for brand basics; remove duplicated brand sections.
6. Drop Echo references; sign as Jeff.

---

## Brand-data gaps remaining for Jeff

After all the above, only these 3 stay as `<!-- TODO(jeff): X -->` in the skills:

1. **Instagram handle**
2. **TikTok handle** (or "skip TikTok DM channel" decision)
3. **`bright-gift-20` Amazon Associates tag ownership** — your personal tag, partner blog's, or other? (Doesn't block outreach but worth knowing for clean Attribution separation.)

Everything else is resolved.

---

## Vendoring decisions (Step 1 input)

| Skill | Source | Decision |
|---|---|---|
| `humanizer` | `~/Desktop/.../skills/humanizer/` | **Vendor as `.claude/skills/humanizer/`** — generic, low complexity, polishes outreach copy |
| `new-handoff` | `~/.codex/skills/new-handoff/` | **Vendor as `.claude/skills/new-handoff/`** — primary use is context-overflow handoff to a new chat (per Jeff). Adapt: drop "Codex" mentions; keep generic |
| `web-search-plus` | `~/Desktop/.../skills/web-search-plus/` | **Defer to Cycle 2** — has scripts + API-key config; built-in `WebSearch` + Chrome MCP cover Cycle 1 |
| `phased-heartbeat` | `~/.codex/skills/phased-heartbeat/` | **Defer to Cycle 2 or 3** — high-value pattern, heavy Codex deps; adapt when scheduled routines kick in |
| `heartbeat-full-permissions` | `~/.codex/skills/heartbeat-full-permissions/` | **Skip** — Codex-config-specific |

**Non-destructive copy:** `cp -R` from source to `.claude/skills/`. Originals remain at Desktop and `~/.codex/skills/`. All adaptations on Claude Code copies only.

---

## Step 0 deliverable: this file. ✅

## Updated cycle-1 step ordering

1. Vendor `humanizer` + `new-handoff`
2. Write repo-root `CLAUDE.md`
3. **Stale-reference cleanup** (NEW): SoT, .cursorrules, README, amazon-affiliate-link.txt, frontend/public/site.webmanifest, frontend/README.md. Skip frontend/index.astro display-copy change (production frontend; flag separately).
4. Refine + copy `lhl-creator-pipeline` and `lhl-campaign-ops` into `.claude/skills/`
5. Fill brand data + reference CLAUDE.md from skills
6. Create state + asset directories; update `.gitignore`
7. Seed `do-not-contact.md` + bake in 90-day frequency cap
8. Tone co-creation phase (3 hypothetical creator personas)
9. **Asset phase** (NEW): brainstorm + create minimum viable asset kit
10. End-to-end dry run with one real creator
