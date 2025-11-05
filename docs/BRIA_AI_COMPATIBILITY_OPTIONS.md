# Bria AI Compatibility Analysis

## Bria AI Requirements

Bria AI accepts images in **two formats**:
1. **Publicly accessible URLs** (preferred for large images)
2. **Base64-encoded images** (alternative, less efficient)

## Current Workflow 2B Setup

- **"Build Bria Payload" node** currently sends **image URLs** to Bria API
- Bria API endpoint: `https://engine.prod.bria-api.com/v2/image/edit/remove_background`
- Bria downloads images from the provided URLs

---

## Option 1: Backend Proxy (Base64 Encoding)

### How It Works with Bria
1. **n8n workflow** calls backend API: `/api/bria/image-proxy?key={r2Key}&bucket={bucket}`
2. **Backend** fetches image from R2 using credentials
3. **Backend** converts image to Base64
4. **Backend** returns Base64 string to n8n
5. **n8n** sends Base64 to Bria API (instead of URL)

### Implementation Steps
1. Create new backend endpoint: `/api/bria/image-proxy`
   - Accepts: `key`, `bucket` query params
   - Fetches from R2 using `getObject()` (already implemented)
   - Converts to Base64: `Buffer.from(imageData).toString('base64')`
   - Returns: `{ base64: "..." }`
2. Update "Build Bria Payload" node in Workflow 2B:
   - Instead of: `originalImageUrl: signedUrl`
   - Use: `originalImage: base64String` (Bria accepts both formats)
   - Call backend proxy API before building payload

### Pros
- ✅ Works immediately (no presigned URL debugging)
- ✅ Uses existing R2 service (`getObject()`)
- ✅ Backend handles authentication
- ✅ Simple to implement

### Cons
- ❌ **Less efficient** (Base64 increases payload size by ~33%)
- ❌ Larger n8n payloads (images encoded in JSON)
- ❌ Higher bandwidth usage (n8n → backend → Bria)
- ⚠️ May hit size limits for very large images

### Complexity: **LOW** ⭐⭐
- ~1-2 hours to implement
- New endpoint + small workflow update

---

## Option 2: Debug Presigned URLs

### How It Works with Bria
1. Fix signature calculation in `getSignedUrlForObject()`
2. Generate valid presigned URLs
3. **n8n** sends presigned URLs to Bria API (as URLs, not Base64)
4. **Bria** downloads images directly from R2 using presigned URLs

### Implementation Steps
1. Debug AWS Signature V4 implementation
   - Compare with AWS SDK reference implementation
   - Test in Node.js environment first
   - Verify canonical request format
   - Fix signature calculation
2. Test presigned URLs work
3. No workflow changes needed (already calls signed URL API)

### Pros
- ✅ **Most efficient** (direct R2 → Bria, no base64 overhead)
- ✅ Standard practice (presigned URLs are industry standard)
- ✅ Smaller payloads (URLs are small)
- ✅ No bandwidth waste (Bria fetches directly)
- ✅ Works with any external service (not just Bria)

### Cons
- ❌ **Currently broken** (signature calculation issues)
- ❌ Requires debugging complex crypto code
- ❌ May need Cloudflare support guidance
- ❌ Time-consuming to debug

### Complexity: **HIGH** ⭐⭐⭐⭐⭐
- Unknown time (could be hours or days)
- Requires deep AWS Signature V4 knowledge
- May need external help

---

## Option 3: Cloudflare Workers

### How It Works with Bria
1. Create Cloudflare Worker that:
   - Uses R2 bindings to access R2 directly
   - Generates presigned URLs (if possible)
   - OR: Serves images as proxy endpoint
2. Deploy Worker
3. **n8n** calls Worker endpoint (presigned URL or proxy)
4. **Bria** receives publicly accessible URL

### Implementation Steps
1. **Option 3A: Worker with Presigned URLs**
   - Create Worker using R2 bindings
   - Generate presigned URLs (if R2 bindings support it)
   - Expose Worker endpoint
   - **Issue:** R2 bindings don't generate presigned URLs directly
   - **Still need:** Custom signing implementation

2. **Option 3B: Worker as Proxy**
   - Create Worker that serves images from R2
   - Public Worker endpoint: `https://r2-proxy.your-domain.workers.dev/{bucket}/{key}`
   - **n8n** sends Worker URL to Bria
   - **Bria** downloads from Worker
   - **Issue:** Worker must be publicly accessible (no auth)

### Pros
- ✅ Uses Cloudflare-native R2 bindings
- ✅ Fast (Cloudflare edge network)
- ✅ No authentication needed for Worker (if public)

### Cons
- ❌ **Requires migration** from Cloudflare Pages to Workers
- ❌ **Still may need presigned URLs** (if using 3A)
- ❌ **Security risk** (public proxy endpoint = no auth)
- ❌ Complex deployment (different from Pages)
- ❌ May not solve the presigned URL problem

### Complexity: **VERY HIGH** ⭐⭐⭐⭐⭐
- Requires architectural changes
- Migration from Pages to Workers
- May still need presigned URL debugging
- Security concerns for public proxy

---

## Recommendation

### Short-term (Now): **Option 1 - Base64 Encoding**
- ✅ Works immediately
- ✅ Low complexity
- ✅ Solves the problem today
- ⚠️ Less efficient but acceptable for MVP

### Long-term (Future): **Option 2 - Fix Presigned URLs**
- ✅ Best solution for production
- ✅ Most efficient
- ✅ Industry standard
- ⚠️ Can be done in parallel without blocking

### Not Recommended: **Option 3 - Workers**
- ❌ Too complex for current needs
- ❌ Doesn't solve presigned URL problem
- ❌ Requires architectural changes

---

## Implementation Plan

### Phase 1: Base64 Proxy (Immediate)
1. Create `/api/bria/image-proxy` endpoint
2. Update "Build Bria Payload" node to use Base64
3. Test with Bria API
4. Deploy and verify

### Phase 2: Presigned URLs (Parallel)
1. Continue debugging signature calculation
2. Test with AWS SDK reference
3. Once working, switch from Base64 to presigned URLs
4. Keep Base64 as fallback

---

## Next Steps

1. **Decide:** Option 1 (Base64) for now?
2. **Implement:** Backend proxy endpoint
3. **Update:** Workflow 2B "Build Bria Payload" node
4. **Test:** Verify Bria API accepts Base64 images
5. **Deploy:** Ship the fix

