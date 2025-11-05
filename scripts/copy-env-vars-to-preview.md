# Copy Environment Variables from Production to Preview

## Quick Method: Cloudflare Dashboard (Easiest)

1. Go to **Cloudflare Dashboard** → **Workers & Pages** → **little-hero-labs-admin**
2. Click **Settings** → **Environment Variables**
3. For each variable that's only set for Production:
   - Click the **pencil/edit icon** next to the variable
   - Check the **Preview** checkbox (in addition to Production)
   - Click **Save**
4. Repeat for all variables

**Tip**: You can do this quickly by opening each variable in a new tab and editing them in parallel.

## Automated Method: Using Cloudflare API

If you have many variables, you can use the Cloudflare API. First, you'll need an API token:

1. Go to **Cloudflare Dashboard** → **My Profile** → **API Tokens**
2. Click **Create Token**
3. Use **Edit Cloudflare Workers** template
4. Add permissions for **Account** → **Cloudflare Pages:Edit**

Then run this script:

```bash
# Set your Cloudflare credentials
export CLOUDFLARE_API_TOKEN="your-api-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export PROJECT_NAME="little-hero-labs-admin"

# The API doesn't have a direct "copy" endpoint, so you'd need to:
# 1. List all production variables
# 2. Set each one for preview as well
```

## Alternative: Bulk Edit via Dashboard

Unfortunately, Cloudflare Pages doesn't support bulk editing of environment variables. You'll need to edit each one individually, but it's quick:
- Click edit → Check Preview → Save
- Takes ~30 seconds per variable

## Recommended Variables to Copy

Make sure these are set for both Production and Preview:

- `CLOUDFLARE_ACCOUNT_ID` (or `R2_ACCOUNT_ID`)
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `BACKEND_API_TOKEN`
- `R2_PUBLIC_BUCKET_NAME` (optional)
- `R2_ORDERS_BUCKET_NAME` (optional)
- `R2_CHARACTERS_PREFIX` (optional)
- Any Supabase variables (if using)

