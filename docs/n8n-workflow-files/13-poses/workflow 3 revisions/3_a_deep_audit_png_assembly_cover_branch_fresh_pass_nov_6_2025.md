# 3A Deep Audit — PNG Assembly & Cover Branch (fresh pass, Nov 6, 2025)

> Scope: A ground‑up audit of **Workflow 3 – Final Before Testing** (JSON file) and its immediate dependencies, with fresh eyes. I reviewed the wiring, node code, data contracts, dimensions, asset keys, security posture, and failure modes. Below is a concise but complete QA artifact you can hand to the next implementer.

---

## Executive Summary (my findings)

**State:** The **interior PNG pipeline is nearly complete** and already renders p00–p14 at 2625×2625 when fed proper inputs. The **cover branch is a placeholder** and currently cannot emit a cover PNG or a deterministic key. A **fragile Merge** risks zero output if the cover path is empty. **Credentials are hard‑coded** in two places. **Phase‑1 normalization nodes are empty**, so some new assets (dedication text, p05/p12 overlays) rely on defaults and may not render.

**Blockers to test:**
- Implement the **cover branch** (Generate Cover HTML → PDFMonkey → download → R2 upload) with a **deterministic key**.
- Replace **hard‑coded PDFMonkey tokens** with n8n **Credentials**.
- Remove or refactor the **Merge (combineByPosition)** so an empty cover stream can’t zero the output.
- Fill in **Normalize Inputs** and **Resolve Asset Paths** so overlays/dedication/pose00 are resolved exactly once.
- Implement **QA Gate** and **Acceptance Tests** to enforce sizes, presence of assets, and manifest structure before upload.

**Non‑blocking fixes (quality):**
- **Font path/name** is inconsistent (`CustomBook.ttf` vs `custom-font.ttf`). Standardize both path *and* CSS family name.
- Cover request body uses an **invalid template expression** (string‑wrapped JS) — must use n8n’s `{{ }}`.
- Ensure **page 12 overlay** is expressly optional and logged if missing.

---

## Architecture & Dataflow (as‑wired)

**Entry:** `Webhook Trigger (Book Assembly)` → `Extract Manifest URL (3)` → download 2B manifest → build minimal assembly payload → shared Phase‑1 (currently empty) → load canonical assets + story/poses → **Generate Complete HTML (interior)** → **per‑page HTML→PNG via PDFMonkey** → R2 upload of page PNGs → **Collect Page Preview Images** → **Merge** (with cover branch) → **Build 3A Manifest** → QA Gate → Upload manifest → Mark status → Log → Acceptance Tests.

**Cover branch (present but placeholder):** Resolve Assets → **Generate Cover HTML (3A)** → PDFMonkey (image) → Poll → Download → **Upload Cover Preview Image to R2** → Merge.

---

## Node‑by‑Node Audit (issues & fixes)

### 1) Webhook → Extract Manifest URL (3)
- ✅ Robustly resolves `manifestUrl` and `orderId` (including from `manifestKey`).
- ✅ Falls back to constructing 2B manifest URL when necessary.
- ⚠️ Sets `backendUrl` constant; that’s fine, but consider moving to env/cred.

**Action:** None required now.

### 2) Download 2B Manifest / Build Assembly Input From Manifest / Get Order Ready for Assembly
- ✅ Validates schema and required fields (`amazonOrderId`, `characterHash`, entries).
- ✅ Produces `processedImages[]` array sorted by `poseNumber`.
- ✅ Initializes assembly counters.

**Action:** None, keep.

### 3) Load Canonical Assets
- ✅ Emits `backgroundImages` for p00–p14 at backend proxy URLs (2625×2625 interiors).
- ✅ Emits `coverSpreadImagePath` (not currently consumed downstream).

**Action:** None; later use the cover BG as the base layer in the cover HTML node.

