# 3A — Final Workflow QA (pre‑test audit)

**Scope:** Full pass over *Workflow 3 – Final Before Testing* for correctness, completeness, wiring, security, and deterministic behavior. Goal is to surface all issues (even small ones) before we run a single execution.

---

## Executive summary
- The **interior branch** is close but has a CSS precedence bug that can silently force **2550×2550** page layout inside a **2625×2625** canvas. This will produce inconsistent scaling.
- The **cover branch** is still largely **placeholder**: missing HTML generation, polling code, correct templating expressions, and explicit credentials wiring. The manifest therefore can’t reliably include the cover image key.
- Several **Phase‑1** normalization/asset‑path nodes are empty; interior logic currently bypasses them, which is why p05/p12/dedication may not render as intended.
- **Security:** Hard‑coded PDFMonkey tokens exist in two HTTP nodes; migrate to credentials.
- **QA/Acceptance** nodes are present but **unimplemented**, so nothing is enforcing our SSoT prior to upload.

**Blockers before testing** (must fix):
1) Cover branch: implement *Generate Cover HTML*, fix PDFMonkey request payload, add poller, wire upload → merge → manifest.
2) CSS precedence: ensure per‑image rasterization uses **2625px** rules unequivocally.
3) Populate *Normalize Inputs* and *Resolve Asset Paths* (Phase‑1) or remove their references from downstream nodes.
4) Move PDFMonkey auth to credentials; remove hard‑coded tokens.
5) Implement QA Gate & Acceptance Tests with explicit checks.

---

## Node‑by‑node audit (issues & fixes)

### 1) **Extract Manifest URL (3)**
**Status:** Good. Robust resolution of `manifestUrl`, `orderId`, webhook signals; constructs 2B path if missing.
**Risk:** None.
**Action:** Keep.

### 2) **Download 2B Manifest** → **Build Assembly Input From Manifest** → **Get Order Ready for Assembly**
**Status:** Reads 2B manifest, validates schema, maps `processedImages` w/ proxy URLs. Initializes assembly counters.
**Risk:** None.
**Action:** Keep.

### 3) **Load Canonical Assets**
**Status:** Loads backgrounds (p00..p14) using backend proxy URLs; also adds `coverSpreadImagePath` (static).
**Gaps:** Scene slugs must match exact filenames in R2; confirm hyphen/underscore usage. `coverSpreadImagePath` is redundant once cover branch renders dynamically.
**Action:**
- ✅ Keep backgrounds.
- ❌ Remove or ignore `coverSpreadImagePath` to avoid confusion.

### 4) **Load Story & Character Poses (3A)** → **Load story text (+ ensure characterImages)**
**Status:** Both nodes synthesize story text and character images; second node overwrites the first.
**Risk:** Redundancy; harder to reason about changes.
**Action:** Consolidate to **one** loader (prefer the second, which normalizes animal and pose mapping). Delete or no‑op the first.

### 5) **Generate Complete HTML (interiors)**
**Strengths:**
- Produces `pages_html` and `interiorPagesHTML[]` with p00 dedication block and per‑page composition.
- Overlay logic for p05/p12 and text box.

**Critical issues:**
- **CSS precedence / size drift.** The HTML includes `pdfCss` (8.5in rules) and later, during image rasterization, we also inject `INLINE_PNG_CSS` (2625px rules). Because the wrapper injects the 2625px CSS **before** your `pdfCss`, the later `pdfCss` wins → `.book-page` becomes **2550px** after unit conversion, not 2625px. This mismatch causes scaling inconsistencies and could shift placements.

**Fix options (choose one):**
- **A (recommended):** Remove `pdfCss` from interiors intended solely for PNG generation. Keep a single 2625px ruleset for the image path. (If you also render a PDF elsewhere, split the concerns.)
- **B:** Keep both, but insert a **second** 2625px override **after** the page HTML with higher specificity and `!important`, e.g., `.book-page{width:2625px!important;height:2625px!important}`.

**Smaller issues:**
- Uses `Normalize Inputs` and `Resolve Asset Paths` outputs for overlays/dedication, but those nodes are empty (see Phase‑1 section). Result: p05/p12 overlays and dedication may silently drop.

**Action:** Implement one of the CSS fixes and ensure Phase‑1 nodes are populated.

### 6) **Generate Page Preview Images** → **PDFMonkey image create/poll/download/upload** → **Collect Page Preview Images**
**Status:** Solid. Emits one item per page; correct naming and S3 keys; polling loop caps attempts.
**Gaps:** PDFMonkey bearer token is hard‑coded; move to credentials.
**Action:**
- Move the Authorization header to a named credential.
- Consider retries/backoff on PDFMonkey GET failures in the poller.

### 7) **Cover branch** — *Normalize Inputs (3A Phase 1)* → *Resolve Asset Paths (3A Phase 1)* → **Generate Cover HTML (3A)** → **Generate Cover Image (PDFMonkey)** → **Poll** → **Download** → **Upload**
**Status:** **Incomplete**. Phase‑1 nodes are empty; `Generate Cover HTML (3A)` has no code; poller has no code; PDFMonkey JSON uses wrong templating; download uses credentials config with no attached credentials.

