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
- Production Lulu nodes still exist in `n8n`, but the extracted proof paths do not use them.

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

1. Add repo-side production gating and dry-run validation for single-order `W4`.
2. Add a separate operator approval surface for paid submit.
3. Lock workflow/export contracts so sandbox responses cannot reach production nodes.
4. Run a production dry-run validation pass with no submit.
5. Only then schedule a single manually approved paid-order pilot.
