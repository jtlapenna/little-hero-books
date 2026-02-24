# n8n Workflow Hardening — Identity Contract Implementation

## Purpose

Strengthen all n8n workflow JSON files so that the **identity contract** is enforced consistently:

| Field | Semantics | When to use |
|---|---|---|
| `orderId` | Per-book synthetic ID (e.g. `114-...-item-152...` or `d2c_abc123-book-1`) | R2 paths, Supabase row updates, manifest keys, per-book status changes |
| `root_order_id` | Canonical group key (Amazon root ID _or_ D2C root UUID) | Sibling aggregation, group queries, parent references |
| `amazon_order_id` | Legacy mirror of `root_order_id` for Amazon orders; `null` for D2C | Backward compatibility only; never use as the sole group key |

**Golden rule:** A group ID must never be used where a per-book ID is needed, and vice versa.

---

## Scope — All 13 Workflow JSON Files

```
docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/
├── w0-Order_Intake_Validation.json
├── w1.1-Queue_Manager_and_Router.json
├── w1.5-Health_Monitor.json
├── w2A-Orchestrator.json
├── w2A-SW0-Base_Character_Generation.json
├── w2A-SW1-Pose_Generation.json
├── w2A-SW2-Pose_and_Style_QA.json
├── w2A-SW3-Upload.json
├── w2B-main-orchestrator.json
├── w2B-sw1-single-pose.json
├── w3-Book-Assembly.json
├── w4-PRODUCTION-Print_Fulfillment.json
└── w4.1-Sibling-Aggregation.json
```

After changes, **every modified file must be re-uploaded to n8n**.

---

## Prerequisites

- The `root_order_id` column exists in the `orders` table (migration `database/migration-add-root-order-id.sql` already applied).
- The unique constraint on `amazon_order_id` has been dropped (migration `database/migration-sibling-orders-amazon-root-group.sql` already applied).
- Backend API routes already write `root_order_id` on insert/update.

---

## Finding Index

| # | Severity | Workflow | Node | Issue |
|---|----------|----------|------|-------|
| F1 | **CRITICAL** | W0 | Supabase Upsert (orders)2 | `root_order_id` never written to DB |
| F2 | **CRITICAL** | W4.1 | Config + Validate Sibling Group | Reference to undefined `manifest` variable |
| F3 | **HIGH** | W1.1 | Prep Workflow 3/2B/2A Orders, Route Orders | `orderId` falls back to group IDs |
| F4 | **HIGH** | W1.1 | Prep 2B Orders | Duplicate `rootOrderId` assignment |
| F5 | **HIGH** | W4 | Hydrate Order Details | Per-book `orderId` falls back to group IDs for R2 path construction |
| F6 | **MEDIUM** | W1.5 | Orphaned: Recover: Create Manifest | URL prefers group ID over per-book ID |
| F7 | **MEDIUM** | W4 | 5× Supabase GET queries | OR filter uses same value for per-book and group conditions |
| F8 | **LOW** | W2A-SW1 | Intake Telemetry Tap / Pre-Upload Tap | Telemetry logs group ID instead of per-book ID |

---

## Implementation Details

### F1 — W0: Write `root_order_id` in Supabase Upsert (CRITICAL)

**File:** `w0-Order_Intake_Validation.json`
**Node:** `Supabase Upsert (orders)2` (id: `9e7a7995-177e-4fb1-8320-dec3c5266c44`)

**Problem:** The upsert body sets `amazon_order_id` but never sets `root_order_id`. All downstream queries and workflows that look up orders by `root_order_id` will find nothing for orders ingested through W0.

**Current code** (inside `jsCode` at line 134):
```javascript
// Near the end of the body construction, around the amazon_order_id block:
if (manifest.siblingGroupId || manifest.amazonOrderId) {
  body.amazon_order_id = manifest.siblingGroupId || manifest.amazonOrderId;
}
```

**Required change — add `root_order_id` immediately after the `amazon_order_id` line:**
```javascript
if (manifest.siblingGroupId || manifest.amazonOrderId) {
  body.amazon_order_id = manifest.siblingGroupId || manifest.amazonOrderId;
  body.root_order_id = manifest.siblingGroupId || manifest.rootOrderId || manifest.amazonOrderId;
}
```

