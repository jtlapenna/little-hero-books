# Issue: W4 final PDFs sometimes have half-rendered pages

**Status:** 🟡 In Progress (Layer 1b complete + auth fix, Layer 2 planning complete, Layer 3 pending)  
**Priority:** Critical  
**Created:** 2026-02-27  
**Last Updated:** 2026-02-28

## Description

Some recent orders printed with a half-rendered page in the final PDF output from W4.  
W3 previews/assets were created correctly, so the failure appears to happen during W4 PDFMonkey rendering/capture for interior or cover PDF generation.

## Known facts

- W3 outputs looked correct for affected orders (images/assets exist and appear complete).
- Defect appears in W4 final PDF stage, not asset creation stage.
- Similar reliability issue was previously addressed in W3 with cache-busting and render hardening.
- Prior reference: `docs/_ongoing-issues-list/_completed/21-w3-pdfmonkey-images-not-fully-rendered-unreliable.md`.

## Impact

- Customer-facing print defect risk (wrong/partial pages in shipped books).
- Reprint/refund cost risk.
- Operational trust risk: previews may look good while print file is wrong.
- Release risk for sibling aggregation volume if reliability is not deterministic.

## Step-by-step pseudocode (investigation + fix path)

```text
collect failing order ids
for each failing order:
  compare w3 preview assets vs w4 final pdf pages
  confirm defect first appears in w4 output
  collect timing/log evidence around pdfmonkey create/poll/download nodes

implement w4 hardening changes (cache-bust + deterministic readiness checks)
run controlled tests across amazon and d2c, 2-item and 3-item sibling groups
if any partial-render defect remains:
  split w4 into render-only and submit-to-print workflows
  add manual review gate between them
approve print submission only when human review passes
```

## Primary hypotheses

1. **W4 still uses URL-fetched images at render time**  
   PDFMonkey may capture before all remote assets are fully loaded.

2. **Cache/stale content at final render stage**  
   W4 HTML may not force fresh fetches for all image URLs.

3. **Timing/load race under concurrency**  
   Under load, image fetch latency increases and render capture occurs too early.

4. **Final-stage behavior differs from W3 protections**  
   W3 hardening does not automatically guarantee W4 reliability.

## Affected workflows/files

- `docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/w4-PRODUCTION-Print_Fulfillment.json`
- `docs/n8n-workflow-files/finals/w4-PRODUCTION-Print_Fulfillment.json`
- `docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/w4.1-Sibling-Aggregation.json`
- Reference prior fix pattern:
  `docs/_ongoing-issues-list/_completed/21-w3-pdfmonkey-images-not-fully-rendered-unreliable.md`

## Implementation plan

Three layers, applied in order. Each layer is independently valuable.

### Layer 1a: Inline images via base64 — ❌ FAILED (OOM)

**Goal:** PDFMonkey never fetches images over the network during final PDF render.

**What was built:** Two n8n Code nodes (`Inline Interior Assets`, `Inline Cover Assets`) inserted into both W4 workflows. Each calls `POST /api/render/inline-page-assets` to replace `/api/assets/...` URLs with `data:image/...;base64,...`.

**Why it failed:**

1. **503 (Vercel response limit):** All 15-17 page images base64-encoded in a single response exceeded Vercel's 4.5MB response body limit. Fixed by splitting to per-page processing.
2. **n8n OOM:** Even with per-page processing, the assembled `pages_html` containing 15-17 base64-encoded print-quality PNGs (total ~30-80MB of string data) exceeded n8n Cloud's per-execution memory limit. The `Prepare PDFMonkey Data1` node crashed with "n8n may have run out of memory."

**Conclusion:** Base64 inlining is not viable for W4 interior pages (15-17 high-res images). It works for the cover (1 image) but the interior payload is too large for n8n Cloud memory.

---

### Layer 1b: Presigned R2 URLs — replace proxy with direct R2 fetch — COMPLETE

**Goal:** PDFMonkey fetches images directly from R2's edge instead of through the Vercel serverless proxy, eliminating cold starts, proxy timeouts, and the extra network hop that causes half-renders.

**Existing asset:** `back-end/src/app/api/render/presign-page-assets/route.ts` already does exactly this:
- Takes HTML containing `/api/assets/...` URLs
- Generates signed R2 GET URLs for each asset (6-hour TTL by default)
- Replaces proxy URLs with signed R2 URLs
- Returns rewritten HTML (same size as input — no image data transferred)

This is a **lightweight URL rewrite** — no image bytes are loaded into memory. Response is ~the same size as the input HTML.

**What changes vs current state:**

| Aspect | Current (proxy) | With presigned URLs |
|---|---|---|
| PDFMonkey fetches from | `admin.littleherolabs.com/api/assets/...` | `little-hero-orders.<account>.r2.cloudflarestorage.com/...?X-Amz-Signature=...` |
| Network hops | PDFMonkey → Vercel → R2 → Vercel → PDFMonkey | PDFMonkey → R2 → PDFMonkey |
| Vercel cold start risk | Yes (503 under load) | None (Vercel not involved at fetch time) |
| Caching layers | Vercel edge + CDN (stale risk) | None (direct R2, signed URL is unique per request) |
| n8n memory impact | Negligible (URLs only, no image data) | Negligible (same) |

