# R2 Privatization Migration Outline

**Date:** 2025-01-27  
**Status:** Ready to Start  
**Branch:** `feat/r2-privatization`

---

## 📋 Questions Answered

### 1. Do we need to do an audit first?

**Answer: YES - We need to audit workflows**

**What's Already Done:**
- ✅ Phase 1: Test files and scripts assessed
- ✅ Phase 2: Backend API implemented

**What Still Needs Audit:**
- ❌ **Workflow audit** - Need to identify which workflows/nodes need updates
- ❌ **Hardcoded URL inventory** - Need exact count and locations
- ❌ **Update checklist** - Need per-workflow update plan

**Audit Tasks:**
1. List all workflows in `docs/n8n-workflow-files/finals/`
2. Search each for hardcoded R2 URLs
3. Identify which nodes need updates
4. Document update requirements per workflow
5. Create update checklist

**Time Estimate:** 30-60 minutes

---

### 2. Do we need to write scripts that will automatically update all workflows?

**Answer: OPTIONAL - Hybrid approach recommended**

**Option A: Automated Script (For Bulk Updates)**
- **Pros:** Fast, consistent, handles simple replacements
- **Cons:** May miss edge cases, needs manual review
- **Best for:** Simple URL pattern replacements

**Option B: Manual Updates (For Critical Workflows)**
- **Pros:** More control, handles complex cases, safer
- **Cons:** Slower, more tedious
- **Best for:** Critical workflows (2A, 2B), complex logic

**Recommendation: Hybrid Approach**
1. ✅ **Create script** for documentation/reference
2. ✅ **Use script** for simple bulk replacements (if any)
3. ✅ **Manually update** critical workflows (2A, 2B)
4. ✅ **Review all changes** before committing

**Script Status:**
- Script exists in migration guide (Task 3.1)
- Can be created/updated if needed
- **Recommendation:** Manual updates for critical workflows is safer

---

### 3. Do I need to manually update any workflows?

**Answer: YES - Critical workflows need manual updates**

**Workflows Requiring Manual Updates:**

1. **Workflow 2B** (`LHB - 2.B. - Background Removal.json`) - **HIGH PRIORITY**
   - **Why:** Passes URLs to Bria API (external service)
   - **Critical Nodes:**
     - "Build Bria Payload" - MUST use signed URLs
     - "Prepare for R2 Upload" - constructs R2 URLs
     - "Store Submission Result" - has hardcoded DEFAULT_R2
     - "Prep Backend Webhook" - constructs manifest URLs

2. **Workflow 2A** (`2A - Orchestrator.json`) - **HIGH PRIORITY**
   - **Why:** Creates URLs that may be used by 2B
   - **Critical Nodes:**
     - Nodes that construct R2 URLs
     - Nodes that build manifest URLs

3. **Other Workflows** - **MEDIUM/LOW PRIORITY**
   - SW0, SW1, SW2, SW3 - Review as needed
   - Queue Manager - May need updates

**Manual Update Process:**
1. Open workflow JSON file
2. Find Code nodes with hardcoded URLs
3. Replace with signed URL API call pattern
4. Add hardcoded backend URL and token
5. Test workflow
6. Document changes

---

### 4. Do you need to pull from the .env?

**Answer: YES - I need the BACKEND_API_TOKEN**

**What I Need:**
- `BACKEND_API_TOKEN` value from `back-end/.env`
- This will be hardcoded in workflow Code nodes

**Options:**
- **Option A:** You provide the token value
- **Option B:** I read from `back-end/.env` file
- **Option C:** You confirm the token value matches what's in your `.env`

**Backend URL:**
- Confirm: `https://admin.littleherolabs.com` (or provide correct URL)

**Security Note:**
- Token will be hardcoded in workflow JSON files
- Acceptable since workflows are private
- Will be committed to git (on private branch)

---

### 5. What else do we need to know or plan before we get started?

**Critical Information Needed:**

1. **✅ Backend Credentials** (REQUIRED)
   - `BACKEND_API_TOKEN` from `.env`
   - Backend URL: `https://admin.littleherolabs.com` (confirm)

2. **✅ Workflow Audit** (REQUIRED)
   - Which workflows are currently active?
   - Which workflows need updates?
   - Exact nodes per workflow needing changes

3. **✅ Testing Strategy** (RECOMMENDED)
   - Do you have a test order we can use?
   - How do you want to test workflows? (manual trigger, webhook, etc.)
   - Test with public R2 first, then private R2?

4. **✅ Update Order** (RECOMMENDED)
   - Start with Workflow 2B (highest priority - uses Bria API)
   - Then Workflow 2A
   - Then other workflows as needed

5. **✅ Rollback Plan** (RECOMMENDED)
   - Keep backup of original workflow files
   - Test thoroughly before making R2 private
   - Can revert if issues found

---

