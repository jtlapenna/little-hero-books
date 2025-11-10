# Workflow 3 → Workflow 4 Handoff Guide (Cover PDF)

**Goal:** When Workflow 3 finishes, it should call the Workflow‑4 webhook with a ready‑to‑print **cover PDF** stored in R2 and a list of **interior page image URLs**. Workflow 4 will then build the interior PDF, pair it with the cover PDF, and submit the print job to Lulu.

---

## What Workflow 4 expects (payload contract)
POST to `Webhook (W4 Intake)` with a JSON body like:
```json
{
  "orderId": "AMZ-123",
  "pageImageUrls": [
    "https://admin.littleherolabs.com/api/assets/book-mvp-simple-adventure/orders/AMZ-123/pages/p01.png",
    "https://admin.littleherolabs.com/api/assets/book-mvp-simple-adventure/orders/AMZ-123/pages/p02.png"
  ],
  "coverPdfR2Key": "book-mvp-simple-adventure/orders/AMZ-123/cover_AMZ-123.pdf",
  "customer": { "name": "Jane Smith", "email": "jane@example.com" },
  "shippingAddress": { "Name": "Jane Smith", "AddressLine1": "123 Main", "City": "Portland", "StateOrRegion": "OR", "PostalCode": "97201", "CountryCode": "US" },
  "printOptions": { "color": "premium-color", "stock": "80#-text", "binding": "perfect-bound", "coverFinish": "matte" }
}
```
**Required fields:** `orderId`, `pageImageUrls[]`, `coverPdfR2Key`.

---

## Step‑by‑step changes in **Workflow 3**

### 1) Compute trim, bleed, and **spine width**
- Trim (product): **8.5 in × 8.5 in**
- Bleed each side: **0.125 in** → full‑bleed page: **8.75 in × 8.75 in**
- **Spine width (in)** = `(pageCount / 2) * CALIPER_IN`
  - `pageCount` = total interior pages (even)
  - `CALIPER_IN` for **80# text** ≈ `0.0048` (adjust to your Lulu spec)

```js
// n8n Code (v2)
const j = $input.first().json || {};
const pageCount = Number(j.book?.totalPages || j.pageCount || 16);
const CALIPER_IN = 0.0048; // adjust if you have Lulu's exact
const spineIn = (pageCount / 2) * CALIPER_IN;

const FULL_BLEED_IN = 8.75; // 8.5 + 0.125 bleed each side
const coverWIn = FULL_BLEED_IN + spineIn + FULL_BLEED_IN;
const coverHIn = FULL_BLEED_IN;

return [{ json: { ...j, pageCount, spineIn, coverWIn, coverHIn } }];
```

### 2) Build **cover_html** for a single‑page wrap PDF
Place the **front cover art** in the right panel; spine and back can be flat color/graphics.
```js
const j = $input.first().json;
const { coverWIn, coverHIn, spineIn } = j;
const frontImg = j.frontCoverImageUrl; // your existing front cover PNG/asset

const html = [
  '<style>',
  `  @page { size: ${coverWIn}in ${coverHIn}in; margin: 0; }`,
  '  .wrap{ position:relative; width:100%; height:100%; }',
  '  .panel{ position:absolute; top:0; height:100%; }',
  `  .back{ left:0; width: calc((100% - ${spineIn}in)/2); background:#f8f8f8; }`,
  `  .spine{ left: calc((100% - ${spineIn}in)/2); width: ${spineIn}in; background:#eaeaea; }`,
  `  .front{ left: calc((100% + ${spineIn}in)/2); width: calc((100% - ${spineIn}in)/2); }`,
  '  .front img{ width:100%; height:100%; object-fit: cover; display:block; }',
  '</style>',
  '<div class="wrap">',
  '  <div class="panel back"></div>',
  '  <div class="panel spine"></div>',
  frontImg ? `  <div class="panel front"><img src="${frontImg}" alt=""/></div>` : '  <div class="panel front"></div>',
  '</div>'
].join('\n');

return [{ json: { ...j, cover_html: html, coverPdfFilename: `cover_${j.orderId}.pdf` } }];
```

### 3) Create **cover PDF** via PDFMonkey
- Use your **cover template** that accepts `{ cover_html }`.
- Set meta filename to `cover_<orderId>.pdf`.
- Poll until `status: success`; download the file.

**Payload shape (example):**
```json
{
  "document_template_id": "YOUR_COVER_TEMPLATE_ID",
  "status": "pending",
  "meta": { "_filename": "cover_AMZ-123.pdf" },
  "payload": { "cover_html": "<style>..." }
}
```

### 4) Upload the cover PDF to **R2** (private) and emit **coverPdfR2Key**
- Path: `book-mvp-simple-adventure/orders/${orderId}/cover_${orderId}.pdf`
- `ContentType: application/pdf`

```js
// After successful upload, set:
return [{ json: { ...$input.first().json, coverPdfR2Key: `book-mvp-simple-adventure/orders/${orderId}/cover_${orderId}.pdf` } }];
```

### 5) Call **Workflow 4** webhook
- POST body: `{ orderId, pageImageUrls[], coverPdfR2Key, ... }` (see contract above)
- Keep using your admin proxy URLs for `pageImageUrls` (public GET), since W4 will download through PDFMonkey.

---

## Common pitfalls
- **Page count mismatch**: spine must be computed from **final** page count.
- **Wrong canvas size**: cover PDF must be **one page**: width = back + spine + front, height = full‑bleed height.
- **Public vs private**: only the **interior pages** need to be public (for PDFMonkey). The **cover PDF** is private in R2; W4 will generate a **signed URL** for Lulu.

---

## Optional test node in W3 (handoff)
Add an HTTP Request node at the end that POSTs to W4:
```
Method: POST
URL: https://n8n.your-domain/webhook/w4-intake
Headers: Content-Type: application/json
Body (RAW → JSON):
{
  "orderId": "={{$json.orderId}}",
  "pageImageUrls": "={{$json.pageImageUrls}}",
  "coverPdfR2Key": "={{$json.coverPdfR2Key}}"
}
```

That’s it—once W3 emits `coverPdfR2Key` and the interior `pageImageUrls[]`, W4 does the rest.

