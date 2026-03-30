# W4 Production Lulu Cutover Plan

## Summary

- Scope this plan to paid single-order `W4` first.
- Keep `W4.1` and sibling-group paid submission out of the first cutover batch.
- Treat sandbox proofing as complete enough to plan production, but not as permission to blend sandbox and paid paths.
- Goal: enable repo-owned `W4` production submit only behind explicit hard guardrails, with rollback defined before rollout.

## Current baseline

- Single-order `W4` sandbox-only repo extraction is proven live.
- `W4.1` sandbox-only sibling recovery and disposable proof are now proven live too.
- Admin recovery exists for `W4` and `W4.1`, but both are intentionally fail-closed and sandbox-only today.
- A separate read-only paid-pilot console now exists at [`/admin/w4-production`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w4-production/page.tsx), backed by [`/api/admin/w4-production`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/w4-production/route.ts) and repo helper [`w4-production-preflight.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w4-production-preflight.ts).
- Production Lulu nodes still exist in `n8n`, but the extracted proof paths do not use them.
- Phase 1 repo-side gating is now implemented in [`w4-submit-input.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w4-submit-input.ts):
  - default behavior stays sandbox-only unless `allowProductionLulu: true` is present
  - paid submit still fails closed unless `ENABLE_LULU_PRODUCTION_SUBMIT=true`
  - production dry-run validation is now possible without sending a Lulu job
  - proof/test/disposable ids and incomplete shipping addresses are rejected before submit shaping
- March 29, 2026 checkpoint:
  - there were initially zero real candidates, so a disposable non-proof pilot row `441-0329202-9000001` was created from the sandbox-safe shipping fixture
  - the imported live `W4` workflow had to be rehydrated in n8n because the repo-safe export still carried redacted config placeholders at runtime
  - after that rehydrate, a forced production dry-run on the live imported workflow succeeded end to end as execution `34780`
  - the dry-run created `workflow_jobs.id = 159` / attempt `120`, both `succeeded`, and terminal event `2063` `completed`
  - the dry-run stayed non-billable: `submitMode = "skip"`, `luluStatus = "DRY_RUN"`, `externalProvider = "lulu-sandbox"`, and the order row still has `lulu_job_id = null` / `print_submitted_at = null`
