# Copy Environment Variables from Production to Preview

## The Setup
In Cloudflare Dashboard, there's a **dropdown menu** to select between Production and Preview environments. Variables are set separately for each.

## Steps to Copy Variables to Preview

1. **Go to Cloudflare Dashboard**
   - Navigate to: https://dash.cloudflare.com
   - **Workers & Pages** → **bright-gift**
   - **Settings** tab → **Environment Variables** section

2. **Check Production Variables (Reference)**
   - Make sure the dropdown shows **"Production"**
   - Note which variables are set (you can see their names, but not values)

3. **Switch to Preview**
   - Change the dropdown to **"Preview"**
   - You'll see it's empty (no variables set)

4. **Add Each Variable for Preview**
   - Click **"Add variable"** button
   - For each variable, you'll need to enter:
     - **Variable name** (exact match)
     - **Value** (from your `.env` file)

## Variables to Add (from your .env file)

Based on your `.env` file, add these to Preview:

### Required:
1. **CLOUDFLARE_ACCOUNT_ID**
   - Value: `3daae940fcb6fc5b8bbd9bb8fcc62854` (from `CLOUDEFLARE_ACCOUNT_ID` in your .env)

2. **R2_ACCESS_KEY_ID**
   - Value: `320e3b8228c5ff7bd2395043886f03d3` (from `CLOUDFLARE_R2_ACCESS_KEY` in your .env)

3. **R2_SECRET_ACCESS_KEY**
   - Value: `a1ba025ddbe2d8ef7032d2d6635dce3b6fbc4bdbf9c19c68d0b0bd566c989572` (from `CLOUDFLARE_R2_SECRET_ACCESS_KEY` in your .env)

4. **BACKEND_API_TOKEN**
   - Value: `e41d510ce6ed6e9c7f602fea860f2591cc7ec75fe63e448336a97c4b73898646` (from your .env)

### Optional (if you use them):
- **SUPABASE_SERVICE_ROLE_KEY** (if set in Production)

## Quick Copy Method

Since you can't see the values in Production (they're encrypted), you have two options:

### Option A: Use Values from .env File
Just use the values listed above from your `.env` file.

### Option B: Get Values from Production (if you have access)
If you have access to the Production environment variables somewhere (like a secure password manager), you can copy those exact values.

## After Adding Variables

1. Save each variable
2. Wait 1-2 minutes for the deployment to update
3. Test: Visit your preview deployment and check `/api/debug/env` (or `/api/test` if that route works)

## Note About the 404 Error

The `/api/debug/env` route might return 404 if:
- The latest code hasn't been deployed to preview yet
- The route file isn't being included in the build

Try these first to verify the deployment:
- `/api/test` - Should return `{"status":"ok","message":"Test endpoint is working!"}`
- `/api/health` - Should return health check status

If those work, the `/api/debug/env` route should work too after the next deployment.

