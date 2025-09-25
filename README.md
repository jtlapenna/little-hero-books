
# Little Hero Books - Personalized Children's Books

**"Every child is the hero of their own story"**

This repository contains the MVP for Little Hero Books: an automated system where Amazon Custom listings trigger n8n workflows that generate personalized children's books and send them to print-on-demand providers for fulfillment.

## The Adventure Compass Story

Each book follows *The Adventure Compass* storyline - a magical journey where the child discovers a compass that guides them through enchanted locations (forest, mountain, sea, sky) before returning home. The story incorporates the child's name, appearance, favorite things, and hometown to create a truly personalized experience.

## Project Structure

- `docs/` — Complete strategy documentation and implementation notes
- `prompts/` — LLM prompts and content moderation guidelines  
- `renderer/` — Node.js/TypeScript service that generates print-ready PDFs
- `n8n/workflows/` — Automation workflows for order processing and fulfillment
- `amazon/` — SP-API middleware and integration examples
- `pod/` — Print-on-demand provider integration examples
- `assets/` — Image overlays and template assets

## Quick Start

1. **Setup Environment**: Copy `.env.example` to `.env` and configure your API keys
2. **Start Renderer**: `cd renderer && npm install && npm run dev`
3. **Configure n8n**: Import workflow JSONs and set up credentials
4. **Test Pipeline**: Place a test order through Amazon Custom
5. **Verify Output**: Check PDF generation and POD submission

## MVP Specifications

- **Product**: 8×10 softcover, 16 pages (14 interior + covers)
- **Target Age**: 3-7 years old
- **Personalization**: Name, appearance, favorite things, hometown, dedication
- **Art Style**: Watercolor illustrations with character overlays
- **Shipping**: US-only initially
- **Price Point**: $19.99-$29.99 (introductory to standard pricing)
