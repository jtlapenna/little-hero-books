# Cloudflare Pages Deployment Setup

## Required Dashboard Settings

To deploy this frontend to Cloudflare Pages, update the following settings in your Cloudflare Pages dashboard:

### Build Settings

1. **Root directory**: `frontend`
2. **Build command**: `npm run build`
3. **Build output directory**: `dist`
4. **Node version**: `18` or higher

### Environment Variables

No environment variables required for basic deployment.

### Installation

The build process will automatically run `npm install` in the `frontend` directory before building.

## Alternative: Manual Configuration

If you cannot update the dashboard settings, you can:

1. Change the root directory in Cloudflare Pages dashboard from `marketing` to `frontend`
2. Or create a symbolic link (not recommended for production)

## Notes

- Astro builds to the `dist` directory by default
- Hybrid rendering: site is static by default, with server-rendered dynamic routes where `export const prerender = false;` is set (Astro 5 hybrid)
- Customer preview page `src/pages/approve/[token].astro` is server-rendered to validate tokens at runtime
- On Cloudflare Pages, ensure Functions are enabled (automatic) so SSR routes run at the edge; no extra env vars needed for frontend
- Backend API remains on `admin.littleherolabs.com` (Next.js); confirm CORS allows the customer site origin

