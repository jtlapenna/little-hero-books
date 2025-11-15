# Order Status Source of Truth

## Overview

This document defines the complete order lifecycle and all possible state combinations. It serves as the authoritative reference for status determination logic.

## Database Fields (Source Data)

### Primary Status Fields
- `status` (OrderStatus enum) - Calculated overall order status
- `execution_status` - Current execution state: `'new'`, `'ready_for_processing'`, `'processing'`, `'error'`, `'error_requires_manual_review'`, `'completed'`
- `workflow_step` - Current workflow completion: `'order_intake'`, `'2A-complete'`, `'2B-complete'`, `'book_assembly_completed'`, `'print_fulfillment'`, `'customer_approval'`
- `current_workflow` - Active workflow: `'2A'`, `'2B'`, `'3'`, `'4'`, or `null`
- `next_workflow` - Next workflow to run: `'2A'`, `'2B'`, `'3'`, `'4'`, or `null`

### Review & Approval Fields
- `review_stages.preBria.status` - `'pending'`, `'in-review'`, `'approved'`
- `review_stages.postBria.status` - `'pending'`, `'in-review'`, `'approved'`
- `review_stages.postPdf.status` - `'pending'`, `'in-review'`, `'approved'`
- `customer_approval_status` - `'pending'`, `'approved'`, `'revision_requested'`, `null`
- `customer_approval_requested_at` - Timestamp when proof was sent
- `customer_approval_approved_at` - Timestamp when customer approved

### Error Fields
- `error_type` - Error classification
- `error_message` - Error details
- `retry_count` - Number of retry attempts
- `next_retry_at` - When to retry next

### Timestamps
- `started_at` - When current workflow started
- `queued_at` - When order was queued for routing
- `updated_at` - Last update timestamp

## Order Lifecycle States

### 1. NEW → IN_QUEUE → PROCESSING → REVIEW

**State: NEW**
- `execution_status`: `'new'` or `'ready_for_processing'`
- `workflow_step`: `'order_intake'`
- `queued_at`: `null`
- `next_workflow`: `'2A'` or `null`
- **Display**: "New"

**State: IN_QUEUE**
- `execution_status`: `'ready_for_processing'`
- `workflow_step`: `'order_intake'`
- `queued_at`: `<timestamp>` (set by router cron)
- `next_workflow`: `'2A'`
- **Display**: "In Queue"

**State: PROCESSING (Workflow 2A)**
- `execution_status`: `'processing'`
- `current_workflow`: `'2A'`
- `started_at`: `<timestamp>`
- `workflow_step`: `null` (not yet complete)
- **Display**: "Review Poses" (if preBria not approved) or "Processing"

**State: REVIEW (After 2A Complete)**
- `execution_status`: `'processing'` (waiting for review)
- `workflow_step`: `'2A-complete'` or `'ai_generation_completed'`
- `current_workflow`: `null`
- `manifest_2a_url`: `<url>`
- `review_stages.preBria.status`: `'in-review'` or `'approved'`
- **Display**: "Review Poses" (if not approved) or "Approved" (if approved, waiting for 2B trigger)

### 2. WORKFLOW 2B → REVIEW

**State: PROCESSING (Workflow 2B)**
- `execution_status`: `'processing'`
- `current_workflow`: `'2B'`
- `started_at`: `<timestamp>`
- `workflow_step`: `'2A-complete'` (previous step)
- `review_stages.preBria.status`: `'approved'`
- **Display**: "Review Backgrounds" (if postBria not approved) or "Processing"

**State: REVIEW (After 2B Complete)**
- `execution_status`: `'processing'` (waiting for review)
- `workflow_step`: `'2B-complete'` or `'bria_processing_complete'`
- `current_workflow`: `null`
- `manifest_2b_url`: `<url>`
- `review_stages.postBria.status`: `'in-review'` or `'approved'`
- **Display**: "Review Backgrounds" (if not approved) or "Approved" (if approved, waiting for 3 trigger)

### 3. WORKFLOW 3 → REVIEW → CUSTOMER APPROVAL

**State: PROCESSING (Workflow 3)**
- `execution_status`: `'processing'`
- `current_workflow`: `'3'`
- `started_at`: `<timestamp>`
- `workflow_step`: `'2B-complete'` (previous step)
- `review_stages.postBria.status`: `'approved'`
- **Display**: "Review Pages" (if postPdf not approved) or "Processing"

