# W4 PRODUCTION Print Fulfillment Audit
**Sibling Order N+ Support Audit**
**File:** `w4-PRODUCTION-Print_Fulfillment.json`
**Audited:** 2026-02-19
**Status:** Complete

---

## Workflow Overview

W4 is the final production workflow. It receives a trigger from W1.1 containing the `orderId` and 3-manifest reference, fetches the 3-manifest to get page preview image URLs, renders the interior pages and cover as PDFs via PDFMonkey, uploads both PDFs to R2, generates presigned R2 URLs, validates the PDFs with Lulu's API, submits the print job to Lulu, and writes the final status to Supabase.

**Simplified flow:**
```
Webhook (W4 Intake)
  → Config (W4)                              ← centralized secrets and R2 config
  → Validate & Normalize W4 Input            ← orderId, page URLs, PDF R2 keys
  → Hydrate Order Details (Supabase → 1-manifest → 3A)  ← shipping address, buyer info
  → Supabase: mark start                     ← PATCH by orderId (safe)
  → Ack (Phase 0-1)
  → [Interior PDF branch]
      → Build Pages HTML (8.75in)
      → Prepare PDFMonkey Data
      → Generate PDF with PDFMonkey → Wait → Reattach Context → Poll → Download → Upload PDF to R2
      → Prepare PDF Metadata for Merge
  → [Cover PDF branch]
      → Build Cover HTML
      → Prepare Cover PDFMonkey Data
      → Generate Cover PDF with PDFMonkey → Wait → Reattach Cover Context → Poll Cover → Download Cover → Upload Cover PDF to R2
      → Prepare Cover PDF Metadata for Merge
  → Supabase: set interior PDF              ← PATCH by orderId (safe)
  → Supabase: set cover PDF                 ← PATCH by orderId (safe)
  → Generate Signed URLs (R2 GET)           ← presign interior + cover PDF for Lulu
  → Decide Lulu Source URLs (NO PROXY)
  → Validate Interior (PRODUCTION)
  → Validate Cover (PRODUCTION)
  → Supabase: get existing order
  → Guard Lulu Submit
  → [PRODUCTION token + submit branch]
      → Lulu PRODUCTION: Get Token (Retry)
      → Extract Lulu Access Token (PRODUCTION)
      → Submit Lulu Print Job (PRODUCTION - BEARER, Retry)
  → Process Lulu Response
  → Build Supabase Update
  → Build 4-Manifest JSON
  → Upload 4-Manifest to R2
  → Supabase: mark submitted               ← POST upsert (CRITICAL BUG)
  → Notify: Sent to Print
  → Status Banner
  → Log Assembly Results
[Error path]
  → On Error (W4) → Build Error Context → IF has valid orderId → Build 4-Manifest JSON (Error) → Upload 4-Manifest (Error) to R2 → Supabase: mark error (PATCH, safe)
```

---

## Key Architectural Observation — W4 is Order-Scoped; Most Supabase Ops are Safe

All R2 write paths in W4 use `orderId` as the path segment. After the upstream chain of fixes (W1.1 → W4 receiving per-book `orderId`), every PDF and manifest lands at a distinct per-book R2 path.

The Supabase situation is more nuanced than W3. W4 uses **five** Supabase operations with two distinct patterns:

**Pattern A — PATCH with OR filter (4 nodes):** Correct for siblings.
```
?or=(orderId.eq.{{perBookId}},amazonOrderId.eq.{{perBookId}})
```
Since `perBookId` (e.g., `114-7080737-5512234-item-001`) is not a valid Amazon order ID, the `amazonOrderId.eq.perBookId` condition matches nothing. The `orderId.eq.perBookId` condition uniquely finds the sibling's row. No collision across siblings.

**Pattern B — POST upsert with on_conflict (1 node):** Broken for siblings. Only `Supabase: mark submitted` uses this pattern — and it has the same double bug found in W3.

---

## Node-by-Node Findings

---

### 1. Webhook (W4 Intake) / When clicking 'Execute workflow'
**Tag: `NO CHANGE`**

Entry points. Receives trigger payload from W1.1 Prep 4 Orders (or manual trigger). No path construction.

