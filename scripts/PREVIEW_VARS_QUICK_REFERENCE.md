# Quick Reference: Add These Variables to Preview Environment

## How to Add

1. Go to: **Cloudflare Dashboard** → **Workers & Pages** → **bright-gift** → **Settings** → **Environment Variables**
2. **Change dropdown to "Preview"**
3. Click **"Add variable"** for each one below
4. Copy the exact variable name and value

## Variables to Add (Copy-Paste Ready)

### 1. CLOUDFLARE_ACCOUNT_ID
```
Variable Name: CLOUDFLARE_ACCOUNT_ID
Value: 3daae940fcb6fc5b8bbd9bb8fcc62854
```

### 2. R2_ACCESS_KEY_ID
```
Variable Name: R2_ACCESS_KEY_ID
Value: 320e3b8228c5ff7bd2395043886f03d3
```

### 3. R2_SECRET_ACCESS_KEY
```
Variable Name: R2_SECRET_ACCESS_KEY
Value: a1ba025ddbe2d8ef7032d2d6635dce3b6fbc4bdbf9c19c68d0b0bd566c989572
```

### 4. BACKEND_API_TOKEN
```
Variable Name: BACKEND_API_TOKEN
Value: e41d510ce6ed6e9c7f602fea860f2591cc7ec75fe63e448336a97c4b73898646
```

## After Adding

1. Save each variable
2. Wait 1-2 minutes
3. Test: `https://[your-preview-id].little-hero-labs-admin.pages.dev/api/test`

## About the 404 on /api/debug/env

The route exists in code, but may not be deployed yet. Try:
- `/api/test` - Should work immediately
- `/api/health` - Should work immediately

If those work but `/api/debug/env` doesn't, the route may need to be rebuilt. The next deployment should include it.

