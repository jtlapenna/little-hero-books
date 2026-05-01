---
name: lhl-campaign-ops
description: Manage active Little Hero Labs influencer partnerships from confirmed deal through content delivery, UGC capture, paid amplification, and performance reporting. Activate when Jeff needs to send a creator brief, coordinate fulfillment, track content delivery, identify Spark or Boost winners, manage UGC repurposing, or report on campaign performance. Picks up where lhl-creator-pipeline leaves off.
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

# Little Hero Labs — Campaign Ops Skill

Activates once a creator confirms a partnership. Brief delivery → fulfillment → content capture → UGC library → winner ID → paid amplification → performance reporting.

**Upstream:** `lhl-creator-pipeline` handles discovery, scoring, outreach, and confirmation. When a creator hits `confirmed` status, this skill takes over.

This skill is **draft-only for outgoing comms** in Cycle 1. Briefs and check-in messages land in `outreach-data/lhl/drafts/` for Jeff to send manually.

## Read at session start

1. Repo-root [`CLAUDE.md`](../../../CLAUDE.md) — brand, product, voice, hard nos
2. [`docs/marketing/outreach/lhl/playbook/rebrand-notes.md`](../../../docs/marketing/outreach/lhl/playbook/rebrand-notes.md)
3. [`outreach-data/lhl/partnerships.md`](../../../outreach-data/lhl/partnerships.md) — every active and completed deal

Use **`claude-sonnet-4-6`** for this skill. Brief writing, UGC analysis, performance interpretation, and response drafting need nuance.

---

## Memory files

```
outreach-data/lhl/
├── partnerships.md       — every active and completed deal, terms, deliverables, status
├── responses.md          — all creator communications after deal confirmation
├── ugc-library.md        — index of UGC assets received (clips, posts, raw footage)
├── winners.md            — identified winner creatives with performance notes
├── amplification-log.md  — every Spark/Boost spend, dates, results
└── pipeline.md           — shared with creator-pipeline; update status here too
```

Create any of these if they don't yet exist.

### `partnerships.md` entry format

```
## @[handle] — [Platform] — [Status]

**Confirmed:** [date]
**Tier:** [nano/micro/mid]
**Compensation:** [gifted / gifted + custom code rev share + bonus tiers / $X flat fee + gifted]
**Deliverables:** [1×9:16 video, 2×story frames, 10–15 raw clips, etc.]
**Usage Rights:** [Y/N — duration, platforms authorized]
**Amazon Attribution Link:** [URL]
**UTM:** [full UTM string]
**Discount Code:** [e.g., HANDLE15]
**Personalization Submitted:** [Y/N — date]
**Book Ordered:** [Y/N — date + tracking if available]
**Expected Post Date:** [date]
**Content Live:** [Y/N — post URL when available]
**Raw Clips Received:** [Y/N — location]
**Performance Notes:** [views, 3-sec hold, comments, Amazon clicks, orders]
**Amplified:** [Y/N — platform, budget, dates, result]
**Closed:** [date — won/lost/completed]
```

---

## Step 1 — Pre-brief checklist

Before drafting the creator brief, confirm:

- [ ] Amazon Attribution link exists and is logged in `partnerships.md`
- [ ] Custom discount code generated (if part of the offer) — log in `partnerships.md`
- [ ] Compensation terms agreed and logged
- [ ] Usage rights scope agreed (or included in brief for sign-off)
- [ ] Sample preview asset URL available to share

If any item is missing, flag to Jeff before proceeding.

---

## Step 2 — Send the creator brief

Brief template lives at [`docs/marketing/outreach/lhl/templates/brief.md`](../../../docs/marketing/outreach/lhl/templates/brief.md). Fill it out per partnership; present the draft to Jeff for approval before sending.

**Default fulfillment path: creator orders via Amazon using their Attribution link, leaves a positive review when the book arrives.** Drives ranking + reviews + sale + Attribution data in one action. Direct-ship is a fallback only.