---

### 2. Config (W4) — PRODUCTION
**Tag: `NO CHANGE`**

Emits centralized `CONFIG` object (PDFMonkey token, Lulu credentials, Supabase config, R2 bucket/credentials, defaults). No order identity. No changes needed.

---

### 3. Validate & Normalize W4 Input
**Tag: `VERIFY` — Correct after W1.1 fix; one dependency noted**

This is W4's identity entry point. `orderId` resolution:

```javascript
const orderId = String(firstNonEmpty(
  body.orderId,         // ← per-book after W1.1 fix (first pick, correct)
  body.amazonOrderId,   // ← root group (fallback)
  ...
));
```

Correct precedence — picks per-book `orderId` first. After the W1.1 fix ensures `body.orderId` = per-book synthetic ID, this resolves correctly.

**All R2 path construction uses this `orderId`:**
```javascript
// 3-manifest fetch path (per-book after fixes):
`book-mvp-simple-adventure/orders/${orderId}/manifests/3-manifest.json`

// Interior PDF R2 key (per-book):
const pdfFilename = `interior_${orderId}.pdf`;
const pdfR2Key = `book-mvp-simple-adventure/orders/${orderId}/${pdfFilename}`;

// Cover PDF R2 key (per-book):
coverPdfR2Key = `book-mvp-simple-adventure/orders/${orderId}/cover_${orderId}.pdf`;
```

Each sibling gets its own distinct R2 prefix. No collision. No code change needed in this node after W1.1 fix.

**Dependency — `isAmazonOrder` detection:**

```javascript
const isAmazonOrder = !!(
  manifest.amazonOrderId ||
  body.amazonOrderId ||               // ← root group ID must be present
  orderIdMatchesAmazonPattern         // tests /^\d{3}-\d{7}-\d{7}$/ against orderId
);
const expectedPageCount = isAmazonOrder ? 17 : 15;
```

The regex `/^\d{3}-\d{7}-\d{7}$/` matches the root group format (`114-7080737-5512234`) but NOT the per-book synthetic format (`114-7080737-5512234-item-152767221930001`). For a sibling order, if W1.1 only sends `orderId` (per-book) and omits `amazonOrderId` (root group), both the regex test and `body.amazonOrderId` check fail → `isAmazonOrder = false` → `expectedPageCount = 15` instead of 17.

An Amazon sibling order with 17 pages would then fail W4 validation when it tries to extract 17 page URLs but `expectedPageCount` is 15. **W1.1's Prep 4 Orders node must send `amazonOrderId` (root group ID) as a separate field in the trigger payload** alongside the per-book `orderId`. This is a cross-workflow dependency, not a code change in W4 itself.

---

### 4. Hydrate Order Details (Supabase → 1-manifest → 3A)
**Tag: `VERIFY` — Correct after W0 fix**

Fetches shipping address and buyer info for the Lulu print job. Uses two sources in order of preference: Supabase row, then 1-manifest.

```javascript
// Supabase fetch (OR filter — safe):
`rest/v1/orders?limit=1&or=(amazon_order_id.eq.${orderId},orderId.eq.${orderId})`

// 1-manifest fetch:
const manifestKey = `book-mvp-simple-adventure/orders/${orderId}/manifests/1-manifest.json`;
```

The 1-manifest path uses `orderId` (per-book after fixes). After W0's fix stores the 1-manifest at the per-book path, this correctly retrieves the sibling's manifest. The shipping address is the same for all siblings in a group (same customer, same delivery address) — so even if shipping data was shared, the result would be correct. No code change needed.

---

### 5. Supabase: mark start
**Tag: `NO CHANGE` — PATCH with safe OR filter**

```
Method: PATCH
URL: .../rest/v1/orders?or=(orderId.eq.{{perBookId}},amazonOrderId.eq.{{perBookId}})
```

Marks the order as fulfillment started. Per-book `orderId` uniquely identifies the sibling row. The second OR condition (`amazonOrderId.eq.perBookId`) matches nothing since per-book IDs don't appear in the `amazon_order_id` column. Targets exactly one row. No changes needed.

