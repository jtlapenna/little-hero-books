# Workflow 3 (PNG Assembly) — **Top Path Deep Audit**

_Last updated:_ {{now}}

## Snapshot / Goal
**Goal for top path:** generate **page images** for every interior page (p00–p14) using PDFMonkey and upload each PNG to Cloudflare R2 under deterministic keys; produce a 3‑manifest with those keys and pass acceptance/QA.

> Note: Current implementation uses **PNG** images (one PNG per page) via a PDFMonkey **image template**. If the intent is per‑page **PDFs** instead of PNGs, we can switch the template + meta to `_type: "pdf"` or generate a single multi‑page PDF and split. For now, the code and wiring clearly target PNGs.

---

## High‑level Wiring (top path)
1) **Webhook Trigger (Book Assembly)** → 2) **Extract Manifest URL (3)** → 3) **Download 2B Manifest** → 4) **Build Assembly Input From Manifest** → 5) **Get Order Ready for Assembly** → 6) **Load Canonical Assets** → 7) **Load Story & Character Poses (3A)** → 8) **Load story text (+ ensure characterImages)** → 9) **Generate Complete HTML** → 10) **Generate Page Preview Images** → 11) **Generate Page Image with PDFMonkey** → 12) **Poll PDFMonkey Image until ready** → 13) **Download Page Image from PDFMonkey** → 14) **Upload Page Preview Image to R2** → 15) **Collect Page Preview Images** → 16) **Merge** → 17) **Build 3A Manifest** → 18) **QA Gate (3A Phase 4)** → 19) **Prep Manifest Upload (3)** → 20) **Upload 3 Manifest to R2** → 21) **Mark Previews Ready (3A status)** → 22) **Log Assembly Results** → 23) **Acceptance Tests (3A Phase 5)**.

**Debug/Preview (disconnected from production path):**
- **Build Standalone Preview** (HTML page‑stack preview w/ CSS parity) — currently not consumed downstream; safe as a debug artifact.

---

## Node‑by‑Node Observations (top path)
### 1) Extract Manifest URL (3)
- Normalizes webhook vs. wait‑resume payloads; constructs **2B manifest URL** when missing using `orderId`.
- Preserves `isFirstPass`, `statusUrl`, `requestId`, etc.; injects `backendUrl` → `https://admin.littleherolabs.com`.
- Emits `manifestKey` (2B path) for traceability.

**Notes:** Solid normalization; good logging; resilient fallbacks (e.g., deriving orderId from manifestKey).

### 2) Download 2B Manifest
- Straight HTTP GET with timeout 30s; returns manifest JSON.

### 3) Build Assembly Input From Manifest
- Validates schema `lhb.run-manifest@v2.0` and presence of `amazonOrderId`, `characterHash`, and `entries`.
- Maps `entries[]` → `processedImages[]` (poseNumber 1–12) with **backend proxy URLs**.

### 4) Get Order Ready for Assembly
- Pulls canonical order fields (from flat or `.orderData`), validates, sets **test mode** page cap via `testModePages`.

### 5) Load Canonical Assets
- Loads **backgrounds p00–p14**, ensures **p05 footprints overlay**, ensures **animal p13 appears**; sets `coverSpreadImagePath` (debug only).

### 6) Load Story & Character Poses (3A)
- Canonical story loader; builds `storyTexts[]`; constructs `characterImages.poses[]` from `processedImages` when missing.

### 7) Load story text (+ ensure characterImages)
- Personalization, animal slug/display map (tiger/cat/etc.), sets `animalImages` (appears & flying) using backend proxy URLs.

### 8) Generate Complete HTML
- Emits `pages_html` **and** `interiorPagesHTML[]` (dedication p00 + pages 1..14). Includes page CSS. Adds `pdfMonkeyTemplateId` (unused by image path) and `pdfFilename` (also unused on image path).
- **Pose mapping:** uses `PAGE_TO_POSE_MAP`; handles p13 animal only; p14 includes animal and character.
- **Overlay logic:** deterministic p05 footprints (+ optional p12), uses `getTextBoxOverlayUrl()`.

**CSS parity:** canvas 2625×2625; textbox +20% width/height; rounded corners; overlay via `background-size: contain` (full overlay visible).

### 9) Generate Page Preview Images
- Splits into **per‑page items** (15 total: p00..p14). For each:
  - Wraps HTML into a minimal document (no template literals to avoid parsing errors).
  - Assigns deterministic filenames `p00.png..p14.png` and R2 keys `book-mvp-simple-adventure/orders/{orderId}/preview-images/{file}`.
  - Sets **`pdfMonkeyImageTemplateId`** = `23277725-4AB0-446A-98C5-CB99C21822B3` and **meta** to `_type: "png"`, 2625×2625.
  - Obeys `testModePages` page limit.

### 10) Generate Page Image with PDFMonkey
- POST to `/documents` with Bearer token (hard‑coded) and payload `{ pages_html }` for each page.

### 11) Poll PDFMonkey Image until ready
- Polls up to **15 × 2s** (≈30s) for `status==='success'` and `download_url`.

### 12) Download Page Image from PDFMonkey
- Downloads binary using `pageImageDownloadUrl` from prior step.

