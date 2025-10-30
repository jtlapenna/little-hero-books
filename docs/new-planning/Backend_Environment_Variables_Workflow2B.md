# Backend Environment Variables — Workflow 2B Integration

Date: 2025-10-29
Purpose: Configure backend env for 2B (Bria) integration and coordinate with n8n

---

## 1) Generate Auth Token
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Use the same value for backend and n8n (BACKEND_API_TOKEN).

---

## 2) Backend .env additions
```bash
# === Workflow 2B ===
BACKEND_API_TOKEN=<secure-64-hex>
N8N_2B_WEBHOOK_URL=https://your-n8n-instance.com/webhook/bg-removal
BACKEND_URL=https://your-backend.vercel.app
# Optional explicit override (backend now supports this)
BACKEND_WEBHOOK_2B_COMPLETE_URL=https://your-backend.vercel.app/api/webhooks/workflow-2b-complete

# === R2 Storage ===
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ASSETS_BUCKET_NAME=little-hero-assets
R2_ORDERS_BUCKET_NAME=little-hero-orders
R2_PUBLIC_URL=https://pub-<id>.r2.dev

# === Supabase ===
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 3) Values to provide to n8n team
```bash
BACKEND_API_TOKEN=<same-as-backend>
BACKEND_WEBHOOK_2B_COMPLETE_URL=https://your-backend.vercel.app/api/webhooks/workflow-2b-complete
# Optional, recommended
R2_ORDERS_BUCKET_NAME=little-hero-orders
R2_PUBLIC_URL=https://pub-<id>.r2.dev
```

---

## 4) R2 Buckets — verify
- little-hero-assets: public/semi-public (images)
- little-hero-orders: private (manifests/metadata)

Wrangler quick check:
```bash
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... npx wrangler r2 bucket list
```

---

## 5) Verification checklist
- [ ] BACKEND_API_TOKEN generated and set
- [ ] N8N_2B_WEBHOOK_URL set
- [ ] BACKEND_URL or BACKEND_WEBHOOK_2B_COMPLETE_URL set
- [ ] R2 assets + orders buckets verified
- [ ] Supabase env set
- [ ] Values sent to n8n team

---

## 6) Notes
- Approve endpoint triggers 2B using N8N_2B_WEBHOOK_URL.
- Completion callback uses BACKEND_WEBHOOK_2B_COMPLETE_URL if present, else BACKEND_URL + path.