---

### 6. Ack (Phase 0-1) / Respond to Webhook (Ack / Ack1)
**Tag: `NO CHANGE`**

Acknowledgement nodes. No path construction.

---

### 7. Build Pages HTML (8.75in)1
**Tag: `NO CHANGE`**

Builds interior pages HTML from `pageImageUrls` array. URLs are constructed in `Validate & Normalize W4 Input` from per-book R2 paths. No order-scoped path construction here. No changes needed.

---

### 8. Prepare PDFMonkey Data1 / Generate PDF with PDFMonkey1 / Wait1 / Reattach Context (PDFM)1
**Tag: `NO CHANGE`**

PDFMonkey interior PDF submission and context reattach. No order-scoped path construction. No changes needed.

---

### 9. Poll PDFMonkey until ready1
**Tag: `VERIFY` — Correct after W1.1 fix**

Constructs the interior PDF R2 key:

```javascript
const orderId = $json.orderId;    // per-book after W1.1 fix
const pdfFilename = $json.pdfFilename || `interior_${orderId}.pdf`;
const pdfR2Key = `book-mvp-simple-adventure/orders/${orderId}/${pdfFilename}`;
```

Per-book after upstream fix. Each sibling's interior PDF lands at a distinct R2 key. No code change needed.

---

### 10. Download PDF from PDFMonkey1 / Upload PDF to R2
**Tag: `VERIFY` — Correct after upstream fixes**

```
S3 write: fileName = $json.pdfR2Key → orders/${perBookId}/interior_${perBookId}.pdf
Bucket: little-hero-orders
```

Per-book path. No code change needed.

---

### 11. Prepare PDF Metadata for Merge1
**Tag: `NO CHANGE`**

Reassembles context after S3 node. Constructs `pdfR2Key` fallback from `ctx.orderId` (per-book). No changes needed.

---

### 12. Build Cover HTML
**Tag: `VERIFY` — Correct after upstream fixes**

```javascript
const orderId = j.orderId || j.amazonOrderId || 'unknown';   // picks orderId first
// Default cover ref:
`book-mvp-simple-adventure/orders/${orderId}/preview-images/cover-spread.png`
```

Per-book after upstream fix. Fetches the sibling's own cover preview image from W3. No code change needed.

---

### 13. Prepare Cover PDFMonkey Data / Generate Cover PDF with PDFMonkey / Wait (Cover PDF) / Reattach Cover Context (PDFM)
**Tag: `NO CHANGE`**

Cover PDF submission, wait, and context reattach. No order-scoped path construction. No changes needed.

---

### 14. Poll Cover PDFMonkey until ready
**Tag: `NO CHANGE`**

Polls PDFMonkey until cover PDF is ready. No R2 path construction in this node. No changes needed.

---

### 15. Download Cover PDF from PDFMonkey / Upload Cover PDF to R2
**Tag: `VERIFY` — Correct after upstream fixes**

```
S3 write: fileName = $json.coverPdfR2Key → orders/${perBookId}/cover_${perBookId}.pdf
Bucket: little-hero-orders
```

`coverPdfR2Key` set by `Validate & Normalize W4 Input` using per-book `orderId`. No code change needed.

---

### 16. Prepare Cover PDF Metadata for Merge
**Tag: `VERIFY` — Correct after upstream fixes**

```javascript
const orderId = ctx.orderId || ctx.amazonOrderId || null;   // picks orderId first
const pdfR2Key = ctx.coverPdfR2Key ||
  `book-mvp-simple-adventure/orders/${orderId}/${pdfFilename}`;
```

Per-book after fixes. No code change needed.

---

### 17. Supabase: set interior PDF / Supabase: set cover PDF
**Tag: `NO CHANGE` — PATCH with safe OR filter**

```
Method: PATCH
URL: .../rest/v1/orders?or=(orderId.eq.{{perBookId}},amazonOrderId.eq.{{perBookId}})
Body: { interiorPdfR2Key: ... } / { coverPdfR2Key: ... }
```

Same safe OR filter pattern as `Supabase: mark start`. Targets exactly one sibling row. No changes needed.

---

