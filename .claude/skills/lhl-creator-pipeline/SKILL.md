---
name: lhl-creator-pipeline
description: Find, score, pre-engage, and pitch parenting and family content creators for Little Hero Labs influencer partnerships. Handles the full creator prospecting pipeline from discovery through deal confirmation — including outreach drafts, Amazon Attribution link prep, approval workflow, follow-up tracking, and pipeline reporting. Activate when Jeff asks to research creators, send influencer outreach, run LHL prospecting, or manage the influencer pipeline.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - WebSearch
  - WebFetch
  - AskUserQuestion
---

# Little Hero Labs — Creator Pipeline Skill

Discovery → scoring → pre-engagement → pitch drafts → Jeff approval → send → follow-up → confirmation. When a creator confirms, hand off to `lhl-campaign-ops`.

This skill is **draft-only** in Cycle 1. Drafts land in `outreach-data/lhl/drafts/` for Jeff to send manually. Sending automation comes in a later cycle.

## Read at session start

1. Repo-root [`CLAUDE.md`](../../../CLAUDE.md) — brand, product, voice, hard nos
2. [`docs/marketing/outreach/lhl/playbook/rebrand-notes.md`](../../../docs/marketing/outreach/lhl/playbook/rebrand-notes.md) — outreach-specific decisions and brand-data gaps
3. [`outreach-data/lhl/pipeline.md`](../../../outreach-data/lhl/pipeline.md) — current pipeline state, do not duplicate or re-pitch
4. [`outreach-data/lhl/do-not-contact.md`](../../../outreach-data/lhl/do-not-contact.md) — exclusions

Use **`claude-sonnet-4-6`** for this skill. The work — assessing audience quality, evaluating aesthetic fit, detecting authentic vs transactional tone, writing pitches that feel personal — needs nuance.

---

## Memory files (single source of truth)

All pipeline data lives under `outreach-data/lhl/` (gitignored — outside version control):

```
outreach-data/lhl/
├── pipeline.md          — every creator researched
├── sent-log.md          — every outreach message sent
├── responses.md         — every reply received, sentiment, next step
├── do-not-contact.md    — explicit exclusions + creators who declined
└── drafts/
    └── YYYY-MM-DD-[handle].md
```

### `pipeline.md` schema

| Handle | Platform | Followers | Avg Views | Niche | Fit Score | Tech Posture | Pre-Engaged | Contact Method | Attribution Link | Offer Type | Status | Last Activity | Notes |

**Status values:** `researched` → `scored` → `pre-engaged` → `drafted` → `sent` → `follow-up-sent` → `responded` → `negotiating` → `confirmed` → `declined` → `no-response` → `do-not-contact`

Never delete pipeline rows. Update status. The history matters for the 90-day frequency cap.

---

## 90-day frequency cap (enforce always)

Before drafting outreach for any creator, scan `pipeline.md` for an existing entry. If the creator has any status of `sent`, `follow-up-sent`, `responded`, `negotiating`, or `confirmed` within the last 90 days:

1. **Refuse to draft.** Surface the existing entry to Jeff.
2. Show last activity date and current status.
3. Wait for Jeff to explicitly override before drafting again.

The cap also applies after a polite decline. A "no" today doesn't become a re-pitch in 30 days. Treat 90 days as a floor, not a ceiling.

---

## Campaign baselines (first 30 days)

- 20–30 creators contacted per week
- 5–10 partnerships confirmed in first 30 days
- 10–20 posts published in first month
- 3–5 "winner" creatives identified for amplification (handoff to `lhl-campaign-ops`)
- Email-capture lift from influencer traffic
- Amazon Attribution clicks/orders tracked per creator

---

## Creator tiers

| Tier | Followers | Priority | Notes |
|---|---|---|---|
| Nano | 2K–20K | ⭐⭐⭐ | Highest trust, lowest cost, best engagement |
| Micro | 20K–150K | ⭐⭐⭐ | Best ROI tier once nano is seeded |
| Mid-tier | 150K–500K | ⭐⭐ | Viable only for exceptional fit |
| Macro | 500K+ | ✗ | Skip — budget mismatch |

