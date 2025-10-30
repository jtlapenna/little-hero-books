# Backend Hosting Plan — www.littleherolabs.com

Date: 2025-10-29
Owner: Backend Team

## Target Platform
- Primary: Vercel (Next.js 15 native hosting, serverless API routes)
- Alternative: Fly.io (only if we need long‑running processes)

## Architecture on Vercel
- Project root: `back-end/`
- Build: `npm run build` (Next.js)
- Region: close to R2 to reduce latency (e.g., `iad1`)
- Runtime: Node 18/20 (Vercel default for Next 15)

## Domains
- Add `www.littleherolabs.com` to the Vercel project
- Optional apex redirect: `littleherolabs.com` → `www.littleherolabs.com`

## Environment Variables (Vercel → Project Settings)
- Backend auth
  - `BACKEND_API_TOKEN`
- Cloudflare R2
  - `CLOUDFLARE_ACCOUNT_ID`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_ASSETS_BUCKET_NAME` (optional; default: little-hero-assets)
  - `R2_ORDERS_BUCKET_NAME` (optional; default: little-hero-orders)
- n8n
  - `N8N_2B_WEBHOOK_URL`
  - `BACKEND_URL` = `https://www.littleherolabs.com`
  - `BACKEND_WEBHOOK_2B_COMPLETE_URL` = `https://www.littleherolabs.com/api/webhooks/workflow-2b-complete`
- Supabase (when enabled)
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

## Networking & Security
- Require `Authorization: Bearer ${BACKEND_API_TOKEN}` on all `/api/webhooks/*`
- Optional HMAC header in a later phase
- Add simple rate limiting on `/api/webhooks/*` (Phase D in Next Steps)

## R2 Connectivity
- AWS SDK v3 with `forcePathStyle: true`
- Endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`

## Deployment Steps
1. Create Vercel project from repo, set Project Root to `back-end/`
2. Set env vars above for Preview and Production
3. Add domain `www.littleherolabs.com` to the Vercel project
4. Deploy (auto from main branch)
5. Post‑deploy checks:
   - `GET /api/health` → 200
   - `GET /api/debug/r2-get?orderId=...&stage=2a` → `{ ok: true }`
   - `POST /api/webhooks/workflow-2a-complete` (with Bearer token) → `{ success: true }`

## Rollback & Safety
- Use Vercel preview deployments; merge to main only after preview validation
- Rotate `BACKEND_API_TOKEN` every 90 days
