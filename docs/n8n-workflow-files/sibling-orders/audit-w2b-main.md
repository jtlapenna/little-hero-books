# W2B Main Orchestrator Audit
**Sibling Order N+ Support Audit**
**File:** `w2B-main-orchestrator.json`
**Audited:** 2026-02-19
**Status:** Complete

---

## Workflow Overview

W2B handles background removal via the BRIA AI service. It is triggered by W1.1's webhook for the `2B` workflow step. The orchestrator downloads the 2A manifest to get a list of approved pose images, fans them out to a sub-workflow (SW1) that calls BRIA, and reassembles results into a 2B manifest that gets written to R2. The 2B manifest is what downstream workflows (W3, W4) use to find background-removed images.

**Full flow:**
```
Webhook Trigger
  → Normalize 2B Input            ← orderId + manifestUrl normalization
  → Download 2A Manifest          ← fetch 2A manifest from R2 proxy
  → Download 2B Manifest          ← fetch existing 2B manifest (optional, 404 ok)
  → Build Worklist                ← determine which poses need processing
      ├─ If All Poses Skipped → Notify Backend: All Poses Skipped
      └─ Split In Batches (batch=1)
             → Execute Workflow: s2B-sw   ← per-pose BRIA call
             → Normalize Result
             → Download 2B Manifest (if exists)
             → Download 2A Manifest (for merge)
             → Merge Result Into 2B Manifest
             → Prep Manifest Binary
             → Upload 2B Manifest to R2
             → If Complete
                 └─ TRUE → Notify Backend (2B Complete)
  → Final Summary
  → Respond to Webhook (Ack)
  → Notify Backend: BRIA_READY
```

---

## Key Architectural Observation — orderId Is the Load-Bearing Identity

Unlike W2A (which was character-hash scoped for assets), W2B is **order-scoped for its manifest**. The 2B manifest path is constructed directly from `orderId`:

```javascript
manifest2bKey = `book-mvp-simple-adventure/orders/${String(orderId)}/manifests/2b-manifest.json`
```

This means the correctness of W2B for sibling orders depends entirely on whether `orderId` resolves to the **per-book synthetic ID** (correct) or the **root group ID** (collision). The entry point — `Normalize 2B Input` — determines this.

Additionally, the 2A manifest URL (which W2B fetches to get the approved pose list) is also `orderId`-based. After the W2A manifest path fix, the 2A manifest is stored at the per-book path. W2B must therefore receive the per-book `orderId` to fetch the right 2A manifest.

---

## Node-by-Node Findings

---

### 1. Webhook Trigger
**Tag: `NO CHANGE`**

Standard webhook entry point. Receives payload from W1.1 `Prep 2B Orders` node.

---

### 2. Normalize 2B Input
**Tag: `UPDATE` ⚠️ — Two issues**

This node is the identity entry point for the entire workflow. It sets `orderId` as the single canonical identifier used by every downstream node:

```javascript
const orderId = pick(input.orderId, input.amazonOrderId, body.orderId, body.amazonOrderId, null);
```

**Issue 1 — Fallback manifest URL uses `orderId`:**

```javascript
manifestUrl = `${base}/api/manifests/book-mvp-simple-adventure/orders/${String(orderId)}/manifests/2a-manifest.json`;
```

After the W1.1 fix, `input.orderId` = per-book ID (e.g. `114-7080737-5512234-item-152767221930001`). The `pick()` resolution correctly selects it over `amazonOrderId`. After the W2A manifest fix, the 2A manifest IS stored at the per-book path. So this URL will resolve correctly — no code change needed here, but this is dependent on both upstream fixes being in place.

**Issue 2 — `amazonOrderId` is never extracted or propagated:**

The node picks `orderId` (per-book after fixes) and discards `amazonOrderId` (root group ID). It never constructs or forwards an `amazonOrderId` field. All downstream backend notifications therefore send only the per-book `orderId`.

This means the backend endpoints (`/api/webhooks/workflow-2b-complete`, `/api/webhooks/workflow-2b-skipped`) will receive a per-book synthetic ID as `orderId`. The backend must be able to look up the correct Supabase row by this value. If the backend currently queries by `amazon_order_id` only, it will fail to match sibling rows.

**Required change:** Extract `amazonOrderId` separately and propagate it in the output:

```javascript
const orderId = pick(input.orderId, body.orderId, null);
const amazonOrderId = pick(input.amazonOrderId, body.amazonOrderId, orderId, null);
// orderId = per-book synthetic ID
// amazonOrderId = root group ID (falls back to orderId for primary orders where they're equal)
return [{ json: { orderId, amazonOrderId, backendUrl, manifestUrl, callbackUrl, sw1WorkflowId, batchSize, force } }];
```

