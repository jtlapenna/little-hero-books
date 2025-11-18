# Order Status - Complete Reference
## Single Source of Truth for All Order Statuses

This document consolidates all order status information for both **admin** and **customer-facing** displays.

---

## 📋 **Quick Reference**

- **Admin Status Reference**: See [Admin Statuses](#admin-statuses) section
- **Customer Status Reference**: See [Customer Statuses](#customer-statuses) section  
- **Lulu API Statuses**: See [Lulu Integration](#lulu-integration) section
- **Status Flow**: See [Status Flow Diagrams](#status-flow-diagrams) section

---

## 🎯 **Status System Overview**

Our status system has three layers:

1. **OrderStatus** (Internal) - Detailed workflow statuses
2. **DisplayStatus** (Admin) - Admin-friendly badges
3. **Customer Status** (Customer) - Simplified customer messages

---

## 👥 **Admin Statuses**

### **Normal Flow Statuses**

1. **New** - Order just created, not yet queued
2. **In Queue** - Order queued for processing
3. **Review Poses** - Waiting for pose review (preBria)
4. **Review Backgrounds** - Waiting for background review (postBria)
5. **Review Pages** - Waiting for page review (postPdf)
6. **Proof Ready** - All stages approved, proof ready
7. **Awaiting Customer** - Proof sent, waiting for approval
8. **Needs Revision** - Customer requested revision
9. **Ready to Print** - Customer approved, ready to send
10. **Printing** - Order sent to Lulu, in production
11. **Shipped** - Book has been shipped
12. **Delivered** - Book has been delivered

### **Error Statuses**

- **Action Required** - Generic error
- **Manual Review Required** - Requires intervention
- **Missing Manifest** - Manifest file missing
- **Max Retries** - Retry limit exceeded
- **Workflow Timeout** - Workflow timed out
- **API Error** - API call failed
- **Stuck Processing** - Order stuck
- **Not Picked Up** - Queued but not picked up
- **Multiple Errors** - Multiple errors detected

See `docs/status/ADMIN_STATUS_DETAILS.md` for complete admin status reference.

---

## 👤 **Customer Statuses**

### **Simplified 4-Stage Flow**

1. **Preparing for Print** - All pre-production statuses (payment, order received, etc.)
2. **Printing Your Book** - Book is being printed
3. **Shipped** - Book has been shipped (with tracking)
4. **Delivered** - Book has been delivered

### **Error States**

- **Action Required** - Issue with order
- **Canceled** - Order was canceled

See `docs/status/CUSTOMER_STATUS_DETAILS.md` for complete customer status reference.

---

## 📦 **Lulu Integration**

### **Lulu API Statuses**

| Lulu Status | Admin Display | Customer Display | Notes |
|------------|---------------|------------------|-------|
| `CREATED` | Printing | Preparing for Print | Order created |
| `UNPAID` | Printing | Preparing for Print | Waiting for payment |
| `PAYMENT_IN_PROGRESS` | Printing | Preparing for Print | Payment processing |
| `PRODUCTION_DELAYED` | Printing | Preparing for Print | Paid, waiting for delay |
| `PRODUCTION_READY` | Printing | Preparing for Print | Ready to enter production |
| `IN_PRODUCTION` | Printing | Printing Your Book | Currently being printed |
| `SHIPPED` | Shipped | Shipped | With tracking info |
| `DELIVERED` | Delivered | Delivered | From tracking data |
| `REJECTED` | Action Required | Action Required | Error/problem |
| `CANCELED` | Action Required | Canceled | Order canceled |

See `docs/lulu/LULU_INTEGRATION.md` for complete Lulu integration details.

---

## 🔄 **Status Flow Diagrams**

### **Admin Flow**
```
New → In Queue → Review Poses → Review Backgrounds → Review Pages → 
Proof Ready → Awaiting Customer → Ready to Print → Printing → Shipped → Delivered
```

### **Customer Flow** (Simplified)
```
Customer Approves → Preparing for Print → Printing Your Book → Shipped → Delivered
```

---

## 📚 **Related Documentation**

- **Lulu Integration**: `docs/lulu/LULU_INTEGRATION.md`
- **Status Implementation**: `docs/status/STATUS_IMPLEMENTATION.md`
- **Status Constants**: `back-end/src/constants/statuses.ts`
- **Status Display Logic**: `back-end/src/lib/status-display.ts`

---

**Last Updated**: January 2025
**Status**: ✅ Complete Reference

