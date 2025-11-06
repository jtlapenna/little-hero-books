# LHB – Workflow 3 Node Map (for 3A/4 refactor)

**Scope:** Deep audit of current **LHB – 3 – Book Assembly** workflow to support the **PNG‑first** plan and split into **Workflow 3A (PNG generation + approvals)** and **Workflow 4 (PDF assembly + Lulu submit)**.

**Inputs reviewed:**
- Workflow JSON: `LHB - 3 - Book Assembly.json`
- Blueprint: `Workflow_Update_Blueprint.md` (v3.1 updates reflected below)

---

## Global observations & refactor goals

- **Dimension mismatch:** Current preview/PDF CSS often uses **2550×2550**; blueprint confirms **2625×2625** for interior pages and **5203×2625** for cover spread. All HTML/CSS, preview generators, and validations must be updated.
- **Node naming drift:** Two nodes are mislabeled vs their code:
  - **“Load Generated Characters”** actually loads **background images**.
  - **“Load Background Images”** actually composes **story text + characterImages**.
  - There’s also **“Load story text (+ ensure characterImages)”** which does similar work with personalization + animals.
  → Consolidate into a single canonical **“Load Story & Character Poses”** (personalized) and a separate **“Load Background Images”**.
- **PDF generation inside LHB‑3:** Current workflow builds a **complete PDF** and uploads to R2. Under **PNG‑first**, PDF creation moves to **Workflow 4**. LHB‑3 becomes **3A** and outputs **16 PNGs** (00 dedication, 01–14 interior, cover spread), a **3A manifest**, and **no customer notifications** (handled by backend later).
- **Manifest dependencies:** LHB‑3 pulls the Stage‑2B manifest. Keep that; 3A will still need it to anchor identity/order context.
- **Pose count:** SW1/2/2B will deliver **13 poses** (pose 13 = cover). LHB‑3/3A should map **pose 1–12** to interior pages and reserve pose **13** for the **cover**.
- **Secrets:** PDFMonkey Bearer tokens are hardcoded in 3 places. Replace with n8n credentials.
- **Wait/poll:** Poll loops are reasonable; ensure they’re robust to timeouts, return merged context intact, and are annotated clearly.

---

## Wiring (current)

**Happy path (current LHB‑3):**
```
Webhook → Extract Manifest URL (3) → Download 2B Manifest → Build Assembly Input
→ Get Order Ready → Load Generated Characters (actually BGs)
→ Load Background Images (actually story+characterImages)
→ Load story text (+ ensure characterImages)
→ Generate Complete HTML
   ├─→ Generate Page Preview Images → (loop) PDFMonkey image → poll → download → upload R2
   │    → Collect Page Preview Images
   └─→ Prepare PDFMonkey Data → PDFMonkey PDF → Wait → Poll → Download PDF → Upload PDF to R2

Upload PDF to R2 + Collect Page Preview Images → Merge Preview Images + PDF Data
→ Build 3 Manifest → Prep Manifest Upload (3) → Upload 3 Manifest to R2
→ Update Order Status Complete → Log Assembly Results
```

**Key branches:**
- **Branch A (images):** Generates per‑page PNGs via PDFMonkey images API and uploads to R2.
- **Branch B (PDF):** Generates a full PDF via PDFMonkey PDF API and uploads to R2. (To be migrated to Workflow 4.)

---

## Node‑by‑node map (function, structure, wiring, and refactor notes)

### 1) **Webhook Trigger (Book Assembly)1** *(n8n Webhook)*
- **Purpose:** Entry point; accepts either flat payload or `body` wrapper.
- **Inputs:** HTTP POST.
- **Outputs:** Forwards raw to **Extract Manifest URL (3)**.
- **Refactor (3A):** Keep unchanged; blueprint v3.1 = **no webhook contract change**, no auto customer notify.

### 2) **Extract Manifest URL (3)** *(Code)*
- **Purpose:** Normalize inbound; resolve **2B manifest URL/key**, orderId, webhookUrl, isFirstPass, backendUrl.
- **Structure:** Robust multi‑pattern extraction; constructs 2B manifest URL if missing.
- **Outputs:** Complete context for downstream.
- **Refactor (3A):** Keep logic; set **backendUrl** as canonical for asset proxying. No change to external contract.

### 3) **Download 2B Manifest** *(HTTP Request)*
- **Purpose:** Fetch **Stage‑2B** manifest JSON.
- **Refactor (3A):** Keep. Add retry/backoff. Validate `schema`.

