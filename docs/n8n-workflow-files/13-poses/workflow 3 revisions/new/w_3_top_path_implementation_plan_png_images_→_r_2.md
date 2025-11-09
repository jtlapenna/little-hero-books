# Workflow 3 — **Top Path Implementation Plan** (Interior Page PNGs → R2)

**Scope:** Stabilize and finalize the top path so it generates **all interior pages (p00–p14)** as **PNG images** via PDFMonkey, uploads them to R2 with deterministic keys, and emits a correct 3‑manifest for Workflow 4. Keep debug preview nodes separate. Do **not** change credential storage or template IDs in this pass (we’ll keep the existing hard‑coded values).  
**Out of scope (for a later pass):** bottom path (cover PDF), switching to interior PDFs, moving secrets to credentials.

---

## Assumptions
- PDFMonkey **image template** ID is valid and must remain hard‑coded.  
- 2625×2625 canvas for interior pages; p00 (dedication) included.  
- Expected outputs: **15 PNGs** (`p00.png` … `p14.png`).  
- R2 bucket: `little-hero-orders`; R2 key prefix: `book-mvp-simple-adventure/orders/{AMAZON_ORDER_ID}/preview-images/`.

---

## Deliverables
1) Updated **Generate Page Preview Images** to emit per‑page payloads with deterministic filenames and R2 keys.  
2) Verified **PDFMonkey create/poll** wiring (no blank `document_template_id`, stable status check, and captured `download_url`).  
3) Robust **Download → Upload** chain, one item per page, with success tracking.  
4) Hardened **Collector/QA/Acceptance** to ensure all pages present and uploaded.  
5) **Preview (debug) nodes** connected as read‑only branches that never affect production path.

---

## Phase 0 — Safety & Baseline
- [ ] Duplicate the current workflow to `_W3_TOPPATH_SAFE_YYYYMMDD_hhmm`.  
- [ ] Set a **test mode** (`testModePages`) to
  - `3` for fast iteration, then
  - `15` for full run.

---

## Phase 1 — HTML/CSS Parity & Asset Paths (non‑breaking)
- [ ] Unify font asset naming across HTML builders and previews to **`custom-font.*`** (keep existing URL base).  
- [ ] Confirm **text box overlay** CSS uses `background-size: contain` so its rounded corners render; keep +20% width/height.
- [ ] Ensure **animal p13** final width ≈ **1100px**; p14 animal remains unchanged.

> Rationale: Prevent silent PDFMonkey typography drift and overlay clipping.

---

## Phase 2 — Per‑Page Itemization & Metadata
- [ ] In **Generate Page Preview Images**, produce exactly **N items** (N = `testModePages` or `15`) with fields:  
  - `pageIndex` (0–14), `pageLabel` (`p00_dedication`, `p01`…`p14`),  
  - `pages_html` (standalone HTML for that page only),  
  - `filename` (`p00.png`…`p14.png`),  
  - `pageImageR2Key` (full key under the order folder),  
  - `pdfMonkeyImageTemplateId` (hard‑coded value),  
  - `pdfMonkeyMeta` `{ _type: "png", width: 2625, height: 2625 }`.  
- [ ] Verify **p00 dedication** is included and mapped to `p00.png`.

---

## Phase 3 — PDFMonkey: Create & Poll (stability)
- [ ] **Create**: POST to `/documents` with Bearer token and body:  
  `{ document_template_id, status: 'draft', document: { pages_html }, meta: pdfMonkeyMeta }`.  
  - Ensure **`document_template_id`** is set from the item’s `pdfMonkeyImageTemplateId` (not blank).  
- [ ] **Poll**: GET `/documents/{id}` until `status === 'success'`.  
  - Attempts: **30 × 2s** (≈60s), with jittered backoff (2s + 0–500ms).  
  - On success, store `download_url` as `pageImageDownloadUrl`.  
  - On terminal failure or timeout, throw a descriptive error: includes `pageLabel`, `documentId`, last known `status`.

---

## Phase 4 — Download → Upload → Traceability
- [ ] **Download** the image from `pageImageDownloadUrl` as binary `data`.  
- [ ] **Upload** to R2 using `pageImageR2Key`.  
  - Set `contentType: image/png`.  
  - Capture `{ uploaded: true, r2Key, etag/size }` in each item’s JSON for later verification.
- [ ] **Traceability**: maintain `documentId`, `pageLabel`, and `filename` through each step for log correlation.

---

## Phase 5 — Collector, Manifest, QA, Acceptance
- [ ] **Collector** reads items from **Generate Page Preview Images** and **joins** the upload confirmations by `pageLabel`.  
- [ ] Build `manifest.pngGeneration.pages` with keys `{ p00_dedication, p01 … p14 }` → R2 keys.  
- [ ] **QA Gate** checks:  
  - Count equals expected (N),  
  - Each key is non‑empty and unique,  
  - Presence of dedication p00,  
  - Optional: PNG dimension check (2625×2625) by reading one uploaded image header in test runs.  
- [ ] **Acceptance Tests**:  
  - Ensure `book_assembly_previews_ready === true`,  
  - Verify `manifest schema` and `order metadata` preserved,  
  - Emit a compact **run report** (pages generated, uploaded, elapsed times).

---

## Phase 6 — Debug Preview Nodes (safe wiring)
- [ ] **Build Standalone Preview**: connect **input only** from **Generate Complete HTML**; **do not** connect its output into the production chain.  
- [ ] Clearly label node: “**DEBUG ONLY — no outputs used by prod**.”  
- [ ] Keep CSS parity with PDFMonkey templates for visual verification.

---

## Phase 7 — Logging & Telemetry
- [ ] Add concise `console.log` markers at each phase with `orderId`, `pageLabel`, and duration.  
- [ ] When polling, log **first, middle, last** attempt statuses (not every tick) to reduce noise.

---

## Phase 8 — Test Plan
**A. Smoke (N=3 pages)**  
- Trigger with a known order; expect `p00, p01, p02` uploaded.  
- Confirm R2 keys exist; download one image and check **2625×2625**.

**B. Full (N=15 pages)**  
- Expect all pages uploaded and manifest built.  
- Verify acceptance report + QA pass.  
- Sanity‑view a random subset (p05 footprints, p13 animal width).

**C. Failure modes**  
- Corrupt HTML for a page → ensure create fails and error cites `pageLabel`.  
- Simulated PDFMonkey slow response → verify poll timeout path is clear and actionable.

---

## Rollback Plan
- Re‑enable the duplicated safe copy `_W3_TOPPATH_SAFE_*`.  
- Revert `Generate Page Preview Images` and `Poll` nodes to prior versions if any regressions.

---

## Risks & Mitigations
- **PDFMonkey latency** → extended polling with jitter.  
- **Template/config drift** → keep hard‑coded IDs as‑is; document them in a small `CONFIG` block in‑node.  
- **Asset 404s** (fonts/overlays) → unified asset naming and proxy URLs.

---

## Next Steps (when approved)
1) Implement **Phases 1–4**, deliver updated workflow JSON.  
2) Run **Test Plan A**, review outputs.  
3) Implement **Phases 5–8**, deliver final JSON.  
4) Hand off a **mini‑run report** + manifest example for W4.