### 4) Load Story & Character Poses (3A) and Load story text (+ ensure characterImages)
- ✅ Provide story text and build `characterImages.poses[]` when missing.
- ✅ Pose→page mapping is intentional (pages 7–12 reuse prior poses; page 14 maps to pose 12).

**Action:** None beyond keeping the mapping consistent in CSS placements.

### 5) Normalize Inputs (3A Phase 1) — **EMPTY**
- ❌ This must parse and standardize: `childName` (required), `hometown` (optional), `dedicationMessage` (optional), and any toggles (e.g., `useP12Overlay`).

**Fix:** Implement to emit `{ inputs: { childName, hometown, dedicationMessage, useP12Overlay } }` with trimming & defaulting.

### 6) Resolve Asset Paths (3A Phase 1) — **EMPTY**
- ❌ Must resolve canonical **R2 keys** to a shared `renderContext`: `font`, `coversBg`, `dedicationBg`, `p05Overlay`, optional `p12Overlay`, `pose00`.

**Fix:** Implement to emit `{ renderContext: { font, coversBg, dedicationBg, p05Overlay, p12Overlay|null, pose00 } }`. Fail fast if any **required** key is missing.

### 7) Generate Complete HTML (interiors)
- ✅ Produces per‑page markup with controlled character placements and optional overlays.
- ✅ Outputs both a global `pages_html` and an array `interiorPagesHTML[]`. The PNG path prefers the array.
- ✅ PNG shim CSS fixes the canvas at **2625×2625**.
- ⚠️ **Font inconsistency:** `getFontUrl()` points to `/fonts/CustomBook.ttf` while other nodes refer to `custom-font.ttf`.
- ⚠️ `p12Overlay` is optional but silently ignored if unresolved; should log/trace that choice.

**Fix:** Standardize the font **file name** and **CSS family** across all nodes. Add trace logging when overlays are absent.

### 8) Generate Page Preview Images → PDFMonkey image → Poll → Download → Upload to R2
- ✅ Converts units (`in`/`mm` → `px`) and injects a clean inline CSS for 2625 px canvas.
- ✅ Uses image template and pins meta `_width/_height` to 2625.
- ⚠️ **Security:** Authorization is a literal bearer value.

**Fix:** Move PDFMonkey auth to **Credentials** and delete inline tokens. Keep polling (15×2s) but consider an exponential backoff later.

### 9) Collect Page Preview Images
- ✅ Aggregates per‑page items into `pagePreviewImages[]` with deterministic keys: `book-mvp-simple-adventure/orders/{ORDER_ID}/preview-images/pXX.png`.
- ⚠️ `totalPagesRequired` is derived heuristically; fine for previews but QA Gate should assert it equals 15 (p00–p14) for 3A.

**Fix:** In QA Gate, assert exactly **15** images exist with numeric coverage 0..14.

### 10) Cover branch (all 5 nodes) — **PLACEHOLDER**
- ❌ `Generate Cover HTML (3A)` has no code.
- ❌ `Generate Cover Image with PDFMonkey (3A)` request embeds a **JS expression inside a string** for `document_template_id`: `"{ $json.pdfMonkeyCoverImageTemplateId || '...' }"` — this is not evaluated by n8n and results in a literal string.
- ❌ Poll/Download lack logic; Upload expects `coverImageR2Key` that’s never set.

**Fix (minimal viable):**
1. **Generate Cover HTML (3A)** should output `{ coverHTML, coverImageFilename: 'cover-spread.png', coverImageR2Key: 'book-mvp-simple-adventure/orders/{ORDER_ID}/preview-images/cover-spread.png' }` and include child name, title/subtitle styling, and `pose00` (from `renderContext`).
2. **Generate Cover Image with PDFMonkey (3A)**: switch to credentials; set `document_template_id` via `{{ $json.pdfMonkeyCoverImageTemplateId || 'B3041972-B9F5-4E82-BA05-7FF4FFC10A43' }}` (no braces inside quotes). Pin meta width/height to **5203×2625**.
3. **Poll**, **Download**, **Upload**: mirror the interior pattern, writing exactly one item with `coverImageR2Key`.

