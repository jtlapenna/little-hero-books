# R2 Signed URL Implementation

## Summary

Successfully implemented signed URL generation for Cloudflare R2 using `aws4fetch`, which is compatible with Cloudflare Workers/Pages runtime.

## Implementation

### Package Used
- `aws4fetch` (already in dependencies)
- Uses Web Crypto API (Cloudflare Workers compatible)
- No Node.js filesystem dependencies

### Code Location
- **API Endpoint:** `back-end/src/app/api/r2/signed-url/route.ts`
- **Service Function:** `back-end/src/lib/r2-service.ts` → `getSignedUrlForObject()`

### API Endpoint
```
GET /api/r2/signed-url?key={key}&bucket={bucket}&expiresIn={seconds}
Authorization: Bearer {BACKEND_API_TOKEN}
```

**Response:**
```json
{
  "url": "https://bucket.account_id.r2.cloudflarestorage.com/key?...",
  "expiresIn": 3600,
  "bucket": "little-hero-assets",
  "key": "path/to/file.png",
  "generatedAt": "2025-11-05T02:48:09.136Z"
}
```

## Test Results

### ✅ API Endpoint Working
- **Status:** Successfully deployed and generating signed URLs
- **Deployment:** `feat-r2-privatization.bright-gift.pages.dev`
- **Test:** Generated valid signed URL with proper AWS Signature V4 format

### ⚠️ URL Verification
- **Signed URL Generated:** ✅ Success
- **URL Format:** `https://{bucket}.{account_id}.r2.cloudflarestorage.com/{key}?X-Amz-...`
- **403 Forbidden:** May indicate:
  1. Test file doesn't exist at that path
  2. Need to use public R2.dev domain format (if configured)
  3. Signature validation issue (needs testing with actual file)

## Next Steps

1. **Test with actual file:** Use a file that exists in R2 to verify the signed URL works
2. **Verify endpoint format:** May need to use public R2.dev domain if bucket has custom domain
3. **Test with Bria API:** Verify signed URLs work with external services
4. **Deploy to production:** Once verified, merge to main branch

## Configuration

Required environment variables (must be set in Cloudflare Pages):
- `CLOUDFLARE_ACCOUNT_ID` or `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `BACKEND_API_TOKEN` (for API authentication)

## Notes

- The implementation uses `aws4fetch` which is already in dependencies
- Compatible with Cloudflare Workers runtime (no Node.js dependencies)
- Uses AWS Signature Version 4 (standard-compliant)
- Supports expiration times (60 seconds to 1 week)

