# Frequently Asked Questions - R2 Privatization

**Date:** 2025-01-27

---

## Q1: Do hardcoded R2 URLs still work once R2 storage is made private?

**Answer: NO - Hardcoded R2 URLs will NOT work once R2 is private.**

### Why Public URLs Stop Working

1. **Public URLs return 403 Forbidden:**
   - When R2 buckets are public, anyone with the URL can access the object
   - When R2 buckets are private, public URLs return `403 Forbidden` errors
   - This happens regardless of where the request comes from (n8n workflows, backend, etc.)

2. **Authentication doesn't help:**
   - Even if n8n workflows are behind authentication, the R2 URLs themselves are public endpoints
   - The R2 bucket's privacy settings determine access, not the authentication of the caller
   - Authenticated workflows can't access private R2 buckets via public URLs

3. **Solution: Use Signed URLs:**
   - Signed URLs temporarily make private R2 objects publicly accessible
   - They include authentication tokens and expiration times
   - After expiration, signed URLs become invalid
   - This is the standard way to provide temporary access to private storage

### Example

**Before (Public R2):**
```
https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/book-mvp-simple-adventure/...
```
✅ Works - anyone with the URL can access

**After (Private R2):**
```
https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/book-mvp-simple-adventure/...
```
❌ Returns 403 Forbidden - no longer accessible

**Solution (Signed URL):**
```
https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/book-mvp-simple-adventure/...?X-Amz-Algorithm=...&X-Amz-Credential=...&X-Amz-Expires=3600&...
```
✅ Works - includes authentication token, expires after 1 hour

---

## Q2: Do we need to change hardcoded R2 URLs in n8n workflows if they're behind authentication?

**Answer: YES - We MUST change them even if workflows are authenticated.**

### Why Authentication Doesn't Help

1. **R2 URLs are public endpoints:**
   - The URL itself is what matters, not who's calling it
   - R2 bucket privacy settings apply to all requests, regardless of source
   - Authenticated n8n workflows can't bypass R2 bucket privacy

2. **External services need access:**
   - Bria AI API needs to download images from R2
   - Bria API is an external service (not part of your infrastructure)
   - It can't access private R2 buckets without signed URLs
   - Even if n8n is authenticated, Bria API still needs publicly accessible URLs

3. **Workflow context doesn't matter:**
   - Whether workflows are public or private doesn't affect R2 URL access
   - R2 bucket privacy is independent of workflow authentication
   - We must update URLs to use signed URLs for external access

### When Updates Are Required

**Must Update:**
- ✅ URLs passed to external services (Bria API, PDF generation services, etc.)
- ✅ URLs accessed by external systems
- ✅ URLs that need to be publicly accessible temporarily

**May Not Need Updates:**
- ❓ URLs only used internally (verify usage first)
- ❓ URLs used by S3 nodes (S3 nodes handle authentication internally)
- ❓ Test data (low priority, optional)

---

## Q3: What does Bria API require for image URLs?

**Answer: According to [Bria API documentation](https://docs.bria.ai/), Bria accepts two image formats:**

### Image Format Options

1. **Image URLs:**
   - Must be "publicly accessible URL to the image"
   - When R2 is private, public URLs don't work
   - **Signed URLs make private R2 objects publicly accessible** (temporarily)
   - This is the recommended approach for large images

2. **Base64-encoded images:**
   - Convert image to Base64 string
   - Include raw Base64 (no `data:image/png;base64,` prefix)
   - Alternative if signed URLs aren't available
   - Less efficient for large images (increases payload size)

### Bria API Requirements

From [Bria API documentation](https://docs.bria.ai/):

> **Preparing Images for API Requests**
> 
> Bria's API supports images in two formats:
> 1. **Image URLs** – Provide a publicly accessible URL to the image.
> 2. **Base64-encoded images** – Convert an image to a Base64 string and send it in the request.

### Implications for R2 Privatization

**When R2 is Public:**
- ✅ Public URLs work: `https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/...`
- ✅ Bria API can download images directly

**When R2 is Private:**
- ❌ Public URLs return 403 Forbidden
- ✅ **Signed URLs work** (they make private objects publicly accessible temporarily)
- ✅ Base64 works (alternative, less efficient)

**Recommended Approach:**
- Use signed URLs for Bria API (more efficient, standard practice)
- Generate signed URLs in "Build Bria Payload" node before sending to Bria API
- Use 1-hour expiration (3600 seconds) - sufficient for Bria API processing

---

## Q4: Why is "Build Bria Payload" node the highest priority?

**Answer: It's the ONLY node that passes URLs to an external service (Bria API).**

### Why It's Critical

1. **External service dependency:**
   - Bria API is an external service (not part of your infrastructure)
   - It needs to download images from R2
   - When R2 is private, Bria API can't access public URLs
   - **Only signed URLs work** for external services with private R2

2. **Workflow will break:**
   - If "Build Bria Payload" sends public URLs, Bria API will get 403 errors
   - Bria API can't process the images
   - Workflow 2B will fail completely

3. **Other nodes may be internal:**
   - Other nodes may only use URLs internally
   - Internal URLs might not need signed URLs (verify usage first)
   - But external services ALWAYS need signed URLs when R2 is private

### Priority Order

1. **"Build Bria Payload"** - 🔴 CRITICAL (external service)
2. **Other nodes** - 🟡 HIGH (verify usage, may be internal)

---

## Summary

1. **Hardcoded R2 URLs stop working when R2 is private** - they return 403 Forbidden
2. **Authentication doesn't help** - R2 bucket privacy applies to all requests
3. **We MUST update URLs for external services** - especially Bria API
4. **Signed URLs are the solution** - they make private R2 objects publicly accessible temporarily
5. **"Build Bria Payload" is CRITICAL** - it's the only node passing URLs to external services

---

**References:**
- [Bria API Documentation](https://docs.bria.ai/) - Image format requirements
- [AWS S3 Presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html) - How signed URLs work
- Cloudflare R2 uses S3-compatible API, so signed URLs work the same way