### 4) **Build Assembly Input From Manifest** *(Code)*
- **Purpose:** Transform 2B entries → `processedImages[]` with proxy URLs; lift order/book specs; carry `characterHash`.
- **Refactor (3A):** Keep. Ensure Pose **1–12** mapped; **13** reserved for cover.

### 5) **Get Order Ready for Assembly** *(Code)*
- **Purpose:** Initialize assembly state (`status`, counters, specs); validate essential fields.
- **Current:** `totalPagesRequired: 14`.
- **Refactor (3A):** Set **15** (00 dedication + 1–14 interior). Keep counters/time tracking; retain pass‑through of `processedImages`.

### 6) **Load Generated Characters** *(Code; misnamed → loads backgrounds)*
- **Purpose:** Build `backgroundImages[]` for pages 1–14 using backend `/api/assets/...` proxy.
- **Refactor (3A):**
  - **Rename** to **Load Background Images**.
  - Expand to **15** backgrounds (page **00** dedication) **and** separate **cover spread** background(s) (or let HTML compose cover from front/back assets).
  - Verify R2 keys and slugs.

### 7) **Load Background Images** *(Code; misnamed → story+characterImages)*
- **Purpose:** Builds **story text** array; synthesizes **processedImages** fallback; composes **characterImages.poses**.
- **Refactor (3A):** Consolidate logic into **Load Story & Character Poses** (with personalization & animal assets—see next node). This node can be **removed** after consolidation.

### 8) **Load story text (+ ensure characterImages)** *(Code)*
- **Purpose:** Personalized **story texts**; animal selection (normalized slug); ensure `characterImages.poses` from `processedImages` with backend proxy URLs.
- **Refactor (3A):** Keep as the **canonical** story/poses loader. Ensure page‑to‑pose mapping remains explicit (pose 1→p1 … pose 12→p12). Do **not** include cover pose (13) here.

### 9) **Generate Complete HTML** *(Code)*
- **Purpose:** Emit **`pages_html`** for current interior set with inline CSS + position maps; also sets `pdfFilename` and template IDs.
- **Current:** Builds **14** pages, includes character/animal overlays; PDF CSS uses **8.5"**; preview base CSS targets **2550px**.
- **Refactor (3A):**
  - Interior **15 pages @ 2625×2625** (include **page‑00 dedication** in the same loop).
  - **Add cover spread HTML** @ **5203×2625** using pose **13**; reserve barcode area; no spine text.
  - Strip any PDF‑specific bits; this node becomes the **single source of truth** for HTML used by image generation.
  - Validate **font URLs** and **overlay assets** via backend proxy.

### 10) **Generate Page Preview Images** *(Code)*
- **Purpose:** Split `pages_html` into per‑page HTML blocks; convert inch/mm → px; inject preview CSS; emit items with R2 keys.
- **Current:** Targets **2550px** canvas; emits page items p1–p14.
- **Refactor (3A):**
  - Update to **2625px** canvas.
  - Include **p00 dedication**.
  - **Do not** include cover here; create a **separate cover image branch** using cover HTML emitted by node 9.

### 11) **Generate Page Image with PDFMonkey** *(HTTP; per‑item)*
- **Purpose:** Create PNG per page via PDFMonkey **image** API (status=pending, _type=png, 2550×2550).
- **Refactor (3A):** Use **2625×2625**; replace hardcoded Bearer with credentials; ensure _width/_height match; keep batch size = 1.

### 12) **Poll PDFMonkey Image until ready** *(Code; per‑item)*
- **Purpose:** Poll document status until success; capture `download_url`.
- **Refactor (3A):** Keep. Consider exponential backoff + max attempts (e.g., 15–20).

### 13) **Download Page Image from PDFMonkey** *(HTTP; per‑item)*
- **Purpose:** Fetch binary PNG for each page.
- **Refactor (3A):** Keep.

### 14) **Upload Page Preview Image to R2** *(S3; per‑item)*
- **Purpose:** Upload rendered page PNG to `book-mvp-simple-adventure/orders/{orderId}/preview-images/...`.
- **Refactor (3A):** Keep. Ensure content‑type, cache headers, and key naming (`page-00-14_preview.png`).

### 15) **Collect Page Preview Images** *(Code; run once)*
- **Purpose:** Aggregate page previews into structured array, compute progress, totals.
- **Refactor (3A):** Keep; adjust to **15** interior pages; output `pagePreviewImages` with **pageNumber 0–14**.

