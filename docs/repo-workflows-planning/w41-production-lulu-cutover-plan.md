# W4.1 Production Lulu Cutover Plan

## Summary

- Scope this plan to paid sibling-group `W4.1`.
- Keep single-order `W4` production logic and approvals separate from sibling-group paid submit.
- Treat `W4.1` sandbox proofing as complete enough to plan production, but not as permission to send grouped paid Lulu jobs yet.
- Goal: enable repo-owned sibling-group paid submission only behind stricter guardrails than single-order `W4`, because one bad grouped submit can affect multiple child orders at once.

## Current baseline

- `W4.1` sandbox-only repo extraction is proven live on imported workflow [`w4.1-Sibling-Aggregation.repo-centric.json`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w4.1-Sibling-Aggregation.repo-centric.json).
- Grouped production dry-run is now also proven live on a fresh non-proof sibling group:
  - root group `441-03302026-9000018`
  - durable grouped job `workflow_jobs.id = 181`
  - attempt `142`
  - terminal grouped events `qa-passed` (item 1), `qa-passed` (item 2), `manifest-published`, `completed`
  - terminal non-production payload `submitMode = "skip"`, `luluJobId = "SKIPPED"`, `luluStatus = "DRY_RUN"`, `externalProvider = "lulu-sandbox"`
  - no real Lulu job was created
- The grouped dry-run proof needed two real fixes that are now part of the baseline:
  - dry-run-only materialization bypass for large grouped PDFs, so grouped production dry-run no longer depends on large R2 uploads succeeding first
  - `Reattach QA Context (Post Cover Upload)` now merges the interior branch back into the cover branch so grouped QA preserves both direct interior and direct cover PDF URLs
- Shared sibling-group durable job control already exists in [`w4-sibling-jobs.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/workflow-jobs/w4-sibling-jobs.ts).
- Shared grouped completion fallback already exists in [`print-submitted/route.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/webhooks/print-submitted/route.ts): if `rootGroupId` and `orderIds` are present, the shared sibling job can still close once even if explicit workflow-job ids are missing.
- Sandbox-only sibling recovery already exists in [`/admin/w41-recovery`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w41-recovery/page.tsx) and [`/api/admin/w41-recovery`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/w41-recovery/route.ts).
- Sibling submit shaping already stays sandbox-only in [`w4-sibling-print-input.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/books/w4-sibling-print-input.ts).
- The first paid-cutover implementation slice now exists:
  - grouped paid-print preflight helper [`w41-production-preflight.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w41-production-preflight.ts)
  - grouped approval-token helper [`w41-production-approval.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w41-production-approval.ts)
  - admin API [`/api/admin/w41-production`](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/admin/w41-production/route.ts)
  - admin page [`/admin/w41-production`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w41-production/page.tsx)
- Live deploy revision [`940d16d6.little-hero-labs-admin.pages.dev`](https://940d16d6.little-hero-labs-admin.pages.dev) and production [`admin.littleherolabs.com`](https://admin.littleherolabs.com) now both return the same fail-closed inspection result for known sandbox sibling proof group `441-0324-161613`:
  - `candidateCount = 0`
  - `safeForProductionPilot = false`
  - `recommendedReason = "proof_or_non_production_group"`
- `W4.1` is still intentionally out of scope for paid production submit itself. The new grouped approval token exists, but no grouped paid Lulu branch has been enabled yet.

## Why W4.1 needs its own cutover

- `W4.1` is a grouped submit, not a single-order submit.
- Approval needs to be at the sibling-root level, not per child order.
- Readiness must be verified across all grouped child orders before paid submit.
- Rollback and operator messaging are different because one grouped Lulu job can represent multiple customer-facing orders.
- Sandbox replay safety is already good; the remaining gap is not transport plumbing, it is multi-order approval and failure handling.

## Non-negotiable safety rules

1. No paid sibling-group Lulu submit may happen from the current sandbox recovery endpoints.
2. Grouped paid submit must require explicit repo-side opt-in plus a sibling-group approval token, not just “not sandbox”.
3. Every child order in the sibling group must pass readiness checks before the grouped submit can proceed.
4. Any child order with existing real `lulu_job_id`, `lulu_status`, or `print_submitted_at` must block grouped paid submit unless a separate override flow is explicitly designed and approved.
5. A sandbox replay can never become production by accident.
6. Customer notifications must stay disabled until grouped Lulu acceptance is persisted successfully and the shared sibling `workflow_jobs` record is terminal `succeeded`.
7. Rollback must be one-step operationally: disable env gate, revoke approvals, and force the grouped workflow back to sandbox-only.

## Proposed cutover shape

### Phase 1: Group-level production preflight

- Add a dedicated grouped paid-print preflight helper, parallel to single-order [`w4-production-preflight.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w4-production-preflight.ts).
- Inspect by `rootGroupId`, not by one child order.
- Return:
  - whether every child is production-eligible
  - which child blocks submit when blocked
  - whether any child already has real Lulu submission state
  - whether the group is still sandbox-only
  - grouped shipping/contact readiness summary

