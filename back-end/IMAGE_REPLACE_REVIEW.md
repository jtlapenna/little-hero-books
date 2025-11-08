# Image Replace Implementation Review

## ✅ What Works Well

1. **putObject function** - Correctly implemented with proper signing and error handling
2. **API endpoint structure** - Good validation, error handling, and manifest updates
3. **Download handlers** - Simple and effective, uses existing proxy URLs
4. **Manifest update logic** - Correctly adds replacement history fields
5. **Error handling** - Comprehensive try/catch blocks with user-friendly messages

## ⚠️ Issues Found

### 1. **CRITICAL: Base Character Replacement Will Fail**
**Problem:** Base character (`base-character.png`) is NOT stored in manifest entries. It's a separate file that exists in R2 but isn't tracked in the manifest `entries` array.

**Current behavior:** When user tries to replace base-character, the code looks for `poseNumber: 0` in manifest entries, which won't exist, causing a 404 error.

**Fix needed:** 
- Option A: Handle base-character separately by getting its R2 key from `order.r2Assets.baseCharacter.url` and replacing it directly without manifest update
- Option B: Add base-character to manifest entries (requires workflow changes)
- Option C: Disable base-character replacement for now

**Recommendation:** Option A - handle base-character separately since it's not in manifest entries.

### 2. **Unused Import**
**File:** `back-end/src/app/api/orders/[orderId]/replace-image/route.ts`
**Line 3:** `import { downloadManifest, buildManifestKey } from '@/lib/r2-service';`
**Issue:** `downloadManifest` is imported but never used
**Fix:** Remove unused import

### 3. **Pose Number Extraction Edge Case**
**File:** `back-end/src/components/stages/pre-bria-stage.tsx`
**Issue:** Code extracts pose number from "pose00" -> 0, but pose0 might not exist in manifest entries (manifest shows poseNumber starts at 1)
**Impact:** If pose0 doesn't exist, replacement will fail with 404
**Fix:** Add better error message or handle pose0 specially

### 4. **Refresh Strategy**
**Issue:** Using `window.location.reload()` is heavy-handed and loses user's scroll position
**Better approach:** 
- Pre-Bria: Could use router refresh or refetch order data
- Post-Bria: Already has `onRefresh` callback, but fallback to reload

### 5. **Missing File Type Validation**
**Issue:** No validation that uploaded file is actually an image
**Fix:** Add file type check (e.g., `file.type.startsWith('image/')`)

### 6. **No Loading State**
**Issue:** User doesn't see feedback during upload/replace operation
**Fix:** Add loading spinner/disabled state during async operations

### 7. **Error Message Handling**
**Issue:** If API returns non-JSON error, `await response.json()` will throw
**Fix:** Add try/catch around JSON parsing in error handling

## 📋 Recommended Fixes (Priority Order)

### High Priority
1. **Fix base-character replacement** - Handle separately or disable
2. **Remove unused import** - Clean up code
3. **Add file type validation** - Prevent invalid uploads
4. **Improve error handling** - Handle non-JSON error responses

### Medium Priority
5. **Add loading states** - Better UX during operations
6. **Improve refresh strategy** - Avoid full page reload
7. **Better error messages** - More specific error handling

### Low Priority
8. **Handle pose0 edge case** - If pose0 doesn't exist in manifest

## 🔍 Code Quality Notes

- **TypeScript:** Good use of types, but some `any` types could be more specific
- **Error handling:** Comprehensive but could be more granular
- **Logging:** Good console.log statements for debugging
- **Comments:** Code is well-commented
- **Consistency:** Both Pre-Bria and Post-Bria handlers are consistent

## ✅ Testing Checklist

- [ ] Test download for base-character (Pre-Bria)
- [ ] Test download for poses (Pre-Bria)
- [ ] Test download for poses (Post-Bria)
- [ ] Test replace for base-character (Pre-Bria) - **WILL FAIL CURRENTLY**
- [ ] Test replace for poses (Pre-Bria)
- [ ] Test replace for poses (Post-Bria)
- [ ] Test with invalid file type
- [ ] Test with missing manifest
- [ ] Test with pose that doesn't exist
- [ ] Verify manifest updates correctly
- [ ] Verify replacement history is tracked

