# How to Find the Branch Deployment URL

## Steps:

1. **Go to Vercel Dashboard**
   - Navigate to your project

2. **Go to Deployments Tab**
   - Click on "Deployments" in the left sidebar

3. **Find the `amazon-api-integration` Branch Deployment**
   - Look for a deployment that shows:
     - Branch: `amazon-api-integration` (not `main`)
     - Status: "Ready" (green)
     - Recent timestamp (should be from when you pushed the branch)

4. **Click on that Deployment**
   - This will open the deployment details page

5. **Find the Deployment URL**
   - Look in the "Domains" section
   - You'll see URLs like:
     - `little-hero-books-git-amazon-api-integration-jeffs-projects-XXXXX.vercel.app`
     - Or a preview URL specific to that branch

6. **Use That URL for Testing**
   ```bash
   curl -X GET "https://YOUR-BRANCH-URL.vercel.app/api/cron/amazon-orders" \
     -H "Authorization: Bearer YOUR_CRON_SECRET" | jq '.'
   ```

## Alternative: Check Vercel CLI

If you have Vercel CLI installed:
```bash
vercel ls
```
This will show all deployments with their URLs.

## Note

The URL you showed (`little-hero-books-3ubn8fOu6-jeffs-projects-5810cd55.vercel.app`) appears to be from the `main` branch deployment, which is why the route doesn't exist there yet.

You need to find the deployment specifically for the `amazon-api-integration` branch.