After Jeff confirms the brief was sent, log `brief-sent: [date]` in `partnerships.md`.

---

## Step 3 — Personalization & fulfillment

### Default flow — creator orders via Amazon
1. Provide the creator their unique Amazon Attribution link + discount code
2. Note in brief that they personalize at Amazon checkout (name, look, etc.)
3. Ask them to leave an honest review when the book arrives
4. Log `book-ordered: [date]` and `attribution-link-used: Y/N` in `partnerships.md`

### Fallback — ship directly to creator
Use only when the creator can't or won't order via Amazon. Jeff orders via Amazon Custom or LHL site using the creator's details. Use the creator's Attribution link if possible.
Log `book-shipped: [date], tracking: [number if available]`.

### If creator reports a fulfillment issue
Flag immediately to Jeff. Do not attempt to resolve shipping or production directly. Defer to Jeff or LHL fulfillment process.

### Backup B-roll assets
If the creator can't film required shots (e.g., book hasn't arrived yet, child not the right age), provide backup digital assets if available: product screenshots, process walkthrough images, illustration close-ups. Note in `partnerships.md` if backups were used.

---

## Step 4 — Content coordination & delivery

### Pre-post check-in
Approximately 3 days before the expected post date, draft a brief check-in:

```
Hey [Name] — just checking in as you're getting close to [expected post date]. Did the book arrive okay? Any questions before you film? Happy to help if you need anything.

— Jeff
```

Present to Jeff for approval before sending. Log in `responses.md`.

### When content goes live

As soon as Jeff spots a live post (or the creator notifies):
1. Log in `partnerships.md`: `content-live: [date], post-URL: [URL]`
2. Update `pipeline.md` status to `content-live`
3. Within 24–48 hours, capture initial performance:
   - Views / plays
   - 3-second hold rate (if visible)
   - Likes, comments, saves, shares
   - Comments indicating purchase intent ("where do I get this?", "need this for my niece")
   - Amazon Attribution link clicks (ask Jeff to check Attribution dashboard)
4. Log under `Performance Notes` in `partnerships.md`
5. Flag strong early performers to Jeff immediately

### Raw clips follow-up
If raw clips were part of the deliverables and haven't arrived within 48 hours of the post, draft a gentle follow-up:

```
Hey [Name] — loved the post! When you get a chance, could you send over the raw clips? Even a quick Google Drive link or WeTransfer works great. Thanks so much!

— Jeff
```

Log clip receipt in both `partnerships.md` and `ugc-library.md`.

---

## Step 5 — UGC library

Every piece of received content gets catalogued in `ugc-library.md`.

### Entry format

```
## @[handle] — [Date Received]

**Platform:** [Instagram / TikTok / YouTube]
**Post URL:** [link]
**Raw Clips Location:** [Google Drive folder / WeTransfer link / local path]
**Clip Count:** [number]
**Usable Shots:**
  - [ ] Personalization screen recording
  - [ ] Page flip / inside spreads
  - [ ] Cover with child's name
  - [ ] Kid/family reaction
  - [ ] Other: [describe]

**Usage Rights:** [Y/N — authorized platforms and duration]
**Best Hook Moment:** [timestamp or description — e.g., "2.1s — name appears on cover"]
**Best Reaction Moment:** [if applicable]
**Notes:** [anything notable about footage quality, style, usability]
```

### UGC repurposing plan

Once clips are received, propose a plan to Jeff. From each winning creative, identify opportunities for:
- 3 hook variations (first 2 seconds recut with different opening)
- 2 CTA variations (different ending)
- 3–5 cutdowns (6–10 second versions optimized per platform)

