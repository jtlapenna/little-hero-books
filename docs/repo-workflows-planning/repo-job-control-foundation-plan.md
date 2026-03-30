# Repo Job-Control Foundation Plan

**Purpose:** define the backend-side control-plane capabilities required before most long-running workflow orchestration can safely leave `n8n`.
**Status:** In progress
**Created:** 2026-03-24

Companion docs:

- [book2-hybrid-move-from-n8n.md](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/book2-hybrid-move-from-n8n.md)
- [BOOK-2-IMPLEMENTATION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/BOOK-2-IMPLEMENTATION-PLAN.md)
- [REPO-CENTRIC-W2A-W2B-EXPANSION-PLAN.md](/Users/jeff/Projects/little-hero-books/docs/book-2-planning/REPO-CENTRIC-W2A-W2B-EXPANSION-PLAN.md)

---

## Goal

Make it safe to move most workflow execution out of `n8n` without losing the operational guarantees that `n8n` currently provides for free.

This is not a request-handler rewrite. It is a control-plane buildout.

The required backend replacements are:

- queueing
- idempotent claiming
- retries with attempt tracking
- external polling orchestration
- dead-letter and replay paths
- run visibility and artifact breadcrumbs

Without these, moving long-running `W2A`, `W2B`, or `W3` execution into repo handlers would make the system less safe and harder to operate.

---

## Why this now

The thin repo-centric seams are now proven through `W3`, `W4`, and `W4.1` on Book 1. That proves the shared contracts and path semantics.

What is still mostly `n8n` is not the book kernel anymore. It is the control plane:

- scheduling
- fan-out / fan-in
- retries
- waits and polling
- run inspection
- manual reruns

So the next strategic question is no longer “can repo code own the business logic?” That answer is already yes.

The next question is “what backend foundation do we need before repo code can own most execution safely?”

---

## Non-goals

This plan does not require:

- immediate removal of `n8n`
- immediate replacement of the router
- moving paid-print submission out of `n8n` first
- adding a full distributed-workflow engine
- live Book 2 proof before Book 2 assets exist

The target is a pragmatic bridge:

- repo-owned execution logic
- repo-owned worker/job semantics
- `n8n` retained only where it still adds operational leverage

---

## Required capabilities

## 1. Queueing and idempotent claims

The backend must be able to:

- enqueue stage work with a stable idempotency key
- claim jobs without double-starting them
- lease work to a worker with expiration
- heartbeat or extend a lease for long-running work
- release or retry timed-out work safely

Minimum semantics:

- one active lease per job
- deterministic dedupe by `job_type + order_id + stage + logical_key`
- explicit `queued`, `claimed`, `running`, `polling`, `succeeded`, `failed`, `dead_lettered`, and `canceled` states

## 2. Attempt tracking and retries

The backend must track:

- attempt number
- attempt start and end timestamps
- failure reason
- retryability
- next retry time

Retry behavior must be explicit:

- bounded retries
- backoff rules per job type
- retryable vs terminal failure classification

## 3. Polling for external providers

Long-running providers like Gemini, Bria, PDFMonkey, and Lulu require polling state that outlives a single request.

The backend must support:

- starting an external request
- storing the external tracking id / status URL
- resuming polling later
- transitioning from `running` to `polling` to `succeeded` or `failed`

This is the main reason long-running steps should not simply move into Next.js request handlers.

## 4. Dead-letter and replay

The backend must support:

- terminal dead-letter state after retry exhaustion
- replaying a failed job from a stored input snapshot
- replaying a whole stage or a single logical item
- preserving the original input, normalized input, and final outcome summary

Replay is a product requirement for this pipeline, not just a debugging nicety.

## 5. Run visibility

Before a major `n8n` reduction, the backend needs a minimally usable run timeline.

At minimum each job/run should expose:

- current state
- order identifiers
- book/stage/job type
- attempt count
- external request ids
- artifact keys and manifest keys
- last error
- timestamps for queued/claimed/running/polling/completed

This does not need to be a full UI first, but it must be queryable and inspectable.

---

## Proposed primitives

## Job records

Add backend-owned durable records for:

- `workflow_jobs`
  - one row per logical job
- `workflow_job_attempts`
  - one row per execution attempt
- `workflow_job_events`
  - append-only state transitions and debug breadcrumbs

Suggested `workflow_jobs` fields:

- `id`
- `job_type`
- `stage`
- `order_id`
- `root_order_id`
- `amazon_order_id`
- `book_id`
- `logical_key`
- `idempotency_key`
- `status`
- `lease_owner`
- `lease_expires_at`
- `attempt_count`
- `max_attempts`
- `next_retry_at`
- `external_provider`
- `external_request_id`
- `external_status_url`
- `input_snapshot`
- `normalized_input_snapshot`
- `result_snapshot`
- `last_error`
- `created_at`
- `updated_at`

Suggested `workflow_job_attempts` fields:

- `id`
- `job_id`
- `attempt`
- `status`
- `worker_kind`
- `started_at`
- `ended_at`
- `duration_ms`
- `error_message`
- `error_details`

Suggested `workflow_job_events` fields:

- `id`
- `job_id`
- `attempt_id`
- `event_type`
- `payload`
- `created_at`

## Code shape

Recommended repo modules:

- `back-end/src/lib/workflow-jobs/types.ts`
- `back-end/src/lib/workflow-jobs/repository.ts`
- `back-end/src/lib/workflow-jobs/idempotency.ts`
- `back-end/src/lib/workflow-jobs/claiming.ts`
- `back-end/src/lib/workflow-jobs/retries.ts`
- `back-end/src/lib/workflow-jobs/polling.ts`
- `back-end/src/lib/workflow-jobs/replay.ts`
- `back-end/src/lib/workflow-jobs/logging.ts`

First landed foundation slice:

- idempotent SQL migration at [`migration-add-workflow-jobs.sql`](/Users/jeff/Projects/little-hero-books/docs/database/migration-add-workflow-jobs.sql)
- repo module scaffold at [`back-end/src/lib/workflow-jobs/`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs)
- migration helper at [`apply-workflow-jobs-migration.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/apply-workflow-jobs-migration.ts)
- focused primitive test at [`test-workflow-jobs.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-workflow-jobs.ts)

