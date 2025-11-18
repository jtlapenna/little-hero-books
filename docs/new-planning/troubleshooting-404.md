# Troubleshooting 404 for Amazon Orders Cron

## Issue: Getting 404 when calling `/api/cron/amazon-orders`

### Possible Causes:

1. **Wrong Deployment URL**
   - Make sure you're hitting the deployment from the `amazon-api-integration` branch
   - Branch deployments have different URLs than main
   - Check Vercel → Deployments → Find the `amazon-api-integration` deployment

2. **Deployment Not Complete**
   - Wait for the deployment to finish (check Vercel dashboard)
   - The route won't exist until the deployment completes

3. **Route Not Built**
   - Check Vercel build logs for errors
   - Verify the route file is in the correct location: `back-end/src/app/api/cron/amazon-orders/route.ts`

## How to Find the Correct URL

### Option 1: Use Branch Deployment URL
1. Go to Vercel → Your Project → Deployments
2. Find the deployment for `amazon-api-integration` branch
3. Click on it to see the deployment URL
4. Use that URL instead of `admin.littleherolabs.com`

### Option 2: Check Functions List
1. Go to Vercel → Your Project → Latest Deployment → Functions
2. Look for `/api/cron/amazon-orders` in the list
3. If it's there, the route exists
4. If it's not there, the deployment might not have included it

### Option 3: Test with Branch URL
If Vercel created a preview deployment for the branch, use that URL:
```bash
curl -X GET "https://YOUR-BRANCH-DEPLOYMENT.vercel.app/api/cron/amazon-orders" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" | jq '.'
```

## Quick Check

Run this to see what's actually deployed:
```bash
# Check if route exists (should return 401 Unauthorized, not 404)
curl -X GET "https://admin.littleherolabs.com/api/cron/amazon-orders" \
  -H "Authorization: Bearer wrong-secret" 2>&1 | head -5
```

- **401 Unauthorized** = Route exists, just wrong secret ✅
- **404 Not Found** = Route doesn't exist ❌

## Next Steps

If you get 404:
1. Check Vercel deployment logs for the `amazon-api-integration` branch
2. Verify the route file is in the commit
3. Try redeploying the branch
4. Check if you need to merge to main first (if main is what's deployed to `admin.littleherolabs.com`)

