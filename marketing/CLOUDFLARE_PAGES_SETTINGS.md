# Cloudflare Pages Settings for Marketing Site

## Project: `little-hero-labs`

### Build Configuration (in Cloudflare Pages Dashboard)

1. **Framework preset**: `None` (or leave as default)
2. **Build command**: `npm ci && npm run build`
3. **Build output directory**: `out` ⚠️ **CRITICAL: Must be `out`, not `.next` or `dist`**
4. **Root directory (advanced)**: `marketing`
5. **Node version**: `20`

### Important Notes

- **Output directory MUST be `out`** - This is where Next.js static export generates files
- The GitHub Actions workflow also deploys this, so you may want to:
  - **Disable "Automatic deployments from Git"** in Cloudflare Pages settings
  - OR ensure both use the same output directory (`out`)

### Current Status

- ✅ GitHub Actions workflow deploys to `out` directory
- ⚠️ If Cloudflare auto-deploy is enabled, it must also use `out` as output directory
- ⚠️ If auto-deploy uses wrong settings, it will overwrite the GitHub Actions deployment

### Troubleshooting

If the site shows 404 or assets don't load:
1. Check that output directory is `out` (not `.next` or `dist`)
2. Check that root directory is `marketing`
3. Disable auto-deploy if using GitHub Actions
4. Verify the latest deployment in Cloudflare Pages dashboard

