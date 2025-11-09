# Workflow 3A – Bottom Path Patch Plan

> Goal: fill in all missing code on the **bottom path** (cover branch, manifest/QA/AT), remove fragile merge, and standardize assets so the workflow consistently produces **15 interior PNGs** and **1 cover spread PNG**, plus a complete **3A manifest**.

---

## 0) Decisions / Single‑Source‑of‑Truth (SSoT)
- **Dimensions**: Interiors `2625×2625`; Cover spread `5203×2625`.
- **Canonical font file & family**: `book-mvp-simple-adventure/fonts/CustomBook.ttf` with CSS `font-family: 'CustomBook', Arial, sans-serif;` (use this everywhere).
- **Static R2 keys** (relative):
  - Covers BG: `book-mvp-simple-adventure/backgrounds/page00-covers.png`
  - Dedication BG: `book-mvp-simple-adventure/backgrounds/page00-dedication.png`
  - p05 overlay: `book-mvp-simple-adventure/overlays/animal-tracks/page05-meadow-footprints.png`
  - p12 overlay: *(optional; null if not used)*
- **Dynamic**: pose00 → `book-mvp-simple-adventure/characters/{characterHash}/pose00.png`.
- **R2 output keys**:
  - Interiors: `book-mvp-simple-adventure/orders/{ORDER_ID}/preview-images/p00.png` … `p14.png`
  - Cover spread: `book-mvp-simple-adventure/orders/{ORDER_ID}/preview-images/cover-spread.png`
- **Credentials**: All PDFMonkey calls must use `cred.pdfmonkey` (HTTP Header Auth). No tokens in code.

---

## 1) Phase‑1 (shared) — *Run once per job*

### 1.1 Normalize Inputs (Code node)
**Input**: upstream assembly/manifest.
**Output shape** (append to `$json`):
```json
{
  "inputs": {
    "childName": "…",           
    "hometown": "…",            
    "dedicationMessage": "…",   
    "useP12Overlay": false,
    "flags": { "enableCoverPreview": true }
  }
}
```
**Rules**:
- Trim strings; collapse whitespace; if `childName` empty ⇒ `throw` (fail fast).
- Truncate `dedicationMessage` to ≤ 400 chars with ellipsis.

### 1.2 Resolve Asset Paths (Code node)
**Input**: `orderId`, `characterHash`, `backendUrl`.
**Output shape** (append to `$json`):
```json
{
  "renderContext": {
    "fontUrl":        "{backendUrl}/api/assets/book-mvp-simple-adventure/fonts/CustomBook.ttf",
    "coversBgUrl":    "{backendUrl}/api/assets/book-mvp-simple-adventure/backgrounds/page00-covers.png",
    "dedicationBgUrl": "{backendUrl}/api/assets/book-mvp-simple-adventure/backgrounds/page00-dedication.png",
    "p05OverlayUrl":  "{backendUrl}/api/assets/book-mvp-simple-adventure/overlays/animal-tracks/page05-meadow-footprints.png",
    "p12OverlayUrl":  null,
    "pose00Url":      "{backendUrl}/api/assets/book-mvp-simple-adventure/characters/{characterHash}/pose00.png"
  }
}
```
**Rules**: hard‑fail if `fontUrl`, `coversBgUrl`, or `pose00Url` missing. `p12OverlayUrl` may be `null`; log that decision to a `summary.overlayDecisions` array for traceability.

---

## 2) Cover Branch (Phase‑3)

### 2.1 Generate Cover HTML (3A) — *NEW Code node*
**Inputs**: `$json.inputs`, `$json.renderContext`, `orderId`.
**Outputs**:
- `coverHTML` *(complete HTML document sized for 5203×2625; includes @font‑face and BG layer)*
- `coverImageFilename` = `cover-spread.png`
- `coverImageR2Key` = `book-mvp-simple-adventure/orders/{ORDER_ID}/preview-images/cover-spread.png`

**Composition rules**:
- Use `coversBgUrl` as a full‑spread background (absolute, `background-size: cover`).
- Define two panels: `.back` (left), `.front` (right). Place **pose00** only on `.front` within safe margins.
- Title on front: `{CHILD_NAME}’s Inner Voice` (use `CustomBook`, bold allowed). Implement a shrink‑to‑fit loop: start at `max` (e.g., 150px), decrement until `<safeWidth`.
- Respect fold/safe areas; no critical elements straddling the spine.

**Minimal CSS tail**:
```html
<style>
  .spread{ width:5203px; height:2625px; position:relative; overflow:hidden; }
  .back{  position:absolute; left:0;     top:0; width:2602px; height:2625px; }
  .front{ position:absolute; left:2601px; top:0; width:2602px; height:2625px; }
  .title{ font-family:'CustomBook', Arial, sans-serif; font-weight:700; }
</style>
```

