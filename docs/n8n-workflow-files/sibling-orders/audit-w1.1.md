# W1.1 Audit — Queue Manager and Router
**Sibling Order N+ Support Audit**
**File:** `w1.1-Queue_Manager_and_Router.json`
**Audited:** 2026-02-19
**Status:** Complete

---

## Workflow Overview

W1.1 is the central dispatcher for the entire pipeline. A Vercel cron job queries Supabase for ready orders and posts them here as a batch. W1.1 routes each order by `next_workflow` (2A, 2B, 3, or 4), marks it as processing in Supabase (optimistic lock), verifies the claim succeeded, then fires the appropriate downstream webhook.

**Flow:**
```
Webhook Trigger (Vercel Cron POST)
  → Extract Orders from Webhook
  → Route Orders by Workflow
      ├─ Prep 2A Orders → Mark as Processing (2A) → Trigger 2A Workflow
      ├─ Prep 2B Orders → Mark as Processing (2B) → Verify Order Claimed (2B) → Trigger 2B Workflow
      ├─ Prep Workflow 3 Orders → Mark as Processing (3) → Merge Prep+Supabase → Verify Order Claimed (3) → Trigger Workflow 3
      └─ Prep Workflow 4 Orders → Validate Shipping → Get Signed URL (1-manifest)-W4
                                                      → Mark as Processing (4) → Verify Order Claimed (4) → Trigger Workflow (W4)
                                  (invalid shipping) → Flag Missing Shipping (Supabase + Backend) → Log Skipped W4 Order
```

---

## Node-by-Node Findings

---

### 1. Webhook Trigger
**Tag: `NO CHANGE`**

Standard n8n webhook receiver. Accepts POST from Vercel cron. No order-level logic. No changes needed.

---

### 2. Extract Orders from Webhook
**Tag: `NO CHANGE`**

Unwraps `body.orders` or `orders` from the cron payload and emits individual order items. Passes orders through unchanged — whatever Vercel sends is what proceeds. No sibling-specific logic needed here; the cron/Vercel layer is responsible for deciding which orders are ready.

---

### 3. Route Orders by Workflow
**Tag: `DECISION POINT` + `UPDATE`**

This is the most architecturally significant node in the context of sibling aggregation. It reads `order.next_workflow` and bins orders into `workflow2A`, `workflow2B`, `workflow3`, `workflow4` arrays, then fans them out in parallel.

**Current behavior:** Any order with `next_workflow === '4'` is routed directly to the single-order W4 path. There is no concept of a sibling group, no holding pattern, and no aggregation path.

**What needs to change for sibling aggregation:**

This node (or the cron/Vercel layer before it) must detect when an order headed for W4 is part of a sibling group and whether *all members of that group* are also ready for W4. The decision tree becomes:

```
next_workflow === '4'?
  ├─ Is this order part of a sibling group?
  │     ├─ NO  → route to workflow4 as today
  │     └─ YES → Are all siblings in the group also ready for W4?
  │                   ├─ YES → route to workflow4-aggregate (new path)
  │                   └─ NO  → hold / skip this cycle (wait for siblings)
  └─ Other workflows → unchanged
```

**Where this logic should live — three options:**

| Option | Where | Notes |
|--------|-------|-------|
| **A (Recommended)** | Vercel cron (before this node) | Cron queries Supabase for sibling groups all ready for W4; sends them as a pre-formed group. W1.1 gets a new `workflow4-aggregate` array in the payload. Cleanest separation. |
| **B** | This node | W1.1 queries Supabase at runtime to check sibling status. Adds async DB call here; works but makes W1.1 heavier. |
| **C** | Backend aggregation endpoint | W1.1 routes W4 orders normally; a separate cron or endpoint handles group detection and submits aggregated Lulu jobs, bypassing W4 entirely for grouped orders. |

