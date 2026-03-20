# Repo-Centric Workflow Handoff — 2026-03-19 — W2B Next

## Current objective

Continue moving Book 1 through the repo-centric thin-n8n path so the repo owns more of the book logic and `n8n` becomes mostly orchestration. The next target is proving the first repo-centric `W2B` slice live in `n8n`.

## Exact pause point

As of March 19, 2026:

- repo-centric `W0` is working in live `n8n`
- repo-centric `W2A` bootstrap/pose-plan nodes are working in live `n8n`
- repo-centric `W2A` isolated builder branch is working in live `n8n`
- the only remaining `W2A` simulation failure is the final completion upsert because the test branch uses a fake per-item order id (`TEST-ORDER-016-ITEM-001`) that does not exist in `orders`
- the first repo-centric `W2B` seam is now committed in repo code and export form:
  - [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2b/build-worklist/route.ts)
  - [w2b-worklist.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w2b-worklist.ts)
  - [w2B-main-orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json)
- the remaining gap is live import/publish and Book 1 dress-rehearsal validation for repo-centric `W2B`
- we are intentionally **not** spending time fixing legacy sibling subworkflows like `SW0/SW1/SW2/SW3` for this repo-centric track unless a specific bridge is proven necessary

This means the repo-centric migration has entered `W2B`, and the next work is live proof plus minimal bridge fixes only if testing shows they are required.

## What is already done

- Book 2 planning/kernel/runtime work is committed through the latest code-bearing workflow/runtime commit:
  - `1aaaf11` `Advance repo-centric workflow migration and config runtime`
  - `fd951d3` `Capture working repo W0 and prepare W2A testing`
  - `c220269` `Fix repo W2A simulation order ids`
  - `edf0f7a` `Implement repo-centric W2B worklist seam`
- The latest repo state is:
  - `edf0f7a` `Implement repo-centric W2B worklist seam`
  - this is currently both the latest repo state and the latest workflow/runtime commit on `main`
- Repo-owned internal routes now exist in repo code under the admin app for:
  - `/api/internal/w0/build-manifest`
  - `/api/internal/w0/upsert-order`
  - `/api/internal/w2a/resolve-pose-worklist`
  - `/api/internal/w2a/bootstrap-manifest`
  - `/api/internal/w2a/build-run-manifest`
  - `/api/internal/w2b/build-worklist`
- Live repo-centric workflows exist in n8n:
  - `REPO - w0 - Order Intake & Validation`
  - `REPO - w2A-Orchestrator`
- The live repo-centric `W2A` workflow id is:
  - `HduzTWm0ekmrvwrn`
- The repo-centric workflow exports live in:
  - [w0-Order_Intake_Validation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json)
  - [w2A-Orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json)
  - [w2B-main-orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json)
- The sibling workflow folder was restored as the legacy/current n8n-centric master set for the normal live flow, and the repo-centric migration track now has its own canonical edit area in:
  - [repo-centric](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric)

## Immediate next steps

1. Import/publish [w2B-main-orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json) into live `n8n` as `REPO - w2B-main-orchestrator`, using webhook path `bg-removal-repo`.
2. Run one Book 1 live test through the repo-centric `W2B` path and confirm the route-owned worklist fans out correctly into the existing `SW1` boundary without changing the normal sibling/live flow.
3. Run one Book 1 rerun against an existing `2b-manifest.json` and confirm the repo-owned worklist route returns the all-poses-skipped path correctly.
4. Verify the written `2b-manifest.json` lands at the resolved per-order root and remains consumable by the current `W3` and `W4` readers.
5. If live validation shows a pass-through gap at the `SW1` boundary, patch only that minimal bridge; otherwise leave [SIBLING - w2B-sw1-single-pose.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2B-sw1-single-pose.json) unchanged.
6. After live proof, refresh the checked-in repo-centric export from the tested live workflow and update this handoff with the real live `W2B` workflow id and test evidence.

## Best source-of-truth docs

- [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)
- [w0-Order_Intake_Validation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json)
- [w2A-Orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json)
- [w2B-main-orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json)

## Open blockers / waiting items

- There is still no real Book 2 config or asset set, so Book 1 remains the only realistic dress rehearsal.
- The repo-centric `W2A` completion-upsert simulation cannot pass with `TEST-ORDER-016-ITEM-001` because there is no matching `orders` row. That is expected and should not block `W2B`.
- The repo-centric `W2B` seam is checked in, but live `n8n` import/publish and Book 1 proof are still pending.
- The current local shell environment does not expose `n8n` API credentials/base URL, so live import/publish work must be done from an environment that has `n8n` access.
- The n8n API can update workflows, but the safest pattern is to:
  - read the live server copy first
  - patch only the node(s) you intend to change
  - write back `name`, `nodes`, `connections`, and `settings`
- A stale open editor tab in n8n can still execute an older local copy even after the server workflow has been updated. Reopen or hard refresh before trusting a live test.

## Repo / branch / PR / CI state

- Repo: `/Users/jeff/Projects/little-hero-books`
- Branch: `main`
- Latest repo state: `edf0f7a` `Implement repo-centric W2B worklist seam`
- Latest code-bearing workflow/runtime commit: `edf0f7a` `Implement repo-centric W2B worklist seam`
- Remote state: pushed to `origin/main`
- Worktree should be clean after this handoff commit is created

## Recommended opening prompt for the next chat

Continue the repo-centric `W2B` migration from the committed worklist seam. Import/publish [w2B-main-orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json) into live n8n as `REPO - w2B-main-orchestrator`, then use Book 1 as the dress rehearsal. Verify one live processing run and one rerun/all-skipped run, confirm the per-order `2b-manifest.json` lands at the resolved root and still feeds W3/W4, and keep active edits only in the repo-centric folder. Do not widen the slice unless testing proves a minimal `SW1` bridge fix is required.
