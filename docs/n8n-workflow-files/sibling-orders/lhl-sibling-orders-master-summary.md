# Little Hero Labs — Sibling Order (N≥2) Support
## Master Implementation Summary
**Audit Completed:** 2026-02-19  
**Scope:** All n8n workflows, sub-workflows, Vercel cron router, and health monitor  
**Purpose:** Enable multi-book orders (2+ books per Amazon order) to be processed correctly end-to-end, with all sibling books included in a single Lulu print job and a single shipment.

---

## Executive Summary

The pipeline currently processes every order as a standalone single-book job. When a customer orders 2 or more books (sibling orders), each book flows through the pipeline independently and receives its own Lulu print job — resulting in multiple separate shipments to the same address and unnecessary cost.

The core technical problem is that **every workflow uses `amazon_order_id` (the root group ID shared by all books in an order) as the per-book routing identifier.** When two siblings share the same identifier, they collide: they overwrite each other's R2 manifests, character assets, page previews, and Supabase rows.

The fix is a layered correction:
1. **W0** derives and propagates a per-book `orderId` (synthetic ID) alongside the shared `amazon_order_id`
2. **W1.1 cron** adds `orderId` to its SELECT and learns to hold incomplete sibling groups
3. **W1.1, W2A, W2B, W3, W4** are each updated to use `orderId` (per-book) for all R2 and Supabase write operations, while preserving `amazon_order_id` as a group-level reference
4. **A new W4.1 workflow** (or backend aggregation endpoint) receives all N siblings when they are all ready for print, and submits a single bundled Lulu job

The change count is significant but most are the same fix applied at different workflow entry points. The actual code change per node is typically 2–5 lines.

---

## Architecture Decision — Aggregation Strategy

**Decision: Backend aggregation endpoint (Option A)**

Sibling aggregation happens at the Vercel cron router layer before W1.1, not inside n8n:

- When all siblings in a group have `next_workflow = '4'` and `execution_status = 'ready_for_processing'`, the cron detects the complete group, tags all siblings for the `4-aggregate` path, and sends them together in the W1.1 payload
- W1.1 routes these to a new `Prep Workflow 4-Aggregate Orders` node that builds a combined payload
- The combined payload triggers **W4.1** (new workflow or backend endpoint) which submits a single Lulu job with N line items
- W4 (single-book path) remains unchanged for non-sibling orders

**Status to introduce: `sibling_waiting`**  
Orders that have completed W3 but are waiting for their sibling group to complete should be marked `execution_status = 'sibling_waiting'` rather than `ready_for_processing`. This prevents the health monitor from misclassifying them as orphans and enables clean admin panel display.

---

## Workflow-by-Workflow Change Summary

### W0 — Order Intake & Validation
**Difficulty: 3/5** | **Critical changes: 3** | **Minor: 2** | **No change: 6**

W0 is the only place where sibling identity should be derived. Everything downstream reads from what W0 writes.

| Node | Tag | Change |
|------|-----|--------|
| Mock Order (STANDARD) | UPDATE | Add sibling mock variant with synthetic ID |
| Mock Order (AMAZON) | UPDATE | Add sibling mock variant with synthetic ID |
| CONFIG (PRODUCTION) | NO CHANGE | — |
| **Normalize Payload** | **UPDATE ⚠️** | Promote `amazonOrderId` + `marketplaceId` to top level; derive `rootOrderId` + `isSiblingOrder` |
| Extract & Validate Dedication | NO CHANGE | — |
| **Build 1-manifest.json** | **UPDATE ⚠️** | Add `siblingGroupId` to manifest; read from top-level fields once Normalize is fixed |
| Create Binary | NO CHANGE | — |
| Upload 1-manifest to R2 | NO CHANGE | — |
| Fallback / Merge | NO CHANGE | — |
| **Supabase Upsert** | **UPDATE ⚠️** | Write root `amazon_order_id` (not synthetic ID) to `amazon_order_id` column; use `siblingGroupId` where available |

