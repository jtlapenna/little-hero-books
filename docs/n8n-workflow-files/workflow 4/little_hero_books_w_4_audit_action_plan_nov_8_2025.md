# Little Hero Books — Workflow 4 (Print Fulfillment) Audit & Action Plan
**Version:** v1 · **Date:** 2025‑11‑08 · **Scope:** Audit of current W4 JSON (`…FULlFILMENTv2.json`) and precise next‑step fixes.

---

## 1) Executive Snapshot
- **Workflow name:** `LHB - 4 - PRINT FULlFILMENT`  
- **Trigger:** Webhook (POST) at `w4-intake`  
- **Activation:** inactive (manual import/run)  
- **Target flow:** Intake → Interior PDF (PDFMonkey) → R2 upload → Supabase state updates → R2 presign → Lulu submission → Manifest upload
- **Credential strategy:** Hardcoded inside `Config (W4)` per project constraints  
- **Placeholders present (must be set before live):**  
  - `CONFIG.supabase.projectUrl`, `CONFIG.supabase.serviceRoleKey`  
  - `CONFIG.r2.endpointHost`, `CONFIG.r2.accessKeyId`, `CONFIG.r2.secretAccessKey`  
  - (Optional) switch `CONFIG.lulu.apiBase` to sandbox during testing

**Overall status:** The graph is *nearly complete* and n8n v2‑compatible. A few wiring/behavioral issues will break end‑to‑end execution unless fixed:
1) Loss of upstream context after **Supabase** and **Submit Lulu** HTTP nodes.  
2) **4‑manifest** upload is configured without JSON payload.  
3) Minor robustness gaps (headers, content types, polling cadence).

---

## 2) Current Graph — From Intake to Manifest
**Linear path (high‑level):**
```
Webhook → Config → Validate → Supabase: mark start → Ack → Build Pages HTML →
Prepare PDFMonkey Data → Generate PDF (PDFMonkey) → Wait → Poll PDFMonkey →
Download PDF → Upload PDF to R2 → [Merge (after interior + meta)] →
  ↳ Supabase: set interior PDF
  ↳ Supabase: set cover PDF
[Merge] → Generate Signed URLs (R2 GET) → Build Lulu Payload → Submit Lulu →
Process Lulu Response → Supabase: mark submitted → Build 4‑Manifest → Upload 4‑Manifest to R2
```

**Wiring details (as‑imported):**
- **Merge (after interior + meta)** (`combineByPosition`, `numberInputs: 3`) inputs are:
  - *Input 1:* from **Prepare PDF Metadata for Merge**  
  - *Input 2:* from **Upload PDF to R2**  
  - *Input 3:* from **Download PDF from PDFMonkey**  
- **Merge (after interior + meta)** fans out to:  
  - **Supabase: set interior PDF**  
  - **Supabase: set cover PDF**  
- **Merge** (2‑input, `combineByPosition`) gathers from:
  - **Supabase: set interior PDF**  
  - **Supabase: set cover PDF**  
  → then to **Generate Signed URLs (R2 GET)**

---

## 3) Node‑by‑Node Audit & Status
### Phase 0–1 — Intake & Setup
- **Webhook (W4 Intake):** OK. Path `w4-intake`. Response mode default (no explicit Respond node).  
- **Config (W4):** OK structure. Contains hardcoded tokens/keys with placeholders for Supabase/R2. Lulu `apiBase` currently **production**.  
- **Validate & Normalize W4 Input:** OK logic. Ensures `{orderId, pageImageUrls[], (coverPdfR2Key|coverPdfUrl)}` and sets `pdfFilename` + `pdfR2Key`.
- **Supabase: mark start (PATCH):** OK endpoint and body. Uses `or=(amazon_order_id.eq...,orderId.eq...)`. No `Prefer:return=representation` header (not required here since we don’t consume response).
- **Ack (Phase 0–1):** OK diagnostic logging.

### Phase 2 — Interior PDF Creation
- **Build Pages HTML (8.75in):** OK. Full‑bleed canvas; simple CSS.
- **Prepare PDFMonkey Data:** OK. Template id referenced from CONFIG.
- **Generate PDF with PDFMonkey (POST):** OK headers/body.
- **Wait 25s + Poll PDFMonkey until ready:** Works; combined wait ≈55s worst‑case. Poll loop 15× with 2s interval.
- **Download PDF from PDFMonkey:** OK; saves binary.
- **Upload PDF to R2 (S3 node):** OK pathing to `pdfR2Key`.  
  **Gap:** `contentType` not specified (recommend `application/pdf`).