### 18. Generate Signed URLs (R2 GET)
**Tag: `VERIFY` — Correct after upstream fixes**

Generates AWS Signature V4 presigned GET URLs for the interior and cover PDFs stored in the private `little-hero-orders` R2 bucket. Reads `pdfR2Key` and `coverPdfR2Key` — both per-book after fixes. Each sibling's presigned URLs point to its own distinct PDFs. No code change needed.

---

### 19. Decide Lulu Source URLs (NO PROXY)
**Tag: `NO CHANGE`**

Validates that source URLs are presigned or public — not admin proxy URLs (which Lulu cannot access). Passes through `interiorSignedUrl` and `coverSignedUrl`. No path construction. No changes needed.

---

### 20. Validate Interior (PRODUCTION) / Validate Cover (PRODUCTION)
**Tag: `NO CHANGE`**

POST to Lulu's validation endpoints with the presigned source URLs and `podPackageId`. No order identity in the request. No changes needed.

---

### 21. Supabase: get existing order
**Tag: `NO CHANGE` — PATCH with safe OR filter**

```
Method: GET (via httpRequest)
URL: .../rest/v1/orders?limit=1&or=(orderId.eq.{{perBookId}},amazonOrderId.eq.{{perBookId}})
```

Fetches existing Supabase row to check for an existing Lulu job ID (idempotency guard). OR filter with per-book ID uniquely finds the sibling row. No code change needed.

---

### 22. Guard Lulu Submit
**Tag: `NO CHANGE`**

Checks if a Lulu job already exists for this order (idempotency). Reads `existingJobId` from the Supabase row. No path construction. No changes needed.

---

### 23. Lulu PRODUCTION: Get Token (Retry) / Extract Lulu Access Token (PRODUCTION) / Submit Lulu Print Job (PRODUCTION - BEARER, Retry)
**Tag: `NO CHANGE`**

Lulu authentication and print job submission. The print job payload references the presigned PDF URLs and shipping address — no order ID in the Lulu API request body that would cause collision. Each sibling submits its own independent Lulu job. No changes needed.

---

### 24. Process Lulu Response / Build Supabase Update
**Tag: `NO CHANGE`**

Normalizes the Lulu response and builds the Supabase patch object. No path construction. No changes needed.

---

### 25. Build 4-Manifest JSON
**Tag: `VERIFY` — Correct after upstream fixes**

```javascript
const key = `book-mvp-simple-adventure/orders/${j.orderId}/manifests/4-manifest.json`;
```

Uses `j.orderId` directly — per-book after upstream fixes. Each sibling's 4-manifest lands at a distinct R2 path. No code change needed.

---

### 26. Upload 4-Manifest to R2
**Tag: `VERIFY` — Correct after upstream fixes**

```
S3 write: fileName = $json.manifestKey → orders/${perBookId}/manifests/4-manifest.json
```

Per-book path. No code change needed.

---

### 27. Supabase: mark submitted
**Tag: `UPDATE` ⚠️ — Critical collision bug for siblings**

```
Method: POST
URL: .../rest/v1/orders?on_conflict=amazon_order_id
```

**Bug 1 — Wrong conflict column:** `on_conflict=amazon_order_id` resolves conflicts using the root group ID shared by all siblings. When Sibling A runs W4 and upserts with `amazon_order_id = 114-7080737-5512234`, it creates or updates that row. When Sibling B runs W4, Supabase finds the same `amazon_order_id` row and overwrites Sibling A's Lulu job ID, print status, and PDF URLs with Sibling B's — data loss.

**Bug 2 — Body writes per-book ID into amazon_order_id column:**

```javascript
const orderId = merged.orderId || merged.amazonOrderId || merged.amazon_order_id;
// Body:
amazon_order_id: orderId,   // writes per-book synthetic ID — WRONG
orderId: orderId,           // writes per-book synthetic ID — CORRECT
```

After upstream fixes, `merged.orderId` = per-book ID. Writing the per-book ID into the `amazon_order_id` column destroys the root group reference stored there by W0.

**Required fix:**

