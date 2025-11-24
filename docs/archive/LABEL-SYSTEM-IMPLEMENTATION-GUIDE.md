# Label System Implementation Guide

## Quick Reference: All Possible Labels

### Workflow Labels (Developer B - Always Primary)

| Label | Code | Color | When to Show |
|-------|------|-------|--------------|
| New | `DisplayStatus.NEW` | Gray | Order just created |
| In Queue | `DisplayStatus.IN_QUEUE` | Gray | Queued, waiting for workflow |
| Review Poses | `DisplayStatus.REVIEW_POSES` | Light Blue | preBria stage needs review |
| Review Backgrounds | `DisplayStatus.REVIEW_BACKGROUNDS` | Medium Blue | postBria stage needs review |
| Review Pages | `DisplayStatus.REVIEW_PAGES` | Dark Blue | postPdf stage needs review |
| Proof Ready | `DisplayStatus.PROOF_READY` | Green | All stages approved, ready to send to customer |
| Awaiting Customer | `DisplayStatus.AWAITING_CUSTOMER` | Purple | Customer proof sent, awaiting response |
| Needs Revision | `DisplayStatus.NEEDS_REVISION` | Orange | Customer requested changes |
| Ready to Print | `DisplayStatus.READY_TO_PRINT` | Yellow | Customer approved, ready for print |
| Printing | `DisplayStatus.PRINTING` | Indigo | Sent to print service (Lulu) |
| Shipped | `DisplayStatus.SHIPPED` | Green | Order shipped |
| Delivered | `DisplayStatus.DELIVERED` | Emerald | Order delivered |

### Technical Labels (Developer A - Secondary, Only When Issues Exist)

| Label | Code | Color | Detection Logic |
|-------|------|-------|-----------------|
| Missing Manifest | `DisplayStatus.MISSING_MANIFEST` | Purple | No manifest URLs exist |
| Max Retries | `DisplayStatus.MAX_RETRIES` | Red | `retry_count >= 3` |
| Workflow Timeout | `DisplayStatus.WORKFLOW_TIMEOUT` | Red | `error_type = 'workflow_timeout'` |
| API Error | `DisplayStatus.API_ERROR` | Red | `error_type = 'api_error'` |
| Stuck Processing | `DisplayStatus.STUCK_PROCESSING` | Red | Processing >30 min |
| Not Picked Up | `DisplayStatus.NOT_PICKED_UP` | Blue | Queued >60 min |
| Multiple Errors (N) | `DisplayStatus.MULTIPLE_ERRORS` | Red | 2+ errors detected |
| Manual Review Required | `DisplayStatus.MANUAL_REVIEW_REQUIRED` | Orange | `execution_status = 'error_requires_manual_review'` |
| Action Required | `DisplayStatus.ACTION_REQUIRED` | Red | Generic error fallback |

---

## Code Changes Required

### 1. Update Type Definitions

**File**: `back-end/src/lib/status-display.ts`

**Current**:
```typescript
export interface DisplayStatusMetadata {
  status: DisplayStatus;
  phase: OrderPhase;
  errors?: DisplayStatus[];
}
```

**New**:
```typescript
export interface DisplayStatusMetadata {
  workflowStatus: DisplayStatus;      // NEW: Always present
  technicalStatus?: DisplayStatus;    // NEW: Only when errors exist
  phase: OrderPhase;
  errors?: DisplayStatus[];
  
  // Deprecated (keep for backward compatibility during migration)
  status: DisplayStatus;              // Will be removed in Phase 3
}
```

---

### 2. Update Status Calculation Function

**File**: `back-end/src/lib/status-display.ts`

**Function**: `getDisplayStatusForOrder()`

**Changes**:

