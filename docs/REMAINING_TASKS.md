# Remaining Tasks for R2 Privatization

**Date:** 2025-11-05  
**Status:** Presigned URLs working, Bria AI tested ✅

---

## ✅ Completed

1. **Backend Signed URL API** ✅
   - Endpoint implemented: `/api/r2/signed-url`
   - Using `aws4fetch` library (Cloudflare recommended)
   - Tested: 200 OK with private buckets
   - Bria AI integration tested and confirmed working

2. **n8n Workflow Updates** ✅
   - Workflow 2A: Updated
   - Workflow 2B: Updated (includes "Build Bria Payload" with signed URLs)
   - Workflow 3: Updated
   - SW0, SW1, SW2, SW3: All updated
   - Hardcoded backend URL and token in Code nodes

3. **Documentation** ✅
   - Presigned URL implementation documented
   - Bria AI compatibility confirmed
   - Testing procedures documented

---

## 🔲 Remaining Tasks

### 1. Final Testing & Verification

#### A. Test n8n Workflows with Public R2 (Before Making Private)
- [ ] **Workflow 2A:** Test character generation workflow
  - Verify signed URLs are generated correctly
  - Check that images are accessible
  - Confirm manifest updates work

- [ ] **Workflow 2B:** Test background removal workflow
  - Verify "Build Bria Payload" generates signed URLs
  - Test Bria API call with signed URL
  - Confirm Bria can download images
  - Verify status polling works
  - Check that results are stored correctly

- [ ] **Workflow 3:** Test book assembly workflow
  - Verify signed URLs for background images
  - Check story text loading
  - Confirm PDF generation works

- [ ] **Sub-workflows (SW0-SW3):** Test each sub-workflow
  - SW0: Base character generation
  - SW1: Pose generation
  - SW2: Pose and style QA
  - SW3: Asset upload

#### B. Test Backend API Endpoints
- [ ] **Signed URL API:** Verify authentication works
  - Test with valid token: Should return 200
  - Test with invalid token: Should return 401
  - Test with missing token: Should return 401
  - Test with invalid parameters: Should return 400

- [ ] **Frontend Proxy:** Verify `/api/assets/[...path]` works
  - Test image loading from frontend
  - Verify images display correctly
  - Check error handling for missing files

#### C. Test Bria AI End-to-End
- [ ] **Full Workflow Test:** Run Workflow 2B with real order
  - Submit image to Bria via signed URL
  - Poll for status until completion
  - Verify background-removed image is downloaded
  - Check image quality and format

### 2. Make R2 Buckets Private

**Manual Task:** (Cannot be automated)

- [ ] **Cloudflare Dashboard:**
  1. Go to R2 → Buckets
  2. Select `little-hero-assets` bucket
  3. Go to Settings
  4. Set "Public Access" to **Disabled** (Private)
  5. Repeat for `little-hero-orders` bucket

- [ ] **Verify Buckets are Private:**
  - Test public URL: Should return 401/403
  - Test signed URL: Should return 200 OK
  - Confirm frontend proxy still works

### 3. Post-Privatization Testing

#### A. Verify Public URLs are Blocked
- [ ] Test old public R2 URLs: Should return 401/403
- [ ] Verify no public access is possible

#### B. Verify Signed URLs Still Work
- [ ] Test backend signed URL API: Should return 200
- [ ] Test signed URL access: Should download file
- [ ] Verify expiration works (test expired URL)

#### C. Verify Frontend Still Works
- [ ] Test image loading: Should work via proxy
- [ ] Test all image types: PNG, JPEG, etc.
- [ ] Check error handling for missing files

#### D. Verify n8n Workflows Still Work
- [ ] **Workflow 2A:** Test with private buckets
- [ ] **Workflow 2B:** Test Bria integration with private buckets
- [ ] **Workflow 3:** Test book assembly with private buckets
- [ ] **Sub-workflows:** Test all SW0-SW3

#### E. Verify Bria AI Integration
- [ ] Test full 2B workflow with private buckets
- [ ] Verify Bria can download images via signed URLs
- [ ] Confirm processing completes successfully
- [ ] Check results are stored correctly

### 4. Monitoring & Cleanup

#### A. Monitor for Issues
- [ ] Set up error monitoring for signed URL API
- [ ] Monitor n8n workflow execution logs
- [ ] Watch for 403 errors in workflows
- [ ] Track Bria API success rates

#### B. Clean Up
- [ ] Remove test files from R2 (if any)
- [ ] Clean up test scripts
- [ ] Update documentation with final status
- [ ] Archive old public URL references (if needed)

#### C. Documentation Updates
- [ ] Update deployment guides
- [ ] Document any issues encountered
- [ ] Create troubleshooting guide
- [ ] Update README if needed

---

## 🎯 Priority Order

1. **High Priority:** Test n8n workflows with public R2 (before making private)
2. **High Priority:** Make R2 buckets private
3. **High Priority:** Post-privatization testing
4. **Medium Priority:** Monitoring setup
5. **Low Priority:** Cleanup and documentation

---

## 📋 Testing Checklist Summary

### Before Making R2 Private
- [ ] All n8n workflows tested with public R2
- [ ] Backend signed URL API tested
- [ ] Bria AI integration tested
- [ ] Frontend proxy tested
- [ ] All tests pass

### After Making R2 Private
- [ ] Public URLs blocked (401/403)
- [ ] Signed URLs work (200 OK)
- [ ] Frontend images load
- [ ] n8n workflows function
- [ ] Bria AI processes images
- [ ] No errors in logs

---

## ⚠️ Important Notes

1. **Test with public R2 first** - Signed URLs work with both public and private buckets
2. **Don't make buckets private until all tests pass**
3. **Monitor for 403 errors** - These indicate signature or permission issues
4. **Bria AI uses GET requests** - HEAD requests return 403, but GET works (this is expected)
5. **Hardcoded values are in place** - Backend URL and token are in n8n Code nodes

---

## 📁 Related Documentation

- `PRESIGNED_URL_SUCCESS.md` - Implementation details
- `BRIA_AI_COMPATIBILITY_OPTIONS.md` - Bria integration analysis
- `PRIVATIZATION_STATUS.md` - Overall project status
- `PHASE3_MIGRATION_PLAN.md` - n8n workflow update plan
- `00-AUDIT-SUMMARY.md` - n8n workflow audit results

---

**Next Action:** Begin testing n8n workflows with public R2 buckets before making buckets private.