```javascript
// URL:
?on_conflict=orderId          // conflict on per-book ID (unique per sibling row)

// Body — needs both IDs separately:
const perBookId = merged.orderId;
const rootGroupId = merged.amazonOrderId || merged.amazon_order_id || perBookId;
// ...
orderId: perBookId,           // per-book identity (preserves sibling row)
amazon_order_id: rootGroupId, // root group reference (unchanged)
```

This requires `Validate & Normalize W4 Input` (or an upstream node) to propagate `amazonOrderId` (root group) as a separate field from `orderId` (per-book) — which is the same dependency already identified for the `isAmazonOrder` detection.

---

### 28. Notify: Sent to Print
**Tag: `NO CHANGE`**

POST to backend webhook with `orderId` (per-book after fixes). No R2 path construction. Backend must handle per-book IDs — same cross-system concern noted in W2B and W3. No code change needed in W4.

---

### 29. Status Banner (Env & Submit Path)
**Tag: `NO CHANGE`**

Diagnostic logging node. No path construction. No changes needed.

---

### 30. Log Assembly Results
**Tag: `NO CHANGE`**

Logging only. No changes needed.

---

### 31. On Error (W4) / Build Error Context
**Tag: `NO CHANGE`**

Error trigger and context builder. `Build Error Context` recovers `orderId` by searching all node run data, picking `findField(['orderId'])` (per-book) before `findField(['amazonOrderId', ...])` — correct precedence. Constructs error manifest key:

```javascript
const manifestKey = hasValidOrderId
  ? `book-mvp-simple-adventure/orders/${orderId}/manifests/4-manifest.json`
  : `book-mvp-simple-adventure/orders/unknown-order/manifests/4-manifest.json`;
```

Per-book after upstream fixes. No code change needed.

---

### 32. Build 4-Manifest JSON (Error) / Upload 4-Manifest (Error) to R2
**Tag: `VERIFY` — Correct after upstream fixes**

Error manifest key from `Build Error Context` — per-book. No code change needed.

---

### 33. IF has valid orderId (Error)
**Tag: `NO CHANGE`**

Routes based on `hasValidOrderId` flag. No path construction. No changes needed.

---

### 34. Supabase: mark error
**Tag: `NO CHANGE` — PATCH with safe OR filter**

```
Method: PATCH
URL: .../rest/v1/orders?or=(orderId.eq.{{perBookId}},amazonOrderId.eq.{{perBookId}})
```

Same safe OR filter pattern. Uniquely targets one sibling row. No code change needed.

---

### 35. Simulate Webhook / Simulate Merge / Lulu SANDBOX: Get Token / Submit Lulu Print Job (SANDBOX)
**Tag: `NO CHANGE`**

Test and sandbox nodes not in the production execution path. No changes needed.

---

## Summary of Required Changes

