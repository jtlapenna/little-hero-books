# Workflow 4 — Print Fulfilment (Deep Audit & Plan)

_Last updated: 2025‑11‑07 (PT)_

## TL;DR
Workflow JSON shows a partial mash‑up of Book Assembly (Workflow 3) and Print Fulfilment (Workflow 4). The PDF generation + R2 upload path is mostly wired, but the Lulu submission path is mocked and **disconnected**. There are several naming inconsistencies, hardcoded secrets, and a critical node reference bug. We should (1) separate responsibilities cleanly, (2) remove Workflow‑3 logic from W4, (3) harden PDFMonkey + R2 steps, and (4) properly implement Lulu API flows (auth, payload, webhooks, status updates, retries).

---

## A. What Workflow 4 is supposed to do (per spec)
1) Receive a **manifest** from a webhook trigger.
2) Receive **page images** (already composed PNGs) of the book.
3) Send those images to **PDFMonkey** to create a single interior PDF (and include **cover PDF**/wrap if needed).
4) Upload the finished **PDF(s)** to **R2**.
5) Submit a **Lulu Print Job** using those assets.
6) Persist a **4‑manifest** + update order state + expose status and artifact URLs.

---

## B. High‑level dataflow found in the JSON
- **Webhook Trigger → Extract Manifest URL → Download Manifest → Build Assembly Input From Manifest → Get Order Ready → Generate Complete HTML → Prepare PDFMonkey Data → Generate PDF → Wait → Poll Ready → Download PDF → Upload to R2 → Merge → Prepare PDF Metadata → (branch ends)**
- **Query Approved Orders → Check Human Approval → Validate Print Requirements → Mock Submit to Lulu → Process Lulu Response → Build 4 Manifest → Prep Manifest Upload → Upload 4 Manifest to R2 → Update Order Status Complete → Log Results**

**Observation:** This is effectively **two parallel flows**. The Lulu branch is mocked and **not connected** to the PDF branch’s outputs.

---

## C. Node‑by‑node audit (issues, risks, fixes)

### 1) Webhook Trigger (Book Assembly) — Mis‑scoped
- **Problem:** Name and downstream logic belong to **Workflow 3** (assembly), not W4.
- **Fix:** Rename to `Webhook Trigger (Workflow 4)`, accept `4‑manifest` or `2B/3 manifest + page image list`. Normalize to an internal `w4Payload`.

### 2) Extract Manifest URL — Workflow 3 logic leak
- Builds a **2B manifest URL** and sets `backendUrl`. This is W3 behavior.
- **Fix:** In W4 we should already have page images (or a URL list) — no need to reconstruct 2B manifest URL here. Replace with an **Extract W4 Input** node that validates: `orderId`, `pageImageUrls[]`, `coverUrl`, `pdfMonkeyTemplateId`, etc.

### 3) Download 3 Manifest — Naming inversion
- Node name says **3**, but Extract node is pointing to **2B**. Confusing.
- **Fix:** Remove if W4 doesn’t need to read upstream manifests. If needed for metadata, name explicitly (e.g., `Download 2B Manifest (for metadata)`).

### 4) Build Assembly Input From Manifest & Get Order Ready for Assembly — Out of scope
- These normalize pose/character inputs for page composition (W3 concerns).
- **Fix:** Remove from W4. W4 should not compose HTML pages; it should accept **already‑rendered page images**.

### 5) Generate Complete HTML — Out of scope for W4
- Generates `pages_html` with text boxes, character positioning, etc. That’s W3.
- **Fix:** Replace with a minimal `Build PDFMonkey Payload (Images → PDF)` node that wraps provided **page image URLs** into `pages_html` as simple `<img>` per page (no text overlay logic).

### 6) Prepare PDFMonkey Data — OK pattern, but payload should be images‑first
- Currently wraps `pages_html` from W3 logic.
- **Fix:** Feed the simplified `pages_html` generated from **page images list**.

### 7) Generate PDF with PDFMonkey — **Hardcoded token**
- **Problem:** `Authorization: Bearer …` is hardcoded.
- **Fix:** Move to **Credentials**. Parameterize via env variables. Add per‑job **meta._filename**.

### 8) Wait (25s) + Poll PDFMonkey until ready (15×2s) — Timing
- ~55s combined. OK, but consider PDFMonkey job sizes; some books might exceed.
- **Fix:** Make retries and delay **configurable**. Fail with a helpful error. Capture latency metrics.

