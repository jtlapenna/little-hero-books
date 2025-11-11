# W4 Print Workflow – Map & Audit (v1)

This document gives a high-level map of the **LHB - 4 - PRINT FULlFILMENT** workflow plus key findings, risks, and areas to refine before finalizing.

---

## 1. High-Level Flow (Happy Path)

**Trigger**
- `Webhook (W4 Intake)` — POST `/w4-pdf-print`, receives payload.
- Merged with `Config (W4) — SANDBOX` via `Merge1`.

**Intake & Normalization**
- `Validate & Normalize W4 Input`
  - Resolves `orderId` from multiple potential fields.
  - Expects `pageImageUrls` (array) + `coverPdfR2Key` / `coverPdfUrl`.
  - Validates:
    - `orderId` present.
    - `pageImageUrls` is an array of **exactly 15** items (p00–p14).
  - Appends cache-busting `?v=` param.
  - Derives `pdfFilename` and `pdfR2Key` for interiors.

**Status Start**
- `Supabase: mark start`
  - Sets `printFulfillmentStartedAt` and `printFulfillmentStatus = 'started'`.
- `Ack (Phase 0–1)`
  - Marks `ackPhase: true` in context (note: this is internal only; no separate webhook response node).

**Build Interior PDF (PDFMonkey)**
- `Merge2` → `Build Pages HTML (8.75in)`
  - Builds `pages_html` with one `<section>` per page, sized **8.75in x 8.75in** (bleed).
- `Prepare PDFMonkey Data` → `Generate PDF with PDFMonkey`
  - Creates a `document` with `pages_html` using configured template.
- `Reattach Context (PDFM)` → `Wait` → `Poll PDFMonkey until ready`
  - Polls until `status = success` and has a `download_url`.
- `Download PDF from PDFMonkey`
  - Downloads final interior PDF.
- `Upload PDF to R2`
  - Uploads to `pdfR2Key` in `little-hero-orders`.
- `Prepare PDF Metadata for Merge` → `Merge (after interior + meta)`
  - Rebuilds context, flags `pdfComplete`, sets `pdfUploadedAt`.

**Persist Interior & Cover Pointers**
- From `Merge (after interior + meta)`:
  - `Supabase: set interior PDF` updates `interiorPdfR2Key`.
  - `Supabase: set cover PDF` updates `coverPdfR2Key` (relies on incoming `coverPdfR2Key`).
  - `Merge` combines states for downstream.

**Lulu URL Preparation**
- `Generate Signed URLs (R2 GET)`
  - Presigns `pdfR2Key` and `coverPdfR2Key` as `interiorSignedUrl` and `coverSignedUrl`.
- `Decide Lulu Source URLs (NO PROXY)`
  - Chooses final `interiorSourceUrl` and `coverSourceUrl` (presigned or public R2 base), rejects any `admin.littleherolabs.com/api/assets` proxy URLs.

**Lulu Job Guard & Submit (SANDBOX path wired)**
- `Supabase: get existing order` → `Guard Lulu Submit`
  - Reads any existing Lulu job; can set `__skipLulu` for idempotency or test mode.
- `Build Lulu Print Job Payload`
  - Assembles `luluPayload` (trim, paper, binding, etc.) using `interiorSourceUrl` and `coverSourceUrl`.
  - Requires `podPackageId` and `shipping_address.phone_number`.
- `Lulu SANDBOX: Get Token (Retry)`
  - 3-attempt token fetch with exponential backoff.
- `Validate Interior (SANDBOX)` / `Validate Cover (SANDBOX)`
  - Validate files with Lulu using Bearer token.
- `Submit Lulu Print Job (SANDBOX - BEARER, Retry)`
  - 3-attempt submission; clear error messages on 4xx.
- `Merge3` → `Status Banner (Env & Submit Path)` → `Process Lulu Response`
  - Consolidates job id/status/cost/ETA.

**Finalize Supabase + Manifest**
- `Build Supabase Update` → `Supabase: mark submitted`
  - Writes `printFulfillmentStatus` and Lulu job fields (or skip reason).
- `Build 4-Manifest JSON` → `Upload 4-Manifest to R2`
  - Writes `4-manifest.json` with artifact keys + Lulu metadata.

---

## 2. Major Strengths

1. **Clear separation of concerns**
   - Intake/normalize → PDF generation → URL signing → Lulu validate/submit → Supabase + manifest.
2. **Resilient token & submit handling**
   - Dedicated retry logic for Lulu token and job submission.
3. **Idempotency guard**
   - `Guard Lulu Submit` prevents duplicate Lulu jobs when an existing job is present or in test mode.
4. **Strict URL rules for Lulu**
   - Forbids proxy URLs and enforces presigned/public R2 URLs only.
