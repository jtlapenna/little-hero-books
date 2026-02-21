# W2A Audit — Character Generation
**Sibling Order N+ Support Audit**
**Files:** `w2A-Orchestrator.json`, `w2A-SW0-Base_Character_Generation.json`, `w2A-SW1-Pose_Generation.json`, `w2A-SW2-Pose_and_Style_QA.json`, `w2A-SW3-Upload.json`
**Audited:** 2026-02-19
**Status:** Complete

---

## Workflow Overview

W2A generates the character images for a book. It is structured as an orchestrator driving four sub-workflows in sequence:

```
Webhook (Router) → Normalize Router Payload → Set Environment Defaults (code)
  → Capture Order Context → Generate Character Hash1
  → Set Environment Defaults → Expand to N Poses → Loop Over Items
      → Execute SW0 - Base Character Gen  (generate base character image from specs)
      → Execute SW1 - Pose Generation     (generate each of N pose variants)
      → Execute SW2 - Pose and Style QA   (QA loop with retry)
      → SW3 - Upload                      (upload approved pose images to R2)
  → Results Accumulator → Write Run Manifest1
  → Upload Manifest to R2 → Supabase — Upsert from 2A Manifest
  → Respond to Webhook (Ack)

Retry path: Retry Builder → IF: Retries Exhausted? → Return Retry Context / Mark as Needs Review
```

**Key principle:** W2A operates on a per-character-hash basis for all R2 asset paths. Character images are stored under `order-generated-assets/characters/${characterHash}/...` — not under an order path. This is intentional and correct: if two siblings share identical character specs they would share a `characterHash` and therefore share the generated assets (no duplicate generation needed).

The 2A manifest — the output artifact of this workflow — is stored under the order path and is where the collision risk lives.

---

## Architectural Observation — Character Hash Partitioning

W2A's asset storage is partitioned by `characterHash`, not `orderId`. This has an important implication for sibling orders:

- **Different characters (different specs):** Each sibling generates its own `characterHash` and has completely independent R2 paths for all image assets. No collision possible. W2A runs independently and correctly for each sibling.
- **Identical characters (identical specs):** Two siblings with the same character would produce the same `characterHash`. SW3 would upload to identical R2 keys. The second sibling's upload would overwrite the first's — but since they're identical images this is harmless. More importantly, the existing `Generate Character Hash1` node already has logic to skip regeneration when a cached character exists.

In either case, **character asset generation requires no changes for sibling support**. The only issue is the manifest path, which is order-scoped rather than character-scoped.

---

## Node-by-Node Findings

---

### 1. Webhook (Router)
**Tag: `NO CHANGE`**

Standard webhook entry point. Receives the payload from W1.1 Trigger 2A node. No order logic.

---

### 2. Normalize Router Payload
**Tag: `UPDATE` ⚠️ — Depends on W1.1 fix; verify resolution logic**

This node normalizes the incoming payload, mapping both router format and webhook format to a unified object. It sets two key fields:

```javascript
amazonOrderId: body.amazon_order_id || body.orderId || routerData.orderId || routerData.amazonOrderId,
orderId:       body.orderId || body.amazon_order_id || routerData.orderId || routerData.amazonOrderId,
```

**Current state (before W1.1 fix):** W1.1's `Prep 2A Orders` sends `orderId: order.amazon_order_id`. So both `body.orderId` and `body.amazon_order_id` resolve to the root group ID. Both `amazonOrderId` and `orderId` in the normalized output equal the root group ID. For primary orders this is fine (they're the same). For siblings, both collapse to the same value — incorrect.

**After W1.1 fix** (W1.1 sends `orderId: order.orderId, amazonOrderId: order.amazon_order_id`):
- `body.orderId` = per-book synthetic ID (e.g. `114-7080737-5512234-item-152767221930001`)
- `body.amazon_order_id` = root group ID (e.g. `114-7080737-5512234`)
- `amazonOrderId` resolves to: `body.amazon_order_id` → root group ID ✅
- `orderId` resolves to: `body.orderId` → per-book ID ✅