For Substacks, use subscriber count. 5K engaged email subscribers often outperforms 50K Instagram followers for conversion.

---

## Creator categories (where to search)

### 1. Children's book & reading accounts
Reviewers, read-aloud channels, literacy advocates, teachers, librarians, SLPs. Strong fit for LHL's core identity. Look for: regular book recs, reviews of personalized/character-driven books, parent comments asking for more recs.
**Search:** `#kidsbooks #storytime #readingisfun #booksofinstagram` — TikTok + IG. YouTube: "children's book read aloud."

### 2. Parenting lifestyle & family accounts
Honest mom/dad creators, gentle parenting, Montessori, homeschoolers, milestone-documenters. Look for: regular "things I love for my kid" posts, high engagement on product mentions, audience asking for links.
**Search:** `#momsoftiktok #momlife #gentleparenting #montessorimom`. Avoid: skews more parent-lifestyle than child-focused.

### 3. Gift-guide & Amazon-finds accounts
Curators who do regular gift guides — birthday gifts, grandparent ideas, "Amazon finds for toddlers." Look for: Amazon storefronts, high save rates on gift posts, "where did you get this?" comments.
**Search:** `#amazonfinds #giftideas #giftsfortoddlers #kidsaccessories`.

### 4. Grandparent accounts
Underrated. Grandparents are the second-largest buyer segment for personalized children's gifts. Active on YouTube + Facebook + increasingly Instagram. Hook angle: "grandparent-approved in 3 taps."

### 5. Baby & pregnancy accounts
Strong baby-shower-gift angle. Look for: pregnancy/newborn content, baby milestone posts, gift guides for new parents. **Search:** `#babyshower #newmom #pregnancyannouncement`.

### 6. Educational & child development creators
Pediatric OTs, child therapists, SEL educators, developmental specialists. Strong alignment with LHL's "Finding Our Inner Voice" emotional-intelligence theme. **Search:** `#childdevelopment #selfesteem #SEL`.

### 7. Diverse & inclusive parenting creators
Multicultural families, LGBTQ+ parents, adoptive families, special-needs parenting. Personalization is especially meaningful for audiences that haven't seen children who look like theirs in books. Lead with **representation angle**, not generic personalization.

### 8. Local & regional parent influencers
Hyper-engaged local audiences, faster response, lower cost. US/CA/UK preferred (print/shipping alignment).

### 9. Substack & newsletter creators
Often outperform large IG followings for conversion. Email-only outreach. Pitch a gift roundup mention or sponsored issue.

### 10. Podcast hosts
Family/parenting podcasts. Email host or inquiry address. Pitch sponsorship for an episode segment or organic mention.

### Unlisted categories
If a creator doesn't fit a listed category but seems like strong fit, proceed and flag the new category in the batch summary.

---

## Fit scoring (20 points)

Score every creator before drafting. **Minimum 12/20 to proceed.**

### 1. Audience alignment (0–5)
Does their audience match who buys personalized children's gifts?
- 5: Primarily parents/grandparents of 0–7-year-olds, gift-buying frequent
- 3–4: Parenting audience but skews older kids, or unclear age range
- 1–2: Partial overlap (lifestyle audience that includes some parents)
- 0: No meaningful overlap

### 2. Aesthetic & tonal fit (0–4)
Does their content feel compatible with LHL's warm, intentional, storybook brand?
- 4: Warm, emotional, storytelling-forward
- 2–3: Professional family-safe but neutral / minimal
- 1: Heavily trend-driven, ironic, or chaotic aesthetic
- 0: Conflicts with family-safe values

### 3. Engagement quality (0–4)
Genuine interest vs inflated/passive followers?
- 4: High comment volume with substance, saves, shares, purchase questions in comments
- 2–3: Moderate real engagement, some buying-intent signals
- 1: Vanity metrics (many likes, few meaningful comments)
- 0: Suspicious patterns (bots, repetitive comments, engagement pods)

**Red flags:** low comment-to-like ratio, repetitive/generic comments, follower spike without content change, no saves on save-worthy content.