**Root cause being fixed:** W0 currently sets `amazon_order_id` = the full payload `amazonOrderId`, which for siblings is a synthetic ID. After the fix, `amazon_order_id` = root group ID for all members of a group; each row's unique `orderId` column carries the per-book synthetic ID.

---

### W1.1 — Queue Manager and Router
**Difficulty: 4/5** | **Critical changes: 5** | **Minor: 1** | **Verify: 1** | **New Node: 1** | **No change: 16**

W1.1 is where the orderId collision propagates downstream. Every Prep node uses `order.amazon_order_id` as the per-book `orderId` — causing all siblings to collapse to the same identity before they even enter their respective workflows.

| Node | Tag | Change |
|------|-----|--------|
| Webhook Trigger | NO CHANGE | — |
| Extract Orders from Webhook | NO CHANGE | — |
| **Route Orders by Workflow** | **DECISION POINT + UPDATE** | Add `workflow4-aggregate` routing path for complete sibling groups |
| **Prep 2A Orders** | **UPDATE ⚠️** | Use `order.orderId` (per-book) not `order.amazon_order_id`; pass `amazonOrderId` separately |
| Mark as Processing (2A) | NO CHANGE | — |
| Trigger 2A Workflow | NO CHANGE | — |
| **Prep 2B Orders** | **UPDATE ⚠️** | Same orderId fix as Prep 2A |
| Mark/Verify/Trigger 2B | NO CHANGE | — |
| **Prep Workflow 3 Orders** | **UPDATE ⚠️** | Same orderId fix; use `one_manifest_url` for manifest key |
| Mark/Verify/Trigger W3 | NO CHANGE | — |
| **Merge Prep+Supabase (W3)** | **UPDATE (minor)** | Preserve `amazonOrderId` in merged output |
| **Prep Workflow 4 Orders** | **UPDATE ⚠️** | Same orderId fix + manifest key fix; add aggregation branch |
| Validate Shipping for W4 | VERIFY | Confirm sibling `shipping_address` populated |
| Get Signed URL / Mark/Verify/Trigger W4 | NO CHANGE | — |
| Flag Missing Shipping / Log Skipped | NO CHANGE | — |
| **NEW: Prep W4-Aggregate Orders** | **NEW NODE** | Build combined payload for sibling groups; trigger W4.1 |

**Root cause being fixed:** All four Prep nodes use `order.amazon_order_id` as the routing `orderId`. For siblings sharing the same `amazon_order_id`, this collapses two+ siblings to the same R2 path prefix, causing manifest overwrites and character data corruption downstream.

---

### W1.1 Cron Router — `route.ts`
**Difficulty: 4/5** | **Critical changes: 2** | **No change: 2**

The Vercel cron router is W1.1's upstream data source and is where sibling group detection must live.

| Component | Tag | Change |
|-----------|-----|--------|
| **Supabase SELECT query** | **UPDATE ⚠️** | Add `orderId` column to SELECT (currently missing — W1.1 Prep nodes receive `undefined` for `order.orderId`) |
| **Sibling group detection** | **DECISION POINT + UPDATE** | Before routing W4 orders, query for all siblings in the group; hold incomplete groups; tag complete groups for `4-aggregate` path |
| W4 eligibility filter | NO CHANGE | Per-row logic, correct for siblings |
| `determineNextWorkflow` | NO CHANGE | Per-order logic, sibling awareness not needed here |

**Critical finding:** The cron's SELECT currently has **no `orderId` column**. The W1.1 fix `order.orderId || order.amazon_order_id` will not work until this SELECT is updated — `order.orderId` will always be `undefined` and the fallback will always resolve to `amazon_order_id`.

---

### W1.5 — Health Monitor
**Difficulty: 3/5** | **Critical changes: 3** | **Cron: 3** | **Verify: 2** | **No change: many**

W1.5 is an indirect sibling concern. Orders held in `sibling_waiting` status will be misclassified as orphans by the health monitor unless it is made aware of the holding strategy.

