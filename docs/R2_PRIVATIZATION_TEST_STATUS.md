# R2 Privatization Test Status

## Current Status

✅ **R2 Buckets:** Private (confirmed)
✅ **Public URL Access:** Blocked (returns 400/401 - expected)
✅ **Signed URL API:** Generates URLs successfully
❌ **Signed URL Access:** Returns 403 Forbidden (signature not accepted)

## URL Format

We've tried both formats:
1. **Subdomain format:** `https://{bucket}.{account_id}.r2.cloudflarestorage.com/{key}`
2. **Path format:** `https://{account_id}.r2.cloudflarestorage.com/{bucket}/{key}` ✅ (currently using)

Path format is correct based on:
- S3 API endpoint: `https://3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com`
- Account ID: `3daae940fcb6fc5b8bbd9bb8fcc62854`

## Generated URL Example

```
https://3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com/little-hero-assets/book-mvp-simple-adventure/order-generated-assets/characters/0ajc4j6vc7m8puagwyac/characters_0ajc4j6vc7m8puagwyac_pose02.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=320e3b8228c5ff7bd2395043886f03d3%2F20251105%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20251105T030704Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=544d8bf5ff8b5df7fc9c1fffb00136556758bbaa85151d4b018f974548631154
```

## Next Steps

### 1. Verify Credentials
Check which R2 API token credentials are in `.env`:
- `R2_ACCESS_KEY_ID` - Should match one of the API tokens from Cloudflare dashboard
- `R2_SECRET_ACCESS_KEY` - Should match the secret for that token
- `CLOUDFLARE_ACCOUNT_ID` - Should be `3daae940fcb6fc5b8bbd9bb8fcc62854`

### 2. Test with Known Working Library
Consider testing with AWS SDK's `getSignedUrl` in a Node.js environment to verify:
- If AWS SDK works, the issue is in our Web Crypto implementation
- If AWS SDK also fails, the issue is with credentials or R2 configuration

### 3. Check R2 API Token Permissions
From the dashboard, ensure the token has:
- **Permission:** "Object Read & Write" or "Admin Read & Write"
- **Applied to:** The specific buckets (`little-hero-assets`, `little-hero-orders`)

### 4. Alternative: Use Cloudflare R2 Bindings
If presigned URLs continue to fail, consider using Cloudflare Workers R2 bindings directly (requires Cloudflare Workers runtime, not available in Cloudflare Pages).

## Implementation Details

- Custom AWS Signature Version 4 using Web Crypto API
- Path-based URL format: `/{bucket}/{key}`
- HMAC key derivation: Raw bytes for intermediate keys
- Canonical URI encoding: Each path segment encoded separately

## References

- S3 API Endpoint: `https://3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com`
- Account ID: `3daae940fcb6fc5b8bbd9bb8fcc62854`
- Buckets: `little-hero-assets`, `little-hero-orders`

