# 3A Implementation Plan — Step-by-Step Patches (Nov 6, 2025)

This is a concrete, engineer-ready playbook to bring **Workflow 3A (PNG previews)** to green. It incorporates a fresh audit plus the prior agent’s notes (where they held up under re‑review).

---

## Objectives
- Produce **15 interior PNG previews (p00–p14 @ 2625×2625)** and **1 cover spread PNG (5203×2625)**.
- Generate a complete **3A manifest** with deterministic R2 keys.
- Add **QA Gate** and **Acceptance Tests** so incomplete outputs never hit R2 as “ready”.
- Remove secret leakage; move external calls to **Credentials**.

---

## Prerequisites (one-time)
1. **n8n Credentials:** Create `cred.pdfmonkey` (HTTP Header Auth) with `Authorization: Bearer <token>`.
2. **Env/Constants:** If possible, lift `backendUrl` to a single constant node or env var.
3. **Asset SSoT:** Confirm these R2 keys (update if different):
   - `book-mvp-simple-adventure/backgrounds/page00-covers.png`
   - `book-mvp-simple-adventure/backgrounds/page00-dedication.png`
   - `book-mvp-simple-adventure/overlays/animal-tracks/page05-meadow-footprints.png`
   - Optional p12 overlay key (decide now; otherwise set to null)
   - `book-mvp-simple-adventure/characters/{characterHash}/pose00.png`
   - Font file (choose ONE): `book-mvp-simple-adventure/fonts/CustomBook.ttf`

---

## Phase 1 — Normalize & Resolve (shared for interiors + cover)

### 1. Normalize Inputs (Code node)
**Goal:** Parse/trim inputs and enforce requireds.

**Input:** assembly/manifest JSON (contains `childName`, optional `dedicationMessage`, etc.)

**Output (append to `json`):**
```json
{
  "inputs": {
    "childName": "…",           // required; trimmed
    "hometown": "…",            // optional; trimmed or null
    "dedicationMessage": "…",   // optional; trimmed or null
    "useP12Overlay": false       // default false
  }
}
```
**Logic:** throw if `childName` missing/empty. Trim long dedication (>400 chars) with an ellipsis.

---

### 2. Resolve Asset Paths (Code node)
**Goal:** Create a single `renderContext` used by both branches.

**Input:** `orderId`, `characterHash`, constants.

**Output:**
```json
{
  "renderContext": {
    "fontUrl": "https://…/book-mvp-simple-adventure/fonts/CustomBook.ttf",
    "coversBgUrl": "https://…/backgrounds/page00-covers.png",
    "dedicationBgUrl": "https://…/backgrounds/page00-dedication.png",
    "p05OverlayUrl": "https://…/overlays/animal-tracks/page05-meadow-footprints.png",
    "p12OverlayUrl": null, // or a real URL if you have one
    "pose00Url": "https://…/characters/{characterHash}/pose00.png"
  }
}
```
**Rules:**
- Fail fast if `fontUrl`, `coversBgUrl`, or `pose00Url` are missing.
- `p12OverlayUrl` may be `null` — log that decision to `summary.overlayDecisions`.

---

## Phase 2 — Interiors HTML/CSS + PNG path hardening

### 3. Patch Generate Complete HTML (Interiors)
**Goals:**
- Enforce **2625×2625** canvas for PNG path.
- Standardize font family and file.
- Emit logs when optional overlays are absent.

**CSS block to append last (order matters):**
```html
<style>
  :root{ --px: 1px; }
  html, body { margin:0; padding:0; }
  .page {
    width: 2625px !important;
    height: 2625px !important;
    box-sizing: border-box !important;
  }
  @font-face {
    font-family: 'CustomBook';
    src: url('{{ $json.renderContext.fontUrl }}') format('truetype');
    font-weight: normal; font-style: normal; font-display: swap;
  }
  .use-custom-font { font-family: 'CustomBook', Arial, sans-serif; }
</style>
```
**Remove or override** any `in`/`mm` sized rules for the PNG path. Keep the inch/mm rules only in the **PDF** path nodes.

### 4. Interiors → PDFMonkey (image) nodes
- Switch to **Credentials**: remove inline Authorization headers; select `cred.pdfmonkey`.
- Body fields:
  - `document_template_id`: `{{ $json.pdfMonkeyImageTemplateId }}` (fallback if needed)
  - `document[meta][_format] = "image"`
  - `document[meta][_width] = 2625` / `_height = 2625`
  - `document[fields][html] = {{ $json.interiorsHTML || $json.pageHTML }}` (per‑page variant)
- **Poller:** keep 10–15 tries @ 2s; TODO later: exponential backoff.

---

## Phase 3 — Cover Branch (implement end‑to‑end)

### 5. Generate Cover HTML (3A) (Code node)
**Goal:** Produce full HTML for a **5203×2625** spread.

**Layout assumptions (spread):**
- Front cover is the **right half** (common for left‑to‑right books); place `pose00` on right.
- Title path arcs near an echo‑thread path; implement **shrink‑to‑fit** (max font size → decrement until width fits safe area).
- Dedicate quiet space for subtitle; optional.

**Outputs:**
```json
{
  "coverHTML": "<html>…</html>",
  "coverImageFilename": "cover-spread.png",
  "coverImageR2Key": "book-mvp-simple-adventure/orders/{{ $json.orderId }}/preview-images/cover-spread.png"
}
```
**CSS tail (append last):**
```html
<style>
  .spread{ width:5203px !important; height:2625px !important; }
  .front{ position:absolute; left:2602px; top:0; width:2601px; height:2625px; }
  .back{  position:absolute; left:0;     top:0; width:2602px; height:2625px; }
  .title{ font-family:'CustomBook', Arial, sans-serif; font-weight:700; }
  /* Implement a JS shrink loop inlined before render or pre-compute sizes */
</style>
```