| Node/Component | Tag | Change |
|----------------|-----|--------|
| Stuck path (all nodes) | NO CHANGE | All PATCH by `id` (auto-increment), safe |
| Retry: Validate & Flatten | NO CHANGE | — |
| Retry: Reset Status for Retry | NO CHANGE | Per-row by `id`, safe |
| **Retry: Prep for Router** | **UPDATE ⚠️** | Use `order.orderId \|\| order.amazon_order_id`; add `amazonOrderId` field separately |
| **Orphaned: Classify Orphans** | **UPDATE ⚠️** | Add `sibling_waiting` / `no_action` check before `ready_not_picked_up → reset_processing` |
| **Orphaned: Route by Action** | **UPDATE (minor)** | Add `no_action` route and new IF → Preserve → Merge chain |
| Orphaned recovery paths | VERIFY | Safe now; re-verify once `sibling_waiting` status is implemented |
| **Cron: Stuck SELECT** | **UPDATE** | Add `orderId` to SELECT |
| **Cron: Retry SELECT** | **UPDATE ⚠️** | Add `orderId` to SELECT (required for Prep node fix) |
| **`get_orphaned_orders` RPC** | **DECISION POINT** | Audit live function in Supabase; add sibling exclusion for `sibling_waiting` status |

**The Orphaned Trap:** Siblings held in `sibling_waiting` will sit in `ready_for_processing` indefinitely by design. The health monitor's RPC will classify them as `ready_not_picked_up` orphans and attempt to reset them — interfering with the hold. The cleanest solution is a dedicated `sibling_waiting` execution status that the RPC explicitly excludes.

---

### W2A — Character Generation Orchestrator
**Difficulty: 3/5** | **Critical changes: 3** | **Verify: 1** | **No change: all sub-workflows + most nodes**

**W2A sub-workflows (SW0, SW1, SW2, SW3): ALL NO CHANGE.** All character image assets are stored under `characters/${characterHash}/...` — completely order-agnostic. Two siblings with different specs generate independently. Two with identical specs produce idempotent writes.

The only changes are in the orchestrator itself, where the 2A manifest path and Supabase write are order-scoped.

| Node | Tag | Change |
|------|-----|--------|
| Webhook, Config, Hash, Loop | NO CHANGE | — |
| Normalize Router Payload | VERIFY | Correct after W1.1 fix; no code change |
| **Capture Order Context** | **UPDATE ⚠️** | Remove silent fallback `orderId → amazonOrderId`; `orderId` should be null rather than collapsing to group root |
| Set Environment Defaults | NO CHANGE | — |
| All SW0/SW1/SW2/SW3 executions | NO CHANGE | Character-hash keyed, order-agnostic |
| Results Accumulator | NO CHANGE | — |
| **Write Run Manifest1** | **UPDATE ⚠️** | Use per-book `orderId` for manifest R2 path (not `amazonOrderId`); record both IDs in manifest content |
| Upload Manifest to R2 | NO CHANGE | Key from Write Run Manifest1 |
| **Supabase — Upsert from 2A Manifest** | **UPDATE ⚠️** | Fix `orderId` body parameter: write per-book ID, not group root ID |
| Respond to Webhook | NO CHANGE | — |
| Retry/Error path | NO CHANGE | — |

---

### W2A Sub-Workflows — SW0, SW1, SW2, SW3
**Difficulty: 1/5** | **Changes required: 0**

All four sub-workflows are fully character-hash scoped. `amazonOrderId` appears only in pass-through/logging fields and is never used to construct any R2 path, URL, or storage key. No modifications required.

---

### W2B Main Orchestrator
**Difficulty: 3/5** | **Critical changes: 2** | **Verify: 10** | **No change: 8**

W2B is order-scoped for its 2B manifest. Correctness depends heavily on upstream W1.1 + W2A fixes propagating the right `orderId` value.

