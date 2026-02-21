# W1.5 Audit — Health Monitor
**Sibling Order N+ Support Audit**
**Files:** `w1.5-Health_Monitor.json`, `back-end/src/app/api/cron/health-monitor/route.ts`
**Audited:** 2026-02-19
**Status:** Complete

---

## Workflow Overview

W1.5 is the system's error recovery and self-healing layer. A Vercel cron job (`GET /api/cron/health-monitor`) runs every 10 minutes, queries Supabase for three categories of unhealthy orders, and POSTs them to the W1.5 webhook. W1.5 then routes each order through the appropriate recovery path.

The three work types:
- **Stuck** — orders with `execution_status = 'processing'` and `started_at` older than 30 minutes
- **Retry** — orders with `execution_status = 'error'`, `next_retry_at <= now`, and `retry_count < 3`
- **Orphaned** — orders returned by the `get_orphaned_orders` Supabase RPC function

**Full flow:**
```
Vercel Health Monitor Cron (every 10 min)
  → POST {stuck, retries, orphaned} to Webhook Trigger
      → Extract Work Items
      → Route by Work Type (fans out to all three parallel)

STUCK PATH:
  → Filter: Stuck Orders Only → Stuck: Detect Stuck Orders
    → Stuck: Mark as Error → Stuck: Log to Failed Orders
      → Stuck: Decide Retry or Manual Review
        ├─ manual review → Stuck: Mark for Manual Review → Stuck: Alert: Manual Review → Merge
        └─ retry → Stuck: Schedule Retry → Stuck: Preserve Marker → Merge

RETRY PATH:
  → Filter: Retry Orders Only → Retry: Validate & Flatten
    → Retry: Reset Status for Retry → Retry: Prep for Router
      → Retry: Log Retry → Merge

ORPHANED PATH:
  → Filter: Orphaned Orders Only → Orphaned: Classify Orphans
    → Orphaned: Route by Action (fans out to 4 sub-paths)
        ├─ create_manifest → Orphaned: Recover: Create Manifest → Handle Failure
        │      ├─ success → Orphaned: Preserve Marker (Create Manifest Success) → Merge
        │      └─ failure → IF: Manual Review Only → Orphaned: Recover: Mark for Manual Review → Merge
        ├─ schedule_retry → Orphaned: Recover: Schedule Retry → Preserve Marker → Merge
        ├─ manual_review → Orphaned: Recover: Mark for Manual Review → Preserve Marker → Merge
        └─ reset_processing → Orphaned: Recover: Reset Processing → Preserve Marker → Merge

ALL PATHS → Merge: All Paths Results → Classify and Summarize Results → Alert: Health Monitor Summary
```

---

## Backend Cron — What It Sends

The Vercel cron (`health-monitor/route.ts`) sends three arrays to W1.5. Understanding the exact fields in each is critical for sibling analysis.

**Stuck orders SELECT:**
```typescript
.select('id, amazon_order_id, current_workflow, started_at, retry_count, error_message')
```
Fields available in W1.5 stuck path: `id`, `amazon_order_id`, `current_workflow`, `started_at`, `retry_count`, `error_message`. Notably: **no `orderId` column**.

**Retry orders SELECT:**
```typescript
.select('id, amazon_order_id, next_workflow, retry_count, error_message, error_type,
         character_specs, character_hash, one_manifest_url, next_retry_at')
```
Fields available in W1.5 retry path: `id`, `amazon_order_id`, `next_workflow`, `retry_count`, `error_message`, `error_type`, `character_specs`, `character_hash`, `one_manifest_url`, `next_retry_at`. Notably: **no `orderId` column**.

**Orphaned orders:** Returned by `supabase.rpc('get_orphaned_orders')`. This RPC function is defined in the live Supabase instance and is not in local schema files. Its SELECT list is unknown — audit of the live function is an open action item (see Open Questions).

---

## Node-by-Node Findings

---

### 1. Webhook Trigger
**Tag: `NO CHANGE`**

Standard webhook. Receives POST from Vercel cron. No order logic.

---

### 2. Extract Work Items
**Tag: `NO CHANGE`**

