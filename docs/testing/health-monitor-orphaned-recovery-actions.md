# Health Monitor - Orphaned Recovery Actions

> **See Also**: 
> - `docs/database/orphaned-orders-prevention-system.md` - Orphaned orders system overview
> - `docs/database/implementation-summary.md` - Implementation status

## Overview

The Health Monitor workflow (W1.5) processes orphaned orders through 4 distinct recovery actions. Each action is triggered based on the order's classification in the "Orphaned: Classify Orphans" node.

## The 4 Orphaned Recovery Actions

### 1. **Create Manifest** (`create_manifest`)
**When it's used:**
- Order is missing `one_manifest_url` AND
- Order is at workflow 3 or 4 (`next_workflow` is '3' or '4')
- OR order has an unknown `orphan_reason` but needs a manifest

**What it does:**
- Calls `/api/admin/orders/{orderId}/create-manifest`
- Creates a 1-manifest.json file from Supabase order data
- Uploads manifest to R2 storage
- Updates Supabase: sets `one_manifest_url`, `execution_status = 'ready_for_processing'`, `next_workflow = '2A'`
- Clears error fields

**Status:** ✅ Implemented in workflow, ✅ Backend API exists

---

### 2. **Schedule Retry** (`schedule_retry`)
**When it's used:**
- Order has `orphan_reason = 'error_no_retry_scheduled'` AND
- `retry_count < 3` (has retries remaining)

**What it does:**
- PATCH Supabase: increments `retry_count`, sets `next_retry_at` to 5 minutes from now
- Sets `execution_status = 'ready_for_processing'`
- Clears `current_workflow` and `started_at`
- Clears error fields

**Status:** ✅ Implemented in workflow, ✅ Tested (via stuck path)

---

### 3. **Mark for Manual Review** (`require_manual_review`)
**When it's used:**
- `orphan_reason = 'error_max_retries_exceeded'` (retry_count >= 3)
- `orphan_reason = 'manual_review_pending'` (already in manual review > 24 hours)
- `orphan_reason = 'ready_not_picked_up'` AND `next_workflow = '4'` AND missing manifest
- Unknown `orphan_reason` with no clear recovery path

**What it does:**
- PATCH Supabase: sets `execution_status = 'error_requires_manual_review'`
- Sets `requires_human_review = true`
- Sets error message: "Orphaned order: Max retries exceeded or stuck. Requires manual intervention."
- Sets `error_type = 'orphaned_order'`

**Status:** ✅ Implemented in workflow, ⚠️ Not yet tested

---

### 4. **Reset Processing** (`reset_processing`)
**When it's used:**
- `orphan_reason = 'ready_not_picked_up'` AND NOT (workflow 4 + missing manifest)
- `orphan_reason = 'processing_stuck_over_hour'` or `'processing_no_timestamp'`

**What it does:**
- PATCH Supabase: sets `execution_status = 'ready_for_processing'`
- Clears `current_workflow` and `started_at`
- Clears error fields
- Keeps `next_workflow` as-is (doesn't reset it)

**Status:** ✅ Implemented in workflow, ✅ Tested

---

## Testing Status

| Action | Workflow Status | Backend API | Test Status |
|--------|----------------|-------------|-------------|
| Create Manifest | ✅ Implemented | ✅ `/api/admin/orders/[orderId]/create-manifest` | ⚠️ Not tested |
| Schedule Retry | ✅ Implemented | ✅ Direct Supabase PATCH | ✅ Tested (via stuck path) |
| Manual Review | ✅ Implemented | ✅ Direct Supabase PATCH | ⚠️ Not tested |
| Reset Processing | ✅ Implemented | ✅ Direct Supabase PATCH | ✅ Tested |

---

## Backend UI Buttons

### "Create Manifest" Button
**Location:** Order detail page (`/orders/[orderId]`)
**Visibility:** Shows when `!order.oneManifestUrl`
**Action:** Calls `/api/admin/orders/{orderId}/create-manifest`
**Status:** ✅ Implemented, ⚠️ Not tested

### "Reset Order" Button
**Location:** Order detail page (`/orders/[orderId]`)
**Visibility:** Shows when `order.executionStatus === 'error' || order.executionStatus === 'error_requires_manual_review'`
**Action:** Calls `/api/admin/orders/{orderId}/reset`
**Status:** ✅ Implemented, ⚠️ Not tested

---

## Testing Plan

### Phase 1: Test Orphaned Recovery Actions via Health Monitor

1. **Create Manifest Action**
   - Set up order: `next_workflow = '4'`, `one_manifest_url = NULL`, `execution_status = 'error'`
   - Run Health Monitor cron
   - Verify: Manifest created in R2, Supabase updated correctly

2. **Schedule Retry Action** (via orphaned path)
   - Set up order: `orphan_reason = 'error_no_retry_scheduled'`, `retry_count = 1`, `execution_status = 'error'`
   - Run Health Monitor cron
   - Verify: `retry_count` incremented, `next_retry_at` set, status reset

3. **Manual Review Action**
   - Set up order: `orphan_reason = 'error_max_retries_exceeded'`, `retry_count = 3`
   - Run Health Monitor cron
   - Verify: `execution_status = 'error_requires_manual_review'`, error message set

4. **Reset Processing Action** (already tested, but verify again)
   - Set up order: `orphan_reason = 'ready_not_picked_up'`, `next_workflow = '2A'`
   - Run Health Monitor cron
   - Verify: Status reset, error fields cleared

### Phase 2: Test Backend UI Buttons

1. **Create Manifest Button**
   - Navigate to order detail page for order without manifest
   - Click "Create Manifest" button
   - Verify: Manifest created, order status updated, page refreshes

2. **Reset Order Button**
   - Navigate to order detail page for order with error status
   - Click "Reset Order" button
   - Verify: Order status reset, error fields cleared, page refreshes

---

## SQL Test Scripts Needed

1. `test-orphaned-create-manifest.sql` - Order at workflow 4, missing manifest
2. `test-orphaned-schedule-retry.sql` - Order with error_no_retry_scheduled, retry_count < 3
3. `test-orphaned-manual-review.sql` - Order with max retries exceeded or manual_review_pending