### 9) Poll PDFMonkey until ready — Context merge is good, but…
- **Bug:** Constructs `pdfR2Key` with `${amazonOrderId}` but doesn’t validate presence. It pulls `amazonOrderId` from `htmlCtx`/`manifestCtx` which are W3 artifacts.
- **Fix:** Ensure `orderId`/`amazonOrderId` is present in W4 input contract and validated earlier.

### 10) Download PDF → Upload PDF to R2
- **Risk:** S3 node doesn’t set `ContentType: application/pdf`.
- **Fix:** Add content type. Consider server‑side encryption (SSE). Confirm key: `book-mvp-simple-adventure/orders/${ORDER}/${FILENAME}` aligns with **public proxy** paths.

### 11) Merge (combineByPosition)
- Connects `Upload PDF to R2` and `Download PDF from PDFMonkey`. **Order** matters; currently each side emits 1 item — OK.
- **Risk:** If we add more branches later, position can desync.
- **Fix:** For reliability, prefer `combineByKey` on a stable `orderId`.

### 12) Prepare PDF Metadata for Merge → Validate Print Requirements (mock path dependency)
- **Issue:** `Validate Print Requirements` expects fields like `final_book_url`, `final_cover_url`, `shipping_address`, which are not produced by the PDF path.
- **Consequence:** In the current graph these nodes are **disconnected** and will never run for the PDF output.
- **Fix:** After successful R2 upload, enrich the order (attach `interiorPdfR2Key`, `coverPdfR2Key`/`coverPng`), then call **Validate (W4)** that checks **exact Lulu requirements**.

### 13) Lulu path is **mocked and disconnected**
- Query/Check/Validate/Mock Submit/Process Lulu → Build 4 Manifest → Upload manifest → Update status → Log results.
- **Issues:**
  - These nodes are **not wired** to the PDF path output.
  - `Validate Print Requirements` is built for a different data shape.
  - `Mock Submit` builds a Lulu payload but uses `cover: final_cover_url` (a PNG?), and `interior: final_book_url` (should be a **PDF** URL). Product config is a single string `softcover-8x10-standard` — likely not Lulu’s current schema.
- **Fix:** Replace with **real Lulu calls** using **interior PDF** (R2 presigned or Lulu upload session), **cover PDF** (wrap), accurate **package specs** (trim, color, paper, binding), **shipping level**, and **recipient**. Store returned Lulu **print job id**.

### 14) Build 4 Manifest — **Critical bug**
- **Bug:** References `$items('Download 2B Manifest', ...)` but such a node **does not exist** (here it’s `Download 3 Manifest`). This will throw at runtime.
- **Fix:** Either rename the node reference or (better) remove dependency and take identity directly from the **W4 input**. Also: it currently writes **`3‑manifest.json`** (!) — wrong stage number.

### 15) Prep Manifest Upload → Upload 4 Manifest to R2
- **Path:** `book-mvp-simple-adventure/orders/${orderId}/manifests/3-manifest.json` — wrong filename.
- **Fix:** Write `4‑manifest.json`. Include Lulu job refs, costs, shipping SLAs, status URLs, and a pointer to interior/cover R2 keys.

### 16) Update Order Status Complete — Wrong concerns + URL bug
- **Problem:** Sets `status: 'book_assembly_completed'` and computes `finalBookUrl` using `publicR2Url`, which is likely **null** (and differs from R2 proxy path). This belongs to W3.
- **Fix:** Replace with `status: 'print_submitted'` (or `print_ready` → `print_submitted`) and store Lulu job metadata.

### 17) Secrets & credentials
- **Hardcoded PDFMonkey token**; S3 credential by id is fine per your constraints.
- **Fix:** Move to credentials where possible; if hardcoding is required short‑term, guard via a single `CONFIG` node and make it obvious.

### 18) Observability
- Sparse structured logs. No latency metrics for PDF creation/upload. No Lulu webhook handlers.
- **Fix:** Add `Start/End/Duration` fields, attach `runId`, push a compact log line per major step. Add a `Lulu Webhook Receiver` in a separate workflow to store status transitions (CREATED → IN_PRODUCTION → SHIPPED, etc.).

---

## D. Proposed clean architecture for Workflow 4 (v1)

1. **Webhook (W4 input)** → Validate/normalize into:
   - `orderId`, `customer` (name, email), `shippingAddress{}`
   - `interiorPages[]` (URLs for page images) OR `interiorPdfR2Key` if already built
   - `coverPdfR2Key` or `coverPngUrl` (we likely need a proper **cover PDF** wrap file)
   - `printOptions` (trim, color, paper, binding, qty, shipping service)