**W4 interior branch — update existing `Inline Interior Assets` Code node:**

Rename to `Presign Interior Assets`. Change endpoint from `inline-page-assets` to `presign-page-assets`.

```text
Node: Presign Interior Assets
Type: n8n Code node (already exists, update jsCode)
Input: $json (contains pages_html from Build Pages HTML)
Logic:
  1. POST $json.pages_html to
     backendUrl + '/api/render/presign-page-assets'
     body: { html: $json.pages_html, expiresInSeconds: 21600 }
     timeout: 30s (lightweight URL rewrite, no image data)
  2. Replace $json.pages_html with response.html
  3. Pass all other context through unchanged
Output: same shape, pages_html now has signed R2 URLs instead of /api/assets/ proxy URLs
```

**W4 cover branch — update existing `Inline Cover Assets` Code node:**

Rename to `Presign Cover Assets`. Same pattern.

```text
Node: Presign Cover Assets
Type: n8n Code node (already exists, update jsCode)
Input: $json (contains cover_html from Build Cover HTML)
Logic:
  1. POST $json.cover_html to
     backendUrl + '/api/render/presign-page-assets'
     body: { html: $json.cover_html, expiresInSeconds: 21600 }
     timeout: 30s
  2. Replace $json.cover_html with response.html
  3. Pass all other context through unchanged
Output: same shape, cover_html now has signed R2 URL instead of /api/assets/ proxy URL
```

**Pseudocode (both nodes share the same pattern):**

```text
html = input.pages_html (or input.cover_html)
backendUrl = derive from CONFIG.defaults.trimIn.assetBase
url = backendUrl + '/api/render/presign-page-assets'

for attempt 1..3:
  response = POST url { html, expiresInSeconds: 21600 }
  if response.html exists:
    output html = response.html
    return with all other fields unchanged
  sleep with backoff + jitter

throw error with orderId (stops W4)
```

**No new backend code needed.** The endpoint already exists and is production-ready:
- `back-end/src/app/api/render/presign-page-assets/route.ts`
- Uses `getSignedUrlForObject()` from `back-end/src/lib/r2-service.ts`
- Handles both `R2_ORDERS_BUCKET` and `R2_PUBLIC_BUCKET`
- 6-hour default TTL (configurable via `expiresInSeconds`)
- Supports up to 80 asset keys per request

**Why this works without OOM:**
- The endpoint only rewrites URLs — no image data is fetched or transferred
- The response is the same size as the input HTML (~10-20KB)
- n8n only carries URL strings, never base64 image data
- PDFMonkey still fetches images, but directly from R2 (fast, no proxy)

**Risk assessment:**

| Risk | Likelihood | Mitigation |
|---|---|---|
| R2 itself is slow | Low (Cloudflare edge) | 6-hour TTL gives PDFMonkey ample time |
| PDFMonkey render timeout before images load | Medium (same as current, but reduced) | Layer 2 QA catches failures |
| Signed URL expired before PDFMonkey renders | Very low (6-hour TTL) | Configurable, can increase |
| Vercel endpoint for presigning fails | Low (lightweight operation) | 3-attempt retry in n8n node |

**Expected improvement over current state:**
- Eliminates Vercel proxy as a bottleneck (the 503 errors we saw)
- Eliminates CDN caching issues (signed URLs are unique)
- Reduces fetch latency by ~50% (1 hop instead of 2)
- Does NOT guarantee 100% prevention — PDFMonkey may still time out on individual image fetches, but the probability is significantly lower

**Estimated likelihood of solving the half-render issue: 6-7/10** (with Layer 2 QA as safety net, effective reliability becomes 9-10/10).

---

### Layer 2: QA gate — automated pre-print render check (DETAILED PLAN)

**Goal:** After W4 generates final PDFs and uploads them to R2, but before Lulu submit, verify every page rendered correctly. If any page fails, stop the workflow and flag the order.

**Design philosophy:**
- Use only existing dependencies (`pdfjs-dist` v5.4.394, `sharp` v0.34.5)
- No system-level dependencies (no Poppler — not available on Vercel)
- No external APIs or vision models
- Lightweight enough to run within Vercel's 60s serverless timeout and 1GB memory
- Smart about what we're detecting: the failure mode is specifically "image didn't load before PDFMonkey captured the page"

---

#### 2a. What the defect looks like in a PDF

When PDFMonkey captures HTML to PDF and an image hasn't fully loaded:
- The PDF page **exists** (page count is correct)
- But the image area is **white/blank** or **partially rendered**
- The page's embedded image data is either **absent** or **much smaller** than expected
- A fully rendered 8.75x8.75" page at print quality has a large image (~200-500KB compressed)
- A half-rendered page may have 0KB, a few KB, or a truncated image

**What this means for detection:** Page count alone is not sufficient. We need per-page content verification.

---

#### 2b. Detection strategy — two-tier approach

**Tier 1: Structural PDF analysis (fast, no rendering needed)**

