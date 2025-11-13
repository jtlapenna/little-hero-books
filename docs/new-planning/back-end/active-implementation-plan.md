# Active Implementation Plan: Error Badges and Order Management System

**Status**: Active  
**Last Updated**: January 2025  
**Deferred Projects**: Archive Functionality, Admin Order Creation Form

---

## Overview

This plan focuses on fixing critical bugs and implementing error badge system improvements. Two major features (Archive Functionality and Admin Order Creation Form) have been deferred to separate projects with their own planning documents.

---

## Deferred Projects

### 1. Archive Functionality
**Status**: DEFERRED  
**Planning Document**: `docs/new-planning/back-end/archive-functionality-project.md`  
**Reason**: Can be implemented later, not critical for current workflow

### 2. Admin Order Creation Form
**Status**: DEFERRED  
**Planning Document**: `docs/new-planning/back-end/admin-order-creation-project.md`  
**Reason**: Large feature, can be tackled as separate project

---

## Active Phases

### Phase 0: Critical Bug Fix (HIGH PRIORITY)
**Status**: READY TO IMPLEMENT

#### 0.1 Fix Recovery Actions to Clear Error Status
- **File**: `back-end/src/app/api/admin/orphaned-orders/route.ts`
- **Issue**: Recovery actions set `execution_status: 'error'` which keeps "ACTION REQUIRED" badge visible
- **Fix**: Update recovery actions to set `execution_status: 'ready_for_processing'` and clear error fields

#### 0.2 Fix Stuck Orders Recovery Actions
- **File**: `back-end/src/app/api/admin/stuck-orders/route.ts`
- **Fix**: Apply same fix - clear error status when resetting stuck orders

#### 0.3 Create Unified "Orders Needing Attention" Page
- **File**: `back-end/src/app/admin/orders-needing-attention/page.tsx` (new)
- **Purpose**: Single page showing ALL orders with issues (replaces separate stuck/orphaned pages)
- **Data Sources**: 
  - Orders with `execution_status IN ('error', 'error_requires_manual_review')`
  - Orders from `orphaned_orders` view
  - Orders from stuck orders query

#### 0.4 Update API Endpoint for Unified View
- **File**: `back-end/src/app/api/admin/orders-needing-attention/route.ts` (new)
- **GET**: Returns all orders needing attention
- **POST**: Bulk recovery actions

#### 0.5 Update Navigation & Remove Old Pages
- Redirect `/admin/orphaned-orders` → `/admin/orders-needing-attention`
- Redirect `/admin/stuck-orders` → `/admin/orders-needing-attention`
- Update navigation menu

#### 0.6 Ensure Badge Logic Matches Error Detection
- **File**: `back-end/src/lib/status-display.ts`
- Verify orders with cleared error status don't show ACTION_REQUIRED badge

---

### Phase 1: Error Badge System
**Status**: READY TO IMPLEMENT

#### 1.1 Define Error Badge Types
- **File**: `back-end/src/constants/statuses.ts`
- Add badge types: `MISSING_MANIFEST`, `MAX_RETRIES`, `WORKFLOW_TIMEOUT`, `API_ERROR`, `STUCK_PROCESSING`, `NOT_PICKED_UP`, `MULTIPLE_ERRORS`
- Add labels and color schemes

#### 1.2 Error Detection Logic
- **File**: `back-end/src/lib/status-display.ts`
- Modify `getDisplayStatusForOrder()` to detect all error conditions
- Return array of all errors found
- If multiple errors, return `MULTIPLE_ERRORS` with error list

#### 1.3 Multiple Errors Badge Component
- **File**: `back-end/src/components/ui/multiple-errors-badge.tsx` (new)
- Shows "Multiple Errors" badge with hover tooltip
- Tooltip shows all error types and descriptions

#### 1.4 Update Order List Display
- **Files**: `back-end/src/app/orders/page.tsx`, `back-end/src/components/orders/order-list-item.tsx`
- Show specific error badges instead of generic "Action Required"
- Implement hover tooltip for multiple errors

#### 1.5 Update Order Detail Page
- **File**: `back-end/src/app/orders/[orderId]/page.tsx`
- Show all error badges in error section
- Display detailed error information panel

---

### Phase 3: Recovery Actions
**Status**: READY TO IMPLEMENT

#### 3.1 Create Manifest Button
- **File**: `back-end/src/app/api/admin/orders/[orderId]/create-manifest/route.ts` (new)
- Endpoint: `POST /api/admin/orders/[orderId]/create-manifest`
- Validates order has required data
- Builds 1-manifest.json from Supabase data
- Uploads to R2
- Updates Supabase

