# Repo-Centric Workflow Handoff — 2026-03-23 — W3 Next

## Current objective

Continue moving Book 1 through the repo-centric thin-n8n path so the repo owns more of the book logic and `n8n` becomes mostly orchestration. The first repo-centric `W3` slice is now proven, so the next target is choosing the next thin slice after `W3`.

## Exact pause point

As of March 23, 2026 (with live proof executions landing on March 24, 2026 UTC):

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
- the first repo-centric `W3` seam is now committed in repo code and export form:
  - [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-assembly-input/route.ts)
  - [w3-assembly-input.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w3-assembly-input.ts)
  - [test-w3-assembly-input.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-w3-assembly-input.ts)
  - [w3-Book-Assembly.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w3-Book-Assembly.repo-centric.json)
- repo-centric `W3` is now proven live in `n8n` through workflow `D4rQ0zJG8JlKhZqq` (`REPO - w3-Book-Assembly`)
- the decisive disposable proof points are executions `33061` and `33062`, which successfully:
  - entered through `book-assembly-repo`
  - consumed the repo-owned `/api/internal/w3/build-assembly-input` seam
  - generated preview images and uploaded `3-manifest.json`
  - completed the backend callback
  - wrote `manifest_3_url` back to `orders`
  - logged the correct per-book `orderId` and `pagesGenerated`
- `GET /api/orders/[orderId]` now again returns `manifest3Url` for the new proof orders after the order-path hint normalization fix in [order-paths.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/order-paths.ts)
- archived order review now shows the expected Post-Bria flagged count for the Book 1 proof order, and the backend UI has a fallback to render background-removed images even when archived orders surface them under the generic pose list
- we are intentionally **not** spending time fixing legacy sibling subworkflows like `SW0/SW1/SW2/SW3` for this repo-centric track unless a specific bridge is proven necessary

This means the repo-centric migration has cleared `W2B` and the first thin `W3` seam. The next work is choosing the next thin slice after `W3`, with replay/readback hardening and `W4` entry work as the leading options.

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
  - `/api/internal/w3/build-assembly-input`
- Live repo-centric workflows exist in n8n:
  - `REPO - w0 - Order Intake & Validation`
  - `REPO - w2A-Orchestrator`
  - `REPO - w2B-main-orchestrator`
  - `REPO - w3-Book-Assembly`
- The live repo-centric `W2A` workflow id is:
  - `HduzTWm0ekmrvwrn`
- The live repo-centric `W2B` workflow id is:
  - `KhMxEgo57Deo1QWu`
- The live repo-centric `W3` workflow id is:
  - `D4rQ0zJG8JlKhZqq`
- The repo-centric workflow exports live in:
  - [w0-Order_Intake_Validation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json)
  - [w2A-Orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json)
  - [w2B-main-orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json)
  - [w3-Book-Assembly.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w3-Book-Assembly.repo-centric.json)
- The sibling workflow folder was restored as the legacy/current n8n-centric master set for the normal live flow, and the repo-centric migration track now has its own canonical edit area in:
  - [repo-centric](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric)

## Immediate next steps

1. Before changing code or workflows, read these files in order:
   - [handoff-2026-03-19-w2b-next.md](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-19-w2b-next.md)
   - [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)
   - [REPO-CENTRIC-W3-THIN-FIRST-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/REPO-CENTRIC-W3-THIN-FIRST-PLAN.md)
2. Treat repo-centric `W3` as proven and use the checked-in export plus workflow `D4rQ0zJG8JlKhZqq` as the new baseline.
3. If you need proof evidence, start with executions `33061` and `33062`; inspect them through the n8n API, not only the UI.
4. Prefer the next incremental slice after `W3`, with `W4` print-path entry and replay/readback hardening as the leading candidates.
5. Extend local replay coverage into the proven `W3` reader/output path before widening the live cutover.
6. Only patch legacy `W3` or `W4` bridge nodes if testing proves a specific context or pass-through gap.

## Best source-of-truth docs

- [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)
- [REPO-CENTRIC-W3-THIN-FIRST-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/REPO-CENTRIC-W3-THIN-FIRST-PLAN.md)
- [w0-Order_Intake_Validation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json)
- [w2A-Orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json)
- [w2B-main-orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json)
- [w3-Book-Assembly.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w3-Book-Assembly.repo-centric.json)

## Open blockers / waiting items

- There is still no real Book 2 config or asset set, so Book 1 remains the only realistic dress rehearsal.
- The repo-centric `W2A` completion-upsert simulation cannot pass with `TEST-ORDER-016-ITEM-001` because there is no matching `orders` row. That is expected and should not block `W2B`.
- The next migration slice after `W3` is not chosen yet.
- Local replay coverage still stops short of fully exercising the new `W3` reader/output contract.
- Archived orders can still expose background-removed images through `r2Assets.poses` instead of `posesBgRemoved`; the backend UI now compensates for that, but the API shape is still worth normalizing later.
- A stale open editor tab in n8n can still execute an older local copy even after the server workflow has been updated. Reopen or hard refresh before trusting a live test.

## Repo / branch / PR / CI state

- Repo: `/Users/jeff/Projects/little-hero-books`
- Branch: `main`
- Pull current `main`, then use the code-bearing anchors above for the W2B proof trail.
- Remote state: pushed to `origin/main`
- Worktree contains the repo-centric `W3` implementation plus supporting doc updates until the current commit is created

## Recommended opening prompt for the next chat

Continue from the proven repo-centric `W3` baseline. Start by reading `/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-19-w2b-next.md`, `/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md`, and `/Users/jeff/Projects/little-hero-books/docs/book-2-planning/REPO-CENTRIC-W3-THIN-FIRST-PLAN.md`, then inspect workflow `D4rQ0zJG8JlKhZqq` and executions `33061` / `33062` via the n8n API. Treat repo-centric `W3` as proven, then choose the next thin migration slice after `W3`, with `W4` entry work and replay/readback hardening as the leading candidates.
