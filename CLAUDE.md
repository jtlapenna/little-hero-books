# Little Hero Labs — Claude context

This file gives any Claude session in this repo the brand truth and pointers it needs. Skills and tasks should read this first.

If something in this file conflicts with what you read in code, the *code* wins for technical questions and *this file* wins for brand/voice/pricing questions. When you spot a conflict, flag it.

---

## The company

- **Name:** Little Hero Labs (LHL). The repo folder is `little-hero-books` for legacy reasons — ignore that. The customer-facing brand is **Little Hero Labs**.
- **Tagline:** "Every child is the hero of their own story."
- **Domain:** [littleherolabs.com](https://www.littleherolabs.com)
- **Support:** hello@littleherolabs.com
- **Founder:** Jeff, Grass Valley, CA. LHL is a small intentional studio, not a corporation.

---

## The product — *Finding Our Inner Voice*

A fully personalized children's storybook. The child is the hero — name, look, animal sidekick, hometown, all woven into the story and art.

- **Story:** *Finding Our Inner Voice* — a journey through enchanted locations (forests, mountains, sky, sea, garden) where the child discovers their own inner strength. Themes: courage, friendship, self-discovery, emotional intelligence.
- **Format:** 8.5" × 8.5" softcover, 16 pages (14 interior + covers)
- **Printer:** Lulu print network
- **Production time:** Typical 3–5 business days; final estimate at checkout
- **Ages:** 0–7
- **Where sold:** Amazon Custom (live, ASIN [B0G4QPLWKH](https://www.amazon.com/dp/B0G4QPLWKH)) + littleherolabs.com (D2C, launching)
- **Launch price:** $29.99
- **Promo price (when on sale):** $24.99

**Deprecated names:** "Adventure Compass", "Your Child's Inner Voice." If you see them in repo files, they're stale.

**Not stale (intentional templating):** `[Your Child's] Inner Voice` is a D2C-site placeholder that gets dynamically personalized at order time (e.g., "Emma's Inner Voice"). Don't replace it.

---

## Customization (11 fields)

Source of truth: [docs/new-planning/Customization_Source_of_Truth.md](docs/new-planning/Customization_Source_of_Truth.md). Skills and outreach should reflect what's there.

**Required (7):** name, age (0–7), hair style (12 options), hair color (8), skin tone (5: light/medium/tan/olive/dark), favorite color (9), animal guide (8: dog/cat/owl/lion/tiger/penguin/t-rex/unicorn).

**Optional (4):** clothing style (t-shirt+shorts / dress), hometown (default "Adventure City"), dedication (≤200 chars), pronouns (she/he/they; default they/them).

**Removed/deprecated:** favorite_food, occasion. If you see them in old docs or code, treat as stale.

---

## How LHL is different from Wonderbly (and other personalized-book brands)

This is the genuine differentiator. Use it when explaining the product:

> Wonderbly lets parents pick from pre-made characters. We let them create their own. Your child's actual hair style, skin tone, and color preference are the hero on every page. Their favorite animal joins them for the final reveal. Soon: a growing library of stories with the option to bring your child's already-created character into each new book.

---

## Voice & tone

**Brand voice:** Warm, wonder-filled, intentional. Founder-direct, not corporate. Plain language, not press-release.

**Hard nos:**
- No persona names (no "Echo," no AI assistant signoff). Outgoing voice when ghostwriting for Jeff = "Jeff, founder of Little Hero Labs." Be a real person.
- No fabricated testimonials, social proof, or sales numbers. Use possibility framing if needed: "For an audience like yours, this typically means…" — not "Past partners have seen 3× sales."
- No competitor swipes. Differentiate via what *we* do, not what they don't.
- No corporate fluff ("synergy," "leverage," "brand alignment," "partnership opportunity," "reach out").
- No emoji decoration in headings/bullets. Sparingly OK in casual outreach where the recipient's tone invites it.
- No em-dash overuse. Ironic given Claude's defaults — keep them sparse.
- No quoting prices that aren't current. Always check current Amazon listing before naming a number externally.

---

## Outreach context

We're standing up an influencer/press cold-outreach system. State and skills live under `.claude/skills/lhl-*` (in progress). Detailed playbook + templates: [docs/marketing/outreach/lhl/](docs/marketing/outreach/lhl/).

When in doubt about an outreach decision, the rebrand notes are authoritative: [docs/marketing/outreach/lhl/playbook/rebrand-notes.md](docs/marketing/outreach/lhl/playbook/rebrand-notes.md).

**Affiliate / Attribution mechanism (current):**
- Per-creator Amazon Attribution links (free, brand registry)
- Custom discount codes per creator (`JEFF15`, `MARYBETH10` etc.)
- Compensation: flat fee + bonus tiers, paid via PayPal/Stripe
- No formal affiliate platform (Refersion, Impact, etc.) yet

**Fulfillment default:** Creator orders via Amazon using their Attribution link, then leaves a positive review when the book arrives. Drives ranking, reviews, sale, and Attribution data in one action.

**90-day cap:** Don't re-pitch a creator who's been contacted in the last 90 days, even after a polite decline.

---

## File-tree pointers

| Path | What it is |
|---|---|
| [docs/new-planning/Customization_Source_of_Truth.md](docs/new-planning/Customization_Source_of_Truth.md) | Authoritative customization fields + values |
| [docs/marketing/outreach/lhl/playbook/](docs/marketing/outreach/lhl/playbook/) | Outreach playbook (rebrand notes, asset inventory when created) |
| [docs/marketing/outreach/lhl/templates/](docs/marketing/outreach/lhl/templates/) | Pitch templates (DM, email, follow-up) |
| `outreach-data/lhl/` | Live outreach state — pipeline, sent log, drafts, do-not-contact (gitignored) |
| `.claude/skills/` | Project-scoped skills (humanizer, new-handoff, lhl-creator-pipeline, lhl-campaign-ops) |
| [docs/branding/](docs/branding/) | Logo, banner, social images |
| [.cursorrules](.cursorrules) | Code-development rules (separate concern from brand/outreach) |
| [README.md](README.md) | Engineering overview of the product |

---

## A note on this file

Keep CLAUDE.md slim and brand-truth-focused. Code rules belong in `.cursorrules` and other dev configs. Outreach playbook belongs under `docs/marketing/outreach/lhl/`. This file is the bridge between them — the one place every new agent should read at session start.