### 13) Upload Page Preview Image to R2
- Uploads the PNG to **`little-hero-orders`** at `pageImageR2Key` (from Generate Page Preview Images by index), ensuring deterministic paths.

### 14) Collect Page Preview Images (run‑once)
- Reads original items from **Generate Page Preview Images**; constructs `pagePreviewImages[]` and progress counters.

### 15) Build 3A Manifest → QA Gate → Prep/Upload 3‑manifest
- Produces `manifest.pngGeneration.pages` map: `p00_dedication`, `p01..p14` → R2 keys.
- QA enforces sizes (2625 interior, 5203×2625 cover), presence of all pages, p05 overlay declaration, and basic asset sanity.

### 16) Mark Previews Ready → Log → Acceptance Tests
- Finalizes status & report. Acceptance checks sizes, coverage, QA pass, collector consistency.

---

## Data Model & Filenames (interior)
- **File names:** `p00.png` … `p14.png`.
- **R2 key pattern:** `book-mvp-simple-adventure/orders/{AMAZON_ORDER_ID}/preview-images/{FILE}` (bucket `little-hero-orders`).
- **Manifest keys:** `{ p00_dedication, p01..p14 }` under `manifest.pngGeneration.pages`.

---

## PDFMonkey Integration — Status & Risks
- **Templates:** image template ID hard‑coded to `23277725-4AB0-446A-98C5-CB99C21822B3` for page images.
- **Auth:** **hard‑coded Bearer** token in two nodes (create & poll). _Security TODO_: move to n8n Credentials.
- **Throughput:** 15 sequential POSTs + polls; worst‑case latency if PDFMonkey is slow. _Idea:_ increase poll attempts/backoff or add a queue/retry gate.
- **Payload shape:** using `pages_html` (string) per item; wrapped HTML ensures no template‑literal parser issues.

---

## CSS / Asset Parity Notes
- **Font asset naming inconsistency** across nodes:
  - `custom-font.ttf/woff2` vs **`CustomBook.ttf`** paths; some nodes reference `fonts/CustomBook.ttf`, others `fonts/custom-font.ttf`.
  - **Impact:** 404s on font in some contexts; rendering still works (fallback font), but typography may differ.
  - **Action:** pick one canonical name (recommend `custom-font.*`) and update all CSS/HTML builders + templates.

- **Text box overlay:** implemented via `background-size: contain;` so rounded corners show (no overflow clipping issues). Width/height +20% present.

- **Animal p13 width:** logic targets **≈1100px final** on 2625 canvas (computed from legacy → scaled); p14 animal width fixed at 1250px.

---

## Reliability & Edge Cases
- **Polling window** (30s) may be insufficient under load. Suggest 60–90s max or adaptive backoff.
- **Collector vs. uploader:** collector derives from the planned R2 keys (source items), not from confirmation of upload completion. Low risk in practice because the S3 node is directly upstream, but we could add a small guard (e.g., verify `Upload` success status or re‑list R2 in test runs).
- **Test Mode:** respected in Generate Page Preview Images; acceptance test compares collected count vs. expected (uses `testModePages` when present).

---

## Security & Config Hygiene
- **Move PDFMonkey token** to n8n credentials; keep template IDs configurable via a shared config node.
- **Avoid leaking URLs:** all public asset references go through backend proxy (`/api/assets/{key}`) — good.

---

## What Looks Correct / Ready
- Deterministic filenames & R2 keys ✅
- HTML generation for p00..p14 with overlays and animal logic ✅
- One‑item‑per‑page generation and upload ✅
- 3‑manifest shape for downstream (W4) ✅
- QA + Acceptance checks ✅

---

## Gaps / Fixups Recommended (top path)
1) **Font asset unification** (choose `custom-font.*` or `CustomBook.*` and standardize everywhere, including PDFMonkey templates).
2) **Credentials hardening** for PDFMonkey (n8n credentials) + optional **config node** for template IDs.
3) **Polling window/backoff** increase for PDFMonkey status checks (e.g., 30–45 attempts @ 2s, or 20 attempts with incremental backoff).
4) **Preview nodes wiring:** Ensure _Build Standalone Preview_ remains **debug‑only** (do not feed production path) but is connected from _Generate Complete HTML_ (it currently is in the JSON; if it appears disconnected in UI, reconnect its input only).
5) **Strict acceptance on uploaded count**: optionally assert that `Upload Page Preview Image to R2` ran **pages.length** times (e.g., compare S3 node execution data) before setting `book_assembly_previews_ready`.

---

## Open Questions (to confirm before changes)
- Do we want to **keep PNGs** per page (current behavior) or switch to **per‑page PDFs** (or one **combined PDF** for interiors)?
- Any required **naming changes** for the preview images (e.g., include child name or character hash in filenames)?
- Do we need **additional overlays** (beyond p05/p12) on any other pages in this print run?

---

## Ready for Implementation Plan (Top Path)
When you say go, I’ll propose a precise, step‑by‑step plan to: unify font assets, move auth to credentials, expand polling, add a simple upload‑count guard, and—if desired—change the generation type (PNG→PDF) or add an option for a **single combined interior PDF** alongside the PNG set.