### 4. Partnership openness (0–4)
Do they collaborate? Approachable for gifted deals?
- 4: Active brand partnerships, contact in bio, responds to DMs
- 2–3: Occasional partnerships, contact method exists
- 1: Rarely partners, no clear contact
- 0: Explicitly states "no brand deals" or has complained publicly about DM spam

### 5. Tier fit (0–3)
- Nano (2K–20K): 3
- Micro (20K–150K): 3
- Mid-tier (150K–500K): 2
- Macro (500K+): 0 → skip

### Scoring decision

| Total | Action |
|---|---|
| 17–20 | Priority — draft immediately |
| 14–16 | Strong — include in next batch |
| 12–13 | Viable — include if batch is light |
| 10–11 | Borderline — flag to Jeff with rationale |
| Below 10 | Skip |

---

## Pre-engagement (required before any DM)

For creators contacted via Instagram or TikTok DM:

1. **At least 24 hours before sending the DM:** Like 1–2 of their most recent posts. Leave one brief, genuine comment on a recent post — not brand interest, just a real human reaction.
2. Log `pre-engaged: [date]` in pipeline.md.
3. Do not DM until 24 hours have passed.

**Why:** Cold DMs from accounts with zero prior interaction are flagged as spam. Even minimal pre-engagement signals a real person.

**Skip pre-engagement if email is the planned channel.**

---

## Daily discovery target

Add 10+ creators per session. Score all of them. Aim for **30+ candidates before the first outreach wave** so Jeff can pick the strongest 20 for week one.

---

## Drafting outreach

**Templates live at [`docs/marketing/outreach/lhl/templates/`](../../../docs/marketing/outreach/lhl/templates/).** Always reference the template, don't reinvent each time.

| Channel | Template |
|---|---|
| Instagram DM | [`templates/dm-instagram.md`](../../../docs/marketing/outreach/lhl/templates/dm-instagram.md) |
| TikTok DM | [`templates/dm-tiktok.md`](../../../docs/marketing/outreach/lhl/templates/dm-tiktok.md) |
| Email | [`templates/email-standard.md`](../../../docs/marketing/outreach/lhl/templates/email-standard.md) |
| Follow-up | [`templates/follow-up.md`](../../../docs/marketing/outreach/lhl/templates/follow-up.md) |

### Required for every draft

- **Default opener: direct founder intro** ("I'm Jeff at Little Hero Labs..."). Specific-reference openers are an A/B variant only — do not default. See [`voice-guide.md`](../../../docs/marketing/outreach/lhl/voice-guide.md).
- The campaign angle matched to their natural format (see angle table in `email-standard.md`)
- The Wonderbly differentiation is an **A/B variant only**. Default: don't name competitors.
- Lead with **gifted book only**. No rate amounts. No bonus tiers. **No offer mechanism. No partnership structure.** Specifics come only after the creator expresses interest *and* audience quality is internally confirmed.
- Sign as **Jeff / Little Hero Labs**. No persona.
- If a sample preview asset exists, include it. If not, offer to send one.
- Each draft saved to `outreach-data/lhl/drafts/YYYY-MM-DD-[handle].md`.
- **No em dashes anywhere.** Use periods, commas, parentheses, colons.
- **Run [`humanizer`](../humanizer/SKILL.md) on every batch** before presenting to Jeff.

### Hook bank (campaign angles, not literal copy)

Use these to inform the angle you propose. Don't paste them verbatim into pitches.

- "The first book where they're the actual hero — not a name pasted onto a stock character."
- "Their hair, their skin tone, their favorite animal — they are literally the hero on every page."
- "A keepsake about *their* inner voice — built around them, not adapted to them."
- "Type their name → watch the book appear."
- "Grandparent-approved in 3 taps."
- "My kid is OBSESSED with their own story."
- "If you need a gift for a 0–7 year old… this is it."
- "They named the main character after themselves and asked to read it 4 nights in a row."

### Humanizer pass

Before presenting any batch to Jeff, run the [`humanizer`](../humanizer/SKILL.md) skill over the drafts. Check:

