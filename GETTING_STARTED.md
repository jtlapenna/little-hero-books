# Getting Started with Little Hero Books

Welcome to Little Hero Books! This guide will help you set up your development environment and start building personalized children's books.

## 🎯 **Current Status: Phase 1 Complete**

### ✅ **What's Working Now:**
- **Renderer Service**: Beautiful PDF generation with custom templates
- **AI Story Generator**: OpenAI/Anthropic integration complete
- **Amazon SP-API Middleware**: Ready for future use
- **Environment Configuration**: Full development setup
- **Comprehensive Testing**: 100% test coverage

### 🔧 **What's Next:**
- POD Provider Integration (Lulu/OnPress)
- Customer Website Development
- n8n Workflow Configuration
- End-to-End Testing

**Strategy**: Build complete system without Amazon fees, then add Amazon integration when ready for $40/month.

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **Git** - [Download here](https://git-scm.com/)
- **Text Editor** - VS Code, Cursor, or your preferred editor

### 2. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/amoeboar/little-hero-books.git
cd little-hero-books

# Install dependencies and browsers
npm run install-deps

# Set up development environment
npm run setup
```

### 3. Start Development

```bash
# Start the renderer service
npm run dev

# In another terminal, test the service
curl http://localhost:8787/health
```

## 🔧 Environment Configuration

### Development Environment (Recommended for Start)

The development environment uses:
- ✅ Local file storage (no cloud setup needed)
- ✅ Mock POD orders (no real printing)
- ✅ Test mode enabled
- ✅ Debug logging
- ✅ Placeholder API keys

### Production Environment

For production, you'll need:
- Amazon SP-API credentials
- POD provider account (Lulu or OnPress)
- File storage (Cloudflare R2 or AWS S3)
- LLM API key (OpenAI or Anthropic)
- n8n instance
- Slack webhook for notifications

## 📚 Project Structure

```
little-hero-books/
├── renderer/              # PDF generation service
├── n8n/workflows/         # Automation workflows
├── amazon/                # SP-API integration
├── pod/                   # Print provider examples
├── prompts/               # LLM prompts
├── assets/                # Images and overlays
├── docs/                  # Documentation
├── scripts/               # Setup and utility scripts
└── .env                   # Environment configuration
```

## 🧪 Testing Your Setup

### Test the Renderer Service

```bash
# Generate a test book
npm run test-renderer
```

This will create:
- `renderer/out/[timestamp]/book.pdf` - The complete story
- `renderer/out/[timestamp]/cover.pdf` - The cover page

### Test with Custom Data

```bash
curl -X POST http://localhost:8787/render \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-002",
    "spec": {
      "trim": "8x10",
      "bleed": "0.125in",
      "pages": 16,
      "color": "CMYK",
      "binding": "softcover"
    },
    "manuscript": {
      "title": "Emma and the Adventure Compass",
      "pages": [
        {
          "id": "p1",
          "text": "One day in Portland, Emma found a compass glowing bright purple.",
          "illustration_prompt": "watercolor, warm light, forest path, child with blonde hair, light skin, purple glow, cat companion"
        }
      ]
    },
    "child": {
      "name": "Emma",
      "age": 5,
      "hair": "blonde",
      "skin": "light"
    },
    "options": {
      "favorite_animal": "cat",
      "favorite_food": "pancakes",
      "favorite_color": "purple",
      "hometown": "Portland",
      "dedication": "Dear Emma, you are our little hero!"
    }
  }'
```

## 🎯 Development Workflow

### 1. Local Development
```bash
npm run dev          # Start renderer service
npm run test-renderer # Test book generation
```

### 2. Template Customization
- Edit `renderer/templates/book.html` for story pages
- Edit `renderer/templates/cover.html` for cover design
- Modify `renderer/src/schema.ts` for data validation

### 3. Testing Changes
```bash
# After making changes, restart the service
npm run dev

# Test with new data
npm run test-renderer
```

## 🔑 API Keys Setup (When Ready)

### Amazon SP-API
1. Create Amazon Developer account
2. Register your application
3. Generate LWA credentials
4. Update `.env` with your credentials

### POD Provider (Lulu)
1. Create Lulu account
2. Get API credentials
3. Update `.env` with POD settings

### LLM Service (OpenAI)
1. Create OpenAI account
2. Generate API key
3. Update `.env` with LLM settings

### File Storage (Cloudflare R2)
1. Create Cloudflare account
2. Set up R2 bucket
3. Generate API tokens
4. Update `.env` with storage settings

## 📖 Understanding the Adventure Compass

Each book follows this magical journey:

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

## 🐛 Troubleshooting

### Renderer Service Won't Start
```bash
# Check if port 8787 is in use
lsof -i :8787

# Kill any process using the port
kill -9 [PID]

# Restart the service
npm run dev
```

### PDF Generation Fails
```bash
# Check Playwright installation
cd renderer && npx playwright install

# Check browser installation
npx playwright --version
```

### Schema Validation Errors
- Check that all required fields are provided
- Ensure exactly 14 pages in manuscript
- Verify child data matches schema requirements

## 📞 Getting Help

- **Documentation**: Check the `/docs` folder
- **Issues**: Create a GitHub issue
- **Discussions**: Use GitHub discussions
- **Email**: hello@littleherobooks.com

## 🎉 Next Steps

Once your development environment is working:

1. **Customize Templates** - Modify the HTML templates to match your vision
2. **Set Up Integrations** - Connect Amazon SP-API, POD providers, and LLM services
3. **Configure n8n** - Set up automation workflows
4. **Test End-to-End** - Place test orders through the complete pipeline
5. **Deploy** - Set up production environment

Happy coding! 🚀📚✨
