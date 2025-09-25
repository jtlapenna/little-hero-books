# Little Hero Books - Development Setup & Architecture

## 🎯 Current Status

**Phase 1 Complete**: All core components built and tested. Ready for POD integration and customer website development.

## 🏗️ Architecture Overview

```
Amazon Custom Order → n8n Workflow → Template System → Renderer → POD → Customer
```

### Service Architecture
- **Renderer Service**: PDF generation (port 8787)
- **Amazon Middleware**: SP-API integration (port 4000) 
- **Template System**: Story generation with personalization
- **Asset Management**: Prefab backgrounds and character overlays
- **Storage**: Cloudflare R2/AWS S3 for PDFs and assets

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- TypeScript
- Git

### Environment Setup

1. **Copy Environment Template**
   ```bash
   cp .env.example .env
   ```

2. **Configure Environment Variables**
   ```bash
   # Storage (required)
   STORAGE_PROVIDER=cloudflare_r2
   R2_ACCOUNT_ID=your_r2_account_id
   R2_ACCESS_KEY_ID=your_r2_access_key_id
   R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
   R2_BUCKET_NAME=little-hero-books-pdfs
   R2_PUBLIC_URL=https://pub-your-id.r2.dev

   # POD Provider (when ready)
   POD_API_KEY=your_pod_api_key
   POD_API_URL=https://api.podprovider.com

   # Amazon (when ready)
   AMZ_SELLER_ID=your_seller_id
   AMZ_MARKETPLACE_ID=ATVPDKIKX0DER
   AMZ_ACCESS_KEY=your_access_key
   AMZ_SECRET_KEY=your_secret_key
   AMZ_REFRESH_TOKEN=your_refresh_token
   ```

3. **Install Dependencies**
   ```bash
   npm run install-deps
   ```

### Running Services

#### All Services (Recommended)
```bash
npm run dev:all
```

#### Individual Services
```bash
# Renderer service only (port 8787)
npm run dev

# Amazon middleware only (port 4000)  
npm run dev:amazon

# Template system only
npm run dev:templates
```

## 🔧 Service Details

### Renderer Service (Port 8787)

**Purpose**: Generates print-ready PDFs from story data

**Endpoints**:
- `GET /health` - Health check with detailed status
- `POST /render` - Generate PDFs from manuscript data

**Input Format**:
```json
{
  "orderId": "unique-order-id",
  "spec": {
    "format": "8x10",
    "pages": 16,
    "binding": "softcover"
  },
  "manuscript": {
    "title": "Child Name and the Adventure Compass",
    "pages": [
      {
        "text": "Story text for this page...",
        "illustration_prompt": "Description of illustration..."
      }
    ],
    "meta": {
      "reading_age": "3-7",
      "theme": "adventure, discovery, friendship"
    }
  },
  "assets": {
    "backgrounds": {},
    "overlays": {}
  },
  "child": {
    "name": "Emma",
    "age": 5,
    "hair_color": "blonde",
    "skin_tone": "fair",
    "pronouns": "she/her/hers"
  },
  "options": {
    "favorite_animal": "dragon",
    "favorite_food": "pizza",
    "favorite_color": "purple",
    "hometown": "Portland",
    "occasion": "birthday",
    "dedication": "To our little hero, Emma!"
  }
}
```

**Output Format**:
```json
{
  "orderId": "unique-order-id",
  "bookPdfUrl": "https://storage.example.com/order-id/book.pdf",
  "coverPdfUrl": "https://storage.example.com/order-id/cover.pdf", 
  "thumbUrl": "https://storage.example.com/order-id/thumb.jpg",
  "status": "success",
  "duration": 1250,
  "timestamp": "2025-01-XX"
}
```

### Amazon Middleware (Port 4000)

**Purpose**: Handles Amazon SP-API integration

**Endpoints**:
- `GET /health` - Health check and configuration status
- `GET /orders` - Fetch Amazon orders (when connected)
- `POST /orders/process` - Process specific order

### Template Story System

**Purpose**: Generates personalized stories from base template

**Functions**:
- `generatePersonalizedStory(childData, options)` - Generate personalized stories from template
- `validatePersonalizedStory(story, childName)` - Validate story quality

**Location**: `templates/story-template.js`

## 🎨 Asset Handling & Composition Pipeline

### Asset Mapping Process (n8n → Renderer)

The system maps personalization inputs to prefab overlays and fixed backgrounds per page, producing page payloads with asset paths and coordinates.

