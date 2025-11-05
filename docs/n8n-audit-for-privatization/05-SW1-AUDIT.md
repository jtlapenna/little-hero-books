# SW1 Audit: Pose Generation

**Workflow Name:** `SW1 - Pose Generation`  
**File:** `docs/n8n-workflow-files/finals/SW1 - Pose Generation.json`  
**Priority:** 🟢 **MEDIUM PRIORITY**  
**Date:** 2025-01-27

---

## Executive Summary

**Status:** ⚠️ **REQUIRES UPDATES**

**Key Findings:**
- **3 instances** of hardcoded R2 URL found
- Used for pose reference URLs
- Used for base character URLs
- Mostly internal use, but URLs may be passed to downstream workflows

**Risk Level:** **MEDIUM** - URLs created here may be used by downstream workflows.

---

## Hardcoded URLs Found

### Total Count: 3 instances

**Patterns Found:**
- `https://pub-92cec53654f84771956bc84dfea65baa.r2.dev` (hardcoded base URL)
- `publicR2Url` variable with hardcoded fallback
- `posesPublicBase` variable with hardcoded fallback
- Used in pose reference URL construction

---

## Nodes Requiring Updates

### 🟡 HIGH PRIORITY NODES

#### 1. **"Resolve Pose Ref (IMAGE P)"** (Code Node)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
const posesBase = String(
  j.posesPublicBase ||
  'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/little-hero-assets/book-mvp-simple-adventure/characters/poses/'
).replace(/\/?$/, '/');
```

**Required Update:**
- Remove hardcoded `posesPublicBase` fallback
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
```

---

#### 2. **"Compute BaseCharacterKey"** (Code Node)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
const basePublicUrl =
  (j.publicR2Url || 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev') + '/' + baseCharacterKey;

const sampleBasePublicUrl =
  'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/book-mvp-simple-adventure/order-generated-assets/characters/0ccbbb2ece0d4a46/base-character.png';
```

**Required Update:**
- Remove hardcoded `publicR2Url` fallback
- Remove hardcoded `sampleBasePublicUrl` (test data)
- Use backend signed URL API if URLs are for external access

---

#### 3. **"Pin Keys (base & pose & hair)"** (Code Node)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
const publicR2Url = j.publicR2Url || 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';
```

**Required Update:**
- Remove hardcoded `publicR2Url` fallback
- Use backend signed URL API if URLs are for external access
- OR use backend proxy endpoint

---

## Update Checklist

### Phase 1: High Priority Updates

- [ ] **Update "Resolve Pose Ref (IMAGE P)" node**
  - Remove hardcoded `posesPublicBase` fallback
  - Use backend signed URL API if pose URLs are for external access

- [ ] **Update "Compute BaseCharacterKey" node**
  - Remove hardcoded `publicR2Url` fallback
  - Remove hardcoded `sampleBasePublicUrl` (test data)
  - Use backend signed URL API if base URLs are for external access

- [ ] **Update "Pin Keys (base & pose & hair)" node**
  - Remove hardcoded `publicR2Url` fallback
  - Use backend signed URL API if URLs are for external access

---

## Testing Requirements

### Before Making R2 Private

1. **Test "Resolve Pose Ref (IMAGE P)" node:**
   - Verify pose reference URLs are generated correctly
   - Test with multiple poses

2. **Test "Compute BaseCharacterKey" node:**
   - Verify base character URLs are generated correctly
   - Test with real character data

3. **Test workflow integration:**
   - Verify URLs passed to downstream workflows are accessible
   - Test SW1 → SW2 handoff

### After Making R2 Private

1. **Verify URLs work:**
   - Test pose reference URLs are accessible
   - Test base character URLs are accessible
   - Monitor for 24 hours

2. **Verify workflow integration:**
   - Test SW1 → SW2 handoff
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

1. **URL Usage:**
   - URLs created in SW1 may be passed to SW2
   - Verify each URL's usage before updating
   - If URLs are only used internally, may not need signed URLs

2. **Pose References:**
   - Pose reference images may be loaded by HTTP Request nodes
   - If loaded externally, they need signed URLs
   - Verify pose reference usage before updating

3. **Test Data:**
   - `sampleBasePublicUrl` is test data
   - Can be removed or updated

---

## Priority Order for Updates

1. **"Resolve Pose Ref (IMAGE P)"** - HIGH (creates pose URLs)
2. **"Compute BaseCharacterKey"** - HIGH (creates base URLs)
3. **"Pin Keys (base & pose & hair)"** - HIGH (sets default URLs)

---

**Status:** Ready for updates when backend token is provided.