Recommendation: **Option A** — the Vercel cron already queries Supabase for ready orders; it is the natural place to detect complete sibling groups and tag them accordingly. W1.1 then simply needs a new `workflow4-aggregate` branch in the router.

**Concrete change required (regardless of option):**

Add a new routing case:
```javascript
} else if (nextWorkflow === '4-aggregate') {
  routed.workflow4Aggregate = routed.workflow4Aggregate || [];
  routed.workflow4Aggregate.push(order);
}
```

---

### 4. Prep 2A Orders
**Tag: `UPDATE` ⚠️ — Critical (applies to all Prep nodes)**

This node uses `order.amazon_order_id` as the `orderId` passed downstream:

```javascript
orderId: order.amazon_order_id,
```

**The problem:** After the W0 fix, `amazon_order_id` in Supabase = the *root* group ID (e.g., `114-7080737-5512234`) for *all* members of a sibling group — including siblings whose Supabase `orderId` is a synthetic ID (e.g., `114-7080737-5512234-item-152767221930001`).

If two sibling orders are both routed to W2A, both would emit `orderId = "114-7080737-5512234"`. Downstream workflows build R2 paths using `orderId`:
```
book-mvp-simple-adventure/orders/${orderId}/manifests/...
```
This would cause **R2 path collisions** — both siblings writing manifests, character images, and book assets to the same directory.

**Fix:** Use the Supabase row's `orderId` field (the unique per-book identifier) as the routing `orderId`, not `amazon_order_id`. The `amazon_order_id` should also be passed through for group identification purposes.

```javascript
// CURRENT (broken for siblings):
orderId: order.amazon_order_id,

// FIXED:
orderId: order.orderId || order.amazon_order_id, // prefer unique per-book ID
amazonOrderId: order.amazon_order_id,            // preserve group ID separately
```

> **Note:** This same fix applies identically to **Prep 2B Orders**, **Prep Workflow 3 Orders**, and **Prep Workflow 4 Orders**. Documented once here; flagged on each node below.

---

### 5. Mark as Processing (2A)
**Tag: `NO CHANGE`**

PATCHes by `id` (Supabase row ID) with `execution_status: 'processing'`. Uses `$json.orderDbId` which comes from `order.id` (the Supabase auto-increment ID). This is correct and will work for siblings without change.

---

### 6. Trigger 2A Workflow
**Tag: `NO CHANGE`**

Fires the 2A webhook with the prepared payload. Once `Prep 2A Orders` is fixed to use the correct `orderId`, this node requires no changes.

---

### 7. Prep 2B Orders
**Tag: `UPDATE` ⚠️**

Same `orderId: order.amazon_order_id` issue as Prep 2A Orders. Same fix applies:
```javascript
orderId: order.orderId || order.amazon_order_id,
amazonOrderId: order.amazon_order_id,
```

---

### 8. Mark as Processing (2B)
**Tag: `NO CHANGE`**

Same pattern as Mark as Processing (2A). Uses `orderDbId` (Supabase row ID). Correct for siblings.

---

### 9. Verify Order Claimed (2B)
**Tag: `NO CHANGE`**

Checks that the PATCH returned data (optimistic lock). No order ID logic. No changes needed.

---

### 10. Trigger 2B Workflow
**Tag: `NO CHANGE`**

Fires the 2B webhook. No changes needed once upstream Prep node is fixed.

---

### 11. Prep Workflow 3 Orders
**Tag: `UPDATE` ⚠️**

Same `orderId: order.amazon_order_id` issue. Additionally builds R2 manifest keys using `order.amazon_order_id`:

```javascript
const finalKey = ... `${prefix}/${order.amazon_order_id}/manifests/1-manifest.json`;
```

For sibling orders, this constructs the **wrong R2 path** — the 1-manifest for a sibling was written to `orders/<synthetic-orderId>/manifests/1-manifest.json` by W0, not to `orders/<rootOrderId>/manifests/1-manifest.json`.

