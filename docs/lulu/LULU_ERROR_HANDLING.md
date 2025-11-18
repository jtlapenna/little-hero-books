# Lulu API Error Handling
## How Lulu Notifies Us of Errors and Our Options

---

## 🚨 **Lulu Error Statuses**

Lulu provides two error/problem statuses:

### **1. REJECTED**
- **When**: Problem with input data or file
- **Details**: Includes detailed error message explaining why
- **Example Reasons**:
  - File validation failed
  - Invalid file format
  - Missing required data
  - File size issues
  - Quality issues
- **Action Required**: Manual intervention needed
- **Customer Message**: "Action Required - We'll contact you shortly"

### **2. CANCELED**
- **When**: Order was canceled
- **Can be canceled by**:
  - You (via API, if order is UNPAID)
  - Lulu (rare, if production issue discovered)
- **Customer Message**: "Canceled"

---

## 📡 **How Lulu Notifies Us**

### **Option 1: Webhooks (Recommended)** ✅

**Webhook Topic**: `PRINT_JOB_STATUS_CHANGED`

**How It Works**:
1. Subscribe to webhook when creating print job
2. Lulu sends POST request to your webhook URL when status changes
3. Webhook includes full status object with error details
4. Update database immediately

**Webhook Payload Example** (for REJECTED):
```json
{
  "name": "REJECTED",
  "message": "File validation failed: Invalid PDF format",
  "changed": "2024-04-10T09:28:34.870842Z",
  "print_job_id": 42776,
  "line_item_statuses": [
    {
      "name": "REJECTED",
      "messages": {
        "error_message": "Invalid PDF format. Expected PDF/A-1b compliant file.",
        "errors": [
          {
            "field": "file",
            "message": "PDF validation failed"
          }
        ]
      },
      "line_item_id": 57999
    }
  ]
}
```

**Setup**:
1. Create webhook endpoint: `POST /api/webhooks/lulu/status`
2. Subscribe via Lulu API: `POST /webhooks/`
3. Select topic: `PRINT_JOB_STATUS_CHANGED`
4. Provide webhook URL

**Benefits**:
- ✅ Real-time notifications
- ✅ No polling needed
- ✅ Includes detailed error messages
- ✅ Automatic updates

---

### **Option 2: Poll Status API**

**Endpoint**: `GET /print-jobs/{id}/status/`

**How It Works**:
1. Poll this endpoint periodically (every 5-15 minutes)
2. Check if status changed to REJECTED or CANCELED
3. Update database with new status
4. Handle errors accordingly

**Status Response Example** (for REJECTED):
```json
{
  "name": "REJECTED",
  "message": "File validation failed: Invalid PDF format",
  "changed": "2024-04-10T09:28:34.870842Z",
  "messages": {
    "error_message": "Invalid PDF format. Expected PDF/A-1b compliant file.",
    "errors": [
      {
        "field": "file",
        "message": "PDF validation failed"
      }
    ]
  }
}
```

**Setup**:
1. Store `lulu_print_job_id` when submitting order
2. Create n8n workflow or scheduled job
3. Poll status endpoint every 5-15 minutes
4. Update `lulu_status` in database

**Benefits**:
- ✅ Works without webhook setup
- ✅ Can check status on-demand
- ⚠️ Less efficient (requires polling)
- ⚠️ Delay between status change and detection

---

### **Option 3: Check on Status Page Load**

**How It Works**:
1. When customer views approval page, check Lulu status
2. If REJECTED or CANCELED, show error message
3. Update database if status changed

**Benefits**:
- ✅ No additional setup needed
- ✅ Works with existing status API
- ⚠️ Only updates when customer views page
- ⚠️ May miss errors if customer doesn't check

---

## 🔧 **Error Handling Implementation**

### **Recommended Approach: Webhooks + Polling Fallback**

1. **Primary**: Set up webhook for real-time notifications
2. **Fallback**: Poll status API every 15 minutes (in case webhook fails)
3. **Customer-Facing**: Check status when customer views page

### **Error Response Structure**

When Lulu returns REJECTED, the response includes:

```json
{
  "name": "REJECTED",
  "message": "General error message",
  "changed": "2024-04-10T09:28:34.870842Z",
  "messages": {
    "error_message": "Detailed error description",
    "errors": [
      {
        "field": "file",
        "message": "Specific field error"
      }
    ],
    "expected_delay_hours": 24  // If error can be resolved
  }
}
```

---

## 📋 **What to Do When Error Occurs**

### **When REJECTED Status Received:**

1. **Update Database**:
   - Set `lulu_status = 'REJECTED'`
   - Store error message in `error_message` field
   - Set `execution_status = 'error'` or `'error_requires_manual_review'`

2. **Notify Customer**:
   - Show "Action Required" status on approval page
   - Message: "There is an issue with your order. We'll contact you shortly."

3. **Internal Alert**:
   - Send notification to admin/team
   - Include error details for investigation
   - Create task in Notion/Sheet for manual review

4. **Investigate**:
   - Review error message from Lulu
   - Check file that was submitted
   - Determine if fixable automatically or needs manual intervention

5. **Resolve**:
   - Fix the issue (if possible)
   - Resubmit to Lulu (if appropriate)
   - Or contact customer with update

### **When CANCELED Status Received:**

1. **Update Database**:
   - Set `lulu_status = 'CANCELED'`
   - Set `status = 'cancelled'`

2. **Notify Customer**:
   - Show "Canceled" status on approval page
   - Message: "Your order has been canceled."

3. **Handle Refund** (if applicable):
   - Process refund if order was paid
   - Update customer

---

## 🎯 **Customer-Facing Error Messages**

### **REJECTED Status:**
- **Header**: "Action Required"
- **Message**: "There is an issue with your order. We'll contact you shortly."
- **Icon**: ⚠️
- **Color**: Red
- **Action**: Customer should wait for contact from support

### **CANCELED Status:**
- **Header**: "Canceled"
- **Message**: "Your order has been canceled."
- **Icon**: ❌
- **Color**: Gray
- **Action**: Customer may need to reorder

---

## 🔔 **Webhook Setup**

### **Subscribe to Webhooks**

**Endpoint**: `POST /webhooks/`

**Request**:
```json
{
  "url": "https://admin.littleherolabs.com/api/webhooks/lulu/status",
  "topics": ["PRINT_JOB_STATUS_CHANGED"]
}
```

**Response**:
```json
{
  "id": 123,
  "url": "https://admin.littleherolabs.com/api/webhooks/lulu/status",
  "topics": ["PRINT_JOB_STATUS_CHANGED"],
  "created": "2024-04-10T09:28:34.870842Z"
}
```

### **Webhook Endpoint Implementation**

**Endpoint**: `POST /api/webhooks/lulu/status`

**What to Do**:
1. Verify webhook signature (if Lulu provides)
2. Parse status from payload
3. Find order by `print_job_id` (need to store this when submitting)
4. Update database with new status
5. If REJECTED, send internal alert
6. Return 200 OK to acknowledge receipt

---

## 📊 **Error Detection Summary**

| Method | Speed | Reliability | Setup Complexity |
|--------|-------|-------------|------------------|
| **Webhooks** | ⚡ Instant | ✅ High | Medium |
| **Polling** | 🐌 5-15 min delay | ✅ High | Low |
| **On Page Load** | 🐌 Only when viewed | ⚠️ Medium | None |

**Recommendation**: Use **Webhooks** as primary, **Polling** as fallback.

---

## ✅ **Next Steps**

1. ✅ Update status mapping (simplified flow) - **DONE**
2. ⏳ Set up Lulu webhook endpoint
3. ⏳ Subscribe to `PRINT_JOB_STATUS_CHANGED` webhook
4. ⏳ Store `lulu_print_job_id` when submitting orders
5. ⏳ Handle REJECTED/CANCELED statuses in webhook handler
6. ⏳ Set up internal alerts for errors

---

**See Also**:
- `docs/lulu/LULU_ORDER_STATUSES.md` - Complete status reference
- `docs/lulu/LULU_INTEGRATION.md` - Main Lulu integration guide
- `docs/status/ORDER_STATUS_IMPLEMENTATION.md` - Status display implementation

