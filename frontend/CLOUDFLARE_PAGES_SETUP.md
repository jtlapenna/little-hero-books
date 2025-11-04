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
- The build output is static HTML/CSS/JS
- No server-side rendering is configured (static site mode)
