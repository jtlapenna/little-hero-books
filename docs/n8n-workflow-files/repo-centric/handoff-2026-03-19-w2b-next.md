# Repo-Centric Workflow Handoff — 2026-03-23 — W3 Next

## Current objective

Continue moving Book 1 through the repo-centric thin-n8n path so the repo owns more of the book logic and `n8n` becomes mostly orchestration. The next target is the first repo-centric `W3` slice.

## Exact pause point

As of March 23, 2026:

- repo-centric `W0` is working in live `n8n`
- repo-centric `W2A` bootstrap/pose-plan nodes are working in live `n8n`
- repo-centric `W2A` isolated builder branch is working in live `n8n`
- the only remaining `W2A` simulation failure is the final completion upsert because the test branch uses a fake per-item order id (`TEST-ORDER-016-ITEM-001`) that does not exist in `orders`
- the first repo-centric `W2B` seam is now committed in repo code and export form:
  - [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2b/build-worklist/route.ts)
  - [w2b-worklist.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w2b-worklist.ts)
  - [w2B-main-orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json)
- repo-centric `W2B` is now proven live in `n8n` through workflow `KhMxEgo57Deo1QWu` (`REPO - w2B-main-orchestrator`)
- the end-to-end Book 1 false-branch proof point is execution `32970`, which successfully:
  - built the repo-owned worklist
  - fanned out through `s2B-sw`
  - merged and uploaded `2b-manifest.json`
  - completed the backend callback
- the all-poses-skipped path is also now working after the skipped-branch/backend hardening pass
- archived order review now shows the expected Post-Bria flagged count for the Book 1 proof order, and the backend UI has a fallback to render background-removed images even when archived orders surface them under the generic pose list
- we are intentionally **not** spending time fixing legacy sibling subworkflows like `SW0/SW1/SW2/SW3` for this repo-centric track unless a specific bridge is proven necessary

This means the repo-centric migration has cleared `W2B`. The next work is a thin-first `W3` seam plus minimal bridge fixes only if testing proves they are required.

## What is already done

- Pull current `main` first, then use these code-bearing commits as anchors:
  - `1aaaf11` `Advance repo-centric workflow migration and config runtime`
  - `fd951d3` `Capture working repo W0 and prepare W2A testing`
  - `c220269` `Fix repo W2A simulation order ids`
  - `edf0f7a` `Implement repo-centric W2B worklist seam`
  - `ce53708` `Harden repo-centric W2B skipped branch`
  - `25c8ede` `Make 2B skipped webhook tolerate fallback ids`
  - `d2f6e72` `Preserve webhook ids in repo-centric W2B skipped path`
  - `1d577f8` `Handle n8n stream responses in repo-centric W2B`
  - `26d8dae` `Parse n8n buffer-list responses in repo-centric W2B`
  - `d8c61cb` `Restore W2B manifest context after SW1`
  - `16b6481` `Lazy-load archived orders on orders page`
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
  - `REPO - w2B-main-orchestrator`
- The live repo-centric `W2A` workflow id is:
  - `HduzTWm0ekmrvwrn`
- The live repo-centric `W2B` workflow id is:
  - `KhMxEgo57Deo1QWu`
- The repo-centric workflow exports live in:
  - [w0-Order_Intake_Validation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json)
  - [w2A-Orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json)
  - [w2B-main-orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json)
- The sibling workflow folder was restored as the legacy/current n8n-centric master set for the normal live flow, and the repo-centric migration track now has its own canonical edit area in:
  - [repo-centric](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric)

## Immediate next steps

1. Derive the first repo-centric `W3` main orchestrator from the sibling `W3` export once, check it into [repo-centric](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric), and keep the sibling/live `W3` path untouched.
2. Add a repo-owned internal `W3` intake/helper seam that owns webhook normalization plus book/order/page/manifest-path resolution from `1-manifest` and `2b-manifest`.
3. Keep the first `W3` slice thin: move page-plan and manifest decisions into repo code, but keep render/PDF/upload orchestration in `n8n`.
4. Prove one Book 1 repo-centric `W3` run against the same order family used for `W2B`, then confirm the current downstream reader still consumes the output cleanly.
5. Only patch legacy `W3` bridge nodes if testing proves a specific context or pass-through gap.
6. After live proof, refresh the checked-in repo-centric `W3` export from the tested live workflow and add the workflow id plus evidence here.

## Best source-of-truth docs

- [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)
- [w0-Order_Intake_Validation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json)
- [w2A-Orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json)
- [w2B-main-orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json)

## Open blockers / waiting items

- There is still no real Book 2 config or asset set, so Book 1 remains the only realistic dress rehearsal.
- The repo-centric `W2A` completion-upsert simulation cannot pass with `TEST-ORDER-016-ITEM-001` because there is no matching `orders` row. That is expected and should not block `W2B`.
- Repo-centric `W2B` is proven, but repo-centric `W3` does not exist yet as a committed live-tested copy.
- Archived orders can still expose background-removed images through `r2Assets.poses` instead of `posesBgRemoved`; the backend UI now compensates for that, but the API shape is still worth normalizing later.
- A stale open editor tab in n8n can still execute an older local copy even after the server workflow has been updated. Reopen or hard refresh before trusting a live test.

## Repo / branch / PR / CI state

- Repo: `/Users/jeff/Projects/little-hero-books`
- Branch: `main`
- Pull current `main`, then use the code-bearing anchors above for the W2B proof trail.
- Remote state: pushed to `origin/main`
- Worktree should be clean after this handoff commit is created

## Recommended opening prompt for the next chat

Continue from the repo-centric `W2B` proof point and start the first thin repo-centric `W3` seam. Derive a repo-centric `W3` export from the sibling copy once, keep active edits only in the repo-centric folder, move webhook normalization plus book/order/page/manifest resolution into a repo-owned internal helper/route, and keep the rest of the first `W3` slice in `n8n` orchestration. Use Book 1 as the dress rehearsal, prove one live repo-centric `W3` run, and do not widen the slice unless testing proves a specific legacy bridge fix is required.
