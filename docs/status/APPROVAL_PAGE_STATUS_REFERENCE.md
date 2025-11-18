# Approval Page - All Possible Order Statuses
## Complete Reference for Customer-Facing Status Display

This document lists **all possible statuses** that can appear on the approval page (`/approve/[token]`) after a customer approves their order.

---

## 🎯 **Status Display Logic**

The approval page shows status **only after customer approval**. Status is determined by:
1. **Lulu Status** (from Lulu API) - **Primary source** if available
2. **Order Status** (from our database) - **Fallback** if no Lulu status
3. **Customer Approval Status** - Confirms order is approved

---

## 📋 **All Possible Statuses by Stage**

### **Stage 1: After Approval (Pre-Production)**

**Status**: `customer_approved`, `pending_print`, or any pre-production Lulu status
- **Display**: "Preparing for Print"
- **Message**: "Your order is being prepared for printing."
- **Icon**: ⏳
- **Color**: Blue
- **Includes**: All internal statuses (payment, order received, etc.) are hidden - handled automatically

**Lulu Statuses that show this**:
- `CREATED` - Print-Job created
- `UNPAID` - Print-Job can be paid
- `PAYMENT_IN_PROGRESS` - Payment is in progress
- `PRODUCTION_DELAYED` - Paid, waiting for production delay
- `PRODUCTION_READY` - Production delay ended, ready to enter production

---

### **Stage 2: In Production**

**Lulu Status**: `IN_PRODUCTION`
- **Display**: "Printing Your Book"
- **Message**: "Your book is currently being printed."
- **Icon**: 🖨️
- **Color**: Indigo


**Order Status**: `in_production`
- **Display**: "Printing Your Book"
- **Message**: "Your book is currently being printed."
- **Icon**: 🖨️
- **Color**: Indigo

**Order Status**: `print_submission_completed`
- **Display**: "Printing Your Book"
- **Message**: "Your book is currently being printed."
- **Icon**: 🖨️
- **Color**: Indigo

---

### **Stage 3: Shipping**

**Lulu Status**: `SHIPPED`
- **Display**: "Shipped"
- **Message**: "Your book has been shipped!"
- **Icon**: 📮
- **Color**: Green
- **Includes**: Tracking number, tracking URLs, carrier name

**Order Status**: `shipped`
- **Display**: "Shipped"
- **Message**: "Your book has been shipped!"
- **Icon**: 📮
- **Color**: Green

**Order Status**: `pending_shipping`
- **Display**: "Processing"
- **Message**: "Your order is being processed."
- **Icon**: ⏳
- **Color**: Blue

---

### **Stage 4: Delivered**

**Lulu Status**: `DELIVERED`
- **Display**: "Delivered"
- **Message**: "Your book has been delivered!"
- **Icon**: ✅
- **Color**: Green

**Order Status**: `delivered` or `completed`
- **Display**: "Delivered"
- **Message**: "Your book has been delivered!"
- **Icon**: ✅
- **Color**: Green

---

### **Error/Problem Statuses**

**Lulu Status**: `REJECTED`
- **Display**: "Action Required"
- **Message**: "There is an issue with your order. We'll contact you shortly."
- **Icon**: ⚠️
- **Color**: Red
- **Note**: Customer should contact support

**Lulu Status**: `CANCELED`
- **Display**: "Canceled"
- **Message**: "Your order has been canceled."
- **Icon**: ❌
- **Color**: Gray

**Order Status**: `action_required` or `failed`
- **Display**: "Processing"
- **Message**: "Your order is being processed."
- **Icon**: ⏳
- **Color**: Blue
- **Note**: May need manual intervention

**Order Status**: `cancelled`
- **Display**: "Processing"
- **Message**: "Your order is being processed."
- **Icon**: ⏳
- **Color**: Blue

---

## 🔄 **Status Flow Timeline**

After customer approval, orders progress through this **simplified customer-facing flow**:

