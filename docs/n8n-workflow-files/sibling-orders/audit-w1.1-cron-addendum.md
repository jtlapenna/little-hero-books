# Cron Router Audit — Addendum to W1.1
**Sibling Order N+ Support Audit**
**File:** `back-end/src/app/api/cron/router/route.ts`
**Supporting file:** `back-end/src/lib/determine-next-workflow.ts`
**Audited:** 2026-02-19
**Status:** Complete

---

## Overview

The Vercel cron router (`GET /api/cron/router`) is the upstream data source for W1.1. It runs on a schedule, queries Supabase for ready orders, and POSTs them to the W1.1 webhook. This addendum documents what the cron sends, what it does not send, and what changes are required for sibling support. It resolves **Open Question #3** from the W1.1 audit.

---

## The Supabase SELECT Query — What Fields Are Sent to W1.1

The cron fetches ready orders with this query (Step 4 in the code):

```typescript
const { data: orders } = await supabase
  .from('orders')
  .select(
    'id, amazon_order_id, character_hash, next_workflow, dedication_text, ' +
    'one_manifest_url, character_specs, execution_status, priority, queued_at, ' +
    'updated_at, shipping_address, lulu_status, lulu_job_id, ' +
    'customer_approval_required, customer_approval_status, amazon_shipment_service_level'
  )
  .eq('execution_status', 'ready_for_processing')
  // ...
```

**Fields selected:**

| Field | Notes |
|-------|-------|
| `id` | Supabase auto-increment row ID (used as `orderDbId` in W1.1) |
| `amazon_order_id` | Root group ID for Amazon orders; used as `orderId` in all W1.1 Prep nodes |
| `character_hash` | Passed through to downstream workflows |
| `next_workflow` | Used by `Route Orders by Workflow` in W1.1 |
| `dedication_text` | Passed through to W3 |
| `one_manifest_url` | Manifest key; used for manifest path construction |
| `character_specs` | Used by `Prep 2A Orders` to fetch manifest if missing |
| `execution_status` | Filter field |
| `priority` | Sort field |
| `queued_at` | Sort field |
| `updated_at` | Sort field |
| `shipping_address` | Used by `Validate Shipping for w4` |
| `lulu_status` | Used by eligibility filter |
| `lulu_job_id` | Used by eligibility filter |
| `customer_approval_required` | Used by eligibility filter |
| `customer_approval_status` | Used by eligibility filter |
| `amazon_shipment_service_level` | Passed through to W4 for Lulu shipping tier |

**Critical field NOT selected: `orderId`**

The Supabase `orders` table has an `orderId` column (set by W0 — the unique per-book identifier, e.g. `114-7080737-5512234-item-152767221930001` for a sibling). **This column is not in the SELECT query.** The cron only sends `id` (auto-increment) and `amazon_order_id` (root group ID).

This directly confirms what was flagged in the W1.1 audit: the fix `order.orderId || order.amazon_order_id` in the Prep nodes **will not work as written** because `order.orderId` will always be `undefined` in the payload received from the cron. The fallback always resolves to `amazon_order_id`, preserving the collision bug.

---

## Required Change — Cron SELECT Query

**Tag: `UPDATE` ⚠️ — Critical**

Add `orderId` to the SELECT:

```typescript
.select(
  'id, orderId, amazon_order_id, character_hash, next_workflow, ...'
)
```

Once added, the W1.1 Prep node fix (`order.orderId || order.amazon_order_id`) will correctly resolve to the per-book synthetic ID for siblings and to the primary order ID for non-sibling orders (where `orderId === amazon_order_id`).

---

## Sibling Group Detection — Completely Absent

**Tag: `DECISION POINT`**

The cron has no concept of sibling groups. When multiple siblings from the same Amazon order are all ready for W4, the cron treats them as independent orders and sends each one as a separate item in the `orders` array. W1.1 then routes them independently to the single-order W4 path, creating separate Lulu jobs and separate shipments.

Additionally, the **capacity limit of 5 concurrent slots** could split a sibling group across cron cycles:
- Cycle 1: 1 slot available → only 1 of 2 siblings sent to W4 → Lulu job created for book 1 alone
- Cycle 2: book 2 sent to W4 → second Lulu job created → two shipments to same address

There are two places where group detection could be added:

**Option A — Add group detection to the cron (Recommended)**

After the `eligibleOrders` filter, before calling the n8n webhook, add a grouping step:

