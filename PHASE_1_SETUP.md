# Phase 1 Setup: Mock Renderer Testing

This guide will help you set up the mock renderer service for testing PDF generation with background images.

## 🎯 What We're Building

A simple Node.js service that:
- Serves background images from `/assets/backgrounds/`
- Accepts `POST /render` requests with page data
- Generates PDFs with proper dimensions (8.25×10.25 inches)
- Serves generated PDFs via URLs for n8n testing

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd renderer-mock
npm install
```

If npm install fails, try:
```bash
# Use full path to npm
/opt/homebrew/opt/node@20/bin/npm install

# Or run the setup script
./test-setup.sh
```

### 2. Create Test Images

```bash
# Create placeholder background images
python3 create-test-images.py
```

This creates 14 placeholder images with:
- Correct dimensions: 3375×2625 pixels (11.25×8.75 inches @ 300 DPI)
- Unique colors for each page
- Page numbers and descriptions
- Proper PNG format

### 3. Start the Server

```bash
node server.js
```

Server will start on `http://localhost:8787`

### 4. Test the Service

```bash
# Health check
curl http://localhost:8787/health

# List available backgrounds
curl http://localhost:8787/assets/backgrounds

# Test PDF generation
curl -X POST http://localhost:8787/render \
  -H "Content-Type: application/json" \
  -d '{
    "orderId":"TEST-001",
    "pages":[
      {"background":"http://localhost:8787/assets/backgrounds/page01_bedroom.png"},
      {"background":"http://localhost:8787/assets/backgrounds/page02_bedroom_night.png"}
    ],
    "cover":{
      "front_background":"http://localhost:8787/assets/backgrounds/page01_bedroom.png",
      "title":"Emma and the Adventure Compass"
    }
  }'
```

## 📁 File Structure

```
renderer-mock/
├── server.js              # Main server (Express + PDF generation)
├── package.json           # Dependencies
├── create-test-images.py  # Script to create placeholder images
├── test-setup.sh         # Setup and test script
├── README.md             # Detailed documentation
├── assets/
│   └── backgrounds/       # Background images (14 pages)
│       ├── page01_bedroom.png
│       ├── page02_bedroom_night.png
│       └── ... (12 more)
└── out/                   # Generated PDFs (auto-created)
    └── [orderId]/
        ├── book.pdf
        └── cover.pdf
```

## 🎨 Background Image Requirements

For production, you'll need real background images with:

- **Canvas:** 11.25 × 8.75 inches @ **300 DPI** (3375 × 2625 px)
- **Trim Size:** 11 × 8.25 inches (with 0.125" bleed each side, 0.25" top/bottom)
- **Color:** sRGB (IEC61966-2.1)
- **Format:** PNG (opaque; no transparency)
- **Naming:** `page01_bedroom.png`, `page02_bedroom_night.png`, etc.

### The Adventure Compass Story Pages:

1. **page01_bedroom** - Child's bedroom (day)
2. **page02_bedroom_night** - Child's bedroom (night)
3. **page03_forest** - Forest path entrance
4. **page04_mountain** - Mountain vista
5. **page05_sky** - Sky with clouds
6. **page06_sea** - Ocean scene
7. **page07_picnic** - Picnic area
8. **page08_cave** - Cave entrance
9. **page09_garden** - Magical garden
10. **page10_town** - Town square
11. **page11_bedroom_return** - Bedroom return
12. **page12_compass_glow** - Compass glowing
13. **page13_keepsake_frame** - Keepsake frame
14. **page14_dedication_frame** - Dedication frame

## 🔧 n8n Integration

### Update Flow A Workflow

1. **HTTP Request (Renderer)**
   - **URL:** `http://localhost:8787/render`
   - **Method:** POST
   - **Body:** Use the mock renderer format

2. **POD Bypass for Testing**
   - Add environment variable: `SEND_TO_POD=false`
   - When false, skip POD submission
   - When true, proceed to POD submission

3. **Database Integration**
   - Use Supabase schema with `little_hero_books.` prefix
   - Store order data and PDF URLs

### Sample n8n Workflow Body

