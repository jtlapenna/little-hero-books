# Status System Implementation Plan

## Overview
This document maps the current backend structure and provides a comprehensive plan for implementing the new status system with Supabase integration.

## Lulu API Status Research

Based on research, Lulu Print API provides these order statuses:
- **Order Received** - Order placed and received
- **Processing** - Order being prepared for production
- **Fulfilling** - Book being printed/manufactured
- **Shipped** - Order has been shipped (tracking available)
- **Delivered** - Order delivered to customer
- **Action Required** - Issue requiring attention (e.g., address verification)
- **Canceled** - Order cancelled
- **Refunded** - Order refunded

**Note**: Lulu API may support webhooks for status updates, but we'll need to verify during integration.

## Current Backend Structure Mapping

### 1. Order Data Sources
**Current**: Orders are loaded from R2 manifests (not Supabase yet)
- **Location**: `back-end/src/app/api/orders/route.ts` and `back-end/src/app/api/orders/[orderId]/route.ts`
- **Method**: `manifestToOrder()` function converts manifest JSON to Order type
- **Status Calculation**: Currently hardcoded based on `workflow.currentStage`:
  - `workflow.currentStage === '2A-complete'` → `'ai_generation_in_progress'`
  - `workflow.currentStage === '2B-complete'` → `'bria_processing_complete'`
  - `workflow.currentStage === '3-complete'` → `'book_compiled'`
  - Default → `'queued_for_processing'`

### 2. Review Stages (Current)
**Location**: `back-end/src/types/order.ts`
- **Structure**: `reviewStages: { preBria, postBria, postPdf }`
- **Status Values**: `'pending' | 'in-review' | 'approved' | 'rejected'`
- **Storage**: Currently in-memory via `approval-store.ts` (placeholder)
- **API**: `/api/orders/[orderId]/approve` (POST) - Updates approval state

### 3. Status Display Locations

#### A. Orders List Page
- **File**: `back-end/src/app/orders/page.tsx`
- **Component**: `OrdersTable` (`back-end/src/components/orders/orders-table.tsx`)
- **Display**: Status badge in table row
- **Current Logic**: `getStatusFromOrder()` - simple mapping to `'pending' | 'in-review' | 'approved'`

#### B. Review Page
- **File**: `back-end/src/app/review/page.tsx`
- **Display**: Status badge in card/table view
- **Current Logic**: Direct `order.status` field

#### C. Order Detail Page
- **File**: `back-end/src/app/orders/[orderId]/page.tsx`
- **Display**: 
  - Main status badge in header (line 254)
  - Stage-specific status badge (line 246-252)
  - Flag count badge (line 238-242)
- **Current Logic**: Shows `order.status` and `order.reviewStages[activeStage].status`

#### D. Status Badge Component
- **File**: `back-end/src/components/ui/status-badge.tsx`
- **Current Statuses Supported**:
  - `pending`, `in-review`, `in_review`, `approved`, `stage_approved`, `completed`, `rejected`, `queued_for_processing`
- **Colors**: Defined per status

### 4. Status Update Triggers (Current)

#### A. Manual Approval
- **Endpoint**: `/api/orders/[orderId]/approve` (POST)
- **File**: `back-end/src/app/api/orders/[orderId]/approve/route.ts`
- **Action**: Updates `reviewStages[stage].status = 'approved'`
- **Side Effect**: Triggers Workflow 2B when preBria approved
- **Storage**: Currently placeholder (`approval-store.ts`)

#### B. Workflow Completion Webhooks
- **Workflow 2A Complete**: `/api/webhooks/workflow-2a-complete` (not implemented yet)
- **Workflow 2B Complete**: `/api/webhooks/workflow-2b-complete` (POST)
  - **File**: `back-end/src/app/api/webhooks/workflow-2b-complete/route.ts`
  - **Current**: Downloads manifest, normalizes characterSpecs
  - **Note**: "DB updates to Supabase will be implemented in Phase 4"
- **Workflow 3 Complete**: `/api/webhooks/workflow-3-complete` (POST)
  - **File**: `back-end/src/app/api/webhooks/workflow-3-complete/route.ts`
  - **Current**: Downloads manifest, normalizes characterSpecs
  - **Note**: "DB updates to Supabase will be implemented in Phase 4"

