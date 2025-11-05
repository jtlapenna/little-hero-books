# Fix: Preview Environment Variables Not Working

## The Problem
Environment variables are set for Production but not available in Preview deployments.

## The Solution: Use Wrangler CLI

**Important**: Secrets set via `wrangler pages secret put` are available to **ALL environments** (Production, Preview, and Branch Previews).

## Quick Fix (Recommended)

### Option 1: Re-set Secrets via Wrangler CLI (Easiest)

If you already have the secret values, you can re-set them using Wrangler. This will make them available to Preview:

```bash
# Set each secret (you'll be prompted for the value)
wrangler pages secret put CLOUDFLARE_ACCOUNT_ID --project-name=little-hero-labs-admin
wrangler pages secret put R2_ACCESS_KEY_ID --project-name=little-hero-labs-admin
wrangler pages secret put R2_SECRET_ACCESS_KEY --project-name=little-hero-labs-admin
wrangler pages secret put BACKEND_API_TOKEN --project-name=little-hero-labs-admin
```

**Note**: You'll need to enter the values again (they're not shown for security).

### Option 2: Use the Script

I've created a script that prompts for each value:

```bash
./scripts/set-preview-env-vars.sh
```

### Option 3: Check Dashboard UI (If Available)

1. Go to **Cloudflare Dashboard** → **Workers & Pages** → **little-hero-labs-admin**
2. Click **Settings** → **Environment Variables**
3. Check if there's a way to:
   - Edit each variable and select "All environments" or
   - See if variables can be scoped differently

## Why This Works

When you set secrets via Wrangler CLI (`wrangler pages secret put`), they are:
- ✅ Available to Production deployments
- ✅ Available to Preview deployments  
- ✅ Available to Branch preview deployments
- ✅ Available to all environments

This is different from setting them in the dashboard UI, which might allow per-environment scoping.

## Verify It Works

After setting secrets via Wrangler:

1. Visit your preview deployment URL
2. Check: `https://[preview-id].little-hero-labs-admin.pages.dev/api/debug/env`
3. You should see all variables as `present: true`

## About the CF_PAGES_BRANCH Suggestion

The suggestion about `CF_PAGES_BRANCH` is **NOT relevant** for this issue because:

- ❌ `CF_PAGES_BRANCH` is a **build-time** variable (used during `npm run build`)
- ✅ We need **runtime** secrets (available when the worker executes)
- ❌ Secrets like `R2_ACCESS_KEY_ID` cannot be set in `wrangler.toml` (they're secrets, not plain vars)
- ✅ Secrets must be set via `wrangler pages secret put` or dashboard

## Summary

**Best approach**: Use `wrangler pages secret put` to re-set your secrets. They'll automatically be available to all environments, including Preview.