```
Customer Approves
   ↓
Preparing for Print
   (Internal: payment, order received, etc. handled automatically)
   ↓
Printing Your Book (Lulu: IN_PRODUCTION)
   ↓
Shipped (Lulu: SHIPPED) ← Tracking info appears
   ↓
Delivered (Lulu: DELIVERED)
```

**Note**: Internal statuses (payment processing, order received, etc.) are **not shown to customers** as they are handled automatically by our workflows.

---

## 📊 **Status Priority**

The status API checks in this order:

1. **Lulu Status** (if available) - Most accurate
2. **Order Status** (fallback) - Our internal status
3. **Default** - "Processing" if nothing matches

---

## 🎨 **Status Display Details**

### **Header Status Indicator** (Short Text)
- Shows in middle of header
- Short status text (e.g., "Printing Your Book")
- Down arrow button to jump to details

### **Detailed Status Timeline**
- Shows progression of statuses
- Each status item has:
  - Icon
  - Label
  - Description
  - Visual indicator (active/completed)

### **Tracking Information** (When Shipped)
- Tracking number
- Tracking URLs (clickable links)
- Carrier name

---

## 🔍 **Status Detection Logic**

The status API uses this logic:

```javascript
// Priority 1: Lulu Status (most accurate)
if (luluStatus) {
  return mapLuluStatusToMessage(luluStatus);
}

// Priority 2: Order Status (fallback)
if (orderStatus === 'customer_approved' || orderStatus === 'pending_print') {
  return "Ready to Print";
}

// Priority 3: Default
return "Processing";
```

---

## 📝 **Complete Status List**

### **From Lulu API:**
1. `CREATED` → "Preparing for Print"
2. `UNPAID` → "Preparing for Print"
3. `PAYMENT_IN_PROGRESS` → "Preparing for Print"
4. `PRODUCTION_DELAYED` → "Preparing for Print"
5. `PRODUCTION_READY` → "Preparing for Print"
6. `IN_PRODUCTION` → "Printing Your Book"
7. `SHIPPED` → "Shipped" (with tracking)
8. `DELIVERED` → "Delivered" (custom status, from tracking)
9. `REJECTED` → "Action Required"
10. `CANCELED` → "Canceled"

### **From Our Order Status:**
1. `customer_approved` → "Preparing for Print"
2. `pending_print` → "Preparing for Print"
3. `print_submission_in_progress` → "Preparing for Print"
4. `print_submission_completed` → "Printing Your Book"
5. `in_production` → "Printing Your Book"
6. `pending_shipping` → "Preparing for Print"
7. `shipped` → "Shipped"
8. `delivered` → "Delivered"
9. `completed` → "Delivered"

---

## ⚠️ **Edge Cases**

### **No Status Available**
- **Display**: "Processing"
- **Message**: "Your order is being processed."
- **When**: Order approved but no Lulu status yet

### **Status Unknown**
- **Display**: "Processing"
- **Message**: "Your order is being processed."
- **When**: Status doesn't match any known values

### **Multiple Status Sources**
- **Priority**: Lulu Status > Order Status > Default
- **When**: Both Lulu and order status exist, use Lulu

---

## 🧪 **Testing Statuses**

To test different statuses, you can:

1. **Manually update database**:
   ```sql
   UPDATE orders 
   SET lulu_status = 'IN_PRODUCTION' 
   WHERE order_id = 'JOHN-TEST5';
   ```

2. **Wait for real updates** (when Lulu integration is complete)

3. **Use test order**: `JOHN-TEST5-fa91c26ceed89b7b`

---

## 📚 **Related Documentation**

- `docs/LULU_ORDER_STATUSES.md` - Complete Lulu status reference
- `docs/ORDER_STATUS_SOURCE_OF_TRUTH.md` - Internal status system
- `back-end/src/constants/statuses.ts` - Status constants
- `back-end/src/lib/status-display.ts` - Status display logic

---

**Last Updated**: January 2025
**Status**: ✅ Complete - All possible statuses documented

