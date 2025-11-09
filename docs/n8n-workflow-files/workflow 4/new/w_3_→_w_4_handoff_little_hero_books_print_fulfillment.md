# Little Hero Books — W3 → W4 Handoff (Print Fulfillment)

## 0) Project context (short)
- **Brand / Product:** Little Hero Books — personalized children’s books (8.5"×8.5").
- **Pipeline (high‑level):**
  - **W1–W2:** Character generation & QA (poses, style).
  - **W3 (PNG Assembly):** Build interior page PNGs (p00–p14), generate **cover PDF** (and optional PNG preview), upload assets to R2, emit **3A manifest**.
  - **W4 (Print Fulfillment):** Accept final artifacts, render **interior PDF** from page PNG URLs, pair with **cover PDF**, submit print job to Lulu, update Supabase, and write **4‑manifest**.

---

## 1) What W4 does (current implementation)
1) **Intake via Webhook** (`Webhook (W4 Intake)`), then **Validate & Normalize** input from W3/backend.
2) **Build interior PDF** with PDFMonkey using provided `pageImageUrls[]` (8.75in square, includes bleed), then **upload interior PDF to R2**.
3) **Use cover PDF** provided by W3/backend (R2 key or URL — one is required).
4) **Generate R2 signed GET URLs** for interior + cover; **build Lulu payload**; **submit Lulu print job**.
5) **Persist** status & links to Supabase and **write 4‑manifest** to R2.

---

## 2) What W4 expects as input (from W3/backend)
**Required:**
- `orderId` *(or `amazonOrderId`)* — string, e.g., `TEST-ORDER-010`.
- `pageImageUrls[]` — **ordered** public URLs for pages **p00..p14** (15 total).
- **One of:**
  - `coverPdfR2Key` — R2 key to the cover PDF, e.g., `book-mvp-simple-adventure/orders/TEST-ORDER-010/cover_TEST-ORDER-010.pdf`, **or**
  - `coverPdfUrl` — a public URL to the same PDF.

**Optional (recommended):**
- `shippingAddress` — object compatible with Lulu’s address block.
- `customer` — `{ email, name }`.
- `title` — defaults to `Little Hero Book` if omitted.

> Notes
> - W4 validates: `orderId` present, `pageImageUrls.length > 0`, `(coverPdfR2Key || coverPdfUrl)` present.
> - Interior template ID for PDFMonkey is set in **Config (W4)**.

---

## 3) What W3 emits today (for W4 to consume)
From **Build 3A Manifest** (latest run):
- **Cover PDF:** `manifest.pdfGeneration.coverPdf` and top‑level `coverPdfR2Key` — **present**.
- **Cover PNG preview:** `manifest.pngGeneration.coverSpreadImage` — present (nice‑to‑have only).
- **Interiors:** `pageImageUrls[]` (15 items, p00..p14) — **present**.
- **Order:** `orderId` — **present**.

W4 does **not** currently parse the entire `3A-manifest.json` object at intake; it reads the **flattened fields** listed in §2. You can either:
- Send these fields **directly** to W4, or
- Send the manifest plus a tiny adapter that extracts and forwards those fields to W4.

---

## 4) Minimal payload example to trigger W4
```json
{
  "orderId": "TEST-ORDER-010",
  "pageImageUrls": [
    "https://admin.littleherolabs.com/api/assets/book-mvp-simple-adventure/orders/TEST-ORDER-010/preview-images/p00.png",
    "https://admin.littleherolabs.com/api/assets/book-mvp-simple-adventure/orders/TEST-ORDER-010/preview-images/p01.png",
    "https://admin.littleherolabs.com/api/assets/book-mvp-simple-adventure/orders/TEST-ORDER-010/preview-images/p02.png"
    /* … include p03..p14 in order */
  ],
  "coverPdfR2Key": "book-mvp-simple-adventure/orders/TEST-ORDER-010/cover_TEST-ORDER-010.pdf",
  "shippingAddress": {
    "name": "Parent Name",
    "street1": "123 Main St",
    "city": "City",
    "state": "CA",
    "postal_code": "94016",
    "country_code": "US"
  },
  "customer": { "email": "orders@example.com", "name": "Parent Name" },
  "title": "Little Hero Book"
}
```
*(Webhook path in the current W4 is `w4-intake`; use your n8n webhook URL with that path.)*

