# Status Tagging System - Admin-Friendly Labels

## Overview

This document describes the admin-friendly status tagging system used throughout the Little Hero Books admin panel. The system provides clear, concise labels (2-3 words) that help admins quickly understand the current state of each order.

## Simplified 5-Phase System

The order lifecycle is organized into **5 distinct phases** with color-coded visual indicators:

| Phase | Label | Description | Color | Icon |
|-------|-------|-------------|-------|------|
| `IN_QUEUE` | **In Queue** | Order submitted, character generation in progress | Grey | ⏳ |
| `FIRST_REVIEW` | **First Review** | First review process - flagging, revising, approving | Blue | 👁️ |
| `AWAITING_CUSTOMER` | **Awaiting Customer** | Proof sent to customer, awaiting response | Purple | ✋ |
| `SECOND_REVIEW` | **Second Review** | Second review after customer revision request | Yellow | 🔍 |
| `SENT_TO_PRINT` | **Sent to Print** | Order sent to print production | Green | 🖨️ |

### Phase Color Scheme

- **In Queue** (Grey): `bg-gray-50`, `text-gray-700`, `border-gray-200`
- **First Review** (Blue): `bg-blue-50`, `text-blue-700`, `border-blue-200`
- **Awaiting Customer** (Purple): `bg-purple-50`, `text-purple-700`, `border-purple-200`
- **Second Review** (Yellow): `bg-yellow-50`, `text-yellow-700`, `border-yellow-200`
- **Sent to Print** (Green): `bg-green-50`, `text-green-700`, `border-green-200`

## Status Labels

### Main Status Labels

| Status | Label | Description | Color |
|--------|-------|-------------|-------|
| `IN_QUEUE` | **In Queue** | Order submitted and in database, waiting to begin processing | Gray |
| `REVIEW_POSES` | **Review Poses** | Character poses generated, admin review needed before background removal | Blue (first) / Yellow (second) |
| `REVIEW_BACKGROUNDS` | **Review Backgrounds** | Background removal complete, admin review needed before page assembly | Blue (first) / Yellow (second) |
| `REVIEW_PAGES` | **Review Pages** | Page assembly complete, admin review needed before finalization | Blue (first) / Yellow (second) |
| `PROOF_READY` | **Proof Ready** / **Book Ready** | All stages approved, pages finalized, ready to send to customer. Shows "Proof Ready" in first review, "Book Ready" in second review | Green |
| `AWAITING_CUSTOMER` | **Awaiting Customer** | Proof sent to customer, awaiting their response | Purple |
| `NEEDS_REVISION` | **Needs Revision** | Customer requested correction, cycle back through review stages | Orange |
| `READY_TO_PRINT` | **Ready to Print** | Customer approved, ready to send to print | Yellow |
| `PRINTING` | **Printing** | Order sent to print, in production | Indigo |
| `SHIPPED` | **Shipped** | Order shipped to customer | Green |
| `DELIVERED` | **Delivered** | Order delivered to customer | Emerald |
| `ACTION_REQUIRED` | **Action Required** | Error or issue requiring admin attention | Red |

### Review Stage Colors

The three review stages use **varying shades of blue for first review** and **varying shades of yellow for second review** (after customer revision) to help distinguish between them:

#### First Review (revisionCount === 0) - Blue Shades

1. **Review Poses** (Step 1): Lightest blue
   - Background: `bg-blue-50`
   - Text: `text-blue-700`
   - Border: `border-blue-200`

2. **Review Backgrounds** (Step 2): Medium blue
   - Background: `bg-blue-100`
   - Text: `text-blue-800`
   - Border: `border-blue-300`

3. **Review Pages** (Step 3): Darkest blue
   - Background: `bg-blue-200`
   - Text: `text-blue-900`
   - Border: `border-blue-400`

#### Second Review (revisionCount >= 1) - Yellow Shades

