# Workflow 2A Audit: Orchestrator

**Workflow Name:** `2A - Orchestrator`  
**File:** `docs/n8n-workflow-files/finals/2A - Orchestrator.json`  
**Priority:** 🟡 **HIGH PRIORITY**  
**Date:** 2025-01-27

---

## Executive Summary

**Status:** ⚠️ **REQUIRES UPDATES**

**Key Findings:**
- **4 instances** of hardcoded R2 URL found
- Creates URLs that may be used by Workflow 2B
- Used in manifest creation and summary generation
- Mostly for internal use, but some URLs may be passed to external services

**Risk Level:** **MEDIUM** - URLs created here may be used by Workflow 2B (which needs signed URLs).

---

## Hardcoded URLs Found

### Total Count: 4 instances

**Patterns Found:**
- `https://pub-92cec53654f84771956bc84dfea65baa.r2.dev` (hardcoded base URL)
- `publicR2Url` variable with hardcoded fallback
- Used in manifest URL construction
- Used in pose result URL construction

---

## Nodes Requiring Updates

### 🟡 HIGH PRIORITY NODES

#### 1. **"Create Final Summary"** (Node ID: `835d04e0-d6b1-41a6-8fbe-15d5335625dd`)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
const publicR2Url = orderSnapshot.publicR2Url 
  || root.publicR2Url
  || 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';

// ...

const orderData = {
  // ...
  publicR2Url,
  r2BucketName: 'little-hero-assets',
  manifestKey,
  manifestUrl: joinUrl(publicR2Url, manifestKey),
};

// ...

const poseResults = entries.map((e, idx) => {
  // ...
  publicUrl: e.publicUrl || joinUrl(publicR2Url, storageKey),
  // ...
});
```

**Required Update:**
- Remove hardcoded fallback URL
- Use backend signed URL API if URLs are passed to external services
- OR use backend proxy endpoint for manifest URLs

**Update Pattern:**
```javascript
// Option A: Use backend proxy for manifest URLs (recommended)
const backendUrl = 'https://admin.littleherolabs.com';
const manifestUrl = `${backendUrl}/api/manifests/${manifestKey}`;

// Option B: Generate signed URLs for images that will be accessed externally
// For each pose result:
// const signedUrlResponse = await this.helpers.request({
//   method: 'GET',
//   url: `${backendUrl}/api/r2/signed-url`,
//   qs: { key: storageKey, bucket: 'little-hero-assets', expiresIn: 3600 },
//   headers: { 'Authorization': `Bearer ${backendToken}` },
//   json: true
// });
// const publicUrl = signedUrlResponse.url;
```

**Note:** 
- If URLs are only used internally (not passed to external services), may not need signed URLs
- If URLs are passed to Workflow 2B → Bria API, they MUST be signed URLs
- Verify usage before updating

---

#### 2. **"Set Orchestrator Defaults"** (Node ID: Not provided in search results)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
const publicR2Url = j.publicR2Url || 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';
```

**Required Update:**
- Remove hardcoded fallback
- Use backend signed URL API if URLs are for external access
- Pass through `publicR2Url` from upstream if available

---

#### 3. **"Capture Order Context"** (Node ID: Not provided in search results)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
publicR2Url: orderData.publicR2Url || 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev',
```

**Required Update:**
- Remove hardcoded fallback
- Store backend URL or proxy endpoint instead
- Use signed URL API when URLs are needed

---

#### 4. **Test/Simulation Data** (Line 422)
**Priority:** 🟢 **LOW**

**Current Code:**
```javascript
const SIM = {
  // ...
  publicR2Url: 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev',
  posesPublicBase: 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/little-hero-assets/book-mvp-simple-adventure/characters/poses/',
  // ...
};
```

**Required Update:**
- Optional: Update test data with signed URLs or backend proxy URLs
- Or: Remove test data if not needed
- **Note:** Test data doesn't affect production workflows

---

## Update Checklist

### Phase 1: High Priority Updates

- [ ] **Update "Create Final Summary" node**
  - Remove hardcoded `publicR2Url` fallback
  - Use backend proxy endpoint for manifest URLs (recommended)
  - Determine if pose URLs need signed URLs (if passed to 2B → Bria)

- [ ] **Update "Set Orchestrator Defaults" node**
  - Remove hardcoded `publicR2Url` fallback
  - Use backend signed URL API if URLs are for external access

- [ ] **Update "Capture Order Context" node**
  - Remove hardcoded `publicR2Url` fallback
  - Store backend URL or proxy endpoint instead

### Phase 2: Optional Updates

- [ ] **Update test data** (if needed)
  - Replace hardcoded URLs in simulation data
  - Or remove test data

---

## Testing Requirements

### Before Making R2 Private

1. **Test "Create Final Summary" node:**
   - Verify manifest URLs are generated correctly
   - Verify pose URLs are generated correctly (if needed)
   - Test with real order data

2. **Test workflow integration with 2B:**
   - Verify URLs passed to Workflow 2B are accessible
   - Verify Workflow 2B can use URLs (if they're R2 URLs, they need to be signed)

### After Making R2 Private

1. **Verify URLs work:**
   - Test manifest URLs are accessible
   - Test pose URLs are accessible (if used externally)
   - Monitor for 24 hours

2. **Verify workflow integration:**
   - Test Workflow 2A → 2B handoff
   - Verify 2B can access URLs from 2A

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

1. **URL Usage:**
   - URLs created in 2A may be passed to Workflow 2B
   - If 2B passes URLs to Bria API, they MUST be signed URLs
   - Verify each URL's usage before updating

2. **Manifest URLs:**
   - Manifest URLs are typically accessed by backend
   - Backend proxy endpoint is recommended (simpler than signed URLs)

3. **Internal vs External:**
   - Some URLs may only be used internally
   - Internal URLs don't need signed URLs
   - Verify each URL's usage before updating

---

## Priority Order for Updates

1. **"Create Final Summary"** - HIGH (creates URLs used by 2B)
2. **"Set Orchestrator Defaults"** - HIGH (sets default URLs)
3. **"Capture Order Context"** - HIGH (stores URLs in context)
4. **Test data** - LOW (optional)

---

**Status:** Ready for updates when backend token is provided.

