# Phase 3: Order Linking & Duplication - Detailed Implementation Plan

## Overview

Phase 3 implements the ability to create new revision orders that are linked to the original order. This is used when changes require a new print job/shipment, allowing both orders to be tracked individually while maintaining their relationship.

**Complexity**: 7/10 | **Difficulty**: 6/10 | **Time**: 2 weeks | **Risk**: 5/10

## Goals

1. ✅ Add "Create Revision Order" button/functionality in order detail page
2. ✅ Generate new order numbers for revision orders (e.g., `TEST-ORDER-016-R1`)
3. ✅ Implement order linking via `parentOrderId` field
4. ✅ Copy order data and apply pending changes to new order
5. ✅ Create UI to view linked orders (parent and children)
6. ✅ Mark original order as "superseded by" revision order
7. ✅ Create initial manifest for revision order
8. ✅ Handle order number generation logic

## Order Number Generation Strategy

### Format Options

**Option A: Suffix-based** (Recommended)
- Original: `TEST-ORDER-016`
- Revision 1: `TEST-ORDER-016-R1`
- Revision 2: `TEST-ORDER-016-R2`
- **Pros**: Clear relationship, easy to identify
- **Cons**: Requires parsing to find base order

**Option B: Sequential**
- Original: `TEST-ORDER-016`
- Revision 1: `TEST-ORDER-017`
- Revision 2: `TEST-ORDER-018`
- **Pros**: Simple, no parsing needed
- **Cons**: Relationship not obvious from ID

**Decision**: Use **Option A (Suffix-based)** for clarity and traceability.

### Implementation Logic

```typescript
function generateRevisionOrderId(originalOrderId: string, existingRevisions: number): string {
  // Extract base order ID (remove any existing revision suffix)
  const baseOrderId = originalOrderId.replace(/-R\d+$/, '');
  
  // Calculate next revision number
  const nextRevision = existingRevisions + 1;
  
  // Generate new order ID
  return `${baseOrderId}-R${nextRevision}`;
}
```

## User Flow

### Admin Flow - Create Revision Order

1. Admin navigates to order detail page
2. Admin makes field changes (using Phase 2 inline editing)
3. Admin determines change requires new print job/shipment
4. Admin clicks "Create Revision Order" button
5. System shows confirmation dialog:
   - "This will create a new order linked to TEST-ORDER-016"
   - "New order number: TEST-ORDER-016-R1"
   - "Original order will be marked as 'superseded'"
   - "Pending changes will be applied to the new order"
   - "Both orders will remain trackable"
6. Admin confirms
7. System:
   - Generates new order number
   - Creates new order record in manifest
   - Copies all order data from original
   - Applies pending field changes
   - Links orders via `parentOrderId` and `supersededBy`
   - Sets new order status to initial stage
   - Marks original order as "superseded by TEST-ORDER-016-R1"
   - Creates initial manifest for new order
8. Admin is redirected to new order detail page
9. Admin processes new order through workflows normally
10. Both orders remain visible and linked in UI

### Viewing Linked Orders

1. Admin views order detail page
2. If order has parent or children, a "Related Orders" section appears
3. Shows:
   - Parent order (if this is a revision): "Revision of TEST-ORDER-016"
   - Child orders (if this has revisions): "Has 1 revision: TEST-ORDER-016-R1"
4. Admin can click to navigate to related orders

## Files to Create

### 1. Order Number Generation Service
**File**: `back-end/src/lib/order-number-generator.ts`

**Purpose**: Generate revision order numbers and manage order relationships

**Implementation**:

