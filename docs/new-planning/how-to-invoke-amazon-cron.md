# How to Invoke Amazon Orders Cron (Manual Trigger)

## Why It's Not in Cron Jobs Tab

The Amazon orders cron is **not scheduled** (removed from `vercel.json` to stay within free tier limit of 2 crons). Therefore:
- ✅ It appears in the **Functions** list (as an API route)
- ❌ It does **NOT** appear in the **Cron Jobs** tab (only scheduled crons appear there)

This is correct behavior - the Cron Jobs tab only shows scheduled crons.

## How to Invoke It

### Method 1: Via Vercel Functions Page (Easiest)

1. Go to your Vercel project → **Deployments** → Latest deployment
2. Click on the deployment
3. Go to the **Functions** tab
4. Find `/api/cron/amazon-orders` in the list
5. Click on it to open the function details
6. Look for an **"Invoke"** or **"Test"** button
7. Add header: `Authorization: Bearer YOUR_CRON_SECRET`
8. Click "Invoke" or "Test"

**Note:** If you don't see an Invoke button, use Method 2 or 3 below.

### Method 2: Via cURL (Most Reliable)

```bash
curl -X GET "https://admin.littleherolabs.com/api/cron/amazon-orders" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" | jq '.'
```

Replace `YOUR_CRON_SECRET` with your actual CRON_SECRET from Vercel environment variables.

### Method 3: Via Test Script

```bash
cd docs/new-planning
./test-amazon-cron.sh YOUR_CRON_SECRET
```

### Method 4: Via Vercel CLI (If Installed)

```bash
vercel functions invoke api/cron/amazon-orders \
  --method GET \
  --header "Authorization: Bearer YOUR_CRON_SECRET"
```

## Finding Your CRON_SECRET

1. Go to Vercel → Your Project → **Settings** → **Environment Variables**
2. Find `CRON_SECRET` in the list
3. Copy the value (click the eye icon to reveal it)

## Expected Response

**Success (no orders):**
```json
{
  "skipped": true,
  "reason": "no_orders",
  "executionId": "amazon-...",
  "metrics": { ... },
  "timestamp": "2025-01-XX..."
}
```

**Success (orders found):**
```json
{
  "success": true,
  "message": "Amazon orders processed",
  "executionId": "amazon-...",
  "ordersFound": 1,
  "ordersProcessed": 1,
  "orderIds": ["ORDER-123"],
  "metrics": { ... }
}
```

**Error:**
```json
{
  "error": "Unauthorized",
  ...
}
```
(Check CRON_SECRET is correct)

## Troubleshooting

### "Can't find Invoke button"
- The Functions page UI varies by Vercel version
- Use Method 2 (cURL) instead - it always works

### "401 Unauthorized"
- Check CRON_SECRET is correct
- Make sure header format is: `Authorization: Bearer YOUR_CRON_SECRET`

### "500 Internal Server Error"
- Check Vercel function logs for details
- Verify all environment variables are set (Amazon credentials, etc.)

## Future: Adding to Cron Schedule

When you upgrade to a paid Vercel plan:
1. Add back to `vercel.json`:
   ```json
   {
     "path": "/api/cron/amazon-orders",
     "schedule": "0 0 * * *"
   }
   ```
2. It will then appear in the Cron Jobs tab
3. Will run automatically once per day

