# Testing Lulu Webhook Endpoint

## ✅ **Current Status**

- ✅ Webhook endpoint created: `back-end/src/app/api/webhooks/lulu/status/route.ts`
- ✅ Basic endpoint tests passing (returns 200 OK)
- ⏳ Need to test with real order in database
- ⏳ Need to expose via ngrok for Developer A

---

## 🧪 **Local Testing Steps**

### **Step 1: Start Backend Server**

```bash
cd back-end
npm run dev
```

Server should start on `http://localhost:3000`

### **Step 2: Test Basic Endpoint (No Database Order Needed)**

```bash
cd back-end
./scripts/test-lulu-webhook-local.sh
```

**Expected Results**:
- ✅ All tests return HTTP 200
- ✅ Endpoint handles missing data gracefully
- ✅ Endpoint handles non-existent orders gracefully

### **Step 3: Test with Real Order (Optional)**

1. **Create/Update Test Order in Supabase**:
   - Open Supabase SQL Editor
   - Run: `back-end/scripts/setup-test-order-for-webhook.sql`
   - Update an existing test order with `lulu_job_id = '12345'`

2. **Test Webhook with Real Order**:
   ```bash
   curl -X POST http://localhost:3000/api/webhooks/lulu/status \
     -H "Content-Type: application/json" \
     -d '{
       "name": "SHIPPED",
       "message": "Print job has been shipped",
       "changed": "2025-01-15T10:30:00Z",
       "print_job_id": 12345,
       "line_item_statuses": [
         {
           "name": "SHIPPED",
           "tracking_id": "1Z999AA10123456784",
           "tracking_urls": ["https://www.ups.com/track?tracknum=1Z999AA10123456784"],
           "carrier": "UPS"
         }
       ]
     }'
   ```

3. **Verify Database Update**:
   - Check Supabase: `SELECT * FROM orders WHERE lulu_job_id = '12345';`
   - Should see: `lulu_status = 'SHIPPED'`, `tracking_number`, `carrier`, etc.

---

## 🌐 **Expose via ngrok (For Developer A Testing)**

### **Step 1: Start ngrok**

```bash
ngrok http 3000
```

### **Step 2: Get Public URL**

1. Open http://localhost:4040 in browser (ngrok dashboard)
2. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)
3. Your webhook URL will be: `https://abc123.ngrok.io/api/webhooks/lulu/status`

### **Step 3: Test with ngrok URL**

```bash
curl -X POST https://abc123.ngrok.io/api/webhooks/lulu/status \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SHIPPED",
    "print_job_id": 12345,
    "line_item_statuses": [{
      "tracking_id": "1Z999AA10123456784",
      "tracking_urls": ["https://www.ups.com/track?tracknum=1Z999AA10123456784"],
      "carrier": "UPS"
    }]
  }'
```

### **Step 4: Share with Developer A**

Once ngrok is running and tested:
- Share the ngrok URL: `https://abc123.ngrok.io/api/webhooks/lulu/status`
- Developer A can use this URL to subscribe to Lulu webhooks

---

## 📋 **Test Scenarios**

### **Scenario 1: SHIPPED Status**
```json
{
  "name": "SHIPPED",
  "print_job_id": 12345,
  "line_item_statuses": [{
    "tracking_id": "1Z999AA10123456784",
    "tracking_urls": ["https://www.ups.com/track?tracknum=1Z999AA10123456784"],
    "carrier": "UPS"
  }]
}
```

**Expected**: Updates `lulu_status`, `tracking_number`, `tracking_url`, `carrier`, `shipped_at`

### **Scenario 2: IN_PRODUCTION Status**
```json
{
  "name": "IN_PRODUCTION",
  "print_job_id": 12345,
  "line_item_statuses": []
}
```

**Expected**: Updates `lulu_status` only

### **Scenario 3: REJECTED Status**
```json
{
  "name": "REJECTED",
  "print_job_id": 12345,
  "line_item_statuses": [{
    "messages": {
      "error_message": "Invalid PDF format",
      "errors": [{"field": "file", "message": "PDF validation failed"}]
    }
  }]
}
```

**Expected**: Updates `lulu_status = 'REJECTED'`, logs error details

### **Scenario 4: Order Not Found**
```json
{
  "name": "SHIPPED",
  "print_job_id": 99999,
  "line_item_statuses": []
}
```

**Expected**: Returns 200 OK with warning "Order not found" (correct behavior)

---

## ✅ **Verification Checklist**

- [ ] Endpoint returns 200 OK for all test scenarios
- [ ] Endpoint handles missing data gracefully
- [ ] Endpoint handles non-existent orders gracefully
- [ ] Database updates work correctly (if testing with real order)
- [ ] Tracking info extracted correctly when SHIPPED
- [ ] Error states (REJECTED, CANCELED) handled correctly
- [ ] ngrok tunnel working and accessible
- [ ] Can send test payloads via curl/Postman

---

## 🚀 **Next Steps After Testing**

1. **Deploy to Production**:
   - Deploy backend to production
   - Verify endpoint: `https://admin.littleherolabs.com/api/webhooks/lulu/status`

2. **Notify Developer A**:
   - Share production webhook URL
   - Developer A will subscribe to Lulu webhooks

3. **Monitor**:
   - Check server logs for webhook processing
   - Monitor database updates
   - Verify real Lulu webhooks are received

---

## 📝 **Troubleshooting**

### **Issue: Endpoint returns 500 error**
- Check server logs for errors
- Verify Supabase connection
- Check environment variables

### **Issue: Order not found (but order exists)**
- Verify `lulu_job_id` field name in database (might be `luluJobId` or `lulu_job_id`)
- Check that print_job_id matches exactly (string vs number)

### **Issue: Database not updating**
- Check Supabase connection
- Verify field names match database schema
- Check server logs for update errors

### **Issue: ngrok not working**
- Make sure ngrok is authenticated: `ngrok config add-authtoken YOUR_TOKEN`
- Check ngrok dashboard at http://localhost:4040
- Verify backend server is running on port 3000

