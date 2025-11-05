# SW0 Audit: Base Character Generation

**Workflow Name:** `SW0 - Base Character Generation`  
**File:** `docs/n8n-workflow-files/finals/SW0 - Base Character Generation.json`  
**Priority:** 🟢 **MEDIUM PRIORITY**  
**Date:** 2025-01-27

---

## Executive Summary

**Status:** ⚠️ **REQUIRES UPDATES**

**Key Findings:**
- **4 instances** of hardcoded R2 URL found
- Used for base character image URLs
- Used for skin tone and base path resolution
- Mostly internal use, but URLs may be passed to downstream workflows

**Risk Level:** **MEDIUM** - URLs created here may be used by downstream workflows.

---

## Hardcoded URLs Found

### Total Count: 4 instances

**Patterns Found:**
- `https://pub-92cec53654f84771956bc84dfea65baa.r2.dev` (hardcoded base URL)
- `publicR2Url` variable with hardcoded fallback
- `PUBLIC_BASE` variable with hardcoded fallback
- Used in base character URL construction

---

## Nodes Requiring Updates

### 🟡 HIGH PRIORITY NODES

#### 1. **"SW0 In — Parse Envelope"** (First Code Node)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
const out = {
  ...env,
  ctx: env.ctx || {},
  characterSpecs: env.characterSpecs || env.ctx?.characterSpecs || {},
  publicR2Url: env.publicR2Url || 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev'
};
```

**Required Update:**
- Remove hardcoded fallback
- Pass through `publicR2Url` from upstream if available
- Use backend signed URL API if URLs are for external access

---

#### 2. **"SW0 Out — Pack Envelope"** (Second Code Node)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
const assetsRoot   = j.assetsRoot || 'book-mvp-simple-adventure/order-generated-assets';
const publicR2Url  = j.publicR2Url || 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';

// ...

const baseRefPublicUrl = baseCharacterKey ? `${publicR2Url}/${baseCharacterKey}` : null;
```

**Required Update:**
- Remove hardcoded `publicR2Url` fallback
- Use backend signed URL API if URLs are passed to external services
- OR use backend proxy endpoint

**Update Pattern:**
```javascript
// If baseRefPublicUrl is for external access, use signed URL
const backendUrl = 'https://admin.littleherolabs.com';
const backendToken = 'YOUR_BACKEND_API_TOKEN';

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

#### 3. **"Resolve Skin Tone & Base Path"** (Code Node)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
const PUBLIC_BASE = String(j.publicBase || 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev').replace(/\/+$/,'');
```

**Required Update:**
- Remove hardcoded `PUBLIC_BASE` fallback
- Use backend signed URL API if URLs are for external access
- OR use backend proxy endpoint

---

#### 4. **"Compute Upload Keys"** (Code Node)
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

- [ ] **Update "SW0 In — Parse Envelope" node**
  - Remove hardcoded `publicR2Url` fallback

- [ ] **Update "SW0 Out — Pack Envelope" node**
  - Remove hardcoded `publicR2Url` fallback
  - Use backend signed URL API if `baseRefPublicUrl` is for external access

- [ ] **Update "Resolve Skin Tone & Base Path" node**
  - Remove hardcoded `PUBLIC_BASE` fallback

- [ ] **Update "Compute Upload Keys" node**
  - Remove hardcoded `publicR2Url` fallback

---

## Testing Requirements

### Before Making R2 Private

1. **Test "SW0 Out — Pack Envelope" node:**
   - Verify base character URLs are generated correctly
   - Test with real character data

2. **Test workflow integration:**
   - Verify URLs passed to downstream workflows are accessible
   - Test SW0 → SW1 handoff

### After Making R2 Private

1. **Verify URLs work:**
   - Test base character URLs are accessible
   - Monitor for 24 hours

2. **Verify workflow integration:**
   - Test SW0 → SW1 handoff
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
   - URLs created in SW0 may be passed to SW1
   - Verify each URL's usage before updating
   - If URLs are only used internally, may not need signed URLs

2. **Internal vs External:**
   - Some URLs may only be used internally
   - Internal URLs don't need signed URLs
   - Verify each URL's usage before updating

---

## Priority Order for Updates

1. **"SW0 Out — Pack Envelope"** - HIGH (creates URLs used by SW1)
2. **"Resolve Skin Tone & Base Path"** - HIGH (sets default URLs)
3. **"Compute Upload Keys"** - HIGH (sets default URLs)
4. **"SW0 In — Parse Envelope"** - HIGH (sets default URLs)

---

**Status:** Ready for updates when backend token is provided.