**Fix:**
```javascript
// CURRENT (broken for siblings):
orderId: order.amazon_order_id,
const finalKey = `${prefix}/${order.amazon_order_id}/manifests/1-manifest.json`;

// FIXED:
const orderId = order.orderId || order.amazon_order_id;
orderId: orderId,
amazonOrderId: order.amazon_order_id,
const finalKey = order.one_manifest_url || `${prefix}/${orderId}/manifests/1-manifest.json`;
```

Note: `order.one_manifest_url` should already contain the correct per-book path as stored by W0 — prefer that over constructing the path here.

---

### 12. Mark as Processing (3)
**Tag: `NO CHANGE`**

Uses `orderDbId` (Supabase row ID). Correct for siblings.

---

### 13. Merge Prep Data with Supabase Response (3)
**Tag: `UPDATE` — Minor**

Merges prep data with the Supabase PATCH response. Currently resolves `orderId` as:
```javascript
orderId: prepData.orderId || supabaseData.amazon_order_id || supabaseData.amazonOrderId
```

After the Prep W3 fix, `prepData.orderId` will be the correct per-book ID. The fallback to `amazon_order_id` should still be kept as a safety net but the priority order is already correct. No structural change needed, but worth reviewing once Prep nodes are updated to confirm the merge resolves correctly.

Also: `amazonOrderId` is not explicitly preserved in the merged output. Add it:
```javascript
amazonOrderId: prepData.amazonOrderId || supabaseData.amazon_order_id,
```

---

### 14. Verify Order Claimed (3)
**Tag: `NO CHANGE`**

Checks PATCH succeeded. No order ID logic. No changes needed.

---

### 15. Trigger Workflow 3
**Tag: `NO CHANGE`**

Fires W3 webhook. No changes needed once upstream Prep node is fixed.

---

### 16. Prep Workflow 4 Orders
**Tag: `UPDATE` ⚠️ — Critical + Aggregation Decision Point**

Builds the W4 payload. Has the same `orderId` collision issue plus additional concerns:

```javascript
// CURRENT (broken for siblings):
orderId: order.amazon_order_id,
manifest3Key: `${prefix}/${order.amazon_order_id}/manifests/3-manifest.json`,
oneManifestKey: order.one_manifest_url || `${prefix}/${order.amazon_order_id}/manifests/1-manifest.json`,
```

For a sibling order, both manifest keys would point to the root order's directory rather than the sibling's own directory. This would cause W4 to read the wrong manifests.

**Fix (single-order path):**
```javascript
const orderId = order.orderId || order.amazon_order_id;
orderId: orderId,
amazonOrderId: order.amazon_order_id,
manifest3Key: `${prefix}/${orderId}/manifests/3-manifest.json`,
oneManifestKey: order.one_manifest_url || `${prefix}/${orderId}/manifests/1-manifest.json`,
```

**Aggregation path (new — for sibling groups):**

A new `Prep Workflow 4-Aggregate Orders` node (or an extension of this node with a branch) will be needed. Instead of building a single-order payload, it must:
1. Accept a list of sibling order IDs (all members of the group)
2. Build a combined payload containing the `orderId` and manifest keys for each sibling
3. Pass this to a new W4.1 (or backend aggregation endpoint) instead of the current W4 webhook

This is a **new node** or a conditional branch within this node — to be designed after the aggregation strategy is decided.

---

### 17. Validate Shipping for w4
**Tag: `VERIFY`**

Validates that key shipping fields exist (`name`, `state_code`, `address_line_1`, `city`, `postal_code`). For sibling orders, all members share the same shipping address (same Amazon order = same delivery address). The validation logic itself is correct and does not need to change. However, the `orderId` in the payload passed through here must be the per-book ID (fixed by Prep W4 update).

Confirm that `order.shipping_address` is populated correctly in Supabase for sibling orders (set during create-sibling API call).

---