**Also add a fallback for D2C orders** (which have no `amazonOrderId` or `siblingGroupId`):
```javascript
if (!body.root_order_id) {
  body.root_order_id = body.orderId;
}
```

This ensures every order row has a `root_order_id`, even single-book D2C orders where the root equals the per-book ID.

**Validation:** After applying, upsert a test order via W0 and verify the `root_order_id` column is populated in Supabase.

---

### F2 — W4.1: Fix Undefined `manifest` Variable (CRITICAL)

**File:** `w4.1-Sibling-Aggregation.json`
**Node:** `Config + Validate Sibling Group` (id: `w41-validate-004`)

**Problem:** Inside the `for` loop that validates each sibling, this line references `manifest` which is never defined in scope:

```javascript
const rootOrderId=root.rootOrderId||root.root_order_id||root.amazonOrderId||manifest.rootOrderId||manifest.amazonOrderId||root.product_info?._root_order_id||null;
```

At runtime, `manifest` is `undefined`, so `manifest.rootOrderId` throws a `TypeError` and the entire W4.1 workflow crashes.

**Required change — replace the line inside the `for` loop:**

```javascript
const rootOrderId = root.rootOrderId || root.root_order_id || root.amazonOrderId || body.rootOrderId || body.root_order_id || root.product_info?._root_order_id || null;
```

The correction replaces `manifest.rootOrderId || manifest.amazonOrderId` with `body.rootOrderId || body.root_order_id` since `body` is the parsed input payload that is already in scope.

**Validation:** Send a test payload to W4.1 with 2+ siblings and confirm the node completes without TypeError.

---

### F3 — W1.1: Guard Per-Book ID Extraction (HIGH)

**File:** `w1.1-Queue_Manager_and_Router.json`
**Nodes affected:**
- `Prep Workflow 3 Orders` (line 322)
- `Prep 2B Orders` (line 332)
- `Prep 2A Orders` (line 342)
- `Route Orders by Workflow` (line 352)

**Problem:** Each of these nodes computes `orderId` with a fallback chain that includes group IDs:

```javascript
const orderId = order.orderId || order.order_id || order.root_order_id || order.amazon_order_id;
```

If `order.orderId` and `order.order_id` are both missing/empty, this silently promotes a group ID to per-book use. Downstream, this group ID becomes the R2 path, the Supabase update target, etc. — which either targets the wrong row or overwrites sibling assets.

**Required change — for each of the four nodes, replace the `orderId` assignment:**

```javascript
const orderId = order.orderId || order.order_id;
if (!orderId) {
  console.error(`[Router] Order DB id=${order.id} has no per-book orderId; skipping to prevent group-ID collision`);
  skipped.push({ ...order, _skipReason: 'missing_per_book_orderId' });
  continue; // (inside a for-loop) or filter it out (inside a .map)
}
```

For the `Route Orders by Workflow` node (which uses a `for...of` loop and only logs), change the logging line to:

```javascript
console.log(`Order ${order.orderId || order.order_id || '(no per-book ID)'}: Route to ${nextWorkflow}`);
```

**Note on `Prep 2B Orders`:** This node uses `.map()` instead of a `for` loop. Use `.filter().map()`:

```javascript
return orders2B
  .filter(order => {
    if (!order.orderId && !order.order_id) {
      console.error(`[Prep 2B] Order DB id=${order.id} missing per-book orderId; skipping`);
      return false;
    }
    return true;
  })
  .map(order => ({
    json: {
      orderId: order.orderId || order.order_id,
      // ... rest unchanged
    }
  }));
```

**Validation:** Route a test batch containing an order with a missing `orderId` field and confirm it is skipped with a logged warning rather than silently promoted.

---

### F4 — W1.1: Remove Duplicate `rootOrderId` (HIGH)

**File:** `w1.1-Queue_Manager_and_Router.json`
**Node:** `Prep 2B Orders` (line 332)

**Problem:** The output object literal contains `rootOrderId` assigned twice:

```javascript
{
  orderId: order.orderId || order.order_id || order.root_order_id || order.amazon_order_id,
  rootOrderId: order.root_order_id || order.amazon_order_id || order.amazonOrderId || order.orderId || order.order_id,
    rootOrderId: order.root_order_id || order.amazon_order_id || order.amazonOrderId || order.orderId || order.order_id,
  amazonOrderId: order.amazon_order_id,
  // ...
}
```