**Required fixes:**
1) **Implement `Normalize Inputs (3A Phase 1)`**
   - Extract: `orderId`, `childName`, `characterHash`, optional `dedicationMessage`.
   - Validate: `childName` non‑empty.
   - Emit: `inputs` object.

2) **Implement `Resolve Asset Paths (3A Phase 1)`**
   - Map and validate keys: `coversBg`, `pose00`, `font`.
   - Emit: `renderContext`.

3) **Implement `Generate Cover HTML (3A)`**
   - Build 5203×2625 spread, with fold, safe margins.
   - Place title (shrink‑to‑fit) and `pose00` on right/front only.
   - Emit: `coverHTML`, `coverImageFilename`, `coverImageR2Key`.

4) **Fix PDFMonkey request**
   - Use `{{ ... }}` expressions:
     - `"document_template_id": "{{ $json.pdfMonkeyCoverImageTemplateId || 'B3041972-B9F5-4E82-BA05-7FF4FFC10A43' }}"`
     - payload: `"pages_html": {{ JSON.stringify($json.coverHTML) }}`
   - Move Authorization to credentials.

5) **Implement Cover poller** (clone interior poller; same status loop; set `coverImageDownloadUrl`).

6) **Wire download → upload → merge**
   - Ensure upload sets exactly the same `coverImageR2Key` emitted by the generator.

### 8) **Merge** → **Build 3A Manifest** → **QA Gate** → **Prep/Upload 3 Manifest** → **Mark Previews Ready** → **Log** → **Acceptance Tests**
**Status:** Wiring is correct but **QA Gate** and **Acceptance Tests** are empty; **Build 3A Manifest** already expects a `coverSpreadImage` coming from the cover branch.

**Required checks to add:**
- **QA Gate**
  - Fail if: missing `childName`, any required static asset missing, p05 overlay missing, `coverSpreadImage` missing, or any page image key missing.
- **Acceptance Tests**
  - Assert sizes: interiors **2625×2625**, cover **5203×2625**.
  - Happy path vs no‑dedication vs negative (no pose00) behaviors.

### 9) **Security & credentials**
- PDFMonkey Authorization tokens are hard‑coded in two HTTP nodes. Use a named credential and environment variables.
- Remove `authentication: genericCredentialType` if you also supply headers directly; pick one strategy consistently.

---

## Concrete patch set (ready to apply)

1) **Interiors CSS dominance (fast fix)**
   - In *Generate Page Preview Images*, append after `unitsToPx(pageHtmlRaw)`:
   ```html
   <style>
     /* Force 2625px for rasterization */
     .book-page{width:2625px!important;height:2625px!important}
   </style>
   ```
   - Or remove `pdfCss` from *Generate Complete HTML* for the image path.

2) **PDFMonkey Cover request (JSON body)**
```json
{
  "document": {
    "document_template_id": "{{ $json.pdfMonkeyCoverImageTemplateId || 'B3041972-B9F5-4E82-BA05-7FF4FFC10A43' }}",
    "status": "pending",
    "meta": { "_filename": "{{ $json.coverImageFilename }}", "_type": "png", "_width": 5203, "_height": 2625 },
    "payload": { "pages_html": {{ JSON.stringify($json.coverHTML) }} }
  }
}
```

3) **Cover poller (skeleton)** — copy interior poller and rename fields to `coverImageDownloadUrl`.

4) **Phase‑1 implementations** — populate *Normalize Inputs* and *Resolve Asset Paths* as per SSoT so overlay/dedication logic actually work.

5) **QA Gate** — enforce presence of all required keys; fail early with explicit messages.

6) **Acceptance Tests** — log and assert sizes & counts; if any mismatch, mark run as failed.

7) **Credentials** — move PDFMonkey auth to a credential; remove hard‑coded tokens.

---

## Test matrix (pre‑release)
1) **Happy path** — child name + dedication + pose00 present.
   - Expect p00 w/ text, p05 overlay, p12 optional, cover composed. Manifest includes all keys.
2) **No dedication** — dedication empty.
   - Expect p00 background‑only, cover composed.
3) **Missing pose00** — remove or rename asset.
   - Expect QA Gate to fail with explicit missing key path.
4) **Long name** — stress test shrink‑to‑fit on cover.
5) **Animal variants** — run through 2–3 animals to ensure filenames/paths resolve.

---

## Open questions / decisions
- **Interiors PDF vs PNG CSS split:** Do we keep a dedicated PDF CSS and a separate PNG CSS, or unify on 2625px for both?
- **Static vs dynamic cover fallback:** Remove static `coverSpreadImagePath` now to avoid accidental use?
- **Manifest duplication:** `pages` is duplicated (raw + within `pngGeneration`). OK for now, but we should converge.

---

## Ready‑to‑ship checklist
- [ ] Phase‑1 nodes implemented and referenced fields present downstream.
- [ ] Interiors rasterize at 2625px with no inch‑based overrides taking precedence.
- [ ] Cover HTML generator implemented; uses right‑front placement; title shrink‑to‑fit.
- [ ] PDFMonkey cover request uses correct template ID and JSON expressions.
- [ ] Poller implemented for cover; download/upload wired; merge produces `coverImageR2Key`.
- [ ] QA Gate failing loudly on missing assets.
- [ ] Acceptance Tests log sizes and success criteria.
- [ ] PDFMonkey tokens removed from source; credentials used.

