# Troubleshooting Amazon Orders Cron Job

## Quick Checklist

1. ✅ **Cron Job Configured?** - Check `vercel.json` for cron schedule
2. ✅ **Environment Variables Set?** - Verify all Amazon credentials in Vercel
3. ✅ **Sandbox Mode Disabled?** - `AMAZON_SANDBOX_MODE=false` in production
4. ✅ **Cron Secret Set?** - `CRON_SECRET` must be configured
5. ✅ **Manual Trigger Works?** - Test endpoint directly

## Step 1: Verify Cron Configuration

Check if the cron job is configured in `vercel.json`:

```bash
cat vercel.json | grep -A 10 "amazon-orders"
```

Expected output should include:
```json
{
  "crons": [
    {
      "path": "/api/cron/amazon-orders",
      "schedule": "0 0 * * *"  // Once per day at midnight UTC
    }
  ]
}
```

**If missing:** Add the cron configuration to `vercel.json`.

## Step 2: Check Environment Variables in Vercel

Required environment variables:

```bash
# Amazon SP-API Credentials
AMZ_APP_CLIENT_ID (or AMAZON_SP_API_CLIENT_ID)
AMZ_APP_CLIENT_SECRET (or AMAZON_SP_API_CLIENT_SECRET)
AMZ_REFRESH_TOKEN (or AMAZON_SP_API_REFRESH_TOKEN)
AMZ_SELLER_ID (or AMAZON_SP_API_SELLER_ID)
AMZ_MARKETPLACE_ID (or AMAZON_SP_API_MARKETPLACE_ID)  # Default: ATVPDKIKX0DER
AMZ_REGION (or AMAZON_SP_API_REGION)  # Default: na

# Critical: Must be false in production
AMAZON_SANDBOX_MODE=false

# Security
CRON_SECRET=<your-secret>

# Supabase
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

# n8n
N8N_W0_WEBHOOK_URL
```

**To check in Vercel:**
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Verify all variables are set for **Production** environment
3. **Critical:** Ensure `AMAZON_SANDBOX_MODE=false` (not `true`)

## Step 3: Manual Trigger Test

Test the endpoint directly to see what's happening:

```bash
# Get your CRON_SECRET from Vercel environment variables
export CRON_SECRET="your-secret-here"
export VERCEL_URL="your-app.vercel.app"  # or use production URL

# Trigger the cron manually
curl -X GET "https://${VERCEL_URL}/api/cron/amazon-orders" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -v
```

**Expected responses:**

✅ **Success (orders found):**
```json
{
  "success": true,
  "ordersFound": 1,
  "ordersProcessed": 1,
  "orderIds": ["111-0060602-1283417"]
}
```

✅ **Success (no orders):**
```json
{
  "skipped": true,
  "reason": "no_orders"
}
```

❌ **Error (check message):**
```json
{
  "error": "Amazon SP-API credentials not configured"
}
```

## Step 4: Check Vercel Function Logs

1. Go to Vercel Dashboard → Your Project → Functions
2. Click on `/api/cron/amazon-orders`
3. Check "Logs" tab for recent executions
4. Look for:
   - `[Cron Amazon Orders] Starting execution`
   - `[Cron Amazon Orders] Got Amazon access token`
   - `[Cron Amazon Orders] Fetching orders from: ...`
   - Any error messages

**Common log patterns:**

✅ **Working:**
```
[Cron Amazon Orders] Starting execution at 2025-12-07T23:30:47.231Z
[Cron Amazon Orders] Got Amazon access token (1234ms)
[Cron Amazon Orders] Fetching orders from: https://sellingpartnerapi-na.amazon.com/orders/v0/orders?MarketplaceIds=ATVPDKIKX0DER&CreatedAfter=...
[Cron Amazon Orders] Found 1 new order(s)
```

❌ **Sandbox mode (wrong):**
```
[Cron Amazon Orders] Sandbox mode: true
[Cron Amazon Orders] Fetching orders from: https://sandbox.sellingpartnerapi-na.amazon.com/...
```

❌ **Auth failure:**
```
[Cron Amazon Orders] Failed to get Amazon access token
Amazon token request failed (401): ...
```

