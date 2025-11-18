# Admin Status Reference
## Complete Details for Admin-Facing Status Display

This document provides complete details for all admin status badges and their logic.

---

## 📋 **All Admin Statuses**

See `docs/status/ORDER_STATUS_COMPLETE_REFERENCE.md` for the consolidated reference.

---

## 🎨 **Status Badge Colors**

- **Gray** - New/In Queue
- **Blue** - Review stages (varies by revision count)
- **Yellow** - Ready to Print
- **Indigo** - Printing
- **Green** - Shipped/Delivered
- **Red** - Action Required/Errors
- **Orange** - Needs Revision

---

## 📊 **Status Priority Logic**

The admin status display checks in this order:

1. **Error States** (highest priority)
2. **Delivered State**
3. **Shipped State**
4. **Customer Revision Requested**
5. **Awaiting Customer**
6. **All Stages Approved**
7. **Review Stages**
8. **New/In Queue** (default)

---

## 🔍 **Lulu Status Mapping**

All pre-production Lulu statuses (CREATED through PRODUCTION_READY) show as **"Printing"** badge.

When `IN_PRODUCTION`, shows **"Printing"** badge.

When `SHIPPED`, shows **"Shipped"** badge.

When `REJECTED` or `CANCELED`, shows **"Action Required"** badge.

---

**See Also**: 
- `docs/status/ORDER_STATUS_COMPLETE_REFERENCE.md` - Main reference
- `docs/lulu/LULU_INTEGRATION.md` - Lulu status details