```json
{
  "orderId": "{{$json.orderId}}",
  "pages": [
    {"background": "http://localhost:8787/assets/backgrounds/page01_bedroom.png"},
    {"background": "http://localhost:8787/assets/backgrounds/page02_bedroom_night.png"},
    {"background": "http://localhost:8787/assets/backgrounds/page03_forest.png"},
    {"background": "http://localhost:8787/assets/backgrounds/page04_mountain.png"},
    {"background": "http://localhost:8787/assets/backgrounds/page05_sky.png"},
    {"background": "http://localhost:8787/assets/backgrounds/page06_sea.png"},
    {"background": "http://localhost:8787/assets/backgrounds/page07_picnic.png"},
    {"background": "http://localhost:8787/assets/backgrounds/page08_cave.png"},
    {"background": "http://localhost:8787/assets/backgrounds/page09_garden.png"},
    {"background": "http://localhost:8787/assets/backgrounds/page10_town.png"},
    {"background": "http://localhost:8787/assets/backgrounds/page11_bedroom_return.png"},
    {"background": "http://localhost:8787/assets/backgrounds/page12_compass_glow.png"},
    {"background": "http://localhost:8787/assets/backgrounds/page13_keepsake_frame.png"},
    {"background": "http://localhost:8787/assets/backgrounds/page14_dedication_frame.png"}
  ],
  "cover": {
    "front_background": "http://localhost:8787/assets/backgrounds/page01_bedroom.png",
    "title": "{{$json.child.name}} and the Adventure Compass"
  }
}
```

## ✅ Acceptance Criteria

### Phase 1 Complete When:
- [ ] Mock renderer service running on localhost:8787
- [ ] 14 placeholder background images created
- [ ] PDF generation working with correct dimensions
- [ ] PDFs accessible via URLs
- [ ] n8n Flow A can call renderer successfully
- [ ] Database integration working (Supabase)
- [ ] POD bypass working (SEND_TO_POD=false)

### PDF Quality Checks:
- [ ] Each page is exactly 11×8.25 inches (trim size)
- [ ] No white borders or distortion
- [ ] Images fit full bleed (edge to edge)
- [ ] Cover page includes title
- [ ] Generated PDFs load in browser

## 🚀 Next Steps (Phase 2: Text System Refinement)

Phase 1 is complete! Text system is working but needs refinement:

1. **Text Styling & Positioning** (Current Priority)
   - Refine text colors and contrast for readability
   - Improve positioning for each page type
   - Add text backgrounds and shadows
   - Create page-specific text layouts
   - Test readability against all backgrounds

2. **Character System Development** (Next)
   - Create base character pose (800×1200px)
   - Add 3-4 skin tone variants
   - Add 3-4 hair style options
   - Add 2-3 clothing options
   - Update renderer for group overlays

3. **Real Background Images**
   - Replace placeholder images with real artwork
   - Ensure proper dimensions and quality
   - Test with actual story content

4. **Full System Integration**
   - Replace mock renderer with real service
   - Enable Amazon SP-API integration
   - Enable POD provider integration

## 📚 Documentation

- **Character Development**: See `docs/CHARACTER_DEVELOPMENT_ROADMAP.md`
- **Art Specifications**: See `docs/ART_ASSET_SPECS.md`
- **Implementation Guide**: See `docs/n8n-workflow-files/N8N_IMPLEMENTATION.md`

## 🛠️ Troubleshooting

### Common Issues:

1. **npm install fails**
   - Try using full path: `/opt/homebrew/opt/node@20/bin/npm install`
   - Check Node.js version: `node --version`

2. **Server won't start**
   - Check if port 8787 is available
   - Try different port: `PORT=8788 node server.js`

3. **PDF generation fails**
   - Check if background images exist
   - Verify image URLs are accessible
   - Check server logs for errors

4. **n8n connection fails**
   - Verify server is running
   - Check n8n HTTP request configuration
   - Test with curl first

### Debug Commands:

```bash
# Check server status
curl http://localhost:8787/health

# List available images
curl http://localhost:8787/assets/backgrounds

# Test PDF generation
curl -X POST http://localhost:8787/render -H "Content-Type: application/json" -d '{"orderId":"TEST","pages":[{"background":"http://localhost:8787/assets/backgrounds/page01_bedroom.png"}]}'

# Check generated PDFs
ls -la out/*/book.pdf
```

---

**Ready to start?** Run the setup steps above and you'll have a working mock renderer in minutes!