This ensures backend callback payloads include both IDs and the backend can route correctly.

---

### 3. Download 2A Manifest
**Tag: `VERIFY` — Correct after upstream fixes**

```javascript
url: $json.manifestUrl + (cache-bust)
```

`manifestUrl` set by `Normalize 2B Input` — per-book path after fixes. Will correctly fetch the per-book 2A manifest. No code change needed in this node.

---

### 4. Download 2B Manifest (optional)
**Tag: `VERIFY` — Correct after upstream fixes**

```javascript
url: backendUrl + '/api/manifests/book-mvp-simple-adventure/orders/' + orderId + '/manifests/2b-manifest.json?v=' + Date.now()
```

Uses `orderId` from `Normalize 2B Input` — per-book after fixes. Each sibling fetches its own 2B manifest. No collision. No code change needed.

---

### 5. Build Worklist
**Tag: `UPDATE` ⚠️ — Latent fallback precedence bug**

Resolves `orderId` with a three-way fallback:

```javascript
const orderId = ctx.orderId || manifest2a.order?.amazonOrderId || manifest2a.order?.orderId;
```

In normal operation, `ctx.orderId` is set by `Normalize 2B Input` and this resolves correctly. However, if `ctx` access fails (e.g. run index mismatch in a retry), the fallback chain picks `manifest2a.order?.amazonOrderId` — the root group ID — **before** `manifest2a.order?.orderId` — the per-book ID.

After the W2A manifest fix, the 2A manifest will carry both fields. If this fallback triggers for a sibling order, `orderId` silently collapses to the root group ID. All work items emitted for this batch would carry the wrong ID, causing the per-pose S3 writes and the 2B manifest to land at the wrong R2 path.

**Required fix:** Reverse the fallback order:

```javascript
const orderId = ctx.orderId || manifest2a.order?.orderId || manifest2a.order?.amazonOrderId;
```

Work items emitted by this node (one per approved pose) carry `orderId`, `characterHash`, `poseNumber`, `approvedKey`, and `manifest2aUrl`. All correct for per-book identity once the precedence is fixed.

---

### 6. If All Poses Skipped / Notify Backend: All Poses Skipped
**Tag: `VERIFY`**

`Notify Backend: All Poses Skipped` posts `orderId` (per-book after fixes) to `/api/webhooks/workflow-2b-skipped`. Once `Normalize 2B Input` is updated to propagate `amazonOrderId` separately, this notification should include it as well for backend routing.

---

### 7. Split In Batches
**Tag: `NO CHANGE`**

Batch size hardcoded to 1. Routes one work item at a time through the per-pose pipeline. No order logic.

---

### 8. Execute Workflow: s2B-sw
**Tag: `NO CHANGE`**

Calls the `S2B-SW1-single-pose` sub-workflow with the current work item. Each item carries `orderId` (per-book), `characterHash`, `poseNumber`, and `approvedKey`. Sub-workflow audit follows separately.

---

### 9. Normalize Result
**Tag: `VERIFY` — Correct after upstream fixes**

Recovers the sub-workflow result and constructs `manifest2bKey`:

```javascript
const manifest2bKey = `book-mvp-simple-adventure/orders/${String(orderId)}/manifests/2b-manifest.json`;
```

`orderId` = per-book after fixes. Each sibling gets its own 2B manifest path. No collision. No code change needed.

---

### 10. Download 2B Manifest (if exists) / Download 2A Manifest (for merge)
**Tag: `VERIFY` — Correct after upstream fixes**

Both use `orderId`-based paths. Per-book after fixes. Correct. No code changes needed.

---

### 11. Merge Result Into 2B Manifest
**Tag: `VERIFY` — One latent concern**

Creates a 2B manifest skeleton from a deep copy of the 2A manifest if none exists:

```javascript
manifest2b = JSON.parse(JSON.stringify(manifest2a));
```

After the W2A manifest fix, the 2A manifest will carry both `order.orderId` (per-book) and `order.amazonOrderId` (root group). The deep copy correctly inherits both. The `stage` is updated to `'2b'` and 2B-specific fields are initialized to null. No order-path construction here — the manifest key (`manifest2bKey`) comes from `Normalize Result`. No code change needed.

The return value carries `orderId: incoming.orderId` — per-book after fixes. Correct.

---

### 12. Prep Manifest Binary
**Tag: `NO CHANGE`**

Serializes the 2B manifest JSON to base64 binary for S3 upload. Carries `manifest2bKey`, `orderId`, `characterHash`. No path construction. No changes needed.

---

### 13. Upload 2B Manifest to R2 (S3)
**Tag: `VERIFY` — Correct after upstream fixes**

