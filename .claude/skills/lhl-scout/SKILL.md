---
name: lhl-scout
description: Drive a logged-in browser session (via Claude in Chrome) to find, vet, and add high-fidelity creators to the LHL outreach pipeline. Activate when Jeff says "scout instagram", "scout #kidlit", "let's run a scout", "lhl scout", "find creators on Instagram", "find similar to @handle", or wants supervised in-browser discovery. Surfaces candidates one at a time for Jeff's yes/skip/dig-deeper decision; appends approved rows to pipeline.md with explicit scout-verified tagging.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - TodoWrite
  - AskUserQuestion
---

# LHL Scout — Supervised in-browser creator discovery

A complement to the autonomous cloud routine `lhl-creator-pipeline`. The cloud routine runs daily on the open web (no logged-in platforms). This skill runs in **Jeff's logged-in browser** via the Claude in Chrome MCP, so it sees real follower counts, real engagement, and content the cloud routine can't reach.

**When to use:**
- Weekly 30–60 min "scout raids" to add 10–25 high-fidelity creators
- Bi-weekly fidelity audits of cloud-discovered creators (verify data, upgrade scores)
- Any time a specific niche or hashtag needs deep search

**When NOT to use:**
- For autonomous daily backfill — that's the cloud R1 routine
- For drafting outreach — that's the R2 routine + `lhl-creator-pipeline` skill
- For sending DMs / pre-engagement — those are manual steps after Jeff approves a partnership

---

## Read at session start

1. Repo-root [`CLAUDE.md`](../../../CLAUDE.md) — brand, product, voice, hard nos
2. [`docs/marketing/outreach/lhl/playbook/rebrand-notes.md`](../../../docs/marketing/outreach/lhl/playbook/rebrand-notes.md)
3. [`.claude/skills/lhl-creator-pipeline/SKILL.md`](../lhl-creator-pipeline/SKILL.md) — same scoring rubric (20-point fit), same niches, same constraints
4. [`outreach-data/lhl/pipeline.md`](../../../outreach-data/lhl/pipeline.md) — every creator already in pipeline; never add a duplicate
5. [`outreach-data/lhl/do-not-contact.md`](../../../outreach-data/lhl/do-not-contact.md) — exclusions

Use **`claude-opus-4-7`** for this skill — judgment-heavy (per-candidate decisions, comment-quality assessment).

---

## Pre-flight (do these once at session start)

1. **Chrome MCP connection check:** call `mcp__Claude_in_Chrome__tabs_context_mcp` with `createIfEmpty: true`. This confirms the extension is connected and gives us a tab to work in. If it errors, surface the error to Jeff and stop — he likely needs to install/connect Claude in Chrome.

2. **Confirm session mode** — ask Jeff which mode this session is:
   - **Logged-out** (default, zero account risk): browser is logged out of Instagram. Discovery uses Google search → profile direct loads. Limited hashtag-feed access.
   - **Logged-in (personal account)**: years-old personal account with trust history. Full IG-native discovery (hashtag feeds, suggested-for-you, comments).
   - **Logged-in (LHL account)**: brand-new LHL account. **Default to NOT use this** unless the account has had 2+ weeks of organic warm-up activity. Risk of account flag.

   Adjust the discovery flow per the mode (see Step 1 of the main loop).

3. **Ask the scout target:** which hashtag(s), seed creator(s), or niche(s) for this session? Examples Jeff might give:
   - `#kidlit`
   - `#personalizedgifts`
   - `find similar to @bookbairn`
   - `#blackchildrensbooks` and `#multiculturalbooks`
   - `montessori toddler creators`

4. **Set a session goal:** how many candidates is Jeff trying to add this session? Default: 10 approved rows or 45 minutes, whichever comes first. **For first session in any new mode, start gentle: 5–8 candidates, ~20 min, single hashtag.**

5. **Initialize TodoWrite** with the session plan: mode, hashtags to cover, candidate count target, "review and commit at end".

---

## Main scouting loop

For each hashtag or seed source:

### Step 1 — Navigate to the discovery surface

**Discovery flow depends on session mode (set in pre-flight):**

#### Logged-out mode (default — zero risk)

IG's hashtag explore pages and "suggested for you" panels typically require login in 2026. So we use Google as the discovery layer:

**For a hashtag:**
1. `navigate` to `https://www.google.com/search?q=site:instagram.com+%23[hashtag]&tbs=qdr:y` (last-year filter to skip stale results)
2. `read_page` the SERP. Pull out instagram.com/[handle] URLs from the top results.
3. Cross-reference with broader search: `[niche keywords] instagram` to find creators who don't surface from hashtag-only.
4. Skip any handle already in `pipeline.md` or `do-not-contact.md`.

**For a seed creator (find-similar workflow):**
1. `navigate` to `https://www.instagram.com/[handle]/` (logged-out profile is mostly visible)
2. Read their bio, recent posts, captions for any tagged collaborator handles.
3. Search Google: `"@[handle]" instagram similar` or `instagram accounts like [handle]` — find aggregator articles or recent press features.
4. Build candidate list from those.

**Watch out for:** IG's "Sign up to see more" walls after a few clicks. If we hit one, finish the current candidate's data extraction quickly and move on rather than push through.

#### Logged-in mode (personal or warmed-up LHL)

Use IG's native discovery:

**For a hashtag:**
```
navigate https://www.instagram.com/explore/tags/[hashtag]/
```
Wait for grid to load. Pull the top 12 posts and their authors.

**For a seed creator (find-similar workflow):**
```
navigate https://www.instagram.com/[handle]/
```
Once on their profile, look for the "Suggested for you" follow chain near the top of the profile UI. Click into 2–3 suggestions and add them to the candidate list. (If the suggested-for-you bar isn't visible, fall back to checking their tagged collaborators in recent posts.)

### Step 2 — Identify candidate creators on the surface

Read the page (`read_page` or `get_page_text`). Pull out:
- The grid of top posts on the hashtag page (or the "suggested" lineup on a profile)
- For each post, the creator handle who posted it
- Skip any handle that's already in `pipeline.md` or `do-not-contact.md`

Aim for **5–8 fresh candidate handles per hashtag** — quality over quantity.

### Step 3 — Per-candidate assessment

For each candidate handle, navigate to their profile (`https://www.instagram.com/[handle]/`) and gather:

**Top of profile (visible immediately):**
- Verified handle name (matches what's in the URL)
- Display name + bio text
- Follower count (real, current — this is the high-fidelity advantage of scouting vs the cloud routine)
- Following count
- Post count
- External link in bio (often points to a Linktree, website, Substack, or contact form)
- Email in bio? (some creators put it directly)

**Recent posts (sample 3 most recent):**
- Engagement signal: like count, comment count visible on the grid
- For one or two posts, click in to read top comments — looking for:
  - Purchase-intent language ("where do I get this?", "need this for my [niece/nephew/grandkid]", "added to cart", "linked in bio?")
  - Audience demographic signals (other parents, teachers, librarians, grandparents)
  - Genuine engagement vs bot-style ("amazing!" replies)

**Stories highlights and Reels (if visible):**
- Quick scroll — does the aesthetic match LHL (warm, family-focused, watercolor-friendly)?
- How recently did they post? (active vs dormant)

**Contact:**
- Email in bio: record verbatim
- Link in bio: open in a new tab (`tabs_create_mcp`) and `read_page` — look for a contact page, review policy, manager email
- DM availability: check for "Message" button visibility and any "limit message requests" UI text. If DMs appear restricted, note it.

### Step 4 — Surface to Jeff

Present a short snapshot in chat:

```
**Candidate: @[handle]**
- Display: [Name], [bio summary in 1 line]
- Followers: [exact count, e.g., 47.2K]
- Recent activity: [posts in last 30 days estimate], aesthetic: [warm watercolor-friendly / professional / chaotic / off-niche]
- Engagement: avg likes ~[X], comments ~[Y] on recent posts
- Audience signal: [snippet from comments — e.g., "3 parents asking 'where to buy', 1 teacher comment, 2 author shoutouts"]
- Contact: [email if visible; link in bio if any; DM open/restricted]
- Score (provisional): [X]/20 with one-line rationale

Add this one? (yes / skip / dig deeper)
```

Use `AskUserQuestion` with three options (Yes — add, Skip, Dig deeper) for clean decision capture, OR just ask in plain chat — either works.

### Step 5 — Per Jeff's response

- **Yes**: score per the 20-point rubric in `lhl-creator-pipeline/SKILL.md` (audience 0-5, aesthetic 0-4, engagement 0-4, openness 0-4, tier 0-3). Build the pipeline row in memory. Don't write to pipeline.md yet — batch all approvals to a single commit at session end.

- **Skip**: log the handle to a session-local skip list (in conversation memory only, not pipeline.md). Move on. Don't ask Jeff for a reason.

- **Dig deeper**: scroll their profile further, click into 2–3 more recent posts, read top comments. Re-surface with an updated snapshot. Then ask again.

### Step 6 — Move to the next candidate

Continue until: (a) the hashtag's top creators are exhausted, (b) the session goal hits, (c) Jeff calls it.

---

## Pipeline row format for scout-verified candidates

When session ends and Jeff approves the batch, append rows to `outreach-data/lhl/pipeline.md` matching the existing column schema. **Distinguish scout-verified rows in the Notes column:**

```
| @handle | Instagram | 47.2K | ~2.5K | [niche] | 17/20 | [tech posture] | — | email: hello@x.com (in bio); IG: @handle; website: x.com (in bio link) | Pending | Gifted book | scout-verified | 2026-05-02 | scout-verified 2026-05-02. [Other context.] |
```

**Differences from cloud-routine rows:**
- **Avg Views column populated** when visible (it's `—` for cloud rows since the routine can't see it)
- **Status: `scout-verified`** instead of `scored` — this is a new status value indicating real-time browser verification. Update `lhl-creator-pipeline` skill to add `scout-verified` to the status flow if not already present.
- **Notes col** explicitly tagged `scout-verified: YYYY-MM-DD` so we can filter
- **Contact Methods** richer — DM availability is observable (note "DM: open" only if you saw the Message button work; otherwise leave silent)

---

## Session end

1. Show Jeff the full batch one more time before committing — he can drop any.
2. Append approved rows to `outreach-data/lhl/pipeline.md`.
3. Commit:
   ```
   git add outreach-data/lhl/pipeline.md
   git commit -m "Scout: [N] [niche] creators on YYYY-MM-DD via Instagram [hashtag(s)]"
   git push origin main
   ```
4. Output a session summary:
   - Total candidates surfaced
   - Total approved
   - Total skipped
   - Time spent
   - Top 3 by score with one-line rationale
   - Anything that suggests a next session focus (e.g., "the @bookbairn neighborhood looks fertile — recommend `find similar` raid next time")

---

## Constraints

- **Never log in for Jeff.** If a platform asks for credentials, surface to Jeff and stop until he handles it.
- **Respect logged-out mode.** If the session started logged-out, don't navigate to URLs that would force a login (e.g., DM inbox, account settings). If IG presents a "Sign up" modal, close it (`Escape` key) and continue with the visible portion of the page; if the modal blocks the page entirely, finish that candidate and move on.
- **Never DM, like, comment, or follow** during scouting. This is read-only intelligence-gathering. Pre-engagement (24h before DM outreach) is a separate manual step.
- **Rate-pace navigation.** Wait for pages to load. Don't spam navigation actions — Instagram's anti-bot will flag rapid sequential profile-loads. Aim for 1 profile per 30+ seconds.
- **No private accounts** unless Jeff has a specific reason (e.g., a known partner). Skip private profiles in the discovery flow.
- **No screenshots saved to disk** unless Jeff explicitly asks. Snapshots stay in memory for the assessment, then drop.
- **Honor the do-not-contact list and 90-day cap** — same as the creator-pipeline skill.
- **Never fabricate.** If you can't see a follower count, say so. If a comment is ambiguous, say so. The whole point of scouting is fidelity.
- **Don't write rows mid-session.** Batch to one commit at session end so we don't have ten tiny commits cluttering history.
- **Always commit + push at session end** — even partial sessions. Pipeline.md is shared with the cloud routines.

---

## Trigger phrases

- `lhl scout` / `let's scout` / `run a scout`
- `scout instagram` / `scout #[hashtag]`
- `find creators on instagram` / `instagram scout`
- `find similar to @[handle]`
- `audit @[handle]` (for fidelity-pass on existing pipeline rows)

---

## Future extensions (not in this version)

When Jeff is ready, this skill can grow to cover:

- **TikTok scout:** same workflow on TikTok. Hashtag pages, FYP-adjacent discovery, sound-based finds. TikTok's discovery is genuinely different and worth a dedicated workflow.
- **YouTube scout:** channel search, About-page email harvesting, subscriber-count verification.
- **Twitter/X scout:** kidlit author conversations, book-launch hype circles.
- **LinkedIn scout:** for B2B angle (kindergarten teacher-creators, librarian advocates, child psychologists).
- **Audit mode:** open existing cloud-discovered rows in browser, verify follower count + DM state + recent activity, upgrade or downgrade fit score.

For now, Instagram only. We'll grow it as we validate the workflow.
