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
- The live imported single-order `W4` workflow is now proven for production dry-run, but a real paid pilot still needs explicit operator approval plus the env gate.
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
