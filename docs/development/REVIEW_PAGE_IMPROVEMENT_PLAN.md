# Review Page Improvement Plan

## Overview

This document outlines the plan to improve the Review Page (`/review`) to provide admins with a better workflow for managing orders that require human intervention. The current implementation only shows orders with flags, but the new implementation will organize orders by stage and show all orders that need human review, regardless of flag status.

## Current State

### Current Implementation
- Shows orders with flags in First Review or Second Review phases
- Filters out orders that are "Proof Ready" or "Book Ready"
- Groups orders by review stage (preBria, postBria, postPdf) but only shows those with flags
- Uses a simple "stages" view that groups by flagged items

### Current Limitations
1. **Too simplistic**: Only shows orders with flags, missing orders that need approval but have no flags
2. **No stage-based organization**: Doesn't clearly separate orders by which stage they're in
3. **No workflow visibility**: Doesn't show orders that are approved but waiting to be sent to next stage
4. **Missing Secondary Review**: No dedicated tab for customer revision requests

## Desired State

### Four Tabs
1. **Review Poses** - Orders in preBria stage requiring review
2. **Review Backgrounds** - Orders in postBria stage requiring review
3. **Review Pages** - Orders in postPdf stage requiring review
4. **Secondary Review** - Orders in SECOND_REVIEW phase (customer revision requests)

### Card Label Logic
Each order card should display one of the following labels in the same position:
- **A) "{count} Flagged"** - When there are flagged items (e.g., "3 Flagged")
- **B) "Ready for Approval"** - When there are no flags but the stage is not yet approved
- **C) "Approved"** - When the stage is approved but not yet sent to next stage
- **D) "Ready for [Next Stage]"** - When approved and waiting to be sent to next stage (with obvious visual indicator)

### Order Visibility Logic

#### When Orders Appear on Review Page
- Orders appear in the appropriate tab based on their current review stage
- Orders appear whether they have flags or not (human approval is always required)
- Orders remain visible until they move to the next workflow stage

#### When Orders Disappear
- Orders temporarily disappear while processing (e.g., after sending to next stage)
- Orders reappear in the next stage tab when processing completes
- Orders that go to print never return (unless customer requests revision)

#### When Orders Never Appear
- Orders in queue or during n8n workflow processing
- Orders that are completed/shipped
- Orders that are sent to print (unless customer requests revision)

## Detailed Workflow

### Stage 1: Review Poses (preBria)

**When Order Appears:**
- After character generation workflow completes
- Order is in `preBria` stage
- Order has `reviewStages.preBria.status !== 'approved'`

**Card Label Logic:**
- If `flags.preBria > 0`: Show "{count} Flagged"
- Else if `reviewStages.preBria.status !== 'approved'`: Show "Ready for Approval"
- Else if `reviewStages.preBria.status === 'approved'`: Show "Approved" or "Ready for Review Backgrounds"

**When Order Disappears:**
- Admin clicks "Send to Review Backgrounds" (or equivalent button)
- Order enters background removal workflow
- Temporarily disappears from Review page

**When Order Reappears:**
- After background removal workflow completes
- Appears in "Review Backgrounds" tab

### Stage 2: Review Backgrounds (postBria)

**When Order Appears:**
- After background removal workflow completes
- Order is in `postBria` stage
- Order has `reviewStages.postBria.status !== 'approved'`
- Previous stage (`preBria`) must be approved

**Card Label Logic:**
- If `flags.postBria > 0`: Show "{count} Flagged"
- Else if `reviewStages.postBria.status !== 'approved'`: Show "Ready for Approval"
- Else if `reviewStages.postBria.status === 'approved'`: Show "Approved" or "Ready for Review Pages"

**When Order Disappears:**
- Admin clicks "Send to Review Pages" (or equivalent button)
- Order enters page generation workflow
- Temporarily disappears from Review page

**When Order Reappears:**
- After page generation workflow completes
- Appears in "Review Pages" tab

### Stage 3: Review Pages (postPdf)

**When Order Appears:**
- After page generation workflow completes
- Order is in `postPdf` stage
- Order has `reviewStages.postPdf.status !== 'approved'`
- Previous stages (`preBria`, `postBria`) must be approved

