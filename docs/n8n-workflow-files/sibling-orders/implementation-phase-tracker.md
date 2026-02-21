# Sibling Order N+ Support — Implementation Phase Tracker
**Project:** Little Hero Labs — Multi-Book Order Support  
**Last Updated:** 2026-02-19  
**Master Summary:** `lhl-sibling-orders-master-summary.md`

---

## How to Use This Document

Update the **Status** column as each phase and task is completed. Before starting any implementation session, share this tracker alongside the master summary and the relevant audit file(s) so the agent knows exactly where you are.

**Status values:**
- `⬜ Not Started`
- `🔄 In Progress`
- `✅ Complete`
- `⏸ Blocked` (note the blocker inline)

---

## Phase 0 — DB & Infrastructure Prerequisites
**Must be complete before any workflow code changes.**

| # | Task | File / Location | Status | Notes |
|---|------|-----------------|--------|-------|
| 0.1 | Confirm `UNIQUE` constraint exists on `orders.orderId` | Supabase dashboard → orders table | ⬜ | Required for `on_conflict=orderId` in W3 + W4 |
| 0.2 | Add `sibling_waiting` to `execution_status` allowed values | Supabase schema / enum | ⬜ | Required before cron holding logic or health monitor changes |
| 0.3 | Audit `get_orphaned_orders` RPC — retrieve full function definition | Supabase SQL editor: `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'get_orphaned_orders';` | ⬜ | Needed to add `sibling_waiting` exclusion in W1.5 |
| 0.4 | Add `sibling_waiting` exclusion to `get_orphaned_orders` RPC | Supabase SQL editor | ⬜ | Blocks W1.5 Phase 6 work |
| 0.5 | Confirm backend webhook handlers accept per-book `orderId` | `back-end/src/app/api/webhooks/` | ⬜ | Handlers for `workflow-2b-complete`, `workflow-2b-skipped`, `sent-to-print` |
| 0.6 | Decide: dedicated `sibling_group_id` column, or derive groups from `amazon_order_id` only? | Architecture decision | ⬜ | Affects W0 upsert design |
| 0.7 | Decide: D2C multi-item orders — in scope for Phase 2? | Architecture decision | ⬜ | If yes, sibling identity mechanism for D2C must be designed |

---

## Phase 1 — Data Foundation (W0 + Cron SELECT)
**Estimated effort: 2–3 hours**  
**Audit files:** `audit-w0.md`, `audit-w1.1-cron-addendum.md`

| # | Task | Node / File | Status | Notes |
|---|------|-------------|--------|-------|
| 1.1 | W0: Update `Normalize Payload` — promote `amazonOrderId` + `marketplaceId` to top level; derive `rootOrderId` + `isSiblingOrder` | `w0-Order_Intake_Validation.json` | ⬜ | |
| 1.2 | W0: Update `Build 1-manifest.json` — add `siblingGroupId` to manifest; read from top-level fields | `w0-Order_Intake_Validation.json` | ⬜ | |
| 1.3 | W0: Update `Supabase Upsert (orders)2` — write root ID to `amazon_order_id`; use `siblingGroupId` where available | `w0-Order_Intake_Validation.json` | ⬜ | |
| 1.4 | W0: Update `Mock Order (STANDARD)` — add sibling mock variant | `w0-Order_Intake_Validation.json` | ⬜ | Low priority; testing only |
| 1.5 | W0: Update `Mock Order (AMAZON)` — add sibling mock variant | `w0-Order_Intake_Validation.json` | ⬜ | Low priority; testing only |
| 1.6 | Cron router: Add `orderId` to Supabase SELECT query | `back-end/src/app/api/cron/router/route.ts` | ⬜ | **Critical** — without this, all W1.1 Prep node fixes are inert |

**Phase 1 Test:** Send a mock sibling order through W0. Verify: Supabase row has correct `orderId` (synthetic per-book ID) and `amazon_order_id` (root group ID). Verify 1-manifest stored at per-book R2 path, not root group path.

---

## Phase 2 — Router Fixes (W1.1)
**Estimated effort: 3–4 hours**  
**Audit files:** `audit-w1.1.md`, `audit-w1.1-cron-addendum.md`  
**Depends on:** Phase 1 complete

