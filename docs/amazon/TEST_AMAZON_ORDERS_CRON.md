# Quick Test: Amazon Orders Cron Endpoint

## Test Command

Run this command with your CRON_SECRET from Vercel:

```bash
curl -X GET "https://little-hero-books-dvvaz6omr-jeffs-projects-5810cd55.vercel.app/api/cron/amazon-orders" \
  -H "Authorization: Bearer YOUR_CRON_SECRET_HERE" \
  -H "Content-Type: application/json" \
  -s | jq .
```

Or using the test script:

```bash
node scripts/test-amazon-orders-cron.js --secret=YOUR_CRON_SECRET_HERE
```

## Expected Responses

### ✅ Success - Orders Found
```json
{
  "success": true,
  "ordersFound": 1,
  "ordersProcessed": 1,
  "orderIds": ["111-0060602-1283417"],
  "metrics": {
    "tokenFetchMs": 1234,
    "ordersFetchMs": 5678,
    "totalMs": 8912
  }
}
```

### ✅ Success - No Orders (but endpoint works)
```json
{
  "skipped": true,
  "reason": "no_orders",
  "executionId": "amazon-...",
  "metrics": { ... }
}
```

### ❌ Error - Authentication Failed
```json
{
  "error": "Unauthorized"
}
```
**Fix:** Check CRON_SECRET is correct

### ❌ Error - Missing Credentials
```json
{
  "error": "Amazon SP-API credentials not configured"
}
```
**Fix:** Check Vercel environment variables

### ❌ Error - Sandbox Mode
Check logs for: `Sandbox mode: true`
**Fix:** Set `AMAZON_SANDBOX_MODE=false` in Vercel

## Get CRON_SECRET from Vercel

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Find `CRON_SECRET` in Production environment
3. Copy the value
4. Use it in the test command above

## What to Look For

1. **HTTP Status 200** - Endpoint is accessible
2. **"ordersFound" > 0** - Orders were found in Amazon API
3. **"ordersProcessed" > 0** - Orders were successfully processed
4. **Check logs** for:
   - `[Cron Amazon Orders] Starting execution`
   - `[Cron Amazon Orders] Got Amazon access token`
   - `[Cron Amazon Orders] Fetching orders from: https://sellingpartnerapi-na.amazon.com...`
   - `Sandbox mode: false` (should be false!)

## If Orders Not Found

Even if the endpoint works, orders might not be found if:
- Order is older than 24 hours (cron only checks last 24h)
- Order status is not "Unshipped"
- Order hasn't appeared in Amazon API yet (10-30 min delay)