Uses `pdfjs-dist` to parse the PDF and inspect each page's draw operations without rendering.

```text
For each page in the PDF:
  1. getOperatorList() → list of all draw commands
  2. Count OPS.paintImageXObject operations (image draws)
  3. For each image operation, look up the image in page resources:
     - Get image width, height, and data byte length
  4. Check: does this page have at least 1 image operation?
  5. Check: is the image data size above a minimum threshold?
  6. Check: do image dimensions match expected print dimensions?
```

**Tier 1 catches:** Missing images (page has no image XObject), truncated images (image data undersized), wrong dimensions (resize artifact).

**Tier 1 cost:** ~1-3 seconds total. No image rendering, just PDF structure parsing.

**Tier 2: White-space analysis (catches partial renders)**

Uses `pdfjs-dist` image extraction + `sharp` pixel analysis.

```text
For each page in the PDF:
  1. Extract the raw image bitmap from the page's image XObject
     (using pdfjs-dist page.objs API — returns width, height, RGBA data)
  2. Feed the raw pixel buffer into sharp
  3. Resize to 200x200 (thumbnail — fast to analyze)
  4. Count pixels where R > 240 AND G > 240 AND B > 240 (near-white)
  5. white_space_ratio = white_pixels / total_pixels
  6. If white_space_ratio > threshold (e.g., 0.40) → flag page
```