Unwraps `payload.stuck`, `payload.retries`, `payload.orphaned` from the cron body and validates they are arrays. Passes `{ stuck, retries, orphaned, counts, totalWork }` downstream. No order-level logic. Early-exits on zero total work. No sibling-specific changes needed.

---

### 3. Stuck: Config
**Tag: `NO CHANGE`**

Emits configuration constants (`stuckThresholdMinutes: 30`, `maxRetries: 3`, etc.). No order logic.

---

### 4. Route by Work Type
**Tag: `NO CHANGE`**

Tags each order with `_workType: 'stuck' | 'retry' | 'orphaned'` and fans them out as individual items. Purely structural. No sibling concerns.

---

### 5. Filter: Stuck Orders Only / Filter: Retry Orders Only / Filter: Orphaned Orders Only
**Tag: `NO CHANGE`**

Three IF nodes that filter the flat item stream to each parallel path. No order logic. No changes needed.

---

### 6. Stuck: Detect Stuck Orders
**Tag: `NO CHANGE`**

Double-checks that `started_at` genuinely exceeds the 30-minute threshold (guards against stale cron data). Uses `order.amazon_order_id` for logging only, not as a routing ID. No R2 path construction. No changes needed.

---

### 7. Stuck: Mark as Error
**Tag: `NO CHANGE`**

PATCHes Supabase by `$json.id` (auto-increment row ID). Sets `execution_status: 'error'`, `error_type: 'workflow_timeout'`. Correct for siblings — targets the specific row, not a group.

---

### 8. Stuck: Log to Failed Orders
**Tag: `NO CHANGE`**

INSERTs into `failed_orders` by `order_id: $json.id`. Per-row, correct for siblings.

---

### 9. Stuck: Decide Retry or Manual Review
**Tag: `NO CHANGE`**

Checks `retry_count` against `maxRetries`. Per-order logic. No sibling concerns.

---

### 10. Stuck: Check Action
**Tag: `NO CHANGE`**

IF node routing retry vs. manual review. No order logic.

---

### 11. Stuck: Schedule Retry
**Tag: `NO CHANGE`**

PATCHes Supabase by `$json.order_id` (which comes from `Stuck: Log to Failed Orders` response — that is `failed_orders.order_id`, which is `orders.id`). Sets `execution_status: 'error'`, schedules `next_retry_at`, clears `current_workflow` and `started_at`. Per-row, correct for siblings.

---

### 12. Stuck: Preserve Marker / Stuck: Mark for Manual Review / Stuck: Alert: Manual Review
**Tag: `NO CHANGE`**

Preservation, Supabase status update, and logging nodes. All per-row. No changes needed.

---

### 13. Retry: Validate & Flatten
**Tag: `NO CHANGE`**

Validates retry orders against basic criteria (`amazon_order_id`, `id`, `retry_count < 3`). Uses `amazon_order_id` for logging only. No R2 paths. No changes needed.

---

### 14. Retry: Reset Status for Retry
**Tag: `NO CHANGE`**

PATCHes Supabase by `$json.id` (auto-increment row ID). Resets `execution_status: 'ready_for_processing'`, clears error fields and `current_workflow`/`started_at`. Per-row. Correct for siblings.

---

### 15. Retry: Prep for Router
**Tag: `UPDATE` ⚠️ — Same collision bug as W1.1 Prep nodes**

This is the most significant change needed in W1.5. The node builds the output payload that gets passed to the Merge node and eventually back toward the cron router:

```javascript
return [{
  json: {
    orderId: order.amazon_order_id,   // ← COLLISION BUG
    characterHash: order.character_hash || null,
    characterSpecs: order.character_specs,
    orderDbId: order.id,
    workflow: order.next_workflow || '2A',
    isRetry: true,
    retryCount: order.retry_count,
    _workType: order._workType || 'retry'
  }
}];
```

The same root issue from W1.1: `orderId: order.amazon_order_id` will collapse two siblings to the same identity. For a sibling retry, this would route both to the same R2 path.

However — there is a compounding problem unique to W1.5: **the retry cron SELECT does not include `orderId`** (only `id` and `amazon_order_id`). So even if this line were changed to `order.orderId || order.amazon_order_id`, `order.orderId` would always be `undefined`.

