# Temporarily Disable Marketing Site Builds

## Quick Method: Cloudflare Dashboard

### Option 1: Change Production Branch (Recommended)
1. Go to **Cloudflare Dashboard** → **Pages** → **little-hero-labs**
2. Click **Settings** → **Builds & deployments**
3. Under **Production branch**, change from `main` to a branch that won't receive commits (e.g., `no-builds-temp`)
4. Click **Save**

**To re-enable:**
- Change back to `main` branch

### Option 2: Disconnect GitHub Integration
1. Go to **Cloudflare Dashboard** → **Pages** → **little-hero-labs**
2. Click **Settings** → **Builds & deployments**
3. Scroll to **GitHub integration** section
4. Click **Disconnect** or **Manage connection**
5. Disconnect the repository

**To re-enable:**
- Reconnect the GitHub repository in the same settings page

## Alternative: Use Path-Based Build Triggers (if supported)

If Cloudflare Pages supports path-based build triggers, you can configure it to only build when `marketing/**` changes, not when `back-end/**` changes. However, this feature may not be available in all Cloudflare Pages plans.

## Impact

- ✅ Stops automatic builds for `little-hero-labs` project
- ✅ Other projects (`little-hero-labs-admin`) continue to build normally
- ✅ No code changes required
- ✅ Easy to re-enable when needed

## Manual Deployment

If you need to deploy the marketing site manually while auto-deploy is disabled:

```bash
cd marketing
npm ci
npm run build
npx wrangler pages deploy .next --project-name=little-hero-labs
```