5. **4-manifest generation**
   - Creates an auditable record of what was sent to print.

---

## 3. Key Misalignments & Potential Issues

1. **Webhook payload mismatch risk**
   - `Validate & Normalize W4 Input` expects a **flattened W4 payload**: `orderId`, `pageImageUrls[15]`, `coverPdfR2Key`.
   - The separate integration summary describes W4 receiving a **3-manifest-style payload** (with `pngGeneration.pages`, `pagesWithCloudflare`, `pdfGeneration.coverPdf`).
   - If the backend does **not** transform 3-manifest → flattened W4 shape, the workflow will fail validation.
   - Action: confirm/lock the adapter contract and update comments so expectations are unambiguous.

2. **Hard requirement: 15 pages**
   - Code enforces `pageImageUrls.length === 15` (p00–p14).
   - Any deviation (missing p00, different page count) will throw and block printing.
   - Action: ensure 3-manifest → W4 adapter always builds a complete 15-page list, or relax logic deliberately.

3. **Ack behavior is incomplete**
   - `Ack (Phase 0–1)` only sets a flag in JSON; there is **no `Respond to Webhook` node**, so the admin "Send to Print" call waits for full workflow completion.
   - Action: decide whether you want immediate 200 ack; if yes, insert `Respond to Webhook` right after validation/start.

4. **Config & secrets handling**
   - CONFIG nodes (sandbox/prod) include inline secrets and R2 keys.
   - Intentional for now, but:
     - Risk of divergence between nodes.
     - Risk if any simulation node is left enabled in production.
   - Action: document which config node is authoritative; in real prod, migrate to n8n credentials while preserving your no-expression constraint.

5. **Multiple test/sim nodes in graph**
   - `Simulate Webhook`, `Simulate Merge`, and embedded test payloads exist inside the live workflow.
   - If accidentally left enabled/wired, they may:
     - Inject stale CONFIG or payloads.
     - Confuse `$items()` lookups in merge/guard nodes.
   - Action: ensure all simulation nodes are disabled and visually grouped/annotated as test-only.

6. **Lulu env switching complexity**
   - Sticky note explains SANDBOX ↔ PRODUCTION, but there are overlapping paths:
     - Basic auth vs Bearer + retry nodes.
     - Disabled PRODUCTION nodes that still appear in the graph.
   - Action: before launch, choose **one clear production path**:
     - e.g., PRODUCTION Bearer + retry only, SANDBOX path disabled.

7. **Dependence on correct R2 keys for cover**
   - `Supabase: set cover PDF` and `Generate Signed URLs` rely on `coverPdfR2Key` coming from intake.
   - If W3/adapter ever omits or renames this, Lulu URL generation will fail.

8. **4xx surfacing & observability**
   - Lulu submit retry node surfaces 4xx with helpful messages (good), but there’s no dedicated error branch to:
     - Mark `printFulfillmentStatus = 'error'`.
     - Surface human-readable message to your admin UI.
   - Action: add an error-handling path that writes clear status + reason.

---

## 4. Areas to Investigate Further

1. **Exact W4 inbound contract**
   - Confirm whether the admin API sends:
     - Raw 3-manifest JSON, or
     - A transformed payload with `pageImageUrls` + `coverPdfR2Key`.
   - Update `Validate & Normalize W4 Input` accordingly (either support both shapes or standardize one).

2. **p00 handling & dedication logic**
   - Ensure adapter logic for p00 (dedication/intro page) is finalized and consistent with W3/3A.

3. **Supabase schema alignment**
   - Verify column names used in:
     - `Supabase: mark start`
     - `Supabase: set interior PDF`
     - `Supabase: set cover PDF`
     - `Build Supabase Update` / `Supabase: mark submitted`
   - Confirm they match real DB (snake_case vs camelCase).

4. **R2 signing assumptions**
   - `Generate Signed URLs (R2 GET)` assumes specific R2 endpoint layout and AWS-style signing; confirm against current R2 config.

5. **Print spec validation**
   - Current Lulu validation checks only via `/validate/*` endpoints.
   - Consider explicitly asserting:
     - Page count matches 16 pages total
     - Trim + bleed match selected `podPackageId`.

---

## 5. Recommended Next Steps (Summary)

1. Lock the **W4 payload contract** and align `Validate & Normalize W4 Input`.
2. Verify adapter logic guarantees **15 pageImageUrls (p00–p14)**.
3. Decide on **ack strategy** and add `Respond to Webhook` if needed.
4. Choose one **Lulu submission path** for production and prune/deactivate alternates.
5. Add a clear **error handling branch** that marks failures in Supabase and returns a structured error.
6. Clean up / group **simulation nodes** so they cannot interfere with production runs.

This map is the baseline; we can now refine specific nodes and wiring to reach a clean, production-ready W4.