1. **Review Poses** (Step 1): Lightest yellow
   - Background: `bg-yellow-50`
   - Text: `text-yellow-700`
   - Border: `border-yellow-200`

2. **Review Backgrounds** (Step 2): Medium yellow
   - Background: `bg-yellow-100`
   - Text: `text-yellow-800`
   - Border: `border-yellow-300`

3. **Review Pages** (Step 3): Darkest yellow
   - Background: `bg-yellow-200`
   - Text: `text-yellow-900`
   - Border: `border-yellow-400`

**Key Decision**: Review stage badges automatically switch from blue to yellow when `revisionCount >= 1`, making it immediately clear whether an order is in its first or second review cycle.

**Additional Label Change**: When status is `PROOF_READY` and `revisionCount >= 1`, the label displays as "Book Ready" instead of "Proof Ready" to indicate the book is ready for print after customer revision.

## Flagged System

### Overview

The flagged system is **separate** from status labels and can coexist with them. Flags indicate items that need attention within a review stage.

### Flagged Badge

- **Component**: `FlaggedBadge`
- **Display**: Shows count of flagged items (e.g., "3 Flagged")
- **Color**: Orange (same as revision status)
- **Visibility**: Only shows when count > 0
- **Location**: Appears alongside status badge

### Flagged Status Flow

Flags can exist at any of the three review stages:
- **Review Poses**: Flags on character poses
- **Review Backgrounds**: Flags on background-removed images
- **Review Pages**: Flags on page images

### Example Display

An order can show both status and flagged badges:
- Status: **Review Backgrounds** (blue badge)
- Flagged: **3 Flagged** (orange badge)

This indicates the order is in the background review stage and has 3 items that need attention.

## Status Flow

### Normal Flow (First Review)

```
1. In Queue (Grey)
   ↓
2. First Review Phase (Blue)
   - Review Poses (lightest blue)
   - Review Backgrounds (medium blue)
   - Review Pages (darkest blue)
   ↓
3. Proof Ready (Green)
   ↓
4. Awaiting Customer (Purple) - Proof sent to customer
   ↓
5a. Sent to Print (Green) - If customer approved
   OR
5b. Second Review Phase (Yellow) - If customer requested revision
```

### Revision Flow (Second Review)

When a customer requests a correction (`NEEDS_REVISION`), the order cycles back through the review stages with **yellow badges**:

```
Awaiting Customer (Purple)
   ↓
Needs Revision (Orange) - Customer requested correction
   ↓
Second Review Phase (Yellow) - All stages reset to Pending
   - Review Poses (lightest yellow)
   - Review Backgrounds (medium yellow)
   - Review Pages (darkest yellow)
   ↓
Proof Ready (Green) - After all stages re-approved
   ↓
Awaiting Customer (Purple) - Proof sent again
   ↓
Sent to Print (Green) - Customer approved (revision used)
```

### Key Workflow Rules

1. **First Review** (revisionCount === 0):
   - All review stage badges use **blue shades**
   - Order appears in **First Review** phase bucket
   - After all 3 stages approved → **Proof Ready** → **Awaiting Customer**
   - After Final Approval clicked → **"Send Proof"** button appears

2. **Customer Approval**:
   - If customer approves → **Sent to Print** (Green)
   - If customer requests revision → **Needs Revision** → All stages reset to Pending

3. **Second Review** (revisionCount >= 1):
   - All review stage badges use **yellow shades**
   - Order appears in **Second Review** phase bucket
   - After all 3 stages re-approved → **Book Ready** (not "Proof Ready") → **Awaiting Customer** → **Sent to Print**
   - After Final Approval clicked → **"Send to Print"** button appears (not "Send Proof")

4. **Stage Approval Rules**:
   - Stages must be approved **sequentially** (Pre-Bria → Post-Bria → Post-PDF)
   - **Cannot approve a stage if flags exist** - all flags must be resolved first
   - Approval state **persists across page refreshes** (stored in Supabase)

