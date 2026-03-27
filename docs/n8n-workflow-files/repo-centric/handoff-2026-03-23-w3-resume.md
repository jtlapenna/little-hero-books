# Repo-Centric Workflow Handoff — 2026-03-24 — Post-W4.1 Resume

## Current objective

Resume from the proven repo-centric Book 1 baseline through `W3`, `W4`, and `W4.1`, preserve the working thin-first seams, and push the next work onto actual Book 2 readiness rather than another Book 1 print cut.

## Exact pause point

As of March 23, 2026 (with live proof executions landing on March 24, 2026 UTC):

- repo-centric `W0`, `W2A`, `W2B`, `W3`, `W4`, and `W4.1` are now all proven in live `n8n` on Book 1
- the decisive `W2B` proof point remains execution `32970` on workflow `KhMxEgo57Deo1QWu` (`REPO - w2B-main-orchestrator`)
- repo-centric `W3` is now proven on workflow `D4rQ0zJG8JlKhZqq` (`REPO - w3-Book-Assembly`)
- the decisive disposable `W3` proof points are executions `33061` and `33062`
- the fresh verified proof order for readback/artifact checks is `W3-REPO-PROOF-20260323-231121-safe-v3`
- `GET /api/orders/W3-REPO-PROOF-20260323-231121-safe-v3` now returns `manifest3Url`
- preview artifacts and `3-manifest.json` for that proof order return `200`
- repo-centric `W4` remains proven through workflow `m4qIN9PCgifUcYih` (`REPO - w4-PRODUCTION-Print_Fulfillment`), with execution `33149` proving the synthetic `TEST_MODE` short-circuit and safe submit path
- repo-centric `W4.1` is now proven through workflow `boWA0mB20qYK2g4x` (`REPO - w4.1-Sibling-Aggregation`)
- the decisive safe `W4.1` proof point is execution `33181`, which preserved both sibling order ids end to end, kept `backendUrl=https://admin.littleherolabs.com`, preserved direct-webhook `CONFIG.defaults.testMode=true`, and wrote per-child `4-manifest.json`, interior PDF, and cover PDF under both child order roots
- the W4.1 proof group was:
  - `441-0324-161613-item-1`
  - `441-0324-161613-item-2`
- the current pause point is no longer “start W3” or “prove W4.1”; it is “use the proven Book 1 repo-centric print path as the baseline and begin real Book 2 config/fixture onboarding”

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
- repo-centric `W4.1` proved:
  - repo-owned sibling-group intake normalization and child-order manifest/order-root resolution
  - repo-owned post-PDF aggregation, signed-url assembly, Lulu payload building, and safe submit-guard decisions
  - fixed per-sibling context reattachment through PDFMonkey polling, post-download reattachment, and QA reattachment
  - safe `__skipLulu` execution with only synthetic `TEST_MODE` identifiers and no real Lulu job creation
  - per-child `4-manifest.json`, interior PDF, and cover PDF landing under both child order roots
- the first `W3` implementation plan already exists in:
  - [REPO-CENTRIC-W3-THIN-FIRST-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/REPO-CENTRIC-W3-THIN-FIRST-PLAN.md)

## Immediate next steps

1. Before making any change, check these files first:
   - [handoff-2026-03-19-w2b-next.md](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-19-w2b-next.md)
   - [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)
   - [REPO-CENTRIC-W3-THIN-FIRST-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/REPO-CENTRIC-W3-THIN-FIRST-PLAN.md)
2. Treat [w4.1-Sibling-Aggregation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w4.1-Sibling-Aggregation.repo-centric.json), live workflow `boWA0mB20qYK2g4x`, and execution `33181` as the current proven print-path baseline.
3. If you need live evidence, inspect executions `33149` and `33181` through the n8n API first.
4. Use proof order `W3-REPO-PROOF-20260323-231121-safe-v3` for the current single-book print-path baseline and sibling group `441-0324-161613` for the current grouped-print baseline.
5. Shift the next work onto Book 2 fixture/config onboarding and local replay coverage over the already-proven repo-centric print path.

## Best source-of-truth docs

- [handoff-2026-03-19-w2b-next.md](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-19-w2b-next.md)
- [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)
- [REPO-CENTRIC-W3-THIN-FIRST-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/REPO-CENTRIC-W3-THIN-FIRST-PLAN.md)
- [w2B-main-orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json)
- [w3-Book-Assembly.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w3-Book-Assembly.repo-centric.json)
- [w4-PRODUCTION-Print_Fulfillment.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w4-PRODUCTION-Print_Fulfillment.repo-centric.json)
- [w4.1-Sibling-Aggregation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w4.1-Sibling-Aggregation.repo-centric.json)
- [test-book-kernel.ts](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-book-kernel.ts)

## Open blockers / waiting items

- There is still no real Book 2 authored config or asset set beyond the first scaffolding work, so Book 2 remains unproven live.
- The next concrete execution slice is Book 2 fixture/config onboarding on the proven repo-centric print path.
- W4.1 is proven by direct webhook and n8n API inspection, but router-driven or customer-triggered grouped-print entry is still intentionally untouched in this phase.

## Repo / branch / PR / CI state

- Repo: `/Users/jeff/Projects/little-hero-books`
- Branch: `main`
- Last pushed commit before the current repo-centric `W4` / `W4.1` follow-up work: `df848fd` (`Prove repo-centric W3 assembly seam`)
- Current worktree state at pause:
  - repo-centric `W4` / `W4.1` implementation files, workflow exports, follow-up proof fixes, and supporting doc updates are present and uncommitted until the current commit is created

## Recommended opening prompt for the next chat

Start by reading `/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-19-w2b-next.md` and `/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md`. Then inspect live workflow `boWA0mB20qYK2g4x` and execution `33181` via the n8n API, treat repo-centric `W4.1` as proven on Book 1, and continue with Book 2 config/fixture onboarding plus local replay coverage on the proven repo-centric print path.