```typescript
/**
 * Generate a revision order ID from an original order ID
 * Format: {originalOrderId}-R{revisionNumber}
 * Example: TEST-ORDER-016 -> TEST-ORDER-016-R1
 */
export function generateRevisionOrderId(
  originalOrderId: string,
  existingRevisionCount: number = 0
): string {
  // Remove any existing revision suffix to get base order ID
  const baseOrderId = originalOrderId.replace(/-R\d+$/i, '');
  
  // Calculate next revision number
  const nextRevision = existingRevisionCount + 1;
  
  // Generate new order ID
  return `${baseOrderId}-R${nextRevision}`;
}

/**
 * Extract base order ID from a revision order ID
 * Example: TEST-ORDER-016-R1 -> TEST-ORDER-016
 */
export function getBaseOrderId(orderId: string): string {
  return orderId.replace(/-R\d+$/i, '');
}

/**
 * Check if an order ID is a revision
 */
export function isRevisionOrder(orderId: string): boolean {
  return /-R\d+$/i.test(orderId);
}

/**
 * Get revision number from order ID
 * Returns 0 if not a revision
 */
export function getRevisionNumber(orderId: string): number {
  const match = orderId.match(/-R(\d+)$/i);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Find all revision orders for a given base order ID
 * This queries R2 to find all manifests with matching base order ID
 */
export async function findRevisionOrders(
  baseOrderId: string
): Promise<string[]> {
  // Implementation will query R2 for all orders starting with baseOrderId
  // and ending with -R{number}
  // This is a helper for determining existing revision count
  // Full implementation in order-linking service
  return [];
}
```

---

### 2. Order Linking Service
**File**: `back-end/src/lib/order-linking.ts`

**Purpose**: Create revision orders, link them, and manage relationships

**Implementation**:

```typescript
import { getObject, putObject, listObjects, R2_ORDERS_BUCKET } from './r2-client';
import { buildManifestKey } from './r2-service';
import { generateRevisionOrderId, getBaseOrderId } from './order-number-generator';

export interface OrderRelationship {
  parentOrderId: string | null;
  childOrderIds: string[];
  supersededBy: string | null;
  supersedes: string | null;
}

/**
 * Find all revision orders for a base order
 */
export async function findRevisionOrders(baseOrderId: string): Promise<string[]> {
  const PROJECT_NS = 'book-mvp-simple-adventure';
  const prefix = `${PROJECT_NS}/orders/`;
  
  // List all orders
  const res = await listObjects(R2_ORDERS_BUCKET, { prefix });
  const allKeys = (res.Contents || []).map(o => o.Key).filter(Boolean) as string[];
  
  // Filter for manifests
  const manifestKeys = allKeys.filter(key => key.includes('/manifests/') && key.endsWith('.json'));
  
  // Extract order IDs from manifest keys
  const orderIds = new Set<string>();
  manifestKeys.forEach(key => {
    // Pattern: book-mvp-simple-adventure/orders/{orderId}/manifests/{stage}-manifest.json
    const match = key.match(/\/orders\/([^/]+)\//);
    if (match) {
      orderIds.add(match[1]);
    }
  });
  
  // Filter for revisions of the base order
  const baseId = getBaseOrderId(baseOrderId);
  const revisions = Array.from(orderIds).filter(id => {
    const idBase = getBaseOrderId(id);
    return idBase === baseId && id !== baseId; // Same base, but not the original
  });
  
  return revisions.sort(); // Sort for consistent ordering
}

/**
 * Get order relationship information
 */
export async function getOrderRelationship(orderId: string): Promise<OrderRelationship> {
  // Try to load any manifest to get relationship info
  const manifestKeys = ['2a', '2b', '3'];
  let manifest: any = null;
  
  for (const stage of manifestKeys) {
    const key = buildManifestKey(orderId, stage as any);
    const res = await getObject(R2_ORDERS_BUCKET, key);
    if (res.ok) {
      manifest = await res.json();
      break;
    }
  }
  
  if (!manifest) {
    return {
      parentOrderId: null,
      childOrderIds: [],
      supersededBy: null,
      supersedes: null
    };
  }
  
  const parentOrderId = manifest.order?.parentOrderId || null;
  const supersededBy = manifest.order?.supersededBy || null;
  
  // Find child orders (revisions of this order)
  const baseOrderId = getBaseOrderId(orderId);
  const childOrderIds = await findRevisionOrders(baseOrderId);
  
  // Find what this order supersedes (if it's a revision)
  const supersedes = parentOrderId || null;
  
  return {
    parentOrderId,
    childOrderIds: childOrderIds.filter(id => id !== orderId), // Exclude self
    supersededBy,
    supersedes
  };
}

/**
 * Create a revision order from an original order
 */
export async function createRevisionOrder(
  originalOrderId: string,
  fieldChanges: Record<string, any>,
  changedBy?: string
): Promise<{
  newOrderId: string;
  manifest: any;
}> {
  // Load original order manifest
  const manifestKeys = ['2a', '2b', '3'];
  let originalManifest: any = null;
  let manifestKey: string | null = null;
  
  for (const stage of manifestKeys) {
    const key = buildManifestKey(originalOrderId, stage as any);
    const res = await getObject(R2_ORDERS_BUCKET, key);
    if (res.ok) {
      originalManifest = await res.json();
      manifestKey = key;
      break;
    }
  }
  
  if (!originalManifest) {
    throw new Error(`Original order manifest not found: ${originalOrderId}`);
  }
  
  // Find existing revisions to determine next revision number
  const baseOrderId = getBaseOrderId(originalOrderId);
  const existingRevisions = await findRevisionOrders(baseOrderId);
  const revisionCount = existingRevisions.length;
  
  // Generate new order ID
  const newOrderId = generateRevisionOrderId(originalOrderId, revisionCount);
  
  // Create new manifest by copying original
  const newManifest = JSON.parse(JSON.stringify(originalManifest));
  
  // Update order information
  newManifest.order.orderId = newOrderId;
  newManifest.order.parentOrderId = originalOrderId;
  newManifest.order.supersededBy = null; // New order doesn't supersede anything yet
  newManifest.order.revisionCount = revisionCount + 1;
  newManifest.order.revisionRequested = false; // Reset for new order
  newManifest.order.revisionLocked = false;
  
  // Apply field changes
  if (fieldChanges.characterSpecs) {
    newManifest.order.characterSpecs = {
      ...newManifest.order.characterSpecs,
      ...fieldChanges.characterSpecs
    };
  }
  if (fieldChanges.bookSpecs) {
    newManifest.order.bookSpecs = {
      ...newManifest.order.bookSpecs,
      ...fieldChanges.bookSpecs
    };
  }
  if (fieldChanges.orderDetails) {
    newManifest.order.orderDetails = {
      ...newManifest.order.orderDetails,
      ...fieldChanges.orderDetails
    };
  }
  
  // Reset workflow to initial stage
  newManifest.workflow = {
    currentStage: '1-text-generation',
    nextWorkflow: '2-character-generation',
    requiresHumanReview: false
  };
  
  // Reset review stages
  newManifest.reviewStages = {
    preBria: { status: 'pending' },
    postBria: { status: 'pending' },
    postPdf: { status: 'pending' }
  };
  
  // Reset poses and entries (will be regenerated)
  newManifest.poses = {
    total: newManifest.poses?.total || 13,
    approved: 0,
    exhausted: 0,
    retried: 0,
    failed: 0,
    needingReview: 0
  };
  newManifest.entries = [];
  
  // Clear edit history (new order, fresh start)
  newManifest.editHistory = [];
  
  // Add creation note
  newManifest.revisionNote = {
    createdAt: new Date().toISOString(),
    createdFrom: originalOrderId,
    createdBy: changedBy || null,
    reason: 'Revision order created due to customer change request requiring new print job'
  };
  
  // Update schema version if needed
  newManifest.schema = 'lhb.run-manifest@v2.0';
  newManifest.runStamp = new Date().toISOString();
  
  // Save new manifest to R2 (use 2a manifest as initial)
  const newManifestKey = buildManifestKey(newOrderId, '2a');
  const manifestJson = JSON.stringify(newManifest, null, 2);
  await putObject(
    R2_ORDERS_BUCKET,
    newManifestKey,
    manifestJson,
    'application/json'
  );
  
  // Update original order to mark it as superseded
  originalManifest.order.supersededBy = newOrderId;
  const originalManifestJson = JSON.stringify(originalManifest, null, 2);
  await putObject(
    R2_ORDERS_BUCKET,
    manifestKey!,
    originalManifestJson,
    'application/json'
  );
  
  console.log(`[Order Linking] Created revision order ${newOrderId} from ${originalOrderId}`);
  
  return {
    newOrderId,
    manifest: newManifest
  };
}
```

---

### 3. Related Orders Component
**File**: `back-end/src/components/orders/related-orders.tsx`

**Purpose**: Display linked orders (parent and children) in order detail page

**Implementation**:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, ArrowRight, Package } from 'lucide-react';
import { getOrderRelationship, type OrderRelationship } from '@/lib/order-linking';