| Node | Tag | Change |
|------|-----|--------|
| Webhook Trigger | NO CHANGE | — |
| **Normalize 2B Input** | **UPDATE ⚠️** | Extract and propagate `amazonOrderId` separately from `orderId`; confirm per-book `orderId` is picked first |
| Download 2A Manifest | VERIFY | Correct after upstream fixes |
| Download 2B Manifest (optional) | VERIFY | Correct after upstream fixes |
| **Build Worklist** | **UPDATE ⚠️** | Fix fallback precedence: `orderId` must precede `amazonOrderId` in manifest fallback chain |
| All Poses Skipped path | VERIFY | Add `amazonOrderId` to notification payload |
| Split In Batches | NO CHANGE | — |
| Execute Workflow: s2B-sw | NO CHANGE | Sub-workflow handles per-book ID correctly |
| Normalize Result | VERIFY | Correct after upstream fixes |
| Download / Merge manifests | VERIFY | Correct after upstream fixes |
| Upload 2B Manifest to R2 | VERIFY | Per-book path after fixes |
| Notify Backend nodes | VERIFY | Add `amazonOrderId` to payloads |
| Final Summary / Ack | NO CHANGE | — |

---

### W2B-SW1 — Single Pose Background Removal
**Difficulty: 1/5** | **Changes required: 0**

SW1 is character-hash scoped for its only R2 write (`bgRemovedKey`). `orderId` flows through as identity context for the orchestrator's manifest assembly and is never used to construct any storage path. No modifications required.

---

### W3 — Book Assembly
**Difficulty: 4/5** | **Critical changes: 5** | **Verify: 10** | **No change: 22**

W3 is the most change-intensive single workflow. All its outputs (page preview images, cover preview, 3-manifest) are order-scoped R2 paths, and it has two Supabase operations, both of which must target per-book rows.

| Node | Tag | Change |
|------|-----|--------|
| Webhook / Manual Trigger | NO CHANGE | — |
| Idempotency Check | NO CHANGE | — |
| Extract Manifest URL (3) | VERIFY | Correct precedence; no code change |
| Download 2B Manifest | VERIFY | Correct after upstream fixes |
| **Build Assembly Input From Manifest** | **UPDATE ⚠️** | Reverse fallback: `order.orderId \|\| order.amazonOrderId`; propagate per-book `orderId` as primary key |
| Get Order Ready for Assembly | VERIFY | W1.1 must send both IDs |
| Load Canonical Assets | VERIFY | Guard check only; no path construction |
| Load Story & Character Poses | NO CHANGE | Character-hash keyed paths |
| **Resolve Asset Paths (3A Phase 1)** | **UPDATE ⚠️** | Pick per-book `orderId` in ctx; change `renderContext.orderId = ctx.amazonOrderId` → `ctx.orderId \|\| ctx.amazonOrderId` |
| Normalize Inputs | NO CHANGE | — |
| Generate Cover HTML (Amazon/Standard) | NO CHANGE | Backend proxy URLs |
| Route Cover by Order Type | NO CHANGE | — |
| Generate Cover Image / Poll / Download | NO CHANGE | PDFMonkey API calls |
| Set Cover PNG Filenames/Keys | VERIFY | Correct after Resolve Asset Paths fix |
| Upload Cover Preview to R2 | VERIFY | Per-book path after upstream fixes |
| Carry Cover Keys Forward | NO CHANGE | — |
| Generate Complete HTML (Amazon/Standard) | NO CHANGE | — |
| **Generate Page Preview Images** | **UPDATE ⚠️** | Change `amazonOrderId` → `orderId \|\| amazonOrderId` for R2 key construction |
| Split in Batches / Merge nodes | NO CHANGE | — |
| Generate Page Image / Poll / Download | NO CHANGE | PDFMonkey API calls |
| Carry Page Keys Forward | VERIFY | Derives from corrected upstream R2 key |
| Upload Page Preview to R2 | VERIFY | Per-book path after upstream fixes |
| Upload to Cloudflare Images | NO CHANGE | CDN, not R2 |
| Store Cloudflare Images ID | NO CHANGE | CDN metadata |
| Wait / Collect Page Preview Images | NO CHANGE | — |
| Build 3A Manifest | VERIFY | Content correct after upstream fixes |
| QA Gate / Acceptance Tests | NO CHANGE | — |
| Prep Manifest Upload (3) | VERIFY | `data.orderId` per-book after fixes |
| Upload 3 Manifest to R2 | VERIFY | Per-book manifest path |
| **Fetch and Merge Review Stages (3)** | **UPDATE ⚠️** | Change Supabase GET from `amazon_order_id=eq.` to `orderId=eq.perBookId` |
| **Supabase Upsert 3** | **UPDATE ⚠️** | (1) `on_conflict=orderId` not `amazon_order_id`; (2) Write per-book ID to `orderId`, root ID to `amazon_order_id` |
| Mark Previews Ready / Log Results | NO CHANGE | — |