**Card Label Logic:**
- If `flags.postPdf > 0`: Show "{count} Flagged"
- Else if `reviewStages.postPdf.status !== 'approved'`: Show "Ready for Approval"
- Else if `reviewStages.postPdf.status === 'approved'`: Show "Approved" or "Ready for Customer"

**When Order Disappears:**
- Admin clicks "Send Proof to Customer" (or equivalent button)
- Order enters customer approval workflow
- Disappears from Review page

**When Order Reappears:**
- Only if customer requests revision
- Appears in "Secondary Review" tab

### Stage 4: Secondary Review

**When Order Appears:**
- Customer requests revision (order has `revisionCount >= 1`)
- Order is in `SECOND_REVIEW` phase
- Order has `DisplayStatus` indicating revision needed

**Card Label Logic:**
- If any flags exist: Show "{count} Flagged"
- Else if not approved: Show "Ready for Approval"
- Else if approved: Show "Approved" or "Ready for Print"

**Special Behavior:**
- Simplified workflow - no multi-stage process
- Just fix flagged items, approve, and send to print
- Once sent to print, order never returns to Review page

**When Order Disappears:**
- Admin clicks "Send to Print"
- Order goes to print production
- Never returns to Review page

## Technical Implementation Details

### Data Structures

#### Order Filtering Logic
```typescript
// For Review Poses tab
function shouldShowInReviewPoses(order: OrderListItem): boolean {
  // Must be in preBria stage
  const isInPreBriaStage = order.reviewStages?.preBria?.status !== 'approved';
  
  // Must not be in queue or processing
  const isNotProcessing = order.status !== OrderStatus.AI_GENERATION_IN_PROGRESS;
  const isNotInQueue = order.phase !== OrderPhase.IN_QUEUE;
  
  // Must not be completed
  const isNotCompleted = order.status !== OrderStatus.COMPLETED;
  
  return isInPreBriaStage && isNotProcessing && isNotInQueue && isNotCompleted;
}

// For Review Backgrounds tab
function shouldShowInReviewBackgrounds(order: OrderListItem): boolean {
  // Must be in postBria stage
  const isInPostBriaStage = order.reviewStages?.postBria?.status !== 'approved';
  
  // PreBria must be approved
  const preBriaApproved = order.reviewStages?.preBria?.status === 'approved';
  
  // Must not be processing
  const isNotProcessing = !isInWorkflowProcessing(order);
  
  return isInPostBriaStage && preBriaApproved && isNotProcessing;
}

// For Review Pages tab
function shouldShowInReviewPages(order: OrderListItem): boolean {
  // Must be in postPdf stage
  const isInPostPdfStage = order.reviewStages?.postPdf?.status !== 'approved';
  
  // Previous stages must be approved
  const preBriaApproved = order.reviewStages?.preBria?.status === 'approved';
  const postBriaApproved = order.reviewStages?.postBria?.status === 'approved';
  
  // Must not be processing
  const isNotProcessing = !isInWorkflowProcessing(order);
  
  return isInPostPdfStage && preBriaApproved && postBriaApproved && isNotProcessing;
}

// For Secondary Review tab
function shouldShowInSecondaryReview(order: OrderListItem): boolean {
  // Must be in SECOND_REVIEW phase
  const isSecondReview = order.phase === OrderPhase.SECOND_REVIEW;
  
  // Must have revisionCount >= 1
  const hasRevision = (order.revisionCount || 0) >= 1;
  
  // Must not be sent to print
  const notSentToPrint = order.status !== OrderStatus.CUSTOMER_APPROVED && 
                         order.status !== OrderStatus.PENDING_PRINT;
  
  return isSecondReview && hasRevision && notSentToPrint;
}
```

