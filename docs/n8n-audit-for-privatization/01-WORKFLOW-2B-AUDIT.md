# Workflow 2B Audit: Background Removal

**Workflow Name:** `LHB - 2.B. - Background Removal`  
**File:** `docs/n8n-workflow-files/finals/LHB - 2.B. - Background Removal.json`  
**Priority:** 🔴 **CRITICAL - HIGHEST PRIORITY**  
**Date:** 2025-01-27

---

## Executive Summary

**Status:** ⚠️ **REQUIRES UPDATES**

**Key Findings:**
- **39 instances** of hardcoded R2 URL found
- **CRITICAL:** Passes URLs to Bria AI API (external service)
- **MUST** use signed URLs for Bria API when R2 is private
- Multiple nodes construct R2 URLs

**Risk Level:** **HIGH** - This workflow will break when R2 buckets are made private if not updated.

---

## Hardcoded URLs Found

### Total Count: 39 instances

**Patterns Found:**
- `https://pub-92cec53654f84771956bc84dfea65baa.r2.dev` (hardcoded base URL)
- `PUBLIC_BASE` variable with hardcoded fallback
- `DEFAULT_R2` variable with hardcoded fallback
- Test data with hardcoded URLs (12 pose examples)

---

## Nodes Requiring Updates

### 🔴 CRITICAL NODES (Must Update)

#### 1. **"Build Bria Payload"** (Node ID: `1b43a8ba-5edf-439b-b8ff-1b72929354fb`)
**Priority:** 🔴 **CRITICAL - HIGHEST**

**Why Critical:**
- Passes image URLs directly to Bria AI API
- Bria API **MUST** receive signed URLs when R2 is private
- External service cannot access private R2 buckets

**Current Code Pattern:**
```javascript
let url = j.originalImageUrl || j.fileUrl || j.imageUrl || j.sourceUrl || null;

// If no direct URL, try constructing from publicR2Url + storageKey (fallback)
if (!url) {
  const pub = j.publicR2Url || j.orderData?.publicR2Url;
  const key = j.__meta?.storageKey || j.r2Path || j.__meta?.characterPath || null;
  if (pub && key) {
    url = `${String(pub).replace(/\/$/, '')}/${String(key).replace(/^\/+/, '')}`;
  }
}

const briaPayload = {
  image: url || b64,  // ❌ This URL will break when R2 is private
  // ...
};
```

**Required Update:**
- **MUST** call backend signed URL API before building Bria payload
- Generate signed URL for `originalImageUrl` if it's an R2 URL
- Use signed URL in `briaPayload.image`

**Update Pattern:**
```javascript
// Get signed URL for R2 images
const backendUrl = 'https://admin.littleherolabs.com';
const backendToken = 'YOUR_BACKEND_API_TOKEN';

let url = j.originalImageUrl || j.fileUrl || j.imageUrl || j.sourceUrl || null;

// If URL is an R2 URL, get signed URL
if (url && url.includes('pub-92cec53654f84771956bc84dfea65baa.r2.dev')) {
  // Extract storage key from URL
  const urlObj = new URL(url);
  const storageKey = urlObj.pathname.replace(/^\//, '');
  const bucket = 'little-hero-assets';
  
  // Get signed URL from backend
  const signedUrlResponse = await this.helpers.request({
    method: 'GET',
    url: `${backendUrl}/api/r2/signed-url`,
    qs: { key: storageKey, bucket: bucket, expiresIn: 3600 },
    headers: { 'Authorization': `Bearer ${backendToken}` },
    json: true
  });
  
  url = signedUrlResponse.url;
}

const briaPayload = {
  image: url || b64,
  // ...
};
```

---

#### 2. **"Prepare for R2 Upload"** (Node ID: `3533c41d-3c0d-42f3-b594-e59a84b51c51`)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
let PUBLIC_BASE = 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';
try {
  if (typeof $env !== 'undefined' && $env.R2_PUBLIC_URL) {
    PUBLIC_BASE = $env.R2_PUBLIC_URL;
  }
} catch (e) {
  // Env vars not accessible, use default
}

const publicUrl = `${PUBLIC_BASE}/${r2Path}`;
```

**Required Update:**
- Remove hardcoded `PUBLIC_BASE`
- Use backend signed URL API for URLs that will be accessed externally
- Note: Internal R2 uploads don't need signed URLs (S3 node handles that)

**Update Pattern:**
- If `publicUrl` is only for internal use, can be removed or set to null
- If `publicUrl` is passed to external services, must use signed URL API

---

#### 3. **"Store Submission Result"** (Node ID: `d86580c4-2888-4629-978e-9b3c04af63bb`)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
let DEFAULT_R2 = 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';
try {
  if (typeof $env !== 'undefined' && $env.R2_PUBLIC_URL) {
    DEFAULT_R2 = $env.R2_PUBLIC_URL;
  }
} catch (e) {
  // Env vars not accessible, use default
}

const publicR2Url = orderInfo.publicR2Url || firstInput.publicR2Url || DEFAULT_R2;
```

