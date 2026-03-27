# Repo-Centric Workflow Handoff — 2026-03-24 — Workflow Jobs / W2B Instrumentation Baseline

> Update — March 25, 2026: this baseline handoff is now superseded by [handoff-2026-03-25-w2a-live-proof-cleanup.md](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-25-w2a-live-proof-cleanup.md). Use the March 25 handoff for current continuation state; keep this file as the earlier workflow-jobs instrumentation baseline.

## Current objective

Continue the backend job-control foundation needed to move more long-running execution out of `n8n` safely, using repo-centric `W2B` single-pose background-removal as the first narrow live path.

This is now the highest-value workstream. The Book 1 repo-centric `W0` / `W2A` / `W2B` / `W3` / `W4` / `W4.1` seams are already proven enough to shift attention from more thin route helpers to control-plane durability:

- queueing
- idempotent claims
- attempt tracking
- polling state
- replay metadata
- run visibility

## Exact pause point

As of March 24, 2026 in Los Angeles time, with the direct proof writes landing on March 25, 2026 UTC:

- the user has already applied [`migration-add-workflow-jobs.sql`](/Users/jeff/Projects/little-hero-books/docs/database/migration-add-workflow-jobs.sql) to the real database
- the backend `workflow_jobs` foundation is now landed in repo code under [`back-end/src/lib/workflow-jobs/`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/)
- the first narrow live path is repo-centric `W2B` single-pose execution
- backend enqueue / claim / start instrumentation is now live in:
  - [`build-worklist/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2b/build-worklist/route.ts)
  - [`build-pose-input/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2b/build-pose-input/route.ts)
  - [`w2b-pose-jobs.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w2b-pose-jobs.ts)
- the imported repo-centric W2B single-pose subworkflow now logs:
  - `provider-submitted`
  - `poll-tick`
  - `provider-failed`
  - `completed`
- that live imported W2B subworkflow id is:
  - `4fxha79xAEaYEBYb`
- the live repo-centric top-level W2B workflow still pointing at it is:
  - `KhMxEgo57Deo1QWu`
- the backend deploy containing this instrumentation is live at:
  - [b68ca9fc.little-hero-labs-admin.pages.dev](https://b68ca9fc.little-hero-labs-admin.pages.dev)
- I directly proved the event trail on both the preview deploy and `https://admin.littleherolabs.com` using disposable W2B pose jobs, and both reached:
  - `workflow_jobs.status = succeeded`
  - `workflow_job_attempts.status = succeeded`
  - `result_snapshot` present
- the disposable proof order ids were:
  - `W2B-JOB-PROOF-20260325040518`
  - `W2B-JOB-PROD-20260325040555`
- those proof rows were deleted afterward, so they were only temporary verification artifacts
- I did **not** trigger a fresh full Bria-backed top-level W2B run after this instrumentation pass, by design, to avoid unnecessary paid / real provider activity

The real pause point is:

- the backend job-control foundation is no longer just planned
- repo-centric `W2B` is the first instrumented live execution slice
- the next decision is whether to:
  - inspect the next real repo-centric `W2B` run through `workflow_jobs`, or
  - extend the same instrumentation pattern to repo-centric `W2A`

## What is already done

- The control-plane foundation files now exist in repo code:
  - [`types.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/types.ts)
  - [`idempotency.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/idempotency.ts)
  - [`claiming.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/claiming.ts)
  - [`retries.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/retries.ts)
  - [`polling.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/polling.ts)
  - [`logging.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/logging.ts)
  - [`replay.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/replay.ts)
  - [`repository.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/repository.ts)
  - [`index.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/index.ts)
- The migration helper exists in:
  - [`apply-workflow-jobs-migration.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/apply-workflow-jobs-migration.ts)
- The focused primitive tests exist in:
  - [`test-workflow-jobs.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-workflow-jobs.ts)
- `W2B` worklist and pose-input contracts now carry workflow-job ids and attempt ids through:
  - [`w2b-worklist.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w2b-worklist.ts)
  - [`w2b-pose-input.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w2b-pose-input.ts)
- The generic event-ingest route exists in:
  - [`log-event/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/workflow-jobs/log-event/route.ts)
- The repo-centric W2B subworkflow export with logger nodes is:
  - [`w2B-sw1-single-pose.repo-centric.json`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-sw1-single-pose.repo-centric.json)
- The W2 contract / export coverage now includes:
  - [`test-w2-workflow-contracts.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-w2-workflow-contracts.ts)
- Latest explicit local checks passed:
  - `npm --prefix /Users/jeff/Projects/little-hero-books/back-end run test:workflow-jobs`
  - `npm --prefix /Users/jeff/Projects/little-hero-books/back-end run test:w2b-worklist`
  - `npm --prefix /Users/jeff/Projects/little-hero-books/back-end run test:w2b-pose-input`
  - `npm --prefix /Users/jeff/Projects/little-hero-books/back-end run test:w2-workflow-contracts`
  - `npm --prefix /Users/jeff/Projects/little-hero-books/back-end run test:book-kernel`

## Immediate next steps

1. Start by reading these files in order:
   - [handoff-2026-03-19-w2b-next.md](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-19-w2b-next.md)
   - [handoff-2026-03-24-workflow-jobs-w2b.md](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-24-workflow-jobs-w2b.md)
   - [repo-job-control-foundation-plan.md](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/repo-job-control-foundation-plan.md)
   - [REPO-CENTRIC-W2A-W2B-EXPANSION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/REPO-CENTRIC-W2A-W2B-EXPANSION-PLAN.md)
2. Treat repo-centric `W2B` single-pose as the current proving ground for backend job control.
3. Before widening scope, inspect the next real repo-centric `W2B` execution through the `workflow_jobs`, `workflow_job_attempts`, and `workflow_job_events` tables to confirm the live provider path produces the same event trail as the disposable proofs.
4. After that, extend the same pattern to repo-centric `W2A`:
   - enqueue / claim / start on the repo seam
   - submit / poll / fail / complete logging in the imported subworkflow
5. Do **not** move Bria / Gemini / PDFMonkey / Lulu polling fully into backend request handlers yet. The current phase is still instrumentation and control-plane hardening, not orchestration cutover.

## Best source-of-truth docs

- [repo-job-control-foundation-plan.md](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/repo-job-control-foundation-plan.md)
- [REPO-CENTRIC-W2A-W2B-EXPANSION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/REPO-CENTRIC-W2A-W2B-EXPANSION-PLAN.md)
- [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)
- [migration-add-workflow-jobs.sql](/Users/jeff/Projects/little-hero-books/docs/database/migration-add-workflow-jobs.sql)
- [w2B-main-orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json)
- [w2B-sw1-single-pose.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-sw1-single-pose.repo-centric.json)
- [build-worklist/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2b/build-worklist/route.ts)
- [build-pose-input/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2b/build-pose-input/route.ts)
- [w2b-pose-jobs.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w2b-pose-jobs.ts)
- [log-event/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/workflow-jobs/log-event/route.ts)

## Open blockers / waiting items

- There is still no fresh full real Bria-backed repo-centric `W2B` execution after the job instrumentation landed. That is the main missing proof point.
- Repo-centric `W2A` has not been instrumented with the same workflow-job trail yet.
- `n8n` is still the active control plane for fan-out, retries, waits, and polling. That is intentional at this phase.
- There is still no backend operator UI for `workflow_jobs`; inspection currently depends on SQL / Supabase access.
- A stale open editor tab in `n8n` can still run an older local workflow copy even after the server version is updated. Reopen or hard refresh before trusting a live run.

## Repo / branch / PR / CI state

- Repo: `/Users/jeff/Projects/little-hero-books`
- Branch: `main`
- Remote: `origin/main`
- Current worktree is dirty with uncommitted repo-centric workflow, Book 2, W4 / W4.1, W2A / W2B, and workflow-jobs changes
- No PR is open from this working state
- I did **not** run a global CI/build sweep; the verified checks are the targeted commands listed above
- Latest backend deploy containing this W2B instrumentation is:
  - [b68ca9fc.little-hero-labs-admin.pages.dev](https://b68ca9fc.little-hero-labs-admin.pages.dev)

## Recommended opening prompt for the next chat

Continue from the workflow-jobs instrumentation baseline. Start by reading `/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-19-w2b-next.md`, `/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-24-workflow-jobs-w2b.md`, and `/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/repo-job-control-foundation-plan.md`. Treat repo-centric `W2B` single-pose as the first instrumented live path, inspect the next real `W2B` execution through `workflow_jobs`, and then extend the same enqueue / claim / submit / poll / complete event pattern to repo-centric `W2A`.