#### C. Manual Workflow Triggers
- **Trigger Background Removal**: `/api/orders/[orderId]/trigger-background-removal` (POST)
- **Trigger Book Assembly**: `/api/orders/[orderId]/trigger-book-assembly` (POST)

### 5. Flag System (Current)
- **Location**: `back-end/src/lib/review-state.ts`
- **Storage**: In-memory (localStorage fallback)
- **Functions**: `getStageFlaggedCount()`, `setFlaggedCount()`, `getOrderFlagSummary()`
- **Usage**: Shown in UI as "X Needs Attention" badge

## New Status System Design

### Status Values (Finalized)

#### Order Intake & Processing
- `new` - Order just received
- `queued` - Waiting for workflow capacity
- `processing` - Currently in a workflow

#### Internal Review (Stage-Specific)
- `pending_base_review` - Waiting for Pre-Bria review
- `pending_bg_removal_review` - Waiting for Post-Bria review
- `pending_assembly_review` - Waiting for Post-PDF review

#### Revision (Stage-Specific)
- `revision_base` - Pre-Bria stage has flags, needs revision
- `revision_bg_removal` - Post-Bria stage has flags, needs revision
- `revision_assembly` - Post-PDF stage has flags, needs revision
- `revision_in_progress` - Revision requested, workflow regenerating

#### Customer Approval
- `pending_customer_approval` - Waiting for customer to approve final book
- `customer_approved` - Customer has approved, ready for production
- `customer_revision_requested` - Customer requested changes

#### Production & Fulfillment
- `pending_print` - Approved, queued for print production
- `in_production` - Book being printed at Lulu (maps to Lulu "Fulfilling")
- `pending_shipping` - Printed, waiting to ship (maps to Lulu "Processing")
- `shipped` - Book has shipped (maps to Lulu "Shipped")
- `in_transit` - Book in transit to customer
- `delivered` - Book delivered (maps to Lulu "Delivered")
- `complete` - Order fully complete

#### Error States
- `failed` - Order processing failed
- `cancelled` - Order cancelled
- `on_hold` - Order temporarily paused
- `action_required` - Issue requiring attention (maps to Lulu "Action Required")

### Stage Status Values (reviewStages)

Each stage (`preBria`, `postBria`, `postPdf`) uses:
- `pending` - Stage not yet reached / no assets available
- `in_progress` - Assets being generated by workflow
- `ready` - Assets available, waiting for review
- `in_review` - Under review by admin
- `approved` - Approved, ready for next stage
- `flagged` - Has flags, needs revision
- `revision_requested` - Revision requested, workflow regenerating

## Status Calculation Logic

### Priority Rules (in order):
1. **Flags exist** → Set to stage-specific revision status (`revision_base`, `revision_bg_removal`, `revision_assembly`)
   - **NOTE**: Revision statuses are OPTIONAL - orders can proceed directly if no flags exist
2. **In production** → Use production status (`pending_print`, `in_production`, `shipped`, etc.)
3. **Waiting for review** → Set to appropriate `pending_[stage]_review`
4. **Customer approval** → Use customer approval statuses
5. **Processing** → `processing` or `queued`
6. **Default** → `new` or last known status

### Important Notes:
- **No explicit "request revision" action**: Flags just prevent approval. When all flags are cleared, status returns to pending review.
- **Revision statuses are optional**: If no flags exist, order flows directly: `pending_base_review` → `pending_bg_removal_review` → `pending_assembly_review`
- **Workflow regeneration**: If workflows are retried/regenerated (future feature), they would update status back to `pending_[stage]_review` when complete

### Status Calculation Function
**Note**: Uses existing database fields: `status`, `workflow_step`, `lulu_status`, `review_stages`, `flags`

