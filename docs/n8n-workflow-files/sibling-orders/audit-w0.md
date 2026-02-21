# W0 Audit — Order Intake & Validation
**Sibling Order N+ Support Audit**
**File:** `w0-Order_Intake_Validation.json`
**Audited:** 2026-02-19
**Status:** Complete

---

## Workflow Overview

W0 is the entry point for every order — both primary (first book) and sibling (2nd, 3rd, Nth book with synthetic ID). It normalizes the incoming payload, builds the 1-manifest.json, uploads it to R2, and upserts the order record into Supabase. It does NOT perform character generation or book assembly; it only prepares and stores the order record.

**Flow:**
```
Webhook / Manual Trigger
  → CONFIG (PRODUCTION)
  → Normalize Payload
  → Extract & Validate Dedication
  → Build 1-manifest.json  ─────────────────────────────┐
  → Create Binary (manifest.json)                        │ (parallel)
  → Upload 1-manifest.json to R2                         │
  → Merge ←─────────────────────────────────────────────┘
  → Supabase Upsert (orders)2
```

---

## Node-by-Node Findings

---

### 1. Mock Order (STANDARD Testing)
**Tag: `UPDATE`**

Currently generates a single-book order with `quantity: 1` and no sibling context.

**What needs to change:**
- Add a second mock variant (or a `TEST_CONFIG` flag) that generates a sibling order — i.e., uses a synthetic order ID like `NB3-STANDARD-05-item-99999` and carries an `amazonOrderId` pointing to the root order.
- Alternatively, add a `lineItems` array with 2+ entries to the existing mock to test multi-item detection in downstream nodes.
- No production impact — this is test scaffolding only.

---

### 2. Mock Order (AMAZON Testing)
**Tag: `UPDATE`**

Same issue as the Standard mock. Single book, `quantity: 1`, no sibling context.

**What needs to change:**
- Same as above: add a sibling-order mock variant with a synthetic ID (e.g., `NB3-AMAZON-01-item-152767221930001`) so the sibling path through W0 can be tested end-to-end.

---

### 3. CONFIG (PRODUCTION)
**Tag: `NO CHANGE`**

Provides Supabase and R2/S3 credentials. Completely agnostic to order structure. No changes needed.

---

### 4. Normalize Payload
**Tag: `UPDATE` — Critical**

This node normalizes the raw incoming payload into a clean envelope. Two sibling-related gaps exist:

**Gap 1 — `amazonOrderId` and `marketplaceId` not promoted to top level.**

Both fields are preserved in `_raw` but not explicitly extracted to the top-level output. This was flagged as a missing fix in the Phase 1 work. Downstream nodes that need to detect Amazon orders should not have to reach into `_raw`.

```javascript
// MISSING from current return block:
amazonOrderId: raw.amazonOrderId || null,
marketplaceId: raw.marketplaceId || null,
```

**Gap 2 — Root `amazon_order_id` not derived for sibling orders.**

When a sibling order is processed by W0, its `orderId` is a synthetic ID like `114-7080737-5512234-item-152767221930001`. The root group ID (`114-7080737-5512234`) must be derived by stripping the `-item-*` suffix. This root ID is required for Supabase group-detection queries in the cron/aggregation logic.

Neither the root ID derivation nor a `siblingGroupId` field is computed here.

```javascript
// NEEDS to be added:
function deriveRootOrderId(orderId) {
  // Sibling IDs are formatted as: <rootOrderId>-item-<itemId>
  const siblingPattern = /^(.+)-item-[^-]+$/;
  const match = orderId.match(siblingPattern);
  return match ? match[1] : orderId; // returns root if sibling, self if primary
}

const rootOrderId = deriveRootOrderId(orderId);
const isSiblingOrder = rootOrderId !== orderId;
```

These derived values (`rootOrderId`, `isSiblingOrder`) should be added to the output envelope so all downstream nodes can access them without re-computing.

---

