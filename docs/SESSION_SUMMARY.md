# Little Hero Books - Session Summary

**Last Updated**: November 4, 2025  
**Current Branch**: `back-end-fixes`  
**Project**: Little Hero Books - Personalized Children's Book Service

---

## Project Overview

Little Hero Books generates personalized children's books through Amazon Custom listings and automated print-on-demand fulfillment. The system creates custom stories where "Every child is the hero of their own story" (target age: 3-7 years).

### Key Components

1. **Marketing Site** (`marketing/`) - Customer-facing Next.js site for e-commerce
2. **Admin Panel** (`back-end/`) - Internal control panel for order management and approval workflows
3. **Renderer** (`renderer/`) - PDF generation service (not actively worked on in this session)
4. **n8n Workflows** - Automation orchestration (external service)

### Deployment

- **Admin Panel**: `admin.littleherolabs.com` (Cloudflare Pages project: `bright-gift`)
- **Marketing Site**: `littleherolabs.com` (Cloudflare Pages project: `little-hero-labs`)
- **Repository**: `little-hero-books` monorepo

---

## Technical Architecture

### Stack
- **Frontend**: Next.js 15.5.6 with TypeScript, React 19, Tailwind CSS v4
- **Backend**: Next.js API routes (Edge Runtime compatible)
- **Storage**: Cloudflare R2 (S3-compatible)
- **Deployment**: Cloudflare Pages with OpenNext adapter
- **Authentication**: NextAuth (configured but not actively used)
- **Workflow Automation**: n8n (external service at `thepeakbeyond.app.n8n.cloud`)

### R2 Buckets
- **`little-hero-assets`** (public): Character images, generated assets
- **`little-hero-orders`** (private): Order manifests, workflow state

### Key Libraries
- `aws4fetch` - R2 client (Workers-compatible, replaced AWS SDK)
- `fast-xml-parser` - Parse S3 ListObjectsV2 XML responses
- `zod` - Schema validation
- `opennextjs-cloudflare` - Next.js to Cloudflare Pages adapter

---

## Current Status

### ✅ Recently Completed

1. **R2 Integration Migration**
   - Migrated from AWS SDK v3 to `aws4fetch` for Cloudflare Workers compatibility
   - Fixed `fs.readFile` errors by eliminating Node.js filesystem dependencies
   - Created `r2-client.ts` with `listObjects` and `getObject` helpers

2. **Order Management System**
   - Orders API (`/api/orders`) loads real data from R2 manifests
   - Order detail page (`/orders/[orderId]`) displays character assets and review stages
   - Image proxy endpoint (`/api/assets/[...path]`) serves images from private R2 buckets
   - Manifest proxy endpoint (`/api/manifests/[...path]`) serves manifests for n8n workflows

3. **Multi-Stage Approval Workflow**
   - Pre-Bria, Post-Bria, and Post-PDF review stages
   - Two-button workflow: "Approve Stage" → "Trigger Background-Removal"
   - Flag system for reviewing individual assets
   - Status badges show stage approval status

4. **2B Workflow Integration**
   - Created `/api/orders/[orderId]/trigger-background-removal` endpoint
   - Triggers n8n workflow at `https://thepeakbeyond.app.n8n.cloud/webhook/bg-removal`
   - Uses API proxy manifest URL instead of public R2 (fixes 404 errors)

5. **Monorepo Structure**
   - Separated `back-end/` (admin panel) and `marketing/` (customer site)
   - Each has its own Cloudflare Pages project with custom build scripts
   - Root `wrangler.toml` contains critical Node.js compatibility flags

### 🔧 Current Issues / Known Limitations

1. **Environment Variables**
   - Preview deployments need environment variables set separately
   - Use `wrangler pages secret bulk` or Cloudflare Dashboard
   - Required vars: `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BACKEND_API_TOKEN`

2. **Image Loading**
   - Images are served via `/api/assets/[...path]` proxy
   - Base character and poses are filtered from R2 asset list
   - Supports both original and background-removed images

3. **Order Status**
   - Orders default to `'pending'` review status (not auto-approved)
   - Status is determined from workflow stage in manifest
   - Review stages must be explicitly approved by users

---

## File Structure

