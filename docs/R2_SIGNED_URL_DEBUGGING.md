# R2 Signed URL Debugging

## ✅ SUCCESS - Presigned URLs Working!

**Status:** Fully functional and tested with Bria AI!

## Current Status

✅ **R2 Buckets:** Private (confirmed)
✅ **Credentials:** New Admin Read & Write token created and added to `.env`
✅ **URL Format:** Subdomain format (`https://{bucket}.{account_id}.r2.cloudflarestorage.com/{key}`)
✅ **Type Errors:** Fixed (ArrayBuffer compatibility)
✅ **Signed URLs:** **200 OK** - Working perfectly!
✅ **Bria AI Integration:** Tested and confirmed working!

## Solution Found

**Using `aws4fetch` library** per [Cloudflare R2 documentation](https://developers.cloudflare.com/r2/api/s3/presigned-urls/):

```typescript
import { AwsClient } from 'aws4fetch';

const client = new AwsClient({
  accessKeyId: ACCESS_KEY_ID,
  secretAccessKey: SECRET_ACCESS_KEY,
  service: 's3',
  region: 'auto',
});

const url = new URL(
  `https://${bucket}.${ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`
);

url.searchParams.set('X-Amz-Expires', expiresIn.toString());

const signedRequest = await client.sign(
  new Request(url.toString(), { method: 'GET' }),
  { aws: { signQuery: true } }
);

return signedRequest.url;
```

**Key Points:**
- Subdomain format (not path-based)
- `aws4fetch` library handles all signature complexity
- Service: `s3`, Region: `auto`
- `signQuery: true` for presigned URLs

## Test Results

### File Download Test
- **Key:** `book-mvp-simple-adventure/order-generated-assets/characters/19e2aeb3d23aabe7/base-character.png`
- **Bucket:** `little-hero-assets`
- **Result:** ✅ **200 OK**, 949,895 bytes, `image/png`
- **Note:** HEAD requests return 403, but GET requests work (Bria uses GET)

### Bria AI Integration Test
- **Test Date:** 2025-11-05
- **Presigned URL:** Generated successfully
- **Bria API Response:**
  ```json
  {
    "request_id": "52accacd75d34060b8ea4377bd2f46e8",
    "status_url": "https://engine.prod.bria-api.com/v2/status/52accacd75d34060b8ea4377bd2f46e8"
  }
  ```
- **Result:** ✅ Bria AI accepted the presigned URL and started processing

## Generated URL Example

```
https://little-hero-assets.3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com/book-mvp-simple-adventure/order-generated-assets/characters/19e2aeb3d23aabe7/base-character.png?X-Amz-Expires=3600&X-Amz-Date=20251105T034125Z&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=320e3b8228c5ff7bd2395043886f03d3%2F20251105%2Fauto%2Fs3%2Faws4_request&X-Amz-SignedHeaders=host&X-Amz-Signature=28323a16f325da807f7eeb63132c83a6b7ab790d3fa9f12c17cacaa53035f0f2
```

## Implementation Location

- **File:** `back-end/src/lib/r2-service.ts`
- **Function:** `getSignedUrlForObject()`
- **Endpoint:** `back-end/src/app/api/r2/signed-url/route.ts`

## References

- S3 API Endpoint: `https://3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com`
- Account ID: `3daae940fcb6fc5b8bbd9bb8fcc62854`
- Buckets: `little-hero-assets`, `little-hero-orders`