### 5. Extract & Validate Dedication
**Tag: `NO CHANGE`**

Extracts and sanitizes the dedication text from various possible locations in the payload. Purely per-book logic — no awareness of sibling context needed. No changes required.

---

### 6. Build 1-manifest.json
**Tag: `UPDATE` — Important**

Builds the manifest object that travels with the order through the pipeline. Currently handles `amazonOrderId` and `marketplaceId` correctly for primary Amazon orders by reading from `_raw`. However, two gaps exist for sibling support:

**Gap 1 — `siblingGroupId` not included in manifest.**

The manifest has no field indicating which group this order belongs to. Downstream workflows (especially aggregation logic) need to identify all orders in a group. The root `amazon_order_id` should be written into the manifest as `siblingGroupId` (or `amazonGroupId`) so it is durable in R2.

```javascript
// NEEDS to be added to manifest object:
...(rootOrderId && isSiblingOrder ? { siblingGroupId: rootOrderId } : {}),
// Or always include it when the order has an Amazon origin:
...(isAmazonOrder ? { siblingGroupId: rootOrderId || amazonOrderId } : {}),
```

**Gap 2 — Relies on `_raw` for `amazonOrderId` rather than top-level field.**

Once `Normalize Payload` is updated to promote `amazonOrderId` and `marketplaceId` to top level (see node 4), this node should be updated to read from `j.amazonOrderId` / `j.marketplaceId` rather than `j._raw?.amazonOrderId`. This removes reliance on `_raw` and makes the logic cleaner.

---

### 7. Create Binary (manifest.json)
**Tag: `NO CHANGE`**

Converts the manifest JSON to a binary buffer for S3 upload. Completely agnostic to manifest content. No changes needed.

---

### 8. Upload 1-manifest.json to R2
**Tag: `NO CHANGE`**

Uploads the binary to R2. Agnostic to order structure. No changes needed.

---

### 9. Fallback (Skip Upload)
**Tag: `NO CHANGE`**

Fallback path if R2 upload is unavailable. Passes manifest through unchanged. No changes needed.

---

### 10. Merge
**Tag: `NO CHANGE`**

Combines the two upload paths (R2 success / fallback). Structural utility node — no order logic. No changes needed.

---

### 11. Supabase Upsert (orders)2
**Tag: `UPDATE` — Critical**

This is where the order record lands in Supabase. Two sibling-related gaps:

**Gap 1 — `amazon_order_id` for siblings is set to the synthetic ID, not the root ID.**

```javascript
// Current:
if (manifest.amazonOrderId) {
  body.amazon_order_id = manifest.amazonOrderId;
}

// For a sibling order, manifest.amazonOrderId is "114-7080737-5512234-item-152767221930001"
// But Supabase queries for sibling groups use the ROOT id: "114-7080737-5512234"
// The full synthetic ID should be in orderId; amazon_order_id should be the root.
```

**Fix:** Derive the root `amazon_order_id` when setting this field. The safest approach is to use `siblingGroupId` from the manifest if present, otherwise fall back to the `amazonOrderId` as-is.

```javascript
// UPDATED logic:
if (manifest.amazonOrderId || manifest.siblingGroupId) {
  body.amazon_order_id = manifest.siblingGroupId || manifest.amazonOrderId;
}
```

**Gap 2 — `sibling_group_id` field not written to Supabase.**

Even after Gap 1 is fixed, it may be useful to have a dedicated `sibling_group_id` column in the orders table (separate from `amazon_order_id`) for fast group queries. This is the "Optional DB support" item from doc #24. Not required for Phase 2 if we derive groups by `amazon_order_id`, but worth noting as a potential performance improvement.

**Existing behavior that is CORRECT and should be preserved:**
- `orderId` is used as the primary identifier (not `amazonOrderId`), which correctly handles sibling synthetic IDs.
- `marketplace_id` is already written to Supabase.
- The PATCH-first, then POST pattern is correct for idempotency.

---

## Summary of Required Changes