**State: REVIEW (After 3 Complete)**
- `execution_status`: `'processing'` (waiting for review) ⚠️ **KEY ISSUE: This causes "stuck" detection**
- `workflow_step`: `'book_assembly_completed'`
- `current_workflow`: `null`
- `manifest_3_url`: `<url>`
- `review_stages.postPdf.status`: `'in-review'` or `'approved'`
- **Display**: "Review Pages" (if not approved) or "Proof Ready" (if approved, ready to send to customer)

**State: AWAITING CUSTOMER**
- `execution_status`: `'processing'` ⚠️ **KEY ISSUE: Should be updated when customer approves**
- `workflow_step`: `'customer_approval'`
- `customer_approval_status`: `'pending'`
- `customer_approval_requested_at`: `<timestamp>`
- `review_stages.postPdf.status`: `'approved'`
- **Display**: "Awaiting Customer"

**State: CUSTOMER APPROVED**
- `execution_status`: `'processing'` ⚠️ **KEY ISSUE: Should be `'ready_for_processing'` or `'completed'`**
- `workflow_step`: `'customer_approval'` or `'print_fulfillment'`
- `customer_approval_status`: `'approved'`
- `customer_approval_approved_at`: `<timestamp>`
- `review_stages.postPdf.status`: `'approved'`
- **Display**: "Ready to Print" (if revisionCount === 0) or "Printing" (if revisionCount >= 1)

### 4. WORKFLOW 4 → PRINT → SHIP → DELIVERED

**State: PROCESSING (Workflow 4)**
- `execution_status`: `'processing'`
- `current_workflow`: `'4'`
- `started_at`: `<timestamp>`
- `workflow_step`: `'customer_approval'` (previous step)
- **Display**: "Printing"

**State: PRINT FULFILLMENT**
- `execution_status`: `'processing'` or `'completed'`
- `workflow_step`: `'print_fulfillment'`
- `lulu_status`: `'Order Received'`, `'Processing'`, `'Fulfilling'`, etc.
- **Display**: "Printing"

**State: SHIPPED**
- `execution_status`: `'completed'`
- `workflow_step`: `'print_fulfillment'`
- `lulu_status`: `'Shipped'`
- `tracking_number`: `<number>`
- **Display**: "Shipped"

**State: DELIVERED**
- `execution_status`: `'completed'`
- `workflow_step`: `'print_fulfillment'`
- `lulu_status`: `'Delivered'`
- **Display**: "Delivered"

## Critical Status Determination Rules

### Rule 1: Exclude Completed Workflows from "Stuck" Detection

**IF** `workflow_step` is one of:
- `'2A-complete'`
- `'2B-complete'`
- `'bria_processing_complete'`
- `'book_assembly_completed'`
- `'ai_generation_completed'`

**AND** `execution_status` = `'processing'`

**THEN** Order is **NOT stuck** - it's waiting for review/approval, not actually processing.

**Implementation**: Check `workflow_step` BEFORE checking `started_at` age.

### Rule 2: Customer Approval Updates execution_status

**WHEN** Customer approves via `/api/preview/[orderId]/approve`:

**UPDATE**:
- `execution_status`: `'ready_for_processing'` (if going to print) OR `'completed'` (if final state)
- `workflow_step`: `'customer_approval'` → `'print_fulfillment'` (if going to print)
- `current_workflow`: `null` (clear any active workflow)
- `started_at`: `null` (clear processing timestamp)

**Rationale**: Prevents "stuck processing" detection after customer approval.

### Rule 3: Button Text Consistency

**"Send Proof" button** should be renamed to **"Send for Customer Approval"** for clarity.

**Current logic**:
- `revisionCount === 0`: "Send Proof"
- `revisionCount >= 1`: "Resend Proof"

**Proposed logic**:
- `revisionCount === 0`: "Send for Customer Approval"
- `revisionCount >= 1`: "Resend for Customer Approval"

### Rule 4: Status Priority Order

When determining display status, check in this order:

1. **Errors** (highest priority)
   - Missing manifest
   - Stuck processing (with workflow_step exclusion)
   - Max retries
   - API errors
   - Multiple errors

2. **Customer Approval States**
   - Awaiting customer (`customer_approval_status === 'pending'`)
   - Customer approved (`customer_approval_status === 'approved'`)

3. **Review States**
   - Review Pages (postPdf not approved)
   - Review Backgrounds (postBria not approved)
   - Review Poses (preBria not approved)