The fix requires two steps:
1. **Cron fix (health-monitor/route.ts):** Add `orderId` to the retry SELECT
2. **Node fix:** Update the Prep node to use `order.orderId || order.amazon_order_id`

```typescript
// health-monitor/route.ts — retry SELECT fix:
.select('id, orderId, amazon_order_id, next_workflow, retry_count, ...')
```

```javascript
// Retry: Prep for Router — node fix:
orderId: order.orderId || order.amazon_order_id,
amazonOrderId: order.amazon_order_id,
```

**Note:** The output of `Retry: Prep for Router` currently feeds into `Retry: Log Retry` → `Merge: All Paths Results`. Looking at the Merge and subsequent nodes, they only log/classify — they don't re-trigger W1.1 directly. The retry path actually works by having reset `execution_status = 'ready_for_processing'` on the order, allowing the next regular cron cycle to pick it up naturally. So the `orderId` collision in this node would only matter if something downstream uses `orderId` to construct R2 paths. Currently it appears to only be used for logging. **However**, it sets a bad precedent and should be fixed for correctness and future-proofing.

---

### 16. Retry: Log Retry
**Tag: `NO CHANGE`**

Logging only. Uses `order.orderId` for console output. No R2 paths. No changes needed (though after the Prep fix, logging will correctly show the per-book ID).

---

### 17. Orphaned: Classify Orphans
**Tag: `UPDATE` ⚠️ — Critical: sibling-waiting orders will be misclassified here**

This is the most architecturally significant concern in W1.5 for sibling support. The node assigns an `action` to each orphaned order based on its `orphan_reason`. The classification that will be hit by sibling-waiting orders is:

```javascript
case 'ready_not_picked_up':
  if (order.next_workflow === '4' && !order.one_manifest_url) {
    action = 'require_manual_review';  // W4 + missing manifest
  } else {
    action = 'reset_processing';       // ← THIS IS THE PROBLEM
  }
  break;
```

**The scenario:**
- Sibling A and B are both in `next_workflow = '4'`, `execution_status = 'ready_for_processing'`
- The cron holds them because the group isn't fully ready (only one of them is ready — the other is still in W3)
- Or: both are ready but the cron is holding them pending aggregation implementation
- The health monitor's `get_orphaned_orders` RPC detects them as `ready_not_picked_up` (sitting in `ready_for_processing` without being routed for too long)
- `Orphaned: Classify Orphans` assigns `action = 'reset_processing'`
- `Orphaned: Recover: Reset Processing` PATCHes `execution_status: 'ready_for_processing'`, `retry_count: 0`, clears `current_workflow` / `started_at`

This is a **no-op for primary orders** (resetting an order that's already `ready_for_processing` doesn't change much), but for a deliberately held sibling it's pointless churn — and could interfere with any status flag we add to mark "waiting for sibling." More importantly, if we implement a `sibling_waiting` execution status to distinguish held siblings from truly ready orders, a `reset_processing` action that overwrites it with `ready_for_processing` would break the holding pattern.

**Required fix:** The classifier needs a `sibling_waiting` case:

```javascript
// In Orphaned: Classify Orphans, before the ready_not_picked_up case:
case 'ready_not_picked_up':
  // NEW: Check if this is a sibling held pending group aggregation
  if (order.sibling_group_id && order.next_workflow === '4') {
    // This order is part of a sibling group; it may be intentionally held.
    // Don't reset — let the cron's group detection handle it.
    action = 'no_action';
    priority = 'low';
  } else if (order.next_workflow === '4' && !order.one_manifest_url) {
    action = 'require_manual_review';
  } else {
    action = 'reset_processing';
  }
  break;
```

This requires:
1. The orphaned RPC result to include `sibling_group_id` (or we check `amazon_order_id` against a known pattern)
2. A `no_action` route to be added to `Orphaned: Route by Action`

---

### 18. Orphaned: Route by Action
**Tag: `UPDATE` — Minor (add `no_action` path)**

Currently routes to `create_manifest`, `schedule_retry`, `manual_review`, and `reset_processing`. After the classifier fix, needs a `no_action` path that simply passes the item to Merge with a `_workType: 'orphaned'` marker and no Supabase write.

