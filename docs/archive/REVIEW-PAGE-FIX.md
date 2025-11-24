# Review Page Filter Fix

## Issue

After implementing the dual-track label system, orders were not appearing in the correct tabs on the Review page (http://localhost:4321/review).

### Affected Orders

**Not appearing in Review Poses tab:**
- LUCA-NEW-04 (First Review - Review Poses)
- LUCA-NEW-02 (First Review - Review Poses)

**Not appearing in Review Pages tab:**
- LUCA-NEW-01 (First Review - Review Pages)

**Correctly appearing in Secondary Review tab:**
- LUCA-NEW-03 (Second Review - Review Poses) ✅

## Root Cause

The review page filter functions in `back-end/src/lib/review-page-filters.ts` were still using the old `order.status` field instead of the new `order.workflowStatus` field introduced in the dual-track label system.

### What Changed

When we implemented the dual-track label system, we split the status into:
- `workflowStatus` - Where the order is in the production workflow
- `technicalStatus` - Technical issues/errors (optional)
- `status` - Backward compatibility field (deprecated)

The review page filters were checking `order.status` which now contains the backward compatibility value (technicalStatus || workflowStatus), causing incorrect filtering.

## Fix Applied

Updated all filter functions in `back-end/src/lib/review-page-filters.ts` to use `order.workflowStatus` instead of `order.status`:

### Changes Made

1. **Line 46** - `shouldShowInReviewPoses()`:
   ```typescript
   // Before:
   const isNotInQueue = order.phase !== OrderPhase.IN_QUEUE && 
                        order.status !== DisplayStatus.IN_QUEUE;
   
   // After:
   const isNotInQueue = order.phase !== OrderPhase.IN_QUEUE && 
                        order.workflowStatus !== DisplayStatus.IN_QUEUE;
   ```

2. **Line 56** - `shouldShowInReviewPoses()`:
   ```typescript
   // Before:
   const isReviewPosesStatus = order.status === DisplayStatus.REVIEW_POSES &&
                               order.phase !== OrderPhase.IN_QUEUE;
   
   // After:
   const isReviewPosesStatus = order.workflowStatus === DisplayStatus.REVIEW_POSES &&
                               order.phase !== OrderPhase.IN_QUEUE;
   ```

3. **Line 104** - `shouldShowInReviewBackgrounds()`:
   ```typescript
   // Before:
   const isReviewBackgroundsStatus = order.status === DisplayStatus.REVIEW_BACKGROUNDS &&
                                      order.phase !== OrderPhase.IN_QUEUE;
   
   // After:
   const isReviewBackgroundsStatus = order.workflowStatus === DisplayStatus.REVIEW_BACKGROUNDS &&
                                      order.phase !== OrderPhase.IN_QUEUE;
   ```

4. **Line 154** - `shouldShowInReviewPages()`:
   ```typescript
   // Before:
   const isReviewPagesStatus = order.status === DisplayStatus.REVIEW_PAGES &&
                               order.phase !== OrderPhase.IN_QUEUE;
   
   // After:
   const isReviewPagesStatus = order.workflowStatus === DisplayStatus.REVIEW_PAGES &&
                               order.phase !== OrderPhase.IN_QUEUE;
   ```

5. **Line 264** - `getCardLabel()`:
   ```typescript
   // Before:
   if (order.status === DisplayStatus.IN_QUEUE || 
       order.phase === OrderPhase.IN_QUEUE ||
       isInWorkflowProcessing(order)) {
   
   // After:
   if (order.workflowStatus === DisplayStatus.IN_QUEUE || 
       order.phase === OrderPhase.IN_QUEUE ||
       isInWorkflowProcessing(order)) {
   ```

## Testing

After the fix, verify that:

1. ✅ LUCA-NEW-04 appears in "Review Poses" tab
2. ✅ LUCA-NEW-02 appears in "Review Poses" tab
3. ✅ LUCA-NEW-01 appears in "Review Pages" tab
4. ✅ LUCA-NEW-03 appears in "Secondary Review" tab (already working)

## Files Modified

- `back-end/src/lib/review-page-filters.ts` - Updated 5 references from `order.status` to `order.workflowStatus`

## Related Documentation

- `docs/LABEL-SYSTEM-IMPLEMENTATION-COMPLETE.md` - Dual-track label system implementation
- `docs/LABEL-SYSTEM-AUDIT.md` - Original audit and design

## Prevention

When adding new filter logic or status checks:
1. Always use `order.workflowStatus` for workflow position checks
2. Use `order.technicalStatus` for error/technical issue checks
3. Only use `order.status` for backward compatibility (deprecated)

---

**Fix Applied**: 2025-01-23  
**Status**: ✅ Complete  
**Verified**: Ready for testing