2. **If pages provided:** Build **minimal pages_html** (one `<img>` per page, full‑bleed) → **PDFMonkey Create** → **Poll** → **Download PDF** → **Upload to R2** (`interiorPdfR2Key`), set `contentType: application/pdf`.

3. **Cover handling:** Prefer a **cover PDF** (spread with spine/bleeds) produced upstream. If only a PNG exists, run a **Cover Wrap Builder** (template to PDF) before Lulu.

4. **Lulu submission (real):**
   - Either **upload files to Lulu’s assets** first (presigned PUT) and reference asset IDs, or provide **public file URLs** if Lulu accepts them for your plan.
   - Build **line_items** with accurate package: trim = 8.5×8.5, color, paper, binding = perfect bound, cover finish = matte, etc.
   - `shipping_address`, `contact_email`, `shipping_level`.
   - Receive job `id`, `status`, `estimated_ship_date`, cost breakdown.

5. **Persist `4‑manifest.json`** with:
   - identity `{ orderId, characterHash }`
   - artifacts `{ interiorPdfR2Key, coverPdfR2Key }`
   - lulu `{ jobId, status, cost, estShipDate }`
   - audit `{ createdAt, durations }`

6. **Update order record** (DB/API): status → `print_submitted` and store Lulu refs.

7. **Emit structured log**.

---

## E. Minimal pages_html (images → PDF) pattern
```html
<!-- One page per image, full-bleed -->
<style>
  @page { size: 8.5in 8.5in; margin: 0; }
  .page { width: 8.5in; height: 8.5in; page-break-after: always; }
  .page > img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
${images.map(src => `<div class="page"><img src="${src}" alt=""/></div>`).join('')}
```

---

## F. Hardening & hygiene checklist
- [ ] Remove W3 nodes and references; keep W4 focused on **images → PDF → R2 → Lulu**.
- [ ] Replace **hardcoded PDFMonkey token** with credentials.
- [ ] Add **contentType=application/pdf** on S3 upload.
- [ ] Rename `Build 4 Manifest` → write **`4‑manifest.json`**; remove `$items('Download 2B Manifest', …)` bug.
- [ ] Wire Lulu submission **after** successful R2 upload.
- [ ] Replace Mock Lulu with **real API** (prod/sandbox switch).
- [ ] Validate that **cover** is a proper **cover PDF** (or build one).
- [ ] Add retries/backoff for network ops.
- [ ] Add structured logs + durations; emit a compact summary.
- [ ] If required, create **Lulu webhook handler** workflow for status updates.

---

## G. Open questions & your answers
1) **Input contract** → _Your answer:_ W4 will receive a **list of page image URLs** to send to PDFMonkey, which compiles all images into a single interior PDF.
2) **Cover asset** → _Your answer:_ Currently only a **cover PNG**; we need to convert this to a **cover PDF**. You’re open to revising Workflow 3 to output a cover PDF if Lulu requires it.
3) **Trim/Bleed & size** → _Your note:_ Belief is that full‑bleed requires **8.75″ × 8.75″** (0.125″ bleed on all sides) and your PNGs were created ~2626×2625 px. _Action:_ I verified Lulu docs confirm full‑bleed requires adding **0.125″** on each side (→ 8.75″ × 8.75″ for 8.5″ × 8.5″ trim) and that Lulu’s Print API requires **one multipage interior PDF + one single‑page cover PDF**.
4) **Lulu auth/mode** → _Your answer:_ You have a Lulu account and will set up API + sandbox when ready.
5) **Order updates** → _Your answer (from other agent):_ Write **directly to Supabase** (not Admin API). Use REST `PATCH` filtered by `amazon_order_id` or `orderId`, include `apikey` and service‑role `Authorization`. Fields and milestones provided (started → interior/cover PDF ready → submitted → status updates → shipped/tracking). Source of truth is Supabase; `4‑manifest.json` is for audit.

---

## H. Implementation plan (locked from answers)
1) **Extract & Validate W4 Input**
   - Expect: `orderId`, `amazonOrderId` (if present), `pageImageUrls[]` (public/proxy URLs), optional `coverPngUrl`, `printOptions`, `customer`, `shippingAddress`.
   - Write Supabase: `status = print_fulfillment_in_progress`, `workflow_step = 4-print-fulfillment`, timestamps.