```typescript
function calculateOrderStatus(order: Order): string {
  // 1. Check flags first (highest priority) - REVISION STATUSES ARE OPTIONAL
  // Uses flags JSONB field from database
  const flags = order.flags || { preBria: 0, postBria: 0, postPdf: 0, total: 0 };
  if (flags.total > 0) {
    const reviewStages = order.review_stages || {};
    // If flags exist, show revision status for that stage
    if (flags.preBria > 0 && reviewStages.preBria?.status !== 'approved') return 'revision_base';
    if (flags.postBria > 0 && reviewStages.postBria?.status !== 'approved') return 'revision_bg_removal';
    if (flags.postPdf > 0 && reviewStages.postPdf?.status !== 'approved') return 'revision_assembly';
  }
  
  // 2. Check production status - uses existing lulu_status field
  if (order.lulu_status) {
    return mapLuluStatusToOrderStatus(order.lulu_status);
  }
  
  // 3. Check customer approval - uses customer_approval_status field
  if (order.customer_approval_status === 'pending') return 'pending_customer_approval';
  if (order.customer_approval_status === 'approved') return 'customer_approved';
  if (order.customer_approval_status === 'revision_requested') return 'customer_revision_requested';
  
  // 4. Check review stages - uses review_stages JSONB field
  const reviewStages = order.review_stages || {};
  if (reviewStages.postPdf?.status === 'approved') {
    // All stages approved, ready for customer approval or production
    return order.customer_approval_required ? 'pending_customer_approval' : 'pending_print';
  }
  if (reviewStages.postPdf?.status === 'ready' || reviewStages.postPdf?.status === 'in_review') {
    return 'pending_assembly_review';
  }
  if (reviewStages.postBria?.status === 'approved' && reviewStages.postPdf?.status === 'pending') {
    return 'pending_assembly_review';
  }
  if (reviewStages.postBria?.status === 'ready' || reviewStages.postBria?.status === 'in_review') {
    return 'pending_bg_removal_review';
  }
  if (reviewStages.preBria?.status === 'approved' && reviewStages.postBria?.status === 'pending') {
    return 'pending_bg_removal_review';
  }
  if (reviewStages.preBria?.status === 'ready' || reviewStages.preBria?.status === 'in_review') {
    return 'pending_base_review';
  }
  
  // 5. Check workflow stage - uses existing workflow_step field
  const workflowStep = order.workflow_step;
  if (workflowStep === 'book_assembly_completed' || workflowStep === '3-complete') return 'pending_assembly_review';
  if (workflowStep === 'bria_processing_completed' || workflowStep === '2B-complete') return 'pending_bg_removal_review';
  if (workflowStep === 'ai_generation_completed' || workflowStep === '2A-complete') return 'pending_base_review';
  
  // 6. Default
  return 'new';
}
```

## Implementation Plan

### Phase 1: Database Schema Updates

#### A. Supabase Orders Table Migration
**File**: `database/migration-status-system.sql`

**Note**: Uses existing fields (`status`, `workflow_step`, `lulu_status`) - only adds missing fields

```sql
-- Add new status-related columns to orders table
-- Note: Uses existing fields: status, workflow_step, lulu_status (no duplicates)
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS review_stages JSONB DEFAULT '{
    "preBria": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null},
    "postBria": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null},
    "postPdf": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null}
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS has_flags BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS flags JSONB DEFAULT '{"preBria": 0, "postBria": 0, "postPdf": 0, "total": 0}'::jsonb,
  ADD COLUMN IF NOT EXISTS customer_approval_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS customer_approval_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS customer_approval_requested_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS customer_approval_approved_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS pod_order_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pod_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS carrier VARCHAR(50),
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;

-- Create index for status filtering
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_workflow_stage ON orders(workflow_stage);
CREATE INDEX IF NOT EXISTS idx_orders_has_flags ON orders(has_flags);
```

#### B. Supabase Client Setup
**File**: `back-end/src/lib/supabase-client.ts` (new file)
- Create Supabase client with proper credentials
- Export functions for order CRUD operations

### Phase 2: Status Calculation Utility

#### A. Create Status Calculation Module
**File**: `back-end/src/lib/status-calculator.ts` (new file)
- Implement `calculateOrderStatus()` function
- Implement `mapLuluStatusToOrderStatus()` function
- Implement `updateOrderStatus()` function (updates Supabase)

#### B. Update Approval Store
**File**: `back-end/src/lib/approval-store.ts`
- Replace placeholder with Supabase integration
- Update `approveStage()` to update Supabase and trigger status recalculation
- Update `getStageStatus()` to query Supabase

### Phase 3: API Route Updates