### 18. Get Signed URL (1-manifest)-W4
**Tag: `NO CHANGE`**

Fetches a signed R2 URL for `oneManifestKey`. Once the Prep W4 node uses the correct per-book `orderId` for the manifest key, this node works correctly without modification.

---

### 19. Mark as Processing (4)
**Tag: `NO CHANGE`**

Uses `orderDbId`. Correct for siblings.

---

### 20. Verify Order Claimed (4)
**Tag: `NO CHANGE`**

Optimistic lock check. No order ID logic. No changes needed.

---

### 21. Trigger Workflow (W4)
**Tag: `NO CHANGE`**

Fires W4 webhook. No changes needed once upstream Prep node is fixed.

---

### 22. Flag Missing Shipping (Supabase + Backend)
**Tag: `NO CHANGE`**

Error path for missing shipping. Uses `orderDbId` and `orderId` passed through. No sibling-specific concerns.

---

### 23. Log Skipped W4 Order
**Tag: `NO CHANGE`**

Logging node for skipped W4 orders. No changes needed.

---

## Summary of Required Changes

| Node | Tag | Change Required |
|------|-----|-----------------|
| Webhook Trigger | `NO CHANGE` | — |
| Extract Orders from Webhook | `NO CHANGE` | — |
| Route Orders by Workflow | `DECISION POINT` + `UPDATE` | Add `workflow4-aggregate` routing path; sibling group detection (in cron or here) |
| Prep 2A Orders | `UPDATE` ⚠️ | Use `order.orderId` not `order.amazon_order_id`; pass `amazonOrderId` separately |
| Mark as Processing (2A) | `NO CHANGE` | — |
| Trigger 2A Workflow | `NO CHANGE` | — |
| Prep 2B Orders | `UPDATE` ⚠️ | Same orderId fix as Prep 2A |
| Mark as Processing (2B) | `NO CHANGE` | — |
| Verify Order Claimed (2B) | `NO CHANGE` | — |
| Trigger 2B Workflow | `NO CHANGE` | — |
| Prep Workflow 3 Orders | `UPDATE` ⚠️ | Same orderId fix; use `one_manifest_url` for manifest key |
| Mark as Processing (3) | `NO CHANGE` | — |
| Merge Prep Data with Supabase Response (3) | `UPDATE` — Minor | Preserve `amazonOrderId` in merged output |
| Verify Order Claimed (3) | `NO CHANGE` | — |
| Trigger Workflow 3 | `NO CHANGE` | — |
| Prep Workflow 4 Orders | `UPDATE` ⚠️ + `DECISION POINT` | Same orderId fix + manifest key fix; new aggregation branch needed |
| Validate Shipping for w4 | `VERIFY` | Confirm sibling shipping_address is populated in Supabase |
| Get Signed URL (1-manifest)-W4 | `NO CHANGE` | — |
| Mark as Processing (4) | `NO CHANGE` | — |
| Verify Order Claimed (4) | `NO CHANGE` | — |
| Trigger Workflow (W4) | `NO CHANGE` | — |
| Flag Missing Shipping (Supabase + Backend) | `NO CHANGE` | — |
| Log Skipped W4 Order | `NO CHANGE` | — |

**Critical changes: 4** (Route Orders, Prep 2A, Prep 2B, Prep W3, Prep W4 — orderId collision is the same root fix)
**Minor changes: 1** (Merge Prep+Supabase node)
**Verify: 1** (Validate Shipping)
**New node required: 1** (Prep Workflow 4-Aggregate Orders, or aggregation branch)
**No change: 16**

---

## The orderId Collision — Root Cause Summary

Every Prep node (2A, 2B, 3, 4) uses `order.amazon_order_id` as the routing `orderId`. This is correct today because all orders are primary orders and `orderId === amazon_order_id`. 

