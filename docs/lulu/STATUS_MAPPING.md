# Lulu Status Mapping
## Complete Mapping from Lulu API to Our System

---

## ✅ **Verified Status Mapping**

The Lulu status mapping has been **verified and corrected** to match actual Lulu API values.

---

## 📋 **LuluStatus Enum**

```typescript
export enum LuluStatus {
  // Normal flow statuses
  CREATED = 'CREATED',
  UNPAID = 'UNPAID',
  PAYMENT_IN_PROGRESS = 'PAYMENT_IN_PROGRESS',
  PRODUCTION_DELAYED = 'PRODUCTION_DELAYED',
  PRODUCTION_READY = 'PRODUCTION_READY',
  IN_PRODUCTION = 'IN_PRODUCTION',
  SHIPPED = 'SHIPPED',
  
  // Error/problem statuses
  REJECTED = 'REJECTED',
  CANCELED = 'CANCELED',
  
  // Custom status (not from Lulu API)
  DELIVERED = 'DELIVERED', // From tracking/carrier
}
```

---

## 🔄 **Complete Status Mapping**

### **Lulu API Status → Admin DisplayStatus**

| Lulu Status | Admin Display | Order Status |
|------------|---------------|--------------|
| `CREATED` | Printing | `PENDING_PRINT` |
| `UNPAID` | Printing | `PENDING_PRINT` |
| `PAYMENT_IN_PROGRESS` | Printing | `PENDING_PRINT` |
| `PRODUCTION_DELAYED` | Printing | `PENDING_PRINT` |
| `PRODUCTION_READY` | Printing | `PENDING_PRINT` |
| `IN_PRODUCTION` | Printing | `IN_PRODUCTION` |
| `SHIPPED` | Shipped | `SHIPPED` |
| `DELIVERED` | Delivered | `DELIVERED` |
| `REJECTED` | Action Required | `ACTION_REQUIRED` |
| `CANCELED` | Action Required | `CANCELLED` |

### **Lulu API Status → Customer Display**

| Lulu Status | Customer Display |
|------------|------------------|
| `CREATED` | Preparing for Print |
| `UNPAID` | Preparing for Print |
| `PAYMENT_IN_PROGRESS` | Preparing for Print |
| `PRODUCTION_DELAYED` | Preparing for Print |
| `PRODUCTION_READY` | Preparing for Print |
| `IN_PRODUCTION` | Printing Your Book |
| `SHIPPED` | Shipped |
| `DELIVERED` | Delivered |
| `REJECTED` | Action Required |
| `CANCELED` | Canceled |

---

## 🔄 **Status Flow**

### **Normal Flow (Lulu API)**
```
CREATED → UNPAID → PAYMENT_IN_PROGRESS → PRODUCTION_DELAYED → 
PRODUCTION_READY → IN_PRODUCTION → SHIPPED
```

---

**See Also**: 
- `docs/lulu/LULU_INTEGRATION.md` - Main integration guide
- `docs/status/ORDER_STATUS_COMPLETE_REFERENCE.md` - Status reference