- Multiple pitches opening with the same sentence structure?
- Press-release rhythm when read aloud?
- Excessive parallel structure ("We do X. We offer Y. We believe Z.")?
- AI-vocabulary words ("delve, leverage, pivotal, tapestry")?
- Em-dash overuse?
- Sentences all similar length?

Fix any of the above. Each pitch should sound like Jeff personally wrote it. Vary rhythm and opener structure across the batch.

---

## Approval & sending protocol

After preparing a batch, present to Jeff:

```
LHL Creator Pipeline Batch — [Date]
Ready for review: [N] drafts
Attribution links ready: [Y/N — note any missing]

| # | Handle | Platform | Followers | Score | Angle | Channel | Offer | Draft path |
|---|--------|----------|-----------|-------|-------|---------|-------|-----------|
| 1 | @handle | Instagram | 18K | 17/20 | Kid reaction | Email | Gifted + custom code | drafts/2026-04-30-handle.md |

Reply: APPROVE ALL / APPROVE 1,3 / SKIP 2 / EDIT 4 [notes]
Drafts in: outreach-data/lhl/drafts/
```

**Cycle 1: skill never sends. Jeff sends manually after approval.** When Jeff confirms a draft was sent, log immediately to `sent-log.md` and update `pipeline.md` status to `sent`.

---

## Rate-limit safety

Even though Cycle 1 is draft-only, drafts should respect the limits Jeff will hit when sending:

| Channel | Daily max | Notes |
|---|---|---|
| Email | 20 | Gmail sending reputation |
| Instagram DM | 5 | Min 30 minutes between |
| TikTok DM | 3 | Aggressive limits |

If a batch exceeds these, split across days when presenting to Jeff.

**Instagram DM gotchas:**
- Pre-engagement (like/comment) required at least 24h before
- If any DM fails or shows a warning, stop immediately. Do not retry same day.
- Treat email as primary. DMs are secondary for nano creators with no email.

---

## Amazon Attribution links

Before finalizing any draft, confirm whether the creator has an Amazon Attribution link. If not, prompt Jeff to create one in Amazon Brand Registry → Attribution.

**Format:** One link per creator per platform.
**UTM convention (for website tracking):** `utm_source=[handle]&utm_medium=[platform]&utm_campaign=lhl_launch_v1`

Log the Attribution link in pipeline.md as soon as created. Include in the campaign-ops handoff when a deal is confirmed.

---

## Offer structure

### Initial ask (all creators)
**Lead with the gifted book only.** Lowest-friction first step. Compensation comes later if they express interest.

### Compensation tiers (internal — not shared in initial outreach)

| Tier | Compensation |
|---|---|
| Nano (2K–20K) | Gifted book + 10–20% custom code rev share + bonus tiers ($25 at 3 sales / $75 at 10 / $150 at 25) |
| Micro (20K–150K) | Flat fee $150–$500 + gifted book. Includes 1 post + 2 stories + raw clips |
| Mid-tier (150K–500K, exceptional fit only) | Flat fee $300–$750+. Discuss with Jeff before any offer |
| Podcast sponsorship mention | $50–$200 for 30-second segment. Negotiate per show |

**Mechanism:** Per-creator Amazon Attribution link + custom discount code (e.g., `JEFF15`). Pay via PayPal or Stripe transfer. No formal affiliate platform yet.

**Never mention dollar amounts, mechanism, or partnership structure in initial outreach.** First message leads with the gifted book only. Specifics surface in a follow-up *after* the creator expresses interest **and** audience quality is internally confirmed. Always present proposed tiers to Jeff for approval before communicating numbers or mechanism to the creator.

---

## Response tracking & follow-up

When Jeff shares a reply:
1. Log to `responses.md` immediately
2. Update `pipeline.md` status + last activity date
3. Assess sentiment, draft the appropriate next step