```
little-hero-books/
├── back-end/                    # Admin panel (Next.js)
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── orders/              # Order management endpoints
│   │   │   │   ├── assets/               # Image proxy endpoint
│   │   │   │   ├── manifests/             # Manifest proxy endpoint
│   │   │   │   └── webhooks/             # n8n webhook receivers
│   │   │   ├── orders/                   # Order list and detail pages
│   │   │   └── debug/                    # Diagnostic endpoints
│   │   ├── lib/
│   │   │   ├── r2-client.ts              # R2 client (aws4fetch)
│   │   │   ├── r2-service.ts             # R2 helper functions
│   │   │   └── monitoring.ts             # Health checks
│   │   └── components/
│   │       ├── stages/                   # Review stage components
│   │       └── assets/                   # Asset display components
│   ├── open-next.config.ts               # OpenNext adapter config
│   ├── wrangler.toml                     # Cloudflare Pages config
│   └── scripts/postbuild.sh              # Build-time constant injection
├── marketing/                    # Customer-facing site (Next.js)
├── renderer/                     # PDF generation service
└── docs/                        # Documentation
```

---

## Key Endpoints

### Order Management
- `GET /api/orders` - List all orders (loads from R2 manifests)
- `GET /api/orders/[orderId]` - Get order details with assets
- `POST /api/orders/[orderId]/approve` - Approve a review stage
- `POST /api/orders/[orderId]/trigger-background-removal` - Trigger 2B workflow

### Asset Serving
- `GET /api/assets/[...path]` - Proxy images from R2 public bucket
- `GET /api/manifests/[...path]` - Proxy manifests from R2 orders bucket

### Webhooks (n8n → Backend)
- `POST /api/webhooks/workflow-2a-complete` - 2A workflow completion
- `POST /api/webhooks/workflow-2b-complete` - 2B workflow completion
- `POST /api/webhooks/workflow-3-complete` - 3 workflow completion

### Diagnostics
- `GET /api/debug/env` - Environment variable status
- `GET /api/debug/r2-diagnostic` - R2 connectivity test
- `GET /api/debug/orders-test` - Order detection diagnostics

---

## Workflow Integration

### 2B Workflow (Background Removal)
**Trigger**: User clicks "Trigger Background-Removal" button  
**Endpoint**: `POST /api/orders/[orderId]/trigger-background-removal`  
**n8n Webhook**: `https://thepeakbeyond.app.n8n.cloud/webhook/bg-removal`

**Payload sent to n8n**:
```json
{
  "manifestUrl": "https://admin.littleherolabs.com/api/manifests/book-mvp-simple-adventure/orders/TEST-ORDER-006/manifests/2a-manifest.json",
  "webhookUrl": "https://admin.littleherolabs.com/api/webhooks/workflow-2b-complete",
  "orderId": "TEST-ORDER-006",
  "characterHash": "a3fa3c94b55bb566",
  "trigger": "manual_background_removal"
}
```

**n8n Workflow**:
1. Download 2A Manifest (expects `manifestUrl` at `$json.body.manifestUrl || $json.manifestUrl`)
2. Parse Submissions - Extract approved poses from manifest
3. Check Bria Status - Poll for background removal completion
4. Build Bria Payload - Use `originalImageUrl` from manifest entries
5. Call Bria API for background removal

---

## Manifest Structure

Manifests are stored in R2 at:
```
little-hero-orders/book-mvp-simple-adventure/orders/{orderId}/manifests/{stage}-manifest.json
```

Example: `book-mvp-simple-adventure/orders/TEST-ORDER-006/manifests/2a-manifest.json`

**Manifest Schema**: `lhb.run-manifest@v2.0`

**Key Fields**:
- `order.orderId` - Order identifier
- `characterHash` - Unique character identifier
- `entries[]` - Array of pose entries with approval status
- `workflow.currentStage` - Current workflow stage (e.g., "2A-complete")
- `order.publicR2Url` - Public R2 URL for assets bucket

---

## Character Assets

Assets are stored in R2 at:
```
little-hero-assets/book-mvp-simple-adventure/order-generated-assets/characters/{characterHash}/
```

**Asset Types**:
- `original` - Original generated images
- `background-removed` - Images after Bria processing
- `final` - Final compiled images

**URL Generation**:
- Assets are served via `/api/assets/{key}` proxy endpoint
- This allows access to private bucket contents without public URLs

---

## Environment Variables

