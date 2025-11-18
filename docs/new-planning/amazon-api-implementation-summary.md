# Amazon API Integration - Implementation Summary

## ✅ Completed

### 1. Amazon Cron Route
**File:** `back-end/src/app/api/cron/amazon-orders/route.ts`

- Follows router cron pattern (Vercel Cron → checks/polls → calls n8n webhook)
- Polls Amazon SP-API for new orders (last 24 hours)
- Stores orders in Supabase with `execution_status='pending_w0'`
- Calls W0 webhook with order data
- Comprehensive error handling and logging
- Returns metrics for monitoring

### 2. Updated POST /api/orders
**File:** `back-end/src/app/api/orders/route.ts`

- Added support for `execution_status` parameter
- If `execution_status='pending_w0'`, sets `next_workflow=null` (W0 will set to '2A')
- Prevents router from picking up orders before W0 processes them

### 3. Vercel Cron Configuration
**File:** `back-end/vercel.json`

- Added Amazon orders cron: `/api/cron/amazon-orders`
- Schedule: `0 0 * * *` (once per day at midnight - free tier)
- Can be manually triggered via Vercel dashboard

### 4. Environment Variables Documentation
**File:** `docs/new-planning/amazon-api-env-vars.md`

- Complete list of required environment variables
- Both primary and alternative variable names supported
- Instructions for Vercel and local development

## 🔄 Architecture Flow

```
Vercel Cron (free tier: once/day at midnight, manual trigger)
    ↓
GET /api/cron/amazon-orders
    ↓
1. Get Amazon access token (refresh token flow)
2. Poll Amazon SP-API for new orders (last 24 hours, Unshipped status)
3. For each new order:
   a. Normalize order data
   b. Store in Supabase via upsert (execution_status='pending_w0', next_workflow=null)
   c. Call W0 webhook with order data
    ↓
W0 Webhook (n8n) - https://thepeakbeyond.app.n8n.cloud/webhook/order-intake
    ↓
1. Process order (normalize, build manifest, upload to R2)
2. Update Supabase: execution_status='ready_for_processing', next_workflow='2A'
    ↓
Router Cron (existing)
    ↓
Routes to W2A, W2B, W3, W4 as normal
```

## 📋 Next Steps

### 1. Add Environment Variables to Vercel
Add these to your Vercel project settings:
- `AMZ_APP_CLIENT_ID`
- `AMZ_APP_CLIENT_SECRET`
- `AMZ_REFRESH_TOKEN`
- `AMZ_SELLER_ID`
- `AMZ_MARKETPLACE_ID`
- `AMZ_REGION`
- `AMAZON_SANDBOX_MODE`
- `N8N_W0_WEBHOOK_URL`

See `docs/new-planning/amazon-api-env-vars.md` for complete list.

### 2. Verify W0 Webhook is Configured
- ✅ Webhook URL: `https://thepeakbeyond.app.n8n.cloud/webhook/order-intake`
- Ensure W0 workflow is active and webhook is enabled
- Test webhook manually with sample order data

### 3. Test the Integration

**Manual Test:**
1. Manually trigger `/api/cron/amazon-orders` via Vercel dashboard
2. Check logs for:
   - Amazon token fetch success
   - Orders found (may be 0 in sandbox - that's OK)
   - Orders stored in Supabase
   - W0 webhook calls
3. Verify order appears in Supabase with `execution_status='pending_w0'`
4. Verify W0 processes order and updates to `execution_status='ready_for_processing'`
5. Verify router cron picks up processed order

**End-to-End Test:**
1. Create test order in Amazon Custom (sandbox)
2. Wait for cron (or manually trigger)
3. Verify full flow: Amazon → Supabase → W0 → Router → W2A

### 4. Monitor and Debug

**Logs to Watch:**
- `[Cron Amazon Orders]` - Cron execution logs
- `[POST /api/orders]` - Order storage logs
- W0 workflow execution logs in n8n

**Common Issues:**
- **No orders found:** Normal in sandbox - check Amazon Seller Central for actual orders
- **Authentication failed:** Check Amazon credentials in environment variables
- **W0 webhook failed:** Check W0 workflow is active and webhook URL is correct
- **Order stuck in pending_w0:** Manually trigger W0 webhook with order data

## 🔐 Security Notes

- Cron route requires `CRON_SECRET` in Authorization header
- Amazon credentials stored as environment variables (never in code)
- Supabase uses service role key (secure, server-side only)
- W0 webhook URL is public but n8n should validate requests

## 📊 Metrics Returned

The cron route returns:
- `ordersFound`: Number of orders fetched from Amazon
- `ordersProcessed`: Number successfully stored and sent to W0
- `orderIds`: List of processed order IDs
- `errors`: Array of errors (if any)
- `metrics`: Timing breakdown (token fetch, orders fetch, webhook calls, total)

## 🚀 Production Checklist

Before going live:
- [ ] Set `AMAZON_SANDBOX_MODE=false` in Vercel
- [ ] Verify production Amazon credentials are correct
- [ ] Test with real Amazon order (not sandbox)
- [ ] Monitor first few cron runs for errors
- [ ] Set up alerts for cron failures
- [ ] Document manual retry process for failed orders