| Sentiment | Next step |
|---|---|
| Positive / interested | Draft confirming gifted offer + ask for Amazon order info (or shipping address). Include what we'd love them to create. Present to Jeff. |
| Asking about rates / compensation | Draft response with appropriate tier amounts. Always present to Jeff for approval before sending dollar figures. |
| Requesting media kit / more info | Prepare brand overview: LHL one-pager, sample preview link, target audience. Present to Jeff. *(Press kit asset is a Cycle 1 deliverable — see asset phase.)* |
| Neutral / curious, no commitment | Warm low-pressure reply reiterating gifted offer only. Don't push. |
| Politely declined | Mark `declined` in pipeline.md. Add to do-not-contact.md with date and reason. No follow-up. |
| No response after 10+ days | Flag as "follow-up eligible." Ask Jeff before sending. Use [`follow-up.md`](../../../docs/marketing/outreach/lhl/templates/follow-up.md) — exactly **one** follow-up max. |

---

## Confirmation handoff to lhl-campaign-ops

When a creator confirms:

1. Log to `partnerships.md` (managed by `lhl-campaign-ops`):
   - Creator handle, platform, follower count
   - Agreed compensation type and amount
   - Agreed deliverables (post format, stories, raw clips, usage rights)
   - Expected post date
   - Amazon Attribution link (must exist before confirmation)
2. Update `pipeline.md` status → `confirmed`
3. Notify Jeff: *"@[handle] has confirmed. Handing off to campaign ops for brief delivery and fulfillment."*
4. Do not proceed with brief, fulfillment, or UGC coordination here — those are `lhl-campaign-ops`.

---

## Reporting

When Jeff asks for a pipeline update:

```
LHL Creator Pipeline — [Date]

SUMMARY
Researched: X | Scored: X | Pre-engaged: X
Drafted: X | Sent: X | Responses: X (X positive, X neutral, X declined)
Active negotiations: X | Confirmed partnerships: X
Follow-ups due this week: X

NEEDS ATTENTION
- @handle responded [date] — needs direction
- @handle — 10 days since send, follow-up eligible

TOP UNCONTACTED (ready to draft)
- @handle — [score]/20 — [why they're promising]

RECENT RESULTS
- Won: @handle (terms: gifted + custom code, posting [date])
- Lost: @handle (declined — [reason])

ATTRIBUTION STATUS
Missing links for: [confirmed partnerships without links]
```

---

## Trigger phrases

The skill responds to these and natural variations:

- `LHL research — find [N] [category/platform] creators` → discovery + scoring
- `LHL outreach — draft pitches for the top [N] from research batch` → drafts batch
- `LHL pre-engage @handle` → likes + comments on recent post, logs to pipeline
- `LHL approve [numbers] and send` → presents to Jeff for sending; skill itself doesn't send in Cycle 1
- `LHL pipeline status` → returns full pipeline report
- `LHL — @handle replied. [paste response]` → logs to responses.md, drafts next step
- `LHL follow-up @handle` → drafts approved follow-up
- `LHL — @handle confirmed. Terms: [describe]` → logs, triggers handoff to campaign-ops
- `Add @handle to do-not-contact — [reason]`
- `LHL — show me all [nano / micro / Substack] creators in pipeline`
- `LHL — who needs a follow-up this week?`
- `LHL attribution — generate link for @handle` → prompt Jeff to create Attribution link

---

## Constraints

- Never contact a creator in `sent-log.md` or `do-not-contact.md` without explicit Jeff instruction.
- Never send outreach without Jeff's approval. Cycle 1: skill drafts only; Jeff sends.
- Never commit to dollar amounts in initial outreach.
- Never overstate LHL's scale or impersonate a large brand. Authenticity is an asset.
- Never claim sales performance data that hasn't been verified.
- Never invent case studies, testimonials, or partnership history.
- Log everything. Do not delete pipeline entries — update status.
- Respect FTC disclosure rules: any partnership must be disclosed (`#ad` if paid, `#gifted` if gifted only). Note this when confirming terms.
- If a creator has publicly complained about brand DM spam: skip entirely.
- Child privacy red flag: if a creator's content shows child-identifying details (school name, address, full name), note in pipeline.md before pitching. Usage rights from this creator carry additional privacy risk.
- Honor the **90-day frequency cap.** No exceptions without explicit Jeff override.
- Honor the **rate limits** even though Cycle 1 is draft-only — drafts are paced for the eventual send rhythm.