### Phase 2: Grouped operator approval

- Add a production-only `W4.1` admin approval surface, separate from [`/admin/w41-recovery`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w41-recovery/page.tsx).
- Approval must be rooted on `rootGroupId`.
- Mint a short-lived approval token scoped to one sibling group.
- Record who approved, when, and why.
- Show exact child-order blockers when approval is unavailable.

### Phase 3: Repo-side grouped production gating

- Extend sibling submit shaping so paid mode is impossible unless all of the following are true:
  - env gate is enabled
  - explicit request intent for production is present
  - valid sibling-group approval token is present
  - all child orders are ready
  - no child already has real Lulu submit state
  - shipping/address normalization has been explicitly resolved for the grouped shipment
- Keep default behavior sandbox-only.
- Keep dry-run support separate from real paid submit.

### Phase 4: Controlled grouped paid pilot

- First production cutover batch should be exactly one low-risk sibling group.
- Prefer a staged rollout:
  - grouped dry-run with production guards enabled but submit blocked
  - one manually approved paid sibling-group pilot
  - inspect webhook and lifecycle behavior
  - only then consider another group

### Phase 5: Post-submit lifecycle and rollback

- Reuse shared Lulu lifecycle mapping in [`lulu-status-map.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/lulu-status-map.ts) so grouped paid status updates stay consistent with single-order `W4`.
- Add explicit grouped rollback instructions:
  - disable production env gate
  - revoke or stop minting approvals
  - inspect the shared sibling job in [`/admin/workflow-jobs`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/workflow-jobs/page.tsx)
  - inspect grouped recovery state in [`/admin/w41-recovery`](/Users/jeff/Projects/little-hero-books/back-end/src/app/admin/w41-recovery/page.tsx)

## Required engineering changes

### Backend

- Add grouped production preflight helper and admin API route.
- Add grouped approval-token helper parallel to single-order [`w4-production-approval.ts`](/Users/jeff/Projects/little-hero-books/back-end/src/lib/w4-production-approval.ts).
- Extend sibling submit builder to support production dry-run and real grouped production submit behind guards.
- Add grouped audit logging for approval, submit intent, and terminal result.

### Admin/operator tooling

- Add a separate `W4.1` production page, not mixed into sandbox recovery.
- Show:
  - root group id
  - child order readiness matrix
  - grouped shipping/contact summary
  - existing real Lulu state, if any
  - exact reason grouped paid submit is blocked
  - short-lived approval token minting only when safe

### Workflow/export side

- Keep sandbox and production branches explicit in `W4.1`.
- Production branch should be unreachable unless repo response says grouped `submitMode = "production"`.
- Preserve shared sibling workflow-job metadata and `rootGroupId` into `print-submitted`.

## Test plan

1. Add grouped preflight tests for:
   - mixed child readiness
   - existing real submission on one child
   - proof/sandbox markers
   - full group ready
2. Add approval-token tests scoped to `rootGroupId`.
3. Add workflow contract checks proving sandbox responses cannot reach grouped production nodes.
4. Completed: add grouped production dry-run acceptance checks with no real Lulu submit.

## Acceptance criteria

- A grouped sandbox replay can never become production accidentally.
- A paid sibling-group submit cannot happen unless env gate, repo gate, and explicit group approval all agree.
- Blocked preflight does not create a Lulu job or customer notification.
- Successful grouped paid submit still records shared durable `workflow_jobs` telemetry end to end.
- Rollback can be executed quickly without code edits.

## Explicit out of scope

- Reusing single-order `W4` approval directly for grouped submit
- Paid replay of already-submitted sibling groups
- Customer notification redesign
- Shipment/delivery behavior beyond existing Lulu lifecycle handling

## Recommended next implementation order

1. Completed: lock workflow/export contracts so sandbox responses cannot reach grouped paid Lulu nodes even if grouped production metadata is present.
2. Completed: add grouped production dry-run support with no real Lulu submit.
3. Completed: verify grouped admin preflight + approval flow plus one grouped production dry-run against a fresh non-proof sibling candidate.
4. Next: choose a fresh non-proof sibling group, inspect it in `/admin/w41-production`, mint a short-lived grouped approval token, and run one manually approved paid sibling-group pilot.