**Required Update:**
- Remove hardcoded `DEFAULT_R2`
- Use backend signed URL API if URLs are needed for external access
- Pass through `publicR2Url` from upstream if available

---

#### 4. **"Prep Backend Webhook"** (Node ID: `285d5372-2ed9-4ebf-b832-08e954f3da33`)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
let baseUrl = 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';
try {
  if (typeof $env !== 'undefined') {
    baseUrl = $env.R2_ORDERS_PUBLIC_URL || $env.R2_PUBLIC_URL || baseUrl;
  }
} catch (e) {
  // Env vars not accessible, use default
}

const manifestUrl = `${baseUrl}/${manifestKey}`;
```

**Required Update:**
- Remove hardcoded `baseUrl`
- Use backend proxy endpoint for manifest URLs (recommended)
- OR generate signed URL for manifest if needed

**Update Pattern:**
```javascript
// Option A: Use backend proxy (recommended)
const backendUrl = 'https://admin.littleherolabs.com';
const manifestUrl = `${backendUrl}/api/manifests/${manifestKey}`;

// Option B: Generate signed URL
// const signedUrlResponse = await this.helpers.request({
//   method: 'GET',
//   url: `${backendUrl}/api/r2/signed-url`,
//   qs: { key: manifestKey, bucket: 'little-hero-orders', expiresIn: 3600 },
//   headers: { 'Authorization': `Bearer ${backendToken}` },
//   json: true
// });
// const manifestUrl = signedUrlResponse.url;
```

---

### 🟢 LOW PRIORITY (Test Data)

#### 5. **Test Data in Pin Data** (Lines 761-928)
**Priority:** 🟢 **LOW**

**Status:** Test data only - not critical for production

**Instances Found:**
- 12 pose examples with hardcoded URLs in `pinData` section
- Example: `"characterPath": "https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/..."`

**Required Update:**
- Optional: Update test data with signed URLs or backend proxy URLs
- Or: Remove test data if not needed
- **Note:** Test data doesn't affect production workflows

---

## Update Checklist

### Phase 1: Critical Updates (Must Do First)

- [ ] **Update "Build Bria Payload" node**
  - Add signed URL API call before building Bria payload
  - Test with public R2 first
  - Verify Bria API can download images

- [ ] **Update "Prep Backend Webhook" node**
  - Use backend proxy endpoint for manifest URLs
  - Test manifest URL generation

### Phase 2: High Priority Updates

- [ ] **Update "Prepare for R2 Upload" node**
  - Remove hardcoded `PUBLIC_BASE`
  - Determine if `publicUrl` is needed for external access
  - Update if needed

- [ ] **Update "Store Submission Result" node**
  - Remove hardcoded `DEFAULT_R2`
  - Use backend signed URL API if URLs are for external access

### Phase 3: Optional Updates

- [ ] **Update test data** (if needed)
  - Replace hardcoded URLs in `pinData` section
  - Or remove test data

---

## Testing Requirements

### Before Making R2 Private

1. **Test "Build Bria Payload" node:**
   - Verify signed URLs are generated correctly
   - Verify Bria API can download images from signed URLs
   - Test with multiple poses

2. **Test "Prep Backend Webhook" node:**
   - Verify manifest URLs are generated correctly
   - Verify backend can access manifest URLs

3. **Test full workflow:**
   - Run workflow with test order
   - Verify all poses are processed
   - Verify Bria API receives valid signed URLs
   - Verify workflow completes successfully

### After Making R2 Private

1. **Verify signed URLs work:**
   - Test signed URLs are accessible
   - Test Bria API can still download images
   - Monitor for 24 hours

2. **Verify workflow still functions:**
   - Run workflow with real order
   - Verify all nodes complete successfully
   - Verify no errors in logs

---

## Dependencies

**Backend API Required:**
- `/api/r2/signed-url` endpoint (✅ Already implemented)
- Backend proxy endpoint for manifests (verify if exists)

**Credentials Needed:**
- `BACKEND_API_TOKEN` (from `.env`)
- Backend URL: `https://admin.littleherolabs.com`

---

## Notes

1. **Bria API Requirement:**
   - Bria API **MUST** receive signed URLs when R2 is private
   - This is the most critical update
   - Failure to update will break workflow when R2 is private

2. **Test Data:**
   - Test data in `pinData` section doesn't affect production
   - Can be updated later or removed

3. **Internal URLs:**
   - Some URLs may only be used internally (not passed to external services)
   - Internal URLs don't need signed URLs (S3 node handles uploads)
   - Verify each URL's usage before updating

---

## Priority Order for Updates

1. **"Build Bria Payload"** - CRITICAL (must do first)
2. **"Prep Backend Webhook"** - HIGH (manifest URLs)
3. **"Prepare for R2 Upload"** - HIGH (if URLs are external)
4. **"Store Submission Result"** - HIGH (if URLs are external)
5. **Test data** - LOW (optional)

---

**Status:** Ready for updates when backend token is provided.