```typescript
// Pseudo-code for sibling group detection:
const ordersForW4 = ordersToRoute.filter(o => o.next_workflow === '4');
const otherOrders = ordersToRoute.filter(o => o.next_workflow !== '4');

// Group W4 orders by amazon_order_id (root group ID)
const w4Groups = groupBy(ordersForW4, o => o.amazon_order_id);

// For each group: check if ALL siblings in Supabase are ready for W4
// (not just the ones in this batch — there may be more siblings not in the current batch)
for (const [groupId, groupOrders] of Object.entries(w4Groups)) {
  const { data: allSiblings } = await supabase
    .from('orders')
    .select('id, orderId, next_workflow, execution_status')
    .eq('amazon_order_id', groupId);

  const allReady = allSiblings.every(s => 
    s.next_workflow === '4' && s.execution_status === 'ready_for_processing'
  );

  if (allReady && allSiblings.length > 1) {
    // Tag this group for aggregation in the payload
    groupOrders.forEach(o => o._siblingGroup = allSiblings.map(s => s.orderId));
  } else if (!allReady) {
    // Remove from this batch — not ready to aggregate yet
    // These orders stay in ready_for_processing; will be retried next cycle
  }
}
```

This approach:
- Keeps W1.1 dumb about sibling logic
- Sends a pre-resolved `_siblingGroup` array in the payload for W1.1 to act on
- Requires one extra Supabase query per W4 order with siblings (cheap)

**Option B — Detect in W1.1 Route Orders node**

W1.1 would make async Supabase calls during routing. Possible but makes W1.1 heavier and adds latency to every routing cycle, not just when siblings exist.

**Recommendation: Option A.** The cron already has the Supabase client and is the right place for data-layer decisions. W1.1 stays as a pure router.

---

## Eligibility Filter — Correct for Siblings

**Tag: `NO CHANGE`**

The W4 eligibility filter:
```typescript
if (o.lulu_job_id || o.lulu_status) return false;
```

This is per-row, which is correct. A sibling that has not yet been submitted to Lulu (`lulu_job_id = null`) passes the filter even if another sibling in the group has been submitted. This is the desired behavior — though with the aggregation fix in place, no sibling should reach W4 independently anyway.

---

## `determineNextWorkflow` — Unaware of Siblings

**Tag: `VERIFY`**

This function (`back-end/src/lib/determine-next-workflow.ts`) determines what `next_workflow` to set during the W0 cleanup step in the cron. It is entirely per-order logic — it evaluates a single order's manifests and approval status without any knowledge of sibling relationships.

**Current behavior:** When a sibling order completes W3 and gets customer approval, `determineNextWorkflow` will set its `next_workflow = '4'`. This is correct *per-book*. The problem is that setting W4 individually triggers the routing issue described above.

**No change needed to this function** — it should remain per-order logic. The sibling group check happens at the cron routing layer (before calling W1.1), not at the `next_workflow` assignment layer. A sibling order correctly having `next_workflow = '4'` is fine as long as the cron holds it until the full group is ready.

---

## Cron Summary of Required Changes

| Component | Tag | Change Required |
|-----------|-----|-----------------|
| Supabase SELECT query | `UPDATE` ⚠️ | Add `orderId` column to SELECT |
| Sibling group detection | `DECISION POINT` + `UPDATE` | Add group readiness check before W4 orders are sent to W1.1; tag complete groups for aggregation path |
| W4 eligibility filter | `NO CHANGE` | Per-row logic correct for siblings |
| `determineNextWorkflow` | `NO CHANGE` | Per-order logic; sibling awareness not needed here |
| Capacity limit interaction | `VERIFY` | Confirm that holding incomplete sibling groups does not starve the capacity slots indefinitely |

---

## Resolved Open Questions (from W1.1 audit)

**Open Question #3 — Does the cron send `orderId` to W1.1?**

**Resolved: No.** The cron SELECT does not include the `orderId` column. The W1.1 Prep node fix requires the cron to be updated first to add `orderId` to the SELECT query. Without this change, `order.orderId` in all Prep nodes will be `undefined` and the collision bug persists.

---

## New Open Questions

1. **Does the Supabase `orders` table have `orderId` as a queryable column?** W0 sets it in the upsert body (`body.orderId = primaryOrderId`), but confirm the column exists in the actual schema (check `database/` directory or Supabase dashboard). If the column is named differently (e.g. `order_id` in snake_case), the SELECT and the Prep node fix must use the correct name.

2. **Holding incomplete sibling groups** — When a sibling group has 2 of 3 books ready for W4 and 1 still in W3, the 2 ready books will remain in `ready_for_processing` with `next_workflow = '4'` every cron cycle. The cron will detect them, check group readiness, find it incomplete, and skip them. This is correct behavior but could tie up display state (they'll appear "ready" but not moving). Consider setting a `sibling_waiting` status or flag so the admin panel can show "waiting for sibling" rather than "ready."

3. **Aggregate path trigger mechanism** — Once the cron detects a complete sibling group and tags the orders for aggregation, what does the W1.1 payload look like? Options: (a) a single item with an array of order objects in a `siblingOrders` field, or (b) all sibling orders as individual items each tagged with `_routeTo: '4-aggregate'`. Decide before implementing.