### Required (Cloudflare Pages)
- `CLOUDFLARE_ACCOUNT_ID` or `R2_ACCOUNT_ID` - Cloudflare account ID
- `R2_ACCESS_KEY_ID` - R2 access key
- `R2_SECRET_ACCESS_KEY` - R2 secret key
- `BACKEND_API_TOKEN` - Authentication token for webhooks

### Optional
- `R2_PUBLIC_BUCKET_NAME` - Default: `little-hero-assets`
- `R2_ORDERS_BUCKET_NAME` - Default: `little-hero-orders`
- `BACKEND_WEBHOOK_2B_COMPLETE_URL` - 2B completion webhook URL
- `N8N_2B_WEBHOOK_URL` - 2B trigger webhook URL (default: `https://thepeakbeyond.app.n8n.cloud/webhook/bg-removal`)
- `BACKEND_URL` or `NEXT_PUBLIC_BACKEND_URL` - Backend base URL for manifest URLs

---

## Build & Deployment

### Admin Panel Build
```bash
cd back-end
npm ci
npm run pages:build
```

**Build Script**: `.cloudflare/build.sh` (runs `npm ci` and `npm run pages:build`)  
**Output**: `.open-next/cloudflare/`  
**Project**: `bright-gift`

### Marketing Site Build
```bash
cd marketing
npm ci
npm run build
```

**Build Script**: `marketing/.cloudflare/build.sh`  
**Output**: `.next/`  
**Project**: `little-hero-labs`

### Build-Time Constants

The `postbuild.sh` script injects constants into OpenNext output:
- `__BUILD_TIMESTAMP_MS__` - Build timestamp
- `__DEPLOYMENT_ID__` - Empty string (module scope)
- `__SKEW_PROTECTION_ENABLED__` - false

---

## Review Workflow

### Pre-Bria Stage
1. User reviews base character and 12 poses
2. Can flag individual assets for review
3. Must approve stage before triggering background removal
4. Click "Approve Stage" → then "Trigger Background-Removal"

### Post-Bria Stage
- Review background-removed images
- Approve before proceeding to PDF compilation

### Post-PDF Stage
- Review final compiled PDF
- Final approval before production

---

## Recent Git History

**Branch**: `back-end-fixes`

**Latest Commits**:
- `d7ea820` - Fix: Use API proxy for manifest URL instead of public R2
- `7c8f82d` - Add 2B workflow trigger for background removal
- Previous: Approval workflow improvements, image loading fixes, R2 migration

---

## Next Steps / TODO

1. **Test 2B Workflow Integration**
   - Verify manifest URL is accessible to n8n
   - Confirm workflow completes successfully
   - Test webhook callback on completion

2. **Post-Bria Stage Implementation**
   - Similar to Pre-Bria but for background-removed images
   - Trigger PDF compilation workflow

3. **Error Handling**
   - Add user-friendly error messages
   - Toast notifications for workflow triggers
   - Retry logic for failed n8n webhook calls

4. **UI Improvements**
   - Replace `alert()` with proper toast notifications
   - Loading states for workflow triggers
   - Better visual feedback for stage approval

---

## Important Notes

1. **R2 Bucket Access**: The orders bucket is private - all access must go through authenticated API endpoints
2. **Manifest URLs**: Always use API proxy endpoints (`/api/manifests/...`) for n8n, not direct R2 URLs
3. **Environment Variables**: Preview deployments require separate variable configuration
4. **Review Status**: Orders default to `'pending'` - must be explicitly approved
5. **Asset Types**: System supports original, background-removed, and final asset types

---

## Troubleshooting

### Orders Not Appearing
- Check `/api/debug/r2-diagnostic` for R2 connectivity
- Verify environment variables are set in Cloudflare Pages
- Check manifest exists in R2 orders bucket

### Images Not Loading
- Verify `/api/assets/[...path]` endpoint is accessible
- Check R2 public bucket has correct assets
- Verify characterHash matches between order and assets

### Workflow Not Triggering
- Check n8n webhook URL is correct
- Verify manifest URL is accessible (test in browser)
- Check backend API logs for webhook call errors

---

## Contact / References

- **n8n Instance**: `thepeakbeyond.app.n8n.cloud`
- **Admin Panel**: `admin.littleherolabs.com`
- **Marketing Site**: `littleherolabs.com`
- **Repository**: `github.com/jtlapenna/little-hero-books`

---

**End of Summary**


