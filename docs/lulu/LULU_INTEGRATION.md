# Lulu API Integration
## Complete Guide to Lulu Print-on-Demand Integration

This document consolidates all Lulu-related documentation.

---

## 📋 **Quick Links**

- **Status Reference**: [Lulu Statuses](#lulu-statuses)
- **Error Handling**: [Error Handling](#error-handling)
- **Status Mapping**: [Status Mapping](#status-mapping)
- **Webhooks**: [Webhook Setup](#webhook-setup)

---

## 📦 **Lulu Statuses**

### **Normal Flow**

1. **CREATED** - Print-Job created
2. **UNPAID** - Print-Job can be paid
3. **PAYMENT_IN_PROGRESS** - Payment is in progress
4. **PRODUCTION_DELAYED** - Paid, waiting for production delay
5. **PRODUCTION_READY** - Production delay ended, ready to enter production
6. **IN_PRODUCTION** - Print-Job submitted to printer
7. **SHIPPED** - Print-Job is fully shipped

### **Error States**

- **REJECTED** - Problem with input data or file
- **CANCELED** - Print-Job was canceled

### **Custom Status**

- **DELIVERED** - Not from Lulu API, we track this from carrier tracking data

---

## 🔄 **Status Mapping**

### **To Admin Display**

| Lulu Status | Admin Display |
|------------|---------------|
| CREATED through PRODUCTION_READY | **Printing** |
| IN_PRODUCTION | **Printing** |
| SHIPPED | **Shipped** |
| DELIVERED | **Delivered** |
| REJECTED | **Action Required** |
| CANCELED | **Action Required** |

### **To Customer Display**

| Lulu Status | Customer Display |
|------------|------------------|
| CREATED through PRODUCTION_READY | **Preparing for Print** |
| IN_PRODUCTION | **Printing Your Book** |
| SHIPPED | **Shipped** |
| DELIVERED | **Delivered** |
| REJECTED | **Action Required** |
| CANCELED | **Canceled** |

---

## 🚨 **Error Handling**

### **REJECTED Status**

- **When**: Problem with input data or file
- **Includes**: Detailed error message
- **Action**: Manual intervention needed
- **Customer Message**: "Action Required - We'll contact you shortly"

### **CANCELED Status**

- **When**: Order was canceled
- **Action**: None (order is canceled)
- **Customer Message**: "Canceled"

### **How Lulu Notifies Us**

1. **Webhooks** (Recommended) - Real-time notifications
2. **Polling** - Check status API periodically
3. **On Page Load** - Check when customer views page

See `docs/lulu/LULU_ERROR_HANDLING.md` for complete error handling guide.

---

## 📡 **Webhook Setup**

### **Subscribe to Webhooks**

**Topic**: `PRINT_JOB_STATUS_CHANGED`

**Endpoint**: `POST /api/webhooks/lulu/status`

**Benefits**:
- ✅ Real-time notifications
- ✅ No polling needed
- ✅ Includes detailed error messages

See `docs/lulu/LULU_ERROR_HANDLING.md` for webhook implementation details.

---

## 📚 **Related Documentation**

- **Status Reference**: `docs/status/ORDER_STATUS_COMPLETE_REFERENCE.md`
- **Error Handling**: `docs/lulu/LULU_ERROR_HANDLING.md`
- **Status Mapping**: `docs/lulu/STATUS_MAPPING.md`

---

**Last Updated**: January 2025
**Status**: ✅ Complete

