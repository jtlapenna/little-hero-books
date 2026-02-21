# W3 Book Assembly Audit
**Sibling Order N+ Support Audit**
**File:** `w3-Book-Assembly.json`
**Audited:** 2026-02-19
**Status:** Complete

---

## Workflow Overview

W3 assembles the final book preview images. It receives a trigger from W1.1 containing the 2B manifest URL, fetches the manifest (which carries the bg-removed character pose images from W2B), renders all interior pages and the cover as HTML, submits them to PDFMonkey for PNG generation, uploads the preview images to R2 and Cloudflare Images, builds a 3-manifest, uploads it to R2, upserts the Supabase order record, and notifies downstream of completion.

**Simplified flow:**
```
Webhook Trigger (Book Assembly)
  → Idempotency Check
  → Extract Manifest URL (3)         ← normalize orderId from webhook body
  → Download 2B Manifest
  → Build Assembly Input From Manifest   ← critical: orderId resolution
  → Get Order Ready for Assembly
  → Load Canonical Assets
  → Load Story & Character Poses (3A)
  → Resolve Asset Paths (3A Phase 1)1    ← emits renderContext.orderId
  → Normalize Inputs (3A Phase 1)1
  → Route Cover by Order Type
      ├─ Generate Cover HTML (AMAZON) → Generate Cover Image with PDFMonkey → Poll → Download → Set Cover PNG Filenames/Keys → Upload Cover Preview Image to R2
      └─ Generate Cover HTML (STANDARD) → (same path)
  → Generate Complete HTML (Amazon/Standard)   ← interior pages HTML
  → Generate Page Preview Images              ← emits R2 keys for all page images
  → Split in Batches (PNG Pages)
        → Generate Page Image with PDFMonkey → Poll → Download → Carry Page Keys Forward → Upload Page Preview Image to R2 → Upload to Cloudflare Images
  → Collect Page Preview Images
  → Build 3A Manifest
  → Acceptance Tests / QA Gate
  → Prep Manifest Upload (3)
  → Upload 3 Manifest to R2
  → Fetch and Merge Review Stages (3)   ← Supabase GET
  → Supabase Upsert 3                   ← Supabase PATCH/POST
  → Mark Previews Ready (3A status)
  → Log Assembly Results
```

---

## Key Architectural Observation — W3 is Order-Scoped

Unlike W2A/W2B-SW1 (character-hash scoped assets), W3 stores all its outputs under an **order-scoped R2 path**:

```
book-mvp-simple-adventure/orders/${orderId}/preview-images/   ← page PNG images
book-mvp-simple-adventure/orders/${orderId}/preview-images/   ← cover PNG
book-mvp-simple-adventure/orders/${orderId}/manifests/3-manifest.json
```