---

## 5) W4 flow (current node map)
1) **Webhook (W4 Intake)** → **Config (W4)** → **Validate & Normalize W4 Input** (derives `pdfFilename`/`pdfR2Key`).
2) **Supabase: mark start** (status: `print_fulfillment_in_progress`).
3) **Build Pages HTML (8.75in)** (creates `pages_html` with bleed sizing).
4) **Prepare PDFMonkey Data** → **Generate PDF with PDFMonkey** → **Wait** → **Poll PDFMonkey until ready** → **Download PDF from PDFMonkey** → **Upload PDF to R2**.
5) **Prepare PDF Metadata for Merge** + **Merge** → **Supabase: set interior PDF** and **Supabase: set cover PDF**.
6) **Generate Signed URLs (R2 GET)** → **Build Lulu Print Job Payload** → **Submit Lulu Print Job** → **Process Lulu Response** → **Supabase: mark submitted**.
7) **Build 4‑Manifest JSON** → **Upload 4‑Manifest to R2**.

---

## 6) Config you (or the agent) must verify in W4
- **Config (W4) node:**
  - `pdfMonkey.token` — valid API token.
  - `pdfMonkey.templateId` — interior (document) template that accepts `pages_html`.
  - `lulu.apiBase` — use production base unless sandboxing.
  - `lulu.basicAuth` — Base64 creds present.
  - `supabase.projectUrl` + `supabase.serviceRoleKey` — valid.
  - `r2.*` — bucket/endpoint/region/keys set.
  - `defaults` — trim 8.5×8.5, bleed 8.75×8.75, `premium-color`, `80#-text`, `perfect-bound`, cover `matte`, `quantity: 1`, `shippingLevel: STANDARD`.
- **Upload PDF to R2 (S3):** set `Content-Type: application/pdf` (Additional Fields) for clean headers.

---

## 7) Pre‑flight (run before sending to W4)
- From W3: confirm
  - `orderId` present.
  - `pageImageUrls[]` has **15** items (p00..p14, ordered).
  - `coverPdfR2Key` points to `cover_<ORDER>.pdf` and object exists in R2.
  - Optional: `preview-images/cover-spread.png` exists (for internal dashboards).
- Fonts/overlays are already baked into images/PDF; no extra assets needed by W4.

---

## 8) W4 outputs / artifacts
- **R2:** `interior_<ORDER>.pdf` uploaded.
- **Supabase:** order row updated with `bookPdfUrl` (interior), `coverPdfUrl` (cover), status changes, job metadata.
- **Lulu:** Job created → returns `jobId`, `status`, `estimated_ship_date`, optional `cost`.
- **R2:** `manifests/4-manifest.json` written under the order path.

---

## 9) Known decisions / clarifications
- **Spine:** Not required for Lulu’s softcover in this flow; the cover PDF is centered across the 5203×2625 canvas with the visual spine at the exact middle.
- **Paper stock:** 80# text (configured in defaults). If changing stock/binding/finish, update **Build Lulu Print Job Payload** logic.
- **Who calls W4:** Your backend will call the W4 webhook (not W3).

---

## 10) Nice‑to‑have improvements (non‑blocking)
- Add `Content-Type: application/pdf` on **Upload PDF to R2** for interior (and cover if uploading here in future).
- Add retry/backoff to Lulu submission on transient 5xx.
- Log structured errors for any of: intake validation fail, PDFMonkey fail, R2 fail, Lulu fail.

---

## 11) Quick adapter snippet (if sending the full 3A manifest)
If your backend receives the full `3A-manifest.json`, forward the fields W4 needs like this (pseudo‑code):
```js
const man = manifest.manifest; // inner object
const payload = {
  orderId: man.amazonOrderId,
  pageImageUrls: input.pageImageUrls, // from W3 node output (already ordered)
  coverPdfR2Key: man.pdfGeneration.coverPdf,
  // optional
  shippingAddress, customer, title
};
// POST payload to W4 webhook URL
```

---

**That’s it — this doc is your checklist + contract for the new chat.** The agent can open W4 and verify §6 config, accept the §2 payload, and run through §5 to the Lulu submission and 4‑manifest write‑back. Good to go!