#### A. Update Orders List Endpoint
**File**: `back-end/src/app/api/orders/route.ts`
- Query orders from Supabase (primary) with R2 manifest fallback
- Apply status calculation to each order
- Return orders with correct status

#### B. Update Order Detail Endpoint
**File**: `back-end/src/app/api/orders/[orderId]/route.ts`
- Query from Supabase first, fallback to R2 manifest
- Apply status calculation
- Return order with correct status

#### C. Update Approval Endpoint
**File**: `back-end/src/app/api/orders/[orderId]/approve/route.ts`
- Update Supabase `review_stages` JSONB
- Trigger status recalculation
- Return updated order

#### D. Update Webhook Endpoints
**Files**: 
- `back-end/src/app/api/webhooks/workflow-2a-complete/route.ts` (create if missing)
- `back-end/src/app/api/webhooks/workflow-2b-complete/route.ts`
- `back-end/src/app/api/webhooks/workflow-3-complete/route.ts`

**Actions**:
- Update Supabase with workflow completion
- Update `workflow_stage` field
- Update `review_stages[stage].status = 'ready'` (not 'approved' - needs human review)
- Trigger status recalculation

### Phase 4: Status Badge Component Updates

#### A. Update Status Badge Component
**File**: `back-end/src/components/ui/status-badge.tsx`
- Add all new status values with appropriate colors
- Update type definitions

#### B. Update Status Display Logic
**Files**:
- `back-end/src/components/orders/orders-table.tsx` - Update `getStatusFromOrder()`
- `back-end/src/app/orders/[orderId]/page.tsx` - Use calculated status
- `back-end/src/app/review/page.tsx` - Use calculated status

### Phase 5: Flag System Integration

#### A. Update Review State Store
**File**: `back-end/src/lib/review-state.ts`
- Replace in-memory storage with Supabase
- Update `setFlaggedCount()` to update Supabase `flags` JSONB
- Update `getStageFlaggedCount()` to query Supabase
- Trigger status recalculation when flags change

### Phase 6: Customer Approval System

#### A. Create Customer Approval API
**File**: `back-end/src/app/api/orders/[orderId]/customer-approve/route.ts` (new)
- Endpoint for customer to approve/reject
- Updates `customer_approval_status` in Supabase
- Triggers status recalculation

#### B. Create Customer Approval Portal
**File**: `back-end/src/app/customer/[orderId]/approve/page.tsx` (new)
- Public page for customer approval
- Shows book preview
- Approve/Request Revision buttons

### Phase 7: Lulu Integration

#### A. Create Lulu Webhook Endpoint
**File**: `back-end/src/app/api/webhooks/lulu/route.ts` (new)
- Receives Lulu status updates
- Maps Lulu status to our status system
- Updates Supabase `pod_status` and `order_status`
- Updates tracking information if available

#### B. Create Lulu Status Polling (if webhooks not available)
**File**: `back-end/src/lib/lulu-service.ts` (new)
- Poll Lulu API for order status
- Update Supabase accordingly

## Status Trigger Mapping

### What Triggers Status Changes