```typescript
export function getDisplayStatusForOrder(order: Order): DisplayStatusMetadata {
  // 1. Detect all technical errors first
  const detectedErrors = detectOrderErrors(order);
  const technicalStatus = detectedErrors.length > 1 
    ? DisplayStatus.MULTIPLE_ERRORS 
    : (detectedErrors.length === 1 ? detectedErrors[0] : undefined);

  // 2. Calculate workflow status (ignoring errors)
  const workflowStatus = calculateWorkflowStatus(order);

  // 3. Calculate phase based on workflow status
  const phase = getPhaseForDisplayStatus(workflowStatus, order.revisionCount);

  // 4. Return both statuses
  return {
    workflowStatus,
    technicalStatus,
    phase,
    errors: detectedErrors.length > 0 ? detectedErrors : undefined,
    
    // Backward compatibility (deprecated)
    status: technicalStatus || workflowStatus
  };
}
```

**New Helper Function**:

```typescript
/**
 * Calculate workflow status (ignoring technical errors)
 * This is the "where is the order in the production workflow" status
 */
function calculateWorkflowStatus(order: Order): DisplayStatus {
  // Defensive check
  if (!order) {
    return DisplayStatus.IN_QUEUE;
  }

  const stageStatuses = collectStageStatuses(order);
  const allStagesApproved = stageStatuses.length === 3 && stageStatuses.every(stageIsApproved);
  const customerApprovalStatus = order.customerApprovalStatus;
  const rawStatus = order.status;

  // Priority order (WITHOUT error checks):
  
  // 1. Delivered/Shipped
  if (rawStatus && (DELIVERED_STATUSES.has(rawStatus) || order.luluStatus === LuluStatus.DELIVERED)) {
    return DisplayStatus.DELIVERED;
  }
  if (rawStatus && (SHIPPED_STATUSES.has(rawStatus) || order.luluStatus === LuluStatus.SHIPPED)) {
    return DisplayStatus.SHIPPED;
  }

  // 2. Customer revision requested
  if (customerApprovalStatus === CustomerApprovalStatus.REVISION_REQUESTED || 
      (rawStatus && REVISION_STATUSES.has(rawStatus))) {
    // Determine which stage needs revision
    const preBriaStatus = normalizeStageStatus(order.reviewStages?.preBria?.status);
    const postBriaStatus = normalizeStageStatus(order.reviewStages?.postBria?.status);
    const postPdfStatus = normalizeStageStatus(order.reviewStages?.postPdf?.status);
    
    if (!stageIsApproved(preBriaStatus)) return DisplayStatus.REVIEW_POSES;
    if (!stageIsApproved(postBriaStatus)) return DisplayStatus.REVIEW_BACKGROUNDS;
    if (!stageIsApproved(postPdfStatus)) return DisplayStatus.REVIEW_PAGES;
    return DisplayStatus.NEEDS_REVISION;
  }

  // 3. Awaiting customer
  const proofSent = customerApprovalStatus === CustomerApprovalStatus.PENDING ||
                   rawStatus === OrderStatus.PENDING_CUSTOMER_APPROVAL ||
                   Boolean(order.customerApprovalRequestedAt);
  if (proofSent) {
    return DisplayStatus.AWAITING_CUSTOMER;
  }

  // 4. All stages approved
  if (allStagesApproved) {
    if (customerApprovalStatus === CustomerApprovalStatus.APPROVED || 
        rawStatus === OrderStatus.CUSTOMER_APPROVED) {
      // Check if sent to print
      const isWithLulu = order.luluStatus && (
        order.luluStatus === LuluStatus.CREATED ||
        order.luluStatus === LuluStatus.IN_PRODUCTION ||
        // ... other Lulu statuses
      );
      if (rawStatus === OrderStatus.PENDING_PRINT || isWithLulu) {
        return DisplayStatus.PRINTING;
      }
      return DisplayStatus.READY_TO_PRINT;
    }
    return DisplayStatus.PROOF_READY;
  }

  // 5. Review stages
  const preBriaStatus = normalizeStageStatus(order.reviewStages?.preBria?.status);
  const postBriaStatus = normalizeStageStatus(order.reviewStages?.postBria?.status);
  const postPdfStatus = normalizeStageStatus(order.reviewStages?.postPdf?.status);

  if (!stageIsApproved(postPdfStatus) && stageIsApproved(preBriaStatus) && stageIsApproved(postBriaStatus)) {
    return DisplayStatus.REVIEW_PAGES;
  }
  if (!stageIsApproved(postBriaStatus) && stageIsApproved(preBriaStatus)) {
    return DisplayStatus.REVIEW_BACKGROUNDS;
  }
  
  const preBriaHasProgress = preBriaStatus !== normalizeStageStatus(ReviewStageStatus.PENDING) &&
                             preBriaStatus !== ReviewStageStatus.READY;
  if (!stageIsApproved(preBriaStatus) && preBriaHasProgress) {
    return DisplayStatus.REVIEW_POSES;
  }

  // 6. New/In Queue
  const hasAnyStageProgress = stageStatuses.some(
    status => status !== normalizeStageStatus(ReviewStageStatus.PENDING)
  );
  if (rawStatus && NEW_STATUSES.has(rawStatus) && !hasAnyStageProgress) {
    const isActuallyQueued = order.executionStatus === 'ready_for_processing' && order.queuedAt;
    return isActuallyQueued ? DisplayStatus.IN_QUEUE : DisplayStatus.NEW;
  }

  // 7. Default fallback
  return DisplayStatus.IN_QUEUE;
}
```