#### 3.2 Reset Order Button
- **File**: `back-end/src/app/api/admin/orders/[orderId]/reset/route.ts` (new)
- Endpoint: `POST /api/admin/orders/[orderId]/reset`
- Resets order to initial state
- Clears error fields

#### 3.3 UI Integration
- **File**: `back-end/src/app/orders/[orderId]/page.tsx`
- Add "Recovery Actions" section
- Show buttons based on order state

---

### Phase 4: Router Validation
**Status**: READY TO IMPLEMENT

#### 4.1 W1.1 Router Manifest Check
- **File**: `docs/n8n-workflow-files/finals/LHB - 1.1- Queue Manager and Router.json`
- In "Prep Workflow 3 Orders" and "Prep Workflow 4 Orders" nodes
- Check if required manifest exists
- If missing: mark as error with `error_type: 'missing_manifest'`

#### 4.2 W1.4 Missing Manifest Detection
- **File**: `docs/n8n-workflow-files/finals/LHB - 1.4- Orphaned Orders Monitor.json`
- Add check for missing manifests
- Route to "Recover: Create Manifest" action

---

### Phase 6: UI Improvements
**Status**: READY TO IMPLEMENT

#### 6.1 Fix Orphaned Orders Table Width
- **File**: `back-end/src/app/admin/orphaned-orders/page.tsx`
- Add horizontal scrolling wrapper
- Optimize column widths

#### 6.2 Error Badge Tooltip Component
- **File**: `back-end/src/components/ui/error-badge-tooltip.tsx` (new)
- Reusable tooltip component for error badges

#### 6.3 Dashboard Badge Summary
- **File**: `back-end/src/app/page.tsx` (or dashboard page)
- Show summary of error types

---

### Phase 7: Testing & Validation
**Status**: READY TO IMPLEMENT

#### 7.1 Error Badge Testing
- Test all error conditions
- Verify badge colors and tooltips

#### 7.2 Recovery Actions Testing
- Test "Create Manifest" with valid/invalid data
- Test "Reset Order" for various error states

#### 7.3 Router Validation Testing
- Test W1.1 skips orders with missing manifests
- Test W1.4 detects and recovers missing manifest orders

---

## Implementation Order

1. **Phase 0** (Critical Bug Fix) - Fix recovery actions and unified error page
2. **Phase 1** (Error Badges) - Implement specific error badges
3. **Phase 3** (Recovery Actions) - Add recovery buttons
4. **Phase 4** (Router Validation) - Add manifest checks
5. **Phase 6** (UI Improvements) - Polish UI
6. **Phase 7** (Testing) - Comprehensive testing

---

## File Changes Summary

### New Files
- `back-end/src/components/ui/multiple-errors-badge.tsx`
- `back-end/src/components/ui/error-badge-tooltip.tsx`
- `back-end/src/app/admin/orders-needing-attention/page.tsx`
- `back-end/src/app/api/admin/orders-needing-attention/route.ts`
- `back-end/src/app/api/admin/orders/[orderId]/create-manifest/route.ts`
- `back-end/src/app/api/admin/orders/[orderId]/reset/route.ts`

### Modified Files
- `back-end/src/constants/statuses.ts`
- `back-end/src/lib/status-display.ts`
- `back-end/src/app/orders/page.tsx`
- `back-end/src/app/orders/[orderId]/page.tsx`
- `back-end/src/components/orders/order-list-item.tsx`
- `back-end/src/app/admin/orphaned-orders/page.tsx`
- `back-end/src/app/api/admin/orphaned-orders/route.ts`
- `back-end/src/app/api/admin/stuck-orders/route.ts`
- `docs/n8n-workflow-files/finals/LHB - 1.1- Queue Manager and Router.json`
- `docs/n8n-workflow-files/finals/LHB - 1.4- Orphaned Orders Monitor.json`

---

## Estimated Timeline

- **Phase 0**: 2-3 hours (Critical bug fix)
- **Phase 1**: 4-6 hours (Error badges)
- **Phase 3**: 2-3 hours (Recovery actions)
- **Phase 4**: 1-2 hours (Router validation)
- **Phase 6**: 1-2 hours (UI improvements)
- **Phase 7**: 4-6 hours (Testing)
- **Total**: 14-22 hours (2-3 days full-time)

---

## Notes

- Archive functionality and Admin Order Creation Form have been deferred
- See separate planning documents for those projects
- Focus is on bug fixes and error visibility improvements
- All phases are ready to implement in order listed above