Once siblings exist, `amazon_order_id` in Supabase becomes the shared root group ID. Two or more sibling orders will share the same `amazon_order_id` but have unique Supabase `orderId` values (the synthetic IDs). Using `amazon_order_id` as the routing `orderId` collapses siblings to the same identity, causing:

- **R2 path collisions** — manifests and assets overwrite each other
- **Incorrect manifest fetches** — each sibling reads the other's files
- **Lulu payload corruption** — wrong character specs / PDFs in the print job

The fix is uniform across all four Prep nodes: use `order.orderId` (the unique Supabase row identifier) as the per-book routing ID, and carry `order.amazon_order_id` as a separate `amazonOrderId` field for group-level operations.

---

## Aggregation Decision Point — W4 Path

W1.1 is where the aggregation strategy surfaces most concretely. The W4 routing path currently fans out individual orders one at a time. For sibling groups, it must either:

1. **Hold individual siblings** until all are ready, then trigger a combined path (requires group awareness in cron or here)
2. **Route all siblings individually** to W4 as today, and let W4 or a backend endpoint handle the aggregation before submitting to Lulu

Option 1 (hold in router) is cleaner operationally but requires the Vercel cron to know about group readiness. Option 2 (aggregate in W4 or backend) keeps W1.1 simpler but pushes complexity downstream.

This decision should be made before implementing W4 changes.

---

## W3 Concurrency Limit — PDFMonkey Note

**Tag: `UPDATE` — Independent of sibling work, implement in Vercel cron router**

PDFMonkey has exhibited rendering failures when too many W3 (book assembly) jobs run simultaneously. The global 5-slot capacity cap does not distinguish between workflow types, so up to 5 W3 jobs could hit PDFMonkey concurrently.

The fix should be isolated to the Vercel cron router (`/api/cron/router/route.ts`) — not in W1.1 itself. Before slicing `ordersToRoute` down to `availableSlots`, add a W3-specific sub-limit:

```typescript
// After building eligibleOrders, before: ordersToRoute = eligibleOrders.slice(0, availableSlots)
const { data: w3InFlight } = await supabase
  .from('orders')
  .select('id', { count: 'exact', head: true })
  .eq('execution_status', 'processing')
  .eq('current_workflow', '3');

const w3ActiveCount = w3InFlight?.length ?? 0;
const w3Limit = 2; // Tune based on PDFMonkey capacity
const w3Slots = Math.max(0, w3Limit - w3ActiveCount);

// When assigning orders to slots, cap W3 orders at w3Slots;
// non-W3 orders fill remaining global slots normally
```

This is a standalone improvement independent of sibling support. Implement it in the same cron router work session as the `orderId` SELECT fix and sibling group detection, but does not block any other audit work.

---

## Open Questions

1. **Supabase `orderId` column name** — The Prep nodes reference `order.amazon_order_id` to get the order identifier. Does the Supabase query result include `orderId` as a distinct column, or is the unique per-book ID only in `id` (auto-increment)? Confirm the column names returned by the cron query before updating Prep nodes.
2. **Sibling `shipping_address` in Supabase** — Is this populated when the create-sibling API creates the sibling order record? If not, `Validate Shipping for w4` will fail for all siblings.
3. **Vercel cron query** — Does the cron currently include `orderId` in the fields it selects from Supabase and sends to W1.1? If it only sends `amazon_order_id`, the Prep node fix cannot use `order.orderId`. The cron query must be audited alongside this workflow.

---

## Post-Implementation Review
**Reviewed:** 2026-02-20
**Reviewer:** Claude (QA pass)
**Result:** ✅ Correct — minor cosmetic fixes applied, no critical bugs found

### What the Implementing Agent Got Right