The node's resolution logic is correct **after the W1.1 fix** — no changes needed here if the upstream payload shape is fixed. The fallback chains already prefer `body.orderId` over `body.amazon_order_id` for the `orderId` field.

**Action:** Verify this node works correctly once W1.1 Prep 2A fix is in place. No code change required in this node itself.

---

### 3. Set Environment Defaults (code)
**Tag: `NO CHANGE`**

Sets operational constants (`assetsRoot`, `numPoses`, `maxRetries`, etc.) and propagates `characterHash`. Does not construct any order-scoped paths. No changes needed.

---

### 4. Capture Order Context
**Tag: `UPDATE` ⚠️ — Must preserve both `orderId` and `amazonOrderId` separately**

Builds the `orderContext` object that is stored in `$execution.customData` and workflow static data, used throughout the execution as an authoritative reference:

```javascript
const orderContext = {
  amazonOrderId: good(incomingAmazonOrderId) ? String(incomingAmazonOrderId).trim() : null,
  orderId: good(incomingOrderId) ? String(incomingOrderId).trim()
           : (good(incomingAmazonOrderId) ? String(incomingAmazonOrderId).trim() : null),
  // ...
};
```

**Current behavior:** `orderId` falls back to `amazonOrderId` if `orderId` is not a "good" value. For primary orders where they're equal, this is harmless. For siblings, after the W1.1 fix, `incomingOrderId` will be the per-book synthetic ID and will pass the `good()` check — so `orderId` will correctly preserve the per-book value.

However, the fallback is risky: if anything upstream causes `incomingOrderId` to arrive as `undefined`, `null`, or `'unknown-order'`, the fallback silently collapses it to `amazonOrderId` (the group root). This is a latent bug that should be made explicit:

```javascript
// Recommended: fail loudly if orderId is absent rather than silently falling back
orderId: good(incomingOrderId) ? String(incomingOrderId).trim() : null,
// (remove the fallback to amazonOrderId — orderId must be the per-book ID or null)
```

Additionally, `global.lastAmazonOrderId` and `sd.lastOrderContext` are written to workflow static data. If two sibling executions run close together on the same n8n instance, `global.currentAmazonOrderId` used by `Set Environment Defaults` could contain the previous sibling's value. This is a pre-existing race condition, not introduced by sibling support — but worth noting.

---

### 5. Generate Character Hash1
**Tag: `NO CHANGE`**

Extracts `character_hash` from W0 output. Per-character logic. No order path construction. No changes needed.

---

### 6. Set Environment Defaults
**Tag: `UPDATE` ⚠️ — Same `amazonOrderId` resolution concern**

This node resolves `amazonOrderId` from multiple sources using a precedence chain:

```javascript
const execCtxId = $execution.customData?.orderContext?.amazonOrderId || null;
const incoming  = input.amazonOrderId || null;
// Precedence: incoming(non-unknown) → execCtx → ctxId → global
const amazonOrderId = (good(incoming) ? incoming : ...);
```

After the W1.1 fix, `input.amazonOrderId` will be the root group ID, which is correct for `amazonOrderId`. No change needed here.

However, this node does **not** propagate `orderId` separately. It only maintains `amazonOrderId` in the execution context. Downstream nodes that need the per-book `orderId` (specifically for the manifest path) must get it from `$json.orderId` rather than from this execution context. Verify that `Write Run Manifest1` reads `orderId` from `$json` and not from `$execution.customData.orderContext`.

---

### 7. Expand to N Poses / Loop Over Items
**Tag: `NO CHANGE`**

Generates N item copies (one per pose) for the pose generation loop. Per-character logic. No order paths. No changes needed.

---

### 8. Execute SW0 — Base Character Gen
**Tag: `NO CHANGE` for sibling support**

Generates the base character image from `characterSpecs`. Output is keyed by `characterHash`. No order-scoped paths. Completely independent per character. No changes needed.

---

### 9. Execute SW1 — Pose Generation
**Tag: `NO CHANGE` for sibling support**