```javascript
// Add to Orphaned: Route by Action:
} else if (order.action === 'no_action') {
  noAction.push(order);
}
// ...
...noAction.map(o => ({ json: { ...o, _route: 'no_action' } }))
```

A new `IF: No Action Only` → `Orphaned: Preserve Marker (No Action)` → Merge chain is needed (mirrors the pattern of the other sub-paths).

---

### 19. IF: Create Manifest Only / Orphaned: Recover: Create Manifest / Handle Create Manifest Failure
**Tag: `NO CHANGE`**

Manifest recovery path. Uses `order.amazon_order_id` in the URL only for primary-order manifest creation. For siblings, the correct manifest creation endpoint would need to target the per-book `orderId`. However, this path is only reached when `one_manifest_url` is missing — for properly implemented sibling orders, W0 creates the manifest before any routing occurs. In practice this path should not be triggered for siblings. No immediate change needed, but worth flagging.

---

### 20. IF: Schedule Retry Only / Orphaned: Recover: Schedule Retry / Orphaned: Preserve Marker (Schedule Retry)
**Tag: `NO CHANGE`**

PATCHes by `$json.id` (auto-increment). Per-row. Correct for siblings.

---

### 21. IF: Manual Review Only / Orphaned: Recover: Mark for Manual Review / Orphaned: Preserve Marker (Manual Review)
**Tag: `NO CHANGE`**

PATCHes by `$json.id`. Per-row. Correct for siblings.

---

### 22. IF: Reset Processing Only / Orphaned: Recover: Reset Processing / Orphaned: Preserve Marker (Reset Processing)
**Tag: `VERIFY`**

PATCHes `execution_status: 'ready_for_processing'`, clears `retry_count`, `current_workflow`, `started_at`. Per-row by `$json.id`. Functionally correct for primary orders. For siblings in a holding state, this is a no-op today — but will become a bug if `sibling_waiting` status is implemented. Should be confirmed safe once the sibling holding strategy is decided.

---

### 23. Merge: All Paths Results
**Tag: `NO CHANGE`**

Collects outputs from all parallel paths. No order logic beyond deduplication and array flattening.

---

### 24. Classify and Summarize Results
**Tag: `NO CHANGE`**

Classifies items by `_workType` marker for summary reporting. No order logic affecting routing or state.

---

### 25. Alert: Health Monitor Summary
**Tag: `NO CHANGE`**

Logging and summary output. TODO in the code for Slack/email alerting — no changes needed for sibling support.

---

## Backend Cron (health-monitor/route.ts) — Required Changes

### Stuck query
**Tag: `UPDATE`**

Add `orderId` to the SELECT so W1.5 has the per-book identifier available:
```typescript
.select('id, orderId, amazon_order_id, current_workflow, started_at, retry_count, error_message')
```

### Retry query
**Tag: `UPDATE` ⚠️**

Add `orderId` to the SELECT — required for the `Retry: Prep for Router` fix to work:
```typescript
.select('id, orderId, amazon_order_id, next_workflow, retry_count, error_message, error_type, character_specs, character_hash, one_manifest_url, next_retry_at')
```

### Orphaned query (`get_orphaned_orders` RPC)
**Tag: `DECISION POINT` — Requires live DB audit**

The `get_orphaned_orders` RPC is defined in the live Supabase instance only (not in local schema files). Its SELECT list, filter conditions, and `orphan_reason` values are unknown from local code alone.

Critical questions about this function:
1. Does it include `orderId` in its result set?
2. Does it include `sibling_group_id` or `amazon_order_id` for group identification?
3. What are all possible `orphan_reason` values? Specifically: does it have a time threshold for `ready_not_picked_up`? If an order has been `ready_for_processing` for over N minutes, it is classified as orphaned. For sibling-waiting orders this is the wrong diagnosis.
4. What filter excludes already-stuck orders (the cron code filters by `stuckOrderIds` Set, but the RPC may have its own conditions)?

**Action required:** Run `\df get_orphaned_orders` or `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'get_orphaned_orders';` in the Supabase SQL editor and add the function definition to this audit before implementation begins.

---

## Summary of Required Changes

### W1.5 Workflow nodes