**All critical orderId fixes were applied correctly:**
- `Prep 2A Orders`: Uses `order.orderId || order.amazon_order_id`; passes `amazonOrderId` separately ✅
- `Prep 2B Orders`: Same fix ✅
- `Prep Workflow 3 Orders`: Same fix; uses `one_manifest_url` for manifest key construction ✅
- `Prep Workflow 4 Orders`: Same fix; both `manifest3Key` and `oneManifestKey` use per-book `orderId` ✅
- `Merge Prep Data with Supabase Response (3)`: Preserves `amazonOrderId` in merged output ✅
- `Route Orders by Workflow`: Added `workflow4Aggregate: []` routing case for future aggregation path ✅

**All NO CHANGE nodes left untouched** ✅

### ISSUE 1 — Logging Uses Root Group ID in Error Messages (Minor / Cosmetic)

**Nodes affected:** `Prep 2A Orders`, `Prep Workflow 3 Orders`

**Problem:** Both nodes derived `orderId` late in the loop body (after an early `if (!manifestUrl)` or fetch block), so error/warn `console.log` statements at the top of the loop still used `order.amazon_order_id`. For sibling orders, log lines would show the root group ID (`114-7080737-5512234`) instead of the per-book synthetic ID (`114-7080737-5512234-item-152767221930001`), making logs ambiguous when debugging sibling-specific issues.

No production behavior was affected — the actual `orderId` value in the output payload was correct. This was purely a diagnostic clarity issue.

**Fix Applied:** Moved `orderId` derivation to the very top of each loop body (before any conditional blocks):

```javascript
// BEFORE (Prep 2A / Prep W3):
for (const order of orders2A) {
  let characterSpecs = order.character_specs;  // orderId derived much later
  // ... log uses order.amazon_order_id ...
  const orderId = order.orderId || order.amazon_order_id; // late derivation

// AFTER:
for (const order of orders2A) {
  const orderId = order.orderId || order.amazon_order_id; // Per-book ID (synthetic for siblings)
  let characterSpecs = order.character_specs;
  // ... all logs now use orderId ...
  // orderId already derived at top of loop  <-- comment replaces redundant re-derivation
```

Also updated `skipped.push(order.amazon_order_id)` → `skipped.push(orderId)` in Prep W3 so the skip log shows the right ID.

### Architecture Note — workflow4Aggregate Stub (By Design)

The `Route Orders by Workflow` node correctly includes the `workflow4Aggregate` routing case (accepts `next_workflow === '4-aggregate'`), but there is no downstream node wired to consume it. This is intentional — the aggregation path (W4.1 / cron-side group detection) has not yet been implemented. The stub ensures orders tagged `4-aggregate` are silently bucketed rather than hitting the unknown-workflow `console.warn`, and the routing summary log will show the count.

The aggregation trigger node (and the cron-side `orderId` SELECT fix + group detection logic documented in the cron addendum) remain as future work to be implemented when the W4.1 workflow is built.

### Nodes Verified Correct (No Changes)

`Webhook Trigger`, `Extract Orders from Webhook`, `Mark as Processing (2A/2B/3/4)`, `Verify Order Claimed (2B/3/4)`, `Trigger 2A/2B/W3/W4 Workflow`, `Get Signed URL (1-manifest)-W4`, `Validate Shipping for w4`, `Flag Missing Shipping (Supabase)`, `Flag Missing Shipping (Backend)`, `Log Skipped W4 Order`

### Changes Summary

| Node | Change | Severity |
|------|--------|----------|
| `Prep 2A Orders` | Moved `orderId` derivation to top of loop; fixed all log statements to use `orderId` | Cosmetic |
| `Prep Workflow 3 Orders` | Same: moved `orderId` to top of loop; fixed logs including `skipped.push()` | Cosmetic |

### Deferred Items (Not in Scope for This Review)

The following are correctly identified in the audits but not implemented here — they require cron/backend changes outside this workflow file:
- Cron SELECT query: add `orderId` column
- Cron: sibling group detection + readiness check for W4 orders
- W4.1 aggregation trigger node (downstream of `workflow4Aggregate` routing case)
- W3 PDFMonkey concurrency sub-limit in cron router
