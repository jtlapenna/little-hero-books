# Set Preview Environment Variables via Cloudflare Dashboard

## The Problem
Wrangler CLI `pages secret put` and `pages secret bulk` only set secrets for **Production** environment. Preview deployments need secrets set separately.

## Solution: Use Cloudflare Dashboard

Unfortunately, Wrangler CLI doesn't support setting secrets for Preview environment. You need to use the Cloudflare Dashboard.

### Steps:

1. **Go to Cloudflare Dashboard**
   - Navigate to: https://dash.cloudflare.com
   - Go to **Workers & Pages** → **bright-gift** (or your project name)

2. **Open Environment Variables**
   - Click **Settings** tab
   - Scroll to **Environment Variables** section

3. **For Each Secret (Production has it, Preview doesn't):**
   - Find the secret in the list
   - Click the **edit/pencil icon** next to it
   - Look for environment checkboxes (Production, Preview, Branch Previews)
   - **Check the Preview checkbox** (if available)
   - Click **Save**

4. **If Secrets Don't Show Environment Options:**
   - You may need to **delete and re-add** the secret
   - When adding, make sure to check **both Production AND Preview** checkboxes

### Alternative: Use Cloudflare API

If the dashboard doesn't work, we can use the Cloudflare API. But the dashboard method is usually easier.

## Quick Reference

Secrets you need to set for Preview:
- ✅ CLOUDFLARE_ACCOUNT_ID
- ✅ R2_ACCESS_KEY_ID  
- ✅ R2_SECRET_ACCESS_KEY
- ✅ BACKEND_API_TOKEN
- (Optional) SUPABASE_SERVICE_ROLE_KEY

## Verify

After setting in dashboard:
1. Wait 1-2 minutes for deployment
2. Visit: `https://[preview-id].little-hero-labs-admin.pages.dev/api/debug/env`
3. Should show all variables as `present: true`

