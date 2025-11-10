# Background Images Cloudflare Images Setup

This guide explains how to upload background images to Cloudflare Images for optimized WebP delivery in Tab 2 modals.

## Overview

Background images are currently served directly from R2 as large PNG files. By uploading them to Cloudflare Images, we get:
- ✅ Automatic WebP/AVIF conversion (smaller files, faster loading)
- ✅ Global CDN (faster worldwide)
- ✅ Optimized delivery for modal previews

## Prerequisites

1. Cloudflare Images credentials configured:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_IMAGES_API_TOKEN`
   - `CLOUDFLARE_IMAGES_ACCOUNT_HASH` (or `NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH`)

2. Background images must exist in R2 at:
   - `book-mvp-simple-adventure/backgrounds/page00-dedication.png`
   - `book-mvp-simple-adventure/backgrounds/page01-twilight-walk.png`
   - ... (through page14)

## Step 1: Upload Background Images to Cloudflare Images

Run the upload endpoint to upload all 15 background images:

```bash
curl -X POST https://your-domain.com/api/backgrounds/upload-to-cloudflare
```

Or use the browser/Postman to make a POST request to:
```
POST /api/backgrounds/upload-to-cloudflare
```

**Response:**
```json
{
  "success": true,
  "total": 15,
  "successful": 15,
  "failed": 0,
  "results": [
    {
      "pageNumber": 0,
      "filename": "page00-dedication.png",
      "slug": "dedication",
      "success": true,
      "cloudflareImageId": "abc123...",
      "cloudflareImageUrl": "https://imagedelivery.net/{hash}/abc123.../preview?width=1024"
    },
    ...
  ],
  "mapping": {
    "0": {
      "cloudflareImageId": "abc123...",
      "cloudflareImageUrl": "https://imagedelivery.net/{hash}/abc123.../preview?width=1024",
      "slug": "dedication"
    },
    ...
  }
}
```

## Step 2: Set Environment Variable

Copy the `mapping` object from the response and set it as an environment variable:

**In Cloudflare Pages Dashboard:**
1. Go to your Pages project settings
2. Navigate to **Environment Variables**
3. Add a new variable:
   - **Variable name:** `BACKGROUND_IMAGES_MAPPING`
   - **Value:** The JSON string of the mapping object (minified)
   - **Environment:** Production and Preview

**Example value:**
```json
{"0":{"cloudflareImageId":"abc123...","cloudflareImageUrl":"https://imagedelivery.net/{hash}/abc123.../preview?width=1024","slug":"dedication"},"1":{"cloudflareImageId":"def456...","cloudflareImageUrl":"https://imagedelivery.net/{hash}/def456.../preview?width=1024","slug":"twilight-walk"},...}
```

**Important:** The value must be a valid JSON string (minified, no newlines).

## Step 3: Verify Mapping

After setting the environment variable and redeploying, verify the mapping is loaded:

```bash
curl https://your-domain.com/api/backgrounds/get-mapping
```

**Response:**
```json
{
  "success": true,
  "mapping": {
    "0": { ... },
    "1": { ... },
    ...
  },
  "count": 15
}
```

## Step 4: Test in Tab 2

1. Open an order in the admin dashboard
2. Navigate to Tab 2 (Post-Bria Stage)
3. Open a pose modal
4. The background image should now load from Cloudflare Images (WebP format)
5. Check the network tab to confirm the image URL is `imagedelivery.net`

## Fallback Behavior

If Cloudflare Images is not configured or a mapping is missing:
- The system automatically falls back to R2 URLs
- No errors will occur, but images will be larger (PNG format)

## Troubleshooting

### Images not loading from Cloudflare Images

1. **Check environment variable:**
   - Verify `BACKGROUND_IMAGES_MAPPING` is set correctly
   - Ensure it's a valid JSON string
   - Check that it's enabled for the correct environment (Production/Preview)

2. **Check Cloudflare Images credentials:**
   - Verify `CLOUDFLARE_ACCOUNT_ID` is set
   - Verify `CLOUDFLARE_IMAGES_API_TOKEN` is set
   - Verify `CLOUDFLARE_IMAGES_ACCOUNT_HASH` is set

3. **Verify upload was successful:**
   - Check the upload endpoint response for any failures
   - Verify images exist in Cloudflare Images dashboard

4. **Check browser console:**
   - Look for any CORS or network errors
   - Verify image URLs are correct

### Re-uploading Images

If you need to re-upload images (e.g., after updating them):
1. Run the upload endpoint again
2. Update the `BACKGROUND_IMAGES_MAPPING` environment variable with the new mapping
3. Redeploy the application

## API Endpoints

- **POST `/api/backgrounds/upload-to-cloudflare`** - Upload all background images to Cloudflare Images
- **GET `/api/backgrounds/get-mapping`** - Get the current mapping configuration