The second assignment silently overwrites the first (same value, so no bug today, but a maintenance hazard).

**Required change:** Delete the duplicate line (the indented second `rootOrderId:`).

---

### F5 — W4: Fix Hydrate Order Details Fallback Chain (HIGH)

**File:** `w4-PRODUCTION-Print_Fulfillment.json`
**Node:** `Hydrate Order Details (Supabase → 1-manifest → 3A)` (id: `50d51544-da5a-40c0-8ca7-c60f3c266fe1`)

**Problem:** The `orderId` extraction:

```javascript
const orderId = j.orderId || j.amazonOrderId || j.AmazonOrderId || j.amazon_order_id;
```

Falls back to group IDs. This `orderId` is later used to:
1. Construct the R2 manifest path: `book-mvp-simple-adventure/orders/${orderId}/manifests/1-manifest.json`
2. Query Supabase: `or=(amazon_order_id.eq.${orderId},orderId.eq.${orderId})`

If a group ID is used for #1, the manifest fetch will fail (wrong path). If used for #2, it may return the wrong sibling row.

**Required change:**

```javascript
const perBookId = j.orderId;
const groupId = j.amazonOrderId || j.AmazonOrderId || j.amazon_order_id || j.root_order_id;
const orderId = perBookId || groupId;
if (!perBookId) {
  console.warn(`[Hydrate] No per-book orderId; using group ID "${orderId}" — manifest path may be incorrect`);
}
```

Then update the Supabase query to prioritize per-book lookup:

```javascript
// Current:
const url = `${base}/rest/v1/orders?limit=1&or=(amazon_order_id.eq.${encodeURIComponent(orderId)},orderId.eq.${encodeURIComponent(orderId)})`;

// Change to:
const url = `${base}/rest/v1/orders?limit=1&or=(orderId.eq.${encodeURIComponent(orderId)},root_order_id.eq.${encodeURIComponent(orderId)},amazon_order_id.eq.${encodeURIComponent(orderId)})`;
```

And update the manifest path to use per-book ID only:

```javascript
const manifestKey = `book-mvp-simple-adventure/orders/${perBookId || orderId}/manifests/1-manifest.json`;
```