---

### 3. Create New UI Component

**File**: `back-end/src/components/ui/dual-status-badge.tsx` (NEW FILE)

```tsx
import { cn } from '@/lib/utils';
import { DisplayStatus } from '@/constants/statuses';
import { StatusBadge } from './status-badge';

interface DualStatusBadgeProps {
  workflowStatus: DisplayStatus;
  technicalStatus?: DisplayStatus;
  revisionCount?: number;
  errors?: DisplayStatus[];
  className?: string;
  layout?: 'horizontal' | 'vertical'; // For responsive layouts
}

/**
 * DualStatusBadge Component
 * 
 * Displays both workflow status (primary) and technical status (secondary).
 * Workflow status is always shown, technical status only appears when issues exist.
 * 
 * @param workflowStatus - Where the order is in the production workflow (always shown)
 * @param technicalStatus - Technical issues/errors (only shown when present)
 * @param revisionCount - Revision count for color coding (yellow for second review)
 * @param errors - Array of error types (for multiple errors badge)
 * @param className - Additional CSS classes
 * @param layout - Layout direction (horizontal by default, vertical for mobile)
 */
export function DualStatusBadge({ 
  workflowStatus, 
  technicalStatus, 
  revisionCount, 
  errors,
  className,
  layout = 'horizontal'
}: DualStatusBadgeProps) {
  const containerClass = layout === 'horizontal' 
    ? 'inline-flex items-center gap-2'
    : 'flex flex-col items-start gap-1';

  return (
    <div className={cn(containerClass, className)}>
      {/* Primary: Workflow Status (always shown) */}
      <StatusBadge 
        status={workflowStatus} 
        revisionCount={revisionCount}
      />
      
      {/* Secondary: Technical Status (only if issues exist) */}
      {technicalStatus && (
        <StatusBadge 
          status={technicalStatus}
          errors={errors}
        />
      )}
    </div>
  );
}
```

---

### 4. Update Order Detail Page

**File**: `back-end/src/app/orders/[orderId]/page.tsx`

**Line 854** (current):
```tsx
<StatusBadge 
  status={lifecycleStatus.status} 
  revisionCount={order?.revisionCount}
  errors={lifecycleStatus.errors}
/>
```

**Change to**:
```tsx
<DualStatusBadge
  workflowStatus={lifecycleStatus.workflowStatus}
  technicalStatus={lifecycleStatus.technicalStatus}
  revisionCount={order?.revisionCount}
  errors={lifecycleStatus.errors}
/>
```

**Add import**:
```tsx
import { DualStatusBadge } from '@/components/ui/dual-status-badge';
```

---

### 5. Update Order List Table

**File**: `back-end/src/components/orders/orders-table.tsx`

**Find status column rendering** (approximate line 200-250):

**Current**:
```tsx
<StatusBadge 
  status={order.status}
  revisionCount={order.revisionCount}
/>
```