**Tier 2 catches:** Partially rendered images where the image exists but has large white areas (the main failure mode we've observed).

**Important:** This QA does **not** do strict source-vs-output pixel comparison against original page PNGs. It verifies embedded page image integrity and white-space anomalies in the final PDF itself.

**Tier 2 cost:** ~3-8 seconds total. Image extraction is lightweight (no canvas rendering). Sharp thumbnail analysis is fast.

**Why NOT full page rendering:** Rendering a full PDF page to a canvas image requires a `canvas` npm package (native module, Vercel compatibility issues). Extracting just the image XObject from each page avoids this entirely since our pages ARE full-bleed images — the XObject IS the page content.

**Why NOT image-to-image comparison against source:** The source images (from `pageImageUrls`) go through PDFMonkey's HTML-to-PDF pipeline which adds compression, color space conversion, and slight quality changes. A pixel-diff comparison would produce false positives. White-space detection is more robust for this specific defect.

---

#### 2c. New backend endpoint: `POST /api/render/qa-check-pdf`

**Path:** `back-end/src/app/api/render/qa-check-pdf/route.ts`

**Auth:** Same pattern as `presign-page-assets` — Bearer token when `BACKEND_API_TOKEN` is set.

**Input:**

```json
{
  "orderId": "114-5264473-5909869",
  "pdfR2Key": "book-mvp-simple-adventure/orders/114-5264473-5909869/interior_114-5264473-5909869.pdf",
  "expectedPageCount": 15,
  "type": "interior"
}
```

For cover:

```json
{
  "orderId": "114-5264473-5909869",
  "pdfR2Key": "book-mvp-simple-adventure/orders/114-5264473-5909869/cover_114-5264473-5909869.pdf",
  "expectedPageCount": 1,
  "type": "cover"
}
```

**Response (pass):**

```json
{
  "passed": true,
  "orderId": "114-5264473-5909869",
  "type": "interior",
  "pageCount": 15,
  "expectedPageCount": 15,
  "totalPdfBytes": 4521033,
  "avgBytesPerPage": 301402,
  "pages": [
    { "page": 1, "hasImage": true, "imageBytes": 312044, "whiteSpaceRatio": 0.08, "passed": true },
    { "page": 2, "hasImage": true, "imageBytes": 289011, "whiteSpaceRatio": 0.12, "passed": true }
  ],
  "failedPages": [],
  "reason": "all_passed",
  "durationMs": 4200
}
```

**Response (fail):**

```json
{
  "passed": false,
  "orderId": "114-5264473-5909869",
  "type": "interior",
  "pageCount": 15,
  "expectedPageCount": 15,
  "totalPdfBytes": 2100000,
  "avgBytesPerPage": 140000,
  "pages": [
    { "page": 1, "hasImage": true, "imageBytes": 312044, "whiteSpaceRatio": 0.08, "passed": true },
    { "page": 5, "hasImage": true, "imageBytes": 14200, "whiteSpaceRatio": 0.72, "passed": false,
      "failReasons": ["white_space_ratio 0.72 > 0.40", "image_bytes 14200 < 50000"] }
  ],
  "failedPages": [5],
  "reason": "page_5_failed: white_space_ratio 0.72 > 0.40, image_bytes 14200 < 50000",
  "durationMs": 5100
}
```

**Implementation pseudocode:**

```text
POST /api/render/qa-check-pdf
  verify auth (Bearer token)
  parse body: { orderId, pdfR2Key, expectedPageCount, type }
  validate: all fields present, expectedPageCount > 0

  // Download PDF from R2
  pdfResponse = getObject(R2_ORDERS_BUCKET, pdfR2Key)
  pdfBuffer = await pdfResponse.arrayBuffer()
  totalPdfBytes = pdfBuffer.byteLength

  // Quick size sanity check
  MIN_BYTES_PER_PAGE = 30000  // ~30KB minimum per page
  if totalPdfBytes < expectedPageCount * MIN_BYTES_PER_PAGE:
    return { passed: false, reason: 'pdf_too_small', ... }

  // Load with pdfjs-dist
  pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) }).promise

  // Tier 1: Page count check
  if pdf.numPages != expectedPageCount:
    return { passed: false, reason: 'page_count_mismatch', ... }

  results = []
  failedPages = []

  for pageNum = 1 to pdf.numPages:
    page = await pdf.getPage(pageNum)
    ops = await page.getOperatorList()

    // Tier 1: Check for image paint operations
    imageOps = ops.fnArray indices where fn == OPS.paintImageXObject
    hasImage = imageOps.length > 0

    imageBytes = 0
    whiteSpaceRatio = 0.0

    if hasImage:
      // Get the image object name from the first paintImageXObject arg
      imageName = ops.argsArray[imageOps[0]][0]

      // Tier 1: Get image metadata from page resources
      // pdfjs-dist exposes image data through page.objs after rendering operators
      imageObj = await page.objs.get(imageName)  // { width, height, data: Uint8ClampedArray }
      imageBytes = imageObj?.data?.byteLength || 0

      // Tier 2: White-space analysis (only if image data available)
      if imageObj?.data && imageObj.width && imageObj.height:
        // Use sharp to create thumbnail from raw RGBA pixels
        thumbnail = await sharp(Buffer.from(imageObj.data), {
          raw: { width: imageObj.width, height: imageObj.height, channels: 4 }
        }).resize(200, 200).raw().toBuffer()

        // Count near-white pixels (RGBA, 4 bytes per pixel)
        whiteCount = 0
        totalPixels = thumbnail.length / 4
        for i = 0 to totalPixels:
          r = thumbnail[i*4], g = thumbnail[i*4+1], b = thumbnail[i*4+2]
          if r > 240 AND g > 240 AND b > 240:
            whiteCount++
        whiteSpaceRatio = whiteCount / totalPixels

    // Evaluate pass/fail for this page
    failReasons = []
    if NOT hasImage:
      failReasons.push('no_image_on_page')
    if imageBytes < IMAGE_BYTES_THRESHOLD (50000):
      failReasons.push('image_bytes too small')
    if whiteSpaceRatio > WHITE_SPACE_THRESHOLD (0.40):
      failReasons.push('white_space_ratio too high')

    pagePassed = failReasons.length == 0
    results.push({ page: pageNum, hasImage, imageBytes, whiteSpaceRatio, passed: pagePassed, failReasons })
    if NOT pagePassed:
      failedPages.push(pageNum)

  passed = failedPages.length == 0
  return { passed, orderId, type, pageCount, expectedPageCount, totalPdfBytes, pages: results, failedPages, reason, durationMs }
```

**Dependencies (all already installed):**
- `pdfjs-dist` v5.4.394 — PDF parsing + operator list + image extraction
- `sharp` v0.34.5 — thumbnail creation + pixel analysis
- `@/lib/r2-client` — download PDF from R2

**No new npm packages needed. No system dependencies. No external APIs.**

**pdfjs-dist Node.js setup note:** Must configure worker properly for Node.js environment:

```typescript
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = ''; // disable worker in serverless
```

**Performance estimate:**
- PDF download from R2: ~500ms (same region)
- PDF parse + page iteration: ~500ms
- Per-page operator list + image extraction: ~200ms x 15 pages = ~3s
- Per-page sharp thumbnail + white-space: ~100ms x 15 pages = ~1.5s
- **Total: ~5-7 seconds for a 15-page interior PDF**
- Well within Vercel's 60s timeout

**Memory estimate:**
- PDF buffer: ~5-8MB
- pdfjs-dist document object: ~20MB (includes decompressed streams)
- Per-page image extraction: ~3MB (RGBA for one page at a time, released between pages)
- Sharp thumbnail: ~160KB (200x200x4)
- **Peak: ~30MB** — well within Vercel's 1GB limit

**Edge cases and mitigations:**

| Edge case | Detection | Handling |
|---|---|---|
| PDF is corrupted / can't parse | pdfjs-dist throws | Catch error, return `{ passed: false, reason: 'pdf_parse_error' }` |
| Page has multiple images (overlays) | Multiple paintImageXObject ops | Sum all image bytes, check largest image |
| Image is present but fully white (loaded blank) | White-space ratio catches it | Tier 2 detects even if Tier 1 says "hasImage: true" |
| PDF pages use vector graphics instead of images | No paintImageXObject found | Would flag as "no_image_on_page" — correct for our books |
| pdfjs-dist image extraction fails for a page | Try/catch around objs.get() | Fall back to Tier 1 only (image bytes from stream), log warning |
| Vercel cold start adds latency | First request slower | 3-attempt retry in n8n node absorbs this |
| R2 key doesn't exist | getObject throws 404 | Return `{ passed: false, reason: 'pdf_not_found' }` |

---

#### 2d. n8n integration — direct backend call (no subworkflow)

**Revised approach:** After analysis, a separate n8n subworkflow adds complexity without benefit. The QA check is a single HTTP call per PDF. We'll add the QA gate directly in W4's main workflow using Code nodes.

**Integration point:** After `Merge (after interior + meta)1` and before `Generate Signed URLs (R2 GET)`.

**Current connection chain:**
```text
Merge (after interior + meta)1 → Generate Signed URLs (R2 GET) → Decide Lulu Source URLs
```

**New connection chain:**
```text
Merge (after interior + meta)1 → QA Check Interior PDF → QA Check Cover PDF → IF QA Passed
  → true:  Generate Signed URLs (R2 GET) → ... (existing path)
  → false: QA Failed Error Handler → STOP
```

**New nodes (4 total per W4 workflow):**

**Node 1: `QA Check Interior PDF`** (Code node)

```text
Input: merged context from Merge node (contains pdfR2Key, expectedPageCount, orderId, CONFIG)
Logic:
  derive backendUrl from CONFIG.defaults.trimIn.assetBase
  POST backendUrl + '/api/render/qa-check-pdf'
  body: { orderId, pdfR2Key, expectedPageCount, type: 'interior' }
  headers: { Authorization: Bearer CONFIG.backendApiToken }
  timeout: 45s, 2-attempt retry
Output: { ...item, interiorQA: response }
```

**Node 2: `QA Check Cover PDF`** (Code node)

```text
Input: output from QA Check Interior (contains coverPdfR2Key, orderId, CONFIG, interiorQA)
Logic:
  derive backendUrl from CONFIG.defaults.trimIn.assetBase
  POST backendUrl + '/api/render/qa-check-pdf'
  body: { orderId, pdfR2Key: coverPdfR2Key, expectedPageCount: 1, type: 'cover' }
  headers: { Authorization: Bearer CONFIG.backendApiToken }
  timeout: 30s, 2-attempt retry
Output: { ...item, interiorQA, coverQA: response }
```

**Node 3: `IF QA Passed`** (IF node)

```text
Condition: $json.interiorQA.passed === true AND $json.coverQA.passed === true
True branch → Generate Signed URLs (R2 GET)
False branch → QA Failed Error Handler
```

**Node 4: `QA Failed Error Handler`** (Code node)

```text
Input: merged context with interiorQA and coverQA results
Logic:
  1. Build error message from QA results:
     - List failed pages with scores
     - Include both interior and cover results
  2. POST to Supabase (direct REST):
     UPDATE orders SET
       execution_status = 'error',
       error_type = 'print_qa_failed',
       error_message = <built message>,
       workflow_step = 'print_fulfillment'
     WHERE amazon_order_id = orderId
  3. Upload QA failure manifest to R2:
     key: book-mvp-simple-adventure/orders/{orderId}/manifests/4-qa-fail-manifest.json
     body: { orderId, interiorQA, coverQA, timestamp }
  4. POST to backend webhook /api/webhooks/print-qa-failed (Layer 3)
Output: stops workflow (throw or return empty to prevent downstream execution)
```

**Why not a subworkflow:**
- A subworkflow adds an extra workflow to maintain, version, and debug
- The QA check is just 2 HTTP calls + 1 IF + 1 error handler = 4 nodes
- Keeping it inline means QA results are immediately available in the same execution context
- n8n memory is not a concern — QA responses are ~2KB JSON, no image data

**Data available at integration point:**

At the `Merge (after interior + meta)1` output, the following fields are present:
- `orderId` — the Amazon order ID
- `pdfR2Key` — e.g., `book-mvp-simple-adventure/orders/{orderId}/interior_{orderId}.pdf`
- `coverPdfR2Key` — e.g., `book-mvp-simple-adventure/orders/{orderId}/cover_{orderId}.pdf`
- `expectedPageCount` — from `Validate & Normalize W4 Input` (15 or 17)
- `CONFIG.backendApiToken` — added in Layer 1b auth fix
- `CONFIG.defaults.trimIn.assetBase` — for deriving backendUrl

---

### Layer 3: Backend error tag and admin visibility

**Goal:** Orders that fail print QA are clearly tagged and visible in the admin panel.

#### 3a. New `error_type` value: `print_qa_failed`

Fits existing pattern — `error_type` is a free-text string column already used for `stuck_processing`. No migration needed.

**When set:** W4 QA gate fails (Layer 2c, false branch).

**Supabase row after QA failure:**

```text
execution_status: 'error'
error_type: 'print_qa_failed'
error_message: 'Interior page 5 failed similarity check (score 0.42, threshold 0.85). 1 of 15 pages failed.'
workflow_step: 'print_fulfillment'
status: 'action_required'  (calculated by status-service.ts — already maps execution_status='error' → ACTION_REQUIRED)
```

#### 3b. New `DisplayStatus` badge: `PRINT_QA_FAILED`

Add to `back-end/src/constants/statuses.ts`:

```typescript
// In DisplayStatus enum:
PRINT_QA_FAILED = 'print_qa_failed'
```

Add display mapping in `status-display.ts`:

```text
if execution_status === 'error' && error_type === 'print_qa_failed':
  return DisplayStatus.PRINT_QA_FAILED
```

Add label in `StatusLabels`:

```text
[DisplayStatus.PRINT_QA_FAILED]: 'Print QA Failed'
```

**Admin panel effect:** Order shows red "Print QA Failed" badge. Admin can inspect the error message (which pages failed, scores), review the W3 previews vs the generated PDF, and either:
- Re-run W4 (which re-generates PDFs and re-runs QA)
- Manually approve if the defect is acceptable

#### 3c. New backend webhook: `POST /api/webhooks/print-qa-failed`

**Purpose:** Receives QA failure notification from W4 and ensures Supabase status is correct.

**Input:**

```json
{
  "orderId": "...",
  "reason": "...",
  "failedPages": [5],
  "scores": [...]
}
```

**Logic:**

```text
look up order by orderId
set execution_status = 'error'
set error_type = 'print_qa_failed'
set error_message = reason
recalculate status (triggers status-service.ts → ACTION_REQUIRED)
```

This is a safety net — W4 also writes directly to Supabase, but the webhook ensures the backend status calculation runs.

---

## Implementation sequence

### Phase 0: Prerequisites — ✅ SATISFIED

1. ~~Verify `poppler-utils` or `pdf-poppler` npm package works in deployment environment.~~ Not needed. Using `pdfjs-dist` (already installed v5.4.394) for PDF parsing and image extraction.
2. ✅ `sharp` is available (v0.34.5 in `dependencies`).
3. ✅ `pdfjs-dist` is available (v5.4.394 in `dependencies`).
4. ✅ R2 client (`getObject`) available for downloading PDFs.
5. ✅ Auth pattern established (Bearer token via `CONFIG.backendApiToken`).

### Phase 1a: Inline hardening via base64 (Layer 1a) — ❌ FAILED 2026-02-27

Estimated: 1–2 hours | Actual: ~3 hours (including 503 hotfix)

1. ✅ Added `Inline Interior Assets` Code node to both W4 workflows.
2. ✅ Added `Inline Cover Assets` Code node to both W4 workflows.
3. ❌ Live test failed — 503 (Vercel response limit), then OOM (n8n memory limit).

**Failure timeline:**
1. Initial implementation sent all pages in one request → 503 (Vercel 4.5MB response limit).
2. Hotfixed to per-page processing → resolved 503.
3. Per-page processing still assembled ~30-80MB of base64 strings → n8n OOM crash.

**Conclusion:** Base64 inlining is not viable for W4 interior pages at print resolution.

---

### Phase 1b: Presigned R2 URLs (Layer 1b) — ✅ IMPLEMENTED 2026-02-27

Estimated: 30 minutes | Actual: ~1 hour (including auth fix)

**Steps:**

1. ✅ **Renamed `Inline Interior Assets` → `Presign Interior Assets` in both W4 workflows.**
   - `jsCode` calls `/api/render/presign-page-assets` with full `pages_html` in single request
   - 30s timeout, 3-attempt retry with jitter, 6-hour signed URL TTL

2. ✅ **Renamed `Inline Cover Assets` → `Presign Cover Assets` in both W4 workflows.**
   - Same pattern for `cover_html`

3. ✅ **Connection keys and upstream references renamed in both files.**

4. ✅ **Auth fix (2026-02-27):** Initial deployment returned 401 because `presign-page-assets` requires `Authorization: Bearer <BACKEND_API_TOKEN>` in production. Fixed by:
   - Adding `backendApiToken` to CONFIG node in both W4 workflows
   - Updating presign node `jsCode` to read `item.CONFIG.backendApiToken` and pass as `Authorization` header

5. ⬜ **Test:** Import updated workflows to n8n, run a single order through W4:
   - Verify n8n logs show presign endpoint called (no 503, no OOM)
   - Verify PDFMonkey receives HTML with `r2.cloudflarestorage.com` URLs (not `/api/assets/`)
   - Verify final PDF has all pages fully rendered
   - Verify cover PDF renders correctly

**jsCode for `Presign Interior Assets`:**

```javascript
const item = $input.first()?.json || {};
const pagesHtml = item.pages_html;
if (!pagesHtml || typeof pagesHtml !== 'string') {
  throw new Error('[Presign Interior Assets] Missing pages_html');
}

const backendUrl = (item.CONFIG?.defaults?.trimIn?.assetBase || 'https://admin.littleherolabs.com/api/assets/')
  .replace(/\/api\/assets\/?$/, '');
const url = `${backendUrl}/api/render/presign-page-assets`;
const http = this.helpers.httpRequest;
const token = item.CONFIG?.backendApiToken || '';
const headers = token ? { Authorization: `Bearer ${token}` } : {};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter(max = 200) { return Math.floor(Math.random() * max); }

let lastErr = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const res = await http({
      method: 'POST',
      url,
      headers,
      body: { html: pagesHtml, expiresInSeconds: 21600 },
      json: true,
      timeout: 30000,
    });
    if (res?.html && typeof res.html === 'string') {
      return [{ json: { ...item, pages_html: res.html } }];
    }
    throw new Error('Presign endpoint returned no html');
  } catch (e) {
    lastErr = e;
    if (attempt < 3) await sleep(300 + attempt * 300 + jitter());
  }
}

const orderId = item.orderId || item.amazonOrderId || 'UNKNOWN';
throw new Error(`[Presign Interior Assets] Failed after 3 attempts (orderId=${orderId}): ${lastErr?.message || lastErr}`);
```

**jsCode for `Presign Cover Assets`:**

```javascript
const item = $input.first()?.json || {};
const coverHtml = item.cover_html;
if (!coverHtml || typeof coverHtml !== 'string') {
  throw new Error('[Presign Cover Assets] Missing cover_html');
}

const backendUrl = (item.CONFIG?.defaults?.trimIn?.assetBase || 'https://admin.littleherolabs.com/api/assets/')
  .replace(/\/api\/assets\/?$/, '');
const url = `${backendUrl}/api/render/presign-page-assets`;
const http = this.helpers.httpRequest;
const token = item.CONFIG?.backendApiToken || '';
const headers = token ? { Authorization: `Bearer ${token}` } : {};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter(max = 200) { return Math.floor(Math.random() * max); }

let lastErr = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const res = await http({
      method: 'POST',
      url,
      headers,
      body: { html: coverHtml, expiresInSeconds: 21600 },
      json: true,
      timeout: 30000,
    });
    if (res?.html && typeof res.html === 'string') {
      return [{ json: { ...item, cover_html: res.html } }];
    }
    throw new Error('Presign endpoint returned no html');
  } catch (e) {
    lastErr = e;
    if (attempt < 3) await sleep(300 + attempt * 300 + jitter());
  }
}

const orderId = item.orderId || item.amazonOrderId || 'UNKNOWN';
throw new Error(`[Presign Cover Assets] Failed after 3 attempts (orderId=${orderId}): ${lastErr?.message || lastErr}`);
```

**Files to modify:**
- `docs/n8n-workflow-files/finals/w4-PRODUCTION-Print_Fulfillment.json` (2 nodes)
- `docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/w4-PRODUCTION-Print_Fulfillment.json` (2 nodes)

**No backend changes needed.** Endpoint already exists and is tested.

### Phase A: Backend QA endpoint only (build + calibration)

Estimated: 2–3 hours

**Objective:** Ship and validate `POST /api/render/qa-check-pdf` in isolation before touching W4 routing.

**Tasks:**
1. Create `back-end/src/app/api/render/qa-check-pdf/route.ts`.
2. Implement Tier 1 checks:
   - page count exact match
   - image draw presence per page
   - per-page image byte minimum
   - total PDF size minimum
3. Implement Tier 2 check:
   - white-space ratio from thumbnail pixels (`sharp`)
4. Add Bearer auth (same pattern as `presign-page-assets`).
5. Add structured response payload (`passed`, `reason`, `failedPages`, per-page metrics, `durationMs`).
6. Add failure reasons for all expected conditions (`pdf_not_found`, `pdf_parse_error`, `page_count_mismatch`, etc.).
7. Validate endpoint manually with:
   - one known-good interior PDF
   - one intentionally bad/truncated PDF
   - one cover PDF

**Go/No-Go criteria to exit Phase A:**
- Good PDFs consistently return `passed: true`.
- Synthetic bad PDFs consistently return `passed: false` with correct failed page(s).
- P95 response time stays below 10 seconds for interior PDFs.
- No memory/timeout errors in backend logs.

---

### Phase B: W4 QA gate integration (both workflows)

Estimated: 1–2 hours

**Objective:** Insert QA gate nodes into W4 only after endpoint behavior is verified.

**Tasks per workflow (`finals` and `sibling`):**
1. Add `QA Check Interior PDF` node after `Merge (after interior + meta)1`.
2. Add `QA Check Cover PDF` node after interior QA node.
3. Add `IF QA Passed` node.
4. Add `QA Failed Error Handler` node on false branch.
5. Rewire path:
   - `Merge (after interior + meta)1` → `QA Check Interior` → `QA Check Cover` → `IF QA Passed`
   - true branch → `Generate Signed URLs (R2 GET)` (existing path)
   - false branch → `QA Failed Error Handler` → stop before Lulu submit
6. In QA nodes, derive `backendUrl` from `CONFIG.defaults.trimIn.assetBase` and use `CONFIG.backendApiToken`.
7. In error handler, set:
   - `execution_status = 'error'`
   - `error_type = 'print_qa_failed'`
   - `error_message` with reason + failed pages
8. Write QA failure manifest to R2 (`orders/{orderId}/manifests/4-qa-fail-manifest.json`).

**Go/No-Go criteria to exit Phase B:**
- Known-good order passes QA and proceeds to Lulu.
- Injected bad PDF fails QA and never reaches Lulu submit.
- Both workflows (`finals`, `sibling`) behave identically.

---

### Phase C: Backend status visibility (Layer 3)

Estimated: 1–2 hours

**Objective:** Ensure QA failures are clear in admin.

**Tasks:**
1. Add `PRINT_QA_FAILED` to `DisplayStatus` enum.
2. Add mapping logic in `status-display.ts`.
3. Add label in `StatusLabels` (`Print QA Failed`).
4. Add `POST /api/webhooks/print-qa-failed` as backend safety-net update path.
5. Validate badge and message visibility in order detail and list views.

**Go/No-Go criteria to exit Phase C:**
- Failed QA orders show `Print QA Failed` badge in admin.
- Error message contains actionable detail (pages + reason).

---

### Phase D: Full matrix validation (release gate)

Run all four test scenarios:
1. Amazon, 2 items
2. Amazon, 3+ items
3. D2C, 2 items
4. D2C, 3+ items

**Required checks:**
- Layer 1b prevents proxy-related rendering issues.
- Layer 2 catches intentionally degraded PDFs.
- Layer 3 surfaces failures correctly in admin.
- No false-positive QA blocks across repeated good runs.

---

## QA thresholds (starting values, tune after first runs)

| Check | Metric | Threshold | Action | Tier |
|---|---|---|---|---|
| Page count | `pdf.numPages` vs `expectedPageCount` | exact match | hard fail | 1 |
| PDF total size | `totalPdfBytes` | < `expectedPageCount * 30KB` | hard fail | 1 |
| Per-page image presence | `hasImage` (paintImageXObject exists) | must be true | hard fail | 1 |
| Per-page image byte size | `imageBytes` from XObject | < 50,000 bytes | hard fail | 1 |
| Per-page white-space ratio | white pixels / total pixels (200x200 thumbnail) | > 0.40 (40%) | hard fail | 2 |

**Threshold rationale:**
- **50KB image minimum:** A fully rendered 8.75x8.75" page image at print quality compresses to 200-500KB. 50KB catches truncated images while allowing for compression variation.
- **40% white-space:** Our page images are full-bleed illustrations with rich colors. Even the lightest page (e.g., snow scene) should have < 30% white. 40% threshold provides margin while catching half-rendered pages (which are typically 50-100% white).
- **30KB/page PDF minimum:** An empty PDF page is ~1-2KB. A 15-page PDF under 450KB total almost certainly has missing content.

All scores are logged in the QA response for data-driven threshold tuning after the first batch of real-world runs.

---

## Decision gate

- If Layer 1b alone eliminates defects across repeated full-matrix runs, Layer 2 remains as a safety net (still deploy it).
- If Layer 1b + Layer 2 together catch all defects before print, keep single-workflow W4 with QA gate.
- If defects still reach Lulu despite both layers, split W4 into W4A (render) + W4B (submit) with human review gate.

## Test plan requirements

Run all four scenarios and capture evidence for each:

1. Amazon, 2 items
2. Amazon, 3 items
3. D2C, 2 items
4. D2C, 3 items

For each scenario:

- Verify presigned HTML sent to PDFMonkey (signed R2 URLs, no `/api/assets/` proxy URLs in payload).
- Verify QA check nodes run inline and return pass (check n8n execution log for QA results).
- Verify no partial/blank/cut-off render in final interior or cover.
- Verify one correct print submit behavior for sibling groups.
- Intentionally upload a truncated PDF to R2 and verify QA catches it, flags the order as `print_qa_failed`, and prevents Lulu submission.

## Acceptance criteria

- [x] ~~Layer 1a deployed: base64 inlining~~ — ❌ Failed (OOM). Superseded by Layer 1b.
- [x] Layer 1b deployed: W4 sends presigned-R2-URL HTML to PDFMonkey for both interior and cover. (Implemented 2026-02-27, auth fix 2026-02-27 — needs import to n8n + live test)
- [ ] Layer 2 deployed: `POST /api/render/qa-check-pdf` endpoint operational. QA gate nodes in both W4 workflows. Interior + cover checked before Lulu submit.
- [ ] Layer 3 deployed: `print_qa_failed` error type visible in admin panel with "Print QA Failed" badge.
- [ ] 0 half-rendered pages in W4 final PDFs across all 4 scenario types.
- [ ] QA gate correctly blocks print submission when a defect is detected.
- [ ] Flagged orders show clear error message with failed page numbers and scores.
- [ ] Reliability holds across repeated runs (not a one-off pass).

## Notes

- Goal is to keep automation end-to-end with the QA gate as the safety net.
- Print safety is higher priority than full automation; if QA gate is not reliable, add human review gate.
- QA checks are inline in W4 (not a subworkflow) — simpler to maintain, no payload bloat since QA responses are ~2KB JSON.
- No AI/vision model needed — the two-tier deterministic approach (structural + white-space) directly targets the known failure mode.
- All QA scores are logged for threshold tuning. Initial thresholds are conservative and should be tightened after real-world data.
- No new npm packages required. `pdfjs-dist` + `sharp` (both already installed) handle everything.
- The `page.objs.get()` API in pdfjs-dist may behave differently across versions. If image extraction fails for a page, the endpoint falls back to Tier 1 only (structural checks) and logs a warning rather than hard-failing.
