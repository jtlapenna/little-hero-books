# Workflow 3 Audit: Book Assembly

**Workflow Name:** `LHB - 3 -Book Assembly`  
**File:** `docs/n8n-workflow-files/finals/LHB - 3 -Book Assembly.json`  
**Priority:** 🟡 **MEDIUM PRIORITY**  
**Date:** 2025-01-27

---

## Executive Summary

**Status:** ⚠️ **REQUIRES UPDATES**

**Key Findings:**
- **19 instances** of hardcoded R2 URL found
- Loads background images and character images
- Constructs URLs for PDF generation
- Uses URLs for book assembly

**Risk Level:** **MEDIUM** - This workflow will break when R2 buckets are made private if not updated.

---

## Hardcoded URLs Found

### Total Count: 19 instances

**Patterns Found:**
- `https://pub-92cec53654f84771956bc84dfea65baa.r2.dev` (hardcoded base URL)
- `publicR2Url` variable with hardcoded fallback
- Used in background image loading
- Used in character image loading
- Used in PDF generation
- Test data with hardcoded URLs (12 pose examples)

---

## Nodes Requiring Updates

### 🟡 HIGH PRIORITY NODES

#### 1. **"Parse Webhook"** (First Code Node)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
const publicR2Url = payload.publicR2Url || 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';
```

**Required Update:**
- Remove hardcoded fallback
- Use backend signed URL API if URLs are for external access
- OR use backend proxy endpoint

---

#### 2. **"Load Background Images"** (Node Name from code)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
const publicR2Url = order.publicR2Url || 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';

// ...

const backgroundImages = sceneSlugs.map((slug, idx) => {
  const pageNumber = idx + 1;
  const imagePath = `${publicR2Url}/book-mvp-simple-adventure/backgrounds/page${String(pageNumber).padStart(2, '0')}-${slug}.png`;
  return { pageNumber, imagePath, slug };
});
```

**Required Update:**
- Remove hardcoded `publicR2Url` fallback
- Use backend signed URL API for each background image
- OR use backend proxy endpoint

**Update Pattern:**
```javascript
const backendUrl = 'https://admin.littleherolabs.com';
const backendToken = 'YOUR_BACKEND_API_TOKEN';

const backgroundImages = await Promise.all(sceneSlugs.map(async (slug, idx) => {
  const pageNumber = idx + 1;
  const storageKey = `book-mvp-simple-adventure/backgrounds/page${String(pageNumber).padStart(2, '0')}-${slug}.png`;
  
  // Get signed URL for background image
  const signedUrlResponse = await this.helpers.request({
    method: 'GET',
    url: `${backendUrl}/api/r2/signed-url`,
    qs: { key: storageKey, bucket: 'little-hero-assets', expiresIn: 3600 },
    headers: { 'Authorization': `Bearer ${backendToken}` },
    json: true
  });
  
  return {
    pageNumber,
    imagePath: signedUrlResponse.url,
    slug
  };
}));
```

---

#### 3. **"Load Story Text"** (Node Name from code)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
const publicR2Url = order.publicR2Url || 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';
```

**Required Update:**
- Remove hardcoded fallback
- Use backend signed URL API if character images are loaded
- OR use backend proxy endpoint

---

#### 4. **"Build Page Blocks"** (Node Name from code)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
const publicR2Url = order.publicR2Url || 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';
const TEXT_BG  = `${publicR2Url}/book-mvp-simple-adventure/overlays/text-boxes/standard-box.png`;
const FONT_URL = `${publicR2Url}/book-mvp-simple-adventure/fonts/custom-font.ttf`;
```

**Required Update:**
- Remove hardcoded `publicR2Url` fallback
- Use backend signed URL API for TEXT_BG and FONT_URL
- Generate signed URLs before building page blocks

**Update Pattern:**
```javascript
const backendUrl = 'https://admin.littleherolabs.com';
const backendToken = 'YOUR_BACKEND_API_TOKEN';

// Get signed URLs for text box and font
const textBgKey = 'book-mvp-simple-adventure/overlays/text-boxes/standard-box.png';
const fontKey = 'book-mvp-simple-adventure/fonts/custom-font.ttf';

const [textBgResponse, fontResponse] = await Promise.all([
  this.helpers.request({
    method: 'GET',
    url: `${backendUrl}/api/r2/signed-url`,
    qs: { key: textBgKey, bucket: 'little-hero-assets', expiresIn: 3600 },
    headers: { 'Authorization': `Bearer ${backendToken}` },
    json: true
  }),
  this.helpers.request({
    method: 'GET',
    url: `${backendUrl}/api/r2/signed-url`,
    qs: { key: fontKey, bucket: 'little-hero-assets', expiresIn: 3600 },
    headers: { 'Authorization': `Bearer ${backendToken}` },
    json: true
  })
]);

const TEXT_BG = textBgResponse.url;
const FONT_URL = fontResponse.url;
```