### 11) Merge (combineByPosition)
- ❌ If the cover stream has **zero items**, `combineByPosition` can emit **zero outputs**, which prevents `Build 3A Manifest` from running.

**Fix (recommended):** Remove the Merge and wire `Collect Page Preview Images → Build 3A Manifest` directly. In `Build 3A Manifest`, reference the cover item via `$items('Upload Cover Preview Image to R2 (3A)', 0, $runIndex)`; if not present, set `coverSpreadImage: null` and log. **Alternate:** Change Merge to **Pass Through** (input 1) so the left stream always passes through even when right is empty.

### 12) Build 3A Manifest
- ✅ Emits a compact manifest with `pngGeneration` sizes and page keys.
- ⚠️ Reads `coverImageR2Key` via `$items('Generate Cover HTML (3A)')` — but that node is empty, so cover will be null.
- ⚠️ `assetsUsed.font` uses lower‑case path; HTML uses upper‑case file name.

**Fix:** Standardize font naming and ensure cover key is set by the cover branch.

### 13) QA Gate (Phase 4) — **EMPTY**
- ❌ Currently does not enforce any invariant.

**Fix:** See QA & tests below.

### 14) Upload 3 Manifest to R2 → Mark Previews Ready → Log → Acceptance Tests (Phase 5)
- ✅ Upload wiring looks correct.
- ⚠️ Acceptance Tests are empty.

**Fix:** Implement tests below; consider making `Mark Previews Ready` depend on passing QA Gate.

---

## Dimensions, Keys & Fonts (SSoT for 3A)

- **Interiors:** `2625×2625` px.
- **Cover spread:** `5203×2625` px.
- **R2 keys (previews):**
  - `book-mvp-simple-adventure/orders/{ORDER_ID}/preview-images/p00.png` … `p14.png`
  - `book-mvp-simple-adventure/orders/{ORDER_ID}/preview-images/cover-spread.png`
- **Overlays:**
  - p05: `book-mvp-simple-adventure/overlays/animal-tracks/page05-meadow-footprints.png`
  - p12: optional key (resolve in Phase‑1)
- **Fonts:** Choose one **canonical file** *and* **CSS family** and use it everywhere. Recommend:
  - File: `book-mvp-simple-adventure/fonts/CustomBook.ttf`
  - CSS: `font-family: 'CustomBook', Arial, sans-serif;`

> If the actual R2 object is lower‑case, flip the recommendation; the crucial bit is **one** spelling across **all** nodes.

---

## Security & Config

- **PDFMonkey Authorization** must come from n8n **Credentials**; delete literal tokens from node headers and polling code.
- Consider moving `backendUrl` to an environment variable or a small helper that reads from Credentials to avoid drift across environments.

---

## QA Gate (Phase 4) — required assertions
Implement as a single Code node that **throws** on failure and prints a compact summary on success.

**Inputs referenced:**
- `$json.pagePreviewImages` (collector)
- `$items('Upload Cover Preview Image to R2 (3A)', 0, $runIndex)?.[0]?.json` for cover
- `$items('Resolve Asset Paths (3A Phase 1)')?.[0]?.json.renderContext`

**Assert:**
1. **Counts & coverage**: exactly 15 interior images present (`p00..p14`), unique and contiguous page numbers 0..14.
2. **Sizes**: each page PNG `_width==2625 && _height==2625` in PDFMonkey meta (or via stored meta if available).
3. **Overlays**: if `renderContext.p05Overlay` present, p05 must exist; if `renderContext.p12Overlay` present, p12 must exist.
4. **Cover**: If the cover branch is enabled, there must be exactly **1** cover image with `_width==5203 && _height==2625`.
5. **Fonts/backgrounds**: `assetsUsed.font`, `coversBg`, `dedicationBg` must be non‑empty strings.