Generates each pose variant. R2 paths are `order-generated-assets/characters/${characterHash}/...`. No order-scoped paths. No changes needed.

---

### 10. Execute SW2 — Pose and Style QA
**Tag: `NO CHANGE` for sibling support**

QA loop with retry logic. Operates on character images keyed by `characterHash`. No order-scoped paths. No changes needed.

---

### 11. SW3 — Upload (Execute SW3)
**Tag: `NO CHANGE` for sibling support**

Uploads approved pose images to R2. The `Add Upload to R2` node builds the storage key as:

```javascript
`${prefix}/order-generated-assets/characters/${characterHash}/characters_${ch}_pose${pose}.png`
```

Keyed entirely by `characterHash`, not `orderId`. No collision for siblings with different characters. For siblings with identical characters, writes are idempotent (same content, same key). No changes needed.

---

### 12. Results Accumulator
**Tag: `NO CHANGE`**

Collects pose results across the loop. Keyed by `characterHash` and pose number. No order-scoped path construction. No changes needed.

---

### 13. Write Run Manifest1
**Tag: `UPDATE` ⚠️ — Critical: manifest path uses `amazonOrderId`**

This is the primary collision point in W2A. The manifest key is constructed as:

```javascript
if (amazonOrderId) {
  manifestKey = `book-mvp-simple-adventure/orders/${amazonOrderId}/manifests/2a-manifest.json`;
}
```

After the W1.1 fix, `amazonOrderId` correctly resolves to the root group ID (e.g. `114-7080737-5512234`). Two siblings would both write their 2A manifests to:
```
orders/114-7080737-5512234/manifests/2a-manifest.json
```

**This is a write collision.** Sibling B's manifest overwrites Sibling A's manifest. When W2B or W3 later fetches this manifest for Sibling A, it gets Sibling B's character data.

**Required fix:** The manifest path must use the per-book `orderId`, not the group root `amazonOrderId`:

```javascript
const perBookId = pickNE($json?.orderId, orderContext.orderId, amazonOrderId);

if (perBookId) {
  manifestKey = `book-mvp-simple-adventure/orders/${perBookId}/manifests/2a-manifest.json`;
}
```

The manifest content itself should still record `amazonOrderId` (the group root) as metadata for traceability — the fix is only to the file path.

Also update the manifest's internal `order.amazonOrderId` vs `order.orderId` fields to distinguish the two:
```javascript
manifest.order.orderId = perBookId;          // per-book ID
manifest.order.amazonOrderId = amazonOrderId; // group root ID
```

---

### 14. Upload Manifest to R2
**Tag: `NO CHANGE`**

S3 node that uploads whatever is in `$json.manifestKey`. The key itself is set by `Write Run Manifest1`. Fix the key there; this node requires no change.

---

### 15. Supabase — Upsert from 2A Manifest
**Tag: `UPDATE` ⚠️ — Two issues**

**Issue 1 — PATCH URL targets wrong field:**

The PATCH URL is:
```
https://...supabase.co/rest/v1/orders?orderId=eq.{{$json.orderId}}
```

This targets rows where the Supabase `orderId` column equals `$json.orderId`. After the W1.1 + Normalize Payload fixes, `$json.orderId` will be the per-book synthetic ID. If the Supabase `orders` table has `orderId` as a column (confirmed per W0 audit), this correctly targets the specific sibling row. **This part is actually correct after upstream fixes.**

**Issue 2 — `orderId` body parameter overwrites the column with the group root ID:**

```javascript
// Body parameter named 'orderId':
value: $json.amazonOrderId || $json.manifest.order.amazonOrderId
```

This writes the root group ID (`amazon_order_id`) into the Supabase `orderId` column. For sibling orders, this corrupts the per-book `orderId` with the shared group root — breaking all future queries that use `orderId` to locate the sibling row.

**Fix:**
```javascript
// orderId body parameter should write the per-book ID:
value: $json.orderId || $json.manifest.order.orderId
```

Additionally, verify the `manifest_2a_url` body parameter constructs the correct per-book manifest path after `Write Run Manifest1` is fixed:
```javascript
manifest_2a_url: $json.manifest.order.publicR2Url + '/' + $json.manifestKey
// ↑ Will be correct once manifestKey uses the per-book orderId
```