**Distribution:**
- TikTok native (with creator's Spark permissions)
- Instagram Reels native or boosted
- YouTube Shorts (secondary)
- Website hero module (when usage rights confirmed)
- Email welcome series thumbnail
- Amazon product video (if usage rights permit)

Present the repurposing plan to Jeff before producing any derivatives. **Never use creator content in paid ads without confirmed usage rights.**

---

## Step 6 — Winner identification

Review all live posts weekly against winner criteria.

### Primary signals (need ≥2)
- 3-second hold rate above 30–40% (strong hook)
- Comments with purchase-intent language ("where do I get this?", "need this for [name]", "added to cart")
- Amazon Attribution clicks at meaningful volume

### Supporting signals
- High save rate vs views
- Audience asking follow-up questions in comments
- Organic shares or reposts
- Jeff reports a sales spike during/after the post window

When a winner is identified, log to `winners.md` and notify Jeff.

### `winners.md` entry format

```
## @[handle] — [Platform] — [Date Identified]

**Post URL:** [link]
**Views:** [number]
**3-sec Hold:** [% if visible]
**Intent Comments:** [examples]
**Amazon Clicks:** [number]
**Orders Attributed:** [number if known]
**Why It Wins:** [brief analysis — what's working]
**Recommended Action:** Spark Ads / IG Boost / Repurpose as paid creative / All three
**Status:** [pending-jeff-approval / amplifying / completed]
```

---

## Step 7 — Paid amplification

### Always requires Jeff approval

Before boosting or running any Spark Ad, present:

```
Winner identified: @[handle] — [Platform]
Views: [X] | Hold rate: [X%] | Intent comments: [examples]
Amazon clicks so far: [X]

Recommended: [Spark Ads on TikTok / IG Boost] — $[X]/day for [X] days
Total budget: $[X]
Optimize for: [clicks to Amazon / video views]

Ready to proceed?
```

Wait for explicit approval before any spend.

### Spark Ads (TikTok)
- Creator must enable Spark Ads / Branded Content permissions on the post
- Request once a winner is confirmed: *"Your post is doing really well — would you be open to enabling Spark Ads so we can put a small budget behind it? Just a quick setting change on your end."*
- Starter budget: $20–50/day per winner for 3–5 days
- Optimize for: link clicks (to Amazon Attribution URL) for direct conversion; video views for awareness

### Instagram Boost
- Requires Jeff's IG Business account connected to Meta Ads Manager
- Optimize for: clicks to Amazon Attribution URL or profile link
- Starter budget: $20–50/day, 3–5 days, then assess

### `amplification-log.md` entry

```
## @[handle] — [Platform] — [Campaign Start Date]

**Ad Type:** [Spark / IG Boost / Meta Paid]
**Budget:** $[X]/day
**Duration:** [start] → [end]
**Total Spend:** $[X]
**Optimize For:** [clicks / views]
**Results:**
  - Clicks: [X]
  - Impressions: [X]
  - CTR: [X%]
  - Amazon orders attributed: [X if known]
**Decision:** [scale / pause / end]
**Notes:** [anything notable]
```

---

## Step 8 — Response handling (post-confirmation)

All creator communication after deal confirmation logs to `responses.md`.

| Situation | Next step |
|---|---|
| Creator asking about post performance / their affiliate data | Pull current stats from `partnerships.md` and Attribution dashboard. Draft a warm honest update. Present to Jeff. |
| Creator asking about extending usage rights | Flag to Jeff with current rights terms and what's being requested. No agreements without Jeff sign-off. |
| Creator asking about repeat partnership | Note in `partnerships.md` and flag as "repeat candidate." Draft enthusiastic response that defers timing to Jeff. |
| Creator reporting fulfillment issue | Flag immediately to Jeff. Do not promise a resolution on Jeff's behalf. |
| Creator not posting by expected date | After expected post date passes without content live, draft gentle check-in (present to Jeff first): *"Hey [Name] — hope everything's going well! Just checking in on the Little Hero Labs post — no pressure at all, just wanted to make sure the book arrived okay and that you haven't run into any issues. Let me know if you need anything! — Jeff"* |
| No response or post after 2 follow-ups | Flag to Jeff with full context and recommended action. Do not write off a confirmed creator without Jeff's decision. |

---

## Compliance notes

All active partnerships must follow:

- **`#ad`** — required when compensation was paid (flat fee or bonus)
- **`#gifted`** — required when only a free product was provided
- No claiming "instant shipping" or guarantees beyond what Amazon shows at checkout
- Don't collect children's personal info via post comments — always DM or form
- Usage rights must be confirmed in writing (reply email or DM) before any creator content goes into paid ads, website, or Amazon listing
- **Child privacy:** if a creator's content shows personally identifying details (full name, school, address), do not include that footage in any LHL materials regardless of usage rights agreement

---

## Campaign performance reporting

When Jeff asks for a campaign update:

```
LHL Campaign Ops Report — [Date]

ACTIVE PARTNERSHIPS: [X]
- @handle — brief sent [date] / book ordered [date] / post expected [date]
- @handle — content live [date] / [early performance if known]

CONTENT LIVE: [X posts]
WINNERS IDENTIFIED: [X]
AMPLIFICATION ACTIVE: [X — total spend to date: $X]

TOP PERFORMER THIS PERIOD
@handle — [views] views, [X] Amazon clicks, [X] orders attributed
[Why it's working: brief note]

UGC LIBRARY
Total assets: [X clips] from [X creators]
Repurposing in progress: [Y/N — what's being worked on]

NEEDS ATTENTION
- @handle — past expected post date, no content yet
- @handle — raw clips requested, not yet received
- @handle — eligible for amplification, awaiting Jeff approval

BUDGET SUMMARY
Total amplification spend to date: $[X]
Current daily spend: $[X]/day ([X] campaigns active)
Amazon Attribution clicks (all time): [X]
Orders attributed (all time): [X]
```

---

## 30-day sprint benchmarks

| Metric | 30-day target |
|---|---|
| Posts published | 10–20 |
| Raw UGC clips collected | 30–60 |
| Winner creatives identified | 3–5 |
| Spark/Boost campaigns tested | 2–3 |
| Amazon Attribution clicks | Baseline established |
| Email signups from influencer traffic | Trending up |

If tracking below by day 15, flag to Jeff with a diagnosis and recommended adjustment (more creators, different niche, different hook, etc.).

---

## Trigger phrases

The skill responds to these and natural variations:

- `LHL ops — @handle confirmed, send the brief` → pre-brief checklist + drafts brief
- `LHL ops — check in on @handle's post date` → drafts pre-post check-in
- `LHL ops — @handle posted [URL]` → logs, captures early metrics
- `LHL ops — @handle sent clips [location]` → logs to ugc-library.md
- `LHL ops — identify winners from this week's posts` → reviews against winner criteria
- `LHL ops — amplification proposal for @handle` → drafts Spark/Boost recommendation
- `LHL ops — campaign report` → returns full performance report
- `LHL ops — UGC repurpose plan for @handle` → proposes cutdowns + variations
- `LHL ops — @handle replied [paste]` → logs, drafts next step
- `LHL ops — mark @handle complete` → closes partnership entry

---

## Constraints

- Never run paid amplification without explicit Jeff approval and budget confirmation.
- Never use creator content in ads, website, or Amazon without confirmed usage rights.
- Never promise shipping timelines — defer to Amazon checkout estimates.
- Never commit to rate extensions or new terms without Jeff's approval.
- Never share creator compensation details with other creators.
- Log everything. Update status, never delete entries.
- If a creator's child appears in content, apply extra care for repurposing: only use footage the creator themselves posted publicly, never crop or reframe to isolate the child, and confirm usage rights explicitly before any paid use.
- Respect FTC disclosure rules: any post caption or brief must include the appropriate disclosure tag (`#ad` or `#gifted`).
- Cycle 1: skill drafts outgoing communications; Jeff sends.