4. **Processing States**
   - In Queue
   - New
   - Processing (with workflow context)

5. **Final States**
   - Ready to Print
   - Printing
   - Shipped
   - Delivered

## Status Detection Logic Flow

```
1. Check for errors (with workflow_step exclusion)
   ├─ Missing manifest → MISSING_MANIFEST
   ├─ Stuck processing (workflow NOT completed) → STUCK_PROCESSING
   ├─ Max retries → MAX_RETRIES
   └─ Multiple errors → MULTIPLE_ERRORS

2. Check customer approval status
   ├─ customer_approval_status === 'pending' → AWAITING_CUSTOMER
   ├─ customer_approval_status === 'approved' → READY_TO_PRINT or PRINTING
   └─ customer_approval_status === 'revision_requested' → NEEDS_REVISION

3. Check review stages (in reverse order: postPdf → postBria → preBria)
   ├─ postPdf not approved → REVIEW_PAGES
   ├─ postBria not approved → REVIEW_BACKGROUNDS
   └─ preBria not approved → REVIEW_POSES

4. Check workflow completion
   ├─ workflow_step === 'book_assembly_completed' → PROOF_READY (if postPdf approved)
   ├─ workflow_step === '2B-complete' → APPROVED (if postBria approved, waiting for 3)
   └─ workflow_step === '2A-complete' → APPROVED (if preBria approved, waiting for 2B)

5. Check execution status
   ├─ execution_status === 'ready_for_processing' + queued_at → IN_QUEUE
   ├─ execution_status === 'ready_for_processing' + !queued_at → NEW
   └─ execution_status === 'processing' → Check workflow_step (if completed, not stuck)

6. Default
   └─ NEW
```

## Implementation Checklist

- [ ] Fix customer approval API to update `execution_status` and `workflow_step`
- [ ] Rename "Send Proof" to "Send for Customer Approval"
- [ ] Update stuck detection to exclude completed workflows (already done in SQL + API)
- [ ] Update `status-display.ts` to use workflow_step exclusion (already done)
- [ ] Add comprehensive logging for status determination
- [ ] Create unit tests for all state combinations
- [ ] Document all edge cases

## Edge Cases

### Edge Case 1: Order Stuck Between Workflows
- `execution_status`: `'processing'`
- `workflow_step`: `'2A-complete'`
- `current_workflow`: `null`
- `started_at`: `<old timestamp>`
- **Detection**: NOT stuck (workflow completed, waiting for review)

### Edge Case 2: Customer Approved But execution_status Not Updated
- `execution_status`: `'processing'`
- `workflow_step`: `'customer_approval'`
- `customer_approval_status`: `'approved'`
- `started_at`: `<old timestamp>`
- **Detection**: Currently flagged as "stuck" (BUG - should update execution_status)

### Edge Case 3: Order in Review But No workflow_step Set
- `execution_status`: `'processing'`
- `workflow_step`: `null`
- `manifest_2a_url`: `<url>` (indicates 2A completed)
- **Detection**: Use manifest URLs as fallback indicator

### Edge Case 4: Multiple Manifests Exist
- `manifest_2a_url`: `<url>`
- `manifest_2b_url`: `<url>`
- `manifest_3_url`: `<url>`
- `workflow_step`: `'book_assembly_completed'`
- **Detection**: Use highest manifest (3) to determine current state

## Testing Scenarios

1. **New Order**: `execution_status: 'new'`, `workflow_step: 'order_intake'`, `queued_at: null`
2. **Queued Order**: `execution_status: 'ready_for_processing'`, `queued_at: <timestamp>`
3. **Processing 2A**: `execution_status: 'processing'`, `current_workflow: '2A'`, `started_at: <timestamp>`
4. **2A Complete, Waiting Review**: `execution_status: 'processing'`, `workflow_step: '2A-complete'`, `current_workflow: null`
5. **2A Approved, Waiting 2B**: `execution_status: 'processing'`, `workflow_step: '2A-complete'`, `review_stages.preBria.status: 'approved'`
6. **Customer Approved**: `execution_status: 'ready_for_processing'`, `customer_approval_status: 'approved'`, `workflow_step: 'print_fulfillment'`
7. **Stuck Detection False Positive**: `execution_status: 'processing'`, `workflow_step: 'book_assembly_completed'`, `started_at: <old>`

