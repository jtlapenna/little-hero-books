# Manual Cron Trigger Guide - Check for Amazon Orders

## Quick Answer

**Yes, orders should come through the API even without RDT!** You'll get:
- ✅ Order ID (`amazon_order_id`)
- ✅ Customization fields (child name, age, hair color, etc.)
- ✅ Order status, purchase date, etc.
- ❌ Customer name (NULL)
- ❌ Customer email (NULL)
- ❌ Shipping address (NULL)

These NULL fields will be populated later via CSV upload.

---

## How to Manually Trigger the Cron to Check for Your Order

### Option 1: Via API Call (Recommended)

**Endpoint:** `GET /api/cron/amazon-orders`

**Authentication:** Requires `CRON_SECRET` in Authorization header

**Command:**
```bash
curl -X GET "https://admin.littleherolabs.com/api/cron/amazon-orders" \
  -H "Authorization: Bearer YOUR_CRON_SECRET_HERE"
```

**Or with test mode:**
```bash
curl -X GET "https://admin.littleherolabs.com/api/cron/amazon-orders?test=true" \
  -H "Authorization: Bearer YOUR_CRON_SECRET_HERE"
```

### Option 2: Check Vercel Logs

1. Go to Vercel Dashboard
2. Navigate to your project → Functions → Logs
3. Look for entries from `/api/cron/amazon-orders`
4. Check if cron has run and what orders it found

### Option 3: Check Supabase Directly

Query Supabase to see if the order exists:

```sql
SELECT 
  amazon_order_id,
  customer_name,
  customer_email,
  shipping_address,
  execution_status,
  character_specs,
  created_at,
  updated_at
FROM orders
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

---

## What the Cron Does

1. **Fetches orders from Amazon SP-API** (last 24 hours, Unshipped status)
2. **For each order:**
   - Fetches order items to get customization data
   - Stores order in Supabase (with NULL customer fields if no RDT)
   - Calls W0 webhook to trigger processing

---

## Expected Behavior Without RDT

When an order comes through:

**In Supabase:**
```json
{
  "amazon_order_id": "111-1234567-1234567",
  "customer_name": null,  // ← NULL (will be populated via CSV)
  "customer_email": null, // ← NULL (will be populated via CSV)
  "shipping_address": null, // ← NULL (will be populated via CSV)
  "character_specs": {
    "childName": "Alex",
    "age": 5,
    "hairColor": "brown",
    // ... other customization fields
  },
  "execution_status": "pending_w0",
  "created_at": "2024-12-06T10:30:00Z"
}
```

**The order will:**
- ✅ Be stored in Supabase
- ✅ Have customization data (character specs)
- ✅ Trigger W0 workflow
- ✅ Process through character generation
- ❌ NOT be able to go to print (w4) until CSV uploads shipping address

---

## Troubleshooting

### Order Not Showing Up?

1. **Check if cron has run:**
   - Look at Vercel logs
   - Manually trigger cron (see above)

2. **Check Amazon order status:**
   - Order must be "Unshipped" status
   - Order must be from last 24 hours (or adjust cron time window)

3. **Check Amazon API credentials:**
   - Verify `AMZ_APP_CLIENT_ID`, `AMZ_APP_CLIENT_SECRET`, `AMZ_REFRESH_TOKEN` are set
   - Verify credentials are valid

4. **Check for errors in logs:**
   - Look for "Failed to fetch orders" messages
   - Check for authentication errors
   - Check for rate limiting errors

5. **Amazon may take a few minutes:**
   - Orders don't appear instantly in SP-API
   - Wait 5-10 minutes after placing order
   - Then trigger cron manually

---

## Manual Trigger Script

Create a script to easily trigger the cron:

```bash
#!/bin/bash
# trigger-amazon-cron.sh

CRON_SECRET="YOUR_CRON_SECRET_HERE"
BASE_URL="https://admin.littleherolabs.com"

echo "Triggering Amazon orders cron..."
curl -X GET "${BASE_URL}/api/cron/amazon-orders" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  | jq '.'

echo ""
echo "Done. Check Supabase for new orders."
```

---

## Next Steps After Order Appears

1. **Verify order in Supabase** (should have NULL customer fields)
2. **Upload CSV** via `/admin/csv-upload` to populate customer data
3. **Order should then be ready for print** (w4)

