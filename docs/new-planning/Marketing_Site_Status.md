# Marketing Site Hosting — Status Bookmark

Last updated: now

## Current status
- Cloudflare Pages project exists and builds (Next.js preset).
- Redirect rules created:
  - http://littleherolabs.com/* → https://www.littleherolabs.com/$1 (301)
  - https://littleherolabs.com/* → https://www.littleherolabs.com/$1 (301)
- 404 on /test was expected; root content will render once domain is attached and build output/paths are correct.

## Remaining to go live
1) Pages → Custom domains: attach `www.littleherolabs.com` and set as Primary (status: Active).
2) Zone → SSL/TLS: ensure Full, Always Use HTTPS, and Automatic HTTPS Rewrites are On.
3) Pages → Settings → Build:
   - Root directory: set to marketing app folder (blank if repo root)
   - Build command: `npm ci && npm run build`
   - Output: `.next`
   - Node: 20
   - Retry deployment
4) Verify: https://www.littleherolabs.com/

## Notes
- Keep API cache bypass rule for `/api/*` if the marketing app ever proxies API routes.
- This project is separate from the admin backend which will live at `admin.littleherolabs.com`.
