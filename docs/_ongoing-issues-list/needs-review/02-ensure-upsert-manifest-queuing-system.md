# Issue: Ensure Upsert / Manifest / Queuing System is Working

**Status:** 🟡 Needs Audit  
**Priority:** High  
**Created:** 2026-01-27  
**Last Updated:** 2026-01-27

## Description

Need to verify and ensure that the entire system for:
- **Manifest upserts** (updating existing manifests in R2)
- **Manifest creation/updates** across all workflows
- **Order queuing** (setting `next_workflow`, `execution_status`, `queued_at`)
- **Workflow routing** (cron job picking up orders)

...is working correctly and consistently across all workflows.

## Impact

- Orders may not progress through workflows automatically
- Manifests may not be properly updated/merged
- Cron router may not pick up orders correctly
- State inconsistencies between Supabase and R2 manifests

## Areas to Audit

### 1. Manifest Updates
- [ ] W0: Creates 1-manifest.json, updates Supabase
- [ ] W2A: Creates/updates 2a-manifest.json, updates Supabase
- [ ] W2B: Creates/updates 2b-manifest.json (via callback aggregator), updates Supabase
- [ ] W3: Creates/updates 3-manifest.json, updates Supabase
- [ ] W4: Uses manifests but may not create new ones

### 2. Supabase State Updates
- [ ] `manifest_*_url` fields updated correctly
- [ ] `workflow_step` updated correctly
- [ ] `execution_status` set appropriately (`ready_for_processing`, `processing`, `done`, `error`)
- [ ] `next_workflow` set correctly
- [ ] `queued_at` set when order should be picked up by router
- [ ] `current_workflow` cleared when workflow completes

### 3. Queuing Logic
- [ ] `determineNextWorkflow()` function logic correct
- [ ] Cron router (`w1.1`) picks up orders correctly
- [ ] Orders don't get stuck or routed backwards
- [ ] Manual overrides (approval buttons) properly queue next workflow

