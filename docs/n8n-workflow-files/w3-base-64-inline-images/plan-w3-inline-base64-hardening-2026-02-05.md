# Plan: W3 PDFMonkey Base64 Inline Images — Hardening & Reliability

**Created:** 2026-02-05  
**Scope:** `w3-AMAZON-PNG_Assembly-inline-image-assets.json` (and the NB3 variant once we port fixes)  
**Goal:** Make the base64 inline-assets flow as close to “flawless” as we can: correct page output, no partial renders, minimal memory bloat, predictable timing, clear failures.

---

## Problem statement

We generate per-page PNGs in W3 by sending `pageHtml` to PDFMonkey’s Image Template API. When `pageHtml` references external images by URL, PDFMonkey can capture before all assets finish loading → partial renders.

The inline strategy fixes this by converting `/api/assets/...` URLs into `data:image/...;base64,...` (data-URI) so PDFMonkey does **zero** HTTP fetches at render time.

**Confirmed in docs:** PDFMonkey explicitly supports base64 data-URI images and notes it avoids HTTP requests. See: `https://docs.pdfmonkey.io/how-tos/images`.

---

## Key constraints & failure modes (must design around)

- **n8n memory / execution-data bloat**: base64 strings can be huge; if we keep them in `$json` across nodes, execution data balloons and can cause slowdowns/timeouts.
- **Per-node time limits** (especially n8n cloud): long-running polling or large HTTP bodies can exceed limits.
- **Backend inline endpoint limits**: `/api/render/inline-page-assets` currently caps **input** HTML length (5MB) and number of distinct `/api/assets/...` keys (50). Note: the **output** HTML (after inlining) can be much larger than the input; the endpoint does not currently enforce an output-size cap.
- **Backend inline behavior on partial failures**: if an individual asset fetch fails during inlining, the backend logs a warning and **leaves that URL unchanged** (it does not fail the request). This can reintroduce “external fetch at render time” unless the workflow enforces strictness.
- **PDFMonkey request size/time**: sending giant JSON bodies (base64-heavy HTML) can exceed practical limits even if it “usually works.”

---

## Current workflow (critical path)

**Main chain for each page item:**

1. `Generate Page Preview Images` (Code) → emits one item per page with `pageHtml` (fragment)
2. `Split in Batches (PNG Pages)` (batchSize=1)
3. `Inline Page Assets` (Code, runOnceForEachItem) → replaces `/api/assets/...` with data-URIs inside `pageHtml`
4. `Generate Page Image with PDFMonkey` (HTTP) → POST document (payload uses `JSON.stringify($json.pageHtml)`)
5. `Poll PDFMonkey Image until ready` (Code, runOnceForEachItem) → loops until `download_url`
6. `Download Page Image from PDFMonkey` (HTTP, file response) → binary PNG
7. `Carry Page Keys Forward (PNG)` (Code) → merges filename/key context
8. Upload to R2 (+ optional Cloudflare Images) → collect images → build manifest

---

## High-priority fixes (recommended)

### 1) Remove cross-run bugs: fix `Carry Page Keys Forward (PNG)` hardcoded run index

**Why:** In `Carry Page Keys Forward (PNG)`, the node reads:

```js
const gen0  = ($items('Generate Page Preview Images', 0, 0)?.[0]?.json) ?? {};
const poll0 = ($items('Poll PDFMonkey Image until ready', 0, 0)?.[0]?.json) ?? {};
```

That hardcodes `runIndex = 0`, which is unsafe inside a batched loop. Later pages can accidentally pick up the **first page’s** context (and can also propagate large `pageHtml` strings).

**Fix strategy:** Rewrite `Carry Page Keys Forward (PNG)` to be **pure**: only use the current item’s `json` and `binary`, no `$items()` calls.

#### Pseudocode (step-by-step)

```text
for each incoming item:
  j = item.json
  binMeta = first binary attachment metadata
  fileName = binMeta.fileName OR j.pageImageFilename OR "p00.png"

  dir = dirname(j.pageImageR2Key) OR dirname(j.pageImageR2Dir) OR fallback based on amazonOrderId
  pageImageR2Key = dir + "/" + fileName

  output json = { ...j, pageImageFilename:fileName, pageImageR2Key }
  output binary = item.binary
```

#### Implementation notes
- Keep this node’s output schema identical for downstream nodes: `pageImageR2Key`, `pageImageFilename`, `pageNumber`, `amazonOrderId`, plus the PNG binary.
- This eliminates the most obvious correctness risk.

---

### 2) Default `useImgBackgrounds` safely (avoid unexpected false)

**Why:** In `Generate Page Preview Images`, the workflow currently sets:

```js
const useImgBackgrounds = Boolean(order.useImgBackgrounds);
```

If `order.useImgBackgrounds` is missing, this becomes `false`, which can alter template rendering behavior and potentially reintroduce partial/background issues.

**Fix strategy:** Default to `true` unless explicitly `false` (matching NB3 behavior).

#### Pseudocode

```text
if order.useImgBackgrounds === false:
  useImgBackgrounds = false
else:
  useImgBackgrounds = true (or Boolean provided value)
```

---

### 3) Drop large fields ASAP (base64 hygiene)

**Why:** Even though batching is size=1, the current flow can carry base64-heavy `pageHtml` across multiple nodes. In particular, `Poll PDFMonkey Image until ready` spreads the entire input:

```js
return { json: { ...input, pdfMonkeyImageDocumentId: docId, pageImageDownloadUrl: downloadUrl } }
```

If `input.pageHtml` contains data-URIs, that keeps the large string alive downstream.

**Fix strategy:** Introduce a strict “keep only what we need” behavior immediately after we no longer need `pageHtml`.

Two acceptable approaches (choose one):