2) **Interior (Images → PDF)**
   - Build minimal `pages_html` (full‑bleed): set Template/Page size to **8.75in × 8.75in**, margin `0`.
   - `<img>` per page with `width:100%; height:100%; object-fit:cover;`.
   - PDFMonkey: create document, poll until `ready`, download PDF.
   - Upload to R2 with **ContentType: application/pdf**. Persist `interiorPdfR2Key`.
   - Supabase update: `bookPdfUrl`, timestamps.

3) **Cover (PNG → Cover PDF)**
   - If `coverPdfR2Key` not provided: run **Cover Wrap Builder** template to a **single‑page cover PDF** (front+spine+back on one canvas) sized for **8.75in × 8.75in** front/back plus calculated **spine width** (depends on page count, paper, binding). For MVP, we can do **no‑spine** placeholder only if Lulu allows (usually **not**; spine required for perfect bound). Prefer revising **Workflow 3** to output the final cover PDF using Lulu’s cover calculator.
   - Upload cover PDF to R2. Persist `coverPdfR2Key`. Supabase update: `coverPdfUrl`.

4) **Lulu Submission (real API)**
   - **Files:** Provide **interior PDF (multipage)** and **cover PDF (single page)** via downloadable URLs. (Confirmed by Lulu docs.)
   - **Product config:** 8.5"×8.5" trim, color interior, paper/binding/finish per your defaults. Shipping level default.
   - **API flow:** (a) Option A: direct file URLs in `line_items.files` if supported; (b) Option B: create **assets** via presigned PUT, then reference asset IDs in the print job. Capture `jobId`, `status`, `estimated_ship_date`, `cost`.
   - Supabase update: set `status = print_submitted`, store Lulu IDs/status, timestamps.

5) **Persist 4‑manifest.json**
   - Identity (orderId, amazonOrderId), artifacts (R2 keys), Lulu meta, timings, and logs. Write to `.../manifests/4-manifest.json`.

6) **Observability & Webhooks**
   - Add structured logs & durations per step.
   - Create a separate **Lulu Webhook Receiver (W4‑webhooks)** to update Supabase on status changes (e.g., `IN_PRODUCTION`, `SHIPPED`), store tracking data.

7) **Safety & Retries**
   - Poll windows configurable. Network retries with backoff.
   - Fail fast with actionable errors; mark for manual review.

---

## I. Risk register
- **Coupling to W3:** Current JSON mixes concerns → fragile.
- **Secrets exposure:** Hardcoded PDFMonkey token.
- **Naming drift:** 2B/3/4 manifest names inconsistent → operator confusion.
- **Asset readiness:** Cover PNG vs wrap PDF mismatch.
- **R2 ACLs:** Public vs signed access affects Lulu integration.
- **Timing:** PDF generation latency may exceed current polling window.

---

## J. Next steps
- **Decisions locked**
  - **Files:** Interior PDF (multipage) + Cover PDF (single-page wrap). Product is **8.5×8.5 trim**; artwork must be **8.75×8.75** (bleed). W4 will generate interior PDF from page image URLs; W3 will be revised to output the **cover PDF** with computed spine width (or zero-spine for saddle-stitch fallback).
  - **Access:** R2 assets remain **private**. W4 will generate **short‑lived signed GET URLs** for Lulu submission and store only the R2 keys + Lulu job refs in Supabase.
  - **Defaults (proposed):** **Premium Color**, **80# text** interior, **Perfect Bound**, **Matte cover**. Rationale: best perceived quality + durability, clear spine for retail look, consistent with wrap cover workflow. (Saddle‑stitch remains a supported fallback for short page counts with zero‑spine cover.)

- **Implementation**
  1) Prune W3 logic from W4; add `Extract W4 Input` + validation + Supabase "started" update.
  2) Build minimal pages_html at 8.75″; PDFMonkey create → poll → download; upload to R2 with `ContentType: application/pdf` → Supabase `bookPdfUrl`.
  3) Accept `coverPdfR2Key` from W3; if missing, create temporary zero‑spine cover PDF from PNG; upload to R2 → Supabase `coverPdfUrl`.
  4) Generate **signed URLs** (short TTL) for interior & cover; submit Lulu job; capture `lulu_job_id`, status, ETA, cost → Supabase `print_submitted`.
  5) Write `4‑manifest.json` to R2; emit structured log.
  6) Ship a separate **Lulu webhook** workflow for status/tracking updates.

- **Security**
  - Store **Lulu Client Key/Secret** in n8n credentials (not nodes). Rotate the secret given it was shared in chat/screenshot; prefer sandbox creds first.

- **Ready to build**
  - I will now generate the cleaned **Workflow 4 (importable JSON)** reflecting these decisions.

