# SW3 Audit: Upload

**Workflow Name:** `SW3 - Upload`  
**File:** `docs/n8n-workflow-files/finals/SW3 - Upload.json`  
**Priority:** 🟢 **LOW PRIORITY**  
**Date:** 2025-01-27

---

## Executive Summary

**Status:** ⚠️ **REQUIRES UPDATES**

**Key Findings:**
- **1 instance** of hardcoded R2 URL found
- Used for default public R2 URL
- Mostly internal use

**Risk Level:** **LOW** - Only one instance, and mostly internal use.

---

## Hardcoded URLs Found

### Total Count: 1 instance

**Patterns Found:**
- `https://pub-92cec53654f84771956bc84dfea65baa.r2.dev` (hardcoded base URL)
- `publicR2Url` variable with hardcoded fallback

---

## Nodes Requiring Updates

### 🟢 LOW PRIORITY NODES

#### 1. **"Schema Check + Defaults"** (First Code Node)
**Priority:** 🟢 **LOW**

**Current Code:**
```javascript
const publicR2Url = jIn.publicR2Url || 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';
```

**Required Update:**
- Remove hardcoded `publicR2Url` fallback
- Use backend signed URL API if URLs are for external access
- OR use backend proxy endpoint

**Update Pattern:**
```javascript
// If publicR2Url is needed for external access, use backend URL or signed URL API
// If only for internal use, can be removed or set to null
const publicR2Url = jIn.publicR2Url || null; // Remove hardcoded fallback
```

---

## Update Checklist

### Phase 1: Low Priority Updates

- [ ] **Update "Schema Check + Defaults" node**
  - Remove hardcoded `publicR2Url` fallback
  - Determine if `publicR2Url` is needed for external access
  - Update if needed

---

## Testing Requirements

### Before Making R2 Private

1. **Test "Schema Check + Defaults" node:**
   - Verify workflow functions without hardcoded URL
   - Test with real order data

2. **Test workflow integration:**
   - Verify workflow completes successfully
   - Test with downstream workflows

### After Making R2 Private

1. **Verify workflow still functions:**
   - Run workflow with real order
   - Verify all nodes complete successfully
   - Verify no errors in logs

---

## Dependencies

**Backend API Required:**
- `/api/r2/signed-url` endpoint (✅ Already implemented) - Only if URLs are for external access

**Credentials Needed:**
- `BACKEND_API_TOKEN` (from `.env`) - Only if URLs are for external access
- Backend URL: `https://admin.littleherolabs.com` - Only if URLs are for external access

---

## Notes

1. **URL Usage:**
   - Only one instance of hardcoded URL
   - Verify if `publicR2Url` is actually needed for external access
   - If only for internal use, can be removed

2. **Internal vs External:**
   - If URLs are only used internally, may not need signed URLs
   - Verify each URL's usage before updating

---

## Priority Order for Updates

1. **"Schema Check + Defaults"** - LOW (single instance, verify usage first)

---

**Status:** Ready for updates when backend token is provided. Low priority - verify URL usage first.