| Status Change | Trigger | Location | Action |
|--------------|---------|----------|--------|
| `new` → `queued` | Order received from Amazon | TBD: Amazon webhook | Create order in Supabase with `status = 'new'`, then set to `queued` |
| `queued` → `processing` | Workflow 2A starts | Workflow 2A webhook | Update `workflow_stage = 'character_generation'`, `status = 'processing'` |
| `processing` → `pending_base_review` | Workflow 2A completes | `/api/webhooks/workflow-2a-complete` | Update `workflow_stage = '2A-complete'`, `review_stages.preBria.status = 'ready'`, recalculate status |
| `pending_base_review` → `revision_base` | Admin flags images | Pre-Bria stage UI | Update `flags.preBria` count, set `has_flags = true`, recalculate status |
| `revision_base` → `pending_base_review` | Admin unflags all images OR workflow regenerates | Pre-Bria stage UI OR Workflow 2A webhook | Clear flags OR workflow regenerates images, recalculate status |
| `pending_base_review` → `pending_bg_removal_review` | Admin approves Pre-Bria (no flags) | `/api/orders/[orderId]/approve` | Update `review_stages.preBria.status = 'approved'`, trigger Workflow 2B, recalculate status |
| `pending_bg_removal_review` → `revision_bg_removal` | Admin flags images | Post-Bria stage UI | Update `flags.postBria` count, set `has_flags = true`, recalculate status |
| `revision_bg_removal` → `pending_bg_removal_review` | Admin unflags all images OR workflow regenerates | Post-Bria stage UI OR Workflow 2B webhook | Clear flags OR workflow regenerates images, recalculate status |
| `pending_bg_removal_review` → `pending_assembly_review` | Admin approves Post-Bria (no flags) | `/api/orders/[orderId]/approve` | Update `review_stages.postBria.status = 'approved'`, trigger Workflow 3, recalculate status |
| `pending_assembly_review` → `revision_assembly` | Admin flags images | Post-PDF stage UI | Update `flags.postPdf` count, set `has_flags = true`, recalculate status |
| `revision_assembly` → `pending_assembly_review` | Admin unflags all images OR workflow regenerates | Post-PDF stage UI OR Workflow 3 webhook | Clear flags OR workflow regenerates, recalculate status |
| `pending_assembly_review` → `pending_customer_approval` | Admin approves Post-PDF | `/api/orders/[orderId]/approve` | Update `review_stages.postPdf.status = 'approved'`, set `customer_approval_required = true`, recalculate status |
| `pending_customer_approval` → `customer_approved` | Customer approves | `/api/orders/[orderId]/customer-approve` | Update `customer_approval_status = 'approved'`, recalculate status |
| `customer_approved` → `pending_print` | Customer approval received | Status calculation | Set `status = 'pending_print'`, trigger Lulu order creation |
| `pending_print` → `in_production` | Lulu accepts order | Lulu webhook/polling | Update `pod_status`, `status = 'in_production'` |
| `in_production` → `pending_shipping` | Lulu prints book | Lulu webhook/polling | Update `pod_status`, `status = 'pending_shipping'` |
| `pending_shipping` → `shipped` | Lulu ships book | Lulu webhook/polling | Update `pod_status`, `tracking_number`, `carrier`, `shipped_at`, `status = 'shipped'` |
| `shipped` → `in_transit` | Tracking shows in transit | Status calculation or tracking API | Update `status = 'in_transit'` |
| `in_transit` → `delivered` | Tracking shows delivered | Status calculation or tracking API | Update `delivered_at`, `status = 'delivered'` |
| `delivered` → `complete` | After delivery confirmation | Automated or manual | Update `status = 'complete'` |

## UI Display Locations

### Where Statuses Appear

1. **Orders List Page** (`/orders`)
   - **Component**: `OrdersTable`
   - **Display**: Main status badge in table
   - **Filter**: Status dropdown filter
   - **Sort**: By status (optional)

2. **Review Page** (`/review`)
   - **Component**: Order cards/table
   - **Display**: Main status badge + flag indicator
   - **Filter**: Status filter dropdown
   - **Sort**: By status (optional)

3. **Order Detail Page** (`/orders/[orderId]`)
   - **Component**: Header section
   - **Display**: 
     - Main status badge (overall order status)
     - Stage status badge (current active stage)
     - Flag count badge (if flags exist)
   - **Component**: Stage tabs
   - **Display**: Stage-specific status indicator per tab

4. **Customer Approval Page** (`/customer/[orderId]/approve`)
   - **Component**: Approval interface
   - **Display**: Current status, book preview, approve/reject buttons

## Database Schema (Final)

