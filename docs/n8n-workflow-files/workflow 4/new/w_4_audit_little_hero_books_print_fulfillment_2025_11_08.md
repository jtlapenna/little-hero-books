# W4 Audit — Little Hero Books (Print Fulfillment)

**Scope:** Full pass over the uploaded workflow `LHB - 4 - PRINT FULlFILMENT.json`, the handoff note, and the sample `3A-manifest.json`. This document consolidates findings, risks, and concrete fixes.

---

## Executive summary
- **Overall shape is correct** (Webhook → Config → Normalize → PDFMonkey interior → R2 → Supabase updates → Lulu job → 4‑manifest). The handoff doc and the JSON wiring mostly align.
- **Blocking issues**: several Code nodes contain an invalid spread pattern (e.g., `.{something}`) that will **throw syntax errors**; multiple HTTP nodes use `Authorization: =Bearer ...` (leading `=`) which will **fail auth**; one Code node returns context via invalid spread; and the R2 upload nodes omit explicit `Content-Type`.
- **Wiring risk**: after you PATCH Supabase for interior/cover, the downstream **context for presigning URLs** can be lost because HTTP nodes return their own response bodies. Ensure the original context (CONFIG + keys) continues to **Generate Signed URLs**.
- **Secrets**: hardcoded tokens/keys in **Config (W4)** should be moved to credentials/environment.

---

## Intake & config
- **Webhook path**: `w4-intake` — matches the handoff doc.
- **Config (W4)**: centralizes `pdfMonkey`, `lulu`, `supabase`, and `r2` plus print defaults. ✔️
- **Action**: Move secrets/tokens to n8n Credentials; keep only identifiers (e.g., templateId) in node code.

### Pre‑flight checklist (from handoff, adapted into hard checks)
- `orderId` present; `pageImageUrls[]` has exactly **15** items (p00..p14, ordered); **one** of `coverPdfR2Key` or `coverPdfUrl` present.
- Confirm **interior PDFMonkey template** is the one that accepts `pages_html`.

---

## Node‑by‑node findings (with fixes)

### 1) **Ack (Phase 0–1)**
- Lightweight logging; OK.

### 2) **Build Pages HTML (8.75in)** — **blocker**
- **Issue:** Uses invalid spread `.{identifier}` in return payload, which will cause a syntax error.
- **Fix:** Replace with a proper spread from a defined object, e.g., `...j`.
- **Keep:** 8.75in CSS sizing (bleed) and `page-break-after` strategy.

### 3) **Prepare PDFMonkey Data** — **blocker**
- **Issue:** Same invalid spread (`.d`).
- **Fix:** Replace with `...d` and ensure `document_template_id` pulls from Config.

### 4) **Generate PDF with PDFMonkey** — **blocker**
- **Issue:** `Authorization` header is `=Bearer {{token}}` (leading `=`). This will fail.
- **Fix:** `Bearer {{token}}`.

### 5) **Wait**
- 25‑second delay before polling; fine as a minimal buffer.

### 6) **Poll PDFMonkey until ready** — **blocker**
- **Issue A:** Fallback hardcoded token inside the Code node (leaks secret + diverges from Config).
- **Issue B:** Return payload uses invalid spread (`.$json`).
- **Fix:** Remove fallback; use `($json.CONFIG?.pdfMonkey?.token)` only; fix spread to `...$json`.
- **Outcome:** Emits `pdfDownloadUrl` and `pdfR2Key` reliably.

### 7) **Download PDF from PDFMonkey**
- Correctly requests **file** response; OK.

### 8) **Upload PDF to R2 (S3)** — **minor**
- **Issue:** Missing explicit `Content-Type`.
- **Fix:** Set `Content-Type: application/pdf` in **Additional Fields**.

### 9) **Prepare PDF Metadata for Merge** — **blocker**
- **Issue:** Invalid spread (`.input`).
- **Fix:** Use `...input`.

### 10) **Merge (after interior + meta)**
- Combines: (1) Download/Upload interior → meta, (2) later cover/meta inputs. OK conceptually.

### 11) **Supabase: set interior PDF** — **blocker**
- **Issue:** `Authorization` header is `=Bearer ...`.
- **Fix:** `Bearer ...`. Also verify field names (`bookPdfUrl`) match your DB schema.

### 12) **Supabase: set cover PDF** — **blocker**
- **Issue:** Same header problem; ensure you store **R2 key** or **public URL** consistently (your Code uses R2 key; that’s fine if your app resolves it later).

### 13) **Merge** → **Generate Signed URLs (R2 GET)** — **design risk**
- **Risk:** If you feed **only** Supabase PATCH responses into this Merge, the **original context** (`CONFIG`, `pdfR2Key`, `coverPdfR2Key`) may be **missing** at the presign step.
- **Fix option A (simplest):** Feed the **Prepare PDF Metadata for Merge** output **directly** into **Generate Signed URLs**, in parallel with Supabase patches, then (optionally) merge after.
- **Fix option B:** In each HTTP node, **re‑attach** upstream context to the outgoing item (set `jsonBody` with pass‑through fields or place a Code node after each PATCH to re‑merge context).

