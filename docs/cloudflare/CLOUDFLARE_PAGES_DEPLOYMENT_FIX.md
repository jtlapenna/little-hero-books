# Cloudflare Pages Deployment Fix

## Problem
Deployments are stuck in "Queued" status and never start.

## Root Cause
Cloudflare Pages is trying to auto-deploy but doesn't have the correct build configuration, or there's a conflict with GitHub Actions deployments.

## Solution Options

### Option 1: Use GitHub Actions Only (Recommended)
Disable auto-deploy in Cloudflare Pages and rely on GitHub Actions:

1. Go to Cloudflare Dashboard → Pages → `little-hero-labs-admin`
2. Go to **Settings** → **Builds & deployments**
3. **Disable** "Automatic deployments from Git"
4. Keep GitHub Actions workflow (`.github/workflows/deploy-cloudflare-pages.yml`) enabled

This way, deployments only happen via GitHub Actions, which has the correct build configuration.

### Option 2: Configure Cloudflare Pages Auto-Deploy
If you want to use Cloudflare Pages auto-deploy:

1. Go to Cloudflare Dashboard → Pages → `little-hero-labs-admin`
2. Go to **Settings** → **Builds & deployments**
3. Configure:
   - **Root directory**: `back-end`
   - **Build command**: `npm run pages:build`
   - **Build output directory**: `.open-next/cloudflare`
   - **Node version**: `20`

4. **Important**: Disable the GitHub Actions workflow to avoid conflicts:
   - Go to `.github/workflows/deploy-cloudflare-pages.yml`
   - Comment out or delete the workflow file

### Option 3: Cancel Queued Deployments
If deployments are stuck:

1. Go to Cloudflare Dashboard → Pages → `little-hero-labs-admin`
2. Go to **Deployments** tab
3. Find queued deployments and click **Cancel** (three dots menu)
4. Manually trigger a new deployment via GitHub Actions or Cloudflare CLI

## Manual Deployment via CLI

If you need to deploy immediately:

```bash
cd back-end
npm run pages:build
npx wrangler pages deploy .open-next/cloudflare --project-name=little-hero-labs-admin
```

## Verification

After fixing, verify:
1. New deployments start within 1-2 minutes
2. Build logs show the OpenNext build process
3. Deployment completes successfully

