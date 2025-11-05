# Presigned URL Debugging Plan

## Current Status

✅ **URL Format:** Correct (path-based: `https://{account_id}.r2.cloudflarestorage.com/{bucket}/{key}`)
✅ **Credentials:** New Admin Read & Write token
✅ **Endpoint:** Correct (`https://3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com`)
❌ **Signature:** Still returning 403 Forbidden

## What We've Tried

1. ✅ Path-based URL format (correct)
2. ✅ Custom AWS Signature V4 with Web Crypto API
3. ✅ Correct HMAC key derivation (raw bytes)
4. ✅ URI encoding for path segments
5. ✅ Date format fixes (amzDate format)
6. ✅ Credential format (not double-encoded)

## Potential Issues to Investigate

### 1. Canonical Request Format
The canonical request might need exact formatting:
```
GET
/{bucket}/{key}
X-Amz-Algorithm=...&X-Amz-Credential=...&...
host:{host}\n
host
UNSIGNED-PAYLOAD
```

**Check:** Verify newline format, trailing newlines, exact spacing

### 2. Query String Encoding
The canonical query string encoding might differ:
- Each param should be URL-encoded
- But the credential itself contains a `/` which becomes `%2F`
- Verify this matches what R2 expects

### 3. Region/Service Name
Currently using:
- Region: `auto`
- Service: `s3`

**Check:** Verify R2 expects these exact values

### 4. Credential Scope Format
Currently: `{dateStamp}/auto/s3/aws4_request`
**Check:** Verify this format is correct for R2

### 5. Compare with AWS SDK
Create a Node.js test script using AWS SDK v3 to generate a presigned URL and compare:
- Canonical request format
- Signature calculation
- URL structure

## Next Steps

### Option A: Test with AWS SDK (Reference)
Create a Node.js script that:
1. Uses AWS SDK v3 to generate presigned URL
2. Logs the canonical request
3. Compares with our implementation
4. Identifies differences

### Option B: Contact Cloudflare Support
Provide:
- Generated presigned URL
- Error details (403 Forbidden)
- Request signature details
- Ask for signature validation guidance

### Option C: Use Working Library
Test with `@paschendale/r2-presigned-url` library (we tried this but it uses path format differently)
- Compare the canonical request it generates
- See if we can adapt our implementation

## Testing Approach

1. **Enable Debug Logging:**
   - Log canonical request
   - Log string to sign
   - Log signature
   - Compare with AWS SDK output

2. **Test with Simple Key:**
   - Use simple key: `test/file.png`
   - Verify canonical URI encoding
   - Check signature calculation

3. **Verify Credentials:**
   - Confirm credentials are loaded correctly
   - Verify token permissions
   - Test with different token

## References

- [Cloudflare R2 Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [AWS Signature Version 4](https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html)
- Account ID: `3daae940fcb6fc5b8bbd9bb8fcc62854`
- Endpoint: `https://3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com`

