# Little Hero Labs Marketing Site

Customer-facing marketing site and future e-commerce platform for Little Hero Labs.

## Domain
- Production: `littleherolabs.com` (or `www.littleherolabs.com`)
- Cloudflare Pages: `little-hero-labs` project

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Deployment

This site is deployed to Cloudflare Pages via the `little-hero-labs` project.

**Build Configuration:**
- Root directory: `marketing`
- Build command: `npm ci && npm run build`
- Output directory: `.next`
- Framework preset: Next.js

## Structure

This is a Next.js 15 application with:
- TypeScript
- Tailwind CSS
- App Router

## Future Plans

This site will evolve into a full e-commerce platform where customers can:
- Browse personalized book options
- Customize their books
- Place orders directly
- Track their orders

