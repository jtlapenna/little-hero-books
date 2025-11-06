# Cloudflare Images Preview Implementation Plan

## Overview
Use Cloudflare Images for optimized preview images (admins/customers) while keeping R2 for full-quality production images.

## Architecture
- **R2**: Full-quality PNG images (2550×2550px) for print/production
- **Cloudflare Images**: Optimized preview images (auto WebP, resizable) for web viewing

## Workflow 3 Changes

### New Nodes to Add (after "Upload Page Preview Image to R2")

1. **"Upload Preview Image to Cloudflare Images"** (HTTP Request node)
   - **Method**: POST
   - **URL**: `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/images/v1`
   - **Headers**:
     - `Authorization: Bearer {CLOUDFLARE_IMAGES_API_TOKEN}`
     - `Content-Type: multipart/form-data`
   - **Body**: 
     - `file`: Binary data from PDFMonkey response
     - `metadata`: JSON string with `orderId`, `pageNumber`
   - **Response**: Extract `result.id` (Cloudflare Images ID)

2. **"Store Cloudflare Images ID"** (Code node)
   - Store the Cloudflare Images ID alongside R2 key in the page data
   - Output: `{ pageNumber, r2Key, cloudflareImageId, cloudflareImageUrl }`

3. **"Build 3 Manifest"** (update existing)
   - Include both `r2Key` (for production) and `cloudflareImageId` (for previews)
   - Structure:
     ```json
     {
       "pageNumber": 1,
       "r2Key": "book-mvp-simple-adventure/orders/ORDER-001/preview-images/page-01_preview.png",
       "cloudflareImageId": "abc123def456",
       "previewImageUrl": "https://imagedelivery.net/{ACCOUNT_HASH}/{cloudflareImageId}/preview"
     }
     ```

## Configuration Required

### n8n Environment Variables
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID
- `CLOUDFLARE_IMAGES_API_TOKEN`: API token with Images:Edit permission
- `CLOUDFLARE_IMAGES_ACCOUNT_HASH`: Account hash for image URLs (from Cloudflare dashboard)

### How to Get Cloudflare Images Credentials
1. Go to Cloudflare Dashboard → Images
2. Create API token: **My Profile** → **API Tokens** → **Create Token**
   - Permissions: `Account.Cloudflare Images:Edit`
   - Account Resources: Your account
3. Copy Account ID from dashboard URL or API response
4. Account Hash is in the Images dashboard URL or API response

## Frontend Changes

### Update `post-pdf-stage.tsx`
- **Priority 1**: Use `cloudflareImageId` from 3-manifest if available
- **Fallback**: Use R2 proxy URL (`/api/assets/${r2Key}`)
- **URL Format**: `https://imagedelivery.net/{ACCOUNT_HASH}/{cloudflareImageId}/preview?width=1024`
  - `width=1024` for admin preview (smaller, faster)
  - `width=2550` for full quality if needed
  - Auto WebP/AVIF based on browser

### Example Code
```typescript
// In post-pdf-stage.tsx, when constructing imageUrl:
let imageUrl: string;
if (img.cloudflareImageId) {
  // Use Cloudflare Images with optimized size
  imageUrl = `https://imagedelivery.net/${CLOUDFLARE_IMAGES_ACCOUNT_HASH}/${img.cloudflareImageId}/preview?width=1024`;
} else if (img.r2Key) {
  // Fallback to R2 proxy
  imageUrl = `/api/assets/${img.r2Key}`;
}
```

## Benefits
- **Automatic WebP/AVIF**: Cloudflare serves optimal format
- **Dynamic Resizing**: Change `?width=` parameter for different sizes
- **Global CDN**: Fast delivery worldwide
- **Free Tier**: 5k transformations/month, 100k stored, 100k delivered
- **No Workflow Changes for PDF**: R2 remains source of truth for production

## Implementation Order
1. Set up Cloudflare Images account and get credentials
2. Add environment variables to n8n
3. Add "Upload Preview Image to Cloudflare Images" node in Workflow 3
4. Update "Build 3 Manifest" to include Cloudflare Images IDs
5. Update frontend to prefer Cloudflare Images URLs
6. Test with one order, verify both R2 and Cloudflare Images work
7. Deploy

## Notes
- Keep existing R2 upload (don't remove it)
- Cloudflare Images is for previews only
- R2 remains authoritative for production/print
- If Cloudflare Images upload fails, fallback to R2 proxy URL

## Decision Point: Customer Previews
**If you decide NOT to serve previews to customers**, you can skip Cloudflare Images entirely:
- Admins can use R2 proxy URLs directly (already working)
- R2 images load fine for admin review purposes
- Cloudflare Images is only beneficial if you need optimized delivery for many customer views
- **Recommendation**: Only implement Cloudflare Images if customer previews are planned