5. **Flag Persistence**:
   - Flags persist in R2 manifests (source of truth)
   - Both flag and unflag operations update Supabase flag counts
   - Flags sync correctly across page refreshes and navigation

## Implementation

### Status Constants

Status labels are defined in `back-end/src/constants/statuses.ts`:

```typescript
export enum DisplayStatus {
  IN_QUEUE = 'in_queue',
  REVIEW_POSES = 'review_poses',
  REVIEW_BACKGROUNDS = 'review_backgrounds',
  REVIEW_PAGES = 'review_pages',
  PROOF_READY = 'proof_ready',
  AWAITING_CUSTOMER = 'awaiting_customer',
  NEEDS_REVISION = 'needs_revision',
  READY_TO_PRINT = 'ready_to_print',
  PRINTING = 'printing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  ACTION_REQUIRED = 'action_required'
}
```

### Status Display Logic

Status is calculated in `back-end/src/lib/status-display.ts`:

```typescript
export function getDisplayStatusForOrder(order: Order): DisplayStatusMetadata {
  // Determines status based on:
  // - Order status
  // - Review stage statuses (preBria, postBria, postPdf)
  // - Customer approval status
  // - Flags
  // - Lulu status
  // - Revision count (determines first vs second review)
}

// Phase is determined by getPhaseForDisplayStatus():
function getPhaseForDisplayStatus(displayStatus: DisplayStatus, revisionCount?: number): OrderPhase {
  const isSecondReview = revisionCount >= 1;
  
  // Review stages map to FIRST_REVIEW or SECOND_REVIEW based on revisionCount
  if (displayStatus === REVIEW_POSES || REVIEW_BACKGROUNDS || REVIEW_PAGES || PROOF_READY) {
    return isSecondReview ? OrderPhase.SECOND_REVIEW : OrderPhase.FIRST_REVIEW;
  }
  // ... other phase mappings
}
```

### Phase Assignment

Phases are assigned based on:
- **Display Status**: The calculated status of the order
- **Revision Count**: Determines if we're in first review (blue) or second review (yellow)
- **Customer Approval Status**: Determines if we're awaiting customer or sent to print

### Flagged Badge Component

Flagged badges are displayed using `back-end/src/components/ui/flagged-badge.tsx`:

```typescript
<FlaggedBadge count={flagCount} />
```

### Usage in UI

Status and flagged badges appear together in order lists and detail pages:

```typescript
// StatusBadge automatically uses yellow for review stages when revisionCount >= 1
<div className="flex items-center space-x-2">
  <StatusBadge status={order.status} revisionCount={order.revisionCount} />
  {hasFlags && <FlaggedBadge count={flagCount} />}
</div>
```

**Important**: Always pass `revisionCount` to `StatusBadge` to ensure:
- Correct color display (blue for first review, yellow for second review)
- Correct label display ("Proof Ready" vs "Book Ready" in second review)

## Database Schema

### Review Stages

Stored in `orders.review_stages` (JSONB):
```json
{
  "preBria": {
    "status": "pending" | "approved" | "rejected" | "flagged",
    "reviewedAt": "2025-01-15T10:30:00Z",
    "reviewer": "admin@example.com",
    "comments": "Looks good"
  },
  "postBria": { ... },
  "postPdf": { ... }
}
```

### Flags

Stored in `orders.flags` (JSONB):
```json
{
  "preBria": 2,
  "postBria": 1,
  "postPdf": 0,
  "total": 3
}
```

Also stored as `orders.has_flags` (boolean) for quick queries.

## Best Practices

1. **Status Labels**: Always use the admin-friendly labels (2-3 words max)
2. **Flagged Badges**: Show flagged count alongside status when flags exist
3. **Color Coding**: 
   - Use **blue shades** for first review stages (revisionCount === 0)
   - Use **yellow shades** for second review stages (revisionCount >= 1)
   - This helps admins immediately distinguish first vs second review cycles
