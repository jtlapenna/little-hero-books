# Review Page Filter Logic - Edge Case Fix

**Date:** November 24, 2025  
**Issue:** Orders with `workflowStatus = REVIEW_PAGES` not appearing in the Review Pages tab

## Problem

The review page filter functions (`shouldShowInReviewPoses`, `shouldShowInReviewBackgrounds`, `shouldShowInReviewPages`) were too strict in their validation. They required explicit approval of previous review stages, even when the `workflowStatus` already indicated the order was at that stage.

### Specific Issue

For example, `shouldShowInReviewPages` required:
- `preBriaStatus === APPROVED`
- `postBriaStatus === APPROVED`
- `workflowStatus === REVIEW_PAGES`

However, if an order had `workflowStatus = REVIEW_PAGES`, the `calculateWorkflowStatus` function had already verified these prerequisites. The redundant check in the filter function created an edge case where:

1. Orders manually advanced to a review stage (for testing)
2. Orders with malformed or incomplete `reviewStages` data
3. Orders that went through non-standard workflow paths

...would have the correct `workflowStatus` but fail the filter checks and not appear in the review tabs.

### Example

Order `LUCA-NEW-01`:
- Had `workflowStatus = REVIEW_PAGES` (correctly calculated)
- Had `phase = FIRST_REVIEW` (correct)
- But did not appear in the "Review Pages" tab because the filter required explicit `preBriaApproved` and `postBriaApproved` checks

## Solution

Made the filter functions more defensive and trusting of the `workflowStatus` field:

1. **Primary check**: If `workflowStatus` matches the expected status for that tab, show the order
2. **Secondary checks**: Still validate phase, processing state, completion state, etc.
3. **Soft validation**: Only check `reviewStages` as a soft validation (if they exist and are not approved)

### Code Changes

Updated three filter functions in `/back-end/src/lib/review-page-filters.ts`:

1. `shouldShowInReviewPoses` - Now trusts `workflowStatus === REVIEW_POSES`
2. `shouldShowInReviewBackgrounds` - Now trusts `workflowStatus === REVIEW_BACKGROUNDS`
3. `shouldShowInReviewPages` - Now trusts `workflowStatus === REVIEW_PAGES`

Each function now follows this pattern:

```typescript
export function shouldShowInReview[Stage](order: OrderListItem): boolean {
  // 1. Check if workflowStatus matches this stage
  const isReview[Stage]Status = order.workflowStatus === DisplayStatus.REVIEW_[STAGE] &&
                                order.phase !== OrderPhase.IN_QUEUE;
  
  // If workflowStatus doesn't match, don't show in this tab
  if (!isReview[Stage]Status) {
    return false;
  }
  
  // 2. Validate other conditions (not processing, not completed, etc.)
  const isNotProcessing = ...;
  const isNotCompleted = ...;
  const notSentToPrint = ...;
  const isFirstReview = ...;
  
  // 3. Soft validation of reviewStages (if they exist)
  const [stage]NotApproved = !order.reviewStages?.[stage] || 
                             (order.reviewStages.[stage].status !== APPROVED);
  
  return isNotProcessing && isReview[Stage]Status && isNotCompleted && 
         notSentToPrint && isFirstReview && [stage]NotApproved;
}
```

## Benefits

1. **More robust**: Handles edge cases and test data inconsistencies
2. **Trusts the source of truth**: `workflowStatus` is calculated by `calculateWorkflowStatus`, which already validates prerequisites
3. **Reduces redundancy**: Eliminates duplicate validation logic
4. **Better for testing**: Allows manual advancement of orders for testing without breaking the UI
5. **Defensive coding**: Handles malformed or incomplete data gracefully

## Testing

After this fix:
- Orders with `workflowStatus = REVIEW_POSES` will appear in "Review Poses" tab
- Orders with `workflowStatus = REVIEW_BACKGROUNDS` will appear in "Review Backgrounds" tab
- Orders with `workflowStatus = REVIEW_PAGES` will appear in "Review Pages" tab
- Orders with `phase = SECOND_REVIEW` will appear in "Secondary Review" tab

All regardless of whether `reviewStages` are perfectly set up, as long as the `workflowStatus` is correct.

## Related Files

- `/back-end/src/lib/review-page-filters.ts` - Filter functions (MODIFIED)
- `/back-end/src/lib/status-display.ts` - Status calculation logic (unchanged)
- `/back-end/src/app/review/page.tsx` - Review page component (unchanged)

## Previous Fix

This builds on the previous fix documented in `REVIEW-PAGE-FIX.md`, which updated the filter functions to use `order.workflowStatus` instead of the deprecated `order.status` field.

