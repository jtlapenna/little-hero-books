# Status System Implementation Details

## Overview
This document provides detailed implementation patterns for the status system, including centralized status management, Supabase integration, and gating logic.

## Architecture: Single Source of Truth

### Core Principle
**Supabase is the single source of truth for order status.** All status reads and writes go through a centralized service.

### Status Service Architecture

```
┌─────────────────────────────────────────┐
│   Status Service (Single Source)        │
│   back-end/src/lib/status-service.ts   │
│                                         │
│   - calculateOrderStatus()             │
│   - updateOrderStatus()                │
│   - getOrderStatus()                   │
│   - syncStatusFromManifest()            │
└─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
┌───────▼────────┐      ┌───────▼────────┐
│   Supabase    │      │   R2 Manifests │
│   (Primary)   │      │   (Fallback)   │
└───────────────┘      └────────────────┘
```

## Implementation Files

### 1. Supabase Client (`back-end/src/lib/supabase-client.ts`)
**Purpose**: Centralized Supabase connection and query utilities

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Order CRUD operations
export async function getOrderFromSupabase(orderId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('orderId', orderId)
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateOrderInSupabase(orderId: string, updates: any) {
  const { data, error } = await supabase
    .from('orders')
    .update({ ...updates, updatedAt: new Date().toISOString() })
    .eq('orderId', orderId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function createOrderInSupabase(order: any) {
  const { data, error } = await supabase
    .from('orders')
    .insert(order)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}
```

### 2. Status Service (`back-end/src/lib/status-service.ts`)
**Purpose**: Centralized status calculation and management

```typescript
import { supabase, getOrderFromSupabase, updateOrderInSupabase } from './supabase-client';
import { getOrderFlagSummary } from './review-state';

/**
 * Calculate order status based on current state
 * This is the SINGLE SOURCE OF TRUTH for status calculation
 */
export async function calculateOrderStatus(orderId: string): Promise<string> {
  // Get order from Supabase (primary) or R2 manifest (fallback)
  let order = await getOrderFromSupabase(orderId).catch(() => null);
  
  if (!order) {
    // Fallback: Load from R2 manifest
    const manifest = await downloadManifest(buildManifestKey(orderId, 'latest'));
    order = manifestToOrder(orderId, manifest);
  }
  
  // 1. Check flags first (highest priority)
  const flagSummary = getOrderFlagSummary(orderId);
  if (flagSummary.total > 0) {
    if (flagSummary.preBria > 0 && order.reviewStages?.preBria?.status !== 'approved') {
      return 'revision_base';
    }
    if (flagSummary.postBria > 0 && order.reviewStages?.postBria?.status !== 'approved') {
      return 'revision_bg_removal';
    }
    if (flagSummary.postPdf > 0 && order.reviewStages?.postPdf?.status !== 'approved') {
      return 'revision_assembly';
    }
  }
  
  // 2. Check production status
  if (order.podStatus) {
    return mapLuluStatusToOrderStatus(order.podStatus);
  }
  
  // 3. Check customer approval
  if (order.customerApprovalStatus === 'pending') return 'pending_customer_approval';
  if (order.customerApprovalStatus === 'approved') return 'customer_approved';
  if (order.customerApprovalStatus === 'revision_requested') return 'customer_revision_requested';
  
  // 4. Check review stages
  if (order.reviewStages?.postPdf?.status === 'approved') {
    return order.customerApprovalRequired ? 'pending_customer_approval' : 'pending_print';
  }
  if (order.reviewStages?.postPdf?.status === 'ready' || order.reviewStages?.postPdf?.status === 'in_review') {
    return 'pending_assembly_review';
  }
  if (order.reviewStages?.postBria?.status === 'approved' && order.reviewStages?.postPdf?.status === 'pending') {
    return 'pending_assembly_review';
  }
  if (order.reviewStages?.postBria?.status === 'ready' || order.reviewStages?.postBria?.status === 'in_review') {
    return 'pending_bg_removal_review';
  }
  if (order.reviewStages?.preBria?.status === 'approved' && order.reviewStages?.postBria?.status === 'pending') {
    return 'pending_bg_removal_review';
  }
  if (order.reviewStages?.preBria?.status === 'ready' || order.reviewStages?.preBria?.status === 'in_review') {
    return 'pending_base_review';
  }
  
  // 5. Check workflow stage
  const workflowStage = order.workflow?.currentStage;
  if (workflowStage === '3-complete') return 'pending_assembly_review';
  if (workflowStage === '2B-complete') return 'pending_bg_removal_review';
  if (workflowStage === '2A-complete') return 'pending_base_review';
  
  // 6. Default
  return 'new';
}

/**
 * Update order status in Supabase and recalculate
 * This ensures status is always in sync
 */
export async function updateOrderStatus(orderId: string, updates: {
  status?: string;
  workflowStage?: string;
  reviewStages?: any;
  flags?: any;
  customerApprovalStatus?: string;
  podStatus?: string;
  [key: string]: any;
}): Promise<void> {
  // Update Supabase
  await updateOrderInSupabase(orderId, updates);
  
  // Recalculate status based on new state
  const calculatedStatus = await calculateOrderStatus(orderId);
  
  // Update with calculated status if different
  if (updates.status !== calculatedStatus) {
    await updateOrderInSupabase(orderId, { order_status: calculatedStatus });
  }
}

/**
 * Get current order status (always calculated, never stale)
 */
export async function getOrderStatus(orderId: string): Promise<string> {
  return calculateOrderStatus(orderId);
}

/**
 * Map Lulu API status to our status system
 */
function mapLuluStatusToOrderStatus(luluStatus: string): string {
  const mapping: Record<string, string> = {
    'Order Received': 'pending_print',
    'Processing': 'pending_shipping',
    'Fulfilling': 'in_production',
    'Shipped': 'shipped',
    'Delivered': 'delivered',
    'Action Required': 'action_required',
    'Canceled': 'cancelled',
    'Refunded': 'cancelled'
  };
  
  return mapping[luluStatus] || 'pending_print';
}
```

### 3. Approval Store with Supabase (`back-end/src/lib/approval-store.ts`)
**Purpose**: Update approval store to use Supabase

```typescript
import { supabase, updateOrderInSupabase, getOrderFromSupabase } from './supabase-client';
import { updateOrderStatus } from './status-service';

export interface ApprovalResult {
  reviewer: string;
  approvedAt: string;
}

export interface StageStatus {
  stage: string;
  status: "pending" | "in-review" | "approved" | "rejected" | "ready" | "flagged";
  reviewedAt?: string;
  reviewer?: string;
  comments?: string;
}

/**
 * Approve a review stage
 * Updates Supabase and triggers status recalculation
 */
export async function approveStage(orderId: string, stage: string): Promise<ApprovalResult> {
  const reviewer = 'system'; // TODO: Get from auth context
  const approvedAt = new Date().toISOString();
  
  // Get current order
  const order = await getOrderFromSupabase(orderId);
  const reviewStages = order.review_stages || {};
  
  // Update specific stage
  reviewStages[stage] = {
    ...reviewStages[stage],
    status: 'approved',
    reviewedAt: approvedAt,
    reviewer
  };
  
  // Update Supabase
  await updateOrderStatus(orderId, {
    reviewStages: reviewStages
  });
  
  // Trigger next workflow if needed
  if (stage === 'preBria') {
    // Trigger Workflow 2B (already exists in approve route)
    // This should be called from the API route, not here
  }
  
  return { reviewer, approvedAt };
}

/**
 * Get stage status from Supabase
 */
export async function getStageStatus(orderId: string, stage: string): Promise<StageStatus> {
  const order = await getOrderFromSupabase(orderId).catch(() => null);
  
  if (!order) {
    return { stage, status: "pending" };
  }
  
  const reviewStages = order.review_stages || {};
  const stageData = reviewStages[stage] || { status: "pending" };
  
  return {
    stage,
    status: stageData.status || "pending",
    reviewedAt: stageData.reviewedAt,
    reviewer: stageData.reviewer,
    comments: stageData.comments
  };
}
```

### 4. Review State with Supabase (`back-end/src/lib/review-state.ts`)
**Purpose**: Update flag system to use Supabase

```typescript
import { supabase, updateOrderInSupabase } from './supabase-client';
import { updateOrderStatus } from './status-service';

export interface FlagSummary {
  preBria: number;
  postBria: number;
  postPdf: number;
  total: number;
}

/**
 * Set flagged count for a stage
 * Updates Supabase and triggers status recalculation
 */
export async function setFlaggedCount(
  orderId: string, 
  stage: 'preBria' | 'postBria' | 'postPdf', 
  count: number
): Promise<void> {
  // Get current flags
  const order = await getOrderFromSupabase(orderId).catch(() => null);
  const flags = order?.flags || { preBria: 0, postBria: 0, postPdf: 0, total: 0 };
  
  // Update specific stage count
  flags[stage] = count;
  flags.total = flags.preBria + flags.postBria + flags.postPdf;
  
  // Update Supabase
  await updateOrderStatus(orderId, {
    flags: flags,
    has_flags: flags.total > 0
  });
}

/**
 * Get flagged count for a stage
 */
export async function getStageFlaggedCount(
  orderId: string, 
  stage: 'preBria' | 'postBria' | 'postPdf'
): Promise<number> {
  const order = await getOrderFromSupabase(orderId).catch(() => null);
  if (!order) return 0;
  
  const flags = order.flags || { preBria: 0, postBria: 0, postPdf: 0 };
  return flags[stage] || 0;
}

/**
 * Get flag summary for order
 */
export async function getOrderFlagSummary(orderId: string): Promise<FlagSummary> {
  const order = await getOrderFromSupabase(orderId).catch(() => null);
  if (!order) {
    return { preBria: 0, postBria: 0, postPdf: 0, total: 0 };
  }
  
  const flags = order.flags || { preBria: 0, postBria: 0, postPdf: 0 };
  return {
    preBria: flags.preBria || 0,
    postBria: flags.postBria || 0,
    postPdf: flags.postPdf || 0,
    total: (flags.preBria || 0) + (flags.postBria || 0) + (flags.postPdf || 0)
  };
}
```

## Gating Logic

### Approval Gating (Flags Block Approval)

**Location**: `back-end/src/components/stages/pre-bria-stage.tsx`, `post-bria-stage.tsx`, `post-pdf-stage.tsx`

**Current Logic** (already implemented):
```typescript
const flaggedCount = allAssets.filter(asset => asset.isFlagged).length;
const canApprove = flaggedCount === 0 && hasAllImages;
```

**Status-Based Gating** (to add):
```typescript
// In each stage component
const canApprove = async () => {
  const status = await getOrderStatus(orderId);
  
  // Can't approve if in revision status
  if (status.startsWith('revision_')) {
    return false;
  }
  
  // Can't approve if flags exist
  const flagSummary = await getOrderFlagSummary(orderId);
  if (flagSummary[stage] > 0) {
    return false;
  }
  
  // Can't approve if stage already approved
  const stageStatus = await getStageStatus(orderId, stage);
  if (stageStatus.status === 'approved') {
    return false;
  }
  
  return true;
};
```

## API Route Pattern

### Standard Pattern for All Order Updates

```typescript
// Example: back-end/src/app/api/orders/[orderId]/approve/route.ts
import { updateOrderStatus } from '@/lib/status-service';
import { approveStage } from '@/lib/approval-store';

export async function POST(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const { stage } = await request.json();
  
  // 1. Update approval in Supabase
  await approveStage(orderId, stage);
  
  // 2. Status is automatically recalculated by updateOrderStatus
  // 3. Return updated order with new status
  const order = await getOrderFromSupabase(orderId);
  const status = await calculateOrderStatus(orderId);
  
  return NextResponse.json({ 
    success: true,
    order: { ...order, order_status: status }
  });
}
```

## Webhook Pattern

### Standard Pattern for Workflow Completion

```typescript
// Example: back-end/src/app/api/webhooks/workflow-2a-complete/route.ts
import { updateOrderStatus } from '@/lib/status-service';
import { downloadManifest, buildManifestKey } from '@/lib/r2-service';

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const { orderId } = payload;
  
  // 1. Download manifest from R2
  const manifest = await downloadManifest(buildManifestKey(orderId, '2a'));
  
  // 2. Update Supabase with workflow completion
  await updateOrderStatus(orderId, {
    workflowStage: '2A-complete',
    reviewStages: {
      preBria: {
        status: 'ready', // Assets ready, waiting for review
        reviewedAt: null,
        reviewer: null
      }
    }
  });
  
  // Status is automatically recalculated to 'pending_base_review'
  
  return NextResponse.json({ success: true });
}
```

## Order Fetching Pattern

### Standard Pattern for Getting Orders

```typescript
// Example: back-end/src/app/api/orders/route.ts
import { supabase } from '@/lib/supabase-client';
import { calculateOrderStatus } from '@/lib/status-service';

export async function GET(request: NextRequest) {
  // 1. Fetch from Supabase (primary)
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .order('createdAt', { ascending: false });
  
  if (error) {
    // Fallback to R2 manifests
    return fallbackToR2Manifests();
  }
  
  // 2. Calculate status for each order (always fresh)
  const ordersWithStatus = await Promise.all(
    orders.map(async (order) => {
      const calculatedStatus = await calculateOrderStatus(order.orderId);
      return {
        ...order,
        status: calculatedStatus // Always use calculated status
      };
    })
  );
  
  return NextResponse.json(ordersWithStatus);
}
```

## Status Badge Component Updates

### Template Pattern for Status Display

```typescript
// back-end/src/components/ui/status-badge.tsx
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    // Order Intake
    new: { label: 'New', className: 'bg-gray-100 text-gray-800 border-gray-200' },
    queued: { label: 'Queued', className: 'bg-gray-100 text-gray-800 border-gray-200' },
    processing: { label: 'Processing', className: 'bg-blue-100 text-blue-800 border-blue-200' },
    
    // Review Stages
    pending_base_review: { label: 'Pending Base Review', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    pending_bg_removal_review: { label: 'Pending BG Removal Review', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    pending_assembly_review: { label: 'Pending Assembly Review', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    
    // Revision (Stage-Specific)
    revision_base: { label: 'Revision Base', className: 'bg-orange-100 text-orange-800 border-orange-200' },
    revision_bg_removal: { label: 'Revision BG Removal', className: 'bg-orange-100 text-orange-800 border-orange-200' },
    revision_assembly: { label: 'Revision Assembly', className: 'bg-orange-100 text-orange-800 border-orange-200' },
    
    // Customer Approval
    pending_customer_approval: { label: 'Pending Customer Approval', className: 'bg-purple-100 text-purple-800 border-purple-200' },
    customer_approved: { label: 'Customer Approved', className: 'bg-green-100 text-green-800 border-green-200' },
    customer_revision_requested: { label: 'Customer Revision', className: 'bg-orange-100 text-orange-800 border-orange-200' },
    
    // Production
    pending_print: { label: 'Pending Print', className: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    in_production: { label: 'In Production', className: 'bg-purple-100 text-purple-800 border-purple-200' },
    pending_shipping: { label: 'Pending Shipping', className: 'bg-blue-100 text-blue-800 border-blue-200' },
    shipped: { label: 'Shipped', className: 'bg-teal-100 text-teal-800 border-teal-200' },
    in_transit: { label: 'In Transit', className: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
    delivered: { label: 'Delivered', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    complete: { label: 'Complete', className: 'bg-green-100 text-green-800 border-green-200' },
    
    // Error States
    failed: { label: 'Failed', className: 'bg-red-100 text-red-800 border-red-200' },
    cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-800 border-gray-200' },
    on_hold: { label: 'On Hold', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    action_required: { label: 'Action Required', className: 'bg-red-100 text-red-800 border-red-200' }
  };
  
  const config = statusConfig[status] || {
    label: status,
    className: 'bg-gray-100 text-gray-800 border-gray-200'
  };
  
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border', config.classine, className)}>
      {config.label}
    </span>
  );
}
```

## Database Schema (Supabase)

### Migration SQL

```sql
-- Add status system columns to orders table
ALTER TABLE orders 
  -- Main status
  ADD COLUMN IF NOT EXISTS order_status VARCHAR(50) DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS workflow_stage VARCHAR(50),
  
  -- Review stages (JSONB)
  ADD COLUMN IF NOT EXISTS review_stages JSONB DEFAULT '{
    "preBria": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null},
    "postBria": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null},
    "postPdf": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null}
  }'::jsonb,
  
  -- Flags
  ADD COLUMN IF NOT EXISTS has_flags BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS flags JSONB DEFAULT '{"preBria": 0, "postBria": 0, "postPdf": 0, "total": 0}'::jsonb,
  
  -- Customer approval
  ADD COLUMN IF NOT EXISTS customer_approval_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS customer_approval_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS customer_approval_requested_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS customer_approval_approved_at TIMESTAMP,
  
  -- Production
  ADD COLUMN IF NOT EXISTS pod_order_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pod_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS carrier VARCHAR(50),
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_workflow_stage ON orders(workflow_stage);
CREATE INDEX IF NOT EXISTS idx_orders_has_flags ON orders(has_flags);
CREATE INDEX IF NOT EXISTS idx_orders_pod_status ON orders(pod_status);
```

## Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Install `@supabase/supabase-js` package
- [ ] Create `supabase-client.ts` with connection
- [ ] Create `status-service.ts` with calculation logic
- [ ] Run database migration
- [ ] Test Supabase connection

### Phase 2: Update Existing Services
- [ ] Update `approval-store.ts` to use Supabase
- [ ] Update `review-state.ts` to use Supabase
- [ ] Ensure all status updates go through `updateOrderStatus()`

### Phase 3: Update API Routes
- [ ] Update `/api/orders` to query Supabase + calculate status
- [ ] Update `/api/orders/[orderId]` to query Supabase + calculate status
- [ ] Update `/api/orders/[orderId]/approve` to use new approval store
- [ ] Update all webhook endpoints to use `updateOrderStatus()`

### Phase 4: Update UI Components
- [ ] Update `StatusBadge` component with all new statuses
- [ ] Update stage components to use status-based gating
- [ ] Test status display in all locations

## Key Principles

1. **Single Source of Truth**: Supabase is primary, R2 manifests are fallback
2. **Always Calculate**: Status is always calculated, never just read from DB
3. **Centralized Updates**: All status changes go through `updateOrderStatus()`
4. **Gating Logic**: Flags + status prevent approval, not just flags
5. **Templated Pattern**: All API routes follow the same pattern

