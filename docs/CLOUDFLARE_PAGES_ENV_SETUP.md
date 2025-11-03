# Cloudflare Pages Environment Variables Setup

## Critical Issue: Worker Runtime Errors

The deployment succeeds, but the site shows **"Error 1101: Worker threw exception"** because required environment variables are not configured in Cloudflare Pages.

## Required Environment Variables

### 1. R2 Storage Configuration (Required)
These are **critical** - the application will fail without them:

```
CLOUDFLARE_ACCOUNT_ID=<your-cloudflare-account-id>
R2_ACCESS_KEY_ID=<your-r2-access-key-id>
R2_SECRET_ACCESS_KEY=<your-r2-secret-access-key>
```

**Optional R2 Bucket Names** (defaults provided):
```
R2_PUBLIC_BUCKET_NAME=little-hero-assets
R2_ORDERS_BUCKET_NAME=little-hero-orders
R2_CHARACTERS_PREFIX=book-mvp-simple-adventure/order-generated-assets/characters/
```

### 2. API Authentication (Required for webhooks)
```
BACKEND_API_TOKEN=<secure-random-token-for-webhook-authentication>
```

### 3. Supabase Configuration (Optional for MVP)
These are not strictly required for MVP but will be needed later:

```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
```

## How to Set Environment Variables in Cloudflare Pages

### Option 1: Via Cloudflare Dashboard (Recommended)

1. Go to **Cloudflare Dashboard** → **Workers & Pages**
2. Select your project: **`little-hero-labs-admin`** (or `bright-gift`)
3. Click on **Settings** tab
4. Scroll to **Environment Variables** section
5. Click **Add variable** for each required variable
6. Add variables for **Production** environment (and optionally Preview)
7. Click **Save**

### Option 2: Via Wrangler CLI

```bash
# Set R2 credentials
wrangler pages secret put CLOUDFLARE_ACCOUNT_ID --project-name=little-hero-labs-admin
wrangler pages secret put R2_ACCESS_KEY_ID --project-name=little-hero-labs-admin
wrangler pages secret put R2_SECRET_ACCESS_KEY --project-name=little-hero-labs-admin
wrangler pages secret put BACKEND_API_TOKEN --project-name=little-hero-labs-admin
```

## Getting Your R2 Credentials

1. Go to **Cloudflare Dashboard** → **R2**
2. Click **Manage R2 API Tokens**
3. Click **Create API Token**
4. Set permissions:
   - **Object Read & Write** for both buckets
   - **Admin Read** for account info
5. Copy:
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`
6. Your **Account ID** is shown in the R2 dashboard (top right) → `CLOUDFLARE_ACCOUNT_ID`

## Verifying Environment Variables

After setting environment variables, test with:

```bash
# Test R2 connectivity
curl https://admin.littleherolabs.com/api/debug/r2-diagnostic

# Test health endpoint
curl https://admin.littleherolabs.com/api/health
```

## Expected Behavior After Setup

✅ **Before**: "Error 1101: Worker threw exception"  
✅ **After**: Pages load successfully, API endpoints return data

## Troubleshooting

### Still seeing "Worker threw exception"?

1. **Check Workers Logs**:
   - Cloudflare Dashboard → Workers & Pages → Your Project → Logs
   - Look for the actual error message

2. **Verify Environment Variables**:
   - Settings → Environment Variables
   - Ensure variables are set for **Production** environment
   - Variable names must match exactly (case-sensitive)

3. **Test with Diagnostic Endpoint**:
   ```bash
   curl https://admin.littleherolabs.com/api/debug/r2-diagnostic
   ```
   This will show which env vars are missing.

4. **Redeploy**: After adding env vars, trigger a new deployment:
   - Push a new commit, or
   - Cloudflare Dashboard → Retry deployment

## Next Steps

1. ✅ Set all required environment variables in Cloudflare Pages
2. ✅ Verify with diagnostic endpoint
3. ✅ Check Workers Logs for any remaining errors
4. ✅ Test order listing: `/orders`
5. ✅ Test order detail: `/orders/[orderId]`

## Security Notes

- **Never commit** environment variables to git
- Use Cloudflare Pages **Environment Variables** (not build-time vars) for secrets
- Rotate `BACKEND_API_TOKEN` regularly
- Keep R2 credentials secure - they have full access to your buckets

