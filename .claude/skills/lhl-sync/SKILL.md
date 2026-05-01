---
name: lhl-sync
description: Pull latest from main and summarize what the LHL outreach routines (R1/R2/R3) added since the last sync. Activate when Jeff says "sync", "lhl sync", "pull routine results", "what did the routine find", "show me today's discovery", "what's new in the pipeline", or similar. Surface only valuable insights or anomalies — don't pad the report with boilerplate.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# LHL Sync — review what the routines did

A quick, signal-only debrief. Jeff invokes this any time he wants to know what the cloud routines have done since his last sync. Don't add ceremony — answer in chat, not in files.

## What this skill does

1. `git pull origin main` from the repo root.
2. Identify what changed since the last pull (commits, file diffs).
3. Summarize the routine outputs in chat.
4. Surface ONLY valuable insights or anomalies. Skip routine summaries if everything looks normal.

## Steps

### 1. Pull

From the repo root (`/Users/jeff/Projects/little-hero-books`):

```bash
git pull --rebase origin main
```

If the pull surfaces conflicts, **stop** and report to Jeff. Do not auto-resolve. Conflicts on `outreach-data/lhl/pipeline.md` likely mean Jeff edited locally while a routine was pushing — easy fix but Jeff decides.

### 2. Find new routine commits

Routines tag their commits with `R1`, `R2`, or `R3` prefixes. Look back at the last ~7 days:

```bash
git log --since="7 days ago" --pretty=format:"%h %ad %s" --date=short -- outreach-data/lhl/
```

Filter to commits authored by the routine identity (anonymous bot or anthropic-bot), or by message prefix `R1`/`R2`/`R3`.

### 3. Diff-summarize each new routine commit

For each new R1/R2/R3 commit since Jeff's last sync, look at what changed:

```bash
git show --stat <commit-sha> -- outreach-data/lhl/
```

For R1 (discovery), the changes will be appended rows in `pipeline.md`. Read the new rows.

For R2 (drafting, when it exists), the changes will be new files in `outreach-data/lhl/drafts/` plus updated status in `pipeline.md`. Note: drafts are gitignored, so they won't appear in `git show` — instead, check the local `drafts/` directory for files modified since last sync.

For R3 (pulse report, when it exists), the routine may post the report directly to chat or commit it as a daily-pulse markdown file.

### 4. Output: a concise summary to Jeff in chat

**Format:** plain prose with bullet lists. Avoid heavy headers, code blocks of full table rows, or restating the obvious. The goal is "what did Jeff need to know?"

**Always include:**
- Which routine(s) ran since last sync, with commit SHAs and dates
- Total new rows / drafts / events
- Top 3 by score (R1) or top 3 ready to send (R2)

**Include only if valuable:**
- All Top 3 high scorers in same niche → flag for diversification
- Routine added <80% of target (e.g., 7 of 10 instead of 10) → flag the shortfall
- Pattern anomaly: many low scorers in a category → tell Jeff the category may be saturated or the search is mistargeted
- Contact-method coverage <50% (most candidates DM-only or unreachable) → suggests a search-strategy adjustment
- Repeated entries that snuck through duplicate-checking → real bug, surface it
- Commit messages that imply errors ("R1 daily discovery: 0 creators added — search blocked by rate limit")

**Skip if not valuable:**
- "Routine ran successfully and added 10 creators." (already known)
- "Categories cycled per the schedule." (boilerplate)
- "All commits pushed cleanly." (default outcome)

### 5. End with a single recommended next action

If no action is needed: end with "Nothing to do; let it cook." or similar single sentence.

If action is needed: state it directly. Examples:
- "Recommend updating R1's prompt to add `#bookstagram` and `#kidlit` hashtags — discovery missed obvious targets."
- "Two creators in the new batch overlap with `do-not-contact.md`. Logged anyway. Worth removing those rows manually."
- "R1 has been running for 2 days; ready to deploy R2."

## Voice & length

Conversational, not formal. Short. Treat this like a stand-up summary, not a status doc. If Jeff asks for more detail on a specific finding, drill in then — don't preemptively dump everything.

If the answer is "nothing happened since last sync," say that in one line and stop.

## Constraints

- Don't write any files unless explicitly asked. The summary lives in chat.
- Don't auto-resolve git conflicts. Stop and surface.
- Don't run any of the routines (R1/R2/R3) from this skill. This is read-only sync + report.
- If a routine looks broken (e.g., 0 creators added on a normal run), flag immediately. Don't paper over.