### 2.2 Generate Cover Image with PDFMonkey (3A)
**HTTP Request** (POST) using `cred.pdfmonkey`.
- `document_template_id`: `{{ $json.pdfMonkeyCoverImageTemplateId || $json.pdfMonkeyImageTemplateId }}`
- `document[meta][_format] = "image"`
- `document[meta][_width] = 5203`
- `document[meta][_height] = 2625`
- `document[fields][html] = {{ $json.coverHTML }}`
**Poller**: mirror interiors (10–15 tries @ ~2s; future: exponential backoff). Emit `{ coverImageDownloadUrl }`.
**Download**: use the emitted URL (file response).
**Upload**: S3/R2 node → `fileName = {{ $json.coverImageR2Key }}`.

---

## 3) Wiring Change (Phase‑3.5)
- **Remove** `Merge (combineByPosition)`; directly wire `Collect Page Preview Images → Build 3A Manifest`.
- In `Build 3A Manifest`, reference cover via `$items('Upload Cover Preview Image to R2 (3A)', 0, $runIndex)?.[0]?.json.coverImageR2Key || null`.

---

## 4) Build 3A Manifest (Phase‑4)
**Inputs**: collector output (interior keys), Phase‑1 (`inputs`, `renderContext`), and cover key (if present).
**Output shape**:
```json
{
  "pages": {
    "cover_spread": "…/cover-spread.png" | null,
    "p00_dedication": "…/p00.png",
    "p01": "…/p01.png",
    "p05": { "key": "…/p05.png", "overlay": true },
    "p12": { "key": "…/p12.png", "optional": true },
    "p14": "…/p14.png"
  },
  "pngGeneration": { "interior": {"w":2625,"h":2625}, "cover": {"w":5203,"h":2625} },
  "assetsUsed": {
    "font": "book-mvp-simple-adventure/fonts/CustomBook.ttf",
    "coversBg": "book-mvp-simple-adventure/backgrounds/page00-covers.png",
    "dedicationBg": "book-mvp-simple-adventure/backgrounds/page00-dedication.png",
    "pose00": "book-mvp-simple-adventure/characters/{characterHash}/pose00.png",
    "overlays": [
      "book-mvp-simple-adventure/overlays/animal-tracks/page05-meadow-footprints.png"
    ]
  }
}
```

---

## 5) QA Gate (Phase‑4) — *single Code node that throws on failure*
**Assertions**:
1) Exactly **15** interior images exist with contiguous indices `0..14` and keys `p00.png…p14.png`.
2) Dimensions: interiors `2625×2625`; cover (if enabled) `5203×2625` (via PDFMonkey meta or stored meta field).
3) Overlays: if `p05OverlayUrl` set → page 05 must exist; if `p12OverlayUrl` set → page 12 must exist.
4) Fonts/backgrounds present in `assetsUsed`.
5) If cover branch enabled, exactly **one** cover image present.
**On success**: annotate `json.qa = { passed:true, checks:N }`; **On fail**: `throw new Error('QA FAIL: <reason>')`.

---

## 6) Acceptance Tests (Phase‑5)
- **Happy path**: name + dedication + p05 (+ optional p12) + cover ⇒ expect 15 + 1; QA pass.
- **No dedication**: p00 BG‑only ⇒ QA pass.
- **No p12**: skip logged ⇒ QA pass.
- **Cover off**: `flags.enableCoverPreview=false` ⇒ QA pass; `cover_spread=null`.
- **Negative**: wrong template id / wrong dims ⇒ QA fail with explicit reason.

Add a tiny reporter that prints a one‑line summary per scenario.

---

## 7) Security & Housekeeping (revised per constraint)
- **Keep hardcoded credentials and template IDs** in the two PDFMonkey nodes. No credentials migration.
- To avoid duplication while staying hardcoded, add a small **“3A Constants” Code node** (pre‑Phase‑3) that outputs:
  ```json
  {
    "pdfMonkey": {
      "apiToken": "<hardcoded>",
      "imageTemplateId": "23277725-4AB0-446A-98C5-CB99C21822B3",
      "coverTemplateId": "<hardcoded-or-same-as-image>"
    }
  }
  ```
  Then reference with expressions, e.g. `{{$items('3A Constants', 0).json.pdfMonkey.apiToken}}`. Values remain hardcoded, just single‑sourced.
- **Do not log** `Authorization` headers or full request bodies. Add a small **Secrets Guard** code node that strips `Authorization` from error objects before they bubble up.
- Keep the rest of security hygiene: consistent font path/family, stable asset keys.

## 8) Definition of Done (DoD)
- 15 interior PNGs + 1 cover spread uploaded to deterministic keys.
- 3A manifest includes `pages.*`, `pngGeneration`, and `assetsUsed` (canonical values).
- QA Gate green; Acceptance suite green (except intentional negative).
- No secrets in code; all external calls use **Credentials**.
- Font path/family consistent across all HTML.

---

## 9) What I’ll need from the current JSON to proceed
- Confirmation that we should **standardize on `CustomBook.ttf`** (matches current interior PNG CSS).
- The current wiring around the **cover branch nodes** (we will patch in place, remove Merge, and fill code).
- Any final decision on **p12 overlay** (key or null).

