# Manual Cron Job Testing Guide

This guide explains how to manually trigger cron jobs when Vercel deployment protection is enabled.

## Method 1: Using Vercel Bypass Token (Recommended)

Vercel deployment protection blocks external access to your deployment URLs. A bypass token allows you to access protected deployments.

### Step 1: Get Your Bypass Token

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: **little-hero-books**
3. Go to **Settings** → **Deployment Protection**
4. Find the **Bypass Token** section
5. Click **Generate** or **Copy** to get your bypass token
   - Format: Usually a long alphanumeric string like `bypass_xxxxxxxxxxxxxxxxxxxxx`

### Step 2: Use the Bypass Token in Requests

Add the bypass token as a query parameter or header:

**Option A: Query Parameter (Easiest)**
```bash
curl -X GET "https://your-deployment.vercel.app/api/cron/amazon-orders?x-vercel-protection-bypass=YOUR_BYPASS_TOKEN" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

**Option B: Header**
```bash
curl -X GET "https://your-deployment.vercel.app/api/cron/amazon-orders" \
  -H "x-vercel-protection-bypass: YOUR_BYPASS_TOKEN" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

### Step 3: Update Test Script

You can update `scripts/test-amazon-orders-cron.js` to include the bypass token:

```bash
node scripts/test-amazon-orders-cron.js \
  --secret=YOUR_CRON_SECRET \
  --bypass=YOUR_BYPASS_TOKEN
```

Or set it as an environment variable:
```bash
export VERCEL_BYPASS_TOKEN=your_bypass_token
export CRON_SECRET=your_cron_secret
node scripts/test-amazon-orders-cron.js
```

---

## Method 2: Temporarily Disable Deployment Protection

**⚠️ Warning:** This makes your deployment publicly accessible. Only do this temporarily for testing.

### Step 1: Disable Protection

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: **little-hero-books**
3. Go to **Settings** → **Deployment Protection**
4. Toggle **Deployment Protection** to **OFF**
5. Save changes

### Step 2: Test Your Cron Endpoint

Now you can test without a bypass token:

```bash
curl -X GET "https://your-deployment.vercel.app/api/cron/amazon-orders" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

### Step 3: Re-enable Protection

**IMPORTANT:** Re-enable deployment protection after testing:

1. Go back to **Settings** → **Deployment Protection**
2. Toggle **Deployment Protection** back to **ON**
3. Save changes

---

## Quick Reference: All Required Values

To test manually, you need:

1. **Deployment URL**: Your Vercel deployment URL
   - Find in: Vercel Dashboard → Your Project → Deployments → Click a deployment → Copy URL
   - Example: `little-hero-books-dvvaz6omr-jeffs-projects-5810cd55.vercel.app`

2. **CRON_SECRET**: The secret token for cron authentication
   - Find in: Vercel Dashboard → Your Project → Settings → Environment Variables → `CRON_SECRET` (Production)

3. **Bypass Token** (if using Method 1):
   - Find in: Vercel Dashboard → Your Project → Settings → Deployment Protection → Bypass Token

---

## Example: Complete Test Command

Using bypass token (Method 1):
```bash
curl -X GET "https://little-hero-books-dvvaz6omr-jeffs-projects-5810cd55.vercel.app/api/cron/amazon-orders?x-vercel-protection-bypass=bypass_xxxxxxxxxxxx" \
  -H "Authorization: Bearer your_cron_secret_here" \
  -H "Content-Type: application/json" \
  -s | jq .
```

Using test mode (adds `?test=true`):
```bash
curl -X GET "https://little-hero-books-dvvaz6omr-jeffs-projects-5810cd55.vercel.app/api/cron/amazon-orders?test=true&x-vercel-protection-bypass=bypass_xxxxxxxxxxxx" \
  -H "Authorization: Bearer your_cron_secret_here" \
  -H "Content-Type: application/json" \
  -s | jq .
```

---

## Testing Router Cron (Includes Amazon Orders)

The router cron now includes Amazon orders processing. To test it:

```bash
curl -X GET "https://your-deployment.vercel.app/api/cron/router?x-vercel-protection-bypass=YOUR_BYPASS_TOKEN" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -s | jq .
```

---

## Troubleshooting

### Error: 401 Unauthorized
- Check that `CRON_SECRET` is correct
- Verify the Bearer token format: `Bearer YOUR_SECRET` (with space)

### Error: 403 Forbidden / Authentication Required (HTML page)
- Deployment protection is blocking the request
- Use Method 1 (bypass token) or Method 2 (disable protection)

### Error: 404 Not Found
- Check the deployment URL is correct
- Verify the endpoint path: `/api/cron/amazon-orders` or `/api/cron/router`

### Error: 500 Internal Server Error
- Check Vercel logs for detailed error messages
- Verify all environment variables are set in Vercel (Production environment)

