# Issue: W4 final PDFs sometimes have half-rendered pages

**Status:** 🟡 In Progress (Layer 1b implemented, Layers 2–3 pending)  
**Priority:** Critical  
**Created:** 2026-02-27  
**Last Updated:** 2026-02-27

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

### Layer 1b: Presigned R2 URLs — replace proxy with direct R2 fetch (planned)

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

### Layer 2: QA subworkflow — automated pre-print render check

**Goal:** After W4 generates final PDFs but before Lulu submit, verify every page rendered correctly. If any page fails, stop the workflow and flag the order.

#### 2a. New backend endpoint

**Path:** `POST /api/render/qa-check-pdf`

**Input:**

```json
{
  "orderId": "SIB-E2E-...-item-001",
  "pdfR2Key": "book-mvp-simple-adventure/orders/.../interior_....pdf",
  "expectedPageKeys": [
    "book-mvp-simple-adventure/orders/.../preview-images/p00.png",
    "book-mvp-simple-adventure/orders/.../preview-images/p01.png"
  ]
}
```

**Logic (pseudocode):**

```text
download PDF from R2 (pdfR2Key)
save to temp file

render each page to low-res PNG using Poppler pdftoppm:
  pdftoppm -png -r 100 input.pdf output_prefix
  produces output_prefix-1.png, output_prefix-2.png, ...

validate page count:
  if rendered page count != expectedPageKeys.length:
    return { passed: false, reason: 'page_count_mismatch', ... }

for each page index:
  download expected source image from R2 (expectedPageKeys[i])
  resize expected image to match rendered page dimensions
  compute similarity score (pixel diff or perceptual hash)
  compute white-space percentage (near-white pixel ratio)

  if similarity < HARD_THRESHOLD (e.g. 0.85 SSIM):
    mark page as failed
  if white_space > WHITE_THRESHOLD (e.g. 60%):
    mark page as failed

clean up temp files

return {
  passed: (no failed pages),
  pageCount: N,
  scores: [ { page, similarity, whiteSpace, passed } ],
  failedPages: [ page numbers ],
  reason: (first failure reason or 'all_passed')
}
```

**Dependencies:**

- `poppler-utils` system package (provides `pdftoppm`) — install on Vercel build or deploy container
- `sharp` (already in project devDependencies) — for image resize + pixel comparison
- No external API calls

**Implementation notes:**

