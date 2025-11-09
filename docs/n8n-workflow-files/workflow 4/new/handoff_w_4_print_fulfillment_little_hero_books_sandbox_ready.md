# Handoff — W4 Print Fulfillment (Little Hero Books) — SANDBOX Ready

**Scope:** Everything a new agent needs to continue testing and hardening **Workflow 4 (Print Fulfillment)** in n8n. Latest JSON to import: **LHB - 4 - PRINT FULlFILMENT_PHASE7_STATUS_NOTE.json**.

---

## 1) Project + Workflow Overview
- **Larger project:** Little Hero Books — generates personalized kids’ books.
- **W3** produces **15 interior page images (p00–p14)** and a **cover PDF**, uploads to **Cloudflare R2**, and emits a **3A‑manifest.json**.
- **W4 (this workflow)** compiles the **interior PDF** with **PDFMonkey** from those 15 images, uploads it to **R2**, updates **Supabase**, **presigns** interior + cover for Lulu, **submits a Lulu print job**, and writes a **4‑manifest.json** to R2.

**Key design choices already implemented**
- Two config nodes:
  - **Config (W4) — SANDBOX** (wired by default)
  - **Config (W4) — PRODUCTION** (present, not wired)
- **Lulu submission paths** (clearly labeled):
  - **SANDBOX OAuth chain (active)**: *Lulu SANDBOX: Get Token → Extract Lulu Access Token (SANDBOX) → Submit Lulu Print Job (SANDBOX - BEARER)*
  - **PRODUCTION OAuth chain (disabled)**: *Lulu PRODUCTION: Get Token → Extract Lulu Access Token (PRODUCTION) → Submit Lulu Print Job (PRODUCTION - BEARER)*
  - **PRODUCTION BASIC (disabled)**: original node preserved but off (OAuth recommended).
- **Idempotency guard**: *Supabase: get existing order → Guard Lulu Submit* skips Lulu if the order already has a job id; still feeds forward a synthetic response.
- **Status Banner (Env & Submit Path)**: logs which environment and path ran, token timing, and orderId; every submit path flows through it before **Process Lulu Response**.
- **Presign wiring hardened**: *Generate Signed URLs (R2 GET)* takes input from **Merge (after interior + meta)** so **CONFIG** + keys survive.
- **Content‑Type set** on S3 uploads: PDFs as `application/pdf`, manifests as `application/json`.
- **Strict validation**: *Validate & Normalize W4 Input* asserts **exactly 15 pages** (p00–p14), **orderId**, and **coverPdfR2Key or coverPdfUrl**.
- **Simulate Webhook**: generates a valid test payload from a 3A‑manifest and **always prepends p00** (from `assetsUsed.dedicationBg` or a predictable p00 preview path).

---

## 2) Current Wiring (high level)
```
Webhook/Simulate → Config (W4) — SANDBOX → Validate & Normalize
→ Build Pages HTML (8.75in) → PDFMonkey Create → Wait → Poll → Download → Upload R2
→ Prepare Metadata → (branch)
   ├─ Supabase: set interior PDF
   ├─ Supabase: set cover PDF
   └─ Generate Signed URLs (R2 GET) → Build Lulu Print Job Payload
        ├─ Idempotency: Supabase GET → Guard Lulu Submit → Status Banner → Process Lulu Response
        └─ SANDBOX: Get Token → Extract Token → Submit (BEARER) → Status Banner → Process Lulu Response
→ Supabase: mark submitted → Build 4‑Manifest JSON → Upload 4‑Manifest
```

**Outputs**
- **R2 interior PDF**: `book-mvp-simple-adventure/orders/<ORDER>/interior_<ORDER>.pdf`
- **Supabase order row**: interior + cover keys/urls, Lulu job id/status, submitted timestamp.
- **4‑manifest.json**: includes interior key, cover key **and** `coverPdfUrl` (if present), lulu job id, timestamps.

---

## 3) Configuration (hardcoded, per request)
Set **all values** in the **Config (W4) — SANDBOX** or **Config (W4) — PRODUCTION** nodes:
- `pdfMonkey`: `{ token, templateId }` (template must accept `pages_html`).
- `r2`: `{ bucket, endpointHost, region:'auto', accessKeyId, secretAccessKey }`.
- `supabase`: `{ projectUrl, serviceRoleKey }`.
- `lulu`:
  - `apiBase`: `https://api.sandbox.lulu.com` (SANDBOX) or `https://api.lulu.com` (PRODUCTION)
  - `basicAuth`: `"Basic <base64(client_key:client_secret)>"` (used for OAuth token call)
  - `clientKey`/`clientSecret` optional (for reference).