- Later on March 29, 2026 first paid-pilot checkpoint:
  - a real production pilot was run on the same disposable non-proof order after explicitly enabling the env gate and setting `allowProductionLulu: true`
  - live execution `34782` reached real Lulu submit and created `lulu_job_id = 2806186`
  - the run then failed after submit at `Build 4-Manifest JSON` because the active response path forwarded a structured Lulu status object and the repo manifest-publish step tried to persist that object into `orders.lulu_status`
  - repo helper [`w4-print-worker.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workers/w4-print-worker.ts), webhook [`print-submitted/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/print-submitted/route.ts), and export [`w4-PRODUCTION-Print_Fulfillment.repo-centric.json`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w4-PRODUCTION-Print_Fulfillment.repo-centric.json) now normalize structured Lulu status objects before persistence
  - backend deploy revision [`d42fc14d.little-hero-labs-admin.pages.dev`](https://d42fc14d.little-hero-labs-admin.pages.dev) and the live workflow patch carry that fix
  - cleanup re-ran only the repo-owned manifest publish step, persisted `lulu_job_id = 2806186` / `lulu_status = "CREATED"`, and explicitly completed `workflow_jobs.id = 160` / attempt `121` without invoking `print-submitted`
  - a fresh admin Lulu refresh then showed the real job had already moved to `REJECTED`, so the order is now `status = action_required`, `error_type = lulu_rejected`, `error_message = "One or more line-items were rejected."`, and `print_submitted_at = null`
- Latest March 29, 2026 rejection-root-cause checkpoint:
  - live Supabase inspection confirmed that the exact paid-pilot payload for `workflow_jobs.id = 160` already carried `expectedPageCount = 2`, `pageLabels = ["p00", "p01"]`, and interior key `book-mvp-simple-adventure/orders/441-0329202-9000001/interior_441-0329202-9000001.pdf`
  - that matches Lulu's rejection for job `2806186`: the selected saddle-stitch package expected `4` to `48` interior pages, so the paid pilot submitted the wrong/truncated print interior rather than a full print-ready book
  - repo helper [`w4-submit-input.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w4-submit-input.ts) now blocks that failure mode before submit with `productionGuard.reason = "page_count_invalid"`
  - preview deploy [`1ed8923a.little-hero-labs-admin.pages.dev`](https://1ed8923a.little-hero-labs-admin.pages.dev) now returns `submitMode = "skip"` / `guard.reason = "production_blocked"` / `productionGuard.reason = "page_count_invalid"` when the exact paid-pilot payload is replayed as a production dry-run
  - the same submit builder now accepts an explicit recommended-address override (`shippingAddressRecommended` / `shippingAddressOverride`) so the next paid pilot can use Lulu's suggested `123 SW Main St, Portland, OR 97204, US` address without mutating the historical rejected order
- Latest March 29, 2026 corrected dry-run checkpoint:
  - disposable candidate `441-0329202-9000002` exposed the next live gap after the page-count fix: its copied order prefix was missing preview images, so QA failed on preview fetch `404`
  - repo worker [`w4-print-worker.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workers/w4-print-worker.ts) now reuses an existing target PDF in R2 via `HEAD`, and route [`materialize-print-pdf/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/materialize-print-pdf/route.ts) now always records workflow-job events so that seam cannot strand a job in `polling`
  - corrected candidate `441-0329202-9000003` was created from full-book source order `111-6724117-8781030`, including the full asset subtree
  - corrected live production dry-run replay then finished cleanly as execution `34798`
  - that replay completed `workflow_jobs.id = 163` / attempt `124` with terminal event `2140` `completed`
  - the corrected dry-run stayed non-billable: `submitMode = "skip"`, `luluStatus = "DRY_RUN"`, `externalProvider = "lulu-sandbox"`, and the order row still has `lulu_job_id = null` / `print_submitted_at = null`
- Latest March 29, 2026 operator-approval checkpoint:
  - repo helper [`w4-production-approval.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w4-production-approval.ts) now issues and verifies short-lived production approval tokens for one specific W4 order
  - repo helper [`w4-submit-input.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w4-submit-input.ts) now blocks any non-dry-run `submitMode = "production"` request unless a valid approval token is present, with fail-closed reasons `approval_missing` / `approval_invalid`
  - admin API [`/api/admin/w4-production`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/w4-production/route.ts) now supports `POST` token minting for a safe inspected order, and admin page [`/admin/w4-production`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w4-production/page.tsx) exposes that token creation flow without submitting to Lulu
  - backend deploy revision [`654dc7eb.little-hero-labs-admin.pages.dev`](https://654dc7eb.little-hero-labs-admin.pages.dev) is live, and a smoke POST minted a 30-minute approval token for disposable candidate `441-0329202-9000002`
- The live imported single-order `W4` workflow is now proven for production dry-run, but a real paid pilot still needs explicit operator approval plus the env gate.
- The real paid-pilot seam is now also proven through Lulu acceptance, but the next paid pilot should still wait for the deferred secret rotation and an explicit operator approval action.
- The repo export is now hardened for that later cutover:
  - internal route-adapter nodes no longer embed a literal backend bearer token; they read `CONFIG.backendApiToken`
  - the legacy `Lulu PRODUCTION` token + submit nodes now fail closed unless `submitMode = "production"` and `__skipLulu` is false
  - workflow-export secret scanning now explicitly catches hardcoded `Authorization: 'Bearer …'` headers

## Non-negotiable safety rules

1. No production Lulu submission may happen from the current sandbox recovery endpoints.
2. Production submit must require an explicit repo-side opt-in, not just “not sandbox”.
3. Disposable proof orders, `TEST-*` markers, and any order flagged as non-production must be rejected before token fetch or submit.
4. Customer notifications must stay disabled until Lulu acceptance is persisted successfully and the repo has marked the workflow job `succeeded`.
5. Replay of any order with an existing real `lulu_job_id`, `lulu_status`, or `print_submitted_at` must remain inspect-only unless a separate operator override flow is designed and approved.
6. Production cutover must ship with a fast rollback that returns the live path to sandbox-only or back to the old n8n-owned submit path.

## Proposed cutover shape

### Phase 1: Repo-side production gating

- Extend [`build-submit-input/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/internal/w4/build-submit-input/route.ts) and [`w4-submit-input.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w4-submit-input.ts) so production submit is impossible unless all guards pass.
- Add a dedicated production gate object in the submit-input response, for example:
  - `submitMode: "production" | "sandbox" | "skip"`
  - `productionGuard.allowed`
  - `productionGuard.reason`
  - `productionGuard.checkedAt`
- Require all of:
  - explicit env flag such as `ENABLE_LULU_PRODUCTION_SUBMIT=true`
  - explicit request intent such as `allowProductionLulu: true`
  - order is not a proof/disposable/test order
  - no existing real Lulu submission signal
  - shipping address passes strict validation
- payment/order readiness checks pass
- production page count matches the selected Lulu product range before submit shaping
- any Lulu-recommended shipping-address correction is explicitly supplied to the repo submit builder for the approved pilot

### Phase 2: Separate operator approval path

- Add a production-only admin approval surface instead of reusing sandbox recovery actions.
- Approval should be per order, append-only, and auditable.
- Store who approved, when, and why.
- Recovery pages should keep their current sandbox-only behavior.

### Phase 3: Controlled production submit path

- Only after Phase 1 and Phase 2 are live, allow the repo-owned `W4` path to emit production submit input.
- Keep the first production cutover batch on single-order `W4` only.
- Leave `W4.1` on sandbox-only until single-order production behavior is proven stable.
- Prefer a staged rollout:
  - internal disposable dry-run path with production guards enabled but submit blocked
  - one manually approved low-risk paid order
  - very small allowlist rollout

### Phase 4: Post-submit lifecycle and rollback

- `print-submitted` should continue to be the only place that writes real print-submission lifecycle state.
- Add explicit rollback instructions:
  - disable production env gate
  - revert workflow path to sandbox-only or old production nodes
  - stop new approvals
  - inspect in-flight orders from `/admin/workflow-jobs` and `/admin/w4-recovery`

## Required engineering changes

### Backend

- Add production gating logic to [`w4-submit-input.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w4-submit-input.ts).
- Add strict validation for production shipping/contact requirements.
- Add explicit proof-order detection so `TEST-*`, disposable proof ids, and sandbox markers are rejected for paid submit.
- Add audit logging for production approval and submit intent.
- Add a production preflight endpoint or admin action that validates an order without submitting it.
- That preflight surface now exists, so the remaining operator work is approval/audit, not basic readiness inspection.

### Admin/operator tooling

- Add a separate production approval page or action for single-order `W4`.
- Show:
  - current order lifecycle state
  - payment/readiness guard summary
  - shipping validation result
  - whether the order is already submitted
  - exact reason production submit is blocked when blocked
- Do not place this action on the sandbox recovery screens.

### Workflow/export side

- Keep sandbox and production branches explicit in the workflow export.
- Production branch should be unreachable unless repo response says `submitMode = "production"`.
- Preserve workflow-job metadata into `print-submitted` exactly as the sandbox path does today.

## Test plan

1. Add unit and route tests for:
   - production gate disabled
   - missing explicit approval intent
   - proof/test order rejection
   - existing real submission rejection
   - shipping validation rejection
   - successful production submit shaping when all guards pass
2. Add contract checks proving the workflow export cannot hit production submit nodes from sandbox responses.
3. Add admin tests for approval visibility and blocked-state messaging.
4. Add a production dry-run acceptance pass that validates payload shaping without sending a real Lulu job.

## Acceptance criteria

- A sandbox replay can never become production by accident.
- A paid production submit cannot happen unless repo gate, operator approval, and order-readiness checks all agree.
- Failed production preflight does not create a Lulu job or customer notification.
- Successful production submit still records durable `workflow_jobs` telemetry end to end.
- Rollback can be executed in minutes without code edits.

## Explicit out of scope

- `W4.1` paid sibling-group cutover
- production replay of already-submitted Lulu jobs
- shipment/delivery status handling changes
- customer-facing copy or notification redesign

## Recommended next implementation order

1. Add a separate operator approval surface for paid submit.
2. Lock workflow/export contracts so sandbox responses cannot reach production nodes and `submitMode = "production"` is the only path that can reach paid Lulu nodes.
3. Run a production dry-run validation pass with no submit against one explicitly approved single-order `W4` candidate.
4. Only then schedule a single manually approved paid-order pilot.
