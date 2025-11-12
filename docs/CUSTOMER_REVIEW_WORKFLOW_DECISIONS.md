# Customer Review Workflow - Implementation Decisions

## Overview

This document captures all the key decisions and implementations made during the customer review workflow development. It serves as a reference for understanding the current system architecture and design choices.

## Date: 2025-01-XX

## Key Decisions

### 1. Simplified 5-Phase System

**Decision**: Simplified the order lifecycle from 8 phases to 5 distinct phases with clear color coding.

**Rationale**: 
- Reduces cognitive load for admins
- Makes it immediately clear where an order is in the workflow
- Color coding provides instant visual feedback

**Implementation**:
- **In Queue** (Grey): Order submitted, character generation in progress
- **First Review** (Blue): First review process - flagging, revising, approving
- **Awaiting Customer** (Purple): Proof sent to customer, awaiting response
- **Second Review** (Yellow): Second review after customer revision request
- **Sent to Print** (Green): Order sent to print production

**Files Modified**:
- `back-end/src/constants/phases.ts` - Phase enum and color definitions
- `back-end/src/lib/status-display.ts` - Phase assignment logic

### 2. Review Stage Badge Color Switching

**Decision**: Review stage badges (Review Poses, Review Backgrounds, Review Pages) switch from blue to yellow when in second review cycle.

**Rationale**:
- Helps admins immediately distinguish first vs second review cycles
- Visual consistency with phase system (Second Review = Yellow)
- Maintains the same 3-shade system (lightest → darkest) for both colors

**Implementation**:
- First Review (revisionCount === 0): Blue shades
  - Review Poses: `bg-blue-50`, `text-blue-700`, `border-blue-200`
  - Review Backgrounds: `bg-blue-100`, `text-blue-800`, `border-blue-300`
  - Review Pages: `bg-blue-200`, `text-blue-900`, `border-blue-400`
- Second Review (revisionCount >= 1): Yellow shades
  - Review Poses: `bg-yellow-50`, `text-yellow-700`, `border-yellow-200`
  - Review Backgrounds: `bg-yellow-100`, `text-yellow-800`, `border-yellow-300`
  - Review Pages: `bg-yellow-200`, `text-yellow-900`, `border-yellow-400`

**Files Modified**:
- `back-end/src/constants/statuses.ts` - `getStatusColors()` function
- `back-end/src/components/ui/status-badge.tsx` - Added `revisionCount` prop
- All components using `StatusBadge` - Updated to pass `revisionCount`

### 3. Flag Persistence Architecture

**Decision**: Flags are stored in R2 manifests as the source of truth, with Supabase as a display layer.

**Rationale**:
- R2 manifests contain the actual asset metadata
- Supabase provides fast UI queries
- Separation of concerns: data storage vs display

**Implementation**:
- Flags stored in manifest entries: `isFlagged`, `needsReview`, `reviewReason`, `flaggedAt`, `flaggedBy`
- API endpoints (`/api/orders/[orderId]/flag`, `/api/orders/[orderId]/unflag`) update R2 manifests
- `setFlaggedCount()` syncs flag counts to Supabase for UI display
- Components use `manuallyFlaggedRef` to track user-initiated flags across re-renders

**Files Modified**:
- `back-end/src/app/api/orders/[orderId]/flag/route.ts` - New endpoint for flagging
- `back-end/src/app/api/orders/[orderId]/unflag/route.ts` - Updated to set `isFlagged: false`
- `back-end/src/components/stages/pre-bria-stage.tsx` - Flag persistence logic
- `back-end/src/components/stages/post-bria-stage.tsx` - Flag persistence logic
- `back-end/src/components/stages/post-pdf-stage.tsx` - Flag persistence logic
- `back-end/src/lib/review-state.ts` - `setFlaggedCount()` wrapped in try-catch

### 4. Approval Persistence

**Decision**: Stage approvals persist in Supabase `review_stages` JSONB field and survive page refreshes.

**Rationale**:
- Ensures approval state is never lost
- Provides audit trail of approvals
- Enables proper workflow state management

**Implementation**:
- `/api/orders/[orderId]/approve` endpoint validates no flags exist before approval
- `approveStage()` in `approval-store.ts` updates Supabase `review_stages`
- Client-side validation prevents approval if flags exist
- Optimistic UI updates with rollback on failure
- 500ms delay before refetch to ensure persistence