| Node | Tag | Change Required |
|------|-----|-----------------|
| Webhook Trigger | `NO CHANGE` | — |
| Extract Work Items | `NO CHANGE` | — |
| Stuck: Config | `NO CHANGE` | — |
| Route by Work Type | `NO CHANGE` | — |
| Filter: Stuck/Retry/Orphaned | `NO CHANGE` | — |
| Stuck path (all nodes) | `NO CHANGE` | All PATCH by `id` (auto-increment), per-row, correct |
| Retry: Validate & Flatten | `NO CHANGE` | — |
| Retry: Reset Status for Retry | `NO CHANGE` | PATCHes by `id`, per-row, correct |
| **Retry: Prep for Router** | **`UPDATE` ⚠️** | Use `order.orderId \|\| order.amazon_order_id`; add `amazonOrderId` field |
| Retry: Log Retry | `NO CHANGE` | — |
| **Orphaned: Classify Orphans** | **`UPDATE` ⚠️`** | Add `sibling_waiting` / `no_action` check before `ready_not_picked_up` → `reset_processing` path |
| **Orphaned: Route by Action** | **`UPDATE` — Minor** | Add `no_action` route; add new IF → Preserve Marker → Merge chain |
| Orphaned: Create Manifest path | `NO CHANGE` | Should not be triggered for siblings in normal flow |
| Orphaned: Schedule Retry / Manual Review / Reset Processing | `VERIFY` | Safe for now; re-verify once `sibling_waiting` status is defined |
| Merge / Classify / Alert | `NO CHANGE` | — |

### Backend cron (health-monitor/route.ts)

| Component | Tag | Change Required |
|-----------|-----|-----------------|
| Stuck orders SELECT | `UPDATE` | Add `orderId` column |
| Retry orders SELECT | `UPDATE` ⚠️ | Add `orderId` column (required for Prep node fix) |
| `get_orphaned_orders` RPC | `DECISION POINT` | Audit live function; add `sibling_group_id` or equivalent to results; possibly add exclusion for `sibling_waiting` status |

---

## The Orphaned Trap — Core Concern

The most important sibling concern in W1.5 is the interaction between the sibling holding strategy and the `ready_not_picked_up` orphan classification.

Once the cron router holds incomplete sibling groups (siblings waiting for their group partners), those orders will sit in `ready_for_processing` indefinitely — by design. The health monitor will eventually classify them as `ready_not_picked_up` orphans and try to reset or escalate them. This will interfere with the holding strategy unless the `get_orphaned_orders` RPC and the classifier are updated to recognize intentionally held siblings.

The cleanest solution is a dedicated `execution_status = 'sibling_waiting'` value. This provides:
- A clear, unambiguous signal to all queries that this order is intentionally paused
- The health monitor can simply exclude `sibling_waiting` orders from the orphaned query (one line in the RPC)
- The admin panel can display a meaningful "waiting for sibling" state
- The cron router's group detection can target `sibling_waiting` orders specifically when checking group readiness

This decision should be made before implementing any other sibling changes, as it affects the Supabase schema, the cron router, the health monitor RPC, and W1.5.

---

## Open Questions

1. **`get_orphaned_orders` RPC definition** — Must be retrieved from the live Supabase instance before implementation begins. Need: full SELECT list, filter conditions, all `orphan_reason` values, and time thresholds for `ready_not_picked_up`. Run in Supabase SQL editor: `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'get_orphaned_orders';`

2. **`sibling_waiting` status decision** — Should a new `execution_status` value be introduced for orders held pending sibling group completion? If yes, this is a schema change that unlocks clean exclusions across the cron router, health monitor, and admin panel. Recommend: **yes**.

3. **Retry path and sibling identity** — When a sibling retries (e.g. W2A failed for book 2), the retry path resets it to `ready_for_processing`. The cron router then needs to detect it as part of a sibling group again and re-check group readiness before routing to W4. This is handled automatically if the group detection runs on every routing cycle — but confirm this is the case.

4. **Stuck sibling during aggregation** — If sibling A gets stuck in W4 while sibling B has already completed, what is the correct recovery action? Resetting A to `ready_for_processing` and re-aggregating is conceptually correct but could create a duplicate Lulu job if B's print job was submitted. This edge case needs a defined handling strategy before implementation.