interface RelatedOrdersProps {
  orderId: string;
}

export function RelatedOrders({ orderId }: RelatedOrdersProps) {
  const router = useRouter();
  const [relationship, setRelationship] = useState<OrderRelationship | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRelationship() {
      try {
        const rel = await getOrderRelationship(orderId);
        setRelationship(rel);
      } catch (error) {
        console.error('Error loading order relationship:', error);
      } finally {
        setLoading(false);
      }
    }
    loadRelationship();
  }, [orderId]);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
    );
  }

  if (!relationship || (!relationship.parentOrderId && relationship.childOrderIds.length === 0)) {
    return null; // No relationships to show
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Link2 className="h-5 w-5 text-gray-600" />
        <h3 className="text-sm font-semibold text-gray-900">Related Orders</h3>
      </div>
      
      <div className="space-y-3">
        {/* Parent Order */}
        {relationship.parentOrderId && (
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-xs text-blue-900 font-medium">Revision of</p>
                <p className="text-sm text-blue-700">{relationship.parentOrderId}</p>
              </div>
            </div>
            <button
              onClick={() => router.push(`/orders/${relationship.parentOrderId}`)}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
        
        {/* Child Orders (Revisions) */}
        {relationship.childOrderIds.length > 0 && (
          <div>
            <p className="text-xs text-gray-600 mb-2">
              Has {relationship.childOrderIds.length} revision{relationship.childOrderIds.length !== 1 ? 's' : ''}:
            </p>
            <div className="space-y-2">
              {relationship.childOrderIds.map((childId) => (
                <div
                  key={childId}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-gray-600" />
                    <p className="text-sm text-gray-900">{childId}</p>
                  </div>
                  <button
                    onClick={() => router.push(`/orders/${childId}`)}
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-700 font-medium"
                  >
                    View <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Superseded By */}
        {relationship.supersededBy && (
          <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-yellow-600" />
              <div>
                <p className="text-xs text-yellow-900 font-medium">Superseded by</p>
                <p className="text-sm text-yellow-700">{relationship.supersededBy}</p>
              </div>
            </div>
            <button
              onClick={() => router.push(`/orders/${relationship.supersededBy}`)}
              className="flex items-center gap-1 text-sm text-yellow-600 hover:text-yellow-700 font-medium"
            >
              View <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Files to Modify

### 1. Order Type Definition
**File**: `back-end/src/types/order.ts`

**Current State**: Has `editHistory`, `revisionCount`, etc. from Phase 1/2

**Changes Required**:

Add to `Order` interface (after existing revision fields):
```typescript
  parentOrderId?: string | null;
  supersededBy?: string | null;
  childOrderIds?: string[];
  revisionNote?: {
    createdAt: string;
    createdFrom: string;
    createdBy?: string | null;
    reason: string;
  };
```

---

### 2. Order Detail Page - Add Create Revision Button
**File**: `back-end/src/app/orders/[orderId]/page.tsx`

**Current State**: Shows order details, has inline editing from Phase 2

**Changes Required**:

1. **Import components** (after line 14):
```tsx
import { RelatedOrders } from '@/components/orders/related-orders';
import { createRevisionOrder } from '@/lib/order-linking';
```

2. **Add state for revision dialog** (after existing state, around line 22):
```tsx
const [revisionDialog, setRevisionDialog] = useState<{
  isOpen: boolean;
  pendingChanges: Record<string, any>;
  onConfirm: () => Promise<void>;
} | null>(null);
```

3. **Add Related Orders component** (after order header, around line 180):
```tsx
{/* Related Orders */}
<RelatedOrders orderId={order.orderId} />
```

4. **Add Create Revision Order button** (in order actions section, around line 250):
```tsx
{/* Create Revision Order Button */}
{order.status !== 'shipped' && order.status !== 'delivered' && (
  <button
    onClick={handleCreateRevisionOrder}
    className="inline-flex items-center px-4 py-2 border border-orange-300 rounded-md shadow-sm text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
  >
    <Package className="h-4 w-4 mr-2" />
    Create Revision Order
  </button>
)}
```

5. **Add handleCreateRevisionOrder function** (after handleFieldSave, around line 200):
```tsx
const handleCreateRevisionOrder = async () => {
  if (!order) return;
  
  // Check if there are pending changes (from inline editing)
  // For now, we'll create revision with current order state
  // In future, could track pending changes separately
  
  // Show confirmation dialog
  setRevisionDialog({
    isOpen: true,
    pendingChanges: {}, // Could track pending changes here
    onConfirm: async () => {
      try {
        const result = await fetch(`/api/orders/${order.orderId}/create-revision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Could include pending field changes here
            fieldChanges: {}
          })
        });
        
        if (!result.ok) {
          const error = await result.json();
          throw new Error(error.error || 'Failed to create revision order');
        }
        
        const data = await result.json();
        // Redirect to new order
        router.push(`/orders/${data.newOrderId}`);
      } catch (error: any) {
        console.error('Error creating revision order:', error);
        alert(`Failed to create revision order: ${error.message}`);
        setRevisionDialog(null);
      }
    }
  });
};
```

6. **Add revision confirmation dialog** (before closing div, around line 460):
```tsx
{/* Revision Order Confirmation Dialog */}
{revisionDialog && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Create Revision Order
      </h3>
      
      <div className="space-y-4 mb-6">
        <p className="text-sm text-gray-700">
          This will create a new order linked to <strong>{order.orderId}</strong>.
        </p>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-900 font-medium mb-1">New Order Number:</p>
          <p className="text-sm text-yellow-800">
            {order.orderId.replace(/-R\d+$/, '')}-R{/* Calculate next revision number */}
          </p>
        </div>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-900">
            <strong>Original order</strong> will be marked as "superseded" but will remain visible for reference.
          </p>
        </div>
        
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-sm text-gray-700">
            Both orders will be trackable individually, and you can navigate between them using the "Related Orders" section.
          </p>
        </div>
      </div>
      
      <div className="flex gap-3 justify-end">
        <button
          onClick={() => setRevisionDialog(null)}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={revisionDialog.onConfirm}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700"
        >
          Create Revision Order
        </button>
      </div>
    </div>
  </div>
)}
```

---

### 3. API Route: Create Revision Order
**File**: `back-end/src/app/api/orders/[orderId]/create-revision/route.ts` (NEW FILE)

**Purpose**: Handle revision order creation

**Implementation**:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createRevisionOrder } from '@/lib/order-linking';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const body = await request.json();
    const { fieldChanges = {} } = body;
    
    // Validate orderId
    if (!orderId) {
      return NextResponse.json(
        { error: 'Missing orderId' },
        { status: 400 }
      );
    }
    
    // Create revision order
    const result = await createRevisionOrder(
      orderId,
      fieldChanges,
      null // TODO: Add admin auth in future
    );
    
    console.log(`[Create Revision API] Created revision order ${result.newOrderId} from ${orderId}`);
    
    return NextResponse.json({
      success: true,
      newOrderId: result.newOrderId,
      originalOrderId: orderId,
      message: `Revision order ${result.newOrderId} created successfully`
    });
  } catch (error: any) {
    console.error('[Create Revision API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create revision order' },
      { status: 500 }
    );
  }
}
```

