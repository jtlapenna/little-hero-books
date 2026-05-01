---
name: "new-handoff"
description: "Use when the user wants a handoff summary for a new chat, a resume document, a context-transfer note, or asks to package the current work so another thread can continue from the same point."
metadata:
  short-description: Create a reusable handoff for a new chat
---

# New Handoff

Create a clean resume package for a new chat.

## When to use

- The user says `handoff`, `new chat`, `resume in another thread`, `catch me up in a new chat`, or similar.
- The user wants a document they can paste into another thread so work can continue without rebuilding context.

## Required workflow

### 1. Update the source-of-truth bookmark first

Before writing the handoff, update any active work log, QA log, or planning bookmark that should reflect the current pause point.

Examples:
- fixture work log
- QA work log
- project roadmap note
- PR follow-up log

Do not leave the latest state only in chat history.

### 2. Create a standalone handoff document

Write a markdown document in the most relevant project docs folder.

Preferred location:
- a nearby `qa/`, `handoffs/`, or `docs/` folder for the active workstream

Preferred filename:
- `handoff-YYYY-MM-DD-topic.md`

### 3. Include these sections

- `Current objective`
- `Exact pause point`
- `What is already done`
- `Immediate next steps`
- `Best source-of-truth docs`
- `Open blockers / waiting items`
- `Repo / branch / PR / CI state` when relevant
- `Recommended opening prompt for the next chat`

### 4. Be explicit

- Use absolute file paths
- Include exact issue, branch, PR, environment, and endpoint names when relevant
- Include concrete dates
- Distinguish facts from likely inferences
- Name the active blocker plainly

### 5. Keep it useful, not bloated

The handoff should be detailed enough to restart work immediately, but should not restate every past investigation.

Prefer:
- the current state
- the decisive evidence
- the next action sequence
- the smallest set of files needed to continue

### 6. Final response

After creating the file:

- give the handoff document path
- summarize the current blocker and next step in 2-4 short bullets or a short paragraph
- tell the user this is the file to paste/reference in the new chat

## Quality bar

A good handoff lets a new thread continue with minimal re-discovery.

It should answer:

- What were we trying to do?
- What did we prove already?
- What is blocked?
- What exact step comes next?
- Which files matter most?