**Schema prerequisite:** The `orderId` column in the `orders` table must have a `UNIQUE` constraint for the `on_conflict=orderId` change to work.

---

### W4 — Print Fulfillment (Single Book)
**Difficulty: 2/5** | **Critical changes: 1** | **Cross-workflow dependency: 1** | **Verify: 10** | **No change: 40+**

W4 is in surprisingly good shape. Most Supabase operations use a safe OR filter pattern (`orderId=eq.X OR amazonOrderId=eq.X`) that correctly isolates per-book rows. The one critical fix is the final upsert.

| Node | Tag | Change |
|------|-----|--------|
| Webhook / Manual Trigger | NO CHANGE | — |
| Config (W4) | NO CHANGE | — |
| **Validate & Normalize W4 Input** | VERIFY | Correct after W1.1 fix; W1.1 **must** send `amazonOrderId` separately for Amazon sibling `isAmazonOrder` detection (expectedPageCount: 15 vs 17) |
| Hydrate Order Details | VERIFY | 1-manifest path per-book after W0 fix |
| Supabase: mark start | NO CHANGE | PATCH OR filter — safe |
| Ack nodes | NO CHANGE | — |
| Build Pages HTML / Prepare PDFMonkey | NO CHANGE | — |
| Generate / Poll / Download interior PDF | NO CHANGE | PDFMonkey API calls |
| Upload PDF to R2 | VERIFY | Per-book path after W1.1 fix |
| Build Cover HTML / Generate / Poll / Download cover PDF | NO CHANGE | — |
| Upload Cover PDF to R2 | VERIFY | Per-book path after upstream fixes |
| Supabase: set interior/cover PDF | NO CHANGE | PATCH OR filter — safe |
| Generate Signed URLs | VERIFY | Signs per-book R2 keys |
| Decide Lulu Source URLs | NO CHANGE | — |
| Validate Interior / Cover (PRODUCTION) | NO CHANGE | — |
| Supabase: get existing order | NO CHANGE | OR filter — safe |
| Guard Lulu Submit | NO CHANGE | — |
| Lulu: Get Token / Submit Print Job | NO CHANGE | — |
| Process Lulu Response / Build Supabase Update | NO CHANGE | — |
| Build 4-Manifest / Upload 4-Manifest to R2 | VERIFY | Per-book path after upstream fixes |
| **Supabase: mark submitted** | **UPDATE ⚠️** | (1) `on_conflict=orderId` not `amazon_order_id`; (2) Write per-book ID to `orderId`, root group ID to `amazon_order_id` body field |
| Notify: Sent to Print | NO CHANGE | — |
| Status Banner / Log Assembly Results | NO CHANGE | — |
| On Error / Build Error Context | NO CHANGE | Picks `orderId` first; correct |
| Build/Upload Error 4-Manifest | VERIFY | Per-book path after upstream fixes |
| Supabase: mark error | NO CHANGE | PATCH OR filter — safe |

---

### W4.1 — Sibling Aggregation & Lulu Submission (NEW)
**Difficulty: 5/5** | **Entire new workflow — to be designed**

W4.1 is triggered when a complete sibling group is ready for print. It receives a list of N book records (all siblings in the group), assembles a single Lulu print job payload with N line items, submits to Lulu, and updates all N Supabase rows with the shared `lulu_job_id`.