This means W3 is highly sensitive to whether `orderId` resolves to the **per-book synthetic ID** (correct, gives each sibling its own namespace) or the **root group ID** (collision, siblings overwrite each other's preview images and manifest).

W3 also has two Supabase operations — a GET to fetch existing `review_stages` and a PATCH upsert — both of which must target the per-book row, not the root group row.

---

## Node-by-Node Findings

---

### 1. Webhook Trigger (Book Assembly) / When clicking 'Execute workflow'
**Tag: `NO CHANGE`**

Entry points. Receives payload from W1.1's Prep 3 Orders node (webhook) or manual trigger. No path construction.

---

### 2. Idempotency Check
**Tag: `NO CHANGE`**

Uses `orderId || amazonOrderId` from the incoming payload as a deduplication key. Lookup is in-memory only (workflow static data). No path construction. No Supabase operations. No changes needed.

---

### 3. Extract Manifest URL (3)
**Tag: `VERIFY` — Correct precedence**

Normalizes the incoming webhook payload and sets `orderId`:

```javascript
let orderId = (input.orderId && ...) ? input.orderId : null;
if (!orderId) { orderId = (input.amazonOrderId && ...) ? input.amazonOrderId : null; }
```

Picks `orderId` (per-book after W1.1 fix) before `amazonOrderId` (root group). Correct precedence. The fallback to extract from `manifestKey` also uses the path segment after `/orders/`, which would be the per-book ID after W2A + W1.1 fixes. No code change needed.

---

### 4. Download 2B Manifest
**Tag: `VERIFY` — Correct after upstream fixes**

Fetches from `$json.manifestUrl` set by `Extract Manifest URL (3)`. URL constructed from per-book `orderId` after fixes. No code change needed.

---

### 5. Build Assembly Input From Manifest
**Tag: `UPDATE` ⚠️ — Root cause of downstream orderId pollution**

This is the most consequential node in W3 for sibling support. It reads from the 2B manifest and builds the unified assembly context passed to every downstream node.

```javascript
// CURRENT (WRONG after W2A manifest fix):
const amazonOrderId = order.amazonOrderId || order.orderId || ctx.orderId || null;
```

After the W2A manifest fix, the 2B manifest carries both `order.amazonOrderId` (root group ID) and `order.orderId` (per-book ID). The current fallback picks the root group ID first. Every downstream node that uses `amazonOrderId` for R2 path construction will therefore write to the root group ID path — sibling collision.

**Required fix — reverse fallback order and propagate both IDs separately:**

```javascript
// FIX: prefer per-book orderId; preserve amazonOrderId as root group reference
const orderId = order.orderId || ctx.orderId || order.amazonOrderId || null;
const amazonOrderId = order.amazonOrderId || orderId || null;
```

The output payload must carry `orderId` (per-book) as the primary key and `amazonOrderId` (root group) as a secondary reference. All downstream R2 path construction nodes read from `order.amazonOrderId` or `order.orderId` — after this fix, they will get the per-book ID.

---

### 6. Get Order Ready for Assembly
**Tag: `VERIFY`**

Reads `amazonOrderId` from the webhook payload:

```javascript
const amazonOrderId = payload.amazonOrderId ?? payload.orderData?.amazonOrderId ?? null;
```

Throws if missing. This is used for validation only — the real orderId for path construction comes from the 2B manifest via `Build Assembly Input From Manifest`. No code change needed here, but W1.1's Prep 3 Orders fix must ensure `amazonOrderId` (root group) is sent separately from `orderId` (per-book) in the trigger payload.

---

### 7. Load Canonical Assets
**Tag: `VERIFY`**

```javascript
if (!order.amazonOrderId) {
  throw new Error('Amazon Order ID is required for loading background images');
}
```

This is a presence check only — `amazonOrderId` is not used in any R2 path. All background/overlay paths are static template assets (e.g., `book-mvp-simple-adventure/backgrounds/pageXX-slug.png`). No path construction uses order identity. No code change needed.

---

### 8. Load Story & Character Poses (3A)
**Tag: `NO CHANGE`**

Builds story text and character pose URLs. Pose URLs are character-hash keyed:

```javascript
const BASE_PREFIX = 'book-mvp-simple-adventure/order-generated-assets/characters';
// → .../characters/${hash}/characters_${hash}_pose${NN}_nobg.png
```

No order-scoped R2 paths. No changes needed.

---

### 9. Resolve Asset Paths (3A Phase 1)1
**Tag: `UPDATE` ⚠️ — Emits wrong orderId to renderContext**

Assembles `ctx` from multiple upstream nodes and emits `renderContext`:

```javascript
// ctx assembly:
ctx = {
  amazonOrderId: pick(in0?.amazonOrderId, fromBuild?.amazonOrderId, fromReady?.amazonOrderId, fromManHTTP?.amazonOrderId),
  characterHash: pick(...),
  ...
}

// renderContext output (line 70):
orderId: ctx.amazonOrderId,   // ← WRONG: this emits root group ID as renderContext.orderId
```

`renderContext.orderId` flows into `Set Cover PNG Filenames/Keys` to construct `coverPngR2Key`. If it carries the root group ID, the cover PNG for both siblings lands at the same R2 path.

**Required fix — also pick per-book orderId and emit it correctly:**

```javascript
ctx = {
  orderId: pick(in0?.orderId, fromBuild?.orderId, fromReady?.orderId),           // per-book
  amazonOrderId: pick(in0?.amazonOrderId, fromBuild?.amazonOrderId, ...),        // root group
  characterHash: pick(...),
  ...
}
// renderContext:
orderId: ctx.orderId || ctx.amazonOrderId,   // per-book first
```

---

### 10. Normalize Inputs (3A Phase 1)1
**Tag: `NO CHANGE`**

Normalizes text inputs (child name, dedication, hometown, title). No R2 path construction. No changes needed.

---

### 11. Generate Cover HTML (AMAZON) / Generate Cover HTML (STANDARD)
**Tag: `NO CHANGE`**

Build HTML strings for PDFMonkey cover rendering. Asset URLs are constructed via backend proxy (`/api/assets/...`) using character-hash keyed R2 keys from `renderContext`. No order-scoped R2 paths in the HTML itself. No changes needed.

---

### 12. Route Cover by Order Type
**Tag: `NO CHANGE`**

Routing IF node. No path construction.

---

### 13. Generate Cover Image with PDFMonkey (3A)1
**Tag: `NO CHANGE`**

POSTs HTML to PDFMonkey for cover PNG rendering. The `meta._filename` uses `$json.coverPngFilename` which comes from `Set Cover PNG Filenames/Keys`. No order ID in the PDFMonkey request body. No changes needed.

---

### 14. Poll Cover Image (3A)1 / Download Cover Image (3A)1
**Tag: `NO CHANGE`**

Poll and download PDFMonkey cover PNG. No order-scoped paths. No changes needed.

---

### 15. Set Cover PNG Filenames/Keys
**Tag: `VERIFY` — Correct after `Resolve Asset Paths` fix**

```javascript
let orderId = src.orderId || src.amazonOrderId || src.AmazonOrderId || ...
const coverPngR2Key =
  src.coverPngR2Key ||
  src.coverImageR2Key ||
  `book-mvp-simple-adventure/orders/${orderId}/preview-images/${coverPngFilename}`;
```

Picks `src.orderId` (per-book) first before `src.amazonOrderId`. After the `Resolve Asset Paths` fix ensures `renderContext.orderId` carries the per-book ID, `src.orderId` will resolve correctly. No code change needed in this node.

---

### 16. Upload Cover Preview Image to R2 (3A)1
**Tag: `VERIFY` — Correct after upstream fixes**

```javascript
fileName: $json.coverPngR2Key
// → book-mvp-simple-adventure/orders/${perBookId}/preview-images/cover-spread.png
```

Per-book path after `Set Cover PNG Filenames/Keys` fix. Each sibling's cover PNG lands at a distinct R2 key. No code change needed.

---

### 17. Carry Cover Keys Forward1
**Tag: `NO CHANGE`**

Passes `orderId`, `coverPdfR2Key`, `coverPdfFilename` through. Reads `orderId` from `Set Cover PNG Filenames/Keys` — correct after upstream fix. No changes needed.

---

### 18. Generate Complete HTML (Amazon) / Generate Complete HTML (Standard)
**Tag: `NO CHANGE`**

Build interior page HTML for PDFMonkey. Asset URLs are backend proxy references. No order-scoped R2 paths. No changes needed.

---

### 19. Generate Page Preview Images
**Tag: `UPDATE` ⚠️ — Direct order-scoped R2 path construction**

```javascript
// CURRENT (WRONG):
const amazonOrderId = order.amazonOrderId || 'ORDER';
const r2Key = `book-mvp-simple-adventure/orders/${amazonOrderId}/preview-images/${filename}`;
```

Uses `amazonOrderId` for the R2 key. If `order.amazonOrderId` = root group ID, all page preview images for both siblings land under the same R2 prefix — collision.

**Required fix:**

```javascript
// FIX: use per-book orderId for R2 path
const orderId = order.orderId || order.amazonOrderId || 'ORDER';
const r2Key = `book-mvp-simple-adventure/orders/${orderId}/preview-images/${filename}`;
```

After `Build Assembly Input From Manifest` fix, `order.orderId` = per-book ID. Each sibling's page images land at their own distinct path.

---

### 20. Split in Batches (PNG Pages) / Merge / Merge1
**Tag: `NO CHANGE`**

Batch routing. No path construction.

---

### 21. Generate Page Image with PDFMonkey / Poll PDFMonkey Image until ready / Download Page Image from PDFMonkey
**Tag: `NO CHANGE`**

PDFMonkey submit, poll, and download per page. The `meta._filename` uses `$json.pageImageFilename` (e.g., `p01.png`). No order ID in PDFMonkey requests. No changes needed.

---

### 22. Carry Page Keys Forward (PNG)
**Tag: `VERIFY` — Correct after `Generate Page Preview Images` fix**

Derives `pageImageR2Key` from `gen0.pageImageR2Dir` (extracted from `gen0.pageImageR2Key`):

```javascript
const dir = gen0.pageImageR2Dir || gen0.pageImageR2Key.split('/').slice(0,-1).join('/') || `${gen0.orderR2BaseKey}/preview-images`;
const pageImageR2Key = `${dir}/${fileName}`;
```

`gen0.pageImageR2Key` comes from `Generate Page Preview Images`. After that fix, `dir` = `orders/${perBookId}/preview-images`. No code change needed here.

---

### 23. Upload Page Preview Image to R2 / Upload Cover Preview Image to R2 (3A)1
**Tag: `VERIFY` — Correct after upstream fixes**

S3 write nodes. `fileName` from `$json.pageImageR2Key` / `$json.coverPngR2Key` — per-book after fixes. Each sibling writes to its own path. No code changes needed.

---

### 24. Upload Preview Image to Cloudflare Images / Upload Preview Image to Cloudflare Images1
**Tag: `NO CHANGE`**

Upload to Cloudflare Images CDN. `orderId` is passed in metadata only (not used to construct any R2 path). Cloudflare assigns its own image IDs. No changes needed.

---

### 25. Store Cloudflare Images ID / Store Cloudflare Images ID1
**Tag: `NO CHANGE`**

Stores Cloudflare image ID and URL. `orderId` from metadata for logging context. No R2 path construction. No changes needed.

---

### 26. Wait 300ms (Throttle)
**Tag: `NO CHANGE`**

Rate-limit pause. No logic.

---

### 27. Collect Page Preview Images
**Tag: `NO CHANGE`**

Aggregates all page preview images from `Generate Page Preview Images`. Reads `base.amazonOrderId` for logging context only. The `pageImageR2Key` values carried per item are correctly scoped after upstream fix. No code change needed.

---

### 28. Build 3A Manifest
**Tag: `VERIFY` — Correct after upstream fixes**

```javascript
const amazonOrderId = base.amazonOrderId || base.orderId || inputs.orderId || null;
```

After `Build Assembly Input From Manifest` fix, `base.orderId` = per-book ID. But this node picks `base.amazonOrderId` first — same precedence issue.

However: the manifest key (`3-manifest.json`) is constructed in `Prep Manifest Upload (3)` from `data.orderId`, not here. The `amazonOrderId` field in the manifest content (`manifest.order.orderId = amazonOrderId`) records which order this manifest belongs to. After the `Build Assembly Input` fix, this should carry the per-book ID. The precedence here matches the same issue as `Build Assembly Input` — once `orderId` (per-book) flows correctly from upstream as `base.orderId`, this node is correct without code changes, though the fallback order (`amazonOrderId || orderId`) remains technically fragile.

**Low-risk verify:** Acceptable as-is if upstream fix ensures `base.orderId` = per-book ID and `base.amazonOrderId` = root group ID. For resilience, the fallback order could also be reversed here, but it is not strictly required given the upstream fix.

---

### 29. QA Gate (3A Phase 4) / Acceptance Tests (3A Phase 5)
**Tag: `NO CHANGE`**

Validates manifest structure, page counts, and image sizes. Reads from manifest content — no path construction. No changes needed.

---

### 30. Prep Manifest Upload (3)
**Tag: `VERIFY` — Correct after upstream fixes**

```javascript
const orderId = data.orderId;
const manifestKey = `book-mvp-simple-adventure/orders/${orderId}/manifests/3-manifest.json`;
```

Reads `data.orderId` directly. After `Build Assembly Input From Manifest` fix ensures `orderId` = per-book ID, each sibling gets its own manifest path. No code change needed.

---

### 31. Upload 3 Manifest to R2
**Tag: `VERIFY` — Correct after upstream fixes**

```javascript
fileName: $json.manifestKey
// → book-mvp-simple-adventure/orders/${perBookId}/manifests/3-manifest.json
```

Per-book after fixes. No code change needed.

---

### 32. Fetch and Merge Review Stages (3)
**Tag: `UPDATE` ⚠️ — Queries Supabase by wrong column for siblings**

Fetches the existing `review_stages` JSONB from Supabase to enable manual deep-merge (Supabase's `resolution=merge-duplicates` does not deep-merge JSONB):

```javascript
// CURRENT (WRONG):
const finalOrderId = input.orderId || input.amazonOrderId || ...;
// ...
uri: `${supabaseUrl}/rest/v1/orders?amazon_order_id=eq.${encodeURIComponent(finalOrderId)}`
```

The Supabase fetch queries by `amazon_order_id`. For siblings, `finalOrderId` would resolve to the root group ID (both siblings share it). The query returns the root group row's `review_stages`, not the per-book row's — incorrect for siblings.

After the Supabase Upsert fix (changing conflict column to `orderId`), each sibling has its own Supabase row. The fetch here must use `orderId=eq.perBookId` to find the right row.

**Required fix:**

```javascript
// FIX: query by per-book orderId, not root group amazonOrderId
const perBookId = input.orderId || null;
const fallbackId = input.amazonOrderId || extractedOrderId;
const queryId = perBookId || fallbackId;
const queryColumn = perBookId ? 'orderId' : 'amazon_order_id';  // prefer orderId
// ...
uri: `${supabaseUrl}/rest/v1/orders?${queryColumn}=eq.${encodeURIComponent(queryId)}&select=review_stages`
```

---

### 33. Supabase Upsert 3
**Tag: `UPDATE` ⚠️ — Critical collision bug for siblings**

```
URL: https://...supabase.co/rest/v1/orders?on_conflict=amazon_order_id

Body:
  const amazonOrderId = $json.amazonOrderId || $json.orderId || $json.manifest?.order?.amazonOrderId;
  orderId: amazonOrderId,          // writes root group ID into orderId column
  amazon_order_id: amazonOrderId,  // the conflict column (shared by all siblings)
```

**Two distinct bugs:**

**Bug 1 — Wrong conflict column:** `on_conflict=amazon_order_id` resolves conflicts using the `amazon_order_id` column, which all siblings in a group share (e.g., `114-7080737-5512234`). When Sibling A runs W3, it upserts by this shared key. When Sibling B runs W3, Supabase finds the same `amazon_order_id` row and overwrites Sibling A's W3 results with Sibling B's — data loss.

**Bug 2 — orderId body field writes wrong value:** `orderId: amazonOrderId` writes the root group ID into the `orderId` column, overwriting the per-book synthetic ID stored there by W0 and W2A. After this upsert, the Supabase row loses its per-book identity.

**Required fix:**

```javascript
// In the URL:
?on_conflict=orderId           // conflict on per-book ID (unique per sibling row)

// In the body:
const perBookId = $json.orderId;       // per-book synthetic ID from upstream
const rootGroupId = $json.amazonOrderId; // root group ID
// ...
orderId: perBookId,                    // preserves per-book row identity
amazon_order_id: rootGroupId,          // root group reference (unchanged)
```

---

### 34. Mark Previews Ready (3A status) / Log Assembly Results
**Tag: `NO CHANGE`**

Status update and logging nodes. No R2 path construction. No changes needed.

---

### 35. simulate STANDARD manifest / simulate build 3A manifest / Code in JavaScript
**Tag: `NO CHANGE`**

Test/manual trigger data nodes. Not part of production flow. No changes needed.

---

## Summary of Required Changes

| Node | Tag | Change Required |
|------|-----|-----------------|
| Webhook Trigger | `NO CHANGE` | — |
| Idempotency Check | `NO CHANGE` | — |
| Extract Manifest URL (3) | `VERIFY` | Correct precedence (orderId before amazonOrderId); no code change |
| Download 2B Manifest | `VERIFY` | Correct after upstream fixes |
| **Build Assembly Input From Manifest** | `UPDATE` ⚠️ | Reverse fallback: `order.orderId \|\| order.amazonOrderId`; propagate per-book `orderId` separately from root group `amazonOrderId` |
| Get Order Ready for Assembly | `VERIFY` | Requires W1.1 to send both orderId and amazonOrderId in trigger payload |
| Load Canonical Assets | `VERIFY` | Guard check only, not path construction; no code change |
| Load Story & Character Poses (3A) | `NO CHANGE` | Character-hash keyed paths |
| **Resolve Asset Paths (3A Phase 1)1** | `UPDATE` ⚠️ | Also pick per-book `orderId`; change `renderContext.orderId = ctx.amazonOrderId` → `ctx.orderId \|\| ctx.amazonOrderId` |
| Normalize Inputs (3A Phase 1)1 | `NO CHANGE` | Text normalization only |
| Generate Cover HTML (AMAZON/STANDARD) | `NO CHANGE` | Backend proxy URLs, no R2 path construction |
| Route Cover by Order Type | `NO CHANGE` | Routing only |
| Generate Cover Image with PDFMonkey | `NO CHANGE` | PDFMonkey API call |
| Poll Cover Image / Download Cover Image | `NO CHANGE` | PDFMonkey poll/download |
| Set Cover PNG Filenames/Keys | `VERIFY` | Picks `orderId` before `amazonOrderId`; correct after `Resolve Asset Paths` fix |
| Upload Cover Preview Image to R2 | `VERIFY` | Per-book path after upstream fixes |
| Carry Cover Keys Forward1 | `NO CHANGE` | Pass-through |
| Generate Complete HTML (Amazon/Standard) | `NO CHANGE` | Backend proxy URLs |
| **Generate Page Preview Images** | `UPDATE` ⚠️ | Change `amazonOrderId` → `orderId \|\| amazonOrderId` for R2 key: `orders/${orderId}/preview-images/` |
| Split in Batches / Merge / Merge1 | `NO CHANGE` | Routing |
| Generate Page Image with PDFMonkey | `NO CHANGE` | PDFMonkey API call |
| Poll PDFMonkey Image until ready | `NO CHANGE` | PDFMonkey poll |
| Download Page Image from PDFMonkey | `NO CHANGE` | PDFMonkey download |
| Carry Page Keys Forward (PNG) | `VERIFY` | Derives from upstream R2 key; correct after `Generate Page Preview Images` fix |
| Upload Page Preview Image to R2 | `VERIFY` | Per-book path after upstream fixes |
| Upload Preview Image to Cloudflare Images (×2) | `NO CHANGE` | Cloudflare CDN, not R2 |
| Store Cloudflare Images ID (×2) | `NO CHANGE` | Stores CDN IDs, no R2 paths |
| Wait 300ms | `NO CHANGE` | — |
| Collect Page Preview Images | `NO CHANGE` | Aggregation only |
| Build 3A Manifest | `VERIFY` | Content correct after upstream fixes; fragile fallback order acceptable |
| QA Gate / Acceptance Tests | `NO CHANGE` | Validation only |
| Prep Manifest Upload (3) | `VERIFY` | `data.orderId` = per-book after fixes; correct |
| Upload 3 Manifest to R2 | `VERIFY` | Per-book manifest path after fixes |
| **Fetch and Merge Review Stages (3)** | `UPDATE` ⚠️ | Change Supabase GET query from `amazon_order_id=eq.` to `orderId=eq.perBookId` |
| **Supabase Upsert 3** | `UPDATE` ⚠️ | (1) Change conflict column: `on_conflict=orderId`; (2) Body: write per-book ID to `orderId` and root group ID to `amazon_order_id` separately |
| Mark Previews Ready / Log Assembly Results | `NO CHANGE` | Status/logging only |
| simulate / test nodes | `NO CHANGE` | Test data only |

**Critical changes: 5** (Build Assembly Input From Manifest, Resolve Asset Paths, Generate Page Preview Images, Fetch and Merge Review Stages, Supabase Upsert 3)
**Verify: 10** (all dependent on upstream fixes being in place)
**No change: 22**

---

## Open Questions

1. **W1.1 trigger payload structure** — `Get Order Ready for Assembly` reads `amazonOrderId` from the incoming payload and `Load Canonical Assets` throws if it's missing. W1.1's Prep 3 Orders node must send both `orderId` (per-book) and `amazonOrderId` (root group) as separate fields in the W3 trigger payload. This must be confirmed when implementing the W1.1 fix.

2. **Supabase schema** — Changing `on_conflict` from `amazon_order_id` to `orderId` requires that the `orderId` column on the `orders` table has a `UNIQUE` constraint. This is implied by the schema (one row per book) but should be verified before the fix goes live.

3. **3-manifest downstream consumers** — W4 (Print Fulfillment) reads the 3-manifest to get preview image URLs. After the W3 fixes, the 3-manifest is stored at the per-book path and its `order.orderId` = per-book ID. W4's manifest fetch URL must use the per-book `orderId` to find the right manifest — this is the primary concern for the W4 audit.

4. **Cloudflare Images metadata** — The `orderId` field in Cloudflare Images upload metadata will be whatever W3 passes through. After the fix, this will be the per-book ID. The admin UI or review tools that query Cloudflare by `orderId` must be aware of this.
