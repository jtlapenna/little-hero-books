# Asset Handling Workflow (n8n → Renderer → POD)

This expands the asset flow with a **full Composition Pipeline** implementation so the team can build and ship the MVP confidently.

---

## 1) Order Intake (Amazon → n8n)

- Amazon SP‑API provides order + customization fields (child name, hair, skin, favorite animal, dedication, hometown, occasion).
- **n8n Flow A** normalizes inputs to a strict JSON schema.

**Normalized order JSON (example):**

```json
{
  "orderId": "AMZ-1234",
  "child": { "name": "Lila", "skin": "medium", "hair": "curly_brown", "clothes": "shirt_yellow" },
  "options": { "favorite_animal": "fox", "favorite_color": "teal", "hometown": "Grass Valley" },
  "dedication": "Happy Birthday, love Mom & Dad!",
  "shipping": { "name": "Jane Smith", "address1": "123 Main St", "city": "Denver", "state": "CO", "zip": "80202", "country": "US" }
}
```

---

## 2) Asset Mapping (n8n)

- Maps inputs → prefab overlays and fixed backgrounds per page.
- Produces **page payloads** with asset paths + coordinates for slots.

**Asset map JSON (excerpt):**

```json
{
  "pages": [
    {
      "template_id": "p01_bedroom",
      "background": "s3://backgrounds/page01_bedroom.png",
      "character_layers": [
        "s3://overlays/skin/medium.png",
        "s3://overlays/hair/curly_brown.png",
        "s3://overlays/clothes/shirt_yellow.png"
      ],
      "animal": null,
      "text": "One night in Grass Valley, Lila found a compass glowing teal...",
      "slots": { "char": {"x":"1.1in","y":"6.6in","w":"3.2in"} }
    },
    {
      "template_id": "p03_forest",
      "background": "s3://backgrounds/page03_forest.png",
      "character_layers": ["…"],
      "animal": "s3://animals/fox.png",
      "text": "The forest leaves shimmered teal as the compass hummed...",
      "slots": {
        "char":   {"x":"1.0in","y":"6.5in","w":"3.2in"},
        "animal": {"x":"2.6in","y":"7.0in","w":"1.6in"}
      }
    }
  ],
  "cover": { "front": { "background": "s3://covers/front_base.png", "title": "Lila and the Adventure Compass" } },
  "output_prefix": "s3://orders/AMZ-1234/"
}
```

---

## 3) Composition Pipeline (Renderer Service)

### What the renderer does (in order)

1. **Load a page template** (background + layout rules).
2. **Layer overlays** (skin, hair, clothes, animal) at fixed coordinates.
3. **Typeset text** into the reserved text box.
4. **Export a print‑ready page** (raster or vector), then **bind all pages into **``** + **``.

---

## 4) Recommended Approach (fast + reliable)

### Option A — HTML/CSS → PDF (Puppeteer/Playwright + Paged.js)

**Why:** Easy layering with CSS, responsive text fitting, fonts, and page boxes (trim/bleed) are straightforward.

#### 1) Page spec (lock this)

- Trim: **8×10 in**
- Bleed: **0.125 in** on all sides
- Final page export size: **8.25×10.25 in**
- Raster asset target: **300 DPI**
- Safe text margin: **≥ 0.375 in** from trim

#### 2) Template file per page (HTML)

Each page is one HTML file (or a single HTML with 16 `@page` sections) with **empty “slots”** for overlays and a `<div class="text">` for story text.

```html
<!-- page-03.html (Forest Stop) -->
<html>
<head>
  <style>
    @page { size: 8.25in 10.25in; margin: 0; }
    body { margin: 0; position: relative; width: 8.25in; height: 10.25in; }
    .bg     { position:absolute; left:0; top:0; width:100%; height:100%; }
    .slot   { position:absolute; pointer-events:none; }
    .char   { width: 3.2in; }
    .animal { width: 1.6in; }
    /* Coordinates from template manifest */
    #char-slot   { left: 1.0in; top: 6.5in; }
    #animal-slot { left: 2.6in; top: 7.0in; }
    #text-box {
      position:absolute; left:0.5in; right:0.5in; bottom:0.5in; height:1.8in;
      font-family: 'Nunito', sans-serif; font-size: 18px; line-height: 1.35; color: #2b2520;
    }
  </style>
</head>
<body>
  <img class="bg" src="{{background}}" />
  <img id="char-slot" class="slot char" src="{{character_composite}}" />
  <img id="animal-slot" class="slot animal" src="{{animal}}" />
  <div id="text-box">{{page_text}}</div>
</body>
</html>
```

> `{{…}}` are placeholders your renderer replaces before printing.

#### 3) Character compositing (pre‑compose or layer in CSS)

- **Pre‑compose** a single transparent PNG for the character (merge skin+hair+clothes server‑side), then drop into `#char-slot` (**recommended for performance**).
- Or **stack multiple **``** elements** at the same slot (skin, hair, clothes).

#### 4) Render engine

- **Node**: Playwright/Puppeteer to open HTML, wait for assets, then `page.pdf({ printBackground: true })`.
- **Text fit**: Keep fixed word counts; if needed, measure text height and reduce font-size slightly (down to a **16px** minimum).

#### 5) Combine pages

- Render each page to PDF (or one HTML containing all pages), then:
  - **Join PDFs** via `pdf-lib` / `qpdf` / `pdfrw`.
  - Covers use separate templates (front: title/name; back: imprint/branding).

#### 6) Color management

- Keep assets **sRGB** and let POD convert to CMYK (typical), **unless** a specific CMYK ICC is required. If required, convert using Ghostscript or ImageMagick + ICC profile.

---

## 5) Renderer I/O Contracts

### Input to Renderer (from n8n)

```json
{
  "spec": { "trim":"8x10", "bleed":"0.125in", "dpi":300 },
  "pages": [ { "template_id":"p03_forest", "background":"…", "character": { "composited_png":"…" }, "animal":"…", "text":"…", "slots": { "char":{"x":"1.0in","y":"6.5in","w":"3.2in"}, "animal":{"x":"2.6in","y":"7.0in","w":"1.6in"} } } ],
  "cover": { "front": { "background": "…", "title": "[Name] and the Adventure Compass" }, "back": { "background": "…" } },
  "output_prefix": "s3://orders/AMZ-1234/"
}
```

### Renderer Response

```json
{
  "bookPdfUrl": "https://cdn.../orders/AMZ-1234/book.pdf",
  "coverPdfUrl": "https://cdn.../orders/AMZ-1234/cover.pdf",
  "thumbUrl": "https://cdn.../orders/AMZ-1234/thumb.jpg",
  "pageChecks": [ { "page":"p03_forest", "dpi_ok": true, "text_fit": "ok" } ]
}
```

---

## 6) Upload & Print Submission

1. Renderer uploads finished files to storage (R2/S3), returns signed URLs.
2. **n8n → POD** `POST /orders` with `book.pdf`, `cover.pdf`, recipient + ship method.
3. Store returned `podOrderId`; hand off to **Flow B** for tracking/confirm‑shipment.

---

## 7) QA Checklist (quick)

-

---

## 8) Operational Notes

- **Pre‑compose character** once per order to reduce per‑page work.
- **Reject assets** that would place below 300 DPI at output size.
- **Idempotent outputs**: `orders/{orderId}/book.pdf` so retries don’t duplicate.
- **Observability**: log render duration per page, text overflow events, and POD rejections.

