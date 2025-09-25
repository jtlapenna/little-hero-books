# Customer Experience & Order Flow — MVP (Amazon First, n8n Orchestrated)

This outlines the end‑to‑end journey from shopper discovery → order → AI generation → print → shipment. Use it to design the UX and implement the backend.

---

## 0) High‑Level Journey (Swimlanes)
**Customer** → browses → customizes → buys → receives updates → gets book  
**Amazon** → product page (Amazon Custom) → order + customization fields → SP‑API  
**n8n (Orchestrator)** → pulls order → validates → generates PDFs → submits POD → tracks → confirms shipment  
**Renderer Service** → builds book.pdf & cover.pdf from template + inputs  
**LLM/Image** → (optional MVP) text generation or prefab illustration retrieval  
**POD (e.g., Lulu/OnPress)** → print → ship → tracking  
**Storage** → R2/S3 for PDFs & thumbs  

---

## 1) Customer Experience Flow
1. **Discovery**: Finds listing via search/ads/holiday guide.  
2. **Product Page (Amazon Custom)**:
   - Selects options / enters fields: Name, Age, Hair, Skin, Fav Color, Fav Animal, Dedication, Hometown, Occasion.  
   - Add‑to‑Cart → Checkout (Prime trust).  
3. **Order Confirmation**: Standard Amazon confirmation email.  
4. **Status Updates**:
   - Optional: buyer‑seller message (order received, estimated ship).  
   - Shipping notification w/ tracking (from SP‑API confirm shipment).  
5. **Delivery & Unboxing**: Book arrives; emotional moment.  
6. **Post‑Purchase**: Thank‑you note + review request; optional upsell (hardcover/premium edition).

**UX Notes**:
- Show 3–4 preview thumbnails on listing (sample pages).  
- Clear delivery cutoff dates (e.g., “Order by Dec 15 for Christmas”).  
- Keep fields minimal; use dropdowns where possible (hair/skin/animal/occasion).  

---

## 2) Backend Flow Overview (Event Timeline)
**T0**: Amazon order placed → customization captured → order enters **Unshipped**.  
**T0+5m**: n8n Flow A polls SP‑API → fetches order & items → extracts customization JSON.  
**T0+10m**: Renderer called with manuscript + assets → returns book.pdf & cover.pdf URLs.  
**T0+15m**: n8n submits POD order (ship method = Economy by default).  
**T0+15m → D+X**: Flow B polls POD for status → when tracking appears, confirm shipment on SP‑API.  
**D+X**: Customer receives Amazon shipping email + optional buyer‑seller message.  

---

## 3) n8n Workflows (Detailed)
### Flow A — Order Intake & Job Creation (Cron 5–10 min)
1. **Trigger**: Cron.  
2. **Get Orders** (SP‑API ListOrders, Unshipped/PartiallyShipped, since last poll).  
3. **Get Order Items** (pull customization fields).  
4. **Validate & Normalize** (schema: child, options, shipping).  
5. **(MVP Text)**: Use fixed template text; optional LLM for light personalization.  
6. **Assets**: Select prefab backgrounds; map overlays (hair/skin/clothes/colors/animal).  
7. **Renderer**: POST /render → returns `bookPdfUrl`, `coverPdfUrl`, `thumbUrl`.  
8. **POD Order**: POST POD /orders with PDFs + ship‑to; receive `podOrderId`.  
9. **Persist**: Upsert to DB/Sheet: `orderId, podOrderId, status=submitted, pdfs, inputs`.  
10. **Notify**: Slack/Email: “Created POD job for Amazon order …”.

### Flow B — Tracking & Shipment Confirmation (Cron 30–60 min)
1. **Trigger**: Cron.  
2. **Fetch in‑flight jobs** (status ∈ submitted/in_production).  
3. **Get POD Status** (check tracking).  
4. **When tracking**: SP‑API ConfirmShipment (carrier, tracking, ship date).  
5. **Update**: DB status → shipped; store tracking.  
6. **Notify**: Slack and optional buyer‑seller message.  

### Flow C — Exceptions & Retries (On‑Error globally)
- Automatic retries w/ exponential backoff on HTTP nodes.  
- Dead‑letter to Notion/Sheet: orders needing manual review (bad fields, render fail).  
- Alert channel: `#ops-personalized-books`.

---

## 4) Renderer Service (Single Template MVP)
- **Input**: JSON { spec, manuscript, assets, child, options }.  
- **Process**: Merge prefab backgrounds + overlay character, place text blocks, enforce trim/bleed (8×10, 0.125"), export CMYK‑friendly PDF.  
- **Output**: Signed URLs for `book.pdf`, `cover.pdf`, `thumb.jpg`.  
- **Storage**: R2/S3 bucket with `{orderId}/book.pdf` pattern.

---

## 5) Data Model (MVP)
**Order**: orderId, orderDate, marketplaceId, buyerMaskedEmail  
**CustomerInputs**: name, age, hair, skin, favColor, favAnimal, hometown, dedication, occasion  
**Files**: bookPdfUrl, coverPdfUrl, thumbUrl  
**POD**: podOrderId, status, shipMethod  
**Shipping**: name, address1, address2, city, state, zip, country, phone  
**Tracking**: carrier, trackingNumber, shipDate, deliveredDate?  
**Ops**: createdAt, updatedAt, errorState, notes

---

## 6) SLAs & Policies (suggested)
- **Order to POD submit**: ≤ 30 minutes average.  
- **Proofing**: 1 manual test per template change.  
- **Reprints**: If POD defect or layout error → auto reprint at cost.  
- **Cutoffs**: Holiday deadline banner on Amazon listing.

---

## 7) Notifications & CX Touchpoints
- **Order received** (optional buyer‑seller message with friendly note).  
- **Shipped** (SP‑API confirmation triggers Amazon email).  
- **Post‑delivery**: Review request + upsell to Premium/Hardcover.

---

## 8) Security & Compliance
- Do not store full buyer email beyond masked value.  
- PII in storage encrypted; signed URLs time‑limited.  
- Log redaction for inputs.

---

## 9) Observability & Ops
- n8n dashboard: success/fail counts by step.  
- Metrics: average time to render, POD acceptance rate, reprint rate, SLA adherence.  
- Runbooks: common failures (SP‑API throttling, POD file spec mismatch, storage permission).

---

## 10) Future Enhancements
- Live preview on D2C site with Amazon link‑out (keeps Amazon trust).  
- Second POD for geo‑routing + redundancy.  
- Premium edition pipeline (AI character persistence).  
- Multi‑language templates.

---

## 11) ASCII Flow (Quick Reference)
```
Customer → Amazon Listing → (Amazon Custom fields) → Checkout
           │
           ▼
       SP‑API Orders  ← n8n Flow A (cron)
           │                  ├─ Get Order/Items
           │                  ├─ Normalize Inputs
           │                  ├─ Renderer (PDFs)
           │                  └─ POD /orders (job id)
           ▼
       POD Production ← n8n Flow B (cron)
           │                  ├─ Poll status
           │                  ├─ Get tracking
           │                  └─ SP‑API ConfirmShipment
           ▼
      Amazon sends ship email → Customer receives book
```