*Once you share the updated workflow, I’ll fill in the bottom‑path code nodes and wire the QA/AT exactly as above.*



---

## Review notes — Nov 7, 2025

### Overall
- **Interiors path** is largely wired and functional (HTML → per‑page PNG via PDFMonkey → download → R2 → collect → manifest). However, the current JSON still shows the **old CSS literal bug** in `Generate Page Preview Images` (the stray `\n\n` after the template string). Ensure the fixed node you tested is imported in this workflow file.
- **Bottom path (cover branch)** has placeholders and needs code in 4 nodes: **Normalize Inputs**, **Resolve Asset Paths**, **Generate Cover HTML (3A)**, and **Poll Cover Image (3A)**. PDFMonkey calls still use a hard‑coded token.

### Specific findings
1) **Generate Page Preview Images**
   - Old code present with `PNG_FINAL_OVERRIDE_CSS` followed by stray escape characters. Re‑paste the fixed constant to eliminate the `SyntaxError` and keep parity with your working test.

2) **Normalize Inputs (3A Phase 1)** *(empty)*
   - Needs: trim/validate `childName`, `hometown`, optional `dedicationMessage` (≤ 400 chars), and flags (e.g., `enableCoverPreview`). Output `json.inputs` per plan.

3) **Resolve Asset Paths (3A Phase 1)** *(empty)*
   - Needs: compute `json.renderContext` with `fontUrl`, `coversBgUrl`, `dedicationBgUrl`, `p05OverlayUrl` (and optional p12), and **pose00Url**. These should be backend proxy URLs derived from `backendUrl`.

4) **Generate Cover HTML (3A)** *(placeholder)*
   - Needs a full 5203×2625 HTML doc. Use `coversBgUrl` as spread background; split `.back`+`.front`; render **pose00** on front; include title `{CHILD_NAME}’s Inner Voice` with shrink‑to‑fit loop; emit:
     - `coverHTML`
     - `coverImageFilename = "cover-spread.png"`
     - `coverImageR2Key = book-mvp-simple-adventure/orders/{ORDER}/preview-images/cover-spread.png`

5) **Generate Cover Image with PDFMonkey (3A)**
   - Currently sets **Authorization** header inline. Move to **Credentials** per plan (Phase 6). Keep meta width/height 5203×2625 and payload `{ pages_html: coverHTML }`.

6) **Poll Cover Image (3A)** *(empty)*
   - Implement the same polling logic as interior (15 tries @ ~2s), but read `id` from the create response and return `coverImageDownloadUrl` and `pdfMonkeyCoverDocumentId`.

7) **Download Cover Image (3A)**
   - Correctly configured to GET the `coverImageDownloadUrl` as a file. No auth needed if URL is direct.

8) **Upload Cover Preview Image to R2 (3A)**
   - Uses `coverImageR2Key` (which must be set by **Generate Cover HTML (3A)**). Good.

9) **Merge (combineByPosition)**
   - Still present. Per plan, **remove the merge** and wire `Collect Page Preview Images → Build 3A Manifest` directly. `Build 3A Manifest` should *reference* the cover key via `$items('Generate Cover HTML (3A)')` (or post‑upload node) instead of relying on positional merging.

10) **Build 3A Manifest**
   - Solid start. Minor SSoT cleanup:
     - `assetsUsed.font` currently defaults to `custom-font.ttf` (lowercase). Standardize to **`CustomBook.ttf`**.
     - `pages.p05` overlay annotation logic is present; `p12` optional handling is gated on `renderCtx.p12Overlay` — good.

11) **QA Gate / Acceptance Tests** *(empty)*
   - Implement Phase‑4 assertions and Phase‑5 reporting per canvas plan (sizes, counts, overlays, cover optionality, secrets audit optional).

### Wiring changes to apply now
- Delete **Merge** and its connections. Wire:
  - `Collect Page Preview Images → Build 3A Manifest` (only)
  - Keep cover branch independent (Generate → Poll → Download → Upload). `Build 3A Manifest` will **pull** the cover key via `$items()`.

### Security cleanups
- Move both PDFMonkey nodes to **credentials** (no inline `Authorization`).
- Optional: add a tiny "Secrets Audit" code node to scan node params for `Bearer ` before QA.

### Minor consistency notes
- `Load Canonical Assets` sets `coverSpreadImagePath` that isn’t used downstream. Fine to keep as a convenience, but the cover branch should rely on `renderContext.coversBgUrl` to stay SSoT.
- Two story loaders exist ("Load Story & Character Poses (3A)" and "Load story text (+ ensure characterImages)"). They currently chain and don’t conflict; consider consolidating later for maintainability.

### Next action
- I’ll fill **Normalize Inputs**, **Resolve Asset Paths**, **Generate Cover HTML**, and **Poll Cover Image** to match this plan; then I’ll remove **Merge**, switch PDFMonkey to credentials, and drop in QA/Acceptance code. If you prefer, we can do this in two commits (cover branch first, then QA/AT).