**Input contract (from W1.1 Prep W4-Aggregate node):**
```json
{
  "siblingGroup": [
    { "orderId": "114-...-item-001", "amazonOrderId": "114-...", "orderDbId": 42, "manifest3Key": "orders/...", "shipping_address": {...} },
    { "orderId": "114-...-item-002", "amazonOrderId": "114-...", "orderDbId": 43, "manifest3Key": "orders/...", "shipping_address": {...} }
  ]
}
```

**Required nodes:**
1. Webhook trigger
2. Validate group (all siblings present, shipping_address on all)
3. For each sibling: fetch 3-manifest → build PDF payload → call PDFMonkey → upload PDFs to R2 (parallel, per-book paths)
4. Generate presigned URLs for all PDFs
5. Lulu: Get Token
6. Submit single Lulu job with N line_items
7. Process Lulu response (one `lulu_job_id` for all N siblings)
8. For each sibling: update Supabase row with `lulu_job_id`, `lulu_status`, status = `sent_to_printer`
9. Notify backend: all N siblings sent to print
10. Build 4-manifest for each sibling

**Implementation sequence:** Design after all individual workflow fixes are in place.

---

## Complete Change Count Summary

| Workflow | Critical Updates | Verify | New Nodes | No Change | Difficulty |
|----------|-----------------|--------|-----------|-----------|------------|
| W0 — Order Intake | 3 | 0 | 0 | 6 | 3/5 |
| W1.1 — Router | 5 | 1 | 1 | 16 | 4/5 |
| W1.1 Cron | 2 | 0 | 0 | 2 | 4/5 |
| W1.5 — Health Monitor | 3 + 3 cron | 2 | 1 | many | 3/5 |
| W2A — Char Gen (orchestrator) | 3 | 1 | 0 | 13 | 3/5 |
| W2A-SW0 | 0 | 0 | 0 | 23 | 1/5 |
| W2A-SW1 | 0 | 0 | 0 | 25 | 1/5 |
| W2A-SW2 | 0 | 0 | 0 | 27 | 1/5 |
| W2A-SW3 | 0 | 0 | 0 | 10 | 1/5 |
| W2B Main | 2 | 10 | 0 | 8 | 3/5 |
| W2B-SW1 | 0 | 0 | 0 | 20 | 1/5 |
| W3 — Book Assembly | 5 | 10 | 0 | 22 | 4/5 |
| W4 — Print Fulfillment | 1 | 10 | 0 | 40+ | 2/5 |
| W4.1 — Sibling Aggregation | NEW WORKFLOW | — | ~10 | — | 5/5 |
| **TOTAL** | **~27** | **~34** | **~12** | **200+** | — |

**Nodes requiring actual code changes: ~27**  
**Nodes to verify after upstream fixes: ~34**  
**No-change nodes confirmed safe: 200+**

---

## The Root Fix — Applied in Six Places

The same root bug (using `amazon_order_id` as per-book routing `orderId`) is fixed in six workflow entry points. The pattern is identical each time:

**Before:**
```javascript
orderId: order.amazon_order_id,
```

**After:**
```javascript
orderId: order.orderId || order.amazon_order_id,  // per-book first
amazonOrderId: order.amazon_order_id,              // root group separately
```

This fix must be applied in:
1. W0 `Normalize Payload` (derivation source)
2. W0 `Supabase Upsert` (persistence)
3. W1.1 Prep 2A / Prep 2B / Prep W3 / Prep W4 (routing)
4. W1.1 Cron SELECT (data source — no `orderId` currently)
5. W2A `Write Run Manifest1` (manifest path)
6. W2A `Supabase Upsert from 2A Manifest` (Supabase write)

Everything else is either a verify (confirm the upstream fix propagates correctly) or an independent sibling-specific concern.

---

## Supabase Changes Required

Two types of Supabase operation bugs, found in three workflows:

### Bug Type 1 — Wrong `on_conflict` column (W3 and W4)
The upsert uses `on_conflict=amazon_order_id`. All siblings share the same `amazon_order_id` — upsert collapses them to one row.

**Fix:** Change to `on_conflict=orderId` in:
- W3: `Supabase Upsert 3`
- W4: `Supabase: mark submitted`