**On success:** add `qa: { passed: true, checks: N }` to the JSON.

---

## Acceptance Tests (Phase 5) — scenarios to wire now

- **Happy path:** childName + dedication + both overlays + cover. Expect 15 interiors + 1 cover; manifest contains all keys; QA passes.
- **No dedication:** omit `dedicationMessage`; still produce p00 (background only) and pass QA.
- **No p12 overlay:** ensure QA logs a skip but still passes.
- **Cover off:** temporarily bypass cover branch; QA should still pass with cover null and no Merge contribution.
- **Negative:** corrupt `pdfMonkeyImageTemplateId` or wrong dimensions → QA must **fail** with a clear message before upload/marking complete.

---

## Wiring Changes (recommended minimal patch)

1) **Delete the Merge** node entirely.
   - Wire `Collect Page Preview Images → Build 3A Manifest`.
   - In `Build 3A Manifest`, fetch the cover **by reference**: `const cover = $items('Upload Cover Preview Image to R2 (3A)', 0, $runIndex)?.[0]?.json;`
   - If `!cover`, set `coverSpreadImage: null` and add `summary.needsHumanReview = true`.

2) **Implement Phase‑1 nodes** (Normalize Inputs, Resolve Asset Paths) exactly once per run.

3) **Implement the cover HTML node** to output:
   - `coverHTML` (full HTML with 5203×2625 canvas, BG from `coversBg`, title/subtitle placement, `pose00` placement, text shrink‑to‑fit)
   - `coverImageFilename` = `cover-spread.png`
   - `coverImageR2Key` = `book-mvp-simple-adventure/orders/{ORDER_ID}/preview-images/cover-spread.png`

4) **Fix the cover PDFMonkey request** body to use n8n expressions (`{{ }}`) and Credentials.

5) **Move tokens to Credentials** in both PDFMonkey calls (interior & cover) and their pollers.

6) **Implement QA Gate** with the assertions above. Make `Upload 3 Manifest to R2 → Mark Previews Ready` execute **only on pass**.

7) **Standardize font path/name** across all nodes.

---

## Risk Register & Mitigations

- **Zero‑item output from Merge** (current): *High.* → Remove Merge or set to **Pass Through**.
- **Secrets in code**: *High.* → Credentials immediately.
- **Silent overlay skips**: *Medium.* → Log decisions and assert when overlays are declared.
- **Font path mismatch**: *Medium.* → Single SSoT path/family now.
- **Template expression error in cover request**: *Medium.* → Switch to `{{ }}` n8n syntax.
- **Future drift in asset keys**: *Low/Medium.* → Lock keys in Resolve node, fail fast.

---

## Quick Reference — What to implement next (in order)

1. **Normalize Inputs** (Phase‑1): parse/trim `childName`, optional `dedicationMessage`, flags.
2. **Resolve Asset Paths** (Phase‑1): emit `renderContext` with canonical keys and `pose00`.
3. **Cover HTML** (Phase‑3): build 5203×2625 HTML; set deterministic R2 key.
4. **PDFMonkey (cover)**: credentials + correct template id + poll.
5. **Remove/replace Merge** and wire Build Manifest directly.
6. **QA Gate**: add assertions; make manifest upload depend on pass.
7. **Acceptance Tests**: wire 4–5 scenarios; each should run in <1 min for previews.
8. **Font SSoT**: update both interior CSS and assetsUsed to the same filename and CSS family.

---

## Optional Enhancements (after green tests)

- **Exponential backoff** in PDFMonkey pollers.
- **Per‑page trace**: write a tiny log per rendered page (pose used, overlay flags, effective font loaded).
- **Retry on single‑page failures**: localized retry instead of failing the entire run.

---

### End of audit

This doc is intentionally implementation‑ready: each bullet is a specific fix or assertion to wire. Hand this to an engineer or an agent and they can proceed phase‑by‑phase without guesswork.