---

#### 5. **"Book Assembly Complete"** (Node Name from code)
**Priority:** 🟡 **HIGH**

**Current Code:**
```javascript
const publicR2Url = order.publicR2Url || 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';

const completed = {
  // ...
  finalBookUrl: `${publicR2Url}/little-hero-orders/${order.amazonOrderId}/${order.pdfFilename}`,
  // ...
};
```

**Required Update:**
- Remove hardcoded `publicR2Url` fallback
- Use backend signed URL API for final book URL
- OR use backend proxy endpoint

---

### 🟢 LOW PRIORITY (Test Data)

#### 6. **Test Data in Pin Data** (Lines 313-418)
**Priority:** 🟢 **LOW**

**Status:** Test data only - not critical for production

**Instances Found:**
- 12 pose examples with hardcoded URLs in `pinData` section
- Example: `"publicUrl": "https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/..."`

**Required Update:**
- Optional: Update test data with signed URLs or backend proxy URLs
- Or: Remove test data if not needed
- **Note:** Test data doesn't affect production workflows

---

## Update Checklist

### Phase 1: High Priority Updates

- [ ] **Update "Parse Webhook" node**
  - Remove hardcoded `publicR2Url` fallback

- [ ] **Update "Load Background Images" node**
  - Remove hardcoded `publicR2Url` fallback
  - Use backend signed URL API for each background image
  - Test with multiple backgrounds

- [ ] **Update "Load Story Text" node**
  - Remove hardcoded `publicR2Url` fallback
  - Use backend signed URL API if character images are loaded

- [ ] **Update "Build Page Blocks" node**
  - Remove hardcoded `publicR2Url` fallback
  - Use backend signed URL API for TEXT_BG and FONT_URL
  - Test page block generation

- [ ] **Update "Book Assembly Complete" node**
  - Remove hardcoded `publicR2Url` fallback
  - Use backend signed URL API for final book URL

### Phase 2: Optional Updates

- [ ] **Update test data** (if needed)
  - Replace hardcoded URLs in `pinData` section
  - Or remove test data

---

## Testing Requirements

### Before Making R2 Private

1. **Test "Load Background Images" node:**
   - Verify signed URLs are generated for all backgrounds
   - Verify backgrounds are accessible

2. **Test "Build Page Blocks" node:**
   - Verify signed URLs are generated for TEXT_BG and FONT_URL
   - Verify page blocks are generated correctly

3. **Test full workflow:**
   - Run workflow with test order
   - Verify all images are loaded
   - Verify PDF is generated
   - Verify workflow completes successfully

### After Making R2 Private

1. **Verify signed URLs work:**
   - Test background images are accessible
   - Test character images are accessible
   - Test TEXT_BG and FONT_URL are accessible
   - Monitor for 24 hours

2. **Verify workflow still functions:**
   - Run workflow with real order
   - Verify all nodes complete successfully
   - Verify PDF is generated correctly
   - Verify no errors in logs

---

## Dependencies

**Backend API Required:**
- `/api/r2/signed-url` endpoint (✅ Already implemented)

**Credentials Needed:**
- `BACKEND_API_TOKEN` (from `.env`)
- Backend URL: `https://admin.littleherolabs.com`

---

## Notes

1. **PDF Generation:**
   - PDF generation services may need access to images
   - Signed URLs must be valid for the duration of PDF generation
   - Consider using longer expiration times (e.g., 2-4 hours)

2. **Batch Operations:**
   - Multiple background images need signed URLs
   - Use `Promise.all()` for parallel signed URL generation
   - Consider rate limiting if needed

3. **Test Data:**
   - Test data in `pinData` section doesn't affect production
   - Can be updated later or removed

---

## Priority Order for Updates

1. **"Load Background Images"** - HIGH (needs signed URLs for all backgrounds)
2. **"Build Page Blocks"** - HIGH (needs signed URLs for TEXT_BG and FONT_URL)
3. **"Load Story Text"** - HIGH (if character images are loaded)
4. **"Book Assembly Complete"** - HIGH (final book URL)
5. **"Parse Webhook"** - HIGH (sets default URL)
6. **Test data** - LOW (optional)

---

**Status:** Ready for updates when backend token is provided.

