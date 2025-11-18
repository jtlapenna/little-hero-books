# Amazon SP-API Integration Plan

## Overview

Integrate Amazon SP-API to automatically fetch Custom orders and trigger W0 processing, following the existing Vercel Cron → n8n webhook pattern.

## Architecture

```
Vercel Cron (free tier: once/day at midnight, manual trigger otherwise)
    ↓
/api/cron/amazon-orders
    ↓
1. Poll Amazon SP-API for new orders
2. For each new order:
   a. Store in Supabase via POST /api/orders (with execution_status='pending_w0')
   b. Call W0 webhook with order data
    ↓
W0 Webhook (n8n)
    ↓
1. Process order (normalize, build manifest, upload to R2)
2. Update Supabase: execution_status='ready_for_processing', next_workflow='2A'
    ↓
Router Cron (existing)
    ↓
Routes to W2A, W2B, W3, W4 as normal
```

## Implementation Steps

### Step 1: Create Amazon Orders Cron Route

**File:** `back-end/src/app/api/cron/amazon-orders/route.ts`

**Pattern:** Follow `/api/cron/router/route.ts` structure

**Functionality:**
1. Verify `CRON_SECRET` (security)
2. Poll Amazon SP-API for new orders (last 24 hours, or since last run)
3. For each new order:
   - Call `POST /api/orders` to store in Supabase with:
     - `execution_status='pending_w0'` (new status - prevents router from picking it up)
     - `next_workflow=null` (W0 will set this to '2A' after processing)
   - Call W0 webhook with full order data
4. Return metrics (orders found, orders processed, errors)

**Amazon SP-API Integration:**
- Use code from `docs/SETUP_AND_TEST_AMAZON_API.md`
- Move "Get Amazon Access Token" logic to cron route
- Move "Fetch Amazon Orders" logic to cron route
- Move "Fetch Order Items" logic to cron route
- Move "Parse Amazon Customization" logic to cron route
- Normalize to match W0's expected input format

**Environment Variables:**
- `AMZ_APP_CLIENT_ID` (or `AMAZON_SP_API_CLIENT_ID`)
- `AMZ_APP_CLIENT_SECRET` (or `AMAZON_SP_API_CLIENT_SECRET`)
- `AMZ_REFRESH_TOKEN` (or `AMAZON_SP_API_REFRESH_TOKEN`)
- `AMZ_SELLER_ID` (or `AMAZON_SP_API_SELLER_ID`)
- `AMZ_MARKETPLACE_ID` (or `AMAZON_SP_API_MARKETPLACE_ID`) - Default: `ATVPDKIKX0DER`
- `AMZ_REGION` (or `AMAZON_SP_API_REGION`) - Default: `na`
- `AMAZON_SANDBOX_MODE` - Set to `true` for testing
- `N8N_W0_WEBHOOK_URL` - `https://thepeakbeyond.app.n8n.cloud/webhook/order-intake`
- `CRON_SECRET` (existing)

### Step 2: Update POST /api/orders

**File:** `back-end/src/app/api/orders/route.ts`

**Changes:**
- Add optional `execution_status` parameter (default: `'ready_for_processing'`)
- If `execution_status='pending_w0'`, set `next_workflow=null` (W0 will set it)
- This allows Amazon cron to store orders with `pending_w0` status

### Step 3: Convert W0 to Webhook Trigger

**File:** `docs/n8n-workflow-files/finals/LHB - 0 - ORDER INTAKE VALIDATION.json`

**Changes:**
1. Replace "Manual Trigger" with "Webhook" node
   - Path: `/w0-order-intake` (or similar)
   - Method: POST
   - Response: 200 OK immediately (async processing)
2. Remove or disable "Mock Order (Testing)" node (keep for manual testing)
3. Update "Normalize Payload" to accept webhook body format
   - Webhook will receive full Amazon order data
   - Should match current normalization logic
