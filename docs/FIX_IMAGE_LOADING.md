# Fix: Image Loading for Order Review

## Problem
Images are not appearing on the order detail page (`/orders/[orderId]`), even though the images exist in R2 at:
```
little-hero-assets/book-mvp-simple-adventure/order-generated-assets/characters/a3fa3c94b55bb566/
```

## Root Cause
The API was not loading character assets from R2 and including them in the order response.

## Fixes Applied

### 1. Order Detail API (`/api/orders/[orderId]`)
- ✅ Now loads order data from manifest (same as orders list)
- ✅ Extracts `characterHash` from manifest
- ✅ Fetches character assets from R2 using `getCharacterAssets(characterHash)`
- ✅ Includes `r2Assets` in response with structure:
  ```typescript
  {
    baseCharacter: CharacterAsset | null,
    poses: CharacterAsset[],
    all: CharacterAsset[]
  }
  ```

### 2. R2 URL Generation (`getCharacterAssets`)
- ✅ Supports `R2_PUBLIC_URL` environment variable (preferred)
- ✅ Falls back to `https://pub-{ACCOUNT_ID}.r2.dev` format if `R2_PUBLIC_URL` not set
- ✅ Properly URL-encodes keys for special characters in filenames

## Required Environment Variable

You may need to set `R2_PUBLIC_URL` in your Cloudflare Pages environment variables:

1. Go to **Cloudflare Dashboard** → **Workers & Pages** → **bright-gift** → **Settings** → **Environment Variables**
2. Select **Production** or **Preview** from dropdown
3. Add variable:
   - **Name**: `R2_PUBLIC_URL`
   - **Value**: Your R2 public bucket URL (e.g., `https://pub-92cec53654f84771956bc84dfea65baa.r2.dev`)

### How to Find Your R2 Public URL

The public URL format depends on how your R2 bucket is configured:

1. **If using a custom domain**: Use your custom domain (e.g., `https://assets.littleherolabs.com`)
2. **If using R2 public access**: The URL format is `https://pub-{PUBLIC_BUCKET_ID}.r2.dev`
   - Check your R2 bucket settings in Cloudflare Dashboard
   - Or check your n8n workflow code (it might have the public URL hardcoded)

### From n8n Workflow
If you have access to your n8n workflow, check the "Set Meta Path" code node - it may contain:
```javascript
const PUBLIC_BASE = 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';
```

Use that value for `R2_PUBLIC_URL`.

## Testing

After setting `R2_PUBLIC_URL`:

1. Visit `/api/orders/TEST-ORDER-006`
2. Check the response - `r2Assets` should be populated
3. Visit `/orders/TEST-ORDER-006`
4. Images should appear in the Pre-Bria stage

## Debugging

If images still don't appear:

1. Check browser console for 404 errors on image URLs
2. Check `/api/debug/character?hash=a3fa3c94b55bb566` to see if assets are found
3. Verify the public URL format matches your R2 bucket configuration
4. Check that the bucket is configured for public access

## Next Steps

- [ ] Set `R2_PUBLIC_URL` environment variable in Cloudflare Pages
- [ ] Test image loading on order detail page
- [ ] Verify images load correctly for all stages (Pre-Bria, Post-Bria, Post-PDF)