### 14) **Generate Signed URLs (R2 GET)** — **blocker**
- **Issue:** Returns payload with invalid spread (`.j`).
- **Fix:** Use `...j`. Logic for AWS SigV4 looks sound; requires `CONFIG.r2` to still be present.

### 15) **Build Lulu Print Job Payload** — **blocker**
- **Issue:** Invalid spread (`.j`).
- **Fix:** Use `...j`. Payload fields map correctly (trim, stock, color, binding, finish, files).

### 16) **Submit Lulu Print Job**
- Uses `Authorization: {{CONFIG.lulu.basicAuth}}`; OK (assuming Base64 is prebuilt in Config).

### 17) **Process Lulu Response** — **blocker**
- **Issue:** Invalid spread (`.upstream`).
- **Fix:** Use `...upstream` after fetching from `$items('Build Lulu Print Job Payload', ...)`.

### 18) **Supabase: mark submitted** — **blocker**
- **Issue:** Same `=Bearer` header problem.
- **Fix:** `Bearer ...`. Body looks complete (status/job ids/eta/cost timestamps).

### 19) **Build 4‑Manifest JSON** — **blocker**
- **Issue:** Invalid spread (`.j`).
- **Fix:** Use `...j`. Manifest content and R2 key path look correct.

### 20) **Upload 4‑Manifest to R2 (S3)** — **minor**
- **Issue:** No explicit `Content-Type` for JSON.
- **Fix:** Set `Content-Type: application/json` in Additional Fields.

### 21) **Simulate Webhook**
- Present for local testing; **disable** in production or leave unconnected.

---

## Wiring observation (critical)
- Current sequence routes **through** Supabase updates before **Generate Signed URLs**. Because HTTP nodes replace item JSON with the HTTP response, you’re likely **dropping original context** required for presigning. Ensure presign step receives a payload that still contains: `CONFIG.r2`, `pdfR2Key`/`bookPdfUrl`, `coverPdfR2Key`/`coverPdfUrl`.

**Recommended route:**
1) **Upload PDF to R2** → **Prepare PDF Metadata for Merge** → **(branch)**
   - **A)** Supabase: set interior PDF → (optional merge)
   - **B)** **Generate Signed URLs (R2 GET)** (directly from the metadata branch to preserve context)
2) Use presigned URLs to **Build Lulu Payload** → **Submit Lulu**.
3) **Process Lulu Response** → **Supabase: mark submitted**.
4) **Build 4‑Manifest** → **Upload 4‑Manifest**.

This keeps write‑backs **orthogonal** to the data needed for downstream API calls.

---

## Security & config hygiene
- **Move tokens/keys** (PDFMonkey token, Supabase service role, R2 access keys, Lulu Basic auth) into **n8n Credentials** (or environment variables) and reference via expressions.
- Avoid hardcoding a **fallback token** inside Code nodes.

---

## Alignment with W3 artifacts (sample 3A‑manifest)
- `amazonOrderId`/`orderId`, `pageImageUrls[]`, and `pdfGeneration.coverPdf` are present as expected. A tiny adapter can forward those fields to W4. The current **Validate & Normalize** node already supports either R2 key or URL for cover.

---

## Acceptance tests (proposed)
1) **Happy path** with TEST‑ORDER‑010:
   - POST minimal payload (15 `pageImageUrls`, one cover reference) to `w4-intake`.
   - Expect: interior PDF rendered, uploaded to R2; DB updated (`bookPdfUrl`, `coverPdfUrl`/key); signed URLs generated; Lulu job created; 4‑manifest written.
2) **Cover by URL** (no R2 key):
   - Provide `coverPdfUrl` only; verify presign logic can handle URL vs key.
3) **Validation fail**:
   - Send 14 pages; expect 400 from intake validation.
4) **PDFMonkey transient**:
   - Simulate 202/queued; ensure poller waits/retries and ultimately succeeds or emits a clear error.
5) **R2 failure**:
   - Force a bad key to confirm error path surfaces a descriptive message.

---

## Quick fix list (implementation‑ready)
- Replace **all** invalid spreads (`.j`, `.d`, `.$json`, `.input`, `.upstream`) with proper `...` spreads.
- Fix **all** `Authorization: =Bearer ...` headers → `Authorization: Bearer ...`.
- Add `Content-Type` on both S3 uploads (PDF and manifest JSON).
- Adjust wiring so **Generate Signed URLs** receives preserved context (branch from the metadata step before Supabase patches).
- Remove hardcoded fallback PDFMonkey token from Code node.
- Disable **Simulate Webhook** in prod.
- (Optional) Add retries/backoff on Lulu POST; structured error logging on failure paths.

---

## Ready‑to‑build task breakdown (for next step)
*(You asked for a separate implementation task list after the audit; we’ll generate that next.)*
- Syntax patches (Code nodes)
- Header/auth patches (HTTP nodes)
- S3 content‑type additions
- Wiring adjustments to preserve context
- Secrets migration to n8n credentials
- Add assertions (e.g., exactly 15 pages)
- Add minimal error instrumentation/logging

---

**End of audit** — prepared for immediate implementation.