#### Normalized Order JSON (Example)
```json
{
  "orderId": "AMZ-1234",
  "child": { "name": "Lila", "skin": "medium", "hair": "curly_brown", "clothes": "shirt_yellow" },
  "options": { "favorite_animal": "fox", "favorite_color": "teal", "hometown": "Grass Valley" },
  "dedication": "Happy Birthday, love Mom & Dad!",
  "shipping": { "name": "Jane Smith", "address1": "123 Main St", "city": "Denver", "state": "CO", "zip": "80202", "country": "US" }
}
```

#### Asset Map JSON (Example)
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
      "character_layers": ["..."],
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

### Composition Pipeline (Renderer Service)

#### What the renderer does (in order):
1. **Load a page template** (background + layout rules)
2. **Layer overlays** (skin, hair, clothes, animal) at fixed coordinates
3. **Typeset text** into the reserved text box
4. **Export a print-ready page** (raster or vector), then **bind all pages into `book.pdf` + `cover.pdf`**

### Recommended Approach: HTML/CSS → PDF (Puppeteer/Playwright + Paged.js)

**Why:** Easy layering with CSS, responsive text fitting, fonts, and page boxes (trim/bleed) are straightforward.

#### Page Specifications (Lock These)
- **Trim**: 8×10 in
- **Bleed**: 0.125 in on all sides
- **Final page export size**: 8.25×10.25 in
- **Raster asset target**: 300 DPI
- **Safe text margin**: ≥ 0.375 in from trim

#### Template File per Page (HTML)
Each page is one HTML file with **empty "slots"** for overlays and a `<div class="text">` for story text.

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

#### Character Compositing
- **Pre-compose** a single transparent PNG for the character (merge skin+hair+clothes server-side), then drop into `#char-slot` (**recommended for performance**)
- Or **stack multiple `<img>` elements** at the same slot (skin, hair, clothes)

#### Render Engine
- **Node**: Playwright/Puppeteer to open HTML, wait for assets, then `page.pdf({ printBackground: true })`
- **Text fit**: Keep fixed word counts; if needed, measure text height and reduce font-size slightly (down to a **16px** minimum)

#### Combine Pages
- Render each page to PDF (or one HTML containing all pages), then:
  - **Join PDFs** via `pdf-lib` / `qpdf` / `pdfrw`
  - Covers use separate templates (front: title/name; back: imprint/branding)

#### Color Management
- Keep assets **sRGB** and let POD convert to CMYK (typical), **unless** a specific CMYK ICC is required. If required, convert using Ghostscript or ImageMagick + ICC profile

### Renderer I/O Contracts

#### Input to Renderer (from n8n)
```json
{
  "spec": { "trim":"8x10", "bleed":"0.125in", "dpi":300 },
  "pages": [ 
    { 
      "template_id":"p03_forest", 
      "background":"...", 
      "character": { "composited_png":"..." }, 
      "animal":"...", 
      "text":"...", 
      "slots": { 
        "char":{"x":"1.0in","y":"6.5in","w":"3.2in"}, 
        "animal":{"x":"2.6in","y":"7.0in","w":"1.6in"} 
      } 
    } 
  ],
  "cover": { 
    "front": { "background": "...", "title": "[Name] and the Adventure Compass" }, 
    "back": { "background": "..." } 
  },
  "output_prefix": "s3://orders/AMZ-1234/"
}
```

#### Renderer Response
```json
{
  "bookPdfUrl": "https://cdn.../orders/AMZ-1234/book.pdf",
  "coverPdfUrl": "https://cdn.../orders/AMZ-1234/cover.pdf",
  "thumbUrl": "https://cdn.../orders/AMZ-1234/thumb.jpg",
  "pageChecks": [ { "page":"p03_forest", "dpi_ok": true, "text_fit": "ok" } ]
}
```

### Upload & Print Submission
1. Renderer uploads finished files to storage (R2/S3), returns signed URLs
2. **n8n → POD** `POST /orders` with `book.pdf`, `cover.pdf`, recipient + ship method
3. Store returned `podOrderId`; hand off to **Flow B** for tracking/confirm-shipment

## 🧪 Testing