- Render at 100 DPI (fast, ~612×612px per 8.5" page — enough for defect detection)
- Use `sharp` to load both images, resize to same dimensions, compute raw pixel buffer diff
- Similarity = 1 - (diffPixels / totalPixels) with a tolerance band per pixel (e.g. ±15 RGB)
- White-space = count of pixels where R > 240 AND G > 240 AND B > 240, divided by total
- Early-exit on first hard failure for speed
- Store failure evidence (rendered page PNG) to R2 under `orders/{orderId}/qa/` only on failure
- Total expected time: 5–15 seconds per book (15–17 pages at 100 DPI)

**Poppler availability:**

- Vercel serverless: Poppler is NOT pre-installed. Options:
  - (a) Use a Lambda layer or custom Docker runtime with poppler-utils
  - (b) Run QA endpoint on a separate lightweight service (e.g. the existing renderer container)
  - (c) Use `pdf-poppler` npm wrapper (bundles a Poppler binary for Linux)
  - (d) Fall back to `pdfjs-dist` + `canvas` (pure JS, no system dep, slower)
- **Recommendation:** Try `pdf-poppler` npm package first (simplest). If Vercel rejects the binary, fall back to `pdfjs-dist` + `canvas`.

#### 2b. New n8n subworkflow: `w4-sw-qa-render-check`

**Trigger:** Execute Workflow (called by W4 main)

**Input contract (from W4):**

```json
{
  "orderId": "...",
  "pdfR2Key": "...",
  "coverPdfR2Key": "...",
  "expectedPageKeys": ["..."],
  "expectedCoverKey": "...",
  "backendUrl": "https://admin.littleherolabs.com"
}
```

**Nodes:**

```text
1. Validate QA Input
   - Confirm orderId, pdfR2Key, expectedPageKeys present

2. QA Check Interior PDF
   - POST backendUrl + '/api/render/qa-check-pdf'
   - body: { orderId, pdfR2Key, expectedPageKeys }
   - timeout: 120s

3. QA Check Cover PDF
   - POST backendUrl + '/api/render/qa-check-pdf'
   - body: { orderId, pdfR2Key: coverPdfR2Key, expectedPageKeys: [expectedCoverKey] }
   - timeout: 60s

4. Merge Results
   - Combine interior + cover QA results

5. Build QA Response
   - Return compact result to W4:
     {
       qaPassed: boolean,
       interiorPassed: boolean,
       coverPassed: boolean,
       failedPages: [],
       reason: string,
       scores: []
     }
```

**No large image payloads returned to W4.** Only JSON metrics + pass/fail.

#### 2c. W4 integration point

Insert QA gate in W4 main workflow **after** `Upload PDF to R2` + `Upload Cover PDF to R2` and **before** `Generate Signed URLs (R2 GET)`.

```text
New nodes in W4 (between upload and Lulu submit):

1. Build QA Input
   - Assemble orderId, pdfR2Key, coverPdfR2Key, expectedPageKeys
     (expectedPageKeys derived from pageImageUrls used in Build Pages HTML,
      stripped of cache-bust query params)

2. Execute Workflow: w4-sw-qa-render-check
   - Pass QA input
   - Wait for response

3. IF QA Passed
   - true branch → continue to Generate Signed URLs → Lulu submit (existing path)
   - false branch → QA Failed Error Handler (new)

4. QA Failed Error Handler (false branch)
   - Set Supabase fields:
       execution_status: 'error'
       error_type: 'print_qa_failed'
       error_message: reason + failed page list
       workflow_step: 'print_fulfillment'
   - Upload QA manifest to R2:
       orders/{orderId}/manifests/4-qa-fail-manifest.json
   - Notify backend (POST /api/webhooks/print-qa-failed)
   - Stop workflow (do NOT proceed to Lulu)
```

**Pseudocode (W4 QA gate):**

```text
after uploading interior + cover PDFs to R2:
  build QA input from current context
  call w4-sw-qa-render-check subworkflow

  if qaResult.qaPassed:
    continue to signed URL generation and Lulu submit
  else:
    write to supabase:
      execution_status = 'error'
      error_type = 'print_qa_failed'
      error_message = qaResult.reason + ' | pages: ' + qaResult.failedPages
    upload qa-fail manifest to R2
    notify backend webhook
    stop (do not submit to Lulu)
```

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

### Phase 0: Prerequisites

1. Verify `poppler-utils` or `pdf-poppler` npm package works in deployment environment.
2. Verify `sharp` is available for image comparison (already in `devDependencies`).

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

Estimated: 30 minutes

**Prerequisite:** None — the backend endpoint `POST /api/render/presign-page-assets` already exists and is production-ready.

**Steps:**

1. ✅ **Renamed `Inline Interior Assets` → `Presign Interior Assets` in both W4 workflows.**
   - `jsCode` calls `/api/render/presign-page-assets` with full `pages_html` in single request
   - 30s timeout, 3-attempt retry with jitter, 6-hour signed URL TTL

2. ✅ **Renamed `Inline Cover Assets` → `Presign Cover Assets` in both W4 workflows.**
   - Same pattern for `cover_html`

3. ✅ **Connection keys and upstream references renamed in both files.**

4. ⬜ **Test:** Import updated workflows to n8n, run a single order through W4:
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter(max = 200) { return Math.floor(Math.random() * max); }

let lastErr = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const res = await http({
      method: 'POST',
      url,
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter(max = 200) { return Math.floor(Math.random() * max); }

let lastErr = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const res = await http({
      method: 'POST',
      url,
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

### Phase 2: QA endpoint + subworkflow (Layer 2)

Estimated: 4–6 hours

1. Build `POST /api/render/qa-check-pdf` backend endpoint.
2. Build `w4-sw-qa-render-check` n8n subworkflow.
3. Add QA gate nodes to W4 main workflow (Build QA Input → Execute Subworkflow → IF Passed → branch).
4. Add QA Failed Error Handler branch.
5. Test: run orders with known-good PDFs (should pass). Simulate a bad PDF (should fail and flag).

### Phase 3: Backend status tag (Layer 3)

Estimated: 1–2 hours

1. Add `PRINT_QA_FAILED` to `DisplayStatus` enum.
2. Add display mapping in `status-display.ts`.
3. Add label in `StatusLabels`.
4. Create `POST /api/webhooks/print-qa-failed` endpoint.
5. Test: verify admin panel shows "Print QA Failed" badge for flagged orders.

### Phase 4: Full matrix validation

Run all four test scenarios (Amazon 2-book, Amazon 3-book, D2C 2-book, D2C 3-book):
- Verify Layer 1b prevents half-render defects.
- Verify Layer 2 catches intentionally degraded test PDFs.
- Verify Layer 3 correctly tags and surfaces failures in admin panel.

---

## QA thresholds (starting values, tune after first runs)

| Metric | Threshold | Action |
|---|---|---|
| Page count mismatch | exact match required | hard fail |
| Per-page similarity (SSIM or pixel-diff) | < 0.85 | hard fail |
| Per-page white-space % | > 60% | hard fail |
| All pages pass both checks | — | proceed to Lulu |

These thresholds should be tuned after the first batch of test runs. Log all scores to make tuning data-driven.

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
- Verify QA subworkflow runs and returns pass.
- Verify no partial/blank/cut-off render in final interior or cover.
- Verify one correct print submit behavior for sibling groups.
- Intentionally degrade one PDF and verify QA catches it and flags the order.

## Acceptance criteria

- [ ] ~~Layer 1a deployed: base64 inlining~~ — ❌ Failed (OOM). Superseded by Layer 1b.
- [x] Layer 1b deployed: W4 sends presigned-R2-URL HTML to PDFMonkey for both interior and cover. (Implemented 2026-02-27 — needs import to n8n + live test)
- [ ] Layer 2 deployed: QA subworkflow runs after PDF upload and before Lulu submit.
- [ ] Layer 3 deployed: `print_qa_failed` error type visible in admin panel with "Print QA Failed" badge.
- [ ] 0 half-rendered pages in W4 final PDFs across all 4 scenario types.
- [ ] QA gate correctly blocks print submission when a defect is detected.
- [ ] Flagged orders show clear error message with failed page numbers and scores.
- [ ] Reliability holds across repeated runs (not a one-off pass).

## Notes

- Goal is to keep automation end-to-end with the QA gate as the safety net.
- Print safety is higher priority than full automation; if QA gate is not reliable, add human review gate.
- QA subworkflow is intentionally separate from W4 to avoid payload bloat and allow independent versioning.
- No AI/vision model needed unless deterministic checks prove insufficient.
