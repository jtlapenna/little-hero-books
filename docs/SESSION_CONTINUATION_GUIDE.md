# R2 Privatization Project - Session Continuation Guide

**Date:** 2025-11-05  
**Current Status:** Testing workflows with private R2 buckets  
**Branch:** `feat/r2-privatization`

---

## Project Overview

**Goal:** Privatize R2 buckets for Little Hero Books to prevent public access to customer data, requiring signed URLs or backend proxy endpoints for all access.

**Current State:**
- ✅ R2 buckets are now **private** (Step 2 complete)
- ✅ Backend API endpoints created and working:
  - `/api/r2/signed-url` - Generates presigned URLs for R2 objects
  - `/api/assets/{storageKey}` - Proxy endpoint that serves R2 images directly
- ✅ Most n8n workflows updated for R2 privatization
- 🔄 **Currently testing** workflows end-to-end (Step 3 in progress)

---

## Architecture & Technical Context

### Backend Infrastructure
- **Platform:** Cloudflare Pages (`little-hero-labs-admin`)
- **Framework:** Next.js App Router
- **Account IDs:**
  - R2 Buckets: `3daae940fcb6fc5b8bbd9bb8fcc62854` (Jeff's account)
  - Cloudflare Pages: `6b350b56c3869968902542900b1f1427` (John's account)
- **Backend URL:** `https://admin.littleherolabs.com`
- **Backend Token:** `e41d510ce6ed6e9c7f602fea860f2591cc7ec75fe63e448336a97c4b73898646`

### R2 Access Methods

1. **Signed URLs** (for external services like Bria AI):
   - Endpoint: `GET /api/r2/signed-url?key={storageKey}&bucket={bucket}&expiresIn={seconds}`
   - Returns: Presigned URL with `?X-Amz-Algorithm=...` query params
   - Works with both public and private buckets

2. **Backend Proxy** (for n8n workflows and internal access):
   - Endpoint: `GET /api/assets/{storageKey}`
   - Headers: `Authorization: Bearer {token}`
   - Backend fetches from R2 and streams the image
   - **Preferred method** for n8n workflows

### R2 URL Conversion Pattern

When updating workflows, convert R2 URLs like this:
```
OLD: https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/{storageKey}
NEW: https://admin.littleherolabs.com/api/assets/{storageKey}
```

**Required changes:**
- Add `Authorization: Bearer {token}` header
- Update URL to use backend proxy endpoint

---

## Workflow Status

### ✅ Ready for Testing
- **2B - Background Removal**: Uses backend proxy for Bria AI
- **SW0 - Base Character Generation**: Uses S3 nodes (works with private buckets)
- **SW1 - Pose Generation**: Uses S3 nodes
- **SW3 - Upload**: Uses S3 nodes
- **2A - Orchestrator**: Uses backend manifest URLs

### 🔄 Recently Fixed - Testing Needed
- **SW2 - Pose and Style QA**: 
  - ✅ Fixed "Get Pose" node (uses backend proxy)
  - ✅ Fixed "Reattach (Style QA): Base + Generated" node (`downloadToBinary` function)
  - ✅ Fixed "Pose QA — Build Request1" node (`downloadToBinaryPlus` function)
  - ⚠️ **Just fixed syntax error** - needs re-testing

---

## How to Review SW2 for Errors Before Testing

### Step 1: Check Function Structure

**File:** `docs/n8n-workflow-files/finals/SW2 - Pose and Style QA.json`

**Key Functions to Verify:**

1. **`downloadToBinary` function** (in "Reattach (Style QA): Base + Generated" node):
   ```javascript
   async function downloadToBinary(url, fileName){
     // Should:
     // - Detect R2 URLs (.r2.dev, .r2.cloudflarestorage.com, pub-92cec...)
     // - Convert to backend proxy: `${backendUrl}/api/assets/${storageKey}`
     // - Add Authorization header
     // - End with } (NOT };)
   }
   ```

2. **`downloadToBinaryPlus` function** (in "Pose QA — Build Request1" node):
   ```javascript
   async function downloadToBinaryPlus(url, fileName){
     // Should:
     // - Have same R2 URL detection and conversion
     // - Return { bin, buf } (not just bin)
     // - End with } (NOT };)
     // - NOT have duplicate catch blocks
   }
   ```

**Verification Commands:**
```bash
# Check function count (should be 1 each)
grep -c "async function downloadToBinary" "docs/n8n-workflow-files/finals/SW2 - Pose and Style QA.json"
grep -c "async function downloadToBinaryPlus" "docs/n8n-workflow-files/finals/SW2 - Pose and Style QA.json"

# Check for syntax issues
grep -n "};" "docs/n8n-workflow-files/finals/SW2 - Pose and Style QA.json" | grep -v "return {"
grep -n "catch(e){" "docs/n8n-workflow-files/finals/SW2 - Pose and Style QA.json" | wc -l  # Should be 1
```

### Step 2: Check for Common Issues

**Common Problems to Look For:**

1. **Duplicate catch blocks:**
   - Search for: `}catch(e){` followed by another `catch(e){`
   - Should only have ONE catch block per function

2. **Malformed function endings:**
   - Look for: `};` at end of function (should be `}`)
   - Look for: Functions that don't close before `await` statements

3. **Hardcoded R2 URLs:**
   - Search for: `pub-92cec53654f84771956bc84dfea65baa.r2.dev`
   - Should be converted to backend proxy or use the conversion logic

4. **Missing Authorization headers:**
   - Any HTTP Request nodes calling `/api/assets/` must include:
     ```javascript
     headers: {
       'Authorization': 'Bearer e41d510ce6ed6e9c7f602fea860f2591cc7ec75fe63e448336a97c4b73898646'
     }
     ```

### Step 3: Validate JSON Structure

```bash
# Validate JSON is well-formed
python3 -c "import json; json.load(open('docs/n8n-workflow-files/finals/SW2 - Pose and Style QA.json'))"
```

### Step 4: Check Node Configuration

**Key Nodes to Verify:**

1. **"Get Pose" HTTP Request node:**
   - URL: `https://admin.littleherolabs.com/api/assets/{{ $json.poseRefKey }}`
   - Method: `GET`
   - Headers: `Authorization: Bearer {token}`

2. **"Reattach (Style QA): Base + Generated" Code node:**
   - Should have updated `downloadToBinary` function
   - Should handle R2 URL conversion

3. **"Pose QA — Build Request1" Code node:**
   - Should have updated `downloadToBinaryPlus` function
   - Should NOT have duplicate catch blocks
   - Should properly close function before `await` statements

---

## Current Tasks

### Immediate (Testing Phase)
1. ✅ Fixed SW2 syntax errors
2. ⏳ **NEXT:** Import updated SW2 workflow into n8n
3. ⏳ Test "Reattach (Style QA): Base + Generated" node
4. ⏳ Test "Pose QA — Build Request1" node
5. ⏳ Verify all workflows complete successfully

### Remaining (After Testing)
- Make GitHub repository private
- Verify all integrations work with private buckets
- Monitor for any errors in production
- Update any remaining documentation

---

## File Structure

### Key Files
```
docs/
├── REMAINING_PRIVATIZATION_STEPS.md       # Overall project status
├── SW2_FIX_SUMMARY.md                      # Details of SW2 fixes
├── SESSION_CONTINUATION_GUIDE.md           # This file
├── n8n-workflow-files/finals/
│   ├── SW2 - Pose and Style QA.json        # Currently being tested
│   ├── LHB - 2.B. - Background Removal.json
│   ├── 2A - Orchestrator.json
│   ├── SW0 - Base Character Generation.json
│   ├── SW1 - Pose Generation.json
│   └── SW3 - Upload.json
└── little-hero-labs-privatization/
    ├── PRIVATIZATION_STATUS.md
    └── MIGRATION_OUTLINE.md

back-end/
├── src/
│   ├── app/api/r2/signed-url/route.ts     # Signed URL API
│   ├── app/api/assets/[...key]/route.ts    # Asset proxy endpoint
│   └── lib/
│       ├── r2-service.ts                   # Signed URL generation
│       └── r2-client.ts                    # Direct R2 API calls
└── wrangler.toml                           # Cloudflare Pages config
```

---

## Common Patterns & Solutions

### Pattern 1: Converting R2 URLs in Code Nodes

**Old Pattern:**
```javascript
const url = `${publicR2Url}/${storageKey}`;
const res = await this.helpers.httpRequest({ method:'GET', url });
```

**New Pattern:**
```javascript
const url = `${publicR2Url}/${storageKey}`;
// Convert R2 URLs to backend proxy
let finalUrl = url;
const backendUrl = 'https://admin.littleherolabs.com';
const backendToken = 'e41d510ce6ed6e9c7f602fea860f2591cc7ec75fe63e448336a97c4b73898646';

if (url.includes('.r2.dev') || url.includes('.r2.cloudflarestorage.com') || url.includes('pub-92cec53654f84771956bc84dfea65baa')) {
  const urlMatch = url.match(/^https?:\/\/[^\/]+\/(.+)$/);
  if (urlMatch) {
    const storageKey = urlMatch[1];
    finalUrl = `${backendUrl}/api/assets/${storageKey}`;
  }
}

const headers = {};
if (finalUrl.includes('/api/assets/')) {
  headers['Authorization'] = `Bearer ${backendToken}`;
}

const res = await this.helpers.httpRequest({ 
  method:'GET', 
  url: finalUrl,
  headers: headers 
});
```

### Pattern 2: HTTP Request Node Configuration

**For backend proxy endpoints:**
- URL: `https://admin.littleherolabs.com/api/assets/{{ $json.storageKey }}`
- Method: `GET`
- Send Headers: `true`
- Headers:
  - `Authorization`: `Bearer e41d510ce6ed6e9c7f602fea860f2591cc7ec75fe63e448336a97c4b73898646`

---

## Testing Checklist

Before testing SW2, verify:

- [ ] JSON is valid (no syntax errors)
- [ ] `downloadToBinary` function exists and converts R2 URLs
- [ ] `downloadToBinaryPlus` function exists and converts R2 URLs
- [ ] No duplicate catch blocks
- [ ] No `};` at end of functions (should be `}`)
- [ ] Functions are properly closed before `await` statements
- [ ] "Get Pose" node uses backend proxy endpoint
- [ ] All HTTP Request nodes include Authorization header

---

## Error Patterns to Watch For

1. **"await is only valid in async functions"**
   - **Cause:** Function not properly closed before `await` statements
   - **Fix:** Ensure function ends with `}` before top-level `await`

2. **"URL is not defined"**
   - **Cause:** Using `new URL()` in n8n environment
   - **Fix:** Use regex-based URL parsing instead

3. **"403 Forbidden" or "401 Unauthorized"**
   - **Cause:** Missing Authorization header or wrong account ID
   - **Fix:** Verify Authorization header and account ID matches R2 bucket account

4. **"Failed to download image"**
   - **Cause:** R2 URL not converted to backend proxy
   - **Fix:** Update download functions to convert R2 URLs

---

## Next Steps After Successful Testing

1. **Commit and push** updated workflows
2. **Make GitHub repository private**
3. **Monitor** production workflows for errors
4. **Document** any edge cases or issues found
5. **Update** any remaining workflows if issues are found

---

## Important Notes

- **n8n Code nodes** with `mode: "runOnceForEachItem"` automatically wrap code in an async context, so `await` at top level is valid
- **S3 nodes** in n8n work with private buckets if credentials are configured correctly
- **Backend proxy** is preferred over signed URLs for n8n workflows (more reliable, simpler)
- **Signed URLs** are used for external services (like Bria AI) that need publicly accessible URLs

---

## Contact Points

- **Backend API:** `https://admin.littleherolabs.com`
- **R2 Buckets:** `little-hero-assets`, `little-hero-orders`
- **Cloudflare Pages Projects:** `little-hero-labs-admin`, `little-hero-labs`

---

**Last Updated:** 2025-11-05  
**Status:** Ready for SW2 re-testing after syntax fixes

