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
- the next decision is no longer whether `W2A` / `W2B` instrumentation works; it is whether to:
  - investigate why `HduzTWm0ekmrvwrn` was found inactive unexpectedly on March 25, 2026 and had to be reactivated, and/or
  - move the remaining `W3` orchestration out of workflow JSON and behind repo workers

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