### Test Renderer Service
```bash
curl -X POST http://localhost:8787/render \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "test-123",
    "spec": {"format": "8x10", "pages": 16, "binding": "softcover"},
    "manuscript": {
      "title": "Luca and the Adventure Compass",
      "pages": [
        {
          "text": "One day in Grass Valley, Luca found a compass glowing bright blue.",
          "illustration_prompt": "watercolor, warm light, forest path, child with brown hair, light skin, blue glow, fox companion"
        }
      ],
      "meta": {"reading_age": "3-7", "theme": "adventure"}
    },
    "assets": {"backgrounds": {}, "overlays": {}},
    "child": {"name": "Luca", "age": 4, "hair_color": "brown", "skin_tone": "light", "pronouns": "he/him/his"},
    "options": {"favorite_animal": "fox", "favorite_food": "strawberries", "favorite_color": "blue", "hometown": "Grass Valley", "dedication": "We love you, our little adventurer!"}
  }'
```

### Test Individual Services
```bash
# Test renderer
curl http://localhost:8787/health

# Test Amazon middleware  
curl http://localhost:4000/health

# Test story generation
node templates/story-template.js
```

## 📁 Project Structure

```
little-hero-books/
├── docs/                    # Complete documentation
├── renderer/               # PDF generation service
│   ├── src/
│   │   ├── index.ts        # Express server
│   │   ├── render.ts       # PDF generation logic
│   │   ├── schema.ts       # Zod validation schemas
│   │   ├── pdf.ts          # Playwright PDF utilities
│   │   └── storage.ts      # Cloud storage integration
│   ├── templates/          # HTML templates
│   │   ├── book.html       # Interior pages template
│   │   ├── cover.html      # Cover template
│   │   └── css/print.css   # Print styles
│   └── package.json
├── templates/              # Story template system
│   ├── story-template.js   # Template-based story generation
│   └── package.json
├── assets/                 # Asset management
│   └── asset-manager.js    # Prefab backgrounds and overlays
├── amazon/                 # SP-API integration
│   ├── sp-api-middleware.js
│   └── package.json
├── data/                   # Data models
│   └── order-model.js      # Order validation
├── n8n/workflows/          # Automation workflows
├── pod/                    # Print provider examples
├── .env.example           # Environment template
└── package.json           # Root package management
```

## 🔧 Development Guidelines

### Code Standards
- TypeScript strict mode
- Comprehensive error handling
- Zod schema validation
- Async/await patterns
- Small, focused functions

### Quality Assurance
- Name length validation (max 20 chars)
- Special character handling
- PDF print quality verification
- POD provider testing
- End-to-end order flow validation

### QA Checklist (Quick)
- [ ] All pages render at **8.25×10.25 in**, no white edges
- [ ] Trim box overlays align at **8×10 in**
- [ ] Text stays inside safe area; no clipping
- [ ] All images **≥300 DPI** at placed size; no upscaling artifacts
- [ ] Color looks correct on physical proof (order one proof before launch)

### Operational Notes
- **Pre-compose character** once per order to reduce per-page work
- **Reject assets** that would place below 300 DPI at output size
- **Idempotent outputs**: `orders/{orderId}/book.pdf` so retries don't duplicate
- **Observability**: log render duration per page, text overflow events, and POD rejections

### Common Issues & Solutions

1. **Long Names**: Truncate or use nickname fallback
2. **Special Characters**: HTML escape all user input
3. **PDF Bleed**: Ensure 0.125" bleed on all sides
4. **Color Profiles**: Use CMYK for print compatibility
5. **File Sizes**: Optimize images for web delivery

## 📊 Monitoring & Health Checks

### Service Health
- Renderer: `GET http://localhost:8787/health`
- Amazon: `GET http://localhost:4000/health`

### Key Metrics to Track
- Order processing time
- PDF generation success rate
- POD fulfillment times
- System error rates
- Customer satisfaction scores

## 🚀 Deployment

### Production Environment
1. **Renderer Service**: Deploy as containerized service
2. **File Storage**: Use Cloudflare R2 or AWS S3
3. **n8n**: Host on cloud with proper credentials
4. **Monitoring**: Set up alerts for failed orders
5. **Backup**: Regular database and file backups

### Scaling Considerations
- Cache common manuscript variants
- Use CDN for PDF delivery
- Implement queue system for high volume
- Add multiple POD providers for redundancy
- Monitor API rate limits

## 📞 Support & Resources

- **Documentation**: Complete guides in `/docs`
- **API Examples**: Working code samples for all integrations
- **Troubleshooting**: Common issues and solutions
- **Status**: All core services operational and tested
