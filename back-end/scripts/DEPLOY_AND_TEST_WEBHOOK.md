# Deploy and Test Lulu Webhook Endpoint

## 🚀 **Deployment Steps**

### **Deploy via Git Push**

Since automatic deployments are set up via Git, simply commit and push:

```bash
# Commit the new webhook endpoint
git add back-end/src/app/api/webhooks/lulu/status/route.ts
git commit -m "Add Lulu webhook endpoint for order status updates"
git push
```

**That's it!** Cloudflare Pages will automatically deploy in 2-3 minutes.

**Deployment URL**: `https://admin.littleherolabs.com`

### **Verify Deployment**

Wait 2-3 minutes for deployment to complete, then verify:

```bash
curl -I https://admin.littleherolabs.com/api/webhooks/lulu/status
```

Should return `405 Method Not Allowed` (GET not allowed, but endpoint exists) or `200 OK` (if POST).

---

## 🧪 **Testing Production Endpoint**

### **Quick Test (Verify Endpoint Exists)**

```bash
# Test that endpoint responds (should return 200 even with minimal payload)
curl -X POST https://admin.littleherolabs.com/api/webhooks/lulu/status \
  -H "Content-Type: application/json" \
  -d '{"name": "IN_PRODUCTION", "print_job_id": 99999}'
```

**Expected**: `{"received": true, "warning": "Order not found", "printJobId": "99999"}` with HTTP 200

### **Full Test Suite**

```bash
cd back-end
./scripts/test-lulu-webhook-production.sh
```

Or with custom URL:
```bash
PRODUCTION_URL=https://admin.littleherolabs.com ./scripts/test-lulu-webhook-production.sh
```

### **Test with Real Order (Optional but Recommended)**

1. **Create/Update Test Order in Supabase**:
   ```sql
   -- Update an existing test order
   UPDATE orders 
   SET lulu_job_id = '12345',
       lulu_status = NULL
   WHERE orderId = 'YOUR_TEST_ORDER_ID';
   ```

2. **Send Webhook with Matching print_job_id**:
   ```bash
   curl -X POST https://admin.littleherolabs.com/api/webhooks/lulu/status \
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

3. **Verify Database Update**:
   ```sql
   SELECT lulu_job_id, lulu_status, tracking_number, carrier, tracking_url
   FROM orders 
   WHERE lulu_job_id = '12345';
   ```

   Should show:
   - `lulu_status = 'SHIPPED'`
   - `tracking_number = '1Z999AA10123456784'`
   - `carrier = 'UPS'`
   - `tracking_url = 'https://www.ups.com/track?tracknum=1Z999AA10123456784'`

---

## ✅ **Pre-Notification Checklist**

Before notifying Developer A, verify:

- [ ] Endpoint is deployed and accessible
- [ ] Endpoint returns 200 OK for all test scenarios
- [ ] Endpoint handles missing data gracefully
- [ ] Endpoint handles non-existent orders gracefully
- [ ] (Optional) Tested with real order - database updates correctly
- [ ] Server logs show webhook processing (check Cloudflare dashboard)

---

## 📧 **Ready to Notify Developer A**

Once all tests pass, share with Developer A:

**Webhook URL**: `https://admin.littleherolabs.com/api/webhooks/lulu/status`

**What Developer A Needs to Do**:
1. Make one API call to Lulu to subscribe:
   ```bash
   POST https://api.lulu.com/webhooks/
   {
     "url": "https://admin.littleherolabs.com/api/webhooks/lulu/status",
     "topics": ["PRINT_JOB_STATUS_CHANGED"]
   }
   ```

2. **Options**:
   - Manual via Postman/curl (recommended for MVP)
   - Simple one-time n8n workflow

**After subscription**: Lulu will automatically send webhooks to our endpoint for all print jobs.

---

## 🔍 **Monitoring After Deployment**

1. **Check Cloudflare Dashboard**:
   - View deployment logs
   - Monitor function invocations
   - Check for errors

2. **Check Server Logs**:
   - Look for `[LULU WEBHOOK]` log entries
   - Verify webhook processing
   - Check for any errors

3. **Monitor Database**:
   - Watch for `lulu_status` updates
   - Verify tracking info appears when orders ship
   - Check for any failed updates

---

## 🐛 **Troubleshooting**

### **Issue: Endpoint returns 404**
- Verify deployment completed successfully
- Check Cloudflare Pages dashboard
- Verify route exists: `/api/webhooks/lulu/status`

### **Issue: Endpoint returns 500**
- Check Cloudflare function logs
- Verify Supabase environment variables are set
- Check server logs for errors

### **Issue: Database not updating**
- Verify Supabase connection
- Check field names match database schema
- Verify `lulu_job_id` field exists in orders table

### **Issue: CORS errors**
- Webhook should have CORS headers (already implemented)
- Lulu should be able to POST from their servers
- Check if Cloudflare is blocking requests