## Current landed status

As of the March 25, 2026 cleanup state in Los Angeles time:

- the user has already applied [`migration-add-workflow-jobs.sql`](/Users/jeff/Projects/little-hero-books/docs/database/migration-add-workflow-jobs.sql) to the real database
- the backend `workflow_jobs` foundation is live in repo code under [`back-end/src/lib/workflow-jobs/`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/)
- repo-centric `W2B` proof is complete through the real provider-backed path and `workflow_jobs`
- repo-centric `W2A` proof is complete through the full top-level live path and `workflow_jobs`
- backend enqueue / claim / start now happens on the repo seams through:
  - [`build-worklist/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2b/build-worklist/route.ts)
  - [`build-pose-input/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2b/build-pose-input/route.ts)
  - [`w2b-pose-jobs.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w2b-pose-jobs.ts)
  - [`resolve-pose-worklist/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2a/resolve-pose-worklist/route.ts)
  - [`build-pose-input/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w2a/build-pose-input/route.ts)
  - [`w2a-pose-jobs.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w2a-pose-jobs.ts)
- submit / poll / fail / complete event logging is wired into the repo-centric W2B and W2A workflow exports:
  - [`w2B-sw1-single-pose.repo-centric.json`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-sw1-single-pose.repo-centric.json)
  - [`w2A-SW1-Pose_Generation.repo-centric.json`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-SW1-Pose_Generation.repo-centric.json)
- the March 25 cleanup restored the repo `W2A` route to:
  - queue manager `TDwc85g03FqPf9D6`
  - orchestrator `HduzTWm0ekmrvwrn`
  - webhook `2a-start-repo`
- the stale legacy `W2A` pair was deactivated on March 25, 2026 after live backup export:
  - queue manager `n67NaAC0reqS7YUr`
  - orchestrator `sJogOTPUevnHGEka`
  - legacy webhook `2a-start`
- the remaining operational follow-up is understanding why `HduzTWm0ekmrvwrn` was found inactive unexpectedly on March 25, 2026 before being reactivated
- a thin operator recovery surface now exists for `W2A` at:
  - [`w2a-recovery.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w2a-recovery.ts)
  - [`route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/w2a-recovery/route.ts)
  - [`page.tsx`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w2a-recovery/page.tsx)
- a broader read-only operator visibility surface now exists for shared `workflow_jobs` inspection at:
  - [`workflow-jobs-monitor.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs-monitor.ts)
  - [`route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/workflow-jobs/route.ts)
  - [`page.tsx`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/workflow-jobs/page.tsx)
- the first durable `W3` stage-job slice is now landed in repo code and deployed on the live backend seam through:
  - [`w3-assembly-jobs.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w3-assembly-jobs.ts)
  - [`build-assembly-input/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-assembly-input/route.ts)
  - [`workflow-3-complete/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/workflow-3-complete/route.ts)
- the repo-centric `W3` export now also writes durable provider submit / poll / failure telemetry and closes the stage job from the live workflow graph through:
  - [`w3-Book-Assembly.repo-centric.json`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w3-Book-Assembly.repo-centric.json)
  - [`test-w2-workflow-contracts.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-w2-workflow-contracts.ts)
