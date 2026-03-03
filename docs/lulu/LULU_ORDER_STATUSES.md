# Lulu Order Status Reference
## Complete List of Possible Order Statuses from Lulu API

---

## **Normal Status Flow**

Orders typically progress through these statuses in order:

1. **CREATED** - Print-Job created
   - Initial state when order is first submitted to Lulu
   - Order exists but not yet paid

2. **UNPAID** - Print-Job can be paid
   - Order is ready for payment
   - Waiting for payment processing

3. **PAYMENT_IN_PROGRESS** - Payment is in progress
   - Payment is being processed
   - Usually a brief state

4. **PRODUCTION_DELAYED** - Print-Job is paid and will move to production after mandatory delay
   - Payment successful
   - Waiting for mandatory production delay period to end
   - This is a built-in delay before production starts

5. **PRODUCTION_READY** - Production delay has ended, will move to "in production" shortly
   - Delay period completed
   - Order is queued to enter production
   - Transition state before IN_PRODUCTION

6. **IN_PRODUCTION** - Print-Job submitted to printer
   - Order is actively being printed
   - This is the main production state
   - Can take several days

7. **SHIPPED** - Print-Job is fully shipped
   - All items have been shipped
   - Tracking information available (tracking_id, tracking_urls; carrier may be in `CARRIER_NAME`, `carrier_name`, or `carrier`)
   - Final state before delivery

---

## **Error/Problem Statuses**

These statuses indicate issues that need attention:

8. **REJECTED** - Problem with input data or file
   - Order was rejected by Lulu
   - Usually includes detailed error message
   - Requires manual intervention
   - **Action Required**: Contact Lulu support or fix the issue

9. **CANCELED** - Print-Job was canceled
   - Can be canceled by you (if UNPAID)
   - Can be canceled by Lulu (rare, if production issue)
   - Order will not be fulfilled
   - **Action Required**: None (order is canceled)

---

## **Additional Statuses (From Our System)**

We also track one custom status that is not from the Lulu API:

- **DELIVERED** - Order has been delivered (not from Lulu API, we track this separately from carrier tracking data)

**Note**: All other statuses come directly from the Lulu API. See `docs/lulu/LULU_STATUS_MAPPING_VERIFIED.md` for complete mapping details.

---

## **Status Display Mapping**

### **Customer-Facing Display** (Simplified Flow)

For customer-facing display, we map Lulu statuses to simplified user-friendly messages:

| Lulu Status | Customer Message | Color | Icon |
|------------|------------------|-------|------|
| CREATED | "Preparing for Print" | Blue | ⏳ |
| UNPAID | "Preparing for Print" | Blue | ⏳ |
| PAYMENT_IN_PROGRESS | "Preparing for Print" | Blue | ⏳ |
| PRODUCTION_DELAYED | "Preparing for Print" | Blue | ⏳ |
| PRODUCTION_READY | "Preparing for Print" | Blue | ⏳ |
| IN_PRODUCTION | "Printing Your Book" | Indigo | 🖨️ |
| SHIPPED | "Shipped" | Green | 📮 |
| DELIVERED | "Delivered" | Green | ✅ |
| REJECTED | "Action Required" | Red | ⚠️ |
| CANCELED | "Canceled" | Gray | ❌ |

**Note**: All pre-production statuses (CREATED through PRODUCTION_READY) are grouped together as "Preparing for Print" to simplify the customer experience. Internal statuses like payment processing are handled automatically.

### **Admin Display** (Full Detail)

For admin-facing display, all Lulu statuses map to "Printing" badge until SHIPPED/DELIVERED:

| Lulu Status | Admin Display | Notes |
|------------|---------------|-------|
| CREATED through PRODUCTION_READY | **Printing** | All pre-production statuses |
| IN_PRODUCTION | **Printing** | Currently being printed |
| SHIPPED | **Shipped** | With tracking info |
| DELIVERED | **Delivered** | From tracking data |
| REJECTED | **Action Required** | Error badge |
| CANCELED | **Action Required** | Error badge |

See `docs/lulu/LULU_STATUS_MAPPING_VERIFIED.md` for complete mapping details.

---

## **Status Details**

### **SHIPPED Status Includes:**
- `tracking_id` - Tracking number
- `tracking_urls` - Array of tracking URLs
- `carrier_name` - Shipping carrier name
- `line_item_statuses` - Status for each line item

### **REJECTED Status Includes:**
- Error message explaining why it was rejected
- May include file validation errors
- Requires contacting Lulu support

---

## **Webhook Events**

Lulu sends webhooks when status changes:
- **PRINT_JOB_STATUS_CHANGED** - Sent every time status updates

We should subscribe to this webhook to get real-time status updates.

---

## **Implementation Notes**

1. **Status Polling**: We can poll Lulu API to check status, but webhooks are preferred
2. **Status Updates**: Update `lulu_status` field in our database when status changes
3. **Customer Display**: Show friendly status messages, not raw Lulu status codes
4. **Tracking Info**: When SHIPPED, display tracking information to customer
5. **Error Handling**: If REJECTED, show clear error message and next steps

---

## **Next Steps**

1. ✅ Document all possible statuses (this file)
2. ⏳ Build order status display component
3. ⏳ Integrate Lulu API status polling/webhooks
4. ⏳ Map Lulu statuses to customer-friendly messages
5. ⏳ Display tracking information when shipped
6. ⏳ Handle error states (REJECTED, CANCELED)