| # | Task | Node / File | Status | Notes |
|---|------|-------------|--------|-------|
| 2.1 | W1.1: Update `Prep 2A Orders` — use `order.orderId \|\| order.amazon_order_id`; pass `amazonOrderId` separately | `w1.1-Queue_Manager_and_Router.json` | ⬜ | |
| 2.2 | W1.1: Update `Prep 2B Orders` — same fix as 2.1 | `w1.1-Queue_Manager_and_Router.json` | ⬜ | |
| 2.3 | W1.1: Update `Prep Workflow 3 Orders` — same fix as 2.1; use `one_manifest_url` for manifest key | `w1.1-Queue_Manager_and_Router.json` | ⬜ | |
| 2.4 | W1.1: Update `Prep Workflow 4 Orders` — same fix as 2.1; fix manifest key construction | `w1.1-Queue_Manager_and_Router.json` | ⬜ | |
| 2.5 | W1.1: Update `Merge Prep Data with Supabase Response (3)` — preserve `amazonOrderId` in merged output | `w1.1-Queue_Manager_and_Router.json` | ⬜ | Minor |
| 2.6 | W1.1: Update `Route Orders by Workflow` — add `workflow4-aggregate` routing branch | `w1.1-Queue_Manager_and_Router.json` | ⬜ | Placeholder OK for now; W4.1 not built yet |
| 2.7 | Cron router: Add PDFMonkey W3 concurrency sub-limit (cap W3 at 2 concurrent) | `back-end/src/app/api/cron/router/route.ts` | ⬜ | Independent of sibling work but do in same session |

**Phase 2 Test:** Route two sibling orders through W1.1. Verify each Prep node produces a distinct `orderId` in the downstream trigger payload. Verify no two siblings get the same `orderId`.

---

## Phase 3 — Character Generation (W2A Orchestrator)
**Estimated effort: 2 hours**  
**Audit file:** `audit-w2a.md`  
**Depends on:** Phase 2 complete  
**Note:** W2A sub-workflows (SW0, SW1, SW2, SW3) require ZERO changes.

| # | Task | Node / File | Status | Notes |
|---|------|-------------|--------|-------|
| 3.1 | W2A: Update `Capture Order Context` — remove silent `orderId → amazonOrderId` fallback | `w2A-Orchestrator.json` | ⬜ | |
| 3.2 | W2A: Update `Write Run Manifest1` — use per-book `orderId` for manifest R2 path; record both IDs in manifest content | `w2A-Orchestrator.json` | ⬜ | **Critical** — manifest collision point |
| 3.3 | W2A: Update `Supabase — Upsert from 2A Manifest` — fix `orderId` body param to write per-book ID, not group root | `w2A-Orchestrator.json` | ⬜ | |
| 3.4 | W2A: Verify `Normalize Router Payload` resolves correctly after W1.1 fix | `w2A-Orchestrator.json` | ⬜ | No code change expected |

**Phase 3 Test:** Run two siblings through W2A. Verify each produces a distinct 2A manifest at its own R2 path (`orders/<per-book-id>/manifests/2a-manifest.json`). If siblings have identical character specs, verify character assets are shared (same R2 key, idempotent write) without manifest collision.

---

## Phase 4 — Background Removal (W2B)
**Estimated effort: 1.5 hours**  
**Audit files:** `audit-w2b-main.md`, `audit-w2b-sw1.md`  
**Depends on:** Phase 3 complete  
**Note:** W2B-SW1 sub-workflow requires ZERO changes.

| # | Task | Node / File | Status | Notes |
|---|------|-------------|--------|-------|
| 4.1 | W2B: Update `Normalize 2B Input` — extract and propagate `amazonOrderId` separately from `orderId` | `w2B-main-orchestrator.json` | ⬜ | |
| 4.2 | W2B: Update `Build Worklist` — fix fallback precedence: `orderId` before `amazonOrderId` | `w2B-main-orchestrator.json` | ⬜ | |
| 4.3 | W2B: Add `amazonOrderId` to backend notification payloads (All Poses Skipped, 2B Complete, BRIA_READY) | `w2B-main-orchestrator.json` | ⬜ | Minor; add once 4.1 exposes `amazonOrderId` |
| 4.4 | W2B-SW1: Verify no changes needed | `w2B-sw1-single-pose.json` | ⬜ | Character-hash scoped; expect NO CHANGE |

**Phase 4 Test:** Run two siblings through W2B. Verify each produces a distinct 2B manifest at its own R2 path. Verify bg-removed images stored at character-hash-keyed paths (no order ID in the path).

---

## Phase 5 — Book Assembly (W3)
**Estimated effort: 3–4 hours**  
**Audit file:** `audit-w3.md`  
**Depends on:** Phase 4 complete  
**Schema prerequisite:** `orders.orderId` UNIQUE constraint confirmed (Phase 0.1)

