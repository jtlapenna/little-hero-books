# Little Hero Books Mock Renderer

A simple Node.js service for testing PDF generation with background images during development.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start
# or
node server.js
```

Server runs on `http://localhost:8787`

## 📁 Project Structure

```
renderer-mock/
├── server.js              # Main server file
├── package.json           # Dependencies
├── assets/
│   └── backgrounds/       # Place your background images here
│       ├── page01_bedroom.png
│       ├── page02_bedroom_night.png
│       └── ... (14 total pages)
└── out/                   # Generated PDFs (auto-created)
    └── [orderId]/
        ├── book.pdf
        └── cover.pdf
```

## 🎨 Background Image Requirements

- **Canvas:** 11.25 × 8.75 inches @ **300 DPI** (3375 × 2625 px)
- **Trim Size:** 11 × 8.25 inches (with 0.125" bleed each side, 0.25" top/bottom)
- **Color:** sRGB (IEC61966-2.1)
- **Format:** PNG (opaque; no transparency)
- **Naming:** `page01_bedroom.png`, `page02_bedroom_night.png`, etc.

## 📡 API Endpoints

### POST /render

Generate PDFs from background images.

**Request:**
```json
{
  "orderId": "TEST-001",
  "pages": [
    {"background": "http://localhost:8787/assets/backgrounds/page01_bedroom.png"},
    {"background": "http://localhost:8787/assets/backgrounds/page02_bedroom_night.png"}
  ],
  "cover": {
    "front_background": "http://localhost:8787/assets/backgrounds/page01_bedroom.png",
    "title": "Emma and the Adventure Compass"
  }
}
```

**Response:**
```json
{
  "orderId": "TEST-001",
  "status": "completed",
  "bookPdfUrl": "http://localhost:8787/out/TEST-001/book.pdf",
  "coverPdfUrl": "http://localhost:8787/out/TEST-001/cover.pdf",
  "thumbUrl": "http://localhost:8787/out/TEST-001/book.pdf",
  "duration": "1234ms",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "ok": true,
  "service": "Little Hero Books Mock Renderer",
  "version": "1.0.0",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### GET /assets/backgrounds

List available background images.

**Response:**
```json
{
  "backgrounds": [
    {
      "name": "page01_bedroom.png",
      "url": "http://localhost:8787/assets/backgrounds/page01_bedroom.png"
    }
  ]
}
```

## 🧪 Testing

### Test with curl:

```bash
# Health check
curl http://localhost:8787/health

# List backgrounds
curl http://localhost:8787/assets/backgrounds

# Render test PDF
curl -X POST http://localhost:8787/render \
  -H "Content-Type: application/json" \
  -d '{
    "orderId":"TEST-001",
    "pages":[
      {"background":"http://localhost:8787/assets/backgrounds/page01_bedroom.png"},
      {"background":"http://localhost:8787/assets/backgrounds/page02_bedroom_night.png"}
    ],
    "cover":{"front_background":"http://localhost:8787/assets/backgrounds/page01_bedroom.png","title":"Emma and the Adventure Compass"}
  }'
```

### Test with n8n:

1. Import Flow A workflow
2. Update renderer URL to `http://localhost:8787/render`
3. Set `SEND_TO_POD=false` for testing
4. Run workflow with test data

## 📋 Next Steps

1. **Add background images** to `assets/backgrounds/` directory
2. **Test PDF generation** with curl or n8n
3. **Verify PDF dimensions** (8.25×10.25 inches)
4. **Integrate with n8n** Flow A workflow
5. **Add character overlays** (Phase 2)

## 🔧 Development Notes

- PDFs include trim box indicators during development (red border)
- Images are scaled to fit full bleed (8.25×10.25 inches)
- Generated PDFs are served statically from `/out` directory
- Server logs all operations for debugging

## 🚀 Production Migration

When ready for production:
1. Replace with full renderer service
2. Add character overlay support
3. Integrate with asset management system
4. Add proper error handling and retries
5. Deploy to cloud service