### Phase 3 — Cover PDF Handling
- **Supabase: set cover PDF (PATCH):** Writes `coverPdfUrl` with `coverPdfR2Key || coverPdfUrl`.
  **Gap:** We rely on this node to *forward* input context, but HTTP nodes do not pass through by default—see §4.1.

### Phase 4 — Lulu Submission & Manifest
- **Merge (after interior + meta):** Combines (Upload, Download, Prepare) — OK. Input precedence may not be ideal if fields clash (see §4.3).  
- **Supabase: set interior PDF (PATCH):** Writes `bookPdfUrl` with `pdfR2Key`. Same pass‑through gap as above.
- **Merge (2‑input):** Combines outputs of both Supabase nodes, then → **Generate Signed URLs (R2 GET)**.  
  **Problem:** If Supabase responses are empty (default when not using `Prefer: return=representation`), context (like `pdfR2Key`, `coverPdfR2Key`) is **lost** here.
- **Generate Signed URLs (R2 GET):** Presigns `bookPdfUrl/pdfR2Key` and `coverPdfR2Key/coverPdfUrl`.  
  **Risk:** May fail with “Missing R2 keys” if prior context was lost at Merge.
- **Build Lulu Print Job Payload:** OK payload mapping.
- **Submit Lulu Print Job (POST):** OK headers/body.
- **Process Lulu Response (Code):** Extracts `jobId/status/cost/eta` from **HTTP response** only.  
  **Problem:** Does **not** re‑attach the *pre‑submit* order context (e.g., `orderId`). The next node (**Supabase: mark submitted**) requires `orderId`.
- **Supabase: mark submitted (PATCH):** Correct fields.  
  **Risk:** Will 4xx if `orderId` went missing in the prior step.
- **Build 4‑Manifest JSON:** OK schema and key path.  
  **Risk:** Inherits the same context loss; may not have `orderId`/artifact keys.
- **Upload 4‑Manifest to R2:**  
  **Problem:** `additionalFields` is empty; no `data` provided, so nothing is uploaded.

---

## 4) Issues Requiring Fixes (prioritized)
### 4.1 Pass‑through context is lost after HTTP nodes
- **Where:** Both `Supabase: set interior PDF`, `Supabase: set cover PDF`, and `Submit Lulu Print Job` → `Process Lulu Response`.  
- **Why:** n8n HTTP Request nodes return the HTTP response body only; they don’t keep the incoming item unless we explicitly add a pass‑through.  
- **Impact:**
  1) **R2 presign** step may execute with items missing `pdfR2Key/coverPdfR2Key`.  
  2) **Supabase: mark submitted** fails due to missing `orderId`.  
  3) **4‑Manifest** may lack required fields.

### 4.2 4‑Manifest upload has no payload
- **Where:** `Upload 4‑Manifest to R2`  
- **Fix:** Set `additionalFields.contentType = 'application/json'` and `additionalFields.data = "={{JSON.stringify($json._manifest)}}"`.

### 4.3 Merge input precedence (minor)
- **Where:** `Merge (after interior + meta)` input order is `[Prepare, Upload, Download]`. If any fields overlap, the final value follows merge order. Safer to ensure **Prepare PDF Metadata** is the **last** input to override earlier defaults.

### 4.4 Missing content-type for interior PDF upload
- **Where:** `Upload PDF to R2`  
- **Fix:** Set `additionalFields.contentType = 'application/pdf'`.

### 4.5 Testing environment for Lulu
- **Where:** `Config (W4).lulu.apiBase` currently `https://api.lulu.com` (production).  
- **Action:** Use sandbox while validating end‑to‑end.

### 4.6 Polling cadence (optional)
- Reduce `Wait` to 10s and let the poll loop perform its checks (or increase attempts to support slower renders).

---

## 5) Minimal, Safe Patches (no node deletions)
> Apply in order. These preserve your current canvas wiring and only add the necessary behavior.

### Patch A — Preserve upstream context after Supabase & Submit Lulu
**A‑1) Add a third input to the second `Merge` node and feed it from `Merge (after interior + meta)`**  
- Set `Merge` (the one before presign) `numberInputs = 3`.  
- Add a third connection: `Merge (after interior + meta) → Merge (index 2)`.
- This guarantees the full upstream context (order, keys, CONFIG) is present when presigning, regardless of what the Supabase nodes return.