| Node | Tag | Change Required |
|------|-----|-----------------|
| Webhook (W4 Intake) | `NO CHANGE` | — |
| Config (W4) | `NO CHANGE` | — |
| **Validate & Normalize W4 Input** | `VERIFY` | Correct after W1.1 fix; W1.1 must send `amazonOrderId` separately for Amazon sibling `isAmazonOrder` detection and `expectedPageCount` to work correctly |
| Hydrate Order Details | `VERIFY` | 1-manifest path per-book after W0 fix |
| Supabase: mark start | `NO CHANGE` | PATCH OR filter — safe for siblings |
| Ack (Phase 0-1) | `NO CHANGE` | — |
| Build Pages HTML (8.75in)1 | `NO CHANGE` | — |
| Prepare PDFMonkey Data1 | `NO CHANGE` | — |
| Generate PDF with PDFMonkey1 | `NO CHANGE` | — |
| Wait1 / Reattach Context (PDFM)1 | `NO CHANGE` | — |
| Poll PDFMonkey until ready1 | `VERIFY` | `pdfR2Key` per-book after upstream fixes |
| Download PDF from PDFMonkey1 | `NO CHANGE` | — |
| Upload PDF to R2 | `VERIFY` | Per-book path after upstream fixes |
| Prepare PDF Metadata for Merge1 | `NO CHANGE` | — |
| Build Cover HTML | `VERIFY` | Picks `orderId` first; cover preview URL per-book after W3 fix |
| Prepare Cover PDFMonkey Data | `NO CHANGE` | — |
| Generate Cover PDF with PDFMonkey | `NO CHANGE` | — |
| Wait (Cover PDF) / Reattach Cover Context | `NO CHANGE` | — |
| Poll Cover PDFMonkey until ready | `NO CHANGE` | — |
| Download Cover PDF from PDFMonkey | `NO CHANGE` | — |
| Upload Cover PDF to R2 | `VERIFY` | Per-book `coverPdfR2Key` after upstream fixes |
| Prepare Cover PDF Metadata for Merge | `VERIFY` | Picks `orderId` first; correct |
| Supabase: set interior PDF | `NO CHANGE` | PATCH OR filter — safe for siblings |
| Supabase: set cover PDF | `NO CHANGE` | PATCH OR filter — safe for siblings |
| Generate Signed URLs (R2 GET) | `VERIFY` | Signs per-book R2 keys after upstream fixes |
| Decide Lulu Source URLs (NO PROXY) | `NO CHANGE` | — |
| Validate Interior / Validate Cover (PRODUCTION) | `NO CHANGE` | — |
| Supabase: get existing order | `NO CHANGE` | OR filter — safe |
| Guard Lulu Submit | `NO CHANGE` | — |
| Lulu PRODUCTION: Get Token / Extract Token | `NO CHANGE` | — |
| Submit Lulu Print Job (PRODUCTION) | `NO CHANGE` | — |
| Process Lulu Response / Build Supabase Update | `NO CHANGE` | — |
| Build 4-Manifest JSON | `VERIFY` | `j.orderId` per-book after upstream fixes |
| Upload 4-Manifest to R2 | `VERIFY` | Per-book manifest path |
| **Supabase: mark submitted** | `UPDATE` ⚠️ | (1) Change `on_conflict=amazon_order_id` → `on_conflict=orderId`; (2) Write root group ID to `amazon_order_id` body field; write per-book ID to `orderId` body field |
| Notify: Sent to Print | `NO CHANGE` | — |
| Status Banner / Log Assembly Results | `NO CHANGE` | — |
| On Error (W4) | `NO CHANGE` | — |
| Build Error Context | `NO CHANGE` | Picks `orderId` first; correct |
| Build 4-Manifest JSON (Error) / Upload 4-Manifest (Error) | `VERIFY` | Per-book path after upstream fixes |
| IF has valid orderId (Error) | `NO CHANGE` | — |
| Supabase: mark error | `NO CHANGE` | PATCH OR filter — safe for siblings |
| Sandbox / test nodes | `NO CHANGE` | — |

**Critical changes: 1** (Supabase: mark submitted — conflict column + body field)
**Important dependency: 1** (W1.1 must send `amazonOrderId` as a separate field for Amazon `isAmazonOrder` detection)
**Verify: 10** (all dependent on upstream chain being fixed)
**No change: 40+**

---

## Open Questions

1. **W1.1 trigger payload** — `Validate & Normalize W4 Input` must receive `amazonOrderId` (root group ID) as a separate field to correctly detect `isAmazonOrder` for Amazon sibling orders. The W1.1 Prep 4 Orders fix must include this field in the webhook payload alongside `orderId` (per-book). Without it, Amazon sibling books would be assembled with 15 pages instead of 17.

2. **Supabase `orderId` uniqueness** — Changing `on_conflict=amazon_order_id` → `on_conflict=orderId` requires that the `orderId` column has a `UNIQUE` constraint in the `orders` table. This should already be the case (per-book rows are unique), but must be confirmed before the fix goes live.

3. **Lulu job per sibling** — Each sibling submits its own independent Lulu print job. This means a 2-sibling order results in 2 Lulu print jobs, likely 2 separate shipments to the same address. This is expected behavior for the initial sibling implementation but may warrant a future optimization (single Lulu job with quantity=2 if specs match).

4. **4-manifest downstream** — W4 is the terminal workflow. The 4-manifest is stored for audit purposes only. No downstream workflow reads it. No cross-workflow concern.