**Prerequisite:** Confirm `orderId` column has a `UNIQUE` constraint in the `orders` table.

### Bug Type 2 — Wrong ID written into `orderId` column (W3 and W4)
The upsert body writes `amazon_order_id` (group root) into the `orderId` column, overwriting the per-book synthetic ID stored by W0.

**Fix:** Write per-book ID to `orderId`; write root group ID to `amazon_order_id`.

### W3 `Fetch and Merge Review Stages` — Wrong Supabase GET filter
Queries `amazon_order_id=eq.X` which returns the root group row, not the per-book row.

**Fix:** Query by `orderId=eq.perBookId`.

---

## Architectural Prerequisites Before Implementation

These must be resolved before any workflow code is changed:

1. **`sibling_waiting` execution status** — Add this value to the `execution_status` enum/type in Supabase. Required before cron holding logic, health monitor exclusion, and admin panel can work correctly.

2. **`orderId` UNIQUE constraint** — Confirm this exists on the `orders` table. Required for the W3 and W4 `on_conflict=orderId` fix.

3. **`orderId` column in cron SELECT** — Add `orderId` to the router cron SELECT query. All W1.1 Prep node fixes depend on this.

4. **`get_orphaned_orders` RPC audit** — Run `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'get_orphaned_orders';` in the Supabase SQL editor and add `sibling_waiting` to the exclusion conditions.

5. **Backend webhook handlers** — The endpoints `/api/webhooks/workflow-2b-complete`, `/api/webhooks/workflow-2b-skipped`, and `/api/webhooks/sent-to-print` must be able to look up Supabase rows by per-book `orderId` (not just `amazon_order_id`). Confirm before W2B or W4 go live.

---

## Open Questions — Awaiting Decisions

| # | Question | Affects |
|---|----------|---------|
| 1 | D2C multi-item orders — are they in scope? If yes, how is sibling identity established without `amazonOrderId`? | W0 design |
| 2 | `sibling_group_id` dedicated Supabase column — or derive groups purely from `amazon_order_id`? | W0, cron, admin panel |
| 3 | W1.1 trigger payload shape for aggregation — single item with `siblingOrders[]` array, or individual items tagged `_routeTo: '4-aggregate'`? | W1.1 + W4.1 design |
| 4 | `sibling_waiting` status display in admin panel — what UI label / state? | Admin panel |
| 5 | Retry of a stuck sibling mid-aggregation — if one book fails W4 after the group was submitted together, does the Lulu job need to be cancelled and re-submitted? | W4.1 error handling |
| 6 | PDFMonkey W3 concurrency limit — cap W3 at 2 concurrent jobs in cron router (separate from sibling work, but should be implemented in same cron session) | Cron router |
| 7 | Cloudflare Images metadata — admin tools that query Cloudflare by `orderId` will now receive per-book synthetic IDs; confirm compatibility | Admin/review tools |

---

## Recommended Implementation Order

### Phase 0 — Prerequisites (no workflow changes)
1. Confirm / add `UNIQUE` constraint on `orders.orderId`
2. Add `sibling_waiting` to `execution_status` allowed values
3. Audit `get_orphaned_orders` RPC; add `sibling_waiting` exclusion
4. Confirm backend webhook handlers can resolve rows by per-book `orderId`

### Phase 1 — Data Foundation (W0 + cron SELECT)
Estimated effort: 2–3 hours
1. **W0: Normalize Payload** — derive `rootOrderId`, `isSiblingOrder`; promote fields to top level
2. **W0: Build 1-manifest.json** — add `siblingGroupId` to manifest
3. **W0: Supabase Upsert** — write root ID to `amazon_order_id`, per-book ID to `orderId`
4. **Cron router SELECT** — add `orderId` column

*Test: send a mock sibling order through W0; verify Supabase row has correct `orderId` (synthetic) and `amazon_order_id` (root); verify 1-manifest stored at per-book path.*