No environment variables are used; **all secrets are in Config nodes**.

---

## 4) How to switch SANDBOX ↔ PRODUCTION
1. Disconnect **Config (W4) — SANDBOX** → **Validate & Normalize W4 Input**.
2. Connect **Config (W4) — PRODUCTION** → **Validate & Normalize W4 Input**.
3. Submission path:
   - Enable **Lulu PRODUCTION: Get Token → Extract Lulu Access Token (PRODUCTION) → Submit Lulu Print Job (PRODUCTION - BEARER)**.
   - Disable the **SANDBOX** token/extract/submit nodes.
4. (Optional) If you must use BASIC (not recommended), enable **Submit Lulu Print Job (PRODUCTION - BASIC)** and disable OAuth.

> The **Sticky: Switch SANDBOX ↔ PRODUCTION** note in the canvas repeats these steps.

---

## 5) Testing
**A. Manual test (preferred during dev)**
- Use **Simulate Webhook** to emit a valid payload (built from a 3A‑manifest). The generator **always includes p00** so the pages array is **exactly 15**.

**B. External test**
- POST to `/w4-intake` the following shape (example):
```json
{
  "orderId": "TEST-ORDER-010",
  "title": "Little Hero Books — Test",
  "pageImageUrls": [
    "https://.../p00.png", "https://.../p01.png", ..., "https://.../p14.png"
  ],
  "coverPdfR2Key": "book-mvp-simple-adventure/orders/TEST-ORDER-010/cover_TEST-ORDER-010.pdf",
  "shippingAddress": { "name": "Test Recipient", "street1": "123 Test St", "city": "SF", "state_code": "CA", "postcode": "94107", "country_code": "US", "phone_number": "555-555-5555", "email": "test@example.com" },
  "customer": { "name": "Test Customer", "email": "test@example.com" }
}
```

**Expected**: interior PDF on R2 → Supabase updated → presigned interior+cover → Lulu SANDBOX job id → 4‑manifest to R2.

---

## 6) Troubleshooting Quick Hits
- **PDFMonkey 401/403** → Check `pdfMonkey.token` and that the **Authorization header is `Bearer`** (not `=Bearer`).
- **PDFMonkey render fails** → Ensure all 15 `pageImageUrls` are public/signed and reachable; confirm the **interior template** is the one that accepts `pages_html`.
- **Presign error (“R2 config incomplete”)** → Fill `r2.bucket`, `endpointHost`, `accessKeyId`, `secretAccessKey`.
- **Supabase 401** → Verify `serviceRoleKey` and Bearer header.
- **Lulu auth fails** → SANDBOX uses **OAuth**: token node must return `access_token`. Status Banner shows env + path.
- **Idempotency skip triggered** → Order already has `lulu_job_id`. Clear that to force a new submit.

---

## 7) Open Items / Next steps
- Optional: move secrets into n8n Credentials (future hardening).
- Optional: add a simple **error reporter** (write failures to `workflow_errors` table with `orderId`, `stage`, `message`).
- Optional: relax 15‑page constraint if product format changes.
- Confirm W3 always supplies **p00–p14** and **coverPdfR2Key** consistently.

---

## 8) Key Nodes (by name)
- **Config (W4) — SANDBOX** / **Config (W4) — PRODUCTION**
- **Validate & Normalize W4 Input**
- **Build Pages HTML (8.75in)** / **Prepare PDFMonkey Data** / **Generate PDF with PDFMonkey** / **Poll PDFMonkey until ready**
- **Upload PDF to R2** / **Prepare PDF Metadata for Merge** / **Merge (after interior + meta)**
- **Supabase: set interior PDF** / **Supabase: set cover PDF**
- **Generate Signed URLs (R2 GET)** → **Build Lulu Print Job Payload**
- **Lulu SANDBOX: Get Token** → **Extract Lulu Access Token (SANDBOX)** → **Submit Lulu Print Job (SANDBOX - BEARER)**
- **Supabase: get existing order** → **Guard Lulu Submit**
- **Status Banner (Env & Submit Path)** → **Process Lulu Response**
- **Supabase: mark submitted** → **Build 4‑Manifest JSON** → **Upload 4‑Manifest**

---

**Ready for testing** with the SANDBOX chain active. Swap the config + submit chain when moving to PRODUCTION. The Status Banner will confirm which path ran per execution.