#### Option A (preferred): modify `Poll PDFMonkey Image until ready` output to omit `pageHtml`

##### Pseudocode

```text
input = current item json
extract docId and downloadUrl
remove big fields: pageHtml, pages_html, page_css, any debug html strings
return json with only small routing fields + docId + downloadUrl
```

##### Keep fields (minimum recommended)
- `amazonOrderId` / `orderId`
- `pageNumber`
- `pageImageFilename`
- `pageImageR2Key`
- `pdfMonkeyImageDocumentId`
- `pageImageDownloadUrl`
- (optional) `backendUrl` (for logs), `useImgBackgrounds`

#### Option B: add a dedicated “Strip Large Fields” Code node after Poll (or after Download)

Same logic, but isolated for clarity.

---

### 4) Make inlining failures explicit (avoid silent fallback)

**Why:** `Inline Page Assets` currently logs and passes through original HTML on failure:

```js
console.warn('[Inline Page Assets] ... failed, passing through original HTML')
return [{ json: item }];
```

That means partial renders can reappear with no hard failure.

**Fix strategy:** Decide policy:

- **Policy 1 (strict, recommended for “flawless”):** If inlining fails, **throw** so the run fails loudly and is retried/triaged.
- **Policy 2 (lenient):** Allow fallback but set an explicit flag: `inlineAssetsApplied=false`, and surface it in manifest / logs / review stage.

#### Pseudocode (strict)

```text
call inline endpoint
if fails or returned html missing:
  throw error "Inline failed" (include orderId/pageNumber)
else:
  pageHtml = inlined html
  inlineAssetsApplied = true
```

---

### 5) Add retry/backoff to the inline call (stability under transient R2/backend issues)

**Why:** Inlining depends on backend + R2; transient failures happen. The backend route already retries R2 reads, but the n8n call itself currently does not retry inside the Code node.

**Fix strategy:** Add 2–3 attempts in `Inline Page Assets` Code node with small jitter.

#### Pseudocode

```text
for attempt in 1..3:
  try POST inline endpoint (timeout 60s)
  if success return inlined
  sleep (500ms + attempt*500ms + jitter)
throw error after 3 fails
```

---

## Medium-priority fixes / improvements

### 6) Ensure we are inlining only what we intend (avoid accidental huge assets)

**Risk:** If `pageHtml` contains references to very large assets (or fonts), the inlined HTML can exceed:
- backend limit (5MB input), or
- practical PDFMonkey payload sizes.

**Mitigations:**
- Keep `pageHtml` as **fragment only** (already true in this workflow) and keep heavy CSS/font declarations in the PDFMonkey template (CSS tab) rather than per page.
- Ensure `/api/render/inline-page-assets` does **not** inline huge non-image assets (if ever present). If we see font URLs in HTML, consider skipping `.ttf/.woff2` in the inliner.

#### Pseudocode (backend-side enhancement, optional)

```text
extract asset keys
filter out keys with extensions we don't want to inline (ttf, woff2, etc.)
inline remaining images
```

---

### 7) Rename or fix “Wait 300ms (Throttle)” (it’s 3 seconds)

**Why:** The node says 300ms but is configured as 3 seconds. That’s easy to misinterpret during debugging.

**Fix:** Either:
- rename to `Wait 3s (Throttle)`, or
- change amount to 0.3s if 300ms was intended.

---

### 8) Reduce execution data storage (n8n operational setting)

**Why:** Even with cleanup, n8n can store full node I/O depending on global/workflow settings.

**Recommended operational setting (if acceptable):**
- Set workflow execution data saving to “**On Error**” or “**None**” for W3 image workflows, since binaries + HTML can be large.

---

## Test plan (must pass before rollout)

### Functional correctness
- Verify at least 3 orders (including Amazon 17-page) render fully:
  - no missing backgrounds/overlays
  - text overlays present
  - correct page numbering / filenames (`p00.png`, `p01.png`, …)

### Reliability
- Run 5–10 executions back-to-back (or parallel triggers) and confirm:
  - no partial renders
  - no timeouts in inlining, PDFMonkey POST, or poll loop

### Base64 bloat checks
- Add temporary logging (or structured fields) to record:
  - `originalHtmlLength`
  - `inlinedHtmlLength`
  - number of assets inlined
  - whether inlining was applied (`inlineAssetsApplied`)

Set guardrails:
- If `inlinedHtmlLength` exceeds a threshold (e.g. 3–4MB), fail fast with a descriptive error so we can optimize assets rather than produce unstable runs.

---

## Acceptance criteria (“flawless” definition)

- **No partial renders** across repeated runs.
- **No cross-page contamination** (each page’s PNG corresponds to its own HTML and assets).
- **Predictable memory behavior**: base64 fields are not carried beyond the minimal necessary nodes.
- **Clear failures**: if inline inlining fails, the run fails loudly (or is flagged explicitly) rather than silently producing partial PNGs.
- **Correct manifest output**: `3-manifest.json` references correct R2 keys for all pages + cover.

---

## Implementation checklist (ordered)

1. Update `Carry Page Keys Forward (PNG)` to remove `$items(..., 0, 0)` usage (pure transform).
2. Update `Generate Page Preview Images` to default `useImgBackgrounds` to `true` unless explicitly `false`.
3. Update `Poll PDFMonkey Image until ready` (or add a new node) to drop `pageHtml` and other large fields after PDFMonkey returns `download_url`.
4. Decide strict vs lenient inline failure policy; implement accordingly.
5. Add retry/backoff in `Inline Page Assets`.
6. Fix naming/config of the throttle node.
7. (Optional) Add guardrails/logging for `inlinedHtmlLength` and assets-inlined count.
8. Roll forward the same fixes into `w3-NB3---AMAZON-PNG_Assembly.json` once validated.