### 16) **Prepare PDFMonkey Data** *(Code)*
- **Purpose:** Build **document** payload for PDFMonkey **PDF** API.
- **Refactor (3A):** **Remove** from 3A (PDF moves to **Workflow 4**).

### 17) **Generate PDF with PDFMonkey** *(HTTP)*
- **Purpose:** Create **full PDF** of the book.
- **Refactor (3A):** **Remove** from 3A.

### 18) **Wait** *(Wait)*
- **Purpose:** Delay before polling PDF.
- **Refactor (3A):** **Remove** from 3A.

### 19) **Poll PDFMonkey until ready** *(Code)*
- **Purpose:** Poll **PDF** status; returns `pdfDownloadUrl` and `pdfR2Key`.
- **Refactor (3A):** **Remove** from 3A.

### 20) **Download PDF from PDFMonkey** *(HTTP)*
- **Purpose:** Download generated PDF file.
- **Refactor (3A):** **Remove** from 3A.

### 21) **Upload PDF to R2** *(S3)*
- **Purpose:** Upload full PDF to R2.
- **Refactor (3A):** **Remove** from 3A.

### 22) **Prepare PDF Metadata for Merge** *(Code)*
- **Purpose:** Strip binary; pass PDF metadata to merge.
- **Refactor (3A):** **Remove** from 3A.

### 23) **Merge / Merge Preview Images + PDF Data** *(Merge x2)*
- **Purpose:** Combine branches (previews + PDF metadata) for manifest build.
- **Refactor (3A):** Replace with a single combine for **(interior previews + cover preview)**.

### 24) **Build 3 Manifest** *(Code)*
- **Purpose:** Create **3‑manifest** referencing upstream 2B + page previews + PDF info.
- **Refactor (3A):** Build **3A manifest**:
  - `status: "pending_admin_review"`
  - `pngGeneration: { dedicationImage, storyImages[14], coverSpreadImage }`
  - No PDF fields. Save as `manifests/3a-manifest.json`.

### 25) **Prep Manifest Upload (3)** *(Code)*
- **Purpose:** Serialize manifest JSON to binary for S3 upload.
- **Refactor (3A):** Keep; change key to `.../manifests/3a-manifest.json`.

### 26) **Upload 3 Manifest to R2** *(S3)*
- **Purpose:** Upload manifest JSON to `little-hero-orders`.
- **Refactor (3A):** Keep; ensure proper content‑type and cache.

### 27) **Update Order Status Complete** *(Code)*
- **Purpose:** Marks `book_assembly_completed`, sets `finalBookUrl` (derived from publicR2Url), timing metrics.
- **Refactor (3A):** Rename to **“Mark Previews Ready”**; set status to `book_assembly_previews_ready` and do **not** set `finalBookUrl`. Record PNG counts and timings.

### 28) **Log Assembly Results** *(Code)*
- **Purpose:** Console log summary.
- **Refactor (3A):** Keep; update fields to reflect PNG generation and 3A manifest path. (Optional: Post to internal log endpoint.)

---

## Cover branch (to add in 3A)

**New:**
- **Generate Cover HTML** (from node 9 output) → **Generate Cover Image with PDFMonkey** (5203×2625) → **Poll** → **Download** → **Upload Cover PNG to R2** → feed to **Collect All PNG URLs / Build 3A Manifest**.
- Use **pose 13** for the character on cover; add **barcode safe area** and **no spine text**.

---

## Consolidation & renames (proposed)

| Current Node Name | Proposed Canonical | Action |
|---|---|---|
| Load Generated Characters (actually backgrounds) | Load Background Images | **Rename** + expand to 15 pages + cover assets or leave cover to HTML |
| Load Background Images (actually story+poses) | Load Story & Character Poses | **Remove** (merge into next node) |
| Load story text (+ ensure characterImages) | Load Story & Character Poses | **Keep** as canonical personalized story/pose composer |
| Prepare PDFMonkey Data / Generate PDF / Wait / Poll PDF / Download PDF / Upload PDF / Prepare PDF Metadata | (moved to Workflow 4) | **Remove** from 3A |
| Update Order Status Complete | Mark Previews Ready | **Rename** + change status fields |
| Build 3 Manifest | Build 3A Manifest | **Modify** structure + key path |

---

## Parameters & constants to update