**Validation:** Trigger W4 for a sibling order and confirm it fetches the correct per-book manifest (not the parent's).

---

### F6 — W1.5: Fix Orphaned Recovery URL (MEDIUM)

**File:** `w1.5-Health_Monitor.json`
**Node:** `Orphaned: Recover: Create Manifest` (id: `515d61c3-b93c-4fb9-88b1-bea5123dad74`)

**Problem:** The HTTP request URL is:

```
https://admin.littleherolabs.com/api/admin/orders/{{ $json.root_order_id || $json.amazon_order_id || $json.orderId || $json.order_id }}/create-manifest
```

This prefers group IDs. The backend `create-manifest` endpoint uses `fetchOrderRowByAnyId`, which handles group IDs by picking a primary — but passing a group ID is ambiguous and may select the wrong sibling.

**Required change — reorder to prefer per-book ID:**

```
https://admin.littleherolabs.com/api/admin/orders/{{ $json.orderId || $json.order_id || $json.root_order_id || $json.amazon_order_id }}/create-manifest
```

**Validation:** Trigger orphaned recovery for a sibling order and confirm the correct per-book manifest is created.

---

### F7 — W4: Improve OR Query Semantics (MEDIUM)

**File:** `w4-PRODUCTION-Print_Fulfillment.json`
**5 HTTP Request nodes** at lines 50, 100, 137, 334, 664.

**Problem:** All five Supabase GET queries use:

```
or=(orderId.eq.{{$json.orderId}},root_order_id.eq.{{$json.orderId}},amazon_order_id.eq.{{$json.orderId}},amazonOrderId.eq.{{$json.orderId}})
```

This uses the same `$json.orderId` value (which should be per-book) across group-key conditions. It works because the per-book value won't match a group-key column (unless it's a single-book order where they're identical). However, it's semantically imprecise and adds unnecessary query load.

**Required change — use the correct variable for each condition:**

For nodes that have access to both `$json.orderId` (per-book) and a group ID (e.g. `$json.rootOrderId` or `$json.amazonOrderId`), split the OR:

```
or=(orderId.eq.{{$json.orderId}},root_order_id.eq.{{$json.rootOrderId || $json.root_order_id || $json.amazonOrderId || $json.orderId}},amazon_order_id.eq.{{$json.rootOrderId || $json.root_order_id || $json.amazonOrderId || $json.orderId}})
```

Remove the `amazonOrderId.eq.` condition — it is not a real Supabase column (the column is `amazon_order_id` with underscores). Keeping it is harmless (Supabase ignores unknown columns in OR) but adds confusion.

**If this is too complex to safely template inline**, the alternative is to leave the current pattern as-is — it is functionally correct because `$json.orderId` is always a per-book ID by the time it reaches W4.

**Recommendation:** Fix only the `amazonOrderId.eq.` removal (dead condition) and leave the rest. This is the lowest-risk change.

---

### F8 — W2A-SW1: Fix Telemetry ID Preference (LOW)

**File:** `w2A-SW1-Pose_Generation.json`
**Nodes:**
- `Intake Telemetry Tap` (line 20): `orderId: j.amazonOrderId || j.orderId`
- `Pre-Upload Telemetry Tap` (line 222): `orderId: j.amazonOrderId`

**Problem:** Telemetry logs prefer `amazonOrderId` (group) over `orderId` (per-book). This makes it harder to correlate logs with specific sibling rows during debugging.

**Required change:**

Intake Telemetry Tap:
```javascript
orderId: j.orderId || j.amazonOrderId,
```

Pre-Upload Telemetry Tap:
```javascript
orderId: j.orderId || j.amazonOrderId,
```

---

## Implementation Order

Execute changes in this order to minimize risk:

1. **F1** (W0 root_order_id write) — unblocks all downstream lookups
2. **F2** (W4.1 undefined manifest) — fixes crash bug
3. **F3 + F4** (W1.1 guards + duplicate removal) — prevents ID confusion at routing layer
4. **F5** (W4 Hydrate) — prevents wrong manifest fetch
5. **F6** (W1.5 orphaned recovery URL) — fixes recovery path
6. **F7** (W4 OR query cleanup) — semantic improvement
7. **F8** (SW1 telemetry) — cosmetic/debugging improvement

## How to Apply Changes

Each workflow file is a single JSON document. The code to modify lives inside `"jsCode"` string values within node `"parameters"` objects. To edit:

1. Open the JSON file
2. Locate the node by its `"id"` or `"name"` (listed above for each finding)
3. Within that node's `"parameters"."jsCode"` string, find the exact code pattern described in "Current code"
4. Replace with the "Required change" code
5. Validate the resulting file is valid JSON (important: the code is inside a JSON string, so internal double quotes must be escaped as `\"`)
6. Re-upload the modified workflow to n8n

## Validation Checklist

After all changes:

- [ ] All 13 JSON files parse as valid JSON
- [ ] W0: test order creates a row with `root_order_id` populated
- [ ] W4.1: sibling group of 2+ orders runs without TypeError
- [ ] W1.1: order with missing `orderId` is logged and skipped (not silently promoted)
- [ ] W4: sibling order hydrates correct per-book manifest
- [ ] W1.5: orphaned sibling recovery uses per-book ID in URL
- [ ] Full E2E: Amazon 2-sibling CSV upload → W0 → W2A → W2B → W3 → W4 → W4.1 → Lulu

## Files Changed (Re-Upload List)

After implementation, re-upload these to n8n:

1. `w0-Order_Intake_Validation.json` (F1)
2. `w1.1-Queue_Manager_and_Router.json` (F3, F4)
3. `w1.5-Health_Monitor.json` (F6)
4. `w2A-SW1-Pose_Generation.json` (F8)
5. `w4-PRODUCTION-Print_Fulfillment.json` (F5, F7)
6. `w4.1-Sibling-Aggregation.json` (F2)

Unchanged (no re-upload needed):
- `w2A-Orchestrator.json` — already correct
- `w2A-SW0-Base_Character_Generation.json` — uses `characterHash` for paths, no identity issues
- `w2A-SW2-Pose_and_Style_QA.json` — already has correct `root_order_id` fallback
- `w2A-SW3-Upload.json` — uses storage keys, no identity issues
- `w2B-main-orchestrator.json` — already correct
- `w2B-sw1-single-pose.json` — correctly requires per-book `orderId`, throws if missing
- `w3-Book-Assembly.json` — already has correct fallback chain
