# Phase 3 Migration Plan: n8n Workflow Updates

**Date:** 2025-01-27  
**Status:** READY TO START  
**Branch:** `feat/r2-privatization`

---

## 📋 Pre-Migration Checklist

### ✅ What's Already Done

1. **✅ Phase 1: Assessment** - COMPLETE
   - Test files assessed (43 hardcoded URLs found, keeping for now)
   - Scripts assessed (2 files with hardcoded URLs, keeping)
   - No deletions needed

2. **✅ Phase 2: Backend API** - COMPLETE
   - `/api/r2/signed-url` endpoint created
   - `getSignedUrlForObject()` helper function added
   - Frontend APIs reviewed (no changes needed)

3. **✅ Credential Strategy** - DECIDED
   - Use hardcoded values (n8n doesn't support env vars)
   - Acceptable for private workflows
   - Documentation complete

---

## 🔍 Migration Steps Overview

### Step 1: Audit Workflows (REQUIRED - Not Done Yet)

**What:** Identify all workflows and nodes that need updates

**What to Find:**
- Workflows with hardcoded R2 URLs (`pub-92cec53654f84771956bc84dfea65baa.r2.dev`)
- Code nodes that construct R2 URLs
- Nodes that pass URLs to Bria API (these need signed URLs)
- Nodes that build manifest URLs

**Action Items:**
- [ ] List all workflows in `docs/n8n-workflow-files/finals/`
- [ ] Search each workflow for hardcoded R2 URLs
- [ ] Document which nodes need updates
- [ ] Create update checklist per workflow

**Estimated Time:** 30-60 minutes

---

### Step 2: Get Backend Token (REQUIRED)

**What:** You need to provide the `BACKEND_API_TOKEN` from your `.env` file

**Why:** 
- We'll use this as a hardcoded value in workflows
- Same token as in your backend `.env`
- Used for authentication when calling `/api/r2/signed-url`

**Action:**
- [ ] Get `BACKEND_API_TOKEN` from `back-end/.env`
- [ ] Confirm backend URL: `https://admin.littleherolabs.com`
- [ ] Share token (or I can read from `.env` if you prefer)

**Note:** I can read from `.env` file if you want, but you'll need to confirm the file location.

---

### Step 3: Decide on Automation vs Manual

**Option A: Automated Script (Recommended First Pass)**
- **Pros:** Fast, consistent, handles bulk updates
- **Cons:** May miss edge cases, needs manual review
- **Best for:** Simple URL replacements, consistent patterns

**Option B: Manual Updates (Recommended for Critical Workflows)**
- **Pros:** More control, handles complex cases, safer
- **Cons:** Slower, more error-prone, tedious
- **Best for:** Critical workflows (2A, 2B), complex logic

**Recommendation:** 
- **Hybrid Approach:**
  1. Use script for bulk find/replace of simple patterns
  2. Manually review and update critical workflows
  3. Test each workflow individually

---

### Step 4: Update Workflows

**Critical Workflows (Priority Order):**
1. **Workflow 2A** (`2A - Orchestrator.json`) - HIGH PRIORITY
2. **Workflow 2B** (`LHB - 2.B. - Background Removal.json`) - HIGH PRIORITY
3. **Workflow 3** (if exists) - MEDIUM PRIORITY
4. **Other workflows** - As needed

**What to Update:**
- Replace hardcoded R2 URLs with signed URL API calls
- Use `this.helpers.request()` in Code nodes
- Add hardcoded `backendUrl` and `backendToken`
- Update nodes that pass URLs to Bria API

---

## 📊 Detailed Migration Steps

### Step 1: Audit Current State

**Tasks:**
1. **List Active Workflows:**
   ```bash
   # Find all workflow JSON files
   find docs/n8n-workflow-files/finals -name "*.json"
   ```

2. **Search for Hardcoded URLs:**
   ```bash
   # Find all instances of hardcoded R2 URL
   grep -r "pub-92cec53654f84771956bc84dfea65baa" docs/n8n-workflow-files/finals/
   ```

3. **Identify Update Locations:**
   - Code nodes that construct R2 URLs
   - Code nodes that pass URLs to Bria API
   - Nodes that build manifest URLs
   - Any other R2 URL references

**Output:** 
- List of workflows needing updates
- List of nodes per workflow needing changes
- Count of instances per workflow

**Time Estimate:** 30-60 minutes

---

### Step 2: Get Backend Token

**Options:**

**Option A: You Provide It**
- You share the `BACKEND_API_TOKEN` value
- I use it in hardcoded values in workflows
- ⚠️ **Security Note:** This will be in workflow JSON files (acceptable for private workflows)

**Option B: I Read from .env**
- You confirm `.env` file location: `back-end/.env`
- I read `BACKEND_API_TOKEN` from the file
- Use it in workflows

**What I Need:**
- `BACKEND_API_TOKEN` value
- Confirm backend URL: `https://admin.littleherolabs.com`

---

### Step 3: Create Update Script (Optional)

**If we use automation:**

**File:** `scripts/update-n8n-workflows-for-private-r2.js`

**What it does:**
- Finds hardcoded R2 URLs in workflow JSON files
- Replaces URL construction with signed URL API calls
- Adds `this.helpers.request()` code snippets
- Updates with hardcoded backend URL and token

**Limitations:**
- May not handle all edge cases
- Needs manual review after running
- Critical workflows should be manually updated

**Recommendation:**
- Create script for reference/documentation
- Use it for simple replacements
- Manually update critical workflows

---

### Step 4: Manual Workflow Updates

**Workflow-by-Workflow Approach:**

**For Each Workflow:**
1. **Identify nodes needing updates:**
   - Code nodes with hardcoded R2 URLs
   - Nodes that pass URLs to Bria API
   - Nodes that build manifest URLs

2. **Update Code Nodes:**
   - Replace URL construction with signed URL API call
   - Use `this.helpers.request()` pattern
   - Add hardcoded backend URL and token

3. **Test Locally:**
   - Test with one workflow first
   - Verify signed URLs are generated
   - Verify workflow completes successfully

4. **Document Changes:**
   - Note which nodes were updated
   - Note any special cases or edge cases
   - Document any issues encountered

---

## 🎯 Specific Workflow Updates Needed

### Workflow 2A (`2A - Orchestrator.json`)

**Nodes to Update:**
- Code nodes that construct R2 URLs
- Nodes that build manifest URLs
- Any nodes that pass URLs to external services

**Pattern to Replace:**
```javascript
// BEFORE
const publicR2Url = 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';
const imageUrl = `${publicR2Url}/${storageKey}`;
```

**Pattern to Use:**
```javascript
// AFTER
const backendUrl = 'https://admin.littleherolabs.com';
const backendToken = 'YOUR_BACKEND_API_TOKEN';

const signedUrlResponse = await this.helpers.request({
  method: 'GET',
  url: `${backendUrl}/api/r2/signed-url`,
  qs: { key: storageKey, bucket: 'little-hero-assets', expiresIn: 3600 },
  headers: { 'Authorization': `Bearer ${backendToken}` },
  json: true
});
const imageUrl = signedUrlResponse.url;
```

---

### Workflow 2B (`LHB - 2.B. - Background Removal.json`)

**Nodes to Update:**
- "Prepare for R2 Upload" - constructs R2 URLs
- "Store Submission Result" - has hardcoded DEFAULT_R2
- "Build Bria Payload" - passes URLs to Bria API (needs signed URLs)
- "Prep Backend Webhook" - constructs manifest URLs

**Critical:**
- "Build Bria Payload" **MUST** use signed URLs (Bria API needs them)
- Manifest URLs can use backend proxy endpoint

---

## ⚠️ Important Considerations

### 1. Bria API Requirements

**Critical:** Bria API needs signed URLs when R2 is private!

**Nodes that pass URLs to Bria:**
- Must use signed URLs (not public URLs)
- Must call backend API before Bria API call
- Signed URLs must be valid and accessible

**Pattern:**
```javascript
// Get signed URL first
const signedUrlResponse = await this.helpers.request({
  method: 'GET',
  url: `${backendUrl}/api/r2/signed-url`,
  qs: { key: storageKey, bucket: 'little-hero-assets', expiresIn: 3600 },
  headers: { 'Authorization': `Bearer ${backendToken}` },
  json: true
});
const briaImageUrl = signedUrlResponse.url;

// Then pass to Bria API
const briaPayload = {
  image: briaImageUrl,  // Use signed URL
  // ...
};
```

---

### 2. Manifest URLs

**Current Pattern:**
```javascript
const manifestUrl = `${baseUrl}/book-mvp-simple-adventure/orders/${orderId}/manifests/2a-manifest.json`;
```

**Options:**
- **Option A:** Use backend proxy endpoint (recommended)
  ```javascript
  const manifestUrl = `${backendUrl}/api/manifests/book-mvp-simple-adventure/orders/${orderId}/manifests/2a-manifest.json`;
  ```
- **Option B:** Generate signed URL for manifest
  ```javascript
  const manifestKey = `book-mvp-simple-adventure/orders/${orderId}/manifests/2a-manifest.json`;
  const signedUrlResponse = await this.helpers.request({
    method: 'GET',
    url: `${backendUrl}/api/r2/signed-url`,
    qs: { key: manifestKey, bucket: 'little-hero-orders', expiresIn: 3600 },
    headers: { 'Authorization': `Bearer ${backendToken}` },
    json: true
  });
  const manifestUrl = signedUrlResponse.url;
  ```

**Recommendation:** Use backend proxy (Option A) - simpler and works with private buckets.

---

### 3. Testing Strategy

**Before Making R2 Private:**
- ✅ Test workflows with public R2 buckets
- ✅ Verify signed URLs are generated
- ✅ Verify Bria API can download images
- ✅ Verify workflows complete successfully

**After Making R2 Private:**
- ✅ Test workflows again
- ✅ Verify signed URLs still work
- ✅ Verify Bria API still works
- ✅ Monitor for 24 hours

---

## 📝 What We Need Before Starting

### Required Information

1. **✅ Backend Token:**
   - Get `BACKEND_API_TOKEN` from `.env`
   - Or I can read from `back-end/.env` if you confirm

2. **✅ Backend URL:**
   - Confirm: `https://admin.littleherolabs.com`
   - Or provide correct URL if different

3. **✅ Workflow Audit:**
   - Need to audit which workflows need updates
   - Identify specific nodes per workflow
   - Create update checklist

### Optional Information

1. **n8n Instance Info:**
   - n8n URL (if different from expected)
   - How to test workflows (manual trigger, webhook, etc.)

2. **Testing Preferences:**
   - Do you want to test with one workflow first?
   - Do you want to test all workflows before making R2 private?
   - Do you have a test order we can use?

---

## 🚀 Recommended Approach

### Phase 3.1: Audit (30-60 min)
1. List all workflows
2. Search for hardcoded URLs
3. Document which nodes need updates
4. Create update checklist

### Phase 3.2: Get Credentials (5 min)
1. Get `BACKEND_API_TOKEN` from `.env`
2. Confirm backend URL
3. Document values

### Phase 3.3: Update Workflows (2-4 hours)
1. **Start with Workflow 2B** (uses Bria API - highest priority)
2. Update "Build Bria Payload" node first (critical)
3. Test with one workflow
4. Update Workflow 2A
5. Update other workflows as needed
6. Test each workflow

### Phase 3.4: Testing (1-2 hours)
1. Test all updated workflows with public R2
2. Verify signed URLs work
3. Verify Bria API works
4. Fix any issues

### Phase 3.5: Ready for R2 Privatization
1. All workflows tested and working
2. Ready to make R2 buckets private
3. Final testing after privatization

---

## ❓ Questions to Answer

1. **Do you want me to audit workflows first?** (Recommended - 30-60 min)
2. **Can I read `.env` file, or will you provide the token?**
3. **Do you want automated script or manual updates?** (Recommend: manual for critical, script for bulk)
4. **Which workflow should we start with?** (Recommend: 2B - highest priority)
5. **Do you have a test order we can use for testing?**

---

**Next Step:** Let me know how you want to proceed, and I'll start with the audit or get the token and begin updates.