4. **Revision Flow**: When customer requests revision:
   - All review stages are **reset to Pending**
   - Order moves to **Second Review** phase (yellow)
   - Review stage badges switch to **yellow colors**
   - Order must go through all 3 stages again in sequence
5. **Status Calculation**: Status is calculated dynamically based on order state, not stored directly
6. **Phase Assignment**: Phase is determined by display status + revisionCount to correctly place orders in First Review vs Second Review buckets
7. **Flag Persistence**: 
   - Flags persist in R2 manifests (source of truth)
   - Both flag and unflag operations update Supabase flag counts
   - Flags sync correctly across page refreshes and navigation
8. **Approval Persistence**: Stage approvals persist in Supabase `review_stages` JSONB field and survive page refreshes
9. **Button Display**: 
   - First Review: After Final Approval → "Send Proof" button
   - Second Review: After Final Approval → "Send to Print" button
   - Logic based on `revisionCount`, not customer approval status
10. **Status Labels**: 
    - "Proof Ready" in first review (revisionCount === 0)
    - "Book Ready" in second review (revisionCount >= 1) when status is PROOF_READY

## Migration Notes

### From Old System

The old system used labels like:
- `NEW` → Now `IN_QUEUE`
- `PENDING` → Now `REVIEW_POSES`, `REVIEW_BACKGROUNDS`, or `REVIEW_PAGES`
- `APPROVED` → Now `PROOF_READY`
- `PROOF_SENT` → Now `AWAITING_CUSTOMER`
- `CORRECTION_REQUESTED` → Now `NEEDS_REVISION`
- `SENT_TO_PRINT` → Now `PRINTING`

### Database Migration

No database migration needed. The system uses existing `review_stages` and `flags` columns. The display logic calculates status from these existing fields.

## Testing

### Status Display Tests

1. **In Queue**: New order with no review progress
2. **Review Poses**: Order with preBria stage pending
3. **Review Backgrounds**: Order with postBria stage pending
4. **Review Pages**: Order with postPdf stage pending
5. **Proof Ready** (First Review): All stages approved, no customer approval yet, revisionCount === 0
6. **Book Ready** (Second Review): All stages approved after customer revision, revisionCount >= 1
7. **Awaiting Customer**: Proof sent to customer
8. **Needs Revision**: Customer requested correction
9. **Ready to Print**: Admin approved, ready to send to print
10. **Printing**: Order sent to print
11. **Shipped**: Order shipped
12. **Delivered**: Order delivered

### Button Display Tests

1. **First Review Final Approval**: After clicking Final Approval, "Send Proof" button appears
2. **Second Review Final Approval**: After clicking Final Approval, "Send to Print" button appears
3. **Button Logic**: Verify buttons appear based on `revisionCount`, not customer approval status

### Flagged Badge Tests

1. **No Flags**: Badge should not appear
2. **Single Flag**: Badge shows "1 Flagged"
3. **Multiple Flags**: Badge shows count (e.g., "3 Flagged")
4. **Status + Flags**: Both badges appear together
5. **Flag Removal**: Badge disappears when flags are cleared

## Future Enhancements

1. **Status Icons**: Add icons to status badges for visual clarity
2. **Status History**: Track status changes over time
3. **Status Notifications**: Notify admins when orders reach certain statuses
4. **Status Filters**: Enhanced filtering by status in order lists
5. **Status Analytics**: Track time spent in each status

## UI/UX Features

The status system is implemented across several UI components and pages. For detailed feature status and implementation tracking, see:

- **`docs/new-planning/back-end/planning/feature_status_pending_and_order_review.md`** - Complete feature tracking for:
  - Pending Reviews page (card/list views, search, sorting)
  - Order Review page (Pre-Bria, Post-Bria, Post-PDF stages)
  - Flag system UI implementation
  - Stage approval workflow
  - Asset management (download, replace, flag)

