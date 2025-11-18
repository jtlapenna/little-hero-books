# Amazon API Integration - Testing Guide

## Prerequisites

1. **Environment Variables Set in Vercel:**
   - `AMZ_APP_CLIENT_ID`
   - `AMZ_APP_CLIENT_SECRET`
   - `AMZ_REFRESH_TOKEN`
   - `AMZ_SELLER_ID`
   - `AMZ_MARKETPLACE_ID`
   - `AMZ_REGION`
   - `AMAZON_SANDBOX_MODE=true`
   - `N8N_W0_WEBHOOK_URL=https://thepeakbeyond.app.n8n.cloud/webhook/order-intake`
   - `CRON_SECRET` (existing)

2. **W0 Webhook Active:**
   - Verify W0 workflow is active in n8n
   - Webhook URL: `https://thepeakbeyond.app.n8n.cloud/webhook/order-intake`

## Testing Steps

### Step 1: Test Cron Route Manually

**Option A: Via Vercel Dashboard**
1. Go to Vercel project → Deployments
2. Find latest deployment
3. Go to Functions → `/api/cron/amazon-orders`
4. Click "Invoke" or use the test button
5. Add header: `Authorization: Bearer YOUR_CRON_SECRET`

**Option B: Via cURL**
```bash
curl -X GET "https://admin.littleherolabs.com/api/cron/amazon-orders" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Expected Results:**
- ✅ Status 200 with JSON response
- ✅ Logs show: "Got Amazon access token"
- ✅ Logs show: "Found X new order(s)" or "No new orders found"
- ✅ If orders found: "Stored order X in Supabase" and "✅ Processed order X"

### Step 2: Verify Supabase Storage

Check Supabase `orders` table:
```sql
SELECT 
  amazon_order_id,
  execution_status,
  next_workflow,
  status,
  customer_email,
  character_specs,
  created_at
FROM orders
WHERE execution_status = 'pending_w0'
ORDER BY created_at DESC
LIMIT 10;
```

**Expected:**
- Orders have `execution_status='pending_w0'`
- Orders have `next_workflow=null` (W0 will set this)
- Orders have `character_specs` populated (if customization data was available)
- If customization missing: `product_info._customization_missing=true`

### Step 3: Verify W0 Webhook Received Data

Check n8n execution logs for W0 workflow:
1. Go to n8n → Executions
2. Find recent W0 executions
3. Check webhook input data

**Expected:**
- Webhook received order data with:
  - `amazonOrderId`
  - `characterSpecs` (childName, age, skinTone, etc.)
  - `shippingAddress`
  - `dedication`
  - `items` array with customizations

### Step 4: Verify W0 Processing

After W0 processes the order:
1. Check Supabase: Order should have:
   - `execution_status='ready_for_processing'`
   - `next_workflow='2A'`
   - `one_manifest_url` populated
2. Check n8n: W0 execution should be successful
3. Check R2: `1-manifest.json` should exist for the order

### Step 5: Verify Router Picks Up Order

After W0 completes:
1. Wait for router cron (or trigger manually)
2. Check router cron logs
3. Verify order is routed to W2A

## Test Scenarios

### Scenario 1: No Orders (Sandbox)
**Expected:** Cron returns `skipped: true, reason: 'no_orders'`
**Status:** ✅ This is OK - sandbox may have no test orders

### Scenario 2: Order with Customization Data
**Expected:**
- Order stored in Supabase with `character_specs` populated
- W0 webhook called with complete order data
- W0 processes successfully
- Order moves to `ready_for_processing` status

### Scenario 3: Order without Customization Data (404)
**Expected:**
- Order stored in Supabase with `_customization_missing=true` flag
- W0 webhook NOT called
- Order remains in `pending_w0` status
- Next cron run will retry

### Scenario 4: Authentication Failure
**Expected:**
- Cron returns error about Amazon credentials
- No orders processed
- Check environment variables

## Troubleshooting

### "Amazon authentication failed"
- Check `AMZ_REFRESH_TOKEN` is correct (starts with `Atzr|`)
- Check `AMZ_APP_CLIENT_ID` and `AMZ_APP_CLIENT_SECRET`
- Verify credentials in Amazon Seller Central

### "No orders returned"
- **This is normal in sandbox!** Sandbox may have no test orders
- Check Amazon Seller Central for actual orders
- Verify order status is "Unshipped"
- Check `CreatedAfter` date range (last 24 hours)

### "W0 webhook failed"
- Check W0 workflow is active in n8n
- Verify webhook URL is correct
- Check n8n execution logs for errors

### "Order stuck in pending_w0"
- Check if customization data was available
- If `_customization_missing=true`, wait for next cron run
- Manually trigger W0 webhook with order data if needed

## Manual Testing Commands

### Test Cron Route Locally (if running dev server)
```bash
curl -X GET "http://localhost:3000/api/cron/amazon-orders" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Check Order in Supabase
```sql
-- Find orders needing retry
SELECT amazon_order_id, execution_status, product_info
FROM orders
WHERE execution_status = 'pending_w0'
  AND product_info->>'_customization_missing' = 'true';

-- Find processed orders
SELECT amazon_order_id, execution_status, next_workflow, one_manifest_url
FROM orders
WHERE execution_status = 'ready_for_processing'
ORDER BY updated_at DESC
LIMIT 5;
```

## Success Criteria

✅ Cron route responds successfully  
✅ Amazon authentication works  
✅ Orders are fetched (or gracefully handles no orders)  
✅ Orders stored in Supabase correctly  
✅ W0 webhook receives order data  
✅ W0 processes orders successfully  
✅ Orders move from `pending_w0` to `ready_for_processing`  
✅ Router picks up processed orders  