### Phase 2 — Router Fixes (W1.1)
Estimated effort: 3–4 hours
1. **W1.1: All four Prep nodes** — use `order.orderId || order.amazon_order_id`
2. **W1.1: Merge Prep+Supabase (W3)** — add `amazonOrderId` preservation
3. **W1.1: Route Orders** — add `workflow4-aggregate` branch

*Test: route two siblings through W1.1; verify each gets a distinct `orderId` in the trigger payload to downstream workflows.*

### Phase 3 — Character Generation (W2A)
Estimated effort: 2 hours
1. **W2A: Capture Order Context** — remove silent fallback
2. **W2A: Write Run Manifest1** — use per-book path
3. **W2A: Supabase Upsert from 2A Manifest** — fix `orderId` body param

*Test: run two siblings through W2A; verify each produces a distinct 2A manifest at its own R2 path; verify character assets shared correctly when specs are identical.*

### Phase 4 — Background Removal (W2B)
Estimated effort: 1.5 hours
1. **W2B: Normalize 2B Input** — extract `amazonOrderId` separately
2. **W2B: Build Worklist** — fix fallback precedence

*Test: run two siblings through W2B; verify each produces a distinct 2B manifest.*

### Phase 5 — Book Assembly (W3)
Estimated effort: 3–4 hours
1. **W3: Build Assembly Input From Manifest** — reverse fallback
2. **W3: Resolve Asset Paths** — emit per-book orderId to renderContext
3. **W3: Generate Page Preview Images** — use orderId not amazonOrderId
4. **W3: Fetch and Merge Review Stages** — fix Supabase GET query
5. **W3: Supabase Upsert 3** — fix conflict column + body fields

*Test: run two siblings through W3; verify distinct page preview images, cover images, and 3-manifests; verify Supabase upsert updates the correct row for each sibling.*

### Phase 6 — Print Fulfillment (W4 single-book + W1.5)
Estimated effort: 2 hours
1. **W4: Supabase: mark submitted** — fix conflict column + body fields
2. **W1.5: Retry: Prep for Router** — fix orderId fallback
3. **W1.5: Orphaned: Classify Orphans** — add `sibling_waiting` / `no_action` case
4. **W1.5: Orphaned: Route by Action** — add `no_action` path
5. **Health monitor cron SELECTs** — add `orderId` to stuck and retry queries

*Test: run a single-book order end-to-end through the complete pipeline to confirm no regressions.*

### Phase 7 — Sibling Aggregation (W4.1 + cron group detection)
Estimated effort: 6–8 hours
1. **Cron router** — add sibling group detection and `sibling_waiting` status logic
2. **W1.1: Prep W4-Aggregate Orders** — build combined payload
3. **W4.1** — design and implement new workflow (or backend endpoint)

*Test: place a 2-book sibling order end-to-end; verify single Lulu job created; verify both Supabase rows share the same `lulu_job_id`.*

---

## Glossary

| Term | Definition |
|------|------------|
| `orderId` | Per-book unique identifier (per-book synthetic ID for siblings, equals `amazon_order_id` for primary orders). Used in all R2 paths and Supabase row identity. |
| `amazon_order_id` | Root Amazon order ID shared by all books in a group (e.g., `114-7080737-5512234`). Used for group-level Supabase queries. |
| Sibling order | A book that is part of a multi-book Amazon order. Has a synthetic `orderId` with `-item-XXXXXXXXX` suffix. |
| Primary order | The first book in an order (or any order with only one book). `orderId === amazon_order_id`. |
| `siblingGroupId` | Alias for the root `amazon_order_id` written into manifests and Supabase for group identification. |
| Character-hash scoped | Storage paths keyed by `characterHash` — independent of order identity, safe for siblings. |
| Order-scoped | Storage paths keyed by `orderId` — must be per-book synthetic ID for siblings to avoid collision. |
| `sibling_waiting` | Proposed `execution_status` for orders held pending sibling group completion. |

---

*Document generated: 2026-02-19*  
*Source files: `/docs/n8n-workflow-files/sibling-orders/`*  
*This document is the authoritative reference for the sibling-order N+ implementation project.*
