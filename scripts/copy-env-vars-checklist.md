# Environment Variables to Copy to Preview

Check off each variable as you enable it for Preview:

## Required Variables (Critical)
- [ ] `CLOUDFLARE_ACCOUNT_ID` (or `R2_ACCOUNT_ID`)
- [ ] `R2_ACCESS_KEY_ID`
- [ ] `R2_SECRET_ACCESS_KEY`
- [ ] `BACKEND_API_TOKEN`

## Optional Variables (Have Defaults)
- [ ] `R2_PUBLIC_BUCKET_NAME` (default: `little-hero-assets`)
- [ ] `R2_ORDERS_BUCKET_NAME` (default: `little-hero-orders`)
- [ ] `R2_CHARACTERS_PREFIX` (default: `book-mvp-simple-adventure/order-generated-assets/characters/`)

## Optional Variables (Supabase - if using)
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`

## Steps:
1. Go to Cloudflare Dashboard → Workers & Pages → little-hero-labs-admin
2. Settings → Environment Variables
3. For each variable above:
   - Click edit (pencil icon)
   - Check "Preview" checkbox
   - Save
4. Test preview deployment: Visit your preview URL and check `/api/debug/env`