```javascript
fileName: $json.manifest2bKey
// → book-mvp-simple-adventure/orders/${perBookOrderId}/manifests/2b-manifest.json
```

`manifest2bKey` is per-book after fixes. Each sibling's 2B manifest lands at a distinct path. No collision. No changes needed in this node.

---

### 14. If Complete
**Tag: `NO CHANGE`**

Checks `manifest2b.summary.complete` — true when all approved poses have terminal BRIA statuses. No order logic. No changes needed.

---

### 15. Notify Backend (2B Complete)
**Tag: `VERIFY`**

```javascript
{
  orderId: $json.orderId,           // per-book after fixes
  manifestUrl: $json.manifest2bKey, // per-book path
  characterHash: $json.characterHash,
  needsReview: ...
}
```

Correct after fixes. Once `Normalize 2B Input` propagates `amazonOrderId` separately, this notification should include it as well.

---

### 16. Final Summary / Respond to Webhook (Ack) / Notify Backend: BRIA_READY
**Tag: `VERIFY`**

`Notify Backend: BRIA_READY` constructs `manifestUrl` as:
```javascript
`book-mvp-simple-adventure/orders/${String(orderId)}/manifests/2b-manifest.json`
```
Per-book after fixes. Correct path. Same note as above — add `amazonOrderId` to payload once `Normalize 2B Input` propagates it.

---

## Summary of Required Changes

| Node | Tag | Change Required |
|------|-----|-----------------|
| Webhook Trigger | `NO CHANGE` | — |
| **Normalize 2B Input** | `UPDATE` ⚠️ | Extract and propagate `amazonOrderId` separately; confirm `orderId` picks per-book value after W1.1 fix |
| Download 2A Manifest | `VERIFY` | Correct after W1.1 + W2A fixes |
| Download 2B Manifest (optional) | `VERIFY` | Correct after W1.1 fix |
| **Build Worklist** | `UPDATE` ⚠️ | Fix fallback precedence: `orderId` must precede `amazonOrderId` in manifest fallback chain |
| If All Poses Skipped | `VERIFY` | Add `amazonOrderId` to notification payload once Normalize is updated |
| Notify Backend: All Poses Skipped | `VERIFY` | Add `amazonOrderId` to notification payload |
| Split In Batches | `NO CHANGE` | — |
| Execute Workflow: s2B-sw | `NO CHANGE` | Correct after upstream fixes; sub-workflow audited separately |
| Normalize Result | `VERIFY` | manifest2bKey per-book after fixes; correct |
| Download 2B Manifest (if exists) | `VERIFY` | Correct after fixes |
| Download 2A Manifest (for merge) | `VERIFY` | Correct after fixes |
| Merge Result Into 2B Manifest | `VERIFY` | Deep copy of 2A manifest preserves both IDs; correct |
| Prep Manifest Binary | `NO CHANGE` | — |
| Upload 2B Manifest to R2 | `VERIFY` | Per-book manifest2bKey after fixes; correct |
| If Complete | `NO CHANGE` | — |
| Notify Backend (2B Complete) | `VERIFY` | Add `amazonOrderId` to payload |
| Final Summary | `NO CHANGE` | — |
| Respond to Webhook (Ack) | `NO CHANGE` | — |
| Notify Backend: BRIA_READY | `VERIFY` | Add `amazonOrderId` to payload |

**Critical changes: 2** (Normalize 2B Input — extract `amazonOrderId`; Build Worklist — fix fallback precedence)
**Verify: 10** (all dependent on upstream W1.1 + W2A fixes being in place)
**No change: 8**
**No Supabase reads or writes in this workflow** (all Supabase interaction via backend API webhooks)

---

## Open Questions

1. **Backend webhook handlers** — The endpoints `/api/webhooks/workflow-2b-complete` and `/api/webhooks/workflow-2b-skipped` currently receive `orderId`. After fixes, this will be the per-book synthetic ID for siblings. The backend handler must look up the Supabase row by `orderId` (not `amazon_order_id`) to correctly identify the sibling row. This is a backend concern, not a workflow concern — but it must be confirmed before W2B sibling support goes live.

2. **SW1 sub-workflow** — Work items emitted by `Build Worklist` carry `orderId` (per-book), `approvedKey` (character-hash keyed R2 path), and `characterHash`. The SW1 audit will confirm whether `orderId` flows through correctly or introduces collision in the per-pose BRIA request/response cycle.

3. **2B manifest schema** — When the skeleton 2B manifest is created from a deep copy of 2A, it inherits `order.orderId` and `order.amazonOrderId` after the W2A fix. Confirm that downstream consumers of the 2B manifest (W3, W4) correctly read `order.orderId` (per-book) vs `order.amazonOrderId` (root group) once both fields are present.
