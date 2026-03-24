# Repo-Centric Workflow Handoff — 2026-03-23 — W3 Resume

## Current objective

Resume from the proven repo-centric `W3` baseline, preserve the working thin-first seam, and choose the next migration slice without regressing the normal sibling/live `W3` flow.

## Exact pause point

As of March 23, 2026 (with live proof executions landing on March 24, 2026 UTC):

- repo-centric `W0`, `W2A`, `W2B`, and the first thin repo-centric `W3` slice are now proven in live `n8n`
- the decisive `W2B` proof point remains execution `32970` on workflow `KhMxEgo57Deo1QWu` (`REPO - w2B-main-orchestrator`)
- repo-centric `W3` is now proven on workflow `D4rQ0zJG8JlKhZqq` (`REPO - w3-Book-Assembly`)
- the decisive disposable `W3` proof points are executions `33061` and `33062`
- the fresh verified proof order for readback/artifact checks is `W3-REPO-PROOF-20260323-231121-safe-v3`
- `GET /api/orders/W3-REPO-PROOF-20260323-231121-safe-v3` now returns `manifest3Url`
- preview artifacts and `3-manifest.json` for that proof order return `200`
- the current pause point is no longer “start W3”; it is “use the proven W3 baseline and decide the next thin slice”

## What is already done

- repo-centric workflow edits are now explicitly isolated to:
  - `/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/`
- sibling workflow exports remain the normal live `n8n` master set under:
  - `/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/`
- repo-owned seams already exist for:
  - `/api/internal/w0/build-manifest`
  - `/api/internal/w0/upsert-order`
  - `/api/internal/w2a/resolve-pose-worklist`
  - `/api/internal/w2a/bootstrap-manifest`
  - `/api/internal/w2a/build-run-manifest`
  - `/api/internal/w2b/build-worklist`
  - `/api/internal/w3/build-assembly-input`
- repo-centric `W2B` proved:
  - repo-owned worklist resolution
  - skipped-path handling
  - `s2B-sw` fan-out
  - `2b-manifest.json` merge and upload
  - backend completion callback
- repo-centric `W3` proved:
  - repo-owned webhook/input normalization and manifest-path resolution
  - companion `1-manifest` + `2b-manifest` loading in repo code
  - page-plan and processed-image selection in repo code
  - canonical `3-manifest.json` derivation at the resolved order root
  - preview generation, manifest upload, and backend completion through the live repo-centric workflow
  - corrected `Log Assembly Results` output (`orderId`, `pagesGenerated`)
  - corrected `manifest3Url` readback through `GET /api/orders/[orderId]`
- the first `W3` implementation plan already exists in:
  - [REPO-CENTRIC-W3-THIN-FIRST-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/REPO-CENTRIC-W3-THIN-FIRST-PLAN.md)

## Immediate next steps

1. Before making any change, check these files first:
   - [handoff-2026-03-19-w2b-next.md](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-19-w2b-next.md)
   - [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)
   - [REPO-CENTRIC-W3-THIN-FIRST-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/REPO-CENTRIC-W3-THIN-FIRST-PLAN.md)
2. Treat [w3-Book-Assembly.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w3-Book-Assembly.repo-centric.json) and live workflow `D4rQ0zJG8JlKhZqq` as the proven W3 baseline.
3. If you need live evidence, inspect executions `33061` and `33062` through the n8n API first.
4. Use proof order `W3-REPO-PROOF-20260323-231121-safe-v3` for the most recent end-to-end readback checks.
5. Choose the next thin slice after `W3`, with `W4` entry work and replay/readback hardening as the leading candidates.

## Best source-of-truth docs

- [handoff-2026-03-19-w2b-next.md](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-19-w2b-next.md)
- [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)
- [REPO-CENTRIC-W3-THIN-FIRST-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/REPO-CENTRIC-W3-THIN-FIRST-PLAN.md)
- [w2B-main-orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json)
- [w3-Book-Assembly.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w3-Book-Assembly.repo-centric.json)
- [test-book-kernel.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-book-kernel.ts)

## Open blockers / waiting items

- There is still no real Book 2 authored config or assets, so Book 1 remains the only dress rehearsal target.
- The next migration slice after `W3` is not chosen yet.
- Local replay coverage still does not exercise the new `W3` reader/output contract.

## Repo / branch / PR / CI state

- Repo: `/Users/jeff/Projects/little-hero-books`
- Branch: `main`
- Last pushed commit before the current repo-centric `W3` work: `6275f79` (`Restore Post-Bria flagged cards from manifest state`)
- Current worktree state at pause:
  - repo-centric `W3` implementation files plus supporting doc updates are present and uncommitted until the current commit is created

## Recommended opening prompt for the next chat

Start by reading these files in order: `/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-19-w2b-next.md`, `/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md`, and `/Users/jeff/Projects/little-hero-books/docs/book-2-planning/REPO-CENTRIC-W3-THIN-FIRST-PLAN.md`. Then inspect live workflow `D4rQ0zJG8JlKhZqq` and executions `33061` / `33062` via the n8n API, treat repo-centric `W3` as proven, and continue with the next thin migration slice after `W3`, with `W4` entry work and replay/readback hardening as the leading candidates.