❌ **No credentials:**
```
[Cron Amazon Orders] Amazon SP-API credentials not configured
```

## Step 5: Test Amazon API Directly

Use the diagnostic script to test Amazon API independently:

```bash
cd /Users/jeff/Projects/little-hero-books
node scripts/test-amazon-order-fetch.js
```

This script will:
1. Test token fetch
2. Test orders API call
3. Show raw responses
4. Help identify API issues

**Expected output:**
```
✅ Got Amazon access token
✅ Fetched orders from Amazon API
Found 1 order(s):
  - Order ID: 111-0060602-1283417
  - Status: Unshipped
  - Purchase Date: 2025-12-07T22:00:54+00:00
```

## Step 6: Verify Order Query Parameters

The cron job queries for orders with:
- **Time window:** Last 24 hours (`CreatedAfter`)
- **Status:** `Unshipped` only
- **Marketplace:** `ATVPDKIKX0DER` (US marketplace)

**If your test order is older than 24 hours:**
- The cron won't find it
- Manually trigger with a longer time window, or
- Wait for a new order

**If your order status is not "Unshipped":**
- The cron only fetches "Unshipped" orders
- Check order status in Amazon Seller Central

## Step 7: Check for Silent Failures

The cron might be running but failing silently. Check:

1. **Vercel Function Invocations:**
   - Dashboard → Functions → `/api/cron/amazon-orders` → Invocations
   - Look for recent executions (should be daily at midnight UTC)

2. **Error Responses:**
   - Check if function returns 500 errors
   - Check if function times out (10s limit on free tier)

3. **Rate Limiting:**
   - Amazon API has rate limits
   - Check for 429 responses in logs

## Step 8: Debug Mode

Enable debug logging by setting environment variable:

```bash
AMAZON_DEBUG_STRUCTURE=true
```

This will log:
- Full order item structure
- Customization data paths
- Raw API responses

## Common Issues & Solutions

### Issue: "No new orders found"

**Possible causes:**
1. Order is older than 24 hours → Wait for new order or adjust time window
2. Order status is not "Unshipped" → Check in Seller Central
3. Sandbox mode enabled → Set `AMAZON_SANDBOX_MODE=false`
4. Wrong marketplace ID → Verify `AMZ_MARKETPLACE_ID`

**Solution:**
- Check order creation date in Amazon Seller Central
- Verify order status is "Unshipped"
- Ensure production mode (not sandbox)

### Issue: "Amazon authentication failed"

**Possible causes:**
1. Invalid credentials → Check `AMZ_APP_CLIENT_ID`, `AMZ_APP_CLIENT_SECRET`, `AMZ_REFRESH_TOKEN`
2. Expired refresh token → Generate new refresh token in Amazon Developer Console
3. Wrong region → Verify `AMZ_REGION` matches your marketplace

**Solution:**
- Regenerate refresh token in Amazon Developer Console
- Verify all credentials are correct in Vercel
- Check region matches marketplace (US = 'na')

### Issue: "Amazon access forbidden (403)"

**Possible causes:**
1. Missing SP-API permissions → Check IAM role has "Orders" API access
2. Wrong seller ID → Verify `AMZ_SELLER_ID` matches your account

**Solution:**
- Check IAM role permissions in Amazon Developer Console
- Verify seller ID matches your Amazon Seller account

### Issue: Cron job not running

**Possible causes:**
1. Cron not configured in `vercel.json`
2. Vercel cron not enabled (free tier limitation)
3. Wrong schedule format

**Solution:**
- Verify `vercel.json` has cron configuration
- Free tier: Cron runs once per day at midnight UTC
- Manual trigger: Use curl or Vercel dashboard

## Next Steps

1. ✅ Run manual trigger test (Step 3)
2. ✅ Check Vercel logs (Step 4)
3. ✅ Test Amazon API directly (Step 5)
4. ✅ Verify environment variables (Step 2)
5. ✅ Check cron configuration (Step 1)

If all steps pass but orders still don't appear:
- Check Supabase for orders with `execution_status='pending_w0'`
- Verify W0 webhook is working
- Check n8n workflow logs