**Key UI Features**:
- **Card/List Toggle**: Switch between card and list views for scalable order management
- **Search & Sorting**: Filter by order date, customer name, platform
- **Stage Tabs**: Full-width tabs for Pre-Bria, Post-Bria, Post-PDF review stages
- **Flag System**: Visual flag indicators with counts in tabs, lists, and detail pages
- **Stage Approval**: Sequential approval workflow with persistent state
- **Asset Management**: Download, replace, and flag individual assets
- **Status Badges**: Color-coded status indicators throughout the UI

## Implementation Decisions

This section documents the key architectural decisions made during the development of the customer review workflow system. These decisions explain the "why" behind the implementation choices.

### 1. Simplified 5-Phase System

**Decision**: Simplified the order lifecycle from 8 phases to 5 distinct phases with clear color coding.

**Rationale**: 
- Reduces cognitive load for admins
- Makes it immediately clear where an order is in the workflow
- Color coding provides instant visual feedback

**Files Modified**:
- `back-end/src/constants/phases.ts` - Phase enum and color definitions
- `back-end/src/lib/status-display.ts` - Phase assignment logic

### 2. Review Stage Badge Color Switching

**Decision**: Review stage badges (Review Poses, Review Backgrounds, Review Pages) switch from blue to yellow when in second review cycle.

**Rationale**:
- Helps admins immediately distinguish first vs second review cycles
- Visual consistency with phase system (Second Review = Yellow)
- Maintains the same 3-shade system (lightest → darkest) for both colors

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
- `back-end/src/app/api/orders/[orderId]/unflag/route.ts` - Updated to set `isFlagged: false` and update Supabase
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

## Related Documentation

- `docs/new-planning/back-end/planning/feature_status_pending_and_order_review.md` - **UI/UX Features**: Card/list views, search, sorting, and review page functionality
- `docs/new-planning/back-end/human_in_loop_technical_spec.md` - Technical specification for review system
- `docs/new-planning/back-end/ui_ux_specification.md` - UI/UX specification
- `database/migration-status-system.sql` - Database schema for status system
- `DEVELOPER_B_PACKAGE.md` - Developer B workflow documentation
- `back-end/src/constants/phases.ts` - Phase definitions
- `back-end/src/constants/statuses.ts` - Status definitions
- `back-end/src/lib/status-display.ts` - Status calculation logic

## Changelog

### 2025-01-XX - Simplified 5-Phase System & Workflow Refinements
- **Simplified phase system** from 8 phases to 5 phases:
  - In Queue (Grey)
  - First Review (Blue)
  - Awaiting Customer (Purple)
  - Second Review (Yellow)
  - Sent to Print (Green)
- **Review stage badge colors** now switch based on revision count:
  - **Blue shades** for first review (revisionCount === 0)
  - **Yellow shades** for second review (revisionCount >= 1)
- **Phase assignment** now considers revisionCount to correctly place orders in First Review vs Second Review buckets
- **Customer revision workflow**:
  - When customer requests revision, all stages reset to Pending
  - Order moves to Second Review phase (yellow)
  - Review badges switch to yellow colors
  - After re-approval, order can be sent to print
- **Flag persistence** improved:
  - Flags persist in R2 manifests (source of truth)
  - Flag endpoint updates both R2 and Supabase
  - Unflag endpoint now also updates Supabase flag counts (previously missing)
  - Flags sync correctly across page refreshes
- **Approval persistence** improved - stage approvals persist across page refreshes
- **Button display logic** refined:
  - First Review: After Final Approval → "Send Proof" button
  - Second Review: After Final Approval → "Send to Print" button
  - Logic based on `revisionCount` rather than customer approval status
- **Status label updates**:
  - "Proof Ready" shows in first review (revisionCount === 0)
  - "Book Ready" shows in second review (revisionCount >= 1) when status is PROOF_READY

### 2025-01-XX - Initial Implementation
- Added admin-friendly status labels (2-3 words)
- Implemented varying blue shades for review stages
- Created FlaggedBadge component
- Updated status display logic
- Updated order list and detail pages