### 4. Manifest Merging
- [ ] 2B callback aggregator properly merges pose results
- [ ] No data loss when merging manifests
- [ ] Idempotent operations (reruns don't duplicate data)

## Affected Files

- `back-end/src/lib/determine-next-workflow.ts`
- `back-end/src/app/api/cron/router/route.ts`
- `back-end/src/app/api/cron/amazon-orders/route.ts`
- `back-end/src/lib/approval-store.ts`
- `back-end/src/lib/status-service.ts`
- All workflow webhook handlers:
  - `back-end/src/app/api/webhooks/workflow-0-complete/route.ts`
  - `back-end/src/app/api/webhooks/workflow-2a-complete/route.ts`
  - `back-end/src/app/api/webhooks/workflow-2b-complete/route.ts`
  - `back-end/src/app/api/webhooks/workflow-3-complete/route.ts`
- n8n workflows: w0, w1.1, w2A, w2B, w3, w4

## Workflows audit (verified 2026-02-02)

| Workflow | n8n file (finals) | Manifest | Supabase / backend |
|----------|-------------------|----------|--------------------|
| **W0** | `w0-Order_Intake_Validation.json` | Builds 1-manifest.json, uploads to R2 (S3 node) | **Direct Supabase upsert** in workflow (Code node): `one_manifest_url`, `execution_status: ready_for_processing`, `next_workflow: 2A`, `workflow_step: order_intake`. Does **not** call `workflow-0-complete`. Cron router W0-cleanup fixes orders that have `one_manifest_url` but still `execution_status: pending_w0`. |
| **W1.1** | `w1.1-Queue_Manager_and_Router.json` | — | Receives `{ orders }` from cron. Routes by `next_workflow` (2A/2B/3/4). **Mark as Processing**: PATCH Supabase `execution_status: processing`, `current_workflow`. Then POSTs to 2a-start, bg-removal, book-assembly, or w4-pdf-print. Process W3 orders: uses `one_manifest_url`; missing 1-manifest → mark error. |
| **W2A** | `w2A-Orchestrator.json` (+ SW0–SW3) | Write Run Manifest (2A-04) → 2a-manifest.json; upload to R2 | **Supabase — Upsert from 2A Manifest** (HTTP to Supabase): `manifest_2a_url`, `next_workflow`. Backend `workflow-2a-complete` exists: sets `manifest_2a_url`, `workflow_step: 2A-complete`, `execution_status` (done or processing), clears `started_at`/`current_workflow`. Stored workflow may use direct Supabase; if 2A calls backend, use workflow-2a-complete. |
| **W2B** | `w2B-Background_Removal.json` | Prepare Manifest Upload → **2b-manifest.json** to R2 | **Calls backend** `POST .../api/webhooks/workflow-2b-complete` with `orderId`, `manifestUrl`. Backend: `determineNextWorkflow`, sets `manifest_2b_url`, `review_stages.postBria`, `next_workflow`, `execution_status` (processing if needsReview else done), clears `started_at`/`current_workflow`. |
| **W3** | `w3-PNG_Assembly.json` | Prep Manifest Upload (3) → **3-manifest.json** to R2 | **Supabase Upsert 3** (HTTP to Supabase): `manifest_3_url`, `next_workflow: 4`, `execution_status: processing`, `workflow_step: book_assembly_completed`, `review_stages` (merged). Does **not** call `workflow-3-complete`. Backend workflow-3-complete sets `execution_status: done` and clears processing fields (alternative path). |
| **W4** | `w4-*.json` | Builds 4-manifest.json (artifacts + Lulu) | Uses manifests; POSTs to `api/webhooks/print-submitted` (production). Updates Supabase with Lulu job id, status, etc. |

**Queuing / router:** Cron `GET /api/cron/router` uses `queue_status`, fetches `execution_status: ready_for_processing` and `next_workflow` not null, applies W4 eligibility filter, sets `queued_at` and `status: queued_for_processing`, then POSTs `{ orders }` to `N8N_ROUTER_WEBHOOK_URL` (W1.1). `determine-next-workflow.ts` drives next_workflow from manifest_*_url and review_stages; router must point at W1.1 webhook only (validated in route).

## Known Issues (from recent fixes)

1. ✅ Fixed: Orders reverting to 2A after being set to 2B (fixed in `determine-next-workflow.ts` and `cron/amazon-orders/route.ts`)
2. ✅ Fixed: Approval buttons not setting `next_workflow` (fixed in `approval-store.ts`)
3. 🔴 Open: 2B manifest merging broken (see issue #01)

## Proposed Audit Steps

1. **Trace a complete order flow:**
   - From Amazon order intake → W0 → W2A → W2B → W3 → W4
   - Document each manifest creation/update
   - Document each Supabase state change
   - Verify `next_workflow` progression

2. **Test edge cases:**
   - Order rerun through same workflow
   - Manual approval/override
   - Error recovery
   - Partial completion scenarios

3. **Verify consistency:**
   - Supabase state matches R2 manifest state
   - `next_workflow` matches actual workflow progression
   - No orphaned states or stuck orders

4. **Check for race conditions:**
   - Multiple callbacks updating same manifest
   - Cron job running while workflow in progress
   - Manual actions conflicting with automated flows

## Related Issues

- Issue #01: Fix 2B Workflow (manifest merging)
- Issue #03: Fix cover page rendering (may be related to manifest data)

## Notes

- Recent fixes addressed some routing issues, but full system audit needed
- Need to ensure all workflows follow consistent patterns
- Consider creating a state machine diagram for order progression
- **W0 / W3:** Stored n8n workflows use **direct Supabase** upsert (no call to workflow-0-complete or workflow-3-complete). Backend completion routes exist for alternative or future use; cron W0-cleanup aligns orders that have 1-manifest but were never updated.
- **2B manifest merging:** See Issue #01; callback aggregator merge logic lives in `w2B-Background_Removal.json` (prepare/upload 2b-manifest; single completion webhook call per run).