**A‑2) Re‑attach context inside `Process Lulu Response`**  
Replace its code with the pass‑through merge (keeps pre‑submit fields while adding Lulu fields):
```js
// Re‑attach upstream context from Build Lulu Print Job Payload
const upstream = $items('Build Lulu Print Job Payload', 0, $runIndex)?.[0]?.json || {};
const resp = $input.first().json || {};
const jobId = resp.id || resp.job_id || resp.data?.id;
const status = resp.status || resp.data?.status || 'CREATED';
const cost = resp.cost || resp.data?.cost || null;
const eta = resp.estimated_ship_date || resp.data?.estimated_ship_date || null;
return [{ json: { ...upstream, luluJobId: jobId, luluStatus: status, luluCost: cost, estimatedShipDate: eta } }];
```
> This ensures `orderId` and artifact keys are available for **Supabase: mark submitted** and **Build 4‑Manifest JSON**.

### Patch B — Make the 4‑Manifest upload actually write JSON
In **Upload 4‑Manifest to R2** set:
- `binaryData = false`  
- `additionalFields.contentType = application/json`  
- `additionalFields.data = "={{JSON.stringify($json._manifest)}}"`

### Patch C — Tag interior PDF with proper content type
In **Upload PDF to R2** set:
- `additionalFields.contentType = application/pdf`

### Patch D — (Optional) Improve merge precedence
If you want **Prepare PDF Metadata for Merge** to have the final say on overlapping fields, wire it to the **last** port of `Merge (after interior + meta)` and set `numberInputs` accordingly.

### Patch E — (Optional) Sandbox Lulu during testing
In **Config (W4)** set:  
`lulu.apiBase = 'https://api.sandbox.lulu.com'`

---

## 6) Tests (step‑by‑step)
1) **Smoke test to PDF only**  
POST to `w4-intake` with:
```json
{
  "orderId": "AMZ-TEST-001",
  "pageImageUrls": ["https://…/page01.png", "https://…/page02.png"],
  "coverPdfR2Key": "book-mvp-simple-adventure/orders/AMZ-TEST-001/cover_AMZ-TEST-001.pdf",
  "shippingAddress": {"Name":"Test","AddressLine1":"123 Any","City":"City","StateOrRegion":"CA","PostalCode":"90001","CountryCode":"US"},
  "customer": {"email":"test@example.com","name":"Test"},
  "title": "Alex and the Adventure Compass"
}
```
**Expected:** PDFMonkey → R2 upload success; Supabase `bookPdfUrl` & `coverPdfUrl` set; presign URLs generated.

2) **Lulu sandbox submission**  
Enable sandbox; ensure presigned URLs resolve; confirm 200 with job id; Supabase updates `print_submitted` and 4‑manifest JSON appears under:  
`book-mvp-simple-adventure/orders/{orderId}/manifests/4-manifest.json`

3) **Failure cases**  
- Remove `coverPdfR2Key` and pass `coverPdfUrl` only → W4 should still run; presign relies on cover URL, or add an optional branch to re‑upload cover to R2.

---

## 7) Open Risks & Follow‑ups
- **Supabase response strategy:** Currently we do not consume Supabase responses; all state is carried via our own pass‑through. If you want DB‑confirmed values, add `Prefer: return=representation` and merge fields explicitly.  
- **Webhook response:** If you need synchronous feedback to the caller, add a final **Respond to Webhook** node with a trimmed payload (job id, links).  
- **PDFMonkey timing:** For heavy PDFs, consider: `Wait 10s + Poll attempts 30 × 2s`.

---

## 8) Implementation Checklist
- [ ] Patch A‑1: Add 3rd input to second Merge (`numberInputs = 3`) and connect from `Merge (after interior + meta)`.
- [ ] Patch A‑2: Replace code in **Process Lulu Response** with pass‑through/merge snippet above.
- [ ] Patch B: Set content type & data on **Upload 4‑Manifest to R2**.
- [ ] Patch C: Set `contentType=application/pdf` on **Upload PDF to R2**.
- [ ] Patch D (optional): Make `Prepare PDF Metadata` the last input on **Merge (after interior + meta)**.
- [ ] Patch E (optional): Switch Lulu `apiBase` to sandbox while testing.
- [ ] Fill all **CONFIG** placeholders (Supabase, R2) and re‑test end‑to‑end.