```sql
CREATE TABLE orders (
  -- Primary keys
  orderId VARCHAR(50) PRIMARY KEY,
  amazonOrderId VARCHAR(50),
  
  -- Status system (NEW)
  order_status VARCHAR(50) NOT NULL DEFAULT 'new',
  workflow_stage VARCHAR(50),
  review_stages JSONB DEFAULT '{
    "preBria": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null},
    "postBria": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null},
    "postPdf": {"status": "pending", "reviewedAt": null, "reviewer": null, "comments": null}
  }'::jsonb,
  has_flags BOOLEAN DEFAULT FALSE,
  flags JSONB DEFAULT '{"preBria": 0, "postBria": 0, "postPdf": 0, "total": 0}'::jsonb,
  
  -- Customer approval (NEW)
  customer_approval_status VARCHAR(50),
  customer_approval_required BOOLEAN DEFAULT FALSE,
  customer_approval_requested_at TIMESTAMP,
  customer_approval_approved_at TIMESTAMP,
  customer_approval_revision_requested_at TIMESTAMP,
  
  -- Production tracking (NEW/ENHANCED)
  pod_order_id VARCHAR(100),
  pod_status VARCHAR(50),
  tracking_number VARCHAR(100),
  carrier VARCHAR(50),
  tracking_url TEXT,
  shipped_at TIMESTAMP,
  delivered_at TIMESTAMP,
  
  -- Existing fields
  characterHash VARCHAR(16),
  characterSpecs JSONB,
  bookSpecs JSONB,
  orderDetails JSONB,
  customerEmail VARCHAR(255),
  customerName VARCHAR(255),
  orderDate TIMESTAMP,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_orders_status ON orders(order_status);
CREATE INDEX idx_orders_workflow_stage ON orders(workflow_stage);
CREATE INDEX idx_orders_has_flags ON orders(has_flags);
CREATE INDEX idx_orders_pod_status ON orders(pod_status);
CREATE INDEX idx_orders_customer_approval_status ON orders(customer_approval_status);
```

## Implementation Checklist

### Phase 1: Database & Core Infrastructure
- [ ] Create Supabase client utility
- [ ] Run database migration (add status columns)
- [ ] Create status calculation utility
- [ ] Create Lulu status mapping utility

### Phase 2: Backend API Updates
- [ ] Update `/api/orders` to query Supabase
- [ ] Update `/api/orders/[orderId]` to query Supabase
- [ ] Update `/api/orders/[orderId]/approve` to update Supabase
- [ ] Update webhook endpoints to update Supabase
- [ ] Create `/api/orders/[orderId]/customer-approve` endpoint

### Phase 3: Flag System Integration
- [ ] Update `review-state.ts` to use Supabase
- [ ] Ensure flags trigger status recalculation
- [ ] Test flag updates

### Phase 4: UI Updates
- [ ] Update StatusBadge component with all new statuses
- [ ] Update OrdersTable status display
- [ ] Update OrderDetailPage status display
- [ ] Update ReviewPage status display
- [ ] Create Customer Approval page

### Phase 5: Workflow Integration
- [ ] Update Workflow 2A completion webhook
- [ ] Update Workflow 2B completion webhook
- [ ] Update Workflow 3 completion webhook
- [ ] Test status transitions through workflow

### Phase 6: Customer Approval
- [ ] Create customer approval API endpoint
- [ ] Create customer approval UI page
- [ ] Add email notification system (optional)

### Phase 7: Lulu Integration
- [ ] Research Lulu webhook setup (or polling)
- [ ] Create Lulu webhook endpoint
- [ ] Implement Lulu status polling (if needed)
- [ ] Map Lulu statuses to our system
- [ ] Test production status flow

### Phase 8: Testing & Validation
- [ ] Test all status transitions
- [ ] Test flag system with status updates
- [ ] Test customer approval flow
- [ ] Test production status flow
- [ ] Test error handling
- [ ] Validate Supabase queries performance

## Testing Strategy

### Unit Tests
- Status calculation function
- Status mapping functions
- Flag count updates

### Integration Tests
- API endpoint status updates
- Webhook status updates
- Supabase read/write operations

### End-to-End Tests
- Complete order flow from new to complete
- Revision flow
- Customer approval flow
- Production flow

## Rollout Plan

1. **Phase 1-2**: Database and backend updates (non-breaking)
2. **Phase 3-4**: UI updates (backward compatible)
3. **Phase 5**: Workflow integration (test thoroughly)
4. **Phase 6**: Customer approval (new feature)
5. **Phase 7**: Lulu integration (when ready)
6. **Phase 8**: Full testing and validation

## Risk Mitigation

1. **Backward Compatibility**: Keep R2 manifest as fallback during transition
2. **Data Migration**: Migrate existing orders to Supabase with status calculation
3. **Status Calculation**: Always calculate status, never rely on stored status alone
4. **Error Handling**: Graceful fallback if Supabase unavailable
5. **Testing**: Comprehensive testing before production rollout