#### Card Label Logic
```typescript
function getCardLabel(order: OrderListItem, stage: 'preBria' | 'postBria' | 'postPdf' | 'secondary'): string {
  const flagSummary = getOrderFlagSummary(order);
  const stageKey = stage === 'secondary' ? getActiveStageForSecondaryReview(order) : stage;
  const stageStatus = order.reviewStages?.[stageKey]?.status;
  const flagCount = stage === 'secondary' 
    ? flagSummary.total 
    : flagSummary[stageKey] || 0;
  
  // A) Has flags
  if (flagCount > 0) {
    return `${flagCount} Flagged`;
  }
  
  // B) No flags, not approved
  if (stageStatus !== 'approved') {
    return 'Ready for Approval';
  }
  
  // C) Approved, determine next stage
  if (stageStatus === 'approved') {
    if (stage === 'preBria') {
      return 'Ready for Review Backgrounds';
    } else if (stage === 'postBria') {
      return 'Ready for Review Pages';
    } else if (stage === 'postPdf') {
      return 'Ready for Customer';
    } else if (stage === 'secondary') {
      return 'Ready for Print';
    }
  }
  
  return 'Approved'; // Fallback
}
```

### UI Components

#### Tab Structure
```typescript
interface ReviewTab {
  id: 'poses' | 'backgrounds' | 'pages' | 'secondary';
  label: string;
  description: string;
  icon: string;
  filterFunction: (order: OrderListItem) => boolean;
  getCardLabel: (order: OrderListItem) => string;
}
```

#### Card Component Updates
- Add visual indicator for "Ready for [Next Stage]" state (e.g., yellow border, icon)
- Show flag count badge when flags exist
- Show "Ready for Approval" badge when no flags but not approved
- Show "Approved" badge when approved
- Show "Ready for [Next Stage]" with prominent styling when approved and waiting

### State Management

#### Order Status Tracking
- Track which stage each order is currently in
- Track approval status for each stage
- Track flag counts for each stage
- Track workflow processing status (to hide orders temporarily)

#### Real-time Updates
- Update card labels when flags are added/removed
- Update card labels when stages are approved
- Remove orders from tab when sent to next stage
- Add orders to next tab when workflow completes

## Step-by-Step Build Plan

### Phase 1: Data Layer & Logic Functions

#### Step 1.1: Create Filter Functions
- [ ] Create `shouldShowInReviewPoses()` function
- [ ] Create `shouldShowInReviewBackgrounds()` function
- [ ] Create `shouldShowInReviewPages()` function
- [ ] Create `shouldShowInSecondaryReview()` function
- [ ] Add unit tests for each filter function

#### Step 1.2: Create Label Logic Functions
- [ ] Create `getCardLabel()` function with all label logic
- [ ] Create helper function `getNextStageName()` to determine next stage
- [ ] Add unit tests for label logic

#### Step 1.3: Create Tab Configuration
- [ ] Define `ReviewTab` interface
- [ ] Create tab configuration array with all 4 tabs
- [ ] Map each tab to its filter function and label function

### Phase 2: UI Component Updates

#### Step 2.1: Update Review Page Structure
- [ ] Replace current stage grouping with tab-based structure
- [ ] Add tab navigation component
- [ ] Implement tab switching logic
- [ ] Ensure each tab shows appropriate orders

#### Step 2.2: Update Order Card Component
- [ ] Add label display logic to card component
- [ ] Implement visual indicators for different states
- [ ] Add "Ready for [Next Stage]" styling
- [ ] Ensure labels update in real-time

#### Step 2.3: Add Empty States
- [ ] Create empty state for each tab when no orders
- [ ] Add helpful messaging for each empty state
- [ ] Ensure empty states are visually distinct

### Phase 3: Integration & Workflow

#### Step 3.1: Integrate with Workflow Actions
- [ ] Update "Send to Next Stage" buttons to hide orders temporarily
- [ ] Add logic to show orders in next tab when workflow completes
- [ ] Ensure orders don't appear in multiple tabs simultaneously

#### Step 3.2: Real-time Updates
- [ ] Ensure card labels update when flags change
- [ ] Ensure card labels update when stages are approved
- [ ] Ensure orders move between tabs correctly
- [ ] Test with multiple orders in different stages

#### Step 3.3: Secondary Review Special Handling
- [ ] Implement simplified workflow for Secondary Review
- [ ] Ensure Secondary Review doesn't go through multi-stage process
- [ ] Add "Send to Print" button for Secondary Review
- [ ] Ensure orders never return after sending to print

