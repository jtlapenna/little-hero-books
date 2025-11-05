# Cloudflare Pages Build Configuration

## Project: `little-hero-labs-admin` (Admin Panel)

**Settings:**
- **Root directory**: `back-end` (or leave empty if using `cd back-end` in command)
- **Build command**: `npm ci && npm run pages:build`
  - OR: `cd back-end && npm ci && npm run pages:build` (if root directory is empty)
- **Build output directory**: `.open-next/cloudflare` (if root is `back-end`) OR `back-end/.open-next/cloudflare` (if root is empty)
- **Node version**: `20`
- **Framework preset**: None (custom build)

**Required Environment Variables:**
- `CLOUDFLARE_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BUCKET` (default: `little-hero-assets`)
- `R2_ORDERS_BUCKET` (default: `little-hero-orders`)
- `NEXT_PUBLIC_API_URL` (if needed)
- Any other backend secrets

---

## Project: `little-hero-labs` (Marketing Site)

**Settings:**
- **Root directory**: `marketing`
- **Build command**: `npm ci && npm run build`
- **Build output directory**: `.next`
- **Node version**: `20`
- **Framework preset**: Next.js (can be auto-detected)

**Required Environment Variables:**
- Typically none needed for a static marketing site
- Any API URLs or public env vars if the marketing site calls APIs

---

## Troubleshooting

### If builds are failing:

1. **Check build logs** in Cloudflare Pages dashboard for specific errors
2. **Verify environment variables** are set in both projects
3. **Check Node version** - should be 20 for both
4. **Verify root directory** matches the actual app location
5. **Check build output directory** exists after build completes

### Common Issues:

- **Build timeout**: Increase timeout in Cloudflare Pages settings
- **Missing dependencies**: Ensure `package-lock.json` is committed
- **Wrong output directory**: Verify the build actually creates the expected output
- **Environment variables**: Missing env vars can cause build failures

### Recommended Simplification:

For `little-hero-labs-admin`, consider:
- **Root directory**: `back-end`
- **Build command**: `npm ci && npm run pages:build`
- **Build output**: `.open-next/cloudflare`

This avoids the `cd back-end` in the command and is cleaner.