## 🎯 Migration Steps Summary

### Step 1: Audit Workflows ⚠️ NOT DONE YET
- [ ] List all workflows in `finals/` directory
- [ ] Search for hardcoded R2 URLs in each workflow
- [ ] Document which nodes need updates
- [ ] Create per-workflow update checklist
- [ ] **Time:** 30-60 minutes

### Step 2: Get Backend Token ⚠️ NEEDED
- [ ] Get `BACKEND_API_TOKEN` from `.env`
- [ ] Confirm backend URL
- [ ] Document values for use in workflows
- [ ] **Time:** 5 minutes

### Step 3: Update Workflows ⚠️ NOT STARTED
- [ ] Start with Workflow 2B (highest priority)
- [ ] Update "Build Bria Payload" node (critical)
- [ ] Update other nodes in 2B
- [ ] Test Workflow 2B
- [ ] Update Workflow 2A
- [ ] Update other workflows
- [ ] **Time:** 2-4 hours

### Step 4: Testing ⚠️ NOT STARTED
- [ ] Test all workflows with public R2 buckets
- [ ] Verify signed URLs are generated
- [ ] Verify Bria API can download images
- [ ] Fix any issues
- [ ] **Time:** 1-2 hours

### Step 5: Make R2 Private ⚠️ MANUAL TASK
- [ ] Make R2 buckets private (manual - Cloudflare dashboard)
- [ ] Test workflows again
- [ ] Verify everything still works
- [ ] Monitor for 24 hours

---

## 📊 Current State

**Workflows Found:**
- `2A - Orchestrator.json` - **HIGH PRIORITY**
- `LHB - 2.B. - Background Removal.json` - **HIGH PRIORITY**
- `SW0 - Base Character Generation.json`
- `SW1 - Pose Generation.json`
- `SW2 - Pose and Style QA.json`
- `SW3 - Upload.json`
- `LHB - 1.1- Queue Manager and Router.json` (new)

**Hardcoded URLs Found:**
- Workflow 2B: Multiple instances (PUBLIC_BASE, DEFAULT_R2, manifest URLs)
- Workflow 2A: Multiple instances (publicR2Url, manifest URLs)
- Test data in workflows: Many hardcoded URLs in example/test data

**Critical Nodes Identified:**
- Workflow 2B: "Build Bria Payload" - **MUST use signed URLs**
- Workflow 2B: "Prepare for R2 Upload" - constructs URLs
- Workflow 2B: "Store Submission Result" - has DEFAULT_R2
- Workflow 2B: "Prep Backend Webhook" - constructs manifest URLs
- Workflow 2A: Nodes that construct R2 URLs

---

## 🚀 Recommended Approach

### Immediate Next Steps

1. **Audit Workflows** (30-60 min)
   - I'll search all workflows for hardcoded URLs
   - Document exact nodes needing updates
   - Create detailed update checklist

2. **Get Backend Token** (5 min)
   - You provide token or I read from `.env`
   - Confirm backend URL

3. **Update Workflow 2B First** (1-2 hours)
   - Highest priority (uses Bria API)
   - Update "Build Bria Payload" node first
   - Test with one workflow
   - Then update other nodes

4. **Update Workflow 2A** (1-2 hours)
   - Second priority
   - Update nodes that construct URLs
   - Test

5. **Test All Workflows** (1-2 hours)
   - Test with public R2 buckets
   - Verify signed URLs work
   - Verify Bria API works

6. **Make R2 Private** (manual task)
   - Only after all workflows tested
   - Final verification

---

## ⚠️ Critical Notes

1. **Bria API Requirement:**
   - Bria API **MUST** receive signed URLs when R2 is private
   - "Build Bria Payload" node is **CRITICAL**
   - Must call backend API before Bria API call

2. **Testing Order:**
   - Test with public R2 first (signed URLs work with both)
   - Only make R2 private after all workflows tested
   - Monitor for 24 hours after privatization

3. **Backup Strategy:**
   - Keep backups of original workflow files
   - Commit after each workflow update
   - Can revert if issues found

4. **Workflow Structure:**
   - Using `this.helpers.request()` - no structure changes needed
   - Only updating Code node code
   - Lowest risk approach

---

## 📝 Decision Needed

**Before we start, please confirm:**

1. ✅ **Can I read `.env` file, or will you provide the token?**
   - Option: I read from `back-end/.env`
   - Option: You provide the token value

2. ✅ **Do you want audit first, or start updating?**
   - Recommend: Audit first (30-60 min)
   - Then update workflows based on audit

3. ✅ **Which workflow should we start with?**
   - Recommend: Workflow 2B (highest priority)
   - Then Workflow 2A

4. ✅ **Do you have a test order for testing?**
   - Helpful for verifying workflows work
   - Can use existing order if available

---

**Ready to proceed when you confirm these details!**