---

### 4. Manifest to Order Conversion
**File**: `back-end/src/app/api/orders/[orderId]/route.ts`

**Current State**: `manifestToOrder` function converts manifest to Order type

**Changes Required**:

In `manifestToOrder` function, add relationship fields (after existing fields, around line 106):
```typescript
  // Extract order relationship information
  const parentOrderId = orderData.parentOrderId || null;
  const supersededBy = orderData.supersededBy || null;
  const revisionNote = orderData.revisionNote || null;
```

Add to return object:
```typescript
    parentOrderId: parentOrderId,
    supersededBy: supersededBy,
    revisionNote: revisionNote,
```

**Note**: `childOrderIds` will be loaded separately via the `getOrderRelationship` function in the RelatedOrders component, as it requires querying R2 for all orders.

---

### 5. Orders List - Show Revision Indicator
**File**: `back-end/src/components/orders/orders-table.tsx`

**Current State**: Displays order list

**Changes Required**:

Add revision indicator in order row (around line 120, in the order row rendering):
```tsx
{/* Order ID with revision indicator */}
<div className="flex items-center gap-2">
  <span className="font-medium text-gray-900">{order.orderId}</span>
  {order.orderId.match(/-R\d+$/i) && (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
      Revision
    </span>
  )}
  {order.supersededBy && (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
      Superseded
    </span>
  )}
</div>
```

