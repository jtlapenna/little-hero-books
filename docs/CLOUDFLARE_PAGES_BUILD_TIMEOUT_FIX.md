# Cloudflare Pages Build Timeout Fix

## Issue
Build fails with "an internal error occurred" after ~3-4 minutes of execution.

## Possible Causes

1. **Node Version Mismatch** (Fixed)
   - Cloudflare Pages using Node 22.16.0
   - Package.json required `>=20 <21`
   - ✅ Fixed: Updated to `>=20`

2. **Build Timeout**
   - Cloudflare Pages has a default build timeout (usually 15-20 minutes)
   - If build takes longer, it will fail with "internal error"
   - The `pages:build` command can take 5-10 minutes for large Next.js apps

3. **Resource Limits**
   - Memory limits during build
   - CPU limits during OpenNext bundling

## Solutions

### Option 1: Verify Build Configuration in Cloudflare Dashboard

1. Go to **Cloudflare Pages** → **little-hero-labs-admin** → **Settings**
2. Check **Build configuration**:
   - **Root directory**: `back-end` (or leave empty if root)
   - **Build command**: `npm ci && npm run pages:build`
   - **Build output directory**: `.open-next/cloudflare`
   - **Node version**: Set to `20` explicitly (if available)

### Option 2: Optimize Build Time

If build is timing out, consider:

1. **Use build cache** (if available):
   - Enable build caching in Cloudflare Pages settings
   - Cache `node_modules` between builds

2. **Split build process**:
   - Run `npm ci` separately
   - Run `npm run pages:build` separately
   - This helps identify which step is failing

3. **Reduce build output**:
   - Check if OpenNext is bundling unnecessary files
   - Consider excluding test files from build

### Option 3: Use GitHub Actions for Builds

Instead of Cloudflare Pages auto-deploy, use GitHub Actions:

- Already configured in `.github/workflows/deploy-cloudflare-pages.yml`
- Builds in GitHub Actions (more resources)
- Deploys directly via Wrangler
- Bypasses Cloudflare Pages build limitations

### Option 4: Contact Cloudflare Support

If builds consistently fail with "internal error":

1. Check build logs for specific error messages
2. Note the exact time build fails
3. Check if it's consistently at the same step
4. Contact Cloudflare Support with:
   - Project name: `little-hero-labs-admin`
   - Error: "an internal error occurred"
   - Build logs showing the failure point
   - Build time before failure

## Current Status

- ✅ Node version requirement updated
- ⏳ Need to verify if build completes successfully
- ⏳ Check if timeout is the issue or another error