**Change to**:
```tsx
<DualStatusBadge
  workflowStatus={order.status} // Will be order.workflowStatus after migration
  technicalStatus={order.technicalStatus}
  revisionCount={order.revisionCount}
  errors={order.errors}
/>
```

---

### 6. Update Order Mapper

**File**: `back-end/src/lib/order-mapper.ts`

**Update**: Ensure `buildOrderListItem()` includes both statuses:

```typescript
export function buildOrderListItem(order: Order): OrderListItem {
  const display = getDisplayStatusForOrder(order);
  return {
    orderId: order.orderId,
    platform: order.platform,
    firstName: order.customer?.firstName || '',
    lastName: order.customer?.lastName || '',
    
    // New fields
    workflowStatus: display.workflowStatus,
    technicalStatus: display.technicalStatus,
    
    // Deprecated (keep for backward compatibility)
    status: display.status,
    
    rawStatus: order.status,
    phase: display.phase,
    orderDate: order.orderDate,
    characterHash: order.characterHash,
    reviewStages: order.reviewStages,
    customerApprovalStatus: order.customerApprovalStatus ?? null,
    hasFlags: order.hasFlags ?? false,
    flags: order.flags ?? {},
    revisionCount: typeof order.revisionCount === 'number' ? order.revisionCount : 0,
    errors: display.errors,
  };
}
```

---

### 7. Update TypeScript Types

**File**: `back-end/src/types/order.ts`

**Update `OrderListItem` interface**:

```typescript
export interface OrderListItem {
  orderId: string;
  platform: string;
  firstName: string;
  lastName: string;
  
  // New fields
  workflowStatus: DisplayStatus;      // NEW
  technicalStatus?: DisplayStatus;    // NEW
  
  // Deprecated (keep for backward compatibility)
  status: DisplayStatus;
  
  rawStatus: string;
  phase: OrderPhase;
  orderDate: string;
  characterHash?: string;
  reviewStages?: Order['reviewStages'];
  customerApprovalStatus?: string | null;
  hasFlags?: boolean;
  flags?: Record<string, any>;
  revisionCount?: number;
  errors?: DisplayStatus[];
}
```

---

## Testing Checklist

### Unit Tests

