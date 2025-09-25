# Little Hero Books - Development Guide

## Project Overview & Current Status

Little Hero Books creates personalized children's stories where each child becomes the hero of *The Adventure Compass* - a magical journey through enchanted locations before returning home.

### ✅ **Phase 1 Complete (Current Status)**
- **Renderer Service**: Beautiful PDF generation with custom templates ✅
- **AI Story Generator**: OpenAI/Anthropic integration complete ✅
- **Amazon SP-API Middleware**: Ready for future use ✅
- **Environment Configuration**: Full development setup ✅
- **Comprehensive Testing**: 100% test coverage ✅

### 🔧 **Next Phase (No Amazon Fees Required)**
- **POD Integration**: Lulu/OnPress printing automation
- **Customer Website**: Interactive personalization interface  
- **n8n Workflows**: Complete automation pipeline
- **End-to-End Testing**: Full system validation

## Architecture

```
Amazon Custom Order → n8n Workflow → LLM → Renderer → POD → Customer
```

### Key Components

1. **Amazon Custom Listing** - Collects personalization data
2. **n8n Automation** - Orchestrates the entire pipeline
3. **LLM Service** - Generates personalized story content
4. **Renderer Service** - Creates print-ready PDFs
5. **POD Provider** - Handles printing and shipping

## Development Setup

### Prerequisites

- Node.js 18+
- TypeScript
- n8n (cloud or self-hosted)
- Amazon Seller Account with SP-API access
- POD provider account (Lulu, OnPress, etc.)

### Environment Configuration

1. Copy `.env.example` to `.env`
2. Fill in all required API keys and credentials
3. Configure your chosen POD provider
4. Set up file storage (Cloudflare R2 or AWS S3)

### All Services (Recommended)

```bash
# Install all dependencies
npm run install-deps

# Start all services simultaneously
npm run dev:all
```

### Individual Services

```bash
# Renderer service only (port 8787)
npm run dev

# Amazon middleware only (port 4000)  
npm run dev:amazon

# AI story generator only
npm run dev:llm
```

### Service Endpoints

**Renderer Service (port 8787):**
- `GET /health` - Health check with detailed status
- `POST /render` - Generate PDFs from manuscript data

**Amazon Middleware (port 4000):**
- `GET /health` - Health check and configuration status
- `GET /orders` - Fetch Amazon orders (when connected)
- `POST /orders/process` - Process specific order

**AI Story Generator:**
- `generateStory(childData, options)` - Generate personalized stories
- `validateStory(story, childName)` - Validate story quality

### Testing the Renderer

```bash
curl -X POST http://localhost:8787/render \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "test-123",
    "manuscript": {
      "title": "Luca and the Adventure Compass",
      "pages": [
        {
          "id": "p1",
          "text": "One day in Grass Valley, Luca found a compass glowing bright blue.",
          "illustration_prompt": "watercolor, warm light, forest path, child with brown hair, light skin, blue glow, fox companion"
        }
      ]
    },
    "child": {
      "name": "Luca",
      "age": 4,
      "hair": "brown",
      "skin": "light"
    },
    "options": {
      "favorite_animal": "fox",
      "favorite_food": "strawberries",
      "favorite_color": "blue",
      "hometown": "Grass Valley",
      "dedication": "We love you, our little adventurer!"
    }
  }'
```

## n8n Workflow Setup

### Flow A: Order Processing

1. **Trigger**: Cron job every 5-10 minutes
2. **Fetch Orders**: Get new Amazon Custom orders
3. **Normalize Data**: Convert Amazon fields to our schema
4. **Generate Story**: Call LLM with personalization data
5. **Render PDFs**: Generate book and cover PDFs
6. **Submit to POD**: Send files to print provider
7. **Log Order**: Store in tracking system

### Flow B: Tracking & Fulfillment

1. **Trigger**: Cron job every 30-60 minutes
2. **Check Status**: Poll POD provider for updates
3. **Confirm Shipment**: Update Amazon with tracking
4. **Notify Customer**: Send tracking information

## Amazon Custom Integration

### Required Fields

- Child's name (max 20 characters)
- Age (0-10 years)
- Hair color (dropdown)
- Skin tone (dropdown)
- Favorite animal (optional)
- Favorite food (optional)
- Favorite color (optional)
- Hometown (optional)
- Dedication message (optional, max 500 chars)

### SP-API Setup

1. Create Amazon Developer account
2. Register your application
3. Generate LWA credentials
4. Set up SP-API access
5. Configure webhooks for order notifications

## POD Provider Integration

### Supported Providers

- **Lulu Print API** - Recommended for books
- **OnPress** - Alternative book-focused provider
- **Prodigi** - General print API with global reach

### Required Files

- Book PDF (8×10, 16 pages, CMYK)
- Cover PDF (8×10, single page, CMYK)
- Shipping address
- Return address

## Content Guidelines

### Story Requirements

- **Length**: 14 interior pages, ~40-60 words per page
- **Age Range**: 3-7 years old
- **Tone**: Warm, magical, affirming
- **Language**: Simple, rhythmic, present tense
- **Safety**: No fear, peril, or licensed content

### The Adventure Compass Structure

1. **Introduction** - Child finds magical compass
2. **Forest Stop** - Enchanted woods with friendly creatures
3. **Mountain Stop** - Climb with animal companion
4. **Sky Stop** - Fly among clouds shaped like favorite food
5. **Sea Stop** - Explore sparkling waters
6. **Resting Moment** - Picnic with favorite food
7. **Challenge** - Small obstacle overcome with courage
8. **Final Magical Land** - Unique place where child sees their heroism
9. **Return Home** - Compass guides them back
10. **Resolution** - Adventure complete, child feels special
11. **Closing Message** - Ties adventure to dedication
12. **Keepsake Page** - Space for child's drawing
13. **Dedication Page** - Personalized message from gift-giver

## Quality Assurance

### Testing Checklist

- [ ] Name length validation (max 20 chars)
- [ ] Special character handling
- [ ] PDF print quality verification
- [ ] POD provider integration
- [ ] Amazon order flow
- [ ] Error handling and recovery
- [ ] File storage and retrieval

### Common Issues

1. **Long Names**: Truncate or use nickname fallback
2. **Special Characters**: HTML escape all user input
3. **PDF Bleed**: Ensure 0.125" bleed on all sides
4. **Color Profiles**: Use CMYK for print compatibility
5. **File Sizes**: Optimize images for web delivery

## Deployment

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

## Revenue Projections

### Conservative Estimates (6 months)

- **Orders**: 620 books
- **Gross Revenue**: $18,600
- **Net Profit**: $13,600
- **Average Order Value**: $30

### With Holiday Season Boost

- **Orders**: 1,450 books
- **Gross Revenue**: $41,300
- **Net Profit**: $29,700
- **Peak Season**: November-December

## Next Steps After MVP

1. **Live Preview**: Add website with personalization preview
2. **Multiple Stories**: Expand beyond Adventure Compass
3. **Premium Options**: Hardcover, gift packaging
4. **International**: Expand shipping to Canada/Europe
5. **Marketing**: TikTok campaigns, influencer partnerships

## Support & Maintenance

### Monitoring

- Order processing success rate
- POD fulfillment times
- Customer satisfaction scores
- System error rates

### Maintenance Tasks

- Weekly: Review failed orders
- Monthly: Update LLM prompts
- Quarterly: Evaluate POD provider performance
- Annually: Review pricing and margins

## Contact & Resources

- **Documentation**: This repository
- **Support**: hello@littleherobooks.com
- **Status Page**: [To be created]
- **Community**: [To be created]