| # | Task | Node / File | Status | Notes |
|---|------|-------------|--------|-------|
| 5.1 | W3: Update `Build Assembly Input From Manifest` — reverse fallback: `order.orderId \|\| order.amazonOrderId`; propagate per-book `orderId` as primary key | `w3-Book-Assembly.json` | ✅ | **Critical** — root of all downstream W3 path issues |
| 5.2 | W3: Update `Resolve Asset Paths (3A Phase 1)1` — pick per-book `orderId` in ctx; change `renderContext.orderId` assignment | `w3-Book-Assembly.json` | ✅ | Feeds cover PNG key |
| 5.3 | W3: Update `Generate Page Preview Images` — use `orderId \|\| amazonOrderId` for R2 key, not `amazonOrderId` alone | `w3-Book-Assembly.json` | ✅ | **Critical** — page image collision point |
| 5.4 | W3: Update `Fetch and Merge Review Stages (3)` — change Supabase GET from `amazon_order_id=eq.` to `orderId=eq.perBookId` | `w3-Book-Assembly.json` | ✅ | |
| 5.5 | W3: Update `Supabase Upsert 3` — change `on_conflict=amazon_order_id` → `on_conflict=orderId`; write per-book ID to `orderId` body field, root group ID to `amazon_order_id` | `w3-Book-Assembly.json` | ✅ | **Critical** — sibling row collision |
| 5.6 | W3: Verify `Set Cover PNG Filenames/Keys` resolves correctly after 5.2 | `w3-Book-Assembly.json` | ✅ | No code change expected |
| 5.7 | W3: Verify `Prep Manifest Upload (3)` uses correct per-book `orderId` after 5.1 | `w3-Book-Assembly.json` | ✅ | No code change expected |

**Phase 5 Test:** Run two siblings through W3. Verify: (a) distinct page preview images at `orders/<per-book-id>/preview-images/`; (b) distinct cover images; (c) distinct 3-manifests; (d) Supabase upsert updates the correct row for each sibling without overwriting the other.

---

## Phase 6 — Print Fulfillment (W4) + Health Monitor (W1.5)
**Estimated effort: 2 hours**  
**Audit files:** `audit-w4.md`, `audit-w1.5.md`  
**Depends on:** Phase 5 complete  
**Schema prerequisite:** `sibling_waiting` status added (Phase 0.2); RPC updated (Phase 0.4)

| # | Task | Node / File | Status | Notes |
|---|------|-------------|--------|-------|
| 6.1 | W4: Update `Supabase: mark submitted` — change `on_conflict=amazon_order_id` → `on_conflict=orderId`; fix body fields | `w4-PRODUCTION-Print_Fulfillment.json` | ✅ | **Critical** — only required W4 change |
| 6.2 | W4: Verify `Validate & Normalize W4 Input` receives `amazonOrderId` from W1.1 for Amazon sibling `isAmazonOrder` detection | `w4-PRODUCTION-Print_Fulfillment.json` | ✅ | No W4 code change; confirm W1.1 sends `amazonOrderId` |
| 6.3 | W1.5: Update `Retry: Prep for Router` — use `order.orderId \|\| order.amazon_order_id`; add `amazonOrderId` field | `w1.5-Health_Monitor.json` | ⬜ | |
| 6.4 | W1.5: Update `Orphaned: Classify Orphans` — add `sibling_waiting` / `no_action` check before `ready_not_picked_up → reset_processing` | `w1.5-Health_Monitor.json` | ⬜ | Requires Phase 0.2 complete |
| 6.5 | W1.5: Update `Orphaned: Route by Action` — add `no_action` route and new IF → Preserve → Merge chain | `w1.5-Health_Monitor.json` | ⬜ | Minor; follows from 6.4 |
| 6.6 | Health monitor cron: Add `orderId` to stuck orders SELECT | `back-end/src/app/api/cron/health-monitor/route.ts` | ⬜ | |
| 6.7 | Health monitor cron: Add `orderId` to retry orders SELECT | `back-end/src/app/api/cron/health-monitor/route.ts` | ⬜ | Required for 6.3 to work |

**Phase 6 Test:** Run a complete single-book order end-to-end (W0 → W4) to confirm no regressions. Simulate a stuck sibling in `sibling_waiting` status; confirm health monitor does not reset or escalate it.

---

## Phase 7 — Sibling Aggregation (W4.1 + Cron Group Detection)
**Estimated effort: 6–8 hours**  
**Audit file:** `audit-w1.1-cron-addendum.md` (aggregation section)  
**Depends on:** All prior phases complete  
**Note:** W4.1 is a new workflow. Requires a dedicated design session before implementation.

