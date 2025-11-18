# Admin Page - Order Status Reference
## Complete Reference for Admin-Facing Status Display

This document lists **all possible statuses** that appear on the admin orders page (`/orders`) and how they map to Lulu API statuses.

---

## 🎯 **Status Display Logic**

The admin page shows **detailed internal statuses** for managing orders. Status is determined by:
1. **DisplayStatus** (calculated from order state) - **Primary source**
2. **Lulu Status** (from Lulu API) - Used to determine printing/shipping states
3. **Order Status** (from our database) - Internal workflow status
4. **Review Stages** - Individual stage approval statuses

---

## 📋 **All Possible Admin Statuses**

### **Normal Flow Statuses**

1. **New** - Order just created, not yet queued
2. **In Queue** - Order queued for processing, waiting for router
3. **Review Poses** - Waiting for pose review (preBria stage)
4. **Review Backgrounds** - Waiting for background review (postBria stage)
5. **Review Pages** - Waiting for page review (postPdf stage)
6. **Proof Ready** - All stages approved, proof ready for customer
7. **Awaiting Customer** - Proof sent to customer, waiting for approval
8. **Needs Revision** - Customer requested revision
9. **Ready to Print** - Customer approved, ready to send to print
10. **Printing** - Order sent to Lulu, in production
11. **Shipped** - Book has been shipped
12. **Delivered** - Book has been delivered

---

## 🔄 **Lulu Status Mapping (Admin View)**

### **All Pre-Production Lulu Statuses → "Printing" Badge**

When an order has any of these Lulu statuses, the admin page shows **"Printing"**:

| Lulu Status | Admin Display | Order Status | Notes |
|------------|---------------|--------------|-------|
| `CREATED` | **Printing** | `PENDING_PRINT` | Order created, not yet paid |
| `UNPAID` | **Printing** | `PENDING_PRINT` | Waiting for payment |
| `PAYMENT_IN_PROGRESS` | **Printing** | `PENDING_PRINT` | Payment processing |
| `PRODUCTION_DELAYED` | **Printing** | `PENDING_PRINT` | Paid, waiting for delay |
| `PRODUCTION_READY` | **Printing** | `PENDING_PRINT` | Ready to enter production |
| `IN_PRODUCTION` | **Printing** | `IN_PRODUCTION` | Currently being printed |

### **Shipping Statuses**

| Lulu Status | Admin Display | Order Status | Notes |
|------------|---------------|--------------|-------|
| `SHIPPED` | **Shipped** | `SHIPPED` | Book shipped, tracking available |
| `DELIVERED` | **Delivered** | `DELIVERED` | Book delivered (from tracking) |

### **Error Statuses**

| Lulu Status | Admin Display | Order Status | Notes |
|------------|---------------|--------------|-------|
| `REJECTED` | **Action Required** | `ACTION_REQUIRED` | Order rejected by Lulu |
| `CANCELED` | **Action Required** | `CANCELLED` | Order was canceled |

---

## 🎨 **Status Badge Colors**

Status badges use color coding to indicate state:

- **Gray** - New/In Queue
- **Blue** - Review stages (varies by revision count)
- **Yellow** - Ready to Print
- **Indigo** - Printing
- **Green** - Shipped/Delivered
- **Red** - Action Required/Errors
- **Orange** - Needs Revision

---

## 📊 **Status Priority**

The admin status display logic checks in this order:

1. **Error States** (highest priority)
   - Execution status errors
   - Missing manifest
   - Max retries
   - Workflow timeout
   - API errors
   - Stuck processing

2. **Delivered State**
   - Lulu status: `DELIVERED`
   - Order status: `delivered` or `completed`

3. **Shipped State**
   - Lulu status: `SHIPPED`
   - Order status: `shipped`

4. **Customer Revision Requested**
   - Shows which review stage needs attention

5. **Awaiting Customer**
   - Customer approval status: `pending`
   - Proof sent but not yet approved

6. **All Stages Approved**
   - If customer approved → "Ready to Print" or "Printing"
   - If not sent to customer → "Proof Ready"

7. **Review Stages**
   - Determines which stage needs review (poses, backgrounds, pages)

8. **New/In Queue**
   - Default fallback

---

## 🔍 **Status Detection Details**

### **Printing Status Detection**

An order shows "Printing" if:
- Customer has approved AND
- Order has been sent to Lulu (any Lulu status exists) OR
- Order status is `PENDING_PRINT`, `PRINT_SUBMISSION_IN_PROGRESS`, `PRINT_SUBMISSION_COMPLETED`, or `IN_PRODUCTION`

### **Lulu Status Integration**

The admin page checks `order.luluStatus` to determine:
- If order is with Lulu (any Lulu status = "Printing")
- If order is shipped (`SHIPPED` = "Shipped" badge)
- If order is delivered (`DELIVERED` = "Delivered" badge)
- If order has errors (`REJECTED` or `CANCELED` = "Action Required" badge)

---

## 📝 **Complete Status List**

### **DisplayStatus Enum Values**

All possible admin status badges:

1. `new` - New
2. `in_queue` - In Queue
3. `review_poses` - Review Poses
4. `review_backgrounds` - Review Backgrounds
5. `review_pages` - Review Pages
6. `approved` - Approved (stage approved, waiting for next workflow)
7. `proof_ready` - Proof Ready
8. `awaiting_customer` - Awaiting Customer
9. `needs_revision` - Needs Revision
10. `ready_to_print` - Ready to Print
11. `printing` - Printing
12. `shipped` - Shipped
13. `delivered` - Delivered
14. `action_required` - Action Required
15. `manual_review_required` - Manual Review Required
16. `missing_manifest` - Missing Manifest
17. `max_retries` - Max Retries Exceeded
18. `workflow_timeout` - Workflow Timeout
19. `api_error` - API Error
20. `stuck_processing` - Stuck Processing
21. `not_picked_up` - Not Picked Up
22. `multiple_errors` - Multiple Errors

---

## 🔄 **Status Flow (Admin View)**

```
New
  ↓
In Queue
  ↓
Review Poses (preBria)
  ↓
Review Backgrounds (postBria)
  ↓
Review Pages (postPdf)
  ↓
Proof Ready
  ↓
Awaiting Customer
  ↓
Ready to Print (after customer approval)
  ↓
Printing (all Lulu pre-production + production statuses)
  ↓
Shipped
  ↓
Delivered
```

---

## ⚠️ **Error States**

If an order has errors, it shows specific error badges:

- **Action Required** - Generic error
- **Manual Review Required** - Requires human intervention
- **Missing Manifest** - Manifest file missing
- **Max Retries** - Retry limit exceeded
- **Workflow Timeout** - Workflow timed out
- **API Error** - API call failed
- **Stuck Processing** - Order stuck in processing
- **Not Picked Up** - Queued but not picked up by router
- **Multiple Errors** - Multiple errors detected (shows tooltip with all errors)

---

## 📚 **Related Documentation**

- `docs/LULU_STATUS_MAPPING_VERIFIED.md` - Complete Lulu status mapping
- `docs/APPROVAL_PAGE_STATUS_REFERENCE.md` - Customer-facing status reference
- `docs/LULU_ORDER_STATUSES.md` - Lulu API status reference
- `back-end/src/constants/statuses.ts` - Status constants
- `back-end/src/lib/status-display.ts` - Status display logic

---

**Last Updated**: January 2025
**Status**: ✅ Complete - All admin statuses documented

