# Quick Fix: Worker Error 1101

## Problem
Deployment succeeds but site shows: **"Error 1101: Worker threw exception"**

## Root Cause
Missing environment variables in Cloudflare Pages runtime.

## Quick Fix (5 minutes)

### Step 1: Go to Cloudflare Dashboard
1. Navigate to **Workers & Pages** → **little-hero-labs-admin**
2. Click **Settings** tab
3. Scroll to **Environment Variables**

### Step 2: Add Required Variables

Click **Add variable** for each:

| Variable Name | Value | Where to Get It |
|--------------|-------|----------------|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | R2 dashboard (top right) |
| `R2_ACCESS_KEY_ID` | R2 API access key | R2 → Manage R2 API Tokens → Create Token |
| `R2_SECRET_ACCESS_KEY` | R2 API secret key | Same as above |
| `BACKEND_API_TOKEN` | Any secure random string | Generate: `openssl rand -hex 32` |

**Important**: Set these for **Production** environment (checkbox at bottom)

### Step 3: Save & Redeploy
1. Click **Save**
2. Wait 1-2 minutes for deployment
3. Test: `https://admin.littleherolabs.com/api/debug/env`

## Verify It Works

```bash
# Check environment variables
curl https://admin.littleherolabs.com/api/debug/env

# Test R2 connectivity
curl https://admin.littleherolabs.com/api/debug/r2-diagnostic
```

Expected response: `"overall": "healthy"` and all tests passing.

## Still Not Working?

1. **Check Workers Logs**:
   - Dashboard → Workers & Pages → Your Project → **Logs**
   - Look for actual error message

2. **Verify Variable Names**:
   - Must match exactly (case-sensitive)
   - No extra spaces
   - Set for **Production** environment

3. **Redeploy**:
   - Push a new commit, or
   - Dashboard → Retry deployment

## Full Documentation
See `docs/CLOUDFLARE_PAGES_ENV_SETUP.md` for detailed instructions.