**File**: `back-end/src/lib/__tests__/status-display.test.ts` (create if doesn't exist)

```typescript
import { getDisplayStatusForOrder } from '../status-display';
import { DisplayStatus } from '@/constants/statuses';

describe('getDisplayStatusForOrder - Dual Status', () => {
  it('should return workflow status without technical status when no errors', () => {
    const order = createMockOrder({
      reviewStages: {
        preBria: { status: 'ready' },
        postBria: { status: 'pending' },
        postPdf: { status: 'pending' }
      }
    });
    
    const result = getDisplayStatusForOrder(order);
    
    expect(result.workflowStatus).toBe(DisplayStatus.REVIEW_POSES);
    expect(result.technicalStatus).toBeUndefined();
  });

  it('should return both workflow and technical status when error exists', () => {
    const order = createMockOrder({
      reviewStages: {
        preBria: { status: 'ready' },
        postBria: { status: 'pending' },
        postPdf: { status: 'pending' }
      },
      oneManifestUrl: null, // Missing manifest
      manifest2aUrl: null,
      manifest2bUrl: null,
      manifest3Url: null
    });
    
    const result = getDisplayStatusForOrder(order);
    
    expect(result.workflowStatus).toBe(DisplayStatus.REVIEW_POSES);
    expect(result.technicalStatus).toBe(DisplayStatus.MISSING_MANIFEST);
  });

  it('should show MULTIPLE_ERRORS when multiple errors exist', () => {
    const order = createMockOrder({
      reviewStages: {
        preBria: { status: 'ready' },
        postBria: { status: 'pending' },
        postPdf: { status: 'pending' }
      },
      oneManifestUrl: null, // Missing manifest
      retryCount: 3, // Max retries
      executionStatus: 'processing',
      startedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() // 60 min ago (stuck)
    });
    
    const result = getDisplayStatusForOrder(order);
    
    expect(result.workflowStatus).toBe(DisplayStatus.REVIEW_POSES);
    expect(result.technicalStatus).toBe(DisplayStatus.MULTIPLE_ERRORS);
    expect(result.errors).toHaveLength(3);
    expect(result.errors).toContain(DisplayStatus.MISSING_MANIFEST);
    expect(result.errors).toContain(DisplayStatus.MAX_RETRIES);
    expect(result.errors).toContain(DisplayStatus.STUCK_PROCESSING);
  });
});
```

### Manual Testing Scenarios

1. **Order at Review Poses with no errors**
   - ✅ Should show: `[Review Poses]`
   - ✅ No technical badge

2. **Order at Review Poses with Missing Manifest**
   - ✅ Should show: `[Review Poses] [Missing Manifest]`

3. **Order at Awaiting Customer with Stuck Processing**
   - ✅ Should show: `[Awaiting Customer] [Stuck Processing]`

4. **Order at Review Backgrounds with 3 errors**
   - ✅ Should show: `[Review Backgrounds] [Multiple Errors (3)]`
   - ✅ Clicking badge should show error list

5. **Order at Printing with no errors**
   - ✅ Should show: `[Printing]`
   - ✅ No technical badge

---

## Migration Path

### Phase 1: Add Dual Status Support (Non-Breaking)
- ✅ Update `DisplayStatusMetadata` interface
- ✅ Update `getDisplayStatusForOrder()` function
- ✅ Add `calculateWorkflowStatus()` helper
- ✅ Keep old `status` field for backward compatibility
- ✅ Deploy to production (no UI changes yet)

### Phase 2: Update UI Components (Gradual)
- ✅ Create `DualStatusBadge` component
- ✅ Update order detail page
- ✅ Test thoroughly
- ✅ Update order list table
- ✅ Test thoroughly
- ✅ Deploy to production

### Phase 3: Cleanup (Optional)
- ✅ Remove deprecated `status` field
- ✅ Update all references to use `workflowStatus`
- ✅ Remove backward compatibility code
- ✅ Deploy to production

---

## Rollback Plan

If issues arise, rollback is simple:

1. **Revert UI components** to use `status` field instead of `workflowStatus`
2. **Keep backend changes** (they maintain backward compatibility)
3. **No data migration needed** (all changes are in code, not database)

---

## Performance Considerations

### Impact: Minimal

- **Additional computation**: One extra function call (`calculateWorkflowStatus()`)
- **Additional rendering**: One extra badge (only when errors exist)
- **Memory impact**: Negligible (one extra field in metadata object)

### Optimization Opportunities

If performance becomes an issue:
- Cache `calculateWorkflowStatus()` results
- Lazy-load error details for `Multiple Errors` badge
- Use React.memo for `DualStatusBadge` component

---

## Documentation Updates Needed

1. **README.md** - Update status badge documentation
2. **DEVELOPER_A_PACKAGE.md** - Document technical labels
3. **DEVELOPER_B_PACKAGE.md** - Document workflow labels
4. **API documentation** - Update status field descriptions

---

## Questions & Answers

### Q: Should we update the database schema?
**A**: No. All changes are in the application layer. Database fields remain unchanged.

### Q: Do we need to migrate existing data?
**A**: No. Status is calculated on-the-fly from existing order fields.

### Q: Will this break existing API consumers?
**A**: No. We maintain backward compatibility by keeping the `status` field.

### Q: Can we add more technical labels later?
**A**: Yes. Just add to `DisplayStatus` enum and update `detectOrderErrors()`.

### Q: Can we add more workflow labels later?
**A**: Yes. Just add to `DisplayStatus` enum and update `calculateWorkflowStatus()`.

---

## Success Metrics

After implementation, we should see:

1. **Reduced admin confusion** - Admins can see both workflow and technical status
2. **Faster issue resolution** - Admins don't need to click into orders to see context
3. **Better monitoring** - Dashboard shows both workflow progress and system health
4. **No information loss** - Both Developer A's and Developer B's labels are visible

---

**Document Version**: 1.0  
**Created**: 2025-01-23  
**Author**: AI Assistant (Developer B Context)  
**Status**: Implementation Guide - Ready for Development