| Node | Tag | Change Required |
|------|-----|-----------------|
| Mock Order (STANDARD Testing) | `UPDATE` | Add sibling mock variant with synthetic order ID |
| Mock Order (AMAZON Testing) | `UPDATE` | Add sibling mock variant with synthetic order ID |
| CONFIG (PRODUCTION) | `NO CHANGE` | — |
| Normalize Payload | `UPDATE` ⚠️ | Promote `amazonOrderId` + `marketplaceId` to top level; derive `rootOrderId` + `isSiblingOrder` |
| Extract & Validate Dedication | `NO CHANGE` | — |
| Build 1-manifest.json | `UPDATE` | Add `siblingGroupId` to manifest; read from top-level fields once Normalize is fixed |
| Create Binary (manifest.json) | `NO CHANGE` | — |
| Upload 1-manifest.json to R2 | `NO CHANGE` | — |
| Fallback (Skip Upload) | `NO CHANGE` | — |
| Merge | `NO CHANGE` | — |
| Supabase Upsert (orders)2 | `UPDATE` ⚠️ | Write root `amazon_order_id` (not synthetic); add `sibling_group_id` if column exists |

**Critical changes: 3** (`Normalize Payload`, `Supabase Upsert`, `Build 1-manifest.json`)
**Minor changes: 2** (mock nodes)
**No change: 6**

---

## Key Data Flow Concern

W0 is the only place where the `rootOrderId` / `siblingGroupId` should be derived and written. Every downstream workflow reads from Supabase or the manifest — they should NOT be re-deriving sibling group identity. If it's correct in the manifest and in Supabase after W0, everything downstream can trust it.

**The pattern this establishes for downstream audits:**
- Any node that reads `manifest.amazonOrderId` should instead check `manifest.siblingGroupId` (or `manifest.amazonGroupId`) when group-level logic is needed.
- Any Supabase query that groups sibling orders should use `amazon_order_id` (which after the fix = root ID for all members of a group).

---

---

## Post-Implementation Review — 2026-02-19
**Reviewer:** Claude (second-pass QA after initial agent implementation)
**File reviewed:** `sibling-order-n8n-workflows/w0-Order_Intake_Validation.json`

### What the implementing agent got right

- **`Normalize Payload`**: Correctly added `deriveRootOrderId()`, `rootOrderId`, `isSiblingOrder`, and promoted `amazonOrderId` + `marketplaceId` to top-level output. ✅
- **`Build 1-manifest.json`**: Correctly reads from top-level fields (not `_raw`), adds `siblingGroupId` to manifest, resolves `resolvedAmazonOrderId` properly. ✅
- **`Supabase Upsert (orders)2`**: Correctly writes `manifest.siblingGroupId || manifest.amazonOrderId` to `amazon_order_id` (root group ID, not synthetic per-book ID). ✅
- All NO CHANGE nodes were left untouched. ✅

### Issues found and fixed

---

#### Issue 1 — JSON Corruption in `Normalize Payload` (Critical — file would not parse)
**Severity:** Critical — the file as delivered was invalid JSON and would fail to import into n8n.

**Root cause:** The agent inserted the new `deriveRootOrderId` function block with literal newline characters (`0x0a` bytes) directly inside a JSON string value. JSON requires newlines inside strings to be encoded as `\n`; literal newlines make the file unparseable.

**Symptom:** `json.JSONDecodeError: Invalid control character at: line 128 column 789`

**Fix:** Repaired the file by re-encoding all literal newlines within `jsCode` string values as proper `\n` escape sequences. The repaired file passes `JSON.parse()` cleanly.

---

#### Issue 2 — `extractOrderId` Field Precedence (Critical — silently breaks all sibling logic)
**Severity:** Critical — sibling orders would be silently misidentified as primary orders, making `isSiblingOrder = false` and bypassing all new sibling logic.

**Root cause:** The implementing agent added `deriveRootOrderId` and `isSiblingOrder` correctly but did not update the `extractOrderId` function that feeds them. The original function was:

```javascript
// BEFORE (broken for siblings):
function extractOrderId(r){ return r.amazonOrderId || r.orderId || r.id || 'UNKNOWN-ORDER'; }
```

When a real sibling payload arrives with **both** `amazonOrderId` (root group ID, e.g. `114-7080737-5512234`) and `orderId` (synthetic per-book ID, e.g. `114-7080737-5512234-item-001`), `amazonOrderId` is selected first. The derived `orderId` becomes the root group ID. `deriveRootOrderId` finds no `-item-` suffix, so `isSiblingOrder = false`. All sibling logic is bypassed silently.

**Fix:** Reversed field precedence so per-book `orderId` takes priority:

```javascript
// AFTER (correct):
function extractOrderId(r){ return r.orderId || r.id || r.amazonOrderId || 'UNKNOWN-ORDER'; }
```

This ensures that when a sibling payload provides both fields, the per-book synthetic ID wins and the sibling identity is correctly derived.

---

#### Issue 3 — Mock nodes lacked sibling test variants (Minor — testing gap)
**Severity:** Minor — no production impact, but the sibling path through W0 was completely untestable.

**Root cause:** Both `Mock Order (STANDARD Testing)` and `Mock Order (AMAZON Testing)` nodes were not updated from the original. They only generated single-book (primary) orders. There was no way to run a sibling order through W0 manually to verify the new logic.

**Fix:** Both mock nodes now include a `SIBLING_MODE` flag (default `false`). When set to `true`, the mock generates a payload with:
- `orderId`: synthetic per-book ID (e.g. `NB3-STANDARD-05-item-99999` or `114-7080737-5512234-item-152767221930001`)
- `amazonOrderId`: root group ID (shared by all siblings)
- Distinct child character specs to represent a second book in the order

The existing primary-order behavior is fully preserved when `SIBLING_MODE = false`.

---

### Summary of changes made in this review pass

| Node | Change |
|------|--------|
| File (all nodes) | Repaired JSON corruption — re-encoded literal newlines as `\n` in `jsCode` strings |
| `Normalize Payload` | Fixed `extractOrderId` field precedence: `orderId \|\| id \|\| amazonOrderId` |
| `Mock Order (STANDARD Testing)` | Added `SIBLING_MODE` toggle + sibling payload variant |
| `Mock Order (AMAZON Testing)` | Added `SIBLING_MODE` toggle + sibling payload variant |

### Nodes confirmed correct (no changes needed)

`CONFIG (PRODUCTION)`, `Extract & Validate Dedication`, `Create Binary (manifest.json)`, `Upload 1-manifest.json to R2`, `Fallback (Skip Upload)`, `Merge`, `Build 1-manifest.json`, `Supabase Upsert (orders)2`

### W0 status after this review: ✅ Complete and correct

---

## Amazon vs. D2C Notes

- D2C (standard) orders do not have `amazonOrderId` or `marketplaceId`. Sibling handling for D2C has not been specified in the Phase 2 docs. **Open question:** Can a D2C order have multiple line items (e.g., a customer buying 2 books in one checkout)? If yes, a sibling mechanism for D2C needs to be defined. If no, sibling logic only applies to Amazon orders and `isSiblingOrder` can remain tied to Amazon ID detection.
- The current create-sibling CLI/API appears to be Amazon-specific (works from Amazon CSV data). This should be confirmed during the backend audit.

---

## Open Questions

1. **D2C multi-item orders** — Are they in scope? If so, how are they identified as a group? There is no `amazonOrderId` equivalent for D2C.
2. **`sibling_group_id` Supabase column** — Does this column exist, or do we derive groups purely from `amazon_order_id`? Confirm schema before implementation.
3. **Sibling order input format** — When a sibling order is triggered via the create-sibling API and flows through W0, what does its payload look like at the Webhook? Confirm that `amazonOrderId` in the payload is the synthetic ID (not the root).