**Files Modified**:
- `back-end/src/app/api/orders/[orderId]/approve/route.ts` - New approval endpoint
- `back-end/src/lib/approval-store.ts` - `approveStage()` function
- `back-end/src/app/orders/[orderId]/page.tsx` - `handleStageApprove()` with validation

### 5. Customer Revision Workflow

**Decision**: When customer requests revision, all review stages reset to Pending and order moves to Second Review phase.

**Rationale**:
- Ensures quality control - all stages must be re-approved
- Prevents partial approvals that could cause issues
- Clear workflow: revision → re-review → re-approval → print

**Implementation**:
- `/api/preview/[orderId]/reject` sets `customer_approval_status` to `revision_requested`
- Increments `revision_count`
- Resets all `review_stages` to `{ status: 'pending' }`
- Order automatically moves to Second Review phase (yellow badges)

**Files Modified**:
- `back-end/src/app/api/preview/[orderId]/reject/route.ts` - Stage reset logic

### 6. Status Workflow Logic

**Decision**: Status display follows a specific priority order to correctly reflect order state.

**Priority Order**:
1. Failure states (ACTION_REQUIRED)
2. Delivered states
3. Shipped states
4. Customer revision requested (NEEDS_REVISION) - **checked early**
5. Proof sent / Awaiting Customer - **checked before allStagesApproved**
6. All stages approved → Check customer approval status
   - If customer approved → Check if sent to print → PRINTING or READY_TO_PRINT
   - If not sent to customer → PROOF_READY
7. Review stages (determine which stage needs review)
8. In Queue (fallback)

**Rationale**:
- Ensures "Proof Ready" appears after first approval, not "Printing"
- "Awaiting Customer" takes priority over "Proof Ready"
- Revision requests are handled early to show correct review stage

**Files Modified**:
- `back-end/src/lib/status-display.ts` - `getDisplayStatusForOrder()` logic reordered

### 7. Button Display Logic

**Decision**: "Send Proof" appears after first "Final Approval", "Send to Print" only appears after customer has used their revision.

**Rationale**:
- First approval → send proof to customer
- After customer revision → can send directly to print
- Prevents premature print submission

**Implementation**:
- `showPrintAction = isApproved && customerRevisionUsed` (revisionCount >= 1)
- "Send Proof" button appears after first approval (revisionCount === 0)
- "Send to Print" button appears only after customer has used revision (revisionCount >= 1)
- Removed dependency on `customerApprovalStatus === 'approved'` for button display

**Files Modified**:
- `back-end/src/components/stages/post-pdf-stage.tsx` - Button display logic

### 8. Manifest Loading Strategy

**Decision**: Load all relevant manifests (2a, 2b, 3) in parallel to ensure complete flag data.

**Rationale**:
- Pre-Bria flags are in manifest 2a
- Post-Bria flags are in manifest 2b (fallback to 2a)
- Post-PDF flags are in manifest 3
- Loading all ensures no flags are missed

**Implementation**:
- `/api/orders/[orderId]` loads manifests 2a, 2b, and 3 in parallel
- Uses correct manifest for each stage's flag data
- Merges data with Supabase taking precedence for `reviewStages`

**Files Modified**:
- `back-end/src/app/api/orders/[orderId]/route.ts` - Parallel manifest loading

### 9. Database Schema Updates

**Decision**: Ensure `orderId` column is always set during insert operations.

**Rationale**:
- Prevents "not-null constraint" violations
- Ensures data integrity
- Supports both Amazon orders and manual/dummy orders

**Implementation**:
- `updateOrderInSupabase()` sets `orderId` in insert payload
- `approveStage()` sets `orderId` when creating new order record
- Update logic prioritizes `amazon_order_id` but falls back to other identifiers

**Files Modified**:
- `back-end/src/lib/supabase-client.ts` - `updateOrderInSupabase()` and `getOrderFromSupabase()`
- `back-end/src/lib/approval-store.ts` - `approveStage()` insert logic

### 10. Error Handling Improvements

**Decision**: Wrap Supabase updates in try-catch to prevent API failures from breaking flag/approval operations.

