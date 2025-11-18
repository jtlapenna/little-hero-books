# Quick Test Guide - Amazon API Integration

## Before Testing

1. **Deploy the branch to Vercel:**
   ```bash
   git push origin amazon-api-integration
   ```
   Then deploy in Vercel dashboard or wait for auto-deploy.

2. **Verify Environment Variables in Vercel:**
   - Go to Vercel Project → Settings → Environment Variables
   - Ensure all Amazon API variables are set (see `amazon-api-env-vars.md`)

## Test Method 1: Vercel Dashboard (Easiest)

1. Go to Vercel → Your Project → Deployments
2. Click on latest deployment
3. Go to "Functions" tab
4. Find `/api/cron/amazon-orders`
5. Click "Invoke" or use the test button
6. Add header: `Authorization: Bearer YOUR_CRON_SECRET`
7. Click "Test"

**Expected Result:**
- Status 200
- JSON response with either:
  - `skipped: true, reason: 'no_orders'` (OK - sandbox may have no orders)
  - `success: true, ordersFound: X, ordersProcessed: Y`

## Test Method 2: cURL

```bash
curl -X GET "https://admin.littleherolabs.com/api/cron/amazon-orders" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" | jq '.'
```

Replace `YOUR_CRON_SECRET` with your actual CRON_SECRET from Vercel.

## Test Method 3: Test Script

```bash
cd docs/new-planning
./test-amazon-cron.sh YOUR_CRON_SECRET
```

## What to Check

### ✅ Success Indicators:
1. **HTTP 200 response** - Route is accessible
2. **"Got Amazon access token"** in logs - Authentication works
3. **"Found X new order(s)"** or **"No new orders found"** - API call works
4. **No errors in response** - All systems operational

### ⚠️ Expected in Sandbox:
- **"No new orders found"** is normal - sandbox may have no test orders
- This is still a successful test - it means the API connection works

### ❌ Error Indicators:
- **401 Unauthorized** - Check CRON_SECRET
- **500 Internal Server Error** - Check environment variables
- **"Amazon authentication failed"** - Check Amazon credentials
- **"Amazon SP-API credentials not configured"** - Add missing env vars

## After Testing

### If Test Passes:
1. Check Supabase for any orders that were stored:
   ```sql
   SELECT amazon_order_id, execution_status, character_specs, created_at
   FROM orders
   WHERE execution_status = 'pending_w0'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

2. Check n8n for W0 executions (if orders were found)

3. Ready to merge! ✅

### If Test Fails:
1. Check Vercel function logs for detailed error messages
2. Verify all environment variables are set correctly
3. Check Amazon credentials are valid
4. Fix issues and retest

## Next Steps After Successful Test

1. **Merge to main:**
   ```bash
   git checkout main
   git merge amazon-api-integration
   git push origin main
   ```

2. **Monitor first few cron runs** in Vercel logs

3. **Set up alerts** for cron failures (optional)

