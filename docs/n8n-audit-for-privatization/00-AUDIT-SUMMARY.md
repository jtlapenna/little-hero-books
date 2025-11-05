# n8n Workflow Audit Summary

**Date:** 2025-01-27  
**Branch:** `feat/r2-privatization`  
**Status:** ✅ **AUDIT COMPLETE**

---

## Overview

This audit identifies all n8n workflows that need updates before R2 buckets can be made private. Each workflow has been analyzed for hardcoded R2 URLs and nodes that require updates.

---

## Workflows Audited

### 7 Workflows Total

1. ✅ **Workflow 2B** - `LHB - 2.B. - Background Removal.json` - 🔴 **CRITICAL**
2. ✅ **Workflow 2A** - `2A - Orchestrator.json` - 🟡 **HIGH**
3. ✅ **Workflow 3** - `LHB - 3 -Book Assembly.json` - 🟡 **MEDIUM**
4. ✅ **SW0** - `SW0 - Base Character Generation.json` - 🟢 **MEDIUM**
5. ✅ **SW1** - `SW1 - Pose Generation.json` - 🟢 **MEDIUM**
6. ✅ **SW2** - `SW2 - Pose and Style QA.json` - 🟢 **MEDIUM**
7. ✅ **SW3** - `SW3 - Upload.json` - 🟢 **LOW**

---

## Summary Statistics

### Total Hardcoded URLs Found: **74 instances**

**By Priority:**
- 🔴 **CRITICAL:** 39 instances (Workflow 2B)
- 🟡 **HIGH:** 15 instances (Workflow 2A, Workflow 3)
- 🟢 **MEDIUM:** 15 instances (SW0, SW1, SW2)
- 🟢 **LOW:** 5 instances (SW3, test data)

### Nodes Requiring Updates: **~30 nodes**

**By Priority:**
- 🔴 **CRITICAL:** 1 node (Workflow 2B - "Build Bria Payload")
- 🟡 **HIGH:** ~15 nodes (Workflow 2B, 2A, 3)
- 🟢 **MEDIUM:** ~10 nodes (SW0, SW1, SW2)
- 🟢 **LOW:** ~4 nodes (SW3, test data)

---

## Critical Findings

### 🔴 **CRITICAL: Workflow 2B - "Build Bria Payload" Node**

**Why Critical:**
- Passes image URLs directly to Bria AI API (external service)
- Bria API **MUST** receive signed URLs when R2 is private
- According to [Bria API documentation](https://docs.bria.ai/), Bria requires "publicly accessible URL" for image URLs
- When R2 is private, public URLs return 403 Forbidden - **signed URLs make private R2 objects publicly accessible** (temporarily)
- This workflow will break when R2 buckets are made private if not updated

**Action Required:**
- **MUST** update "Build Bria Payload" node before making R2 private
- This is the highest priority update

---

## Update Priority Order

### Phase 1: Critical Updates (Must Do First)

1. **Workflow 2B - "Build Bria Payload" node**
   - Priority: 🔴 **CRITICAL**
   - Reason: Passes URLs to Bria API (external service)
   - Estimated Time: 1-2 hours

### Phase 2: High Priority Updates

2. **Workflow 2B - Other nodes**
   - Priority: 🟡 **HIGH**
   - Nodes: "Prep Backend Webhook", "Prepare for R2 Upload", "Store Submission Result"
   - Estimated Time: 2-3 hours

3. **Workflow 2A**
   - Priority: 🟡 **HIGH**
   - Nodes: "Create Final Summary", "Set Orchestrator Defaults", "Capture Order Context"
   - Estimated Time: 1-2 hours

4. **Workflow 3**
   - Priority: 🟡 **MEDIUM-HIGH**
   - Nodes: "Load Background Images", "Build Page Blocks", "Load Story Text"
   - Estimated Time: 2-3 hours

### Phase 3: Medium Priority Updates

5. **SW0, SW1, SW2**
   - Priority: 🟢 **MEDIUM**
   - Estimated Time: 2-3 hours total

### Phase 4: Low Priority Updates

6. **SW3**
   - Priority: 🟢 **LOW**
   - Estimated Time: 30 minutes

7. **Test Data**
   - Priority: 🟢 **LOW (Optional)**
   - Estimated Time: 30 minutes

---

## Estimated Total Time

**Total Estimated Time:** 10-15 hours

- Phase 1 (Critical): 1-2 hours
- Phase 2 (High): 5-8 hours
- Phase 3 (Medium): 2-3 hours
- Phase 4 (Low): 1 hour

---

## Dependencies

### Backend API Required

- ✅ `/api/r2/signed-url` endpoint (Already implemented)
- ✅ Backend proxy endpoint for manifests (Verify if exists)

### Credentials Needed

- `BACKEND_API_TOKEN` (from `.env`)
- Backend URL: `https://admin.littleherolabs.com`

---

## Testing Requirements

### Before Making R2 Private

1. **Test Workflow 2B:**
   - Verify "Build Bria Payload" generates signed URLs
   - Verify Bria API can download images from signed URLs
   - Test with multiple poses

2. **Test Workflow 2A:**
   - Verify manifest URLs are generated correctly
   - Test workflow integration with 2B

3. **Test Workflow 3:**
   - Verify background images are loaded correctly
   - Verify PDF generation works

4. **Test all workflows:**
   - Run each workflow with test order
   - Verify all nodes complete successfully
   - Verify no errors in logs

### After Making R2 Private

1. **Verify signed URLs work:**
   - Test signed URLs are accessible
   - Test external services (Bria API) can access URLs
   - Monitor for 24 hours

2. **Verify workflows still function:**
   - Run each workflow with real order
   - Verify all nodes complete successfully
   - Verify no errors in logs

---

## Next Steps

1. **Get Backend Token:**
   - Get `BACKEND_API_TOKEN` from `.env`
   - Confirm backend URL

2. **Start with Workflow 2B:**
   - Update "Build Bria Payload" node first (CRITICAL)
   - Test with public R2 buckets
   - Then update other Workflow 2B nodes

3. **Update Workflow 2A:**
   - Update nodes that create URLs used by 2B
   - Test workflow integration

4. **Update Workflow 3:**
   - Update nodes that load images
   - Test PDF generation

5. **Update SW0, SW1, SW2:**
   - Update nodes that create URLs
   - Test workflow integration

6. **Update SW3:**
   - Update if needed (low priority)

7. **Test All Workflows:**
   - Test with public R2 buckets
   - Verify all workflows complete successfully

8. **Make R2 Private:**
   - Only after all workflows tested
   - Final verification

---

## Individual Audit Documents

Each workflow has a detailed audit document:

1. `01-WORKFLOW-2B-AUDIT.md` - Critical priority
2. `02-WORKFLOW-2A-AUDIT.md` - High priority
3. `03-WORKFLOW-3-AUDIT.md` - Medium priority
4. `04-SW0-AUDIT.md` - Medium priority
5. `05-SW1-AUDIT.md` - Medium priority
6. `06-SW2-AUDIT.md` - Medium priority
7. `07-SW3-AUDIT.md` - Low priority

---

## Status

✅ **Audit Complete** - Ready for updates when backend token is provided.

---

**Last Updated:** 2025-01-27