### Phase 4: Testing & Refinement

#### Step 4.1: Unit Tests
- [ ] Test filter functions with various order states
- [ ] Test label logic with all combinations
- [ ] Test tab switching and order grouping

#### Step 4.2: Integration Tests
- [ ] Test complete workflow from Review Poses → Review Backgrounds → Review Pages
- [ ] Test Secondary Review workflow
- [ ] Test order visibility during workflow processing
- [ ] Test real-time updates

#### Step 4.3: UI/UX Testing
- [ ] Test tab navigation and visual clarity
- [ ] Test card label visibility and readability
- [ ] Test "Ready for [Next Stage]" indicators
- [ ] Test responsive design on different screen sizes

#### Step 4.4: Edge Cases
- [ ] Test orders with no flags but need approval
- [ ] Test orders that are approved but waiting
- [ ] Test orders that are processing
- [ ] Test orders that go to print
- [ ] Test customer revision requests

### Phase 5: Documentation & Cleanup

#### Step 5.1: Code Documentation
- [ ] Document filter functions
- [ ] Document label logic
- [ ] Document tab structure
- [ ] Update inline comments

#### Step 5.2: User Documentation
- [ ] Update user guide with new Review Page workflow
- [ ] Document what each tab shows
- [ ] Document card label meanings
- [ ] Document workflow transitions

#### Step 5.3: Code Cleanup
- [ ] Remove old filtering logic
- [ ] Remove unused components
- [ ] Refactor duplicate code
- [ ] Optimize performance

## Implementation Notes

### Key Considerations

1. **Order State Tracking**: We need to accurately track which stage each order is in and whether it's currently processing. This may require checking workflow status or order status fields.

2. **Temporary Disappearance**: Orders should disappear when sent to next stage and reappear when workflow completes. This may require:
   - Checking workflow completion status
   - Polling for order updates
   - WebSocket updates (future enhancement)

3. **Label Updates**: Card labels must update in real-time when:
   - Flags are added/removed
   - Stages are approved
   - Orders are sent to next stage

4. **Secondary Review**: This is a simplified workflow that doesn't go through the multi-stage process. Orders in Secondary Review should:
   - Show all flags regardless of stage
   - Allow approval of entire order (not per-stage)
   - Have a single "Send to Print" action

5. **Performance**: With potentially many orders, we need to:
   - Efficiently filter orders for each tab
   - Only render visible orders
   - Cache order data appropriately

### Dependencies

- `OrderListItem` type from `@/types/order`
- `getOrderFlagSummary()` from `@/lib/review-state`
- `OrderPhase` and phase utilities from `@/constants/phases`
- `DisplayStatus` and status utilities from `@/constants/statuses`
- Review stage status from `order.reviewStages`

### Breaking Changes

- Current Review Page filtering logic will be replaced
- Current stage grouping will be replaced with tabs
- Card display logic will change significantly

### Migration Path

1. Implement new logic alongside old logic
2. Add feature flag to switch between old and new
3. Test thoroughly with real data
4. Switch to new implementation
5. Remove old code after verification

## Success Criteria

1. ✅ Orders appear in correct tab based on their current stage
2. ✅ Orders appear whether they have flags or not (if they need approval)
3. ✅ Card labels accurately reflect order state
4. ✅ Orders disappear temporarily during workflow processing
5. ✅ Orders reappear in next tab when workflow completes
6. ✅ Secondary Review tab works correctly for customer revisions
7. ✅ Real-time updates work correctly
8. ✅ No orders appear in multiple tabs simultaneously
9. ✅ Empty states are helpful and clear
10. ✅ Performance is acceptable with many orders

## Future Enhancements

1. **WebSocket Updates**: Real-time updates without polling
2. **Bulk Actions**: Approve multiple orders at once
3. **Filters**: Filter by customer, platform, date range
4. **Sorting**: Sort by various criteria within each tab
5. **Search**: Search across all tabs
6. **Notifications**: Notify admins when orders need attention
7. **Analytics**: Track time spent in each stage
8. **Workflow Status**: Show workflow processing status more clearly

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-12  
**Status**: Planning Phase

