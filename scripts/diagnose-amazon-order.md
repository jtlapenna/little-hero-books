# Diagnose Missing Amazon Order

## Quick Diagnostic Steps

### 1. What did the cron response say?

When you triggered the cron, what was the response? It should be one of:

**If no orders found:**
```json
{
  "skipped": true,
  "reason": "no_orders",
  "executionId": "...",
  "metrics": {...},
  "timestamp": "..."
}
```

**If there was an error:**
```json
{
  "error": "...",
  "message": "..."
}
```

### 2. Check Vercel Logs

Look for these log entries:
- `[Cron Amazon Orders] Starting execution`
- `[Cron Amazon Orders] Got Amazon access token`
- `[Cron Amazon Orders] Fetching orders from: ...`
- `[Cron Amazon Orders] No new orders found` OR `[Cron Amazon Orders] Found X new order(s)`
- Any error messages

### 3. Verify Order in Amazon Seller Central

1. Log into Amazon Seller Central
2. Go to Orders → Manage Orders
3. Find your test order
4. Note:
   - Order ID (amazon_order_id)
   - Order Status (must be "Unshipped")
   - Purchase Date
   - Is it a Custom product order?

### 4. Common Issues

**Issue 1: Order Status**
- Cron only fetches orders with status "Unshipped"
- If order is "Shipped" or "Cancelled", it won't be fetched
- **Fix:** Make sure order is "Unshipped"

**Issue 2: Time Window**
- Cron only looks at last 24 hours
- If order is older, it won't be fetched
- **Fix:** Adjust `CreatedAfter` parameter or wait for next cron run

**Issue 3: Sandbox Mode**
- If `AMAZON_SANDBOX_MODE=true`, sandbox may not return real orders
- **Fix:** Check if you're in sandbox mode, switch to production

**Issue 4: API Permissions**
- SP-API app might not have "Orders" role
- **Fix:** Check SP-API app permissions in Amazon Developer Console

**Issue 5: Order Not in API Yet**
- Amazon may take 10-30 minutes to show orders in SP-API
- **Fix:** Wait and retry

**Issue 6: Custom Product Orders**
- Custom product orders might need different API endpoint
- **Fix:** Verify order is a Custom product and API supports it

### 5. Manual Test Script

Run this to test the Amazon API directly:

```bash
# Get access token
curl -X POST "https://api.amazon.com/auth/o2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&refresh_token=YOUR_REFRESH_TOKEN&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET"

# Use the access_token from response, then:
curl -X GET "https://sellingpartnerapi-na.amazon.com/orders/v0/orders?MarketplaceIds=ATVPDKIKX0DER&CreatedAfter=2024-12-05T00:00:00Z&OrderStatuses=Unshipped" \
  -H "x-amz-access-token: YOUR_ACCESS_TOKEN"
```