| # | Task | File | Status | Notes |
|---|------|------|--------|-------|
| 7.1 | Design W4.1 input contract and node structure | New document | ✅ | Plan: w4.1_sibling_aggregation_workflow_143de5cc.plan.md |
| 7.2 | Cron router: Add sibling group readiness detection | `back-end/src/app/api/cron/router/route.ts` | ⬜ | Query all siblings in group; check all are `next_workflow=4` + `ready_for_processing` |
| 7.3 | Cron router: Set `sibling_waiting` status for incomplete groups | `back-end/src/app/api/cron/router/route.ts` | ⬜ | |
| 7.4 | Cron router: Tag complete groups with `_routeTo: '4-aggregate'` in W1.1 payload | `back-end/src/app/api/cron/router/route.ts` | ⬜ | |
| 7.5 | W1.1: Implement `Prep Workflow 4-Aggregate Orders` node | `w1.1-Queue_Manager_and_Router.json` | ⬜ | Builds combined sibling payload for W4.1 |
| 7.6 | W4.1: Build new aggregation workflow | New n8n workflow | ✅ | w4.1-Sibling-Aggregation.json — Single Lulu job, N line items, N Supabase updates |
| 7.7 | Backend: Implement `POST /api/cron/aggregate-sibling-orders` (if backend endpoint approach) | `back-end/src/app/api/` | ⬜ | Alternative to pure n8n W4.1 |

**Phase 7 Test:** Place a complete 2-book sibling order end-to-end. Verify: single Lulu job created; both Supabase rows share the same `lulu_job_id`; single shipment to customer address.

---

## VERIFY Nodes — Status by Phase

These nodes require no code changes but must be manually confirmed after the phase they depend on is complete. Check them off as each upstream phase passes testing.

| Node | Workflow | Depends On | Confirmed |
|------|----------|------------|-----------|
| Normalize Router Payload | W2A | Phase 2 | ⬜ |
| Set Environment Defaults | W2A | Phase 2 | ⬜ |
| Download 2A Manifest | W2B | Phase 3 | ⬜ |
| Download 2B Manifest (optional) | W2B | Phase 2 | ⬜ |
| Normalize Result | W2B | Phase 2 + 3 | ⬜ |
| Upload 2B Manifest to R2 | W2B | Phase 2 + 3 | ⬜ |
| Notify Backend (2B Complete) | W2B | Phase 4.1 | ⬜ |
| Extract Manifest URL (3) | W3 | Phase 2 | ⬜ |
| Download 2B Manifest | W3 | Phase 2 + 4 | ⬜ |
| Get Order Ready for Assembly | W3 | Phase 2 | ⬜ |
| Set Cover PNG Filenames/Keys | W3 | Phase 5.2 | ✅ |
| Upload Cover Preview to R2 | W3 | Phase 5.1 + 5.2 | ✅ |
| Carry Page Keys Forward | W3 | Phase 5.3 | ✅ |
| Upload Page Preview to R2 | W3 | Phase 5.3 | ✅ |
| Build 3A Manifest | W3 | Phase 5.1 | ✅ |
| Prep Manifest Upload (3) | W3 | Phase 5.1 | ✅ |
| Upload 3 Manifest to R2 | W3 | Phase 5.1 | ✅ |
| Validate & Normalize W4 Input | W4 | Phase 2 | ✅ |
| Hydrate Order Details | W4 | Phase 1 | ✅ |
| Poll PDFMonkey until ready (interior) | W4 | Phase 2 | ✅ |
| Upload PDF to R2 | W4 | Phase 2 | ✅ |
| Build Cover HTML | W4 | Phase 5 | ✅ |
| Upload Cover PDF to R2 | W4 | Phase 2 + 5 | ✅ |
| Generate Signed URLs | W4 | Phase 2 | ✅ |
| Build 4-Manifest / Upload | W4 | Phase 2 | ✅ |
| Build/Upload Error 4-Manifest | W4 | Phase 2 | ✅ |

---

## Decision Log

| Decision | Options Considered | Decision Made | Date | Notes |
|----------|--------------------|---------------|------|-------|
| Aggregation strategy | A: Backend endpoint, B: New n8n W4.1, C: Extend W4 | **Option A/B hybrid — cron detects groups, W4.1 handles submission** | 2026-02-19 | |
| `sibling_waiting` status | Boolean flag vs. new status value | **New `execution_status` value** | 2026-02-19 | Cleanest for RPC exclusion and admin panel |
| Sibling group ID derivation | Dedicated `sibling_group_id` column vs. derive from `amazon_order_id` | ⬜ Pending | — | See Phase 0.6 |
| D2C multi-item orders | In scope now vs. future phase | ⬜ Pending | — | See Phase 0.7 |

---

*Tracker version: 1.0 — Created 2026-02-19*  
*Update this file at the start and end of every implementation session.*