4. Keep existing flow: Normalize → Extract Dedication → Build Manifest → Upload to R2 → Upsert Supabase

**W0 Supabase Upsert:**
- Already sets `execution_status='ready_for_processing'` and `next_workflow='2A'`
- This is correct - no changes needed

### Step 4: Add vercel.json Cron Configuration

**File:** `vercel.json` (create if doesn't exist)

**Add:**
```json
{
  "crons": [
    {
      "path": "/api/cron/amazon-orders",
      "schedule": "0 0 * * *"
    }
  ]
}
```

**Note:** Free tier runs once/day at midnight. Manual triggers via Vercel dashboard or API.

### Step 5: Update Database Schema (if needed)

**Check:** Does `execution_status` enum include `'pending_w0'`?

**If not, add:**
```sql
-- Add new status for orders waiting for W0 processing
ALTER TYPE execution_status_enum ADD VALUE IF NOT EXISTS 'pending_w0';
```

## Testing Plan

### Phase 1: Manual Testing
1. Manually trigger `/api/cron/amazon-orders` via Vercel dashboard
2. Verify it polls Amazon SP-API successfully
3. Verify orders are stored in Supabase with `execution_status='pending_w0'`
4. Verify W0 webhook is called with order data
5. Verify W0 processes order and updates Supabase correctly
6. Verify router cron picks up processed orders

### Phase 2: End-to-End Testing
1. Create test order in Amazon Custom
2. Wait for cron (or manually trigger)
3. Verify full flow: Amazon → Supabase → W0 → Router → W2A

## Error Handling

### Amazon API Failures
- Log errors but don't fail entire cron run
- Return partial success with error details
- Allow manual retry

### W0 Webhook Failures
- Order is already in Supabase with `pending_w0` status
- Can manually trigger W0 webhook with order data
- Or retry cron (will skip already-processed orders)

### Duplicate Orders
- `POST /api/orders` uses `upsert` with `amazon_order_id` as conflict key
- Prevents duplicate inserts
- Updates existing orders if found

## Future Enhancements

1. **SP-API Notifications API** (when ready for paid Vercel):
   - Subscribe to `ORDER_CHANGE` notifications
   - Receive webhooks from Amazon (real-time)
   - Replace polling with push notifications

2. **Deduplication Logic:**
   - Track last polled timestamp
   - Only fetch orders newer than last run
   - Store in environment variable or Supabase config table

3. **Rate Limiting:**
   - Amazon SP-API has rate limits
   - Implement exponential backoff
   - Queue orders if rate limit hit

## Questions Resolved

1. **W0 Webhook URL:** ✅ `https://thepeakbeyond.app.n8n.cloud/webhook/order-intake` (configured in n8n)
2. **Order Deduplication:** ✅ Uses Supabase upsert with `amazon_order_id` as conflict key - prevents duplicates
3. **Error Recovery:** ✅ If W0 fails, order is already in Supabase with `pending_w0` status - can manually retry W0 webhook
4. **Testing:** ✅ Use sandbox mode (`AMAZON_SANDBOX_MODE=true`) - sandbox may have no orders, which is OK for testing

## Files to Create/Modify

### New Files:
- `back-end/src/app/api/cron/amazon-orders/route.ts`
- `docs/new-planning/amazon-api-integration-plan.md` (this file)

### Modified Files:
- `back-end/src/app/api/orders/route.ts` (add `execution_status` parameter)
- `docs/n8n-workflow-files/finals/LHB - 0 - ORDER INTAKE VALIDATION.json` (convert to webhook)
- `vercel.json` (add cron config)

### Environment Variables (Vercel):
- `AMAZON_SP_API_CLIENT_ID`
- `AMAZON_SP_API_CLIENT_SECRET`
- `AMAZON_SP_API_REFRESH_TOKEN`
- `AMAZON_SP_API_MARKETPLACE_ID`
- `N8N_W0_WEBHOOK_URL`
- `CRON_SECRET` (existing)

