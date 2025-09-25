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
