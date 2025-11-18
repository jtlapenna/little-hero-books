# Customer Status Reference
## Complete Details for Customer-Facing Status Display

This document provides complete details for customer-facing status display on the approval page.

---

## 📋 **Simplified 4-Stage Flow**

1. **Preparing for Print** - All pre-production statuses grouped
2. **Printing Your Book** - Book is being printed
3. **Shipped** - Book has been shipped (with tracking)
4. **Delivered** - Book has been delivered

---

## 🎯 **Status Display Logic**

Status is determined by:
1. **Lulu Status** (primary) - If available
2. **Order Status** (fallback) - Our internal status
3. **Default** - "Preparing for Print" if nothing matches

---

## 📦 **Lulu Status Mapping**

All pre-production Lulu statuses show as **"Preparing for Print"**:
- `CREATED`
- `UNPAID`
- `PAYMENT_IN_PROGRESS`
- `PRODUCTION_DELAYED`
- `PRODUCTION_READY`

`IN_PRODUCTION` shows as **"Printing Your Book"**.

`SHIPPED` shows as **"Shipped"** (with tracking info).

`REJECTED` shows as **"Action Required"**.

`CANCELED` shows as **"Canceled"**.

---

## 🎨 **UI Components**

- **Header Status Indicator** - Short status in header
- **Detailed Status Timeline** - Progressive status items
- **Tracking Information** - Shown when shipped

---

**See Also**: 
- `docs/status/ORDER_STATUS_COMPLETE_REFERENCE.md` - Main reference
- `docs/lulu/LULU_INTEGRATION.md` - Lulu status details