- **Dimensions:** 2625×2625 (interior) and 5203×2625 (cover).
- **Counts:** `totalPagesRequired = 15`; previews expected = **16 PNGs**.
- **Pose mapping:** Interior 1–12 from `processedImages`; cover uses pose 13.
- **Template IDs:** Replace hardcoded PDFMonkey IDs with credentials/vars; ensure one **image** template (PNG) and separate **PDF** templates used in Workflow 4.
- **Bearer tokens:** Replace inline tokens with n8n credentials.
- **R2 keys:** Standardize under `book-mvp-simple-adventure/orders/{orderId}/...` with subfolders `preview-images/` (3A) and `pdfs/` (4).

---

## Data contracts & manifests

- **Input (3A):** Unchanged webhook; expects 2B manifest resolvable.
- **Output (3A):** `3a-manifest.json`:
  ```json
  {
    "schema": "lhb.run-manifest@v2.0",
    "order": { "amazonOrderId": "...", "publicR2Url": "..." },
    "upstream": { "stage2": { "posesManifestR2Key": "..." } },
    "pngGeneration": {
      "completedAt": "...",
      "totalPngs": 16,
      "dedicationImage": { "pageNumber": 0, "url": "..." },
      "storyImages": [{ "pageNumber": 1, "url": "..." }, ...],
      "coverSpreadImage": { "url": "..." }
    },
    "status": "pending_admin_review",
    "approvals": {
      "admin": { "status": "pending" },
      "customer": { "status": "not_ready" }
    },
    "nextWorkflow": { "trigger": "workflow_4" }
  }
  ```
- **Input (4):** 3A manifest URL + approved flag.
- **Output (4):** `4-manifest.json` with interior/cover PDF URLs + Lulu submission info.

---

## Quality gates & checks (what I’ll verify when refactoring)

- Manifest schema checks at each fetch/build.
- Page/pose alignment (explicit `PAGE_TO_POSE_MAP` retained; pose 13 excluded from interior pages).
- All asset URLs route via **backend proxy** (`/api/assets/...`).
- Font loading is deterministic in both image and PDF flows.
- Poll loops preserve context (amazonOrderId, filenames, R2 keys).
- Merged items order is deterministic before manifest build.
- S3 uploads set correct MIME types and cache controls.

---

## Minimal change plan to reach 3A

1) Rename/massage **Load Backgrounds** vs **Load Story & Character Poses** (remove duplicate node).
2) Update **Generate Complete HTML** to emit **interior (0–14)** and **cover** HTML at correct sizes.
3) Split **preview generation** into two branches: **interior loop (15)** and **cover (1)**.
4) Remove all **PDF** nodes from 3A.
5) Adjust collectors/merges to produce a **3A manifest** and upload it.
6) Update status/log nodes accordingly.

---

## Ready‑to‑use checklist per node (what I’ll look at when editing)

- [ ] Webhook: unchanged path; confirm response mode.
- [ ] Extract Manifest: keep constructs; set default `backendUrl`.
- [ ] Download 2B: add retries; validate `schema`.
- [ ] Build Assembly Input: sorted `processedImages` 1–12; pose 13 kept aside.
- [ ] Get Order Ready: `totalPagesRequired = 15`.
- [ ] Load Backgrounds: 15 interior BGs; define cover BGs as needed.
- [ ] Load Story & Poses: single canonical node; animal images via proxy; no cover.
- [ ] Generate HTML: outputs `{ interiorPagesHTML[], coverHTML }`; sizes updated; inline CSS only.
- [ ] Interior Preview branch: 2625×2625; per‑item loop.
- [ ] Cover Preview branch: single 5203×2625.
- [ ] Uploads: keys & MIME types; cache headers.
- [ ] Collector: returns `{ dedicationImage, storyImages[], coverSpreadImage }`.
- [ ] Build 3A Manifest: structure per blueprint; `status: pending_admin_review`.
- [ ] Upload 3A Manifest: `manifests/3a-manifest.json`.
- [ ] Status/log: mark previews ready; no `finalBookUrl`.

---

## Items to carry forward into Workflow 4 (PDF + Lulu)

- Read **3A manifest**; fetch 16 PNGs; validate dimensions.
- Generate **Interior PDF (15 pages @ 2625)** and **Cover PDF (5203×2625)**.
- Validate page counts/dimensions; upload PDFs; build **4 manifest**; submit to **Lulu**.

---

**End of node map.** This canvas is my working reference while implementing 3A/4.