Update `OrderListItem` type in `back-end/src/types/order.ts`:
```typescript
export interface OrderListItem {
  orderId: string;
  platform: string;
  firstName: string;
  lastName: string;
  status: string;
  orderDate: string;
  characterHash?: string;
  supersededBy?: string | null; // Add this
}
```

---

## Testing Checklist

### Unit Tests
- [ ] Order number generation creates correct format
- [ ] Order number generation handles existing revisions
- [ ] Base order ID extraction works correctly
- [ ] Revision detection works
- [ ] Order linking service finds revision orders
- [ ] Order linking service creates revision correctly
- [ ] Related orders component displays correctly

### Integration Tests
- [ ] Create revision order → new manifest created in R2
- [ ] Create revision order → original order marked as superseded
- [ ] Create revision order → orders are linked correctly
- [ ] View related orders → parent and children displayed
- [ ] Navigate between related orders → routing works
- [ ] Revision order has correct initial state
- [ ] Revision order applies field changes correctly

### Manual Testing
- [ ] Click "Create Revision Order" → dialog appears
- [ ] Confirm creation → new order created
- [ ] Redirect to new order → order detail page loads
- [ ] View original order → shows "Superseded by" indicator
- [ ] View revision order → shows "Revision of" indicator
- [ ] Click related order link → navigates correctly
- [ ] Orders list shows revision badges
- [ ] Orders list shows superseded badges

---

## Edge Cases to Handle

1. **No manifest found**: Return clear error, don't create revision
2. **Multiple manifests**: Use most recent (2B > 2A > 3)
3. **Revision of revision**: Handle nested revisions (TEST-ORDER-016-R1-R1)
4. **Concurrent revisions**: Handle race conditions when creating multiple revisions
5. **Missing fields in original**: Copy with defaults, don't fail
6. **Invalid order ID format**: Validate before creating revision
7. **R2 upload failure**: Rollback original order update if new order creation fails

---

## Dependencies

### External Libraries
- None new (uses existing React, Next.js, Tailwind CSS)

### Internal Dependencies
- Phase 1 & 2 components (inline editing, confirmation dialogs)
- `@/lib/r2-client` - For R2 operations
- `@/lib/r2-service` - For manifest operations
- `@/lib/order-number-generator` - NEW (created in this phase)
- `@/lib/order-linking` - NEW (created in this phase)

---

## Migration Considerations

### Existing Orders
- Orders without `parentOrderId` or `supersededBy` will work fine (optional fields)
- `manifestToOrder` function handles missing relationship fields gracefully
- No data migration needed

### Manifest Schema
- Relationship fields are additive (doesn't break existing manifests)
- Old manifests without relationship fields will continue to work
- New revision orders will have relationship fields populated

---

## Rollback Plan

If Phase 3 needs to be rolled back:

1. **Remove UI components**: Delete `related-orders.tsx`
2. **Remove services**: Delete `order-number-generator.ts` and `order-linking.ts`
3. **Remove API endpoint**: Delete `create-revision/route.ts`
4. **Revert order detail page**: Remove "Create Revision Order" button and Related Orders section
5. **Revert type changes**: Remove relationship fields from Order type (optional fields, so safe)
6. **Manifests**: Relationship fields in manifests are additive, won't break anything if ignored

**Note**: Revision orders that were created will remain in R2, but won't be linked or displayed. This is safe.

---

## Success Metrics

- ✅ Admin can create revision orders
- ✅ Revision orders have correct order numbers
- ✅ Orders are properly linked (parent/child)
- ✅ Related orders are visible in UI
- ✅ Navigation between related orders works
- ✅ Original orders are marked as superseded
- ✅ Revision orders start at correct initial stage
- ✅ No errors in console
- ✅ No breaking changes to existing functionality

---

## Future Enhancements

1. **Bulk revision creation**: Create multiple revisions at once
2. **Revision comparison**: Side-by-side view of original vs. revision
3. **Revision history timeline**: Visual timeline of all revisions
4. **Auto-link detection**: Automatically detect and link related orders
5. **Revision notes**: Allow admins to add notes when creating revisions

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-15  
**Status**: Ready for Implementation