**Rationale**:
- R2 manifests are source of truth for flags
- Supabase is display layer - failures shouldn't break core functionality
- Better user experience with graceful degradation

**Implementation**:
- `setFlaggedCount()` wrapped in try-catch
- API endpoints handle Supabase failures gracefully
- Error logging for debugging without breaking user flow

**Files Modified**:
- `back-end/src/lib/review-state.ts` - `setFlaggedCount()` error handling
- `back-end/src/lib/api-wrapper.ts` - Enhanced error handling

## Technical Architecture

### Data Flow

```
User Action (Flag/Unflag)
  ↓
API Endpoint (/flag or /unflag)
  ↓
Update R2 Manifest (source of truth)
  ↓
Update Supabase (display layer)
  ↓
UI Updates (optimistic + refetch)
```

### Phase Assignment Flow

```
Order State
  ↓
getDisplayStatusForOrder()
  ↓
getPhaseForDisplayStatus(status, revisionCount)
  ↓
OrderPhase (IN_QUEUE | FIRST_REVIEW | AWAITING_CUSTOMER | SECOND_REVIEW | SENT_TO_PRINT)
```

### Status Calculation Priority

1. Failure states
2. Delivered/Shipped
3. Customer revision requested
4. Awaiting customer
5. All stages approved → customer approval status
6. Individual review stages
7. In Queue

## Testing Considerations

### Flag Persistence
- Flags persist across page refreshes
- Flags persist when navigating between stages
- Flags sync correctly between R2 and Supabase

### Approval Persistence
- Approvals persist across page refreshes
- Approvals block correctly when flags exist
- Stage sequence enforced (Pre-Bria → Post-Bria → Post-PDF)

### Phase Assignment
- Orders in first review show blue badges
- Orders in second review show yellow badges
- Phase buckets correctly group orders

### Customer Revision
- All stages reset to Pending on revision request
- Order moves to Second Review phase
- Badges switch to yellow colors
- Re-approval workflow functions correctly

## Related Documentation

- `docs/STATUS_TAGGING_SYSTEM.md` - Complete status system documentation
- `DEVELOPER_B_PACKAGE.md` - Developer B workflow documentation
- `back-end/src/constants/phases.ts` - Phase definitions
- `back-end/src/constants/statuses.ts` - Status definitions
- `back-end/src/lib/status-display.ts` - Status calculation logic

### 11. Flag Persistence Fix

**Decision**: Unflag endpoint must update Supabase flag counts, not just R2 manifests.

**Rationale**:
- Flag endpoint was updating both R2 and Supabase
- Unflag endpoint was only updating R2, causing UI inconsistencies
- Supabase flag counts are needed for UI display and filtering

**Implementation**:
- Added `setFlaggedCount()` call to unflag endpoint for both postPdf pages and preBria/postBria poses
- Counts flagged items in manifest after unflagging
- Updates Supabase flag counts to match manifest state
- Wrapped in try-catch to prevent API failures from breaking unflag operation

**Files Modified**:
- `back-end/src/app/api/orders/[orderId]/unflag/route.ts` - Added Supabase flag count updates

### 12. Status Label Contextual Display

**Decision**: "Proof Ready" label changes to "Book Ready" in second review cycle.

**Rationale**:
- First review: Book is a "proof" being sent to customer
- Second review: Book has been revised and is ready for print
- Clearer distinction between first and second approval cycles

**Implementation**:
- `getStatusLabel()` accepts optional `revisionCount` parameter
- If `status === PROOF_READY` and `revisionCount >= 1`, returns "Book Ready"
- Otherwise returns "Proof Ready"
- `StatusBadge` component passes `revisionCount` to `getStatusLabel()`

**Files Modified**:
- `back-end/src/constants/statuses.ts` - `getStatusLabel()` function
- `back-end/src/components/ui/status-badge.tsx` - Passes `revisionCount` to `getStatusLabel()`

## Future Considerations

1. **Status History**: Track status changes over time for audit trail
2. **Bulk Operations**: Allow approving multiple stages at once
3. **Notification System**: Alert admins when orders reach certain statuses
4. **Analytics**: Track time spent in each phase
5. **Export**: Export order status data for reporting

