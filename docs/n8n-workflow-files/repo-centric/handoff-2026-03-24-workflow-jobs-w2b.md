# Workflow Jobs Handoff — 2026-03-24 — W2B First Live Path

## Current objective

Use backend-owned `workflow_jobs` primitives to start replacing `n8n` control-plane responsibilities safely, beginning with repo-centric `W2B` single-pose background-removal as the first narrow live path.

This is not a full orchestration cutover yet. The current goal is:

- durable job identity
- enqueue / claim / start semantics
- append-only event logging for submit / poll / fail / complete
- enough run visibility and snapshots to trust the next extraction steps

## Exact pause point

Facts as of March 24, 2026 in Los Angeles time, with the disposable verification writes landing on March 25, 2026 UTC:

- the user already ran [`migration-add-workflow-jobs.sql`](/Users/jeff/Projects/little-hero-books/docs/database/migration-add-workflow-jobs.sql)
- repo code now owns the `workflow_jobs`, `workflow_job_attempts`, and `workflow_job_events` foundation through [`back-end/src/lib/workflow-jobs/`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/)
- the first narrow live path is repo-centric `W2B` single-pose
- backend enqueue / claim / start happens in:
  - [`build-worklist/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2b/build-worklist/route.ts)
  - [`build-pose-input/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2b/build-pose-input/route.ts)
  - [`w2b-pose-jobs.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w2b-pose-jobs.ts)
- the live imported repo-centric W2B single-pose subflow id is:
  - `4fxha79xAEaYEBYb`
- that imported subflow now logs to [`/api/internal/workflow-jobs/log-event`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/workflow-jobs/log-event/route.ts) on:
  - `provider-submitted`
  - `poll-tick`
  - `provider-failed`
  - `completed`
- the top-level repo-centric W2B workflow that still fans out into that subflow is:
  - `KhMxEgo57Deo1QWu`
- the instrumentation deploy is live at:
  - [b68ca9fc.little-hero-labs-admin.pages.dev](https://b68ca9fc.little-hero-labs-admin.pages.dev)

Direct proof status:

- I intentionally did **not** trigger a fresh real Bria-backed top-level W2B run after this instrumentation pass
- instead, I proved the backend event model directly on real infra with disposable W2B pose jobs
- preview-domain proof order:
  - `W2B-JOB-PROOF-20260325040518`
- production-domain proof order:
  - `W2B-JOB-PROD-20260325040555`
- both reached:
  - `workflow_jobs.status = succeeded`
  - `workflow_job_attempts.status = succeeded`
  - event trail:
    - `queued`
    - `claimed`
    - `started`
    - `provider-submitted`
    - `poll-tick`
    - `completed`
  - `result_snapshot` present
- those disposable rows were deleted after verification

The main remaining gap is plain:

- there is still no post-instrumentation proof from a full real provider-backed repo-centric W2B run

## What is already done

- Foundation modules landed:
  - [`types.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/types.ts)
  - [`idempotency.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/idempotency.ts)
  - [`claiming.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/claiming.ts)
  - [`retries.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/retries.ts)
  - [`polling.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/polling.ts)
  - [`logging.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/logging.ts)
  - [`replay.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/replay.ts)
  - [`repository.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/repository.ts)
  - [`index.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/index.ts)
- W2B-specific identity / claim helpers landed in:
  - [`w2b-pose-jobs.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w2b-pose-jobs.ts)
- The event route landed in:
  - [`log-event/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/workflow-jobs/log-event/route.ts)
- W2B contracts now preserve workflow-job ids in:
  - [`w2b-worklist.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w2b-worklist.ts)
  - [`w2b-pose-input.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w2b-pose-input.ts)
- Repo-centric W2B workflow contract coverage exists in:
  - [`test-w2-workflow-contracts.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-w2-workflow-contracts.ts)
- The instrumented W2B subflow export exists in:
  - [`w2B-sw1-single-pose.repo-centric.json`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-sw1-single-pose.repo-centric.json)

Latest explicit checks that passed:

- `npm --prefix /Users/jeff/Projects/little-hero-books/back-end run test:workflow-jobs`
- `npm --prefix /Users/jeff/Projects/little-hero-books/back-end run test:w2b-worklist`
- `npm --prefix /Users/jeff/Projects/little-hero-books/back-end run test:w2b-pose-input`
- `npm --prefix /Users/jeff/Projects/little-hero-books/back-end run test:w2-workflow-contracts`
- `npm --prefix /Users/jeff/Projects/little-hero-books/back-end run test:book-kernel`

## Immediate next steps

1. Inspect the next real repo-centric `W2B` execution in SQL or Supabase after it runs, and confirm the live provider path produces the same event trail as the disposable proofs.
2. If there is no naturally occurring W2B run soon, decide between:
   - a deliberate real W2B proof with awareness that it will touch Bria again, or
   - instrumenting repo-centric `W2A` next and proving its event trail first
3. Keep the current W2B top-level orchestration in `n8n` until the job-control records are trusted enough to support replay and operator inspection.
4. After one real W2B proof, extend the same pattern to `W2A`:
   - enqueue / claim / start from the repo seam
   - submit / poll / fail / complete logging from the imported subworkflow

## Best source-of-truth docs

- [handoff-2026-03-19-w2b-next.md](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-19-w2b-next.md)
- [repo-job-control-foundation-plan.md](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/repo-job-control-foundation-plan.md)
- [REPO-CENTRIC-W2A-W2B-EXPANSION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/REPO-CENTRIC-W2A-W2B-EXPANSION-PLAN.md)
- [migration-add-workflow-jobs.sql](/Users/jeff/Projects/little-hero-books/docs/database/migration-add-workflow-jobs.sql)
- [w2B-main-orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json)
- [w2B-sw1-single-pose.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-sw1-single-pose.repo-centric.json)

## Open blockers / waiting items

- Missing proof: a fresh full real provider-backed repo-centric W2B execution after instrumentation.
- `W2A` does not yet emit the same workflow-job trail.
- There is no backend operator UI for job inspection yet.
- The broader orchestration cutover is still blocked on more mature retry / replay / polling primitives, even though the data model is now started.

## Repo / branch / PR / CI state

- Repo: `/Users/jeff/Projects/little-hero-books`
- Branch: `main`
- Remote: `origin/main`
- Current worktree is dirty and uncommitted
- No PR is open from this state
- Latest targeted checks are green, but no full CI sweep was run in this handoff step

## Recommended opening prompt for the next chat

Continue from the workflow-jobs W2B instrumentation baseline. Read `/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-24-workflow-jobs-w2b.md`, `/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/handoff-2026-03-19-w2b-next.md`, and `/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/repo-job-control-foundation-plan.md`. Treat repo-centric W2B single-pose as the first live job-control path, inspect the next real W2B run through the `workflow_jobs` tables, and then decide whether to extend the same pattern to W2A or add replay / operator-view helpers next.
