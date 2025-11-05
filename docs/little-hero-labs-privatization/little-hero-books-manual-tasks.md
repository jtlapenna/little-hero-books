# Manual Tasks for R2 Private Migration - little-hero-books

**Repository:** little-hero-books  
**Date:** 2025-01-27  
**Purpose:** List all manual tasks that must be performed outside of code changes

---

## Overview

This document lists all manual tasks you need to perform on external platforms and services. These cannot be automated through code changes and must be done manually through web interfaces or command-line tools.

**Estimated Total Time:** 30-45 minutes

---

## Phase 1: Cloudflare R2 Bucket Privacy

### Task 1.1: Make `little-hero-assets` Bucket Private

**Platform:** Cloudflare Dashboard  
**Priority:** CRITICAL  
**Time:** 5 minutes

**Steps:**
1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **R2 Object Storage** (left sidebar)
3. Find and click on the bucket: `little-hero-assets`
4. Go to **Settings** tab
5. Scroll to **Public Access** section
6. Find **Allow Access** or **Public Access** toggle
7. **Disable** public access (set to Private)
8. Click **Save** or **Update**
9. Verify the bucket is now marked as **Private**

**Verification:**
- Try accessing a public URL: `https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/book-mvp-simple-adventure/...`
- Should return **403 Forbidden** (this confirms it's private)

**⚠️ Important:** Do this AFTER backend API and workflows are updated and tested.

---

### Task 1.2: Make `little-hero-orders` Bucket Private

**Platform:** Cloudflare Dashboard  
**Priority:** CRITICAL  
**Time:** 5 minutes

**Steps:**
1. In Cloudflare Dashboard, navigate to **R2 Object Storage**
2. Find and click on the bucket: `little-hero-orders`
3. Go to **Settings** tab
4. Scroll to **Public Access** section
5. **Disable** public access (set to Private)
6. Click **Save** or **Update**
7. Verify the bucket is now marked as **Private**

**Verification:**
- Try accessing a public URL from this bucket
- Should return **403 Forbidden**

**⚠️ Important:** Do this AFTER backend API and workflows are updated and tested.

---

## Phase 2: GitHub Repository Privacy

### Task 2.1: Make Repository Private

**Platform:** GitHub  
**Priority:** HIGH  
**Time:** 2 minutes

**Steps:**
1. Navigate to: https://github.com/jtlapenna/little-hero-books
2. Click on **Settings** tab (top right of repository page)
3. Scroll down to **Danger Zone** section (bottom of page)
4. Click **Change visibility**
5. Select **Make private**
6. Type the repository name to confirm: `jtlapenna/little-hero-books`
7. Click **I understand, change repository visibility**
8. Confirm the change

**Verification:**
- Repository should now show **Private** badge
- Repository URL should only be accessible to authorized users

**⚠️ Important:** Do this AFTER:
- R2 buckets are private
- Backend API is implemented
- n8n workflows are updated
- All tests pass

---

### Task 2.2: Verify GitHub Actions Still Work (If Applicable)

**Platform:** GitHub  
**Priority:** MEDIUM  
**Time:** 5 minutes

**If you use GitHub Actions for CI/CD:**

1. Go to repository **Settings** > **Actions** > **General**
2. Verify **Workflow permissions** are set correctly
3. Check that workflows can access private repositories
4. Run a test workflow to verify it still works
5. Check workflow logs for any access issues

**Note:** GitHub Actions typically work fine with private repositories, but verify to be safe.

---

## Phase 3: n8n Environment Variables

**⚠️ CRITICAL TIMING:** Complete these tasks **BEFORE** updating or testing workflows. Environment variables must be set before workflows can use them.

### Task 3.1: Add Backend API URL

**Platform:** n8n  
**Priority:** HIGH (REQUIRED - must be done before workflow testing)  
**Time:** 5 minutes

**Steps:**
1. Log into your n8n instance: `https://thepeakbeyond.app.n8n.cloud` (or your n8n URL)
2. Navigate to **Settings** (gear icon, usually top right)
3. Go to **Environment Variables** or **Variables** section
4. Click **Add Variable** or **+**
5. Set variable:
   - **Name:** `BACKEND_API_URL`
   - **Value:** `https://admin.littleherolabs.com` (your actual backend URL)
   - **Type:** Usually "Text" or "String"
6. Click **Save**

**Verification:**
- Variable should appear in the list
- Can be referenced in workflows as `$env.BACKEND_API_URL`
- **Test:** Create a simple test workflow to verify variable is accessible

---

### Task 3.2: Add Backend API Token (REQUIRED)

**Platform:** n8n  
**Priority:** HIGH (REQUIRED - backend API requires Bearer token authentication)  
**Time:** 5 minutes

**Steps:**
1. In n8n **Settings** > **Environment Variables**
2. Click **Add Variable**
3. Set variable:
   - **Name:** `BACKEND_API_TOKEN`
   - **Value:** Your backend API authentication token (same as `BACKEND_API_TOKEN` in your backend environment)
   - **Type:** Usually "Secret" or "Password" (if available)
   - **Note:** Mark as secret if possible to hide it in logs
4. Click **Save**

**Verification:**
- Variable should appear in the list (may be masked/hidden)
- Can be referenced in workflows as `$env.BACKEND_API_TOKEN`
- **Test:** Verify variable is accessible (without exposing value)

**⚠️ Important:** This token is REQUIRED - the backend signed URL API endpoint requires Bearer token authentication. Without this, all workflow calls to the backend API will fail with 401 Unauthorized.

---

### Task 3.3: Update Existing R2 URL Variable (If Present)

**Platform:** n8n  
**Priority:** MEDIUM  
**Time:** 2 minutes

**If you have an existing variable like `PUBLIC_R2_URL` or `R2_PUBLIC_URL`:**

1. In n8n **Settings** > **Environment Variables**
2. Find the variable (e.g., `PUBLIC_R2_URL`)
3. Either:
   - **Option A:** Update value to your backend API URL
   - **Option B:** Delete it (if no longer needed)
4. Save changes

**Note:** This is optional - the new `BACKEND_API_URL` variable is what workflows should use.

---

## Phase 4: Cloudflare Pages Configuration

### Task 4.1: Verify Pages Deployment Works with Private Repo

**Platform:** Cloudflare Dashboard  
**Priority:** MEDIUM  
**Time:** 5 minutes

**Steps:**
1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Pages** (left sidebar)
3. Find your `little-hero-books` or related project
4. Go to **Settings** > **Builds & deployments**
5. Verify the repository connection is still active
6. Check that it can access the private repository
7. If needed, re-authenticate GitHub connection

**If Repository Connection is Broken:**
1. Go to **Settings** > **Builds & deployments**
2. Click **Connect to Git** or **Reconnect**
3. Authorize Cloudflare Pages to access your GitHub account
4. Select the `little-hero-books` repository
5. Verify connection is successful

**Verification:**
- Repository should show as connected
- Test deployment should work (or verify existing deployments still work)

---

### Task 4.2: Update Environment Variables in Cloudflare Pages (If Needed)

**Platform:** Cloudflare Dashboard  
**Priority:** MEDIUM  
**Time:** 5 minutes

**If your backend uses environment variables that need updating:**

1. In Cloudflare Pages, go to your project
2. Navigate to **Settings** > **Environment variables**
3. Review existing variables:
   - `R2_PUBLIC_URL` - May need to be removed or updated
   - `BACKEND_API_URL` - Add if needed
   - Any R2-related variables
4. Add or update variables as needed
5. Save changes

**Note:** Only update if your backend/frontend code requires these variables.

---

## Phase 5: Backend Environment Variables

### Task 5.1: Update Backend Environment Variables

**Platform:** Your Backend Hosting (Cloudflare Pages/Workers, Vercel, etc.)  
**Priority:** HIGH  
**Time:** 5 minutes

**If your backend is hosted separately:**

1. Log into your backend hosting platform
2. Navigate to project settings
3. Go to **Environment Variables** or **Secrets**
4. Verify these variables are set:
   - `R2_ACCESS_KEY_ID` - Should already be set
   - `R2_SECRET_ACCESS_KEY` - Should already be set
   - `CLOUDFLARE_ACCOUNT_ID` - Should already be set
   - `R2_PUBLIC_BUCKET` or `R2_PUBLIC_BUCKET_NAME` - Should be `little-hero-assets`
   - `R2_ORDERS_BUCKET` or `R2_ORDERS_BUCKET_NAME` - Should be `little-hero-orders`
5. Add new variable if needed:
   - `BACKEND_API_URL` - Your backend URL (if used by frontend)
6. Remove or update `R2_PUBLIC_URL` if it exists (no longer needed for public URLs)

**Verification:**
- All required variables are present
- Values are correct
- Redeploy backend if needed for changes to take effect

---

## Phase 6: Testing & Verification

### Task 6.1: Test Signed URL API Endpoint

**Platform:** Your Backend  
**Priority:** HIGH  
**Time:** 5 minutes

**Steps:**
1. Open your backend API in browser or use curl/Postman
2. Test endpoint: `GET https://your-backend.com/api/r2/signed-url?key=test-key&bucket=little-hero-assets`
3. Should return JSON with `url` and `expiresIn` fields
4. Copy the `url` from response
5. Try accessing the signed URL in a new browser tab
6. Should successfully download/view the file
7. Wait for expiration time (or test with short expiration)
8. Verify URL expires after expiration time

**Expected Response:**
```json
{
  "url": "https://...signed-url...",
  "expiresIn": 3600,
  "bucket": "little-hero-assets",
  "key": "test-key",
  "generatedAt": "2025-01-27T..."
}
```

---

### Task 6.2: Test n8n Workflows

**Platform:** n8n  
**Priority:** HIGH  
**Time:** 10-15 minutes

**Steps:**
1. Log into n8n
2. Import updated workflow files (if using files from repo)
3. Or manually update workflows in n8n UI
4. Test **Workflow 2A** (Character Generation):
   - Trigger workflow
   - Verify it calls backend API for signed URL
   - Verify signed URL is passed to Bria API
   - Verify Bria API successfully downloads image
   - Check workflow completes successfully
5. Test **Workflow 2B** (Background Removal):
   - Verify it receives signed URLs
   - Verify it processes correctly
6. Test **Workflow 3** (Book Assembly):
   - Verify it receives valid URLs
   - Verify book generation completes
7. Check workflow execution logs for any errors

**Verification:**
- All workflows complete successfully
- No 403 errors in logs
- Bria API calls succeed
- Images are processed correctly

---

### Task 6.3: Test Frontend Image Loading

**Platform:** Your Frontend Application  
**Priority:** HIGH  
**Time:** 5 minutes

**Steps:**
1. Open your frontend application
2. Navigate to pages that display images from R2
3. Verify images load correctly
4. Check browser console for any errors
5. Verify images are using signed URLs (check Network tab)
6. Wait for signed URL expiration (if possible)
7. Verify URL refresh mechanism works (if implemented)

**Verification:**
- All images load correctly
- No 403 errors in browser console
- Signed URLs are being used
- URL expiration handling works

---

### Task 6.4: Monitor for 24 Hours

**Platform:** All Services  
**Priority:** MEDIUM  
**Time:** Ongoing (check periodically)

**What to Monitor:**
- n8n workflow execution logs
- Backend API logs
- Frontend error logs
- Cloudflare R2 access logs (if available)
- Any monitoring/alerts you have set up

**What to Look For:**
- 403 Forbidden errors
- Workflow failures
- API endpoint errors
- Image loading issues
- Signed URL expiration issues

**Action if Issues Found:**
- Document the issue
- Check error logs
- Rollback if critical (see Rollback Procedures)
- Fix and retry

---

## Phase 7: Cleanup (Optional)

### Task 7.1: Remove Old Environment Variables

**Platform:** Various (n8n, Cloudflare, Backend)  
**Priority:** LOW  
**Time:** 5 minutes

**If you have old variables that are no longer needed:**

1. **n8n:** Remove `PUBLIC_R2_URL` if it exists and is no longer used
2. **Cloudflare Pages:** Remove `R2_PUBLIC_URL` if it exists
3. **Backend:** Remove any public URL variables if no longer needed

**⚠️ Important:** Only remove variables that are confirmed unused. Check code first.

---

## Task Checklist

### Pre-Migration (Before Code Changes)
- [ ] Review this manual tasks document
- [ ] Gather all required URLs and credentials
- [ ] Prepare backend API URL
- [ ] Prepare n8n instance URL

### During Migration (After Code Changes)
- [ ] Test backend signed URL API endpoint (with authentication)
- [ ] **Update n8n environment variables** (BEFORE testing workflows)
  - [ ] Add `BACKEND_API_URL`
  - [ ] Add `BACKEND_API_TOKEN`
- [ ] Test n8n workflows with new variables
- [ ] Verify Cloudflare Pages still works

### Before Making R2 Private
- [ ] All backend code changes complete (with authentication)
- [ ] n8n environment variables are set (`BACKEND_API_URL`, `BACKEND_API_TOKEN`)
- [ ] All n8n workflow updates complete
- [ ] Frontend signed URL strategy implemented (backend APIs return signed URLs)
- [ ] All tests pass (with public R2 buckets)
- [ ] Get user approval

### After Making R2 Private
- [ ] Make `little-hero-assets` bucket private
- [ ] Make `little-hero-orders` bucket private
- [ ] Verify buckets are private (403 on public URLs)
- [ ] Test signed URLs still work
- [ ] Test n8n workflows end-to-end
- [ ] Test frontend image loading
- [ ] Make GitHub repository private
- [ ] Verify GitHub Actions still work (if applicable)
- [ ] Monitor for 24 hours

### Post-Migration Cleanup
- [ ] Remove unused environment variables (if any)
- [ ] Update documentation
- [ ] Document any issues encountered

---

## Critical Order of Operations

**⚠️ DO NOT make R2 buckets private until:**

1. ✅ Backend API endpoint is implemented **with authentication**
2. ✅ Backend API is tested and working (verify 401 without token, 200 with token)
3. ✅ n8n environment variables are set **BEFORE** workflow updates (`BACKEND_API_URL`, `BACKEND_API_TOKEN`)
4. ✅ n8n workflows are updated (use `this.helpers.request()` in Code nodes - no workflow structure changes)
5. ✅ n8n workflows are tested (with public R2 buckets - signed URLs work with both)
6. ✅ Frontend signed URL strategy implemented (backend APIs return signed URLs)
7. ✅ All code tests pass
8. ✅ User approval received

**Then:**
1. Make R2 buckets private
2. Test everything again
3. Make GitHub repository private
4. Final verification
5. Monitor for 24 hours

---

## Required Information Checklist

Before starting, gather this information:

- [ ] **Cloudflare Account:** Login credentials
- [ ] **Cloudflare R2 Buckets:** Names (`little-hero-assets`, `little-hero-orders`)
- [ ] **Backend API URL:** Your deployed backend URL
- [ ] **Backend API Token:** If authentication required
- [ ] **n8n Instance URL:** Your n8n cloud URL or instance URL
- [ ] **n8n Login:** Credentials for n8n
- [ ] **GitHub Account:** For repository privacy changes
- [ ] **Cloudflare Pages Project:** Project name and settings access

---

## Rollback Procedures

### If Something Goes Wrong

**Rollback R2 Buckets:**
1. Log into Cloudflare Dashboard
2. Navigate to R2 Object Storage
3. Select bucket
4. Settings > Public Access
5. **Enable** public access (set to Public)
6. Save changes

**Rollback Repository:**
1. Go to GitHub repository
2. Settings > Danger Zone
3. Change visibility back to Public
4. Confirm change

**Rollback n8n:**
1. Revert environment variables to previous values
2. Import previous workflow versions
3. Test workflows

---

## Verification Checklist

After completing all manual tasks:

- [ ] R2 buckets are private (403 on public URLs)
- [ ] Signed URLs work (can access files)
- [ ] n8n workflows execute successfully
- [ ] Bria API can download images
- [ ] Frontend images load correctly
- [ ] GitHub repository is private
- [ ] Cloudflare Pages still deploys (if applicable)
- [ ] No 403 errors in logs
- [ ] All environment variables are set correctly
- [ ] Monitoring shows no critical issues

---

## Notes

- **Take screenshots** of important settings before making changes (for rollback reference)
- **Document any errors** encountered during manual tasks
- **Test incrementally** - don't change everything at once
- **Have rollback plan ready** before making changes
- **Monitor closely** after making R2 private

---

## Support Resources

- **Cloudflare R2 Docs:** https://developers.cloudflare.com/r2/
- **Cloudflare R2 Signed URLs:** https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- **GitHub Repository Settings:** https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings
- **n8n Environment Variables:** Check n8n documentation for your instance

---

## Questions?

If you encounter issues with any manual task:

1. Document the issue
2. Check platform-specific documentation
3. Verify you have correct permissions/access
4. Contact support if needed
5. Update this document with solutions