### 6. Generate Cover Image with PDFMonkey (3A)
- Use **Credentials**.
- Body fields (exact n8n expression syntax):
  - `document_template_id`: `{{ $json.pdfMonkeyCoverImageTemplateId || $json.pdfMonkeyImageTemplateId }}`
  - `document[meta][_format] = "image"`
  - `document[meta][_width] = 5203`
  - `document[meta][_height] = 2625`
  - `document[fields][html] = {{ $json.coverHTML }}`

### 7. Cover Poll → Download → Upload
- Mirror the interiors pattern.
- Upload path must use `coverImageR2Key` from step 5.

---

## Phase 3.5 — Wiring Safe Merge & Manifest

### 8. Remove fragile Merge (combineByPosition)
**Patch:** Wire `Collect Page Preview Images → Build 3A Manifest` directly.

### 9. Build 3A Manifest (Code node)
**Add:**
```json
{
  "pages": {
    "interiors": [
      "book-mvp-simple-adventure/orders/{ORDER_ID}/preview-images/p00.png",
      "…p14.png"
    ],
    "cover_spread": "book-mvp-simple-adventure/orders/{ORDER_ID}/preview-images/cover-spread.png" // or null
  },
  "pngGeneration": { "interior": {"w":2625,"h":2625}, "cover": {"w":5203,"h":2625} },
  "assetsUsed": {
    "font": "book-mvp-simple-adventure/fonts/CustomBook.ttf",
    "backgrounds": {"covers":"…covers.png","dedication":"…dedication.png"},
    "overlays": {"p05":"…footprints.png","p12": null}
  }
}
```
**Cover reference:** Fetch via `$items('Upload Cover Preview Image to R2 (3A)', 0, $runIndex)?.[0]?.json.coverImageR2Key || null`.

---

## Phase 4 — QA Gate (hard fail on violations)

### 10. QA Gate (Code node)
**Assertions:**
1. **Count & coverage:** 15 interiors present, named `p00.png`…`p14.png` with contiguous indices `0..14`.
2. **Sizes:** PDFMonkey meta (if available) equals target dims; otherwise rely on our own injected meta; if missing, at least assert key naming.
3. **Overlays:** if `p05OverlayUrl` set, page 05 exists; same for `p12OverlayUrl`.
4. **Cover:** if cover branch enabled, exactly one cover at **5203×2625**.
5. **Fonts/backgrounds:** `assetsUsed.font`, `coversBgUrl`, `dedicationBgUrl` are non‑empty.

**On fail:** `throw new Error('QA FAIL: <reason>')`.
**On success:** `json.qa = { passed:true, checks: N }`.

---

## Phase 5 — Acceptance Tests (wire as subflow or toggled path)

### 11. Scenarios
- **Happy path:** childName + dedication + p05 + (optional) p12 + cover → expect 15 + cover, QA pass.
- **No dedication:** omit message → still render p00 (BG only), QA pass.
- **No p12 overlay:** p12 null → QA pass with logged skip.
- **Cover off:** bypass cover nodes → QA pass, `cover_spread: null`.
- **Negative:** wrong template id or dimensions → QA fail before upload/mark‑ready.

**Add a small reporter node** that prints a single‑line summary per scenario.

---

## Phase 6 — Security & Housekeeping
- Remove any literal `Authorization: Bearer …` from all HTTP nodes.
- Confirm **no tokens** remain in Poll/Download helper nodes.
- Optionally add a small **Secrets Audit** code node that scans node params at runtime for patterns like `Bearer `.

---

## Phase 7 — Feature Flags & Rollback
- Add `flags.enableCoverPreview` (default `true`). If `false`, skip cover path and set `pages.cover_spread = null`.
- Keep the old inch/mm CSS in a **PDF‑only** branch to avoid future regressions.

---

## Definition of Done (DoD)
- ✅ 15 interior PNGs + 1 cover spread uploaded with deterministic keys.
- ✅ 3A manifest includes `pages.*`, `pngGeneration`, and `assetsUsed` with canonical font and BG keys.
- ✅ QA Gate passes; Acceptance suite: all greens except the intentional negative test.
- ✅ No secrets in code; all external calls use **Credentials**.
- ✅ Font path/family consistent across all HTML.

---

## Appendix — Node names to touch
- **Phase 1:** `Normalize Inputs (3A)`, `Resolve Asset Paths (3A)`
- **Phase 2:** `Generate Complete HTML (interior)`, `Generate Page Preview Images → PDFMonkey image → Poll → Download → Upload`
- **Phase 3:** `Generate Cover HTML (3A)`, `Generate Cover Image with PDFMonkey (3A)`, `Poll Cover Image`, `Download Cover Image`, `Upload Cover Preview Image to R2 (3A)`
- **Phase 3.5:** remove `Merge (combineByPosition)`, patch `Build 3A Manifest`
- **Phase 4:** `QA Gate (3A)`
- **Phase 5:** `Acceptance Tests (3A)`

---

**Notes on prior agent’s findings:** They align with this plan (placeholder cover branch, CSS precedence drift, missing Phase‑1, empty QA/AT, hard‑coded tokens). This plan operationalizes those findings into exact patches and assertions so an implementer can proceed without further interpretation.