- `W3` preview provider orchestration now also runs through the repo-owned backend route:
  - [`w3-pdfmonkey-preview.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w3-pdfmonkey-preview.ts)
  - [`route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/render-preview-document/route.ts)
  - thin code-node adapters in [`w3-Book-Assembly.repo-centric.json`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w3-Book-Assembly.repo-centric.json)
  - [`test-w3-preview-render.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-w3-preview-render.ts)
- `W3` page/cover preview planning and `3-manifest` assembly now also run through repo-owned backend routes:
  - [`w3-preview-plan.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w3-preview-plan.ts)
  - [`w3-manifest.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w3-manifest.ts)
  - [`route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-preview-plan/route.ts)
  - [`route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-manifest/route.ts)
  - thin code-node adapters in [`w3-Book-Assembly.repo-centric.json`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w3-Book-Assembly.repo-centric.json)
  - [`test-w3-preview-plan.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-w3-preview-plan.ts)
  - [`test-w3-manifest.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-w3-manifest.ts)
- a fresh disposable live proof on March 26, 2026 confirms the end-to-end `W3` lifecycle after those fixes:
  - execution `34181`
  - order `W3-WFJ-PROOF-20260326195258-safe-v3`
  - `workflow_jobs.id = 130` and attempt `92` both `succeeded`
  - order row finalized to `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4`
- a later March 26 disposable rerun confirms the extracted preview transport path itself:
  - execution `34291`
  - order `W3-WFJ-PROOF-20260326195258-safe-v3`
  - `workflow_jobs.id = 134` and attempt `96` both `succeeded`
  - stale pre-fix proof jobs `131`, `132`, and `133` were explicitly closed as `failed`, returning the order's `workflow_jobs` active count to `0`
- a latest March 26 disposable rerun confirms the extracted preview-planning + manifest-assembly path itself:
  - execution `34304`
  - order `W3-WFJ-PROOF-20260326195258-safe-v3`
  - `workflow_jobs.id = 135` reached `succeeded` with terminal event `completed`
  - order row again finalized to `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4`
- a latest March 26 router-driven disposable rerun confirms the real backend-router -> sibling `W1.1` -> repo-`W3` path after the follow-up hardening:
  - backend [`cron/router`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/cron/router/route.ts) now forwards `one_manifest_key`, `manifest_2b_url`, and `manifest_3_url` so sibling `W1.1` does not depend on `one_manifest_url`
  - sibling [`Prep Workflow 3 Orders`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w1.1-Queue_Manager_and_Router.json) now derives `orderPrefix` / `bookId` from the available manifest-path hints, [`Trigger Workflow 3`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w1.1-Queue_Manager_and_Router.json) now posts to `book-assembly-repo`, and [`Verify Order Claimed (3)`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w1.1-Queue_Manager_and_Router.json) now preserves those hints through the claim step
  - queue-manager execution `34315` is the clean proof after those three fixes
  - order `W3-WFJ-PROOF-20260326195258-safe-v3`
  - `workflow_jobs.id = 136` and attempt `98` both `succeeded`
  - the event stream ended with terminal `completed` event `992`
  - order row again finalized to `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4`
- a latest March 26 imported-live rerun confirms the currently imported cloud `W3` graph and the currently deployed production backend together:
  - production backend initially returned `404` for `/api/internal/w3/prepare-assembly-run`, `/api/internal/w3/collect-preview-images`, and `/api/internal/w3/mark-previews-ready`, which showed the live workflow import had outrun the backend deploy
  - Pages revision [`fefdc390.little-hero-labs-admin.pages.dev`](https://fefdc390.little-hero-labs-admin.pages.dev) fixed that by deploying the new repo-owned `W3` routes to production
  - a fresh backend-router trigger then processed order `W3-WFJ-PROOF-20260326195258-safe-v3`
  - `workflow_jobs.id = 137` and attempt `99` both `succeeded`
  - the event stream ended with terminal `completed` event `1076`
  - order row again finalized to `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4`
- a latest-latest March 26 router-driven disposable rerun confirms the extracted preview-artifact materialization path too:
  - repo worker [`w3-preview-artifacts.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workers/w3-preview-artifacts.ts) and backend route [`route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/materialize-preview-artifact/route.ts) now own the PDFMonkey PNG download, R2 upload, and best-effort Cloudflare Images publish for both page previews and the cover spread
  - Pages revision [`96d5e0b2.little-hero-labs-admin.pages.dev`](https://96d5e0b2.little-hero-labs-admin.pages.dev) deployed that new route to production
  - the live `w3-Book-Assembly` graph was updated with thin code-node adapters calling `/api/internal/w3/materialize-preview-artifact` for page and cover artifacts
  - a fresh backend-router trigger then processed order `W3-WFJ-PROOF-20260326195258-safe-v3`
  - `workflow_jobs.id = 138` and attempt `100` both `succeeded`
  - the event stream ended with terminal `completed` event `1162`
  - order row again finalized to `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4`
- a latest-latest-latest March 26 router-driven disposable rerun confirms the extracted manifest-publish tail too:
  - repo worker [`w3-manifest-publish.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workers/w3-manifest-publish.ts) and backend route [`route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/publish-manifest/route.ts) now own the `3-manifest` upload plus post-`W3` order-row / review-stage persistence
  - Pages revision [`51306134.little-hero-labs-admin.pages.dev`](https://51306134.little-hero-labs-admin.pages.dev) deployed that new route to production
  - the live `w3-Book-Assembly` graph was updated so `Prep Manifest Upload (3)` calls `/api/internal/w3/publish-manifest` and the legacy `Upload 3 Manifest to R2`, `Fetch and Merge Review Stages (3)`, and `Supabase Upsert 3` nodes are now thin pass-through adapters
  - a fresh backend-router trigger then processed order `W3-WFJ-PROOF-20260326195258-safe-v3`
  - `workflow_jobs.id = 139` and attempt `101` both `succeeded`
  - the event stream ended with terminal `completed` event `1244`
  - order row again finalized to `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4`
  - order `status` also returned to `pending_assembly_review`, which proves the repo-owned publish-manifest path persisted the post-`W3` review state correctly
- a latest-latest-latest-latest March 26 direct disposable replay confirms the remaining `W3` assembly-entry glue is thin too:
  - the live `w3-Book-Assembly` graph was updated so `Idempotency Check` is now a pass-through adapter, `Extract Manifest URL (3)` is now a thin code-node adapter calling [`/api/internal/w3/build-assembly-input`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-assembly-input/route.ts), and `Build Assembly Input From Manifest` is now a pass-through adapter
  - repo verification passed with `npm --prefix back-end run test:w2-workflow-contracts` and `npm --prefix back-end run test:w3-assembly-input`
  - a fresh direct replay against `book-assembly-repo` with `claimedAt = 2026-03-27T04:19:12Z` processed order `W3-WFJ-PROOF-20260326195258-safe-v3`
  - `workflow_jobs.id = 141` reached `succeeded`
  - the event stream ended with terminal `completed` event `1414`
  - order row again finalized to `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4`
  - an overlapping earlier proof helper had also created redundant `workflow_jobs.id = 140`; after `141` succeeded, `140` was explicitly marked `canceled` so the order returned to zero active `W3` jobs
- a latest-latest-latest-latest-latest March 26 backend deploy + direct disposable replay confirms the shared workflow-job event logger now preserves terminal W3 attempt state:
  - backend route [`/api/internal/workflow-jobs/log-event`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/workflow-jobs/log-event/route.ts) now ignores late non-terminal `attemptStatus` / `jobStatus` regressions when the current attempt or job is already terminal
  - repo verification passed with `npm --prefix back-end run test:workflow-jobs`
  - Pages revision [`9079c930.little-hero-labs-admin.pages.dev`](https://9079c930.little-hero-labs-admin.pages.dev) deployed that logger fix to production
  - the previously bad historical row `workflow_job_attempts.id = 103` was repaired to `status = succeeded` and audit-marked with event `attempt-status-reconciled` on `workflow_jobs.id = 141`
  - a fresh direct replay against `book-assembly-repo` with `claimedAt = 2026-03-27T04:38:54Z` processed order `W3-WFJ-PROOF-20260326195258-safe-v3` into `workflow_jobs.id = 142`
  - an accidental overlapping replay from an earlier hanging curl also completed as `workflow_jobs.id = 143`, but both jobs finished cleanly and the order returned to zero active `W3` jobs
  - the regression proof is `workflow_job_attempts.id = 104`: it finished with `status = succeeded` and `ended_at = 2026-03-27T04:43:42.860Z` while `workflow_jobs.id = 142` ended `succeeded` with terminal `completed` event `1580`
  - order row again finalized to `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4`
- a latest-latest-latest-latest-latest-latest March 26 backend deploy + live overlap proof confirms the `W3` duplicate-run guard now cancels the losing rerun instead of letting two active jobs proceed:
  - repo helper [`w3-assembly-jobs.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w3-assembly-jobs.ts) now re-checks for the canonical earliest active `W3` job after enqueue and after claim
  - if a later duplicate row is visible, it is immediately audit-marked `duplicate-trigger-superseded`, canceled, and the caller is redirected to the winner, which receives append-only event `duplicate-trigger-skipped`
  - repo verification again passed with `npm --prefix back-end run test:workflow-jobs`, and Pages revision [`f5deb17d.little-hero-labs-admin.pages.dev`](https://f5deb17d.little-hero-labs-admin.pages.dev) deployed the fix to production
  - two near-simultaneous direct POSTs to live webhook `book-assembly-repo` with `claimedAt = 2026-03-27T05:14:10Z` and `2026-03-27T05:14:11Z` created `workflow_jobs.id = 146` and `147`
  - only `146` became active; `147` was canceled immediately with no claim and no attempt row
  - winner `146` logged `duplicate-trigger-skipped` naming skipped job `147`, and loser `147` logged `duplicate-trigger-superseded`
  - the winning replay later hit a separate `pageNumber = 7` `provider-failed` path and ended `failed`, but that forced-replay issue was subsequently fixed by the March 27 preview-poll hardening below; the overlap proof itself remains positive because there was only one active `W3` job at a time and the order returned to zero active `W3` jobs without another duplicate runner
  - the order row stayed at `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4` / `status = pending_assembly_review`
- a latest-latest-latest-latest-latest-latest-latest March 26 backend deploy + live completed-order replay proof confirms the repo-owned `W3` entry route now short-circuits already-complete orders by default:
  - [`build-assembly-input/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-assembly-input/route.ts) now looks up the current order row after normalizing input and returns `workflowSkipped = true` with reason `w3-order-already-complete` when the order is already complete
  - explicit `force: true` still bypasses that short-circuit, so later operator tooling can intentionally replay `W3`
  - repo verification passed with `npm --prefix back-end run test:w3-assembly-input`, `npm --prefix back-end run test:workflow-jobs`, and targeted lint on the touched route / test / workflow-job helper files
  - Pages revision [`2e6df527.little-hero-labs-admin.pages.dev`](https://2e6df527.little-hero-labs-admin.pages.dev) deployed the fix to production
  - production `/api/internal/w3/build-assembly-input` now returns `workflowSkipped = true` and null workflow-job ids for completed proof order `W3-WFJ-PROOF-20260326195258-safe-v3`
  - a fresh live POST to webhook `book-assembly-repo` with `claimedAt = 2026-03-27T05:24:10Z` created no new `workflow_jobs` rows; the latest `W3` job ids for that order remained `147`, `146`, and `145`
  - active `W3` job count for that proof order stayed at `0`
- a latest-latest-latest-latest-latest-latest-latest-latest March 27 backend deploy + forced live replay confirms the repo-owned `W3` preview poller now absorbs transient PDFMonkey poll-request failures instead of failing the run at page `7`:
  - repo helper [`w3-pdfmonkey-preview.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w3-pdfmonkey-preview.ts) now retries up to three consecutive poll-request transport errors before surfacing a hard preview failure
  - repo verification passed with `npm --prefix back-end run test:w3-preview-render`, and [`test-w3-preview-render.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-w3-preview-render.ts) now covers the exact first-poll-fails / later-poll-succeeds recovery path
  - Pages revision [`7b6affc5.little-hero-labs-admin.pages.dev`](https://7b6affc5.little-hero-labs-admin.pages.dev) deployed the fix to production
  - production `/api/internal/w3/render-preview-document` again returned the expected auth-protected `401` after deploy
  - a forced live replay through webhook `book-assembly-repo` with `claimedAt = 2026-03-27T07:04:00Z` processed order `W3-WFJ-PROOF-20260326195258-safe-v3` into `workflow_jobs.id = 148`
  - the old failure point did not recur: page `7` recorded `provider-submitted` plus `poll-tick` events `1865` through `1869`, ending with `pdfMonkeyStatus = success` instead of `provider-failed`
  - the same forced replay continued through the remaining page previews, cover preview, manifest publish, and completion callback without manual intervention
  - `workflow_jobs.id = 148` and `workflow_job_attempts.id = 109` both finished `succeeded`, the event stream ended with terminal `completed` event `1914`, and the order row remained `workflow_step = book_assembly_completed` / `execution_status = done` / `next_workflow = 4` / `status = pending_assembly_review`
- a separate router-config bug surfaced during the same proof and is now fixed:
  - backend `cron/router` had been falling back to stale webhook path `w1-1-router` when `N8N_ROUTER_WEBHOOK_URL` was unset
  - [`route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/cron/router/route.ts) now falls back to active live `W1.1` webhook path `w1-1-router-sibtest`
  - [env.example](/Users/jeff/Projects/little-hero-books/back-end/env.example) now documents the same active router path
  - after deploy, `GET /api/cron/router` returned `200` instead of the earlier `502` / `404 not registered`
- do not assume the repo route is still active from the cleanup alone; before future live `n8n` edits, run [`check-w2a-live-route.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/check-w2a-live-route.ts) to verify the workflow pair and repo webhook configuration without triggering a live run

Recommended stage-facing workers:

- `back-end/src/lib/workers/w2a-pose-worker.ts`
- `back-end/src/lib/workers/w2b-remove-bg-worker.ts`
- `back-end/src/lib/workers/w3-assembly-worker.ts`

---

## Migration sequence

## Phase A: Instrumentation without orchestration cutover

Keep `n8n` as the active orchestrator, but start writing backend job records for:

- enqueue
- claim
- stage start
- external submit
- poll tick
- completion
- failure

This builds visibility and replay metadata without changing live control flow yet.

Current status:

- foundation tables and repo primitives are landed
- repo-centric `W2B` proof is now complete through the real provider-backed path and `workflow_jobs`
- repo-centric `W2A` proof is now complete through the full top-level live path and `workflow_jobs`
- the March 25 cleanup restored the repo `W2A` route to:
  - queue manager `TDwc85g03FqPf9D6`
  - orchestrator `HduzTWm0ekmrvwrn`
  - webhook `2a-start-repo`
- the stale legacy `W2A` pair was deactivated on March 25, 2026 after live backup export:
  - queue manager `n67NaAC0reqS7YUr`
  - orchestrator `sJogOTPUevnHGEka`
  - legacy webhook `2a-start`
- thin operator visibility for `W2A` replay/finalize now exists in the admin surface:
  - [`route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/w2a-recovery/route.ts)
  - [`page.tsx`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w2a-recovery/page.tsx)
- stage-agnostic read-only `workflow_jobs` visibility now also exists in the admin surface:
  - [`route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/workflow-jobs/route.ts)
  - [`page.tsx`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/workflow-jobs/page.tsx)
- the next extraction target has now started in a deliberately narrow way:
  - `W3` start/completion now writes durable stage jobs on the existing backend seam
  - `claimedAt` is part of the `W3` logical key so deliberate reruns do not collapse into one `workflow_jobs` row
  - successful `3-manifest` callbacks now best-effort close the latest active `w3-book-assembly` job
  - the repo-centric `w3-Book-Assembly` export now logs `provider-submitted`, `poll-tick`, and `provider-failed` transitions for both page and cover PDFMonkey work, and `Complete Workflow Job (3)` now accepts persisted manifest fields after `Supabase Upsert 3`
  - page and cover preview submit/poll transport now runs through the repo-owned [`/api/internal/w3/render-preview-document`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/render-preview-document/route.ts) backend route, invoked from thin code-node adapters instead of raw-body HTTP Request nodes
  - page/cover preview planning now runs through the repo-owned [`/api/internal/w3/build-preview-plan`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-preview-plan/route.ts) backend route, invoked from thin code-node adapters instead of large code-node HTML/planning logic
  - `3-manifest` assembly now runs through the repo-owned [`/api/internal/w3/build-manifest`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/build-manifest/route.ts) backend route, invoked from a thin adapter instead of in-workflow manifest assembly code
  - disposable live proof `34181` / `W3-WFJ-PROOF-20260326195258-safe-v3` confirmed automatic end-to-end closure with a terminal `completed` event
  - disposable live rerun `34291` confirmed that the extracted preview transport path itself works live end to end, and the stale failed proof attempts were closed so the order now shows `activeCount = 0`
  - disposable live rerun `34304` confirmed that the extracted preview-planning + manifest-assembly path itself also works live end to end
  - router-driven disposable rerun `34315` confirmed that the real backend-router -> sibling `W1.1` -> repo-`W3` path now also works live end to end after the W1.1 manifest-context and webhook-path follow-up fixes
- single-order `W4` sandbox-only extraction is now also proven live on the current imported repo-centric workflow:
  - stage `4` now has durable job type `w4-print-fulfillment` and repo-owned pre-submit routes for render, PDF materialization, QA, manifest publish, and submit-input build
  - the currently imported live `W4` proof path is still sandbox-only by contract, but the repo submit builder is no longer hardcoded sandbox-only:
    - [`build-submit-input/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/build-submit-input/route.ts) and [`w4-submit-input.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w4-submit-input.ts) now support guarded `submitMode = "production"` and `production_dry_run` responses behind explicit `allowProductionLulu: true`
    - paid submit still fails closed unless env gate `ENABLE_LULU_PRODUCTION_SUBMIT=true` is enabled
    - proof/test/disposable ids and invalid production shipping addresses are rejected before submit shaping
    - the imported workflow export itself is still wired around the sandbox branch, so the repo gate is ahead of the live workflow cutover
  - webhook [`print-submitted/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/print-submitted/route.ts) now records sandbox completion into `workflow_jobs` without setting `print_submitted_at`, without setting `execution_status = done`, and without sending customer notifications
  - live disposable rerun `34451` proved the end-to-end extracted sandbox path after two backend hardening fixes (`print-submitted` structured-status acceptance and submit-input sandbox phone fallback)
  - `workflow_jobs.id = 154` and attempt `115` both finished `succeeded`, with terminal `completed` event `1972`
  - the proof order stayed non-production: `lulu_job_id = null`, `print_submitted_at = null`, `workflow_step = book_assembly_completed`, `execution_status = done`, `status = pending_assembly_review`
  - March 29, 2026 production-cutover checkpoint:
    - focused repo QA now covers production gate disabled, explicit dry-run validation, proof-order rejection, strict production shipping validation, and positive production contract shaping when the env gate is enabled
    - backend deploy revision [`98c9bc2b.little-hero-labs-admin.pages.dev`](https://98c9bc2b.little-hero-labs-admin.pages.dev) now corrects the paid-pilot classifier so old `W4.1` sandbox sibling proof rows no longer show up as single-order `W4` paid candidates
    - token-auth smoke reads on both the preview deploy and `admin.littleherolabs.com` now return `candidateCount = 0` / `preflightReady = 0` / `inspectOnly = 0` for `/api/admin/w4-production?hours=336&limit=10`
    - explicit inspection of old sandbox sibling proof row `441-0324-161613-item-2` now resolves to `proofLike = true`, `hasRealSubmission = false`, `recommendedAction = "none"`, and `safeForProductionPilot = false`, which confirms the remaining blocker is lack of a real candidate rather than preflight noise
    - after that classifier fix, a disposable non-proof pilot row `441-0329202-9000001` was created from the sandbox-safe address fixture, given a real copied `3-manifest`, and verified as `safeForProductionPilot = true` in `/api/admin/w4-production`
    - the imported live `W4` workflow initially still failed at `Fetch Repo W4 Print Input` with `401` because the imported `Config (W4) — PRODUCTION` node contained repo-redacted secrets; the live n8n state was rehydrated from local env values and backed up under `docs/n8n-workflow-files/repo-centric/live-backups/2026-03-29/`
    - forced production dry-run webhook proof on March 29, 2026 then succeeded end to end as live execution `34780`
    - that dry-run created `workflow_jobs.id = 159` / attempt `120`, both `succeeded`, and terminal event `2063` `completed`
    - the dry-run remained non-billable by contract: event payload `submitMode = "skip"`, `luluStatus = "DRY_RUN"`, `externalProvider = "lulu-sandbox"`, and the order row still has `lulu_job_id = null` / `print_submitted_at = null`
    - later live inspection confirmed the exact first paid-pilot payload that created Lulu job `2806186` already carried `expectedPageCount = 2`, `pageLabels = ["p00", "p01"]`, and interior key `book-mvp-simple-adventure/orders/441-0329202-9000001/interior_441-0329202-9000001.pdf`
    - that matches Lulu's rejection exactly, so the failure was a wrong/truncated print interior, not a hidden Lulu-side issue
    - repo helper [`w4-submit-input.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w4-submit-input.ts) now blocks that exact payload before submit with `productionGuard.reason = "page_count_invalid"` and details like `page_count_below_min:2<4`
    - preview deploy [`1ed8923a.little-hero-labs-admin.pages.dev`](https://1ed8923a.little-hero-labs-admin.pages.dev) now returns `submitMode = "skip"` for the exact paid-pilot payload when replayed as a production dry-run, proving the repo-side guard is active before Lulu
    - the same submit builder now supports an explicit recommended-address override (`shippingAddressRecommended` / `shippingAddressOverride`) so the next paid pilot can use Lulu's suggested address instead of the rejected order's raw stored address
    - disposable candidate `441-0329202-9000002` then proved the next corrected dry-run gap: its copied order prefix was missing preview images, so QA failed on preview fetch `404`
    - repo worker [`w4-print-worker.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workers/w4-print-worker.ts) now reuses an already-materialized target PDF in R2 via `HEAD` instead of forcing another download/upload cycle, and route [`materialize-print-pdf/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/materialize-print-pdf/route.ts) now always records workflow-job events so that seam cannot leave a job stuck in `polling`
    - a corrected full-book candidate `441-0329202-9000003` was then created from source order `111-6724117-8781030`, including the full asset subtree
    - corrected dry-run replay on the imported live workflow finished cleanly as execution `34798`
    - that replay created `workflow_jobs.id = 163` / attempt `124`, both `succeeded`, with terminal event `2140` `completed`
    - the corrected dry-run remained non-billable by contract: `submitMode = "skip"`, `luluStatus = "DRY_RUN"`, `externalProvider = "lulu-sandbox"`, `lulu_job_id = null`, and `print_submitted_at = null`
    - the next live dry-run on disposable candidate `441-0329202-9000002` exposed a safety bug in the imported workflow wiring itself: QA-failed runs were still reaching terminal `completed`
    - repo exports now correct that branch order for both `W4` and `W4.1`:
      - `IF QA Passed` / `IF QA Passed (W4.1)` now route false-output to the dedicated QA-failure handler and true-output to submit aggregation
      - `W4.1` now also explicitly coerces `qaPassed` before the IF comparison so the sibling path follows the same boolean contract as `W4`
      - live workflows `m4qIN9PCgifUcYih` and `boWA0mB20qYK2g4x` were patched in place from those corrected exports
    - the regression proof is dry-run `workflow_jobs.id = 166` / attempt `127` on order `441-0329202-9000002`: it ended `failed` with latest event `qa-failed`, while earlier bad runs `164` and `165` had incorrectly ended `succeeded` after recording `qa-failed`
    - no new Lulu production job was created during that verification
    - repo helper [`w4-production-approval.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w4-production-approval.ts) now issues short-lived order-scoped approval tokens, and [`w4-submit-input.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w4-submit-input.ts) now blocks any real paid `W4` submit without one (`approval_missing` / `approval_invalid`)
    - admin API/page [`/api/admin/w4-production`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/w4-production/route.ts) and [`/admin/w4-production`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w4-production/page.tsx) now mint those short-lived approval tokens for safe inspected orders without contacting Lulu
    - deploy revision [`654dc7eb.little-hero-labs-admin.pages.dev`](https://654dc7eb.little-hero-labs-admin.pages.dev) is live, and a smoke POST minted a 30-minute approval token for disposable candidate `441-0329202-9000002`
    - repo helper [`w4-submit-input.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w4-submit-input.ts) now also maps Amazon-style `STANDARD` shipping to Lulu `MAIL` instead of `GROUND`, while preserving explicit ground requests, and focused regressions in [`test-w4-submit-input.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-w4-submit-input.ts) lock that behavior
    - fresh candidate `441-0329202-9000006` proved that fix in live admin preflight: `/api/admin/w4-production` returned `safeForProductionPilot = true`, `productionGuard.reason = "production_ready"`, and `shippingLevelSent = "MAIL"`
    - the first retry attempt on `441-0329202-9000006` still stayed non-production because the env gate was turned back off immediately after webhook acceptance; admin workflow telemetry recorded `workflow_jobs.id = 174` / attempt `135` `succeeded` with terminal payload `submitMode = "skip"` / `externalProvider = "lulu-sandbox"`, which clarified the operational rule that the gate must stay enabled until the async run crosses submit
    - fresh candidate `441-0329202-9000007` was then created from `441-0329202-9000006` with the corrected address and full print assets, keeping all Lulu submission state clear
    - after re-enabling `ENABLE_LULU_PRODUCTION_SUBMIT`, deploying revision [`4157307b.little-hero-labs-admin.pages.dev`](https://4157307b.little-hero-labs-admin.pages.dev), minting a short-lived approval token, and keeping the gate enabled until the async stage crossed submit, live webhook `w4-pdf-print-repo` accepted the second paid pilot and `workflow_jobs.id = 175` / attempt `136` finished `succeeded`
    - terminal workflow telemetry now proves the real paid seam after the shipping fix: `submitMode = "production"`, `nonProduction = false`, `externalProvider = "lulu"`, `luluJobId = "2806687"`, and `luluStatus = "CREATED"`
    - order `441-0329202-9000007` now records `lulu_job_id = 2806687` and `print_submitted_at = 2026-03-30T04:30:34.193`
    - after manual cancellation in Lulu, shared helper [`buildLuluOrderUpdate(...)`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/lulu-status-map.ts) now normalizes post-submit status patches across the refresh route, Lulu webhook route, and admin cancel route:
      - `SHIPPED` no longer backfills `delivered_at`
      - terminal `CANCELED` / `REJECTED` states now set `print_fulfillment_finished_at`
      - fresh live admin refresh on `441-0329202-9000007` now returns `luluStatus = "CANCELED"`, `status = "cancelled"`, and `print_fulfillment_finished_at = 2026-03-30T04:51:57.067486+00:00`
    - repo helper [`w4-production-preflight.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w4-production-preflight.ts) now exposes a webhook freshness signal from `lulu_webhook_log` through [`/api/admin/w4-production`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/w4-production/route.ts) and [`/admin/w4-production`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w4-production/page.tsx), so operators can see whether Lulu lifecycle state arrived automatically or only by manual refresh
    - backend deploy revision [`6e333530.little-hero-labs-admin.pages.dev`](https://6e333530.little-hero-labs-admin.pages.dev) carries that signal, and both preview + production now show `webhookSignal.latestStatus = "CANCELED"` / `deliveryState = "received"` / `deliveryReason = "latest_webhook_applied"` for order `441-0329202-9000007`
    - raw webhook log verification for `2806687` is now explicit in repo memory too: `UNPAID` -> `PRODUCTION_DELAYED` -> `CANCELED`, all `updated = true`, which means automatic Lulu webhook delivery is working end to end for the paid pilot
    - the env gate was then turned back off and redeployed to revision [`e597d018.little-hero-labs-admin.pages.dev`](https://e597d018.little-hero-labs-admin.pages.dev)
- the next decision is no longer whether `W2A` / `W2B` instrumentation works; it is whether to:
  - investigate why `HduzTWm0ekmrvwrn` was found inactive unexpectedly on March 25, 2026 and had to be reactivated, and/or
  - finish the remaining `W4` / `W4.1` repo-worker extraction and operator tooling while keeping Lulu production cutover explicitly out of scope

## Phase B: Move W2A and W2B per-item execution behind repo workers

This is the first high-value extraction target because:

- it is long-running
- it fans out heavily
- it contains large code-node payload transforms
- it is the least attractive logic to maintain in workflow JSON

Target split:

- repo owns per-item normalization, prompt building, asset-key derivation, provider payloads, poll-state normalization, result normalization, and manifest-ready outputs
- `n8n` can still trigger and observe until backend job control is trusted

## Phase C: Move W3 render/assembly execution behind repo workers

After W2A/W2B worker semantics are proven:

- move W3 render planning, PDFMonkey orchestration, polling, preview generation planning, and manifest output orchestration behind backend jobs
- current state:
  - the backend seam now owns `W3` stage-job claim/start and completion marking
  - the repo-centric live workflow now emits durable `W3` provider submit / polling / failure / completed telemetry into `workflow_jobs`
  - PDFMonkey preview submit/poll work now runs in repo code behind [`/api/internal/w3/render-preview-document`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w3/render-preview-document/route.ts), with `n8n` reduced to thin transport adapters for that slice
  - the remaining `W3` gap is now narrower: page/cover preview planning, manifest assembly, and full stage orchestration still execute inside `n8n` rather than repo workers

## Phase D: Evaluate W4 / W4.1 orchestration extraction

Do not move paid-print submission out of `n8n` until the backend job-control path is already trusted on lower-risk stages.

Current status:

- the single-order `W4` sandbox-only proof path is now trusted enough to continue extraction work:
  - durable job control exists
  - repo-owned render / materialize / QA / manifest / submit-input seams are live
  - live execution `34451` ended `success` with `workflow_jobs.id = 154` / attempt `115` both `succeeded`
  - the proof stayed sandbox-only and did not create a production Lulu submission or customer-facing lifecycle change
  - a separate read-only paid-pilot console now exists at [`/admin/w4-production`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w4-production/page.tsx), backed by [`/api/admin/w4-production`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/w4-production/route.ts) and repo helper [`w4-production-preflight.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w4-production-preflight.ts)
  - that console never submits to Lulu; it only dry-runs repo-owned `W4` print + submit shaping with redacted URL signing and exposes whether a real paid pilot is blocked by approval, shipping, env gates, proof-order markers, or existing submission state
  - backend deploy revision [`152bbb34.little-hero-labs-admin.pages.dev`](https://152bbb34.little-hero-labs-admin.pages.dev) now serves that page/API, and token-auth smoke reads succeeded on both the preview deploy and `admin.littleherolabs.com`
  - operator-facing W4 recovery now exists at [`/admin/w4-recovery`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w4-recovery/page.tsx), backed by [`/api/admin/w4-recovery`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/w4-recovery/route.ts) and [`w4-recovery.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w4-recovery.ts)
  - that recovery surface is intentionally fail-closed for paid-print safety: it only replays through live webhook `w4-pdf-print-repo`, refuses any order with `lulu_job_id` / `lulu_status` / `print_submitted_at`, and relies on the extracted sandbox-only W4 submit path
  - the repo export [`w4-PRODUCTION-Print_Fulfillment.repo-centric.json`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w4-PRODUCTION-Print_Fulfillment.repo-centric.json) is now safer for the future paid cutover:
    - internal route-adapter nodes now read `CONFIG.backendApiToken` instead of embedding a literal backend bearer token
    - the legacy `Lulu PRODUCTION` token + submit nodes now fail closed unless `submitMode = "production"` and `__skipLulu` is false
  - secret scan coverage now explicitly detects hardcoded `Authorization: 'Bearer …'` workflow-export headers via [`workflow-export-secrets.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-export-secrets.ts)
  - first real paid-pilot checkpoint on March 29, 2026:
    - disposable non-proof order `441-0329202-9000001` was used for the first production pilot
    - live execution `34782` reached real Lulu production submit and created `lulu_job_id = 2806186`
    - the only repo bug exposed was post-submit persistence: active node `Process Lulu Response` passed a structured Lulu status object downstream, and `Build 4-Manifest JSON` then failed while trying to persist that object into `orders.lulu_status`
    - repo helper [`w4-print-worker.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workers/w4-print-worker.ts), webhook [`print-submitted/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/print-submitted/route.ts), and export [`w4-PRODUCTION-Print_Fulfillment.repo-centric.json`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w4-PRODUCTION-Print_Fulfillment.repo-centric.json) now normalize structured Lulu status before persistence
    - backend deploy revision [`d42fc14d.little-hero-labs-admin.pages.dev`](https://d42fc14d.little-hero-labs-admin.pages.dev) and the live workflow patch carry that fix
    - cleanup re-ran only the repo-owned manifest publish step, persisted `lulu_job_id = 2806186` / `lulu_status = "CREATED"`, and explicitly completed `workflow_jobs.id = 160` / attempt `121` without invoking customer notifications
    - a fresh admin Lulu refresh then showed the real job had already moved to `REJECTED`, so the order now sits at `status = action_required`, `error_type = lulu_rejected`, and `print_submitted_at = null`
    - practical meaning: the paid single-order `W4` seam is proven through Lulu acceptance, the post-submit persistence gap is closed, and the next paid pilot should be a deliberate second pilot only after both the new page-count guard and Lulu-recommended address override are applied
- `W4.1` now has the first operator-facing sibling recovery surface and a clean sandbox-only live proof:
  - admin page [`/admin/w41-recovery`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w41-recovery/page.tsx) is backed by [`/api/admin/w41-recovery`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/w41-recovery/route.ts) and repo helper [`w41-recovery.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w41-recovery.ts)
  - it inspects stage-`4.1` durable jobs by sibling root group, blocks replay when any sibling already has real Lulu submission state, and replays only through live webhook `w4-1-sibling-aggregation-repo`
  - webhook [`print-submitted/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/print-submitted/route.ts) is now hardened for grouped fallback too: if a `W4.1` callback ever arrives without shared workflow-job ids but still includes `rootGroupId` + `orderIds`, the shared sibling job still closes once via [`completeW4SiblingJobForGroup(...)`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w4-sibling-jobs.ts)
  - repo export [`w4.1-Sibling-Aggregation.repo-centric.json`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w4.1-Sibling-Aggregation.repo-centric.json) now carries `rootGroupId` into `print-submitted`, and [`test-book-kernel.ts`](/Users/jeff/Projects/little-hero-books/back-end/scripts/test-book-kernel.ts) locks that contract
  - backend deploy revisions [`07bd770d.little-hero-labs-admin.pages.dev`](https://07bd770d.little-hero-labs-admin.pages.dev), [`f3be4c88.little-hero-labs-admin.pages.dev`](https://f3be4c88.little-hero-labs-admin.pages.dev), and [`3c4a040b.little-hero-labs-admin.pages.dev`](https://3c4a040b.little-hero-labs-admin.pages.dev) now serve the page/API, grouped callback hardening, and the sandbox submit-input config preservation fix
  - three disposable proof attempts exposed and closed the remaining repo seams in order: missing QA renderer token fallback, admin replay `backendUrl` incorrectly set to `http://localhost:3001`, and sibling submit-input sandbox shaping dropping `CONFIG.backendApiToken` before post-submit manifest publish
  - after those repo/backend fixes, admin-triggered replay job `workflow_jobs.id = 158` and attempt `119` both finished `succeeded` with terminal `completed`, and the sibling group disappeared from `/admin/w41-recovery` candidate listings
  - the successful proof remained non-billable: terminal event payload recorded `submitMode = "skip"`, `nonProduction = true`, `externalProvider = "lulu-sandbox"`, `luluJobId = "TEST-441-0324-161613"`, and `luluStatus = "TEST_MODE"`
- `W4.1` now also has the first grouped paid-cutover slice, but still no paid submit path:
  - grouped paid-print preflight helper [`w41-production-preflight.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w41-production-preflight.ts) now inspects by `rootGroupId`, summarizes grouped child readiness, and fails closed on proof-like or already-submitted groups
  - grouped approval-token helper [`w41-production-approval.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w41-production-approval.ts) now mints short-lived sibling-root approval tokens, scoped to one grouped paid-print candidate
  - admin API [`/api/admin/w41-production`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/w41-production/route.ts) and admin page [`/admin/w41-production`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w41-production/page.tsx) are now live in backend deploy revision [`940d16d6.little-hero-labs-admin.pages.dev`](https://940d16d6.little-hero-labs-admin.pages.dev)
  - preview deploy and production [`admin.littleherolabs.com`](https://admin.littleherolabs.com) both now return the same fail-closed result for known sandbox sibling proof group `441-0324-161613`: `candidateCount = 0`, `safeForProductionPilot = false`, `recommendedReason = "proof_or_non_production_group"`
  - practical meaning: grouped production inspection and approval are now repo-owned, but grouped paid Lulu submit is still intentionally unreachable
- the next `W4` work should stay explicitly non-billable:
  - keep `W4.1` production-Lulu cutover out of the sandbox proof thread
  - design separate production-Lulu cutover plans with hard guardrails, explicit paid-job approvals, and rollback criteria instead of blending them into the sandbox proof path
  - the planning artifact for that next step now exists at [`w4-production-lulu-cutover-plan.md`](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/w4-production-lulu-cutover-plan.md)
  - the sibling-group follow-on artifact now also exists at [`w41-production-lulu-cutover-plan.md`](/Users/jeff/Projects/little-hero-books/docs/repo-workflows-planning/w41-production-lulu-cutover-plan.md)

---

## Recommended first implementation batch

The first implementation batch for this foundation should be narrow:

1. define durable job types and status enums in repo code
2. add repository helpers plus idempotency-key helpers
3. add local tests for claim/retry/replay state transitions
4. instrument the next repo-centric `W2A` / `W2B` seams to emit stable logical ids and external tracking ids
5. keep `n8n` as the live caller until visibility is good enough to trust replay

This avoids a big-bang control-plane rewrite.

---

## Acceptance criteria

This foundation should be considered good enough for the first real orchestration extraction only when:

1. a logical stage item can be enqueued idempotently
2. only one worker can hold the active lease for that item
3. retries are bounded and visible
4. external polling can resume from durable state after process interruption
5. failed items can be replayed from stored input snapshots
6. an operator can inspect the current state and last error without opening `n8n`

---

## Practical takeaway

The next phase is not “rewrite everything in the backend.”

It is:

**build the backend job-control primitives that make a larger repo-centric migration safe, then use `W2A` and `W2B` as the first serious execution slices on top of that foundation.**
