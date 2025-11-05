# SW2 Audit: Pose and Style QA

**Workflow Name:** `SW2 - Pose and Style QA`  
**File:** `docs/n8n-workflow-files/finals/SW2 - Pose and Style QA.json`  
**Priority:** 🟢 **MEDIUM PRIORITY**  
**Date:** 2025-01-27

---

## Executive Summary

**Status:** ⚠️ **REQUIRES UPDATES**

**Key Findings:**
- **4 instances** of hardcoded R2 URL found
- Used for pose reference URLs
- Used for base character URLs
- Includes test data with hardcoded URLs
- Mostly internal use, but URLs may be passed to downstream workflows

**Risk Level:** **MEDIUM** - URLs created here may be used by downstream workflows.

---

## Hardcoded URLs Found

### Total Count: 4 instances

**Patterns Found:**
- `https://pub-92cec53654f84771956bc84dfea65baa.r2.dev` (hardcoded base URL)
- `publicR2Url` variable with hardcoded fallback
- Used in HTTP Request node parameters
- Test data with hardcoded URLs

---

## Nodes Requiring Updates

### 🟡 HIGH PRIORITY NODES

#### 1. **"Schema Check + Defaults"** (First Code Node)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
const publicR2Url = jIn.publicR2Url || 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';

// ...

const poseRefPublicUrl = jIn.poseRefPublicUrl
  || (poseRefKey ? `${publicR2Url}/${poseRefKey}` : null);

const baseRefPublicUrl = jIn.baseRefPublicUrl
  || (baseCharacterKey ? `${publicR2Url}/${baseCharacterKey}` : null);
```

**Required Update:**
- Remove hardcoded `publicR2Url` fallback
- Use backend signed URL API if URLs are for external access
- OR use backend proxy endpoint

**Update Pattern:**
```javascript
// If poseRefPublicUrl is for external access, use signed URL
const backendUrl = 'https://admin.littleherolabs.com';
const backendToken = 'YOUR_BACKEND_API_TOKEN';

let poseRefPublicUrl = null;
if (poseRefKey) {
  // Get signed URL for pose reference
  const signedUrlResponse = await this.helpers.request({
    method: 'GET',
    url: `${backendUrl}/api/r2/signed-url`,
    qs: { key: poseRefKey, bucket: 'little-hero-assets', expiresIn: 3600 },
    headers: { 'Authorization': `Bearer ${backendToken}` },
    json: true
  });
  poseRefPublicUrl = signedUrlResponse.url;
}

let baseRefPublicUrl = null;
if (baseCharacterKey) {
  // Get signed URL for base character
  const signedUrlResponse = await this.helpers.request({
    method: 'GET',
    url: `${backendUrl}/api/r2/signed-url`,
    qs: { key: baseCharacterKey, bucket: 'little-hero-assets', expiresIn: 3600 },
    headers: { 'Authorization': `Bearer ${backendToken}` },
    json: true
  });
  baseRefPublicUrl = signedUrlResponse.url;
}
```

---

#### 2. **HTTP Request Node** (for pose reference)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
"value": "={{ $json.publicR2Url ?? 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev' }}"
```

**Required Update:**
- Remove hardcoded fallback in HTTP Request node
- Use signed URL from Code node output instead
- OR generate signed URL in Code node before HTTP Request

---

### 🟢 LOW PRIORITY (Test Data)

#### 3. **Test Data in Pin Data** (Lines 867-872)
**Priority:** 🟢 **LOW**

**Status:** Test data only - not critical for production

**Instances Found:**
- Test data with hardcoded URLs in `pinData` section
- Example: `"publicR2Url": "https://pub-92cec53654f84771956bc84dfea65baa.r2.dev"`

**Required Update:**
- Optional: Update test data with signed URLs or backend proxy URLs
- Or: Remove test data if not needed
- **Note:** Test data doesn't affect production workflows

---

## Update Checklist

### Phase 1: High Priority Updates

- [ ] **Update "Schema Check + Defaults" node**
  - Remove hardcoded `publicR2Url` fallback
  - Use backend signed URL API for `poseRefPublicUrl` if for external access
  - Use backend signed URL API for `baseRefPublicUrl` if for external access

- [ ] **Update HTTP Request node**
  - Remove hardcoded fallback in URL parameter
  - Use signed URL from Code node output

### Phase 2: Optional Updates

- [ ] **Update test data** (if needed)
  - Replace hardcoded URLs in `pinData` section
  - Or remove test data

---

## Testing Requirements

### Before Making R2 Private

1. **Test "Schema Check + Defaults" node:**
   - Verify pose reference URLs are generated correctly
   - Verify base character URLs are generated correctly
   - Test with real pose data

2. **Test HTTP Request node:**
   - Verify pose reference images are loaded correctly
   - Test with multiple poses

3. **Test workflow integration:**
   - Verify URLs passed to downstream workflows are accessible
   - Test SW2 → SW3 handoff

### After Making R2 Private

1. **Verify URLs work:**
   - Test pose reference URLs are accessible
   - Test base character URLs are accessible
   - Monitor for 24 hours

2. **Verify workflow integration:**
   - Test SW2 → SW3 handoff
   - Verify downstream workflows can access URLs

---

## Dependencies

**Backend API Required:**
- `/api/r2/signed-url` endpoint (✅ Already implemented)

**Credentials Needed:**
- `BACKEND_API_TOKEN` (from `.env`)
- Backend URL: `https://admin.littleherolabs.com`

---

## Notes

1. **HTTP Request Nodes:**
   - HTTP Request nodes may load images from R2
   - If loading from R2, they need signed URLs
   - Verify HTTP Request node usage before updating

2. **URL Usage:**
   - URLs created in SW2 may be passed to SW3
   - Verify each URL's usage before updating
   - If URLs are only used internally, may not need signed URLs

3. **Test Data:**
   - Test data in `pinData` section doesn't affect production
   - Can be updated later or removed

---

## Priority Order for Updates

1. **"Schema Check + Defaults"** - HIGH (creates URLs used by HTTP Request)
2. **HTTP Request node** - HIGH (loads images from R2)
3. **Test data** - LOW (optional)

---

**Status:** Ready for updates when backend token is provided.

