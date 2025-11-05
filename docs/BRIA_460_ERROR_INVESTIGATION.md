# Bria AI Error 460 Investigation

## Error
Bria AI returns error 460: "Failed to download image" when trying to download images from R2 signed URLs.

## Current Status

### ✅ Already Configured
- **CORS Policy:** Configured correctly for `https://engine.prod.bria-api.com` and `https://engine.dev.bria-api.com`
- **Signed URLs:** Generated successfully with proper AWS Signature V4 format
- **URL Format:** `https://{bucket}.{account_id}.r2.cloudflarestorage.com/{key}?X-Amz-...`

### ❌ Issue
- Bria AI cannot download images from signed URLs
- Error 460: "Failed to download image"
- CORS is configured but may not be the issue (Bria makes server-side requests)

## Investigation

### Important Note: CORS vs Server-Side Requests
Bria AI makes **server-side HTTP requests** (not browser requests), so CORS doesn't apply. CORS only affects browser-based cross-origin requests. However, Bria might still need:
- **Accessible URLs:** URLs must be reachable from Bria's servers
- **Valid SSL/TLS:** HTTPS certificates must be valid
- **No Authentication Headers:** Signed URLs should work without additional headers

### Possible Causes

1. **SSL/TLS Certificate Issues**
   - R2 storage domains might have certificate validation issues
   - Bria's servers might reject self-signed or invalid certificates
   - **Test:** Try accessing the signed URL from different networks

2. **URL Format Requirements**
   - Bria might require specific URL formats
   - Long query parameters might cause issues
   - Special characters in signed URLs might need encoding

3. **Network Restrictions**
   - Bria's servers might be blocked from accessing R2 storage domains
   - Firewall rules might prevent access
   - IP restrictions (if any)

4. **Signed URL Validity**
   - URLs might expire before Bria attempts download
   - Signature validation might fail on Bria's side
   - Clock skew between systems

5. **Bria API Requirements**
   - Bria might require specific headers in the image URL response
   - Content-Type headers might be required
   - Image must be accessible without authentication beyond the signed URL

## Next Steps

### 1. Test Signed URL Accessibility
```bash
# Test from different locations/networks
curl -I "https://little-hero-assets.{account_id}.r2.cloudflarestorage.com/{key}?X-Amz-..."
```

### 2. Check SSL/TLS Certificate
```bash
# Verify certificate is valid
openssl s_client -connect little-hero-assets.{account_id}.r2.cloudflarestorage.com:443
```

### 3. Contact Bria AI Support
- Ask about requirements for image URLs
- Verify if signed URLs are supported
- Check if there are domain/IP restrictions

### 4. Alternative: Use Base64 Encoding
If signed URLs don't work, consider the Base64 fallback option (see `BRIA_AI_COMPATIBILITY_OPTIONS.md`):
- Backend proxy endpoint converts images to Base64
- Bria accepts Base64-encoded images
- Less efficient but guaranteed to work

## Testing Command

```bash
# Generate signed URL
SIGNED_URL=$(curl -s "https://admin.littleherolabs.com/api/r2/signed-url?key=test-key&bucket=little-hero-assets&expiresIn=3600" \
  -H "Authorization: Bearer {token}" | jq -r '.url')

# Test accessibility
curl -I "$SIGNED_URL"

# Test with Origin header (simulating Bria)
curl -I -H "Origin: https://engine.prod.bria-api.com" "$SIGNED_URL"
```

## References
- Bria AI API: `https://engine.prod.bria-api.com/v2/image/edit/remove_background`
- Payload format: `{ image: "url", meta: {...} }`
- CORS configured but may not be relevant for server-side requests