---

### 16. Respond to Webhook (Ack)
**Tag: `NO CHANGE`**

Returns acknowledgment to W1.1. No order logic.

---

### 17. Retry Builder / Bump retry counter / IF: Retries Exhausted / Mark as Needs Review
**Tag: `NO CHANGE`**

Retry and error handling path. Per-execution logic using `$execution.customData`. No R2 path construction. No changes needed.

---

## Sub-Workflow Summary (SW0, SW1, SW2)

These three sub-workflows operate exclusively on character-hash-keyed R2 paths. They receive the order context via execution parameters but do not construct any order-scoped storage paths. **No changes required in SW0, SW1, or SW2 for sibling support.**

SW3 (Upload) similarly uses character-hash paths for all image uploads. **No changes required in SW3 for sibling support.**

---

## Summary of Required Changes

| Node | Tag | Change Required |
|------|-----|-----------------|
| Webhook (Router) | `NO CHANGE` | — |
| Normalize Router Payload | `VERIFY` | Correct after W1.1 fix; no code change in this node |
| Set Environment Defaults (code) | `NO CHANGE` | — |
| **Capture Order Context** | `UPDATE` ⚠️ | Remove silent fallback from `orderId` → `amazonOrderId`; `orderId` should be null rather than collapsing to group root |
| Generate Character Hash1 | `NO CHANGE` | — |
| Set Environment Defaults | `NO CHANGE` | Does not handle `orderId` separately; verify downstream reads `orderId` from `$json` |
| Expand to N Poses / Loop | `NO CHANGE` | — |
| Execute SW0 / SW1 / SW2 / SW3 | `NO CHANGE` | All character-hash-keyed; no order path construction |
| Results Accumulator | `NO CHANGE` | — |
| **Write Run Manifest1** | `UPDATE` ⚠️ | Use per-book `orderId` for manifest path instead of `amazonOrderId`; record both IDs in manifest content |
| Upload Manifest to R2 | `NO CHANGE` | Key comes from `Write Run Manifest1`; fix there |
| **Supabase — Upsert from 2A Manifest** | `UPDATE` ⚠️ | Fix `orderId` body parameter to write per-book ID, not group root ID |
| Respond to Webhook (Ack) | `NO CHANGE` | — |
| Retry / Error path nodes | `NO CHANGE` | — |

**Critical changes: 3** (Write Run Manifest1 path, Supabase upsert `orderId` body param, Capture Order Context fallback)
**Verify: 1** (Normalize Router Payload — confirm correct after W1.1 fix)
**No change: all sub-workflows (SW0–SW3) and all other nodes**

---

## Key Principle Confirmed

W2A is **character-scoped** for assets and **order-scoped** only for its manifest. The sibling support changes in this workflow are therefore narrow: fix the manifest R2 path and the Supabase upsert `orderId` field. Everything else — base character generation, pose generation, QA, and upload — is already siloed correctly by `characterHash` and requires no modification.

---

## Open Questions

1. **`orderId` in W2A execution context** — `Capture Order Context` stores `orderContext` in `$execution.customData`. `Set Environment Defaults` reads `amazonOrderId` from this context but not `orderId`. Confirm that `Write Run Manifest1` reads `$json.orderId` directly (from the item payload) rather than from the execution context — if it reads from the context it won't have the per-book ID.

2. **Manifest content schema** — The 2A manifest currently has `order.amazonOrderId`. After the fix, it should have both `order.orderId` (per-book) and `order.amazonOrderId` (group root). Verify that downstream workflows (W2B, W3) that read the 2A manifest correctly consume both fields after this change.

3. **Global `currentAmazonOrderId` race condition** — Two sibling executions running in parallel on the same n8n instance could clobber each other's `global.currentAmazonOrderId`. This is a pre-existing issue that becomes more likely with siblings. Consider removing the global fallback entirely and requiring that `amazonOrderId` always arrive via the item payload